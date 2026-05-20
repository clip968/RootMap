/**
 * 문서 처리 queue/worker 계약 스모크.
 *
 * 실행: tsx scripts/smoke-document-processing-jobs.ts
 * 실제 Supabase Queue/DB/LLM 대신 reader, enqueuer, deleter, processor를 주입해
 * Vercel route가 "접수만 하고 worker가 이어서 처리"하는 핵심 계약을 검증한다.
 */
import {
  DOCUMENT_PROCESSING_WORKER_CHUNK_BATCH_SIZE,
  processNextDocumentProcessingMessage,
  startDocumentProcessingJob,
} from "../src/lib/document/processing-jobs";
import type {
  DocumentProcessingQueueMessage,
  DocumentProcessingQueuePayload,
} from "../src/lib/document/processing-queue";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function queueMessage(
  msgId: string,
  payload: DocumentProcessingQueuePayload | null,
): DocumentProcessingQueueMessage {
  return {
    msgId,
    readCount: 1,
    enqueuedAt: "2026-05-20T00:00:00.000Z",
    visibleAt: "2026-05-20T00:06:00.000Z",
    payload,
  };
}

async function main(): Promise<void> {
  const enqueued: DocumentProcessingQueuePayload[] = [];
  const deleted: string[] = [];

  const first = await startDocumentProcessingJob({
    documentId: "doc-1",
    userId: "user-1",
    now: () => new Date("2026-05-20T00:00:00.000Z"),
    enqueue: async (payload) => {
      enqueued.push(payload);
      return { jobId: payload.jobId, messageId: "101" };
    },
  });

  assert(first.status === "queued", "start should enqueue a queue message");
  assert(first.messageId === "101", "start should return queue message id");
  assert(enqueued[0]?.documentId === "doc-1", "payload should include document id");
  assert(enqueued[0]?.userId === "user-1", "payload should include user id");

  const idle = await processNextDocumentProcessingMessage({
    readMessages: async () => [],
  });
  assert(idle.status === "idle", "worker should be idle when queue is empty");

  const invalid = await processNextDocumentProcessingMessage({
    readMessages: async () => [queueMessage("bad-1", null)],
    deleteMessage: async (messageId) => {
      deleted.push(messageId);
      return true;
    },
  });
  assert(invalid.status === "invalid_message", "invalid payload should be discarded");
  assert(deleted.includes("bad-1"), "invalid payload should be deleted");

  let processorCalls = 0;
  const requeued = await processNextDocumentProcessingMessage({
    readMessages: async () => [queueMessage("201", enqueued[0]!)],
    deleteMessage: async (messageId) => {
      deleted.push(messageId);
      return true;
    },
    enqueue: async (payload) => {
      enqueued.push(payload);
      return { jobId: payload.jobId, messageId: "202" };
    },
    getDocument: async () => ({ processingStatus: "chunked" }),
    run: async (_documentId, _userId, options) => {
      processorCalls += 1;
      assert(
        options?.chunkBatchSize === DOCUMENT_PROCESSING_WORKER_CHUNK_BATCH_SIZE,
        "worker should cap chunk batch size",
      );
      assert(options?.stopAfterConcepts === true, "worker should split tree generation");
      return {
        treeId: null,
        shouldRequeue: true,
        reason: "chunk_concepts_pending",
      };
    },
  });

  assert(requeued.status === "requeued", "partial processor result should requeue");
  assert(requeued.requeuedMessageId === "202", "requeue should return new message id");
  assert(deleted.includes("201"), "old message should be deleted after requeue");

  const processed = await processNextDocumentProcessingMessage({
    readMessages: async () => [queueMessage("301", enqueued[0]!)],
    deleteMessage: async (messageId) => {
      deleted.push(messageId);
      return true;
    },
    getDocument: async () => ({ processingStatus: "concepts_extracted" }),
    run: async () => {
      processorCalls += 1;
      return { treeId: "tree-1" };
    },
  });

  assert(processed.status === "processed", "complete processor result should delete message");
  assert(deleted.includes("301"), "processed message should be deleted");

  const failed = await processNextDocumentProcessingMessage({
    readMessages: async () => [queueMessage("401", enqueued[0]!)],
    deleteMessage: async (messageId) => {
      deleted.push(messageId);
      return true;
    },
    getDocument: async () => ({ processingStatus: "chunked" }),
    run: async () => {
      throw new Error("expected failure");
    },
  });

  assert(failed.status === "failed", "processor failure should be reported");
  assert(!deleted.includes("401"), "failed message should remain for queue retry");
  assert(processorCalls === 2, "processor should run for requeue and success cases");

  console.info("[document-processing-jobs-smoke] ok");
}

main().catch((err) => {
  console.error("[document-processing-jobs-smoke] failed", err);
  process.exitCode = 1;
});
