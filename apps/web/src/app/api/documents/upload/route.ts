import { Buffer } from "node:buffer";
import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import {
  documentTitleFromFilename,
  extensionOf,
  normalizeOriginalFilename,
  validateDocumentUpload,
} from "@/lib/document/upload-validation";
import { createDocument } from "@/lib/repository/document-repository";
import {
  makeDocumentStorageKey,
  removeDocumentObject,
  type SupabaseDocumentStorageRef,
  uploadDocumentObject,
} from "@/lib/storage/supabase-document-storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function saveUploadedFile(
  userId: string,
  ext: string,
  file: File,
): Promise<SupabaseDocumentStorageRef> {
  const { key } = makeDocumentStorageKey(userId, ext);
  const data = Buffer.from(await file.arrayBuffer());
  return uploadDocumentObject({
    key,
    body: data,
    contentType: file.type || "application/octet-stream",
  });
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
  const validation = validateDocumentUpload({
    filename: originalFilename,
    contentType: mimeType,
    size: fileValue.size,
  });
  if (!validation.ok) {
    return jsonError(validation.code, validation.message, validation.status);
  }

  let storage: SupabaseDocumentStorageRef;
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
      title: documentTitleFromFilename(originalFilename),
      originalFilename,
      fileType: ext,
      fileSizeBytes: fileValue.size,
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
    filename: originalFilename,
    processing_status: "uploaded",
  });
}
