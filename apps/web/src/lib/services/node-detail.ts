import {
  generateNodeDetail,
  type GenerateNodeDetailInput,
  type GenerateNodeDetailResult,
} from "@/lib/llm/generate-node-detail";
import {
  generateDocumentNodeDetail,
  type GenerateDocumentNodeDetailInput,
  type GenerateDocumentNodeDetailResult,
} from "@/lib/llm/generate-document-node-detail";
import { getDb } from "@/db/client";
import type { LearningTreeBundle, LearningNodeRow } from "@/lib/repository/learning-repository";
import {
  getLearningTree,
  saveNodeDetail,
} from "@/lib/repository/learning-repository";
import {
  findDocumentContextForNode,
  getDocumentTreeContextForUser,
  type DocumentTreeNodeContext,
} from "@/lib/repository/document-repository";
import { DEFAULT_USER_ID } from "@/db/constants";
import {
  getConceptById,
  listEdgesForConcept,
  listTreesUsingConcept,
  type ConceptRow,
} from "@/lib/repository/concept-repository";
import { buildPrerequisitePromptContext } from "@/lib/services/node-detail-context";
import type { NodeDetailResponse, NodeType } from "@/types/learning";

type GenericNodeDetailGenerator = (
  input: GenerateNodeDetailInput,
) => Promise<GenerateNodeDetailResult>;

type DocumentNodeDetailGenerator = (
  input: GenerateDocumentNodeDetailInput,
) => Promise<GenerateDocumentNodeDetailResult>;

export interface ApiNodeDetailResponse {
  node_id: string;
  node_key: string;
  title: string;
  type: NodeType;
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: NodeDetailResponse["check_questions"];
  next_nodes: string[];
  quality_warnings: string[];
  concept_id: string | null;
  topic_context_line?: string;
  from_concept_store?: boolean;
  document_context?: {
    document_id: string;
    document_title: string;
    document_concept_id: string;
    concept_type: string;
    source_type: string;
    evidence_count: number;
    evidence: DocumentTreeNodeContext["evidence"];
  };
  why_it_matters_for_document?: string;
  document_context_summary?: string;
  prerequisite_concepts?: Array<{ id: string; title: string }>;
  related_concepts?: Array<{ id: string; title: string }>;
  used_in_other_trees?: Array<{
    tree_id: string;
    topic: string;
    role_in_tree: string;
  }>;
}

function buildPanelGraph(
  conceptId: string,
  treeId: string,
): {
  prerequisite_concepts: Array<{ id: string; title: string }>;
  related_concepts: Array<{ id: string; title: string }>;
  used_in_other_trees: Array<{
    tree_id: string;
    topic: string;
    role_in_tree: string;
  }>;
} {
  const db = getDb();
  const edges = listEdgesForConcept(db, conceptId);
  const prereq: Array<{ id: string; title: string }> = [];
  const related: Array<{ id: string; title: string }> = [];
  const seenP = new Set<string>();
  const seenR = new Set<string>();
  for (const e of edges) {
    if (e.relationType === "prerequisite") {
      if (e.toConceptId === conceptId) {
        const o = getConceptById(db, e.fromConceptId);
        if (o && !seenP.has(o.id)) {
          seenP.add(o.id);
          prereq.push({ id: o.id, title: o.title });
        }
      } else if (e.fromConceptId === conceptId) {
        const o = getConceptById(db, e.toConceptId);
        if (o && !seenR.has(o.id)) {
          seenR.add(o.id);
          related.push({ id: o.id, title: o.title });
        }
      }
    } else {
      const oid =
        e.fromConceptId === conceptId ? e.toConceptId : e.fromConceptId;
      const o = getConceptById(db, oid);
      if (o && !seenR.has(o.id)) {
        seenR.add(o.id);
        related.push({ id: o.id, title: o.title });
      }
    }
  }
  const used = listTreesUsingConcept(db, conceptId)
    .filter((t) => t.treeId !== treeId)
    .map((t) => ({
      tree_id: t.treeId,
      topic: t.topic,
      role_in_tree: t.roleInTree,
    }));
  return {
    prerequisite_concepts: prereq,
    related_concepts: related,
    used_in_other_trees: used,
  };
}

function topicContextLine(topic: string, nodeTitle: string): string {
  return `현재 주제 「${topic}」를 학습하는 경로에서 「${nodeTitle}」는 흐름을 이어 주는 개념입니다.`;
}

