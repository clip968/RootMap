import { Buffer } from "node:buffer";
import { CloudTasksClient, protos } from "@google-cloud/tasks";

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

  const client = new CloudTasksClient({
    projectId: config.projectId,
    credentials: config.credentials,
  });

  const parent = client.queuePath(
    config.projectId,
    config.location,
    config.queue,
  );
  const payload = {
    documentId: input.documentId,
    userId: input.userId,
    jobId: input.jobId,
    messageId: input.messageId,
    requestedAt: new Date().toISOString(),
  };
  // Cloud Run 서비스는 공개하지 않고, Cloud Tasks가 OIDC 토큰으로만 호출하도록 둔다.
  const task: protos.google.cloud.tasks.v2.ITask = {
    httpRequest: {
      httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
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
  };

  const [created] = await client.createTask({ parent, task });
  return {
    status: "created",
    taskName: created.name ?? "",
  };
}
