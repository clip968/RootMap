import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import { createDocument } from "@/lib/repository/document-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES: Record<string, Set<string>> = {
  pdf: new Set(["application/pdf", "application/octet-stream", ""]),
  txt: new Set(["text/plain", "application/octet-stream", ""]),
  md: new Set([
    "text/markdown",
    "text/x-markdown",
    "text/plain",
    "application/octet-stream",
    "",
  ]),
};
const EXECUTABLE_EXTENSIONS = new Set([
  "bat",
  "bin",
  "cmd",
  "com",
  "dll",
  "exe",
  "js",
  "msi",
  "ps1",
  "sh",
]);
const EXECUTABLE_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
];

function normalizeOriginalFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop()?.trim() ?? "";
  return base || "document";
}

function extensionOf(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext;
}

function isExecutableMime(type: string): boolean {
  const normalized = type.toLowerCase();
  return EXECUTABLE_MIME_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function isAllowedMime(ext: string, type: string): boolean {
  const allowed = ALLOWED_MIME_TYPES[ext];
  if (!allowed) return false;
  return allowed.has(type.toLowerCase());
}

interface StoredUpload {
  key: string;
  filename: string;
  contentType: string;
}

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

async function saveUploadedFile(
  userId: string,
  ext: string,
  file: File,
): Promise<StoredUpload> {
  const filename = `${crypto.randomUUID()}.${ext}`;
  const key = path.join("uploads", "documents", userId, filename);
  const absPath = storageAbsPath(key);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const data = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, data, { flag: "wx" });
  return { key, filename, contentType: file.type };
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(
      "INVALID_REQUEST",
      "multipart/form-data 형식의 요청 본문이 필요합니다.",
      400,
    );
  }

  const fileValue = form.get("file");
  if (!(fileValue instanceof File)) {
    return jsonError("INVALID_REQUEST", "file 필드가 필요합니다.", 400);
  }

  const originalFilename = normalizeOriginalFilename(fileValue.name);
  const ext = extensionOf(originalFilename);
  const mimeType = fileValue.type.toLowerCase();

  if (
    EXECUTABLE_EXTENSIONS.has(ext) ||
    isExecutableMime(mimeType) ||
    !ALLOWED_MIME_TYPES[ext] ||
    !isAllowedMime(ext, mimeType)
  ) {
    return jsonError(
      "UNSUPPORTED_FILE_TYPE",
      "PDF, TXT, MD 문서만 업로드할 수 있습니다.",
      400,
    );
  }

  if (fileValue.size === 0) {
    return jsonError("EMPTY_FILE", "빈 파일은 업로드할 수 없습니다.", 400);
  }

  if (fileValue.size > MAX_FILE_SIZE_BYTES) {
    return jsonError(
      "FILE_TOO_LARGE",
      "문서 파일은 최대 20MB까지 업로드할 수 있습니다.",
      413,
    );
  }

  let storage: StoredUpload;
  try {
    storage = await saveUploadedFile(DEFAULT_USER_ID, ext, fileValue);
  } catch {
    return jsonError(
      "DOCUMENT_UPLOAD_FAILED",
      "문서 파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      500,
    );
  }

  let documentId: string;
  try {
    documentId = await createDocument({
      userId: DEFAULT_USER_ID,
      title: path.basename(originalFilename, path.extname(originalFilename)),
      originalFilename,
      fileType: ext,
      fileSizeBytes: fileValue.size,
      metadata: { storage },
    });
  } catch {
    await fs.rm(storageAbsPath(storage.key), { force: true });
    return jsonError(
      "DOCUMENT_UPLOAD_FAILED",
      "문서 업로드 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      500,
    );
  }

  return NextResponse.json({
    document_id: documentId,
    filename: originalFilename,
    processing_status: "uploaded",
  });
}
