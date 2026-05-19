import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import {
  documentTitleFromFilename,
  validateDocumentUpload,
} from "@/lib/document/upload-validation";
import { createDocument } from "@/lib/repository/document-repository";
import {
  removeDocumentObject,
  SUPABASE_DOCUMENT_STORAGE_PROVIDER,
  type SupabaseDocumentStorageRef,
  verifyDocumentObjectExists,
} from "@/lib/storage/supabase-document-storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface CompleteUploadRequest {
  bucket?: unknown;
  key?: unknown;
  filename?: unknown;
  original_filename?: unknown;
  file_type?: unknown;
  file_size_bytes?: unknown;
  content_type?: unknown;
}

export async function POST(req: Request) {
  let body: CompleteUploadRequest;
  try {
    body = (await req.json()) as CompleteUploadRequest;
  } catch {
    return jsonError("INVALID_REQUEST", "JSON 요청 본문이 필요합니다.", 400);
  }

  if (
    typeof body.bucket !== "string" ||
    typeof body.key !== "string" ||
    typeof body.filename !== "string" ||
    typeof body.original_filename !== "string" ||
    typeof body.file_type !== "string" ||
    typeof body.file_size_bytes !== "number"
  ) {
    return jsonError("INVALID_REQUEST", "업로드 완료 정보가 올바르지 않습니다.", 400);
  }

  const contentType =
    typeof body.content_type === "string" ? body.content_type : "";
  const validation = validateDocumentUpload({
    filename: body.original_filename,
    contentType,
    size: body.file_size_bytes,
  });
  if (!validation.ok) {
    return jsonError(validation.code, validation.message, validation.status);
  }

  const storage: SupabaseDocumentStorageRef = {
    provider: SUPABASE_DOCUMENT_STORAGE_PROVIDER,
    bucket: body.bucket,
    key: body.key,
    filename: body.filename,
    contentType: contentType || "application/octet-stream",
  };

  try {
    const exists = await verifyDocumentObjectExists(storage);
    if (!exists) {
      return jsonError(
        "DOCUMENT_UPLOAD_FAILED",
        "업로드된 문서 파일을 확인하지 못했습니다. 다시 시도해 주세요.",
        400,
      );
    }
  } catch {
    return jsonError(
      "DOCUMENT_UPLOAD_FAILED",
      "업로드된 문서 파일을 확인하지 못했습니다. 다시 시도해 주세요.",
      500,
    );
  }

  let documentId: string;
  try {
    documentId = await createDocument({
      userId: DEFAULT_USER_ID,
      title: documentTitleFromFilename(body.original_filename),
      originalFilename: body.original_filename,
      fileType: body.file_type,
      fileSizeBytes: body.file_size_bytes,
      metadata: { storage },
    });
  } catch {
    await removeDocumentObject(storage);
    return jsonError(
      "DOCUMENT_UPLOAD_FAILED",
      "문서 업로드 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      500,
    );
  }

  return NextResponse.json({
    document_id: documentId,
    filename: body.original_filename,
    processing_status: "uploaded",
  });
}
