import { jsonError } from "@/lib/api-errors";
import { DEFAULT_USER_ID } from "@/db/constants";
import { recommendNextNodes } from "@/lib/recommendation/recommend-next";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { treeId } = await ctx.params;
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    return jsonError(
      "NOT_FOUND",
      "해당 학습 트리를 찾을 수 없습니다.",
      404,
    );
  }

  const inputs = bundle.nodes.map((n) => ({
    id: n.id,
    node_key: n.nodeKey,
    title: n.title,
    type: n.type,
    difficulty: n.difficulty ?? 0,
    prerequisites: n.prerequisites,
  }));

  const progressMap = new Map(
    bundle.progress.map((p) => [p.node_id, p.status]),
  );

  const recommended_nodes = recommendNextNodes(inputs, progressMap);
  return NextResponse.json({ recommended_nodes });
}
