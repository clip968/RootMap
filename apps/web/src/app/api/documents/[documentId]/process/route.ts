import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import { startDocumentProcessingJob } from "@/lib/document/processing-jobs";
import { enqueueDocumentProcessingWakeTask } from "@/lib/gcp/cloud-tasks";
import {
  getDocumentForUser,
  getDocumentLearningTreeForUser,
} from "@/lib/repository/document-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const document = await getDocumentForUser(documentId, DEFAULT_USER_ID);
  if (!document) {
    return jsonError("NOT_FOUND", "문서를 찾을 수 없습니다.", 404);
  }

  if (document.processingStatus === "tree_generated") {
    const bundle = await getDocumentLearningTreeForUser(documentId, DEFAULT_USER_ID);
    return NextResponse.json({
      document_id: documentId,
      processing_status: document.processingStatus,
      job_status: "already_processed",
      tree_id: bundle?.tree.id ?? null,
    });
  }

  const job = await startDocumentProcessingJob({
    documentId,
    userId: DEFAULT_USER_ID,
  });
  let wakeTask:
    | Awaited<ReturnType<typeof enqueueDocumentProcessingWakeTask>>
    | { status: "failed"; error: string };
  try {
    // Supabase Queue가 실제 작업 source of truth이고, Cloud Tasks는 Cloud Run worker를 즉시 깨우는 신호다.
    wakeTask = await enqueueDocumentProcessingWakeTask({
      documentId,
      userId: DEFAULT_USER_ID,
      jobId: job.jobId,
      messageId: job.messageId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[document-processing-wake-task]", {
      event: "failed",
      documentId,
      jobId: job.jobId,
      messageId: job.messageId,
      error,
    });
    wakeTask = { status: "failed", error };
  }

  return NextResponse.json(
    {
      document_id: documentId,
      processing_status: document.processingStatus,
      job_status: job.status,
      job_id: job.jobId,
      message_id: job.messageId,
      wake_task: wakeTask,
    },
    { status: 202 },
  );
}
