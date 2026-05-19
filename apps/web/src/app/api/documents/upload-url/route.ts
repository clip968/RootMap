import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import {
  extensionOf,
  normalizeOriginalFilename,
  validateDocumentUpload,
} from "@/lib/document/upload-validation";
import {
  createSignedDocumentUpload,
  makeDocumentStorageKey,
} from "@/lib/storage/supabase-document-storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface UploadUrlRequest {
  filename?: unknown;
  content_type?: unknown;
  size?: unknown;
}

export async function POST(req: Request) {
  let body: UploadUrlRequest;
  try {
    body = (await req.json()) as UploadUrlRequest;
  } catch {
    return jsonError("INVALID_REQUEST", "JSON 요청 본문이 필요합니다.", 400);
  }

  if (typeof body.filename !== "string" || typeof body.size !== "number") {
    return jsonError(
      "INVALID_REQUEST",
      "filename과 size 필드가 필요합니다.",
      400,
    );
  }

  const originalFilename = normalizeOriginalFilename(body.filename);
  const contentType =
    typeof body.content_type === "string" ? body.content_type : "";
  const validation = validateDocumentUpload({
    filename: originalFilename,
    contentType,
    size: body.size,
  });
  if (!validation.ok) {
    return jsonError(validation.code, validation.message, validation.status);
  }

  const ext = extensionOf(originalFilename);
  const { key, filename } = makeDocumentStorageKey(DEFAULT_USER_ID, ext);

  try {
    const signed = await createSignedDocumentUpload({
      key,
      contentType: contentType || "application/octet-stream",
    });

    return NextResponse.json({
      bucket: signed.bucket,
      key: signed.key,
      signed_url: signed.signedUrl,
      filename,
      original_filename: originalFilename,
      file_type: ext,
      file_size_bytes: body.size,
      content_type: contentType || "application/octet-stream",
    });
  } catch {
    return jsonError(
      "DOCUMENT_UPLOAD_FAILED",
      "문서 업로드 URL을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      500,
    );
  }
}
