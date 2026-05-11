import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { DEFAULT_USER_ID } from "@/db/constants";
import {
  getConceptById,
  updateConceptPatch,
} from "@/lib/repository/concept-repository";
import { persistPhase2Concepts } from "@/lib/services/concept-persistence";
import {
  learningNodes,
  learningTreeConcepts,
  learningTrees,
  userConceptProgress,
  userNodeProgress,
} from "@/db/schema";
import type {
  ApiProgressEntry,
  LearningTreeNode,
  LearningTreeResponse,
  NodeDetailResponse,
  NodeType,
  ProgressStatus,
} from "@/types/learning";

/**
 * 학습 트리 저장소(Repository).
 *
 * - Phase 1: `learning_trees`에 트리 JSON 전체 + `learning_nodes`에 정규화된 노드, `user_node_progress`에 이해 상태
 * - Phase 2: 트랜잭션 안에서 `persistPhase2Concepts`로 concepts / edges / learning_tree_concepts 연결
 * - 읽기: `getLearningTree`가 트리 한 건에 필요한 조인 결과를 `LearningTreeBundle`로 묶음
 */

export { DEFAULT_USER_ID } from "@/db/constants";

export interface LearningTreeRow {
  id: string;
  userId: string;
  topic: string;
  summary: string | null;
  treeJson: LearningTreeResponse;
  createdAt: string;
  updatedAt: string;
}

