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
import {
  ensureRequiredNodeDetailVisual,
  type NodeDetailVisualGenerator,
} from "@/lib/llm/generate-node-detail-visual";
import { getDb } from "@/db/client";
import type { LearningTreeBundle, LearningNodeRow } from "@/lib/repository/learning-repository";
import {
  getLearningTree,
  saveNodeDetail,
} from "@/lib/repository/learning-repository";
import {
  findDocumentContextForNode,
  getDocumentTreeContextForUser,
  type DocumentTreeContext,
  type DocumentTreeNodeContext,
} from "@/lib/repository/document-repository";
import { DEFAULT_USER_ID } from "@/db/constants";
import {
  getConceptById,
  getConceptsByIds,
  listEdgesForConcept,
  listTreesUsingConcept,
  type ConceptRow,
} from "@/lib/repository/concept-repository";
import { buildPrerequisitePromptContext } from "@/lib/services/node-detail-context";
import type { NodeDetailResponse, NodeType } from "@/types/learning";
import {
  DEFAULT_VISUAL_DECISION,
  hasRequiredNodeDetailVisual,
  normalizeVisualBlocks,
  normalizeVisualDecision,
  type VisualBlock,
  type VisualDecision,
} from "@/lib/visualization/visual-block-schema";

type GenericNodeDetailGenerator = (
  input: GenerateNodeDetailInput,
) => Promise<GenerateNodeDetailResult>;

type DocumentNodeDetailGenerator = (
  input: GenerateDocumentNodeDetailInput,
) => Promise<GenerateDocumentNodeDetailResult>;

type PanelGraph = {
  prerequisite_concepts: Array<{ id: string; title: string }>;
  related_concepts: Array<{ id: string; title: string }>;
  used_in_other_trees: Array<{
    tree_id: string;
    topic: string;
    role_in_tree: string;
  }>;
};

type LoadDocumentTreeContext = (
  treeId: string,
  userId: string,
) => Promise<DocumentTreeContext | null>;

type LoadConcept = (conceptId: string) => Promise<ConceptRow | null>;

type LoadPanelGraph = (
  conceptId: string,
  treeId: string,
) => Promise<PanelGraph>;

type PersistNodeDetail = (
  nodeId: string,
  detail: NodeDetailResponse,
) => Promise<boolean>;

type DetailLogContext = {
  treeId: string;
  nodeId: string;
  nodeKey: string | null;
  conceptId: string | null;
};

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
  visual_decision: VisualDecision;
  visual_blocks: VisualBlock[];
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

export interface ApiNodeDetailExtrasResponse {
  concept_id: string | null;
  topic_context_line?: string;
  document_context?: ApiNodeDetailResponse["document_context"];
  prerequisite_concepts: PanelGraph["prerequisite_concepts"];
  related_concepts: PanelGraph["related_concepts"];
  used_in_other_trees: PanelGraph["used_in_other_trees"];
}

export type ReadyNodeDetailLookupResult =
  | {
      status: "ready";
      detail: ApiNodeDetailResponse;
    }
  | {
      status: "not_ready";
    };

