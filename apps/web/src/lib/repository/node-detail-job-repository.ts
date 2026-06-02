import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb, getSqlClient } from "@/db/client";
import { concepts, learningNodes, nodeDetailJobs } from "@/db/schema";
import type { NodeDetailResponse } from "@/types/learning";

export const CURRENT_NODE_DETAIL_VERSION = "v2";
export const DEFAULT_NODE_DETAIL_JOB_MAX_ATTEMPTS = 3;

export type NodeDetailJobStatus = "queued" | "running" | "ready" | "failed";
export type NodeDetailJobRow = typeof nodeDetailJobs.$inferSelect & {
  status: NodeDetailJobStatus;
};

export interface EnqueueNodeDetailJobInput {
  treeId: string;
  nodeId: string;
  detailVersion?: string;
  maxAttempts?: number;
  now?: Date;
  // 사용자가 직접 다시 요청한 경우, 이미 'failed'로 끝나 워커가 다시 집을 수 없는
  // 기존 작업을 'queued'로 되돌려 재생성 기회를 준다. 백그라운드 prewarm은 이 플래그를
  // 쓰지 않으므로, 실패한 노드를 자동으로 무한 재생성하지 않는다.
  resetExhausted?: boolean;
}

export interface ClaimQueuedNodeDetailJobInput {
  workerId: string;
  now?: Date;
}

export interface MarkNodeDetailJobReadyInput {
  jobId: string;
  treeId: string;
  nodeId: string;
  detailVersion: string;
  detailJson: NodeDetailResponse;
  now?: Date;
}

export interface MarkNodeDetailJobFailedInput {
  jobId: string;
  errorMessage: string;
  now?: Date;
}

export interface RequeueNodeDetailJobInput {
  jobId: string;
  errorMessage: string;
  now?: Date;
}

export interface RecoverStaleRunningNodeDetailJobsInput {
  staleBefore: Date;
  now?: Date;
}

export interface RecoverStaleRunningNodeDetailJobsResult {
  requeued: number;
  failed: number;
}

type RawNodeDetailJobRow = {
  id: string;
  tree_id: string;
  node_id: string;
  detail_version: string;
  status: NodeDetailJobStatus;
  attempt_count: number;
  max_attempts: number;
  locked_at: Date | null;
  locked_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function toJobRow(row: typeof nodeDetailJobs.$inferSelect): NodeDetailJobRow {
  return row as NodeDetailJobRow;
}

function toJobRowFromRaw(row: RawNodeDetailJobRow): NodeDetailJobRow {
  return {
    id: row.id,
    treeId: row.tree_id,
    nodeId: row.node_id,
    detailVersion: row.detail_version,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "node detail job failed";
  return trimmed.slice(0, 500);
}

export async function getNodeDetailJob(
  jobId: string,
): Promise<NodeDetailJobRow | null> {
  const rows = await getDb()
    .select()
    .from(nodeDetailJobs)
    .where(eq(nodeDetailJobs.id, jobId));
  return rows[0] ? toJobRow(rows[0]) : null;
}

export async function getNodeDetailJobByTarget(
  treeId: string,
  nodeId: string,
  detailVersion: string = CURRENT_NODE_DETAIL_VERSION,
): Promise<NodeDetailJobRow | null> {
  const rows = await getDb()
    .select()
    .from(nodeDetailJobs)
    .where(
      and(
        eq(nodeDetailJobs.treeId, treeId),
        eq(nodeDetailJobs.nodeId, nodeId),
        eq(nodeDetailJobs.detailVersion, detailVersion),
      ),
    );
  return rows[0] ? toJobRow(rows[0]) : null;
}

export async function enqueueNodeDetailJob(
  input: EnqueueNodeDetailJobInput,
): Promise<NodeDetailJobRow> {
  const detailVersion = input.detailVersion ?? CURRENT_NODE_DETAIL_VERSION;
  const now = input.now ?? new Date();
  const inserted = await getDb()
    .insert(nodeDetailJobs)
    .values({
      treeId: input.treeId,
      nodeId: input.nodeId,
      detailVersion,
      status: "queued",
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_NODE_DETAIL_JOB_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        nodeDetailJobs.treeId,
        nodeDetailJobs.nodeId,
        nodeDetailJobs.detailVersion,
      ],
    })
    .returning();

  const row = inserted[0];
  if (row) return toJobRow(row);

  const existing = await getNodeDetailJobByTarget(
    input.treeId,
    input.nodeId,
    detailVersion,
  );
  if (!existing) throw new Error("node_detail_jobs enqueue conflict lookup failed");

  // 'failed' 작업은 claim 조건(status='queued')에 영영 잡히지 않고, (tree,node,version)
  // 고유 제약 때문에 새 작업도 만들 수 없어 그대로 두면 영구히 실패 상태로 고착된다.
  // 사용자가 명시적으로 재시도한 경우에만 queued로 되돌려 워커가 새로 처리하게 한다.
  if (input.resetExhausted && existing.status === "failed") {
    const reset = await getDb()
      .update(nodeDetailJobs)
      .set({
        status: "queued",
        attemptCount: 0,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(nodeDetailJobs.id, existing.id),
          eq(nodeDetailJobs.status, "failed"),
        ),
      )
      .returning();
    if (reset[0]) return toJobRow(reset[0]);
    // 동시에 다른 요청/워커가 상태를 바꿨다면 최신 행을 다시 읽어 반환한다.
    const refreshed = await getNodeDetailJobByTarget(
      input.treeId,
      input.nodeId,
      detailVersion,
    );
    if (refreshed) return refreshed;
  }

  return existing;
}

export async function claimQueuedNodeDetailJob(
  input: ClaimQueuedNodeDetailJobInput,
): Promise<NodeDetailJobRow | null> {
  const sql = getSqlClient();
  const now = input.now ?? new Date();
  const rows = await sql<RawNodeDetailJobRow[]>`
    update node_detail_jobs
    set
      status = 'running',
      locked_at = ${now},
      locked_by = ${input.workerId},
      started_at = coalesce(started_at, ${now}),
      attempt_count = attempt_count + 1,
      updated_at = ${now}
    where id = (
      select id
      from node_detail_jobs
      where status = 'queued'
        and attempt_count < max_attempts
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning
      id,
      tree_id,
      node_id,
      detail_version,
      status,
      attempt_count,
      max_attempts,
      locked_at,
      locked_by,
      started_at,
      completed_at,
      error_message,
      created_at,
      updated_at
  `;
  return rows[0] ? toJobRowFromRaw(rows[0]) : null;
}

export async function markNodeDetailJobReady(
  input: MarkNodeDetailJobReadyInput,
): Promise<NodeDetailJobRow> {
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const updatedNodes = await tx
      .update(learningNodes)
      .set({
        detailJson: input.detailJson,
        updatedAt: now.toISOString(),
      })
      .where(
        and(
          eq(learningNodes.id, input.nodeId),
          eq(learningNodes.treeId, input.treeId),
        ),
      )
      .returning({
        id: learningNodes.id,
        conceptId: learningNodes.conceptId,
      });
    const updatedNode = updatedNodes[0];
    if (!updatedNode) throw new Error("node detail ready save failed");

    if (updatedNode.conceptId && input.detailJson.easy_explanation?.trim()) {
      const conceptRows = await tx
        .select({
          id: concepts.id,
          explanation: concepts.explanation,
        })
        .from(concepts)
        .where(eq(concepts.id, updatedNode.conceptId));
      const concept = conceptRows[0];
      if (concept && !concept.explanation?.trim()) {
        await tx
          .update(concepts)
          .set({
            explanation: input.detailJson.easy_explanation.trim(),
            updatedAt: now.toISOString(),
          })
          .where(eq(concepts.id, concept.id));
      }
    }

    const updatedJobs = await tx
      .update(nodeDetailJobs)
      .set({
        status: "ready",
        lockedAt: null,
        lockedBy: null,
        completedAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(nodeDetailJobs.id, input.jobId),
          eq(nodeDetailJobs.treeId, input.treeId),
          eq(nodeDetailJobs.nodeId, input.nodeId),
          eq(nodeDetailJobs.detailVersion, input.detailVersion),
        ),
      )
      .returning();
    const updatedJob = updatedJobs[0];
    if (!updatedJob) throw new Error("node detail ready job update failed");
    return toJobRow(updatedJob);
  });
}

