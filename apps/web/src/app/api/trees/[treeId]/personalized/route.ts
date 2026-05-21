import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  buildPersonalizedNodes,
  type PersonalizedMasteryState,
  type PersonalizedNodeInput,
} from "@/lib/recommendation/personalized";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { listUserConceptMasteryForConcepts } from "@/lib/repository/learning-session-repository";
import type { ProgressStatus } from "@/types/learning";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string }> };

function toPersonalizedNodeInputs(
  bundle: NonNullable<Awaited<ReturnType<typeof getLearningTree>>>,
): PersonalizedNodeInput[] {
  const snapshotByKey = new Map(
    bundle.tree.treeJson.nodes.map((node) => [node.id, node]),
  );
  return bundle.nodes.map((node) => {
    const snapshot = snapshotByKey.get(node.nodeKey);
    return {
      nodeId: node.id,
      nodeKey: node.nodeKey,
      title: node.title,
      type: node.type,
      difficulty: node.difficulty ?? 0,
      prerequisites: node.prerequisites,
      conceptId: node.conceptId,
      /** priority가 있으면 문서/그래프 중요도의 보수적 proxy로 사용한다. */
      importance:
        typeof snapshot?.priority === "number" ?
          Math.max(0, Math.min(1, snapshot.priority / 10))
        : null,
    };
  });
}

async function loadMasteryMap(input: {
  userId: string;
  conceptIds: string[];
}): Promise<Map<string, PersonalizedMasteryState>> {
  const rows = await listUserConceptMasteryForConcepts(input);
  return new Map(
    rows.map((row) => [
      row.conceptId,
      {
        status: row.status as ProgressStatus,
        confidenceScore: row.confidenceScore,
        lastStudiedAt: row.lastStudiedAt,
        lastQuizScore: row.lastQuizScore,
        wrongCount: row.wrongCount,
        correctCount: row.correctCount,
        needsReview: row.needsReview,
      },
    ]),
  );
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { treeId } = await ctx.params;
  const bundle = await getLearningTree(treeId, auth.userId);
  if (!bundle) {
    return jsonError(
      "NOT_FOUND",
      "해당 학습 트리를 찾을 수 없습니다.",
      404,
    );
  }

  const nodes = toPersonalizedNodeInputs(bundle);
  const masteryByConceptId = await loadMasteryMap({
    userId: auth.userId,
    conceptIds: nodes
      .map((node) => node.conceptId)
      .filter((conceptId): conceptId is string => conceptId != null),
  });

  return NextResponse.json({
    tree_id: bundle.tree.id,
    topic: bundle.tree.topic,
    personalized_nodes: buildPersonalizedNodes(nodes, masteryByConceptId),
  });
}