function toApiBody(
  dbId: string,
  nodeKey: string,
  d: NodeDetailResponse,
  qw: string[],
  extras: Partial<
    Pick<
      ApiNodeDetailResponse,
      | "concept_id"
      | "topic_context_line"
      | "from_concept_store"
      | "document_context"
      | "why_it_matters_for_document"
      | "document_context_summary"
      | "prerequisite_concepts"
      | "related_concepts"
      | "used_in_other_trees"
    >
  >,
): ApiNodeDetailResponse {
  return {
    node_id: dbId,
    node_key: nodeKey,
    title: d.title,
    type: d.type,
    why_it_matters: d.why_it_matters,
    easy_explanation: d.easy_explanation,
    analogy: d.analogy,
    example: d.example,
    common_misconceptions: d.common_misconceptions,
    check_questions: d.check_questions,
    next_nodes: d.next_nodes,
    quality_warnings: qw,
    concept_id: extras.concept_id ?? null,
    topic_context_line: extras.topic_context_line,
    from_concept_store: extras.from_concept_store,
    document_context: extras.document_context,
    why_it_matters_for_document: extras.why_it_matters_for_document,
    document_context_summary: extras.document_context_summary,
    prerequisite_concepts: extras.prerequisite_concepts,
    related_concepts: extras.related_concepts,
    used_in_other_trees: extras.used_in_other_trees,
  };
}

function documentContextToApi(ctx: DocumentTreeNodeContext): ApiNodeDetailResponse["document_context"] {
  return {
    document_id: ctx.document_id,
    document_title: ctx.document_title,
    document_concept_id: ctx.document_concept_id,
    concept_type: ctx.concept_type,
    source_type: ctx.source_type,
    evidence_count: ctx.evidence_count,
    evidence: ctx.evidence,
  };
}

function formatDocumentEvidenceForPrompt(ctx: DocumentTreeNodeContext): string {
  if (ctx.evidence.length === 0) {
    return ctx.source_type === "inferred"
      ? "문서에 직접 등장한 문단은 없습니다. 이 개념은 문서를 이해하기 위해 추론된 선수지식입니다."
      : "문서에 직접 연결된 문단 정보가 없습니다.";
  }

  return ctx.evidence
    .map((e, index) => {
      const page =
        e.page_start == null
          ? "page unknown"
          : e.page_end != null && e.page_end !== e.page_start
            ? `p.${e.page_start}-${e.page_end}`
            : `p.${e.page_start}`;
      const section = e.section_title ? `${e.section_title}, ` : "";
      return `${index + 1}. ${section}${page}\n${e.snippet}`;
    })
    .join("\n\n");
}

function responseFromStoredConcept(
  dbId: string,
  nodeKey: string,
  nodeRow: LearningNodeRow,
  c: ConceptRow,
  bundle: LearningTreeBundle,
  treeId: string,
  qualityWarnings: string[] = [],
): ApiNodeDetailResponse {
  const topic = bundle.tree.topic;
  const tline = topicContextLine(topic, nodeRow.title);
  const graph = buildPanelGraph(c.id, treeId);
  return {
    node_id: dbId,
    node_key: nodeKey,
    title: nodeRow.title,
    type: nodeRow.type,
    why_it_matters: tline,
    easy_explanation:
      (c.explanation?.trim() || c.shortDescription?.trim() || "").trim() ||
      "저장된 설명이 아직 없습니다.",
    analogy: "",
    example: c.examples[0] ?? "",
    common_misconceptions: c.commonMisconceptions,
    check_questions: [],
    next_nodes: nodeRow.children,
    quality_warnings: qualityWarnings,
    concept_id: c.id,
    topic_context_line: tline,
    from_concept_store: true,
    ...graph,
  };
}

function responseFromStoredConceptFallback(
  dbId: string,
  nodeKey: string,
  nodeRow: LearningNodeRow,
  bundle: LearningTreeBundle,
  treeId: string,
): ApiNodeDetailResponse | null {
  if (!nodeRow.conceptId) return null;
  const c = getConceptById(getDb(), nodeRow.conceptId);
  if (!c || !(c.explanation?.trim() || c.shortDescription?.trim())) return null;
  return responseFromStoredConcept(
    dbId,
    nodeKey,
    nodeRow,
    c,
    bundle,
    treeId,
    ["LLM_DETAIL_GENERATION_FELL_BACK_TO_CONCEPT_STORE"],
  );
}

