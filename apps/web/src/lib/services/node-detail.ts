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
import { LlmValidationError } from "@/lib/llm/errors";
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
import {
  getConceptById,
  getConceptsByIds,
  listEdgesForConcept,
  listTreesUsingConcept,
  type ConceptRow,
} from "@/lib/repository/concept-repository";
import { buildPrerequisitePromptContext } from "@/lib/services/node-detail-context";
import type { NodeDetailResponse, NodeType } from "@/types/learning";
import { resolveLlmProviderConfig } from "@/lib/llm/provider-config";
import {
  DEFAULT_VISUAL_DECISION,
  hasRequiredNodeDetailVisual,
  normalizeVisualBlocks,
  normalizeVisualDecision,
  type VisualBlock,
  type VisualDecision,
} from "@/lib/visualization/visual-block-schema";
import type { ResolvedLlmProviderConfig } from "@/lib/llm/provider-config";

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
  /** Phase 14: 노드 학습 목표(허용 동사 접두). 없을 수 있다(기존 데이터·Concept fast path). */
  learning_objective?: string;
  /** Phase 14: 숙달 증거 목록. 없을 수 있다(기존 데이터·Concept fast path). */
  mastery_evidence?: string[];
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: NodeDetailResponse["check_questions"];
  /** Phase 14: 개념 문항(있으면 그대로 전달). 없을 수 있다(기존 데이터·Concept fast path). */
  concept_questions?: NodeDetailResponse["concept_questions"];
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
    // Phase 14: 저장된 detailJson에 들어 있으면 그대로 응답에 실어 보낸다(없으면 undefined).
    learning_objective: d.learning_objective,
    mastery_evidence: d.mastery_evidence,
    why_it_matters: d.why_it_matters,
    easy_explanation: d.easy_explanation,
    analogy: d.analogy,
    example: d.example,
    common_misconceptions: d.common_misconceptions,
    check_questions: d.check_questions,
    concept_questions: d.concept_questions,
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

// Error.cause를 안전하게 꺼낸다. (Error 타입이 아니거나 cause가 없으면 undefined)
function getErrorCause(err: unknown): unknown {
  return err instanceof Error && "cause" in err
    ? (err as Error & { cause?: unknown }).cause
    : undefined;
}

