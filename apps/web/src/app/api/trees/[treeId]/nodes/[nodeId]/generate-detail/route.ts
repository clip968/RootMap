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
import { DEFAULT_USER_ID } from "@/db/constants";
import { getLearningTree, updateNodeDetail } from "@/lib/repository/learning-repository";
import {
  getDocumentTreeContextForUser,
  findDocumentContextForNode,
  getChunkTextsForConcept,
} from "@/lib/repository/document-repository";
import { generateNodeDetail } from "@/lib/llm/generate-document-detail";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string; nodeId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { treeId, nodeId } = await ctx.params;

  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    return jsonError("NOT_FOUND", "트리를 찾을 수 없습니다.", 404);
  }

  // 문서 기반 트리인지 확인 (documentLearningTrees 링크 존재 여부)
  const documentContext = getDocumentTreeContextForUser(treeId, DEFAULT_USER_ID);
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

  // 이미 description이 있으면 cache hit
  if (node.description && node.description.length > 0) {
    return NextResponse.json({
      node_id: nodeId,
      cached: true,
      description: node.description,
    });
  }

  try {
    const chunkTexts = getChunkTextsForConcept(
      documentContext.document_id,
      node.title,
    );

    // 노드의 document_context 확인
    const nodeDocCtx = findDocumentContextForNode(
      documentContext,
      node.title,
      node.conceptId,
    );

    const detail = await generateNodeDetail({
      documentTitle: documentContext.document_title,
      documentSummary: bundle.tree.summary ?? "",
      nodeId: node.nodeKey,
      nodeTitle: node.title,
      nodeType: node.type,
      sourceType: nodeDocCtx?.source_type ?? "generated",
      consolidatedConceptsJson: JSON.stringify(
        bundle.nodes
          .filter((n) => {
            const ctx = findDocumentContextForNode(
              documentContext,
              n.title,
              n.conceptId,
            );
            return ctx != null;
          })
          .map((n) => {
            const ctx = findDocumentContextForNode(
              documentContext,
              n.title,
              n.conceptId,
            );
            return {
              title: n.title,
              type: n.type,
              source_type: ctx?.source_type,
            };
          }),
      ),
      chunkTexts,
      requestId: `node-detail-${nodeId}`,
    });

    // description 업데이트 (document_context_summary가 있으면 우선 사용)
    updateNodeDetail(treeId, nodeId, {
      description:
        detail.document_context_summary || detail.easy_explanation,
      difficulty: 3,
    });

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