async function buildPanelGraph(
  conceptId: string,
  treeId: string,
): Promise<PanelGraph> {
  const db = getDb();
  const edges = await listEdgesForConcept(db, conceptId);
  const conceptIds: string[] = [];
  const conceptIdByEdge = new Map<string, string>();

  for (const e of edges) {
    const otherId =
      e.fromConceptId === conceptId ? e.toConceptId : e.fromConceptId;
    conceptIds.push(otherId);
    conceptIdByEdge.set(e.id, otherId);
  }

  const conceptsById = await getConceptsByIds(db, conceptIds);
  const prereq: Array<{ id: string; title: string }> = [];
  const related: Array<{ id: string; title: string }> = [];
  const seenP = new Set<string>();
  const seenR = new Set<string>();
  for (const e of edges) {
    const otherId = conceptIdByEdge.get(e.id);
    const other = otherId ? conceptsById.get(otherId) : null;
    if (!other) continue;

    if (e.relationType === "prerequisite") {
      if (e.toConceptId === conceptId) {
        if (!seenP.has(other.id)) {
          seenP.add(other.id);
          prereq.push({ id: other.id, title: other.title });
        }
      } else if (e.fromConceptId === conceptId) {
        if (!seenR.has(other.id)) {
          seenR.add(other.id);
          related.push({ id: other.id, title: other.title });
        }
      }
    } else {
      if (!seenR.has(other.id)) {
        seenR.add(other.id);
        related.push({ id: other.id, title: other.title });
      }
    }
  }
  const used = (await listTreesUsingConcept(db, conceptId))
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

function logDetailDuration(
  source: string,
  ctx: DetailLogContext,
  startedAt: number,
  extra: Record<string, unknown> = {},
): void {
  console.info("[node-detail-service]", {
    source,
    treeId: ctx.treeId,
    nodeId: ctx.nodeId,
    nodeKey: ctx.nodeKey,
    conceptId: ctx.conceptId,
    durationMs: Date.now() - startedAt,
    ...extra,
  });
}

async function withDetailDuration<T>(
  source: string,
  ctx: DetailLogContext,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    logDetailDuration(source, ctx, startedAt);
    return result;
  } catch (err) {
    logDetailDuration(source, ctx, startedAt, {
      ok: false,
      errorClass: err instanceof Error ? err.name : "UnknownError",
    });
    throw err;
  }
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
    visual_decision: normalizeVisualDecision(d.visual_decision),
    visual_blocks: normalizeVisualBlocks(d.visual_blocks),
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

function documentContextExtras(
  nodeRow: LearningNodeRow,
  documentNodeContext: DocumentTreeNodeContext | null,
): Partial<Pick<ApiNodeDetailResponse, "document_context" | "topic_context_line">> {
  if (!documentNodeContext) return {};
  return {
    document_context: documentContextToApi(documentNodeContext),
    topic_context_line:
      documentNodeContext.source_type === "inferred"
        ? `「${nodeRow.title}」는 「${documentNodeContext.document_title}」를 이해하기 위해 추론된 선수지식입니다.`
        : `「${nodeRow.title}」는 「${documentNodeContext.document_title}」에서 확인된 문서 기반 개념입니다.`,
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

function hasUsableConceptExplanation(c: ConceptRow): boolean {
  return (c.explanation?.trim().length ?? 0) >= 80;
}

function hasRequestReadyTextDetail(detail: NodeDetailResponse): boolean {
  return Boolean(
    detail.why_it_matters.trim() &&
      detail.easy_explanation.trim() &&
      detail.example.trim() &&
      detail.common_misconceptions.length > 0 &&
      detail.check_questions.length > 0,
  );
}

async function responseFromStoredConcept(
  dbId: string,
  nodeKey: string,
  nodeRow: LearningNodeRow,
  c: ConceptRow,
  bundle: LearningTreeBundle,
  qualityWarnings: string[] = [],
  extras: Partial<
    Pick<ApiNodeDetailResponse, "document_context" | "topic_context_line">
  > = {},
): Promise<ApiNodeDetailResponse> {
  const topic = bundle.tree.topic;
  const tline = extras.topic_context_line ?? topicContextLine(topic, nodeRow.title);
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
    visual_decision: DEFAULT_VISUAL_DECISION,
    visual_blocks: [],
    quality_warnings: qualityWarnings,
    concept_id: c.id,
    topic_context_line: tline,
    from_concept_store: true,
    ...extras,
  };
}

async function responseFromStoredConceptFallback(
  dbId: string,
  nodeKey: string,
  nodeRow: LearningNodeRow,
  bundle: LearningTreeBundle,
  conceptId: string | null,
  loadConcept: LoadConcept,
  extras: Partial<
    Pick<ApiNodeDetailResponse, "document_context" | "topic_context_line">
  > = {},
): Promise<ApiNodeDetailResponse | null> {
  if (!conceptId) return null;
  const c = await loadConcept(conceptId);
  // LLM 실패를 Concept Store의 짧은 placeholder로 가리면 사용자가 상세 지식이 생성됐다고 오해한다.
  if (!c || !hasUsableConceptExplanation(c)) return null;
  return responseFromStoredConcept(
    dbId,
    nodeKey,
    nodeRow,
    c,
    bundle,
    ["LLM_DETAIL_GENERATION_FELL_BACK_TO_CONCEPT_STORE"],
    extras,
  );
}

export async function getOrCreateNodeDetail(params: {
  treeId: string;
  nodeId: string;
  bundle: LearningTreeBundle;
  generateGenericNodeDetail?: GenericNodeDetailGenerator;
  generateDocumentDetail?: DocumentNodeDetailGenerator;
  generateVisualDetail?: NodeDetailVisualGenerator;
  requireVisualDetail?: boolean;
  loadDocumentTreeContext?: LoadDocumentTreeContext;
  loadConcept?: LoadConcept;
  loadPanelGraph?: LoadPanelGraph;
  persistNodeDetail?: PersistNodeDetail;
}): Promise<ApiNodeDetailResponse> {
  const { treeId, nodeId, bundle } = params;
  const loadDocumentTreeContext =
    params.loadDocumentTreeContext ?? getDocumentTreeContextForUser;
  const loadConcept =
    params.loadConcept ?? ((conceptId) => getConceptById(getDb(), conceptId));
  const persistNodeDetail = params.persistNodeDetail ?? saveNodeDetail;
  const requireVisualDetail = params.requireVisualDetail ?? false;
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NODE_NOT_IN_TREE");
  }

  const documentTreeContext = await withDetailDuration(
    "document_context",
    {
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: nodeRow.conceptId,
    },
    () => loadDocumentTreeContext(treeId, DEFAULT_USER_ID),
  );
  const documentNodeContext = findDocumentContextForNode(
    documentTreeContext,
    nodeRow.title,
    nodeRow.conceptId,
  );
  const documentExtras = documentContextExtras(nodeRow, documentNodeContext);
  const detailConceptId = nodeRow.conceptId ?? documentNodeContext?.concept_id ?? null;
  const logContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: nodeRow.nodeKey,
    conceptId: detailConceptId,
  };
  const extrasBase = (): Partial<ApiNodeDetailResponse> => {
    const conceptId = detailConceptId;
    if (!conceptId) return { concept_id: null, ...documentExtras };
    return {
      concept_id: conceptId,
      topic_context_line:
        documentExtras.topic_context_line ??
        topicContextLine(bundle.tree.topic, nodeRow.title),
      ...documentExtras,
    };
  };
  const prereqContext = buildPrerequisitePromptContext(
    nodeRow,
    bundle.nodes,
    bundle.tree.treeJson.recommended_order,
  );
  const ensureVisualIfRequired = (detail: NodeDetailResponse) => {
    if (!requireVisualDetail) return Promise.resolve(detail);
    return withDetailDuration(
      "visual_llm_generation",
      logContext,
      () => ensureRequiredNodeDetailVisual({
        topic: bundle.tree.topic,
        nodeTitle: nodeRow.title,
        nodeType: nodeRow.type,
        prerequisitesContext: prereqContext,
        detail,
        generateVisual: params.generateVisualDetail,
      }),
    );
  };

  const hasCachedDetail = await withDetailDuration(
    "cache_check",
    logContext,
    async () => Boolean(nodeRow.detailJson),
  );

  if (hasCachedDetail && (!requireVisualDetail || hasRequestReadyTextDetail(nodeRow.detailJson!))) {
    let cachedDetail = nodeRow.detailJson!;
    if (requireVisualDetail && !hasRequiredNodeDetailVisual(cachedDetail)) {
      cachedDetail = await ensureVisualIfRequired(cachedDetail);
      const saved = await withDetailDuration(
        "save_detail",
        logContext,
        () => persistNodeDetail(nodeId, cachedDetail),
      );
      if (!saved) {
        throw new Error("DETAIL_SAVE_FAILED");
      }
    }
    return withDetailDuration(
      "cache_hit",
      logContext,
      async () => toApiBody(
        nodeId,
        nodeRow.nodeKey,
        cachedDetail,
        [],
        extrasBase(),
      ),
    );
  }

  if (hasCachedDetail && requireVisualDetail) {
    await withDetailDuration(
      "cache_text_incomplete",
      logContext,
      async () => null,
    );
  }

  const concept = detailConceptId ? await loadConcept(detailConceptId) : null;
  if (!requireVisualDetail && concept && hasUsableConceptExplanation(concept)) {
    return withDetailDuration(
      "concept_fast_path",
      logContext,
      () => responseFromStoredConcept(
        nodeId,
        nodeRow.nodeKey,
        nodeRow,
        concept,
        bundle,
        [],
        documentExtras,
      ),
    );
  }

  if (documentNodeContext) {
    try {
      const generateDocumentDetail =
        params.generateDocumentDetail ?? generateDocumentNodeDetail;
      const { detail, qualityWarnings } = await withDetailDuration(
        "document_llm_generation",
        logContext,
        () => generateDocumentDetail({
          documentTitle: documentNodeContext.document_title,
          nodeId: nodeRow.nodeKey,
          conceptTitle: nodeRow.title,
          sourceType: documentNodeContext.source_type,
          evidenceText: formatDocumentEvidenceForPrompt(documentNodeContext),
          prerequisites: nodeRow.prerequisites.join(", ") || "없음",
          requestId: `doc-node-${treeId}-${nodeRow.nodeKey}`,
        }),
      );
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
        visual_decision: detail.visual_decision,
        visual_blocks: detail.visual_blocks ?? [],
      };
      const detailToSave = await ensureVisualIfRequired(genericDetail);
      const saved = await withDetailDuration(
        "save_detail",
        logContext,
        () => persistNodeDetail(nodeId, detailToSave),
      );
      if (!saved) {
        throw new Error("DETAIL_SAVE_FAILED");
      }
      return toApiBody(nodeId, nodeRow.nodeKey, detailToSave, qualityWarnings, {
        ...extrasBase(),
        from_concept_store: false,
        why_it_matters_for_document: detail.why_it_matters_for_document,
        document_context_summary: detail.document_context_summary,
      });
    } catch (err) {
      if (requireVisualDetail) throw err;
      const fallback = await responseFromStoredConceptFallback(
        nodeId,
        nodeRow.nodeKey,
        nodeRow,
        bundle,
        detailConceptId,
        loadConcept,
        documentExtras,
      );
      if (fallback) return fallback;
      throw err;
    }
  }

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
    const { detail, qualityWarnings } = await withDetailDuration(
      "generic_llm_generation",
      logContext,
      () => generateGenericNodeDetail(llmInput),
    );
    const detailToSave = await ensureVisualIfRequired(detail);
    const saved = await withDetailDuration(
      "save_detail",
      logContext,
      () => persistNodeDetail(nodeId, detailToSave),
    );
    if (!saved) {
      throw new Error("DETAIL_SAVE_FAILED");
    }

    return toApiBody(nodeId, nodeRow.nodeKey, detailToSave, qualityWarnings, {
      ...extrasBase(),
      from_concept_store: false,
    });
  } catch (err) {
    if (requireVisualDetail) throw err;
    const fallback = await responseFromStoredConceptFallback(
      nodeId,
      nodeRow.nodeKey,
      nodeRow,
      bundle,
      detailConceptId,
      loadConcept,
      documentExtras,
    );
    if (fallback) return fallback;
    throw err;
  }
}

