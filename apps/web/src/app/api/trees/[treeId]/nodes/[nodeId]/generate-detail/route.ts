/**
 * Phase 3 Task 11: 노드 상세 지연 생성 API
 *
 * POST /api/trees/:treeId/nodes/:nodeId/generate-detail
 *
 * 사용자가 노드를 클릭하면 호출된다.
 * - detailJson 텍스트가 이미 있어도 캐시를 그대로 반환하지 않고 항상 서비스로 보낸다.
 *   (텍스트는 재사용하고 visual_blocks가 비어 있으면 best-effort로 다시 보강한다.)
 * - 텍스트 자체가 없으면 LLM으로 상세 설명을 생성한 뒤 저장한다.
 * - 응답의 cached 플래그는 요청 시점에 detailJson 텍스트가 이미 있었는지를 나타낸다.
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

  // detailJson 캐시가 이미 있었는지만 기록해 응답의 cached 플래그로 노출한다.
  // 예전에는 detailJson이 있으면 여기서 바로 캐시를 반환했지만, 그러면
  // "텍스트만 저장되고 visual_blocks는 비어 있는" 노드가 이 라우트를 탈 때
  // visual 보강을 영원히 재시도하지 못했다. 그래서 캐시 유무와 상관없이 항상
  // 서비스로 보내, 텍스트는 그대로 재사용하고 visual만 best-effort로 다시 채우게 한다.
  // getOrCreateNodeDetailForRequest는 requireVisualDetail: true로 동작하므로,
  // 캐시된 텍스트에 visual이 없으면 augmentVisualBestEffort 경로로 보강을 시도하고
  // 실패하면 텍스트 + VISUAL_PENDING 경고를 그대로 응답한다.
  const hadCachedDetail = Boolean(node.detailJson);

  try {
    const detail = await getOrCreateNodeDetailForRequest(
      treeId,
      nodeId,
      auth.userId,
    );
    return NextResponse.json({
      node_id: nodeId,
      detail,
      cached: hadCachedDetail,
    });
  } catch (e) {
    console.error("[generate-detail]", e);
    return jsonError(
      "DETAIL_GENERATION_FAILED",
      "노드 상세 설명을 생성하지 못했습니다.",
      500,
    );
  }
}
