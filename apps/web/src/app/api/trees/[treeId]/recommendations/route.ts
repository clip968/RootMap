import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { recommendNextNodes } from "@/lib/recommendation/recommend-next";
import {
  findDocumentContextForNode,
  getDocumentTreeContextForUser,
} from "@/lib/repository/document-repository";
import {
  getConceptProgressMapForUser,
  getLearningTree,
} from "@/lib/repository/learning-repository";
import type { DocumentNodeType } from "@/types/learning";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string }> };

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

  const documentContext = await getDocumentTreeContextForUser(treeId, auth.userId);
  const recommendedOrderIndex = new Map(
    bundle.tree.treeJson.recommended_order.map((nodeKey, index) => [
      nodeKey,
      index,
    ]),
  );
  const toDocumentNodeType = (
    conceptType: string,
  ): DocumentNodeType | undefined => {
    if (conceptType === "document_core") return "document_core";
    if (conceptType === "misconception") return "misconception";
    if (conceptType === "prerequisite") return "prerequisite";
    return undefined;
  };
  const inputs = bundle.nodes.map((n) => ({
    id: n.id,
    node_key: n.nodeKey,
    title: n.title,
    type: n.type,
    difficulty: n.difficulty ?? 0,
    prerequisites: n.prerequisites,
    ...(() => {
      const context = findDocumentContextForNode(
        documentContext,
        n.title,
        n.conceptId,
      );
      if (!context) return {};
      return {
        source_type: context.source_type,
        document_type: toDocumentNodeType(context.concept_type),
        recommended_order_index: recommendedOrderIndex.get(n.nodeKey),
      };
    })(),
  }));

  const progressMap = new Map(
    bundle.progress.map((p) => [p.node_id, p.status]),
  );

  const recommended_nodes = recommendNextNodes(inputs, progressMap, {
    nodeConceptIds: new Map(
      bundle.nodes
        .filter((n) => n.conceptId != null)
        .map((n) => [n.id, n.conceptId!]),
    ),
    conceptProgress: await getConceptProgressMapForUser(auth.userId),
  });
  return NextResponse.json({ recommended_nodes });
}
