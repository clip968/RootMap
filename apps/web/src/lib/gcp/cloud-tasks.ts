import { Buffer } from "node:buffer";
import crypto from "node:crypto";

export type DocumentProcessingWakeTaskResult =
  | {
      status: "created";
      taskName: string;
    }
  | {
      status: "disabled";
      reason: string;
    };

export interface DocumentProcessingWakeTaskInput {
  documentId: string;
  userId: string;
  jobId: string;
  messageId: string;
}

interface CloudTasksWakeConfig {
  projectId: string;
  location: string;
  queue: string;
  targetUrl: string;
  audience: string;
  invokerServiceAccount: string;
  credentials: {
    client_email: string;
    private_key: string;
  };
}

interface GoogleAccessTokenCache {
  accessToken: string;
  expiresAtMs: number;
}

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
let accessTokenCache: GoogleAccessTokenCache | null = null;

function readEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function parseCredentials(): CloudTasksWakeConfig["credentials"] | null {
  const encoded = readEnv("GOOGLE_CLOUD_TASKS_CREDENTIALS_B64");
  if (!encoded) return null;

  try {
    // Vercel 환경변수에는 JSON 키 파일을 그대로 넣기 어렵기 때문에 base64로 보관한다.
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string"
    ) {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch {
    return null;
  }
}

function defaultAudienceFor(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createServiceAccountJwt(
  credentials: CloudTasksWakeConfig["credentials"],
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claimSet = {
    iss: credentials.client_email,
    scope: GOOGLE_CLOUD_PLATFORM_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = [
    base64Url(JSON.stringify(header)),
    base64Url(JSON.stringify(claimSet)),
  ].join(".");
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(credentials.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

async function getGoogleAccessToken(
  credentials: CloudTasksWakeConfig["credentials"],
): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAtMs - Date.now() > 60_000) {
    return accessTokenCache.accessToken;
  }

  // Vercel serverless bundle에서 @google-cloud/tasks의 protos asset이 누락되어 REST API를 직접 호출한다.
  const assertion = createServiceAccountJwt(credentials);
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | {
        access_token?: unknown;
        expires_in?: unknown;
        error_description?: unknown;
        error?: unknown;
      }
    | null;

  if (!res.ok || typeof data?.access_token !== "string") {
    const detail =
      typeof data?.error_description === "string" ? data.error_description
      : typeof data?.error === "string" ? data.error
      : `Google OAuth token request failed: ${res.status}`;
    throw new Error(detail);
  }

  const expiresInSeconds =
    typeof data.expires_in === "number" ? data.expires_in : 3600;
  accessTokenCache = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
  };
  return data.access_token;
}

function getCloudTasksWakeConfig(): CloudTasksWakeConfig | null {
  const projectId = readEnv("GOOGLE_CLOUD_PROJECT_ID");
  const location = readEnv("GOOGLE_CLOUD_TASKS_LOCATION");
  const queue = readEnv("GOOGLE_CLOUD_TASKS_QUEUE");
  const targetUrl = readEnv("GOOGLE_CLOUD_TASKS_TARGET_URL");
  const invokerServiceAccount = readEnv(
    "GOOGLE_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT",
  );
  const credentials = parseCredentials();

  if (
    !projectId ||
    !location ||
    !queue ||
    !targetUrl ||
    !invokerServiceAccount ||
    !credentials
  ) {
    return null;
  }

  return {
    projectId,
    location,
    queue,
    targetUrl,
    audience:
      readEnv("GOOGLE_CLOUD_TASKS_AUDIENCE") ?? defaultAudienceFor(targetUrl),
    invokerServiceAccount,
    credentials,
  };
}

export function isDocumentProcessingWakeTaskConfigured(): boolean {
  return getCloudTasksWakeConfig() !== null;
}

export async function enqueueDocumentProcessingWakeTask(
  input: DocumentProcessingWakeTaskInput,
): Promise<DocumentProcessingWakeTaskResult> {
  const config = getCloudTasksWakeConfig();
  if (!config) {
    return {
      status: "disabled",
      reason: "cloud_tasks_env_missing",
    };
  }

  const parent = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
  const payload = {
    documentId: input.documentId,
    userId: input.userId,
    jobId: input.jobId,
    messageId: input.messageId,
    requestedAt: new Date().toISOString(),
  };
  // Cloud Run 서비스는 공개하지 않고, Cloud Tasks가 OIDC 토큰으로만 호출하도록 둔다.
  const accessToken = await getGoogleAccessToken(config.credentials);
  const res = await fetch(
    `https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: {
          httpRequest: {
            httpMethod: "POST",
            url: config.targetUrl,
            headers: {
              "Content-Type": "application/json",
            },
            body: Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
            oidcToken: {
              serviceAccountEmail: config.invokerServiceAccount,
              audience: config.audience,
            },
          },
        },
      }),
    },
  );
  const created = (await res.json().catch(() => null)) as
    | { name?: unknown; error?: { message?: unknown } }
    | null;

  if (!res.ok) {
    const detail =
      typeof created?.error?.message === "string" ?
        created.error.message
      : `Cloud Tasks createTask failed: ${res.status}`;
    throw new Error(detail);
  }

  return {
    status: "created",
    taskName: typeof created?.name === "string" ? created.name : "",
  };
}
