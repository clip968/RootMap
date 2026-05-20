import {
  processDocument,
  type ProcessDocumentOptions,
  type ProcessDocumentResult,
} from "@/lib/document/processor";
import {
  createDocumentProcessingJobId,
  deleteDocumentProcessingMessage,
  enqueueDocumentProcessingMessage,
  readDocumentProcessingMessages,
  type DocumentProcessingQueueMessage,
  type DocumentProcessingQueuePayload,
} from "@/lib/document/processing-queue";
import { getDocumentForUser } from "@/lib/repository/document-repository";

export const DOCUMENT_PROCESSING_WORKER_CHUNK_BATCH_SIZE = 3;

export type DocumentProcessingJobStatus = "queued";

export interface DocumentProcessingJob {
  jobId: string;
  documentId: string;
  userId: string;
  startedAt: string;
  messageId: string;
}

export interface StartDocumentProcessingJobResult {
  status: DocumentProcessingJobStatus;
  jobId: string;
  messageId: string;
}

export type DocumentProcessingWorkerStatus =
  | "idle"
  | "invalid_message"
  | "missing_document"
  | "already_processed"
  | "processed"
  | "requeued"
  | "failed";

export interface DocumentProcessingWorkerResult {
  status: DocumentProcessingWorkerStatus;
  messageId?: string;
  jobId?: string;
  documentId?: string;
  requeuedMessageId?: string;
  deleted?: boolean;
  reason?: string;
  error?: string;
}

type DocumentProcessor = (
  documentId: string,
  userId: string,
  options?: ProcessDocumentOptions,
) => Promise<ProcessDocumentResult>;

type QueueEnqueuer = (
  payload: DocumentProcessingQueuePayload,
) => Promise<{ jobId: string; messageId: string }>;

type QueueReader = () => Promise<DocumentProcessingQueueMessage[]>;
type QueueDeleter = (messageId: string) => Promise<boolean>;
type DocumentLookup = (
  documentId: string,
  userId: string,
) => Promise<{ processingStatus: string } | null>;

function createQueuePayload(options: {
  documentId: string;
  userId: string;
  now?: () => Date;
}): DocumentProcessingQueuePayload {
  const now = options.now ?? (() => new Date());
  return {
    jobId: createDocumentProcessingJobId(options.documentId),
    documentId: options.documentId,
    userId: options.userId,
    requestedAt: now().toISOString(),
  };
}

export function getDocumentProcessingJob(
  _documentId: string,
): DocumentProcessingJob | null {
  // Supabase Queue가 실행 상태의 source of truth이므로 프로세스 메모리에서 job을 추적하지 않는다.
  void _documentId;
  return null;
}

export async function startDocumentProcessingJob(options: {
  documentId: string;
  userId: string;
  enqueue?: QueueEnqueuer;
  now?: () => Date;
}): Promise<StartDocumentProcessingJobResult> {
  const enqueue = options.enqueue ?? enqueueDocumentProcessingMessage;
  const queued = await enqueue(createQueuePayload(options));
  return {
    status: "queued",
    jobId: queued.jobId,
    messageId: queued.messageId,
  };
}

export async function processNextDocumentProcessingMessage(options: {
  readMessages?: QueueReader;
  deleteMessage?: QueueDeleter;
  enqueue?: QueueEnqueuer;
  run?: DocumentProcessor;
  getDocument?: DocumentLookup;
} = {}): Promise<DocumentProcessingWorkerResult> {
  const readMessages =
    options.readMessages ??
    (() => readDocumentProcessingMessages({ limit: 1 }));
  const deleteMessage = options.deleteMessage ?? deleteDocumentProcessingMessage;
  const enqueue = options.enqueue ?? enqueueDocumentProcessingMessage;
  const run = options.run ?? processDocument;
  const getDocument = options.getDocument ?? getDocumentForUser;

  const messages = await readMessages();
  const message = messages[0];
  if (!message) return { status: "idle" };

  if (!message.payload) {
    const deleted = await deleteMessage(message.msgId);
    return {
      status: "invalid_message",
      messageId: message.msgId,
      deleted,
      reason: "queue payload shape is invalid",
    };
  }

  const payload = message.payload;
  const document = await getDocument(payload.documentId, payload.userId);
  if (!document) {
    const deleted = await deleteMessage(message.msgId);
    return {
      status: "missing_document",
      messageId: message.msgId,
      jobId: payload.jobId,
      documentId: payload.documentId,
      deleted,
    };
  }

  if (document.processingStatus === "tree_generated") {
    const deleted = await deleteMessage(message.msgId);
    return {
      status: "already_processed",
      messageId: message.msgId,
      jobId: payload.jobId,
      documentId: payload.documentId,
      deleted,
    };
  }

  try {
    const result = await run(payload.documentId, payload.userId, {
      chunkBatchSize: DOCUMENT_PROCESSING_WORKER_CHUNK_BATCH_SIZE,
      stopAfterConcepts: true,
    });

    if (result.shouldRequeue) {
      const requeued = await enqueue(createQueuePayload({
        documentId: payload.documentId,
        userId: payload.userId,
      }));
      const deleted = await deleteMessage(message.msgId);
      return {
        status: "requeued",
        messageId: message.msgId,
        jobId: payload.jobId,
        documentId: payload.documentId,
        requeuedMessageId: requeued.messageId,
        deleted,
        reason: result.reason,
      };
    }

    const deleted = await deleteMessage(message.msgId);
    return {
      status: "processed",
      messageId: message.msgId,
      jobId: payload.jobId,
      documentId: payload.documentId,
      deleted,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[document-processing-worker]", {
      event: "failed",
      messageId: message.msgId,
      jobId: payload.jobId,
      documentId: payload.documentId,
      readCount: message.readCount,
      error,
    });
    // 실패한 메시지는 삭제하지 않는다. visibility timeout 이후 Supabase Queue가 다시 전달한다.
    return {
      status: "failed",
      messageId: message.msgId,
      jobId: payload.jobId,
      documentId: payload.documentId,
      error,
    };
  }
}

export function clearDocumentProcessingJobsForTests(): void {
  // 이전 in-memory 구현과 호환하기 위한 테스트 helper다. Queue 기반 구현에서는 지울 메모리 상태가 없다.
}