export interface LearningNodeRow {
  id: string;
  treeId: string;
  nodeKey: string;
  title: string;
  type: NodeType;
  description: string | null;
  difficulty: number | null;
  prerequisites: string[];
  children: string[];
  detailJson: NodeDetailResponse | null;
  conceptId: string | null;
  isReusedConcept: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface LearningTreeBundle {
  tree: LearningTreeRow;
  nodes: LearningNodeRow[];
  progress: ApiProgressEntry[];
  /** concept id → 그 Concept이 등장한 서로 다른 트리 개수(추천 UI·관리 화면용) */
  conceptTreeCounts: Map<string, number>;
}

export interface LearningTreeHistoryRow {
  id: string;
  topic: string;
  summary: string | null;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

function mapTreeRow(row: typeof learningTrees.$inferSelect): LearningTreeRow {
  return {
    id: row.id,
    userId: row.userId,
    topic: row.topic,
    summary: row.summary,
    treeJson: row.treeJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapNodeRow(row: typeof learningNodes.$inferSelect): LearningNodeRow {
  return {
    id: row.id,
    treeId: row.treeId,
    nodeKey: row.nodeKey,
    title: row.title,
    type: row.type as NodeType,
    description: row.description,
    difficulty: row.difficulty,
    prerequisites: row.prerequisites,
    children: row.children,
    detailJson: row.detailJson ?? null,
    conceptId: row.conceptId ?? null,
    isReusedConcept: row.isReusedConcept ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getConceptTreeUsageCounts(
  conceptIds: string[],
): Map<string, number> {
  if (conceptIds.length === 0) return new Map();
  const db = getDb();
  const rows = db
    .select({
      cid: learningTreeConcepts.conceptId,
      n: sql<number>`count(distinct ${learningTreeConcepts.treeId})`.mapWith(
        Number,
      ),
    })
    .from(learningTreeConcepts)
    .where(inArray(learningTreeConcepts.conceptId, conceptIds))
    .groupBy(learningTreeConcepts.conceptId)
    .all();
  return new Map(rows.map((r) => [r.cid, r.n]));
}

export function listLearningTreeHistory(
  userId: string = DEFAULT_USER_ID,
  limit: number = 50,
): LearningTreeHistoryRow[] {
  const db = getDb();
  const rows = db
    .select({
      id: learningTrees.id,
      topic: learningTrees.topic,
      summary: learningTrees.summary,
      createdAt: learningTrees.createdAt,
      updatedAt: learningTrees.updatedAt,
      nodeCount: sql<number>`count(${learningNodes.id})`.mapWith(Number),
    })
    .from(learningTrees)
    .leftJoin(learningNodes, eq(learningNodes.treeId, learningTrees.id))
    .where(eq(learningTrees.userId, userId))
    .groupBy(learningTrees.id)
    .orderBy(desc(learningTrees.updatedAt), desc(learningTrees.createdAt))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    summary: row.summary,
    nodeCount: row.nodeCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function createLearningTree(
  topic: string,
  summary: string | null,
  treeJson: LearningTreeResponse,
  userId: string = DEFAULT_USER_ID,
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db
    .insert(learningTrees)
    .values({
      userId,
      topic,
      summary,
      treeJson,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: learningTrees.id })
    .all();
  const row = rows[0];
  if (!row) {
    throw new Error("learning_trees insert failed");
  }
  return row.id;
}

export interface FullTreeOptions {
  reuseConcepts?: boolean;
  requestId?: string;
}

function logLearningPersistence(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "persistence", event, ...details });
}

/**
 * 한 번의 트랜잭션 안에서 새 트리 레코드부터 Phase 2 Concept까지 모두 저장합니다.
 *
 * 순서 중요:
 * 1) `learning_trees` 삽입 — LLM이 준 `treeJson` 전체를 그대로 보관(스냅샷)
 * 2) 각 LLM 노드 id(`node_key`)마다 `learning_nodes` 행 생성 — DB auto id와 매핑
 * 3) 모든 노드에 대해 `user_node_progress` 기본값 `unknown`
 * 4) `persistPhase2Concepts` — 노드에 concept_id 채우고 글로벌 Concept/Edge 테이블 갱신
 *
 * @returns 새 트리의 UUID
 */
export function createFullLearningTree(
  topic: string,
  summary: string | null,
  treeJson: LearningTreeResponse,
  userId: string = DEFAULT_USER_ID,
  options?: FullTreeOptions,
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const reuseConcepts = options?.reuseConcepts ?? true;
  const requestId = options?.requestId;
  const transactionStartedAt = Date.now();
  return db.transaction((tx) => {
    /** (1) 트리 메타 + JSON 스냅샷 */
    const treeInsertStartedAt = Date.now();
    const tr = tx
      .insert(learningTrees)
      .values({
        userId,
        topic,
        summary,
        treeJson,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: learningTrees.id })
      .all();
    const treeId = tr[0]?.id;
    if (!treeId) throw new Error("learning_trees insert failed");
    if (requestId) {
      logLearningPersistence("tree_insert_complete", {
        requestId,
        durationMs: Date.now() - treeInsertStartedAt,
        treeId,
      });
    }

    const nodeInsertStartedAt = Date.now();
    /** LLM 노드 id 문자열 → DB `learning_nodes.id` — 이후 Concept 연결·prerequisite 보강에 사용 */
    const nodeKeyToDbId = new Map<string, string>();
    const nodeIds: string[] = [];
    for (const n of treeJson.nodes) {
      const nr = tx
        .insert(learningNodes)
        .values({
          treeId,
          nodeKey: n.id,
          title: n.title,
          type: n.type,
          description: n.description,
          difficulty: n.difficulty,
          prerequisites: n.prerequisites,
          children: n.children,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: learningNodes.id })
        .all();
      const nid = nr[0]?.id;
      if (!nid) throw new Error("learning_nodes insert failed");
      nodeKeyToDbId.set(n.id, nid);
      nodeIds.push(nid);
    }
    if (requestId) {
      logLearningPersistence("node_insert_complete", {
        requestId,
        durationMs: Date.now() - nodeInsertStartedAt,
        nodeCount: nodeIds.length,
      });
    }

    const progressInsertStartedAt = Date.now();
    if (nodeIds.length > 0) {
      /** 트리를 처음 본 사용자의 각 노드 이해 상태 — 기본 unknown */
      tx.insert(userNodeProgress)
        .values(
          nodeIds.map((nodeId) => ({
            userId,
            treeId,
            nodeId,
            status: "unknown" as const,
            updatedAt: now,
          })),
        )
        .run();
    }
    if (requestId) {
      logLearningPersistence("progress_insert_complete", {
        requestId,
        durationMs: Date.now() - progressInsertStartedAt,
        progressCount: nodeIds.length,
      });
    }

    const conceptPersistenceStartedAt = Date.now();
    /**
     * 같은 트랜잭션 `tx`를 넘겨야 트리/노드와 Concept 데이터가 함께 커밋/롤백됨
     */
    persistPhase2Concepts(tx, {
      treeId,
      tree: treeJson,
      nodeKeyToDbId,
      reuseConcepts,
      requestId,
    });
    if (requestId) {
      logLearningPersistence("concept_persistence_complete", {
        requestId,
        durationMs: Date.now() - conceptPersistenceStartedAt,
        nodeCount: treeJson.nodes.length,
        edgeCount: treeJson.edges?.length ?? 0,
        reuseConcepts,
      });
      logLearningPersistence("transaction_complete", {
        requestId,
        durationMs: Date.now() - transactionStartedAt,
        treeId,
      });
    }

    return treeId;
  });
}

export function createLearningNodes(
  treeId: string,
  nodes: LearningTreeNode[],
): Array<{ id: string; nodeKey: string }> {
  const db = getDb();
  const now = new Date().toISOString();
  return db.transaction((tx) => {
    const out: Array<{ id: string; nodeKey: string }> = [];
    for (const n of nodes) {
      const rows = tx
        .insert(learningNodes)
        .values({
          treeId,
          nodeKey: n.id,
          title: n.title,
          type: n.type,
          description: n.description,
          difficulty: n.difficulty,
          prerequisites: n.prerequisites,
          children: n.children,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: learningNodes.id,
          nodeKey: learningNodes.nodeKey,
        })
        .all();
      const row = rows[0];
      if (!row) {
        throw new Error("learning_nodes insert failed");
      }
      out.push({ id: row.id, nodeKey: row.nodeKey });
    }
    return out;
  });
}

export function initializeNodeProgress(
  userId: string,
  treeId: string,
  nodeIds: string[],
): void {
  if (nodeIds.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(userNodeProgress)
    .values(
      nodeIds.map((nodeId) => ({
        userId,
        treeId,
        nodeId,
        status: "unknown" as const,
        updatedAt: now,
      })),
    )
    .run();
}

/**
 * 단일 트리 id로 화면/API에 필요한 데이터를 모읍니다.
 * 존재하지 않거나 다른 사용자 소유면 `null`.
 */
export function getLearningTree(
  treeId: string,
  userId: string = DEFAULT_USER_ID,
): LearningTreeBundle | null {
  const db = getDb();
  const treeRows = db
    .select()
    .from(learningTrees)
    .where(
      and(eq(learningTrees.id, treeId), eq(learningTrees.userId, userId)),
    )
    .all();
  const treeRow = treeRows[0];
  if (!treeRow) return null;

  const nodeRows = db
    .select()
    .from(learningNodes)
    .where(eq(learningNodes.treeId, treeId))
    .all();

  const progress = getProgressByTree(userId, treeId);
  const mapped = nodeRows.map(mapNodeRow);
  const cids = mapped
    .map((n) => n.conceptId)
    .filter((x): x is string => x != null);

  return {
    tree: mapTreeRow(treeRow),
    nodes: mapped,
    progress,
    conceptTreeCounts: getConceptTreeUsageCounts(cids),
  };
}

export function getNodeById(nodeId: string): LearningNodeRow | null {
  const db = getDb();
  const rows = db
    .select()
    .from(learningNodes)
    .where(eq(learningNodes.id, nodeId))
    .all();
  const row = rows[0];
  if (!row) return null;
  return mapNodeRow(row);
}

/**
 * Phase 3 Task 11: 특정 노드의 description/difficulty를 업데이트한다.
 * 점진적 트리 생성에서 사용자가 노드를 클릭하면 지연 생성된
 * 상세 정보를 저장한다.
 */
export function updateNodeDetail(
  treeId: string,
  nodeId: string,
  detail: {
    description: string;
    difficulty: number;
  },
): void {
  const db = getDb();
  db.update(learningNodes)
    .set({
      description: detail.description,
      difficulty: detail.difficulty,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(learningNodes.treeId, treeId),
        eq(learningNodes.id, nodeId),
      ),
    )
    .run();
}

export function saveNodeDetail(
  nodeId: string,
  detailJson: NodeDetailResponse,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .update(learningNodes)
    .set({ detailJson, updatedAt: now })
    .where(eq(learningNodes.id, nodeId))
    .run();
  if (result.changes === 0) return false;

  const nodeRow = db
    .select({ conceptId: learningNodes.conceptId })
    .from(learningNodes)
    .where(eq(learningNodes.id, nodeId))
    .all()[0];
  const cid = nodeRow?.conceptId;
  if (cid && detailJson.easy_explanation?.trim()) {
    const concept = getConceptById(db, cid);
    if (concept && !concept.explanation?.trim()) {
      updateConceptPatch(db, cid, {
        explanation: detailJson.easy_explanation.trim(),
      });
    }
  }
  return true;
}

export function updateNodeProgress(
  userId: string,
  nodeId: string,
  status: ProgressStatus,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .update(userNodeProgress)
    .set({ status, updatedAt: now })
    .where(
      and(
        eq(userNodeProgress.userId, userId),
        eq(userNodeProgress.nodeId, nodeId),
      ),
    )
    .run();
  return result.changes > 0;
}

export function upsertUserConceptProgress(
  userId: string,
  conceptId: string,
  status: ProgressStatus,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(userConceptProgress)
    .values({
      userId,
      conceptId,
      status,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userConceptProgress.userId, userConceptProgress.conceptId],
      set: { status, updatedAt: now },
    })
    .run();
}

export function getConceptProgressMapForUser(
  userId: string,
): Map<string, ProgressStatus> {
  const db = getDb();
  const rows = db
    .select()
    .from(userConceptProgress)
    .where(eq(userConceptProgress.userId, userId))
    .all();
  return new Map(rows.map((r) => [r.conceptId, r.status as ProgressStatus]));
}

/** 진행 행이 없으면 INSERT, 있으면 UPDATE (PATCH API용) */
export function upsertNodeProgress(
  userId: string,
  treeId: string,
  nodeId: string,
  status: ProgressStatus,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(userNodeProgress)
    .values({
      userId,
      treeId,
      nodeId,
      status,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userNodeProgress.userId, userNodeProgress.nodeId],
      set: { status, updatedAt: now, treeId },
    })
    .run();
}

export function getProgressByTree(
  userId: string,
  treeId: string,
): ApiProgressEntry[] {
  const db = getDb();
  const rows = db
    .select({
      node_id: userNodeProgress.nodeId,
      status: userNodeProgress.status,
    })
    .from(userNodeProgress)
    .where(
      and(
        eq(userNodeProgress.userId, userId),
        eq(userNodeProgress.treeId, treeId),
      ),
    )
    .all();
  return rows.map((r) => ({
    node_id: r.node_id,
    status: r.status as ProgressStatus,
  }));
}