export async function getReadyNodeDetail(params: {
  treeId: string;
  nodeId: string;
  bundle: LearningTreeBundle;
  loadDocumentTreeContext?: LoadDocumentTreeContext;
  loadConcept?: LoadConcept;
}): Promise<ReadyNodeDetailLookupResult> {
  const { treeId, nodeId, bundle } = params;
  const loadDocumentTreeContext =
    params.loadDocumentTreeContext ?? getDocumentTreeContextForUser;
  const loadConcept =
    params.loadConcept ?? ((conceptId) => getConceptById(getDb(), conceptId));
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NODE_NOT_IN_TREE");
  }

  const documentTreeContext = await withDetailDuration(
    "document_context",
    {
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: nodeRow.conceptId,
    },
    () => loadDocumentTreeContext(treeId, DEFAULT_USER_ID),
  );
  const documentNodeContext = findDocumentContextForNode(
    documentTreeContext,
    nodeRow.title,
    nodeRow.conceptId,
  );
  const documentExtras = documentContextExtras(nodeRow, documentNodeContext);
  const detailConceptId = nodeRow.conceptId ?? documentNodeContext?.concept_id ?? null;
  const logContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: nodeRow.nodeKey,
    conceptId: detailConceptId,
  };
  const extrasBase = (): Partial<ApiNodeDetailResponse> => {
    const conceptId = detailConceptId;
    if (!conceptId) return { concept_id: null, ...documentExtras };
    return {
      concept_id: conceptId,
      topic_context_line:
        documentExtras.topic_context_line ??
        topicContextLine(bundle.tree.topic, nodeRow.title),
      ...documentExtras,
    };
  };

  const hasCachedDetail = await withDetailDuration(
    "cache_check",
    logContext,
    async () => Boolean(nodeRow.detailJson),
  );
  if (hasCachedDetail) {
    if (!hasRequiredNodeDetailVisual(nodeRow.detailJson!)) {
      await withDetailDuration(
        "cache_missing_required_visual",
        logContext,
        async () => null,
      );
      return { status: "not_ready" };
    }
    return {
      status: "ready",
      detail: await withDetailDuration(
        "cache_hit",
        logContext,
        async () => toApiBody(
          nodeId,
          nodeRow.nodeKey,
          nodeRow.detailJson!,
          [],
          extrasBase(),
        ),
      ),
    };
  }

  const concept = detailConceptId ? await loadConcept(detailConceptId) : null;
  if (concept && hasUsableConceptExplanation(concept)) {
    await withDetailDuration(
      "concept_fast_path_missing_required_visual",
      logContext,
      async () => null,
    );
    return { status: "not_ready" };
  }

  return { status: "not_ready" };
}

