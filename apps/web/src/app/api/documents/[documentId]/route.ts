import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import { getDocumentForUser } from "@/lib/repository/document-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { documentId } = await ctx.params;
  const document = await getDocumentForUser(documentId, DEFAULT_USER_ID);
  if (!document) {
    return jsonError("NOT_FOUND", "문서를 찾을 수 없습니다.", 404);
  }

  return NextResponse.json({
    document_id: document.id,
    title: document.title,
    original_filename: document.originalFilename,
    file_type: document.fileType,
    page_count: document.pageCount,
    processing_status: document.processingStatus,
    processing_error: document.processingError,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
    metadata: document.metadata,
  });
}
