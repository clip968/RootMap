import { Buffer } from "node:buffer";
import path from "node:path";

export const SUPABASE_DOCUMENT_STORAGE_PROVIDER = "supabase_storage";
export const DEFAULT_DOCUMENT_BUCKET = "rootmap-documents";

export interface SupabaseDocumentStorageRef {
  provider: typeof SUPABASE_DOCUMENT_STORAGE_PROVIDER;
  bucket: string;
  key: string;
  filename: string;
  contentType: string;
}

export interface LegacyLocalStorageRef {
  provider?: "local";
  key: string;
  filename?: string;
  contentType?: string;
}

export type DocumentStorageRef =
  | SupabaseDocumentStorageRef
  | LegacyLocalStorageRef;

function getSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    inferSupabaseUrlFromDatabaseUrl();
  if (!url) {
    throw new Error("SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, 또는 Supabase DATABASE_URL이 필요합니다.");
  }
  return url.replace(/\/+$/, "");
}

function inferSupabaseUrlFromDatabaseUrl(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  try {
    const parsed = new URL(databaseUrl);
    const dbHostMatch = parsed.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    if (dbHostMatch?.[1]) return `https://${dbHostMatch[1]}.supabase.co`;

    const poolerUserMatch = parsed.username.match(/^postgres\.([a-z0-9-]+)$/i);
    if (poolerUserMatch?.[1]) return `https://${poolerUserMatch[1]}.supabase.co`;
  } catch {
    return null;
  }
  return null;
}

function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }
  return key;
}

export function getDocumentStorageBucket(): string {
  return (
    process.env.SUPABASE_DOCUMENT_BUCKET?.trim() || DEFAULT_DOCUMENT_BUCKET
  );
}

export function makeDocumentStorageKey(userId: string, ext: string): {
  key: string;
  filename: string;
} {
  const filename = `${crypto.randomUUID()}.${ext}`;
  return {
    filename,
    key: path.posix.join("documents", userId, filename),
  };
}

function storageApiBaseUrl(): string {
  return `${getSupabaseUrl()}/storage/v1`;
}

function encodeObjectPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function authHeaders(extra?: HeadersInit): Headers {
  const key = getSupabaseServiceRoleKey();
  const headers = new Headers(extra);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

function objectUrl(bucket: string, key: string): string {
  return `${storageApiBaseUrl()}/object/authenticated/${encodeURIComponent(bucket)}/${encodeObjectPath(key)}`;
}

function uploadSignUrl(bucket: string, key: string): string {
  return `${storageApiBaseUrl()}/object/upload/sign/${encodeURIComponent(bucket)}/${encodeObjectPath(key)}`;
}

function removeUrl(bucket: string): string {
  return `${storageApiBaseUrl()}/object/${encodeURIComponent(bucket)}`;
}

function resolveSignedUrl(rawUrl: string): string {
  const supabaseUrl = getSupabaseUrl();
  const storageBase = storageApiBaseUrl();
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("/storage/v1/")) return `${supabaseUrl}${rawUrl}`;
  if (rawUrl.startsWith("/object/")) return `${storageBase}${rawUrl}`;
  return `${storageBase}/${rawUrl.replace(/^\/+/, "")}`;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => null);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export async function createSignedDocumentUpload(input: {
  key: string;
  contentType: string;
}): Promise<{
  bucket: string;
  key: string;
  signedUrl: string;
}> {
  const bucket = getDocumentStorageBucket();
  const res = await fetch(uploadSignUrl(bucket, input.key), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Supabase signed upload URL 생성 실패: ${res.status}`);
  }

  const data = await parseJson(res);
  const rawUrl =
    typeof data.signedUrl === "string" ? data.signedUrl
    : typeof data.signedURL === "string" ? data.signedURL
    : typeof data.url === "string" ? data.url
    : null;

  if (!rawUrl) {
    throw new Error("Supabase signed upload URL 응답이 비어 있습니다.");
  }

  return {
    bucket,
    key: input.key,
    signedUrl: resolveSignedUrl(rawUrl),
  };
}

export async function uploadDocumentObject(input: {
  key: string;
  body: BodyInit;
  contentType: string;
}): Promise<SupabaseDocumentStorageRef> {
  const signed = await createSignedDocumentUpload({
    key: input.key,
    contentType: input.contentType,
  });
  const res = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": input.contentType || "application/octet-stream",
    },
    body: input.body,
  });

  if (!res.ok) {
    throw new Error(`Supabase 문서 업로드 실패: ${res.status}`);
  }

  return {
    provider: SUPABASE_DOCUMENT_STORAGE_PROVIDER,
    bucket: signed.bucket,
    key: signed.key,
    filename: path.posix.basename(input.key),
    contentType: input.contentType,
  };
}

export async function downloadDocumentObject(
  storage: SupabaseDocumentStorageRef,
): Promise<Buffer> {
  const res = await fetch(objectUrl(storage.bucket, storage.key), {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Supabase 문서 다운로드 실패: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function verifyDocumentObjectExists(
  storage: SupabaseDocumentStorageRef,
): Promise<boolean> {
  const headRes = await fetch(objectUrl(storage.bucket, storage.key), {
    method: "HEAD",
    headers: authHeaders(),
  });
  if (headRes.ok) return true;
  if (headRes.status !== 405) return false;

  const rangeRes = await fetch(objectUrl(storage.bucket, storage.key), {
    method: "GET",
    headers: authHeaders({ Range: "bytes=0-0" }),
  });
  return rangeRes.ok || rangeRes.status === 206;
}

export async function removeDocumentObject(
  storage: SupabaseDocumentStorageRef,
): Promise<void> {
  await fetch(removeUrl(storage.bucket), {
    method: "DELETE",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [storage.key] }),
  }).catch(() => undefined);
}
