/**
 * Phase 3 Task 11: 노드 상세 지연 생성 API
 *
 * POST /api/trees/:treeId/nodes/:nodeId/generate-detail
 *
 * 사용자가 노드를 클릭하면 호출된다.
 * - 이미 description이 있으면 cache hit (생략)
 * - 없으면 LLM으로 상세 설명 생성 후 저장
 */
import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { getDocumentTreeContextForUser } from "@/lib/repository/document-repository";
import { getOrCreateNodeDetailForRequest } from "@/lib/services/node-detail";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string; nodeId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { treeId, nodeId } = await ctx.params;

  const bundle = await getLearningTree(treeId, auth.userId);
  if (!bundle) {
    return jsonError("NOT_FOUND", "트리를 찾을 수 없습니다.", 404);
  }

  // 문서 기반 트리인지 확인 (documentLearningTrees 링크 존재 여부)
  const documentContext = await getDocumentTreeContextForUser(treeId, auth.userId);
  if (!documentContext) {
    return jsonError(
      "INVALID_OPERATION",
      "이 트리는 문서 기반 트리가 아닙니다.",
      400,
    );
  }

  const node = bundle.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return jsonError("NOT_FOUND", "노드를 찾을 수 없습니다.", 404);
  }

  // 카드용 description은 짧은 요약일 수 있으므로 detailJson 기준으로만 cache hit 처리한다.
  if (node.detailJson) {
    return NextResponse.json({
      node_id: nodeId,
      cached: true,
      description: node.description ?? node.detailJson.easy_explanation,
      detail: node.detailJson,
    });
  }

  try {
    const detail = await getOrCreateNodeDetailForRequest(
      treeId,
      nodeId,
      auth.userId,
    );
    return NextResponse.json({ node_id: nodeId, detail, cached: false });
  } catch (e) {
    console.error("[generate-detail]", e);
    return jsonError(
      "DETAIL_GENERATION_FAILED",
      "노드 상세 설명을 생성하지 못했습니다.",
      500,
    );
  }
}