export async function markNodeDetailJobFailed(
  input: MarkNodeDetailJobFailedInput,
): Promise<NodeDetailJobRow | null> {
  const now = input.now ?? new Date();
  const rows = await getDb()
    .update(nodeDetailJobs)
    .set({
      status: "failed",
      lockedAt: null,
      lockedBy: null,
      completedAt: now,
      errorMessage: safeErrorMessage(input.errorMessage),
      updatedAt: now,
    })
    .where(eq(nodeDetailJobs.id, input.jobId))
    .returning();
  return rows[0] ? toJobRow(rows[0]) : null;
}

export async function requeueNodeDetailJob(
  input: RequeueNodeDetailJobInput,
): Promise<NodeDetailJobRow | null> {
  const now = input.now ?? new Date();
  const rows = await getDb()
    .update(nodeDetailJobs)
    .set({
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      errorMessage: safeErrorMessage(input.errorMessage),
      updatedAt: now,
    })
    .where(eq(nodeDetailJobs.id, input.jobId))
    .returning();
  return rows[0] ? toJobRow(rows[0]) : null;
}

export async function recoverStaleRunningNodeDetailJobs(
  input: RecoverStaleRunningNodeDetailJobsInput,
): Promise<RecoverStaleRunningNodeDetailJobsResult> {
  const now = input.now ?? new Date();
  const staleCondition = and(
    eq(nodeDetailJobs.status, "running"),
    lt(nodeDetailJobs.lockedAt, input.staleBefore),
    isNull(nodeDetailJobs.completedAt),
  );

  const requeuedRows = await getDb()
    .update(nodeDetailJobs)
    .set({
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      errorMessage: "stale running job recovered and requeued",
      updatedAt: now,
    })
    .where(and(staleCondition, lt(nodeDetailJobs.attemptCount, nodeDetailJobs.maxAttempts)))
    .returning({ id: nodeDetailJobs.id });

  const failedRows = await getDb()
    .update(nodeDetailJobs)
    .set({
      status: "failed",
      lockedAt: null,
      lockedBy: null,
      completedAt: now,
      errorMessage: "stale running job exceeded max attempts",
      updatedAt: now,
    })
    .where(staleCondition)
    .returning({ id: nodeDetailJobs.id });

  return {
    requeued: requeuedRows.length,
    failed: failedRows.length,
  };
}
