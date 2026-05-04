import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { DEFAULT_USER_ID } from "@/db/constants";
import { learningNodes, learningTrees, userNodeProgress } from "@/db/schema";
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
  createdAt: string;
  updatedAt: string;
}

export interface LearningTreeBundle {
  tree: LearningTreeRow;
  nodes: LearningNodeRow[];
  progress: ApiProgressEntry[];
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

  return {
    tree: mapTreeRow(treeRow),
    nodes: nodeRows.map(mapNodeRow),
    progress,
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
  return result.changes > 0;
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
