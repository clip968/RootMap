import path from "node:path";
import type { ApiErrorCode } from "@/lib/api-errors";

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES: Record<string, Set<string>> = {
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

export function normalizeOriginalFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop()?.trim() ?? "";
  return base || "document";
}

export function extensionOf(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

export function documentTitleFromFilename(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

function isExecutableMime(type: string): boolean {
  const normalized = type.toLowerCase();
  return EXECUTABLE_MIME_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function isAllowedMime(ext: string, type: string): boolean {
  const allowed = ALLOWED_DOCUMENT_MIME_TYPES[ext];
  if (!allowed) return false;
  return allowed.has(type.toLowerCase());
}

export function validateDocumentUpload(input: {
  filename: string;
  contentType: string;
  size: number;
}):
  | { ok: true; ext: string }
  | { ok: false; code: ApiErrorCode; message: string; status: number } {
  const originalFilename = normalizeOriginalFilename(input.filename);
  const ext = extensionOf(originalFilename);
  const mimeType = input.contentType.toLowerCase();

  if (
    EXECUTABLE_EXTENSIONS.has(ext) ||
    isExecutableMime(mimeType) ||
    !ALLOWED_DOCUMENT_MIME_TYPES[ext] ||
    !isAllowedMime(ext, mimeType)
  ) {
    return {
      ok: false,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "PDF, TXT, MD 문서만 업로드할 수 있습니다.",
      status: 400,
    };
  }

  if (input.size === 0) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: "빈 파일은 업로드할 수 없습니다.",
      status: 400,
    };
  }

  if (input.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "문서 파일은 최대 20MB까지 업로드할 수 있습니다.",
      status: 413,
    };
  }

  return { ok: true, ext };
}
