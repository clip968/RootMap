import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import { startDocumentProcessingJob } from "@/lib/document/processing-jobs";
import {
  getDocumentForUser,
  getDocumentLearningTreeForUser,
} from "@/lib/repository/document-repository";
import { after, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const document = getDocumentForUser(documentId, DEFAULT_USER_ID);
  if (!document) {
    return jsonError("NOT_FOUND", "문서를 찾을 수 없습니다.", 404);
  }

  if (document.processingStatus === "tree_generated") {
    const bundle = getDocumentLearningTreeForUser(documentId, DEFAULT_USER_ID);
    return NextResponse.json({
      document_id: documentId,
      processing_status: document.processingStatus,
      job_status: "already_processed",
      tree_id: bundle?.tree.id ?? null,
    });
  }

  const job = startDocumentProcessingJob({
    documentId,
    userId: DEFAULT_USER_ID,
    schedule: (task) => {
      after(() => task());
    },
  });

  return NextResponse.json(
    {
      document_id: documentId,
      processing_status: document.processingStatus,
      job_status: job.status,
      job_id: job.jobId,
    },
    { status: 202 },
  );
}
