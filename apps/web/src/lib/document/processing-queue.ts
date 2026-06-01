import { getSqlClient } from "@/db";

export const DOCUMENT_PROCESSING_QUEUE_NAME = "document_processing";
export const DOCUMENT_PROCESSING_VISIBILITY_TIMEOUT_SECONDS = 360;

export interface DocumentProcessingQueuePayload {
  jobId: string;
  documentId: string;
  userId: string;
  requestedAt: string;
}

export interface DocumentProcessingQueueMessage {
  msgId: string;
  readCount: number;
  enqueuedAt: string;
  visibleAt: string;
  payload: DocumentProcessingQueuePayload | null;
}

type RawQueueMessageRow = {
  msg_id: bigint | number | string;
  read_ct: number;
  enqueued_at: Date | string;
  vt: Date | string;
  message: unknown;
};

type SendRow = {
  msg_id: bigint | number | string;
};

type DeleteRow = {
  deleted: boolean;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueuePayload(value: unknown): value is DocumentProcessingQueuePayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.jobId === "string" &&
    typeof value.documentId === "string" &&
    typeof value.userId === "string" &&
    typeof value.requestedAt === "string"
  );
}

function toMessageId(value: bigint | number | string): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

export function createDocumentProcessingJobId(documentId: string): string {
  // queue 메시지 id와 별도로 로그/응답에서 추적하기 쉬운 application-level job id를 둔다.
  return `doc-process-${documentId}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function enqueueDocumentProcessingMessage(
  payload: DocumentProcessingQueuePayload,
): Promise<{ jobId: string; messageId: string }> {
  const sql = getSqlClient();
  const queuePayload: Record<string, string> = {
    jobId: payload.jobId,
    documentId: payload.documentId,
    userId: payload.userId,
    requestedAt: payload.requestedAt,
  };
  const queuePayloadJson = JSON.stringify(queuePayload);
  const rows = await sql<SendRow[]>`
    select pgmq.send(
      ${DOCUMENT_PROCESSING_QUEUE_NAME},
      ${queuePayloadJson}::jsonb
    ) as msg_id
  `;
  const msgId = rows[0]?.msg_id;
  if (msgId === undefined) {
    throw new Error("document processing queue enqueue failed");
  }
  return { jobId: payload.jobId, messageId: toMessageId(msgId) };
}

export async function readDocumentProcessingMessages(options: {
  limit?: number;
  visibilityTimeoutSeconds?: number;
} = {}): Promise<DocumentProcessingQueueMessage[]> {
  const sql = getSqlClient();
  const limit = Math.max(1, Math.floor(options.limit ?? 1));
  const visibilityTimeoutSeconds = Math.max(
    1,
    Math.floor(
      options.visibilityTimeoutSeconds ??
        DOCUMENT_PROCESSING_VISIBILITY_TIMEOUT_SECONDS,
    ),
  );

  const rows = await sql<RawQueueMessageRow[]>`
    select msg_id, read_ct, enqueued_at, vt, message
    from pgmq.read(
      ${DOCUMENT_PROCESSING_QUEUE_NAME},
      ${visibilityTimeoutSeconds},
      ${limit}
    )
  `;

  return rows.map((row) => ({
    msgId: toMessageId(row.msg_id),
    readCount: row.read_ct,
    enqueuedAt: toIso(row.enqueued_at),
    visibleAt: toIso(row.vt),
    payload: isQueuePayload(row.message) ? row.message : null,
  }));
}

export async function deleteDocumentProcessingMessage(
  messageId: string,
): Promise<boolean> {
  const sql = getSqlClient();
  // postgres-js template parameter는 bigint를 직접 받지 않으므로 문자열로 바인딩하고 SQL에서 bigint로 변환한다.
  const rows = await sql<DeleteRow[]>`
    select pgmq.delete(
      ${DOCUMENT_PROCESSING_QUEUE_NAME},
      ${messageId}::bigint
    ) as deleted
  `;
  return rows[0]?.deleted ?? false;
}
