import { and, eq, inArray, sql } from "drizzle-orm";
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
  /** concept id -> 서로 다른 학습 트리 개수 */
  conceptTreeCounts: Map<string, number>;
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
}

/**
 * 트리·노드·진행·Phase 2 Concept 연결을 한 트랜잭션으로 저장한다.
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
  return db.transaction((tx) => {
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

    if (nodeIds.length > 0) {
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

    persistPhase2Concepts(tx, {
      treeId,
      tree: treeJson,
      nodeKeyToDbId,
      reuseConcepts,
    });

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