// visual 실패 원인의 대부분은 LlmValidationError.issues(zod 스키마 위반 목록)에 들어 있다.
// best-effort visual 경로는 사용자 응답에 원인을 노출하지 않으므로, 서버 로그에서
// "왜 visual이 안 붙었는지"를 바로 확인할 수 있도록 issue의 경로/메시지를 추출한다.
// generateNodeDetailVisual은 LlmValidationError를 LlmExhaustedRetriesError(cause)로
// 감싸 던지므로 최상위 에러와 cause 양쪽을 모두 확인한다. 로그 한 줄이 과도하게
// 길어지지 않도록 최대 8개 issue만 남긴다.
function visualValidationIssues(err: unknown): string[] | undefined {
  const cause = getErrorCause(err);
  const validation =
    err instanceof LlmValidationError
      ? err
      : cause instanceof LlmValidationError
        ? cause
        : null;

  return validation?.issues?.slice(0, 8).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
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
  userId: string;
  providerConfig: ResolvedLlmProviderConfig;
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
  const { treeId, nodeId, userId, providerConfig, bundle } = params;
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
    () => loadDocumentTreeContext(treeId, userId),
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
        providerConfig,
        generateVisual: params.generateVisualDetail,
      }),
    );
  };

  // 동기 클릭 경로에서 visual을 "응답 차단 조건"이 아니라 "보강 단계"로 다룬다.
  // 텍스트 detail은 그 자체로 사용자에게 가치가 있으므로 text readiness와 visual
  // readiness를 분리한다. (async prewarm/worker 경로는 여전히 visual 포함만 ready로 본다.)
  const VISUAL_PENDING = "VISUAL_PENDING";

  // visual 생성/저장 실패의 구체 원인은 사용자 응답에 노출하지 않고 서버 로그에만 남긴다.
  // validationIssues에 zod 스키마 위반(예: mapping_table row 길이 불일치, skill≠block.type)이
  // 그대로 찍히므로, "visual이 거의 안 붙는" 실제 원인을 로그만 보고 진단할 수 있다.
  const logVisualPending = (err: unknown): void => {
    const cause = getErrorCause(err);
    console.warn("[node-detail-service]", {
      source: "visual_pending",
      treeId,
      nodeId,
      nodeKey: nodeRow.nodeKey,
      conceptId: detailConceptId,
      reason: VISUAL_PENDING,
      errorClass: err instanceof Error ? err.name : "UnknownError",
      errorMessage: err instanceof Error ? err.message : String(err),
      causeClass: cause instanceof Error ? cause.name : undefined,
      causeMessage: cause instanceof Error ? cause.message : undefined,
      validationIssues: visualValidationIssues(err),
    });
  };

  // 텍스트가 이미 저장된 상태에서 visual만 best-effort로 보강한다.
  // best-effort catch 범위는 visual 단계(생성 + visual 전용 저장)로만 한정한다.
  // - visual 생성 실패: 텍스트만 유지하고 VISUAL_PENDING
  // - visual 생성 성공 but visual 저장 실패: 텍스트만 유지하고 VISUAL_PENDING(+로그)
  const augmentVisualBestEffort = async (
    textDetail: NodeDetailResponse,
    baseWarnings: string[],
  ): Promise<{ detail: NodeDetailResponse; warnings: string[] }> => {
    if (!requireVisualDetail) {
      return { detail: textDetail, warnings: baseWarnings };
    }
    try {
      const detailWithVisual = await ensureVisualIfRequired(textDetail);
      const visualSaved = await withDetailDuration(
        "save_detail",
        logContext,
        () => persistNodeDetail(nodeId, detailWithVisual),
      );
      if (!visualSaved) {
        throw new Error("DETAIL_VISUAL_SAVE_FAILED");
      }
      return { detail: detailWithVisual, warnings: baseWarnings };
    } catch (err) {
      logVisualPending(err);
      return { detail: textDetail, warnings: [...baseWarnings, VISUAL_PENDING] };
    }
  };

  // 새로 생성한 텍스트 detail은 먼저 저장한 뒤 visual을 보강한다.
  // 텍스트 저장 실패는 진짜 에러로 던진다(텍스트 생성/권한/트리 오류도 이 함수 밖에서 그대로 전파).
  const persistFreshDetailThenAugment = async (
    textDetail: NodeDetailResponse,
    baseWarnings: string[],
  ): Promise<{ detail: NodeDetailResponse; warnings: string[] }> => {
    const textSaved = await withDetailDuration(
      "save_detail",
      logContext,
      () => persistNodeDetail(nodeId, textDetail),
    );
    if (!textSaved) {
      throw new Error("DETAIL_SAVE_FAILED");
    }
    return augmentVisualBestEffort(textDetail, baseWarnings);
  };

  const hasCachedDetail = await withDetailDuration(
    "cache_check",
    logContext,
    async () => Boolean(nodeRow.detailJson),
  );

  if (hasCachedDetail && (!requireVisualDetail || hasRequestReadyTextDetail(nodeRow.detailJson!))) {
    const cachedText = nodeRow.detailJson!;
    // 텍스트는 이미 캐시되어 있다. visual만 없으면 best-effort로 보강하고,
    // 실패해도 캐시된 텍스트를 그대로 응답한다(동기 클릭 경로 완화).
    const cached =
      requireVisualDetail && !hasRequiredNodeDetailVisual(cachedText)
        ? await augmentVisualBestEffort(cachedText, [])
        : { detail: cachedText, warnings: [] as string[] };
    return withDetailDuration(
      "cache_hit",
      logContext,
      async () => toApiBody(
        nodeId,
        nodeRow.nodeKey,
        cached.detail,
        cached.warnings,
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
          providerConfig,
        }),
      );
      const genericDetail: NodeDetailResponse = {
        node_id: nodeRow.nodeKey,
        title: detail.title,
        type: nodeRow.type,
        // Phase 14: 문서 노드 상세의 학습 계약 필드를 generic 상세에도 보존한다.
        learning_objective: detail.learning_objective,
        mastery_evidence: detail.mastery_evidence,
        why_it_matters: detail.why_it_matters_for_document,
        easy_explanation: detail.easy_explanation,
        analogy: detail.document_context_summary,
        example: detail.example,
        common_misconceptions: detail.common_misconceptions,
        check_questions: detail.check_questions,
        concept_questions: detail.concept_questions,
        next_nodes: detail.next_nodes,
        visual_decision: detail.visual_decision,
        visual_blocks: detail.visual_blocks ?? [],
      };
      const finalized = await persistFreshDetailThenAugment(
        genericDetail,
        qualityWarnings,
      );
      return toApiBody(nodeId, nodeRow.nodeKey, finalized.detail, finalized.warnings, {
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
    providerConfig,
  };

  try {
    const generateGenericNodeDetail =
      params.generateGenericNodeDetail ?? generateNodeDetail;
    const { detail, qualityWarnings } = await withDetailDuration(
      "generic_llm_generation",
      logContext,
      () => generateGenericNodeDetail(llmInput),
    );
    const finalized = await persistFreshDetailThenAugment(detail, qualityWarnings);

    return toApiBody(nodeId, nodeRow.nodeKey, finalized.detail, finalized.warnings, {
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
  userId: string;
  bundle: LearningTreeBundle;
  loadDocumentTreeContext?: LoadDocumentTreeContext;
  loadConcept?: LoadConcept;
}): Promise<ReadyNodeDetailLookupResult> {
  const { treeId, nodeId, userId, bundle } = params;
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
    () => loadDocumentTreeContext(treeId, userId),
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
  userId: string;
  bundle: LearningTreeBundle;
  loadDocumentTreeContext?: LoadDocumentTreeContext;
  loadPanelGraph?: LoadPanelGraph;
}): Promise<ApiNodeDetailExtrasResponse> {
  const { treeId, nodeId, userId, bundle } = params;
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
    () => loadDocumentTreeContext(treeId, userId),
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
  userId: string,
): Promise<ApiNodeDetailResponse> {
  const requestLogContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: null,
    conceptId: null,
  };
  const providerConfig = await resolveLlmProviderConfig(userId);
  const bundle = await withDetailDuration("tree_load", requestLogContext, () =>
    getLearningTree(treeId, userId),
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
      userId,
      providerConfig,
      bundle,
      requireVisualDetail: true,
    }),
  );
}

export async function getReadyNodeDetailForRequest(
  treeId: string,
  nodeId: string,
  userId: string,
): Promise<ReadyNodeDetailLookupResult> {
  const requestLogContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: null,
    conceptId: null,
  };
  const bundle = await withDetailDuration("tree_load", requestLogContext, () =>
    getLearningTree(treeId, userId),
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
    () => getReadyNodeDetail({ treeId, nodeId, userId, bundle }),
  );
}

export async function getNodeDetailExtrasForRequest(
  treeId: string,
  nodeId: string,
  userId: string,
): Promise<ApiNodeDetailExtrasResponse> {
  const requestLogContext: DetailLogContext = {
    treeId,
    nodeId,
    nodeKey: null,
    conceptId: null,
  };
  const bundle = await withDetailDuration("tree_load", requestLogContext, () =>
    getLearningTree(treeId, userId),
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
    () => getNodeDetailExtras({ treeId, nodeId, userId, bundle }),
  );
}