export async function getOrCreateNodeDetail(params: {
  treeId: string;
  nodeId: string;
  bundle: LearningTreeBundle;
  generateGenericNodeDetail?: GenericNodeDetailGenerator;
  generateDocumentDetail?: DocumentNodeDetailGenerator;
}): Promise<ApiNodeDetailResponse> {
  const { treeId, nodeId, bundle } = params;
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NODE_NOT_IN_TREE");
  }

  const documentTreeContext = getDocumentTreeContextForUser(
    treeId,
    DEFAULT_USER_ID,
  );
  const documentNodeContext = findDocumentContextForNode(
    documentTreeContext,
    nodeRow.title,
    nodeRow.conceptId,
  );

  const extrasBase = (): Partial<ApiNodeDetailResponse> => {
    const conceptId = nodeRow.conceptId ?? documentNodeContext?.concept_id ?? null;
    const documentExtras: Partial<ApiNodeDetailResponse> =
      documentNodeContext ?
        {
          document_context: documentContextToApi(documentNodeContext),
          topic_context_line:
            documentNodeContext.source_type === "inferred"
              ? `「${nodeRow.title}」는 「${documentNodeContext.document_title}」를 이해하기 위해 추론된 선수지식입니다.`
              : `「${nodeRow.title}」는 「${documentNodeContext.document_title}」에서 확인된 문서 기반 개념입니다.`,
        }
      : {};
    if (!conceptId) return { concept_id: null, ...documentExtras };
    const graph = buildPanelGraph(conceptId, treeId);
    return {
      concept_id: conceptId,
      topic_context_line:
        documentExtras.topic_context_line ??
        topicContextLine(bundle.tree.topic, nodeRow.title),
      prerequisite_concepts: graph.prerequisite_concepts,
      related_concepts: graph.related_concepts,
      used_in_other_trees: graph.used_in_other_trees,
      ...documentExtras,
    };
  };

  if (nodeRow.detailJson) {
    return toApiBody(
      nodeId,
      nodeRow.nodeKey,
      nodeRow.detailJson,
      [],
      extrasBase(),
    );
  }

  if (documentNodeContext) {
    try {
      const generateDocumentDetail =
        params.generateDocumentDetail ?? generateDocumentNodeDetail;
      const { detail, qualityWarnings } = await generateDocumentDetail({
        documentTitle: documentNodeContext.document_title,
        nodeId: nodeRow.nodeKey,
        conceptTitle: nodeRow.title,
        sourceType: documentNodeContext.source_type,
        evidenceText: formatDocumentEvidenceForPrompt(documentNodeContext),
        prerequisites: nodeRow.prerequisites.join(", ") || "없음",
        requestId: `doc-node-${treeId}-${nodeRow.nodeKey}`,
      });
      const genericDetail: NodeDetailResponse = {
        node_id: nodeRow.nodeKey,
        title: detail.title,
        type: nodeRow.type,
        why_it_matters: detail.why_it_matters_for_document,
        easy_explanation: detail.easy_explanation,
        analogy: detail.document_context_summary,
        example: detail.example,
        common_misconceptions: detail.common_misconceptions,
        check_questions: detail.check_questions,
        next_nodes: detail.next_nodes,
      };
      const saved = saveNodeDetail(nodeId, genericDetail);
      if (!saved) {
        throw new Error("DETAIL_SAVE_FAILED");
      }
      return toApiBody(nodeId, nodeRow.nodeKey, genericDetail, qualityWarnings, {
        ...extrasBase(),
        from_concept_store: false,
        why_it_matters_for_document: detail.why_it_matters_for_document,
        document_context_summary: detail.document_context_summary,
      });
    } catch (err) {
      const fallback = responseFromStoredConceptFallback(
        nodeId,
        nodeRow.nodeKey,
        nodeRow,
        bundle,
        treeId,
      );
      if (fallback) return fallback;
      throw err;
    }
  }

  const prereqContext = buildPrerequisitePromptContext(
    nodeRow,
    bundle.nodes,
    bundle.tree.treeJson.recommended_order,
  );

  const llmInput: GenerateNodeDetailInput = {
    topic: bundle.tree.topic,
    nodeId: nodeRow.nodeKey,
    nodeTitle: nodeRow.title,
    nodeType: nodeRow.type,
    prerequisitesContext: prereqContext,
  };

  try {
    const generateGenericNodeDetail =
      params.generateGenericNodeDetail ?? generateNodeDetail;
    const { detail, qualityWarnings } = await generateGenericNodeDetail(llmInput);
    const saved = saveNodeDetail(nodeId, detail);
    if (!saved) {
      throw new Error("DETAIL_SAVE_FAILED");
    }

    return toApiBody(nodeId, nodeRow.nodeKey, detail, qualityWarnings, {
      ...extrasBase(),
      from_concept_store: false,
    });
  } catch (err) {
    const fallback = responseFromStoredConceptFallback(
      nodeId,
      nodeRow.nodeKey,
      nodeRow,
      bundle,
      treeId,
    );
    if (fallback) return fallback;
    throw err;
  }
}

export async function getOrCreateNodeDetailForRequest(
  treeId: string,
  nodeId: string,
): Promise<ApiNodeDetailResponse> {
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    throw new Error("NOT_FOUND");
  }
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NOT_FOUND");
  }
  return getOrCreateNodeDetail({ treeId, nodeId, bundle });
}
