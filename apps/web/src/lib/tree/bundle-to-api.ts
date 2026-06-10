/**
 * DB에서 꺼낸 `LearningTreeBundle`을 REST/프론트 계약(`ApiTreeResponse`)으로 바꿉니다.
 *
 * - DB는 camelCase·null, API는 snake_case·기본값(예: `description` 빈 문자열) 등 명세에 맞춤
 * - `recommended_order`는 `tree_json`에만 있고 노드 테이블에는 없음 — 번들의 `tree.treeJson`에서 직접 전달
 */
import type { LearningTreeBundle } from "@/lib/repository/learning-repository";
import {
  findDocumentContextForNode,
  type DocumentTreeContext,
} from "@/lib/repository/document-repository";
import type {
  ApiLearningNode,
  ApiProgressEntry,
  ApiTreePayload,
  LearningEdgeQuality,
  LlmConceptEdge,
} from "@/types/learning";

export interface ApiTreeResponse extends ApiTreePayload {
  progress: ApiProgressEntry[];
}

/**
 * Phase 13: 저장된 트리(`tree_json`)의 edge를 항상 채워진 `LearningEdgeQuality`로 보정한다.
 *
 * 옛 트리에는 `explanation`/`confidence`/`is_blocking`이 없으므로 기본값으로 채워
 * UI가 옛 데이터에서도 깨지지 않게 한다(explanation이 없으면 옛 `reason`을 쓴다).
 */
function normalizeEdges(
  edges: LlmConceptEdge[] | undefined,
): LearningEdgeQuality[] {
  if (!edges || edges.length === 0) return [];
  return edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    relation_type: edge.relation_type,
    explanation: (edge.explanation ?? edge.reason ?? "").trim(),
    confidence: typeof edge.confidence === "number" ? edge.confidence : 0.5,
    is_blocking: edge.is_blocking ?? false,
  }));
}

export function bundleToApiTreeResponse(
  bundle: LearningTreeBundle,
  options?: { documentContext?: DocumentTreeContext | null },
): ApiTreeResponse {
  /** 노드 id → 진행 상태 빠른 조회 */
  const progressByNode = new Map(
    bundle.progress.map((p) => [p.node_id, p.status]),
  );
  const snapshotByKey = new Map(
    bundle.tree.treeJson.nodes.map((node) => [node.id, node]),
  );

  const nodes: ApiLearningNode[] = bundle.nodes.map((n) => {
    const snapshot = snapshotByKey.get(n.nodeKey);
    const documentContext = findDocumentContextForNode(
      options?.documentContext ?? null,
      n.title,
      n.conceptId,
    );
    const conceptId = n.conceptId ?? documentContext?.concept_id ?? null;

    return {
      id: n.id,
      node_key: n.nodeKey,
      title: n.title,
      type: n.type,
      description: n.description ?? "",
      difficulty: n.difficulty ?? 0,
      prerequisites: n.prerequisites,
      children: n.children,
      community: snapshot?.community,
      priority: snapshot?.priority,
      depth: snapshot?.depth,
      has_detail: n.detailJson != null,
      progress: progressByNode.get(n.id) ?? "unknown",
      concept_id: conceptId,
      is_reused_concept: n.isReusedConcept,
      concept_tree_count:
        conceptId != null ?
          /** 같은 Concept이 몇 개의 서로 다른 트리에 쓰였는지 — UI 배지용 */
          (bundle.conceptTreeCounts.get(conceptId) ?? 1)
        : null,
      document_context:
        documentContext ?
          {
            document_id: documentContext.document_id,
            document_title: documentContext.document_title,
            document_concept_id: documentContext.document_concept_id,
            concept_type: documentContext.concept_type,
            source_type: documentContext.source_type,
            evidence_count: documentContext.evidence_count,
            evidence: documentContext.evidence,
          }
        : undefined,
    };
  });

  return {
    tree_id: bundle.tree.id,
    document_id: options?.documentContext?.document_id,
    document_title: options?.documentContext?.document_title,
    topic: bundle.tree.topic,
    summary: bundle.tree.summary ?? "",
    nodes,
    recommended_order: bundle.tree.treeJson.recommended_order,
    communities: bundle.tree.treeJson.communities ?? [],
    edges: normalizeEdges(bundle.tree.treeJson.edges),
    progress: bundle.progress,
  };
}
