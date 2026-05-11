import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import { DocumentProcessorError, processDocument } from "@/lib/document/processor";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  try {
    await processDocument(documentId, DEFAULT_USER_ID);
  } catch (err) {
    if (err instanceof DocumentProcessorError) {
      if (err.code === "NOT_FOUND") {
        return jsonError("NOT_FOUND", err.message, 404);
      }
      if (err.code === "INVALID_STATUS") {
        return jsonError("INVALID_STATUS", err.message, 409);
      }
      if (err.code === "TEXT_EXTRACTION_FAILED") {
        return jsonError("DOCUMENT_UPLOAD_FAILED", err.message, 422);
      }
      if (err.code === "DOCUMENT_TOO_LONG") {
        return jsonError("INVALID_REQUEST", err.message, 413);
      }
      return jsonError("DOCUMENT_UPLOAD_FAILED", err.message, 500);
    }
    return jsonError(
      "DOCUMENT_UPLOAD_FAILED",
      "문서 처리 중 오류가 발생했습니다.",
      500,
    );
  }

  return NextResponse.json({
    document_id: documentId,
    processing_status: "chunked",
  });
}