export async function getNodeDetailExtras(params: {
  treeId: string;
  nodeId: string;
  bundle: LearningTreeBundle;
  loadDocumentTreeContext?: LoadDocumentTreeContext;
  loadPanelGraph?: LoadPanelGraph;
}): Promise<ApiNodeDetailExtrasResponse> {
  const { treeId, nodeId, bundle } = params;
  const loadDocumentTreeContext =
    params.loadDocumentTreeContext ?? getDocumentTreeContextForUser;
  const loadPanelGraph = params.loadPanelGraph ?? buildPanelGraph;
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NODE_NOT_IN_TREE");
  }

  const documentTreeContext = await withDetailDuration(
    "document_context",
    {
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: nodeRow.conceptId,
    },
    () => loadDocumentTreeContext(treeId, DEFAULT_USER_ID),
  );
  const documentNodeContext = findDocumentContextForNode(
    documentTreeContext,
    nodeRow.title,
    nodeRow.conceptId,
  );
  const documentExtras = documentContextExtras(nodeRow, documentNodeContext);
  const conceptId = nodeRow.conceptId ?? documentNodeContext?.concept_id ?? null;
  const logContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: nodeRow.nodeKey,
    conceptId,
  };
  const emptyGraph: PanelGraph = {
    prerequisite_concepts: [],
    related_concepts: [],
    used_in_other_trees: [],
  };

  // 본문 detail 응답에서는 제외한 무거운 오른쪽 패널 그래프만 이 별도 경로에서 만든다.
  const graph = conceptId
    ? await withDetailDuration("panel_graph", logContext, () =>
        loadPanelGraph(conceptId, treeId),
      )
    : emptyGraph;

  return {
    concept_id: conceptId,
    topic_context_line:
      conceptId
        ? documentExtras.topic_context_line ??
          topicContextLine(bundle.tree.topic, nodeRow.title)
        : documentExtras.topic_context_line,
    document_context: documentExtras.document_context,
    prerequisite_concepts: graph.prerequisite_concepts,
    related_concepts: graph.related_concepts,
    used_in_other_trees: graph.used_in_other_trees,
  };
}

export async function getOrCreateNodeDetailForRequest(
  treeId: string,
  nodeId: string,
): Promise<ApiNodeDetailResponse> {
  const requestLogContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: null,
    conceptId: null,
  };
  const bundle = await withDetailDuration("tree_load", requestLogContext, () =>
    getLearningTree(treeId, DEFAULT_USER_ID),
  );
  if (!bundle) {
    throw new Error("NOT_FOUND");
  }
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NOT_FOUND");
  }
  return withDetailDuration(
    "detail_total",
    {
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: nodeRow.conceptId,
    },
    () => getOrCreateNodeDetail({
      treeId,
      nodeId,
      bundle,
      requireVisualDetail: true,
    }),
  );
}

export async function getReadyNodeDetailForRequest(
  treeId: string,
  nodeId: string,
): Promise<ReadyNodeDetailLookupResult> {
  const requestLogContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: null,
    conceptId: null,
  };
  const bundle = await withDetailDuration("tree_load", requestLogContext, () =>
    getLearningTree(treeId, DEFAULT_USER_ID),
  );
  if (!bundle) {
    throw new Error("NOT_FOUND");
  }
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NOT_FOUND");
  }
  return withDetailDuration(
    "detail_total",
    {
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: nodeRow.conceptId,
    },
    () => getReadyNodeDetail({ treeId, nodeId, bundle }),
  );
}

export async function getNodeDetailExtrasForRequest(
  treeId: string,
  nodeId: string,
): Promise<ApiNodeDetailExtrasResponse> {
  const requestLogContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: null,
    conceptId: null,
  };
  const bundle = await withDetailDuration("tree_load", requestLogContext, () =>
    getLearningTree(treeId, DEFAULT_USER_ID),
  );
  if (!bundle) {
    throw new Error("NOT_FOUND");
  }
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NOT_FOUND");
  }
  return withDetailDuration(
    "detail_extras_total",
    {
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: nodeRow.conceptId,
    },
    () => getNodeDetailExtras({ treeId, nodeId, bundle }),
  );
}
