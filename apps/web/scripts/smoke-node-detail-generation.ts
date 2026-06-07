/**
 * Node detail generation smoke without external DB or LLM calls.
 *
 * Phase 08 keeps this script in-memory so it verifies service behavior even
 * after the app moved to Postgres-only runtime configuration.
 */
import { DEFAULT_USER_ID } from "../src/db/constants";
import type { ConceptRow } from "../src/lib/repository/concept-repository";
import type {
  DocumentTreeContext,
  DocumentTreeNodeContext,
} from "../src/lib/repository/document-repository";
import type {
  LearningNodeRow,
  LearningTreeBundle,
  LearningTreeRow,
} from "../src/lib/repository/learning-repository";
import { parseNodeDetailResponse } from "../src/lib/llm/parse";
import { NODE_DETAIL_SYSTEM_BASE } from "../src/lib/llm/prompts";
import {
  getNodeDetailExtras,
  getOrCreateNodeDetail,
} from "../src/lib/services/node-detail";
import fs from "node:fs";
import path from "node:path";
import type {
  LearningTreeResponse,
  NodeDetailResponse,
} from "../src/types/learning";
import type { VisualBlock, VisualDecision } from "../src/lib/visualization/visual-block-schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type ServiceLog = {
  source?: unknown;
  durationMs?: unknown;
};

async function captureServiceLogs(
  run: () => Promise<void>,
): Promise<ServiceLog[]> {
  const logs: ServiceLog[] = [];
  const originalInfo = console.info;
  console.info = (message?: unknown, details?: unknown, ...rest: unknown[]) => {
    if (message === "[node-detail-service]" && details && typeof details === "object") {
      logs.push(details as ServiceLog);
      return;
    }
    originalInfo(message, details, ...rest);
  };

  try {
    await run();
  } finally {
    console.info = originalInfo;
  }

  return logs;
}

function assertServiceLog(logs: ServiceLog[], source: string): void {
  const log = logs.find((item) => item.source === source);
  assert(log, `expected ${source} service log`);
  assert(typeof log.durationMs === "number", `${source} log should include durationMs`);
}

function readSource(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

function treeJson(): LearningTreeResponse {
  return {
    topic: "운영체제 스케줄링",
    summary: "CPU 스케줄링 기준을 학습합니다.",
    nodes: [
      {
        id: "cpu_utilization",
        title: "CPU 이용률 (CPU Utilization)",
        type: "prerequisite",
        description: "CPU 사용 효율 지표.",
        difficulty: 2,
        prerequisites: [],
        children: [],
        concept_candidate: {
          canonical_title: "CPU 이용률 (CPU Utilization)",
          aliases: ["CPU Utilization"],
          domain: "operating_system",
          short_description: "CPU 사용 효율 지표.",
          is_reusable: true,
        },
      },
    ],
    recommended_order: ["cpu_utilization"],
    edges: [],
  };
}

function bundle(
  conceptId: string,
  detailJson: NodeDetailResponse | null = null,
): LearningTreeBundle {
  const now = "2026-06-01T00:00:00.000Z";
  const tree: LearningTreeRow = {
    id: "tree-1",
    userId: DEFAULT_USER_ID,
    topic: "운영체제 스케줄링",
    summary: "CPU 스케줄링 기준을 학습합니다.",
    treeJson: treeJson(),
    createdAt: now,
    updatedAt: now,
  };
  const node: LearningNodeRow = {
    id: "node-1",
    treeId: tree.id,
    nodeKey: "cpu_utilization",
    title: "CPU 이용률 (CPU Utilization)",
    type: "prerequisite",
    description: "CPU 사용 효율 지표.",
    difficulty: 2,
    prerequisites: [],
    children: ["scheduling_criteria"],
    detailJson,
    conceptId,
    isReusedConcept: true,
    createdAt: now,
    updatedAt: now,
  };
  return {
    tree,
    nodes: [node],
    progress: [],
    conceptTreeCounts: new Map([[conceptId, 1]]),
  };
}

async function runCacheHitSkipsPanelGraphCase(): Promise<void> {
  let graphLoaded = false;
  const cachedDetail = detail("cpu_utilization");

  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-cached", cachedDetail),
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => {
      throw new Error("cache hit should not load Concept row");
    },
    loadPanelGraph: async () => {
      graphLoaded = true;
      throw new Error("cache hit should not wait for panel graph");
    },
    persistNodeDetail: async () => {
      throw new Error("cache hit should not persist generated detail");
    },
    generateGenericNodeDetail: async () => {
      throw new Error("cache hit should not run full generator");
    },
  });

  assert(!graphLoaded, "cache hit should return detail body before panel graph");
  assert(result.easy_explanation === cachedDetail.easy_explanation, "cache hit should reuse stored detail");
  assert(result.concept_id === "concept-cached", "cache hit should still include the Concept id");
}

function concept(
  id: string,
  explanation: string | null,
  shortDescription = "CPU 사용 효율 지표.",
): ConceptRow {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id,
    slug: id,
    title: "CPU 이용률 (CPU Utilization)",
    normalizedTitle: "cpu 이용률 cpu utilization",
    aliases: ["CPU Utilization"],
    domain: "operating_system",
    shortDescription,
    explanation,
    examples: [],
    commonMisconceptions: [],
    difficulty: 2,
    sourceType: "llm",
    createdAt: now,
    updatedAt: now,
  } as ConceptRow;
}

function detail(nodeId: string): NodeDetailResponse {
  return {
    node_id: nodeId,
    title: "CPU 이용률 (CPU Utilization)",
    type: "prerequisite",
    why_it_matters:
      "CPU 이용률은 스케줄링 알고리즘이 CPU를 얼마나 쉬지 않고 활용하는지 판단하는 핵심 기준입니다.",
    easy_explanation:
      "CPU 이용률은 전체 시간 중 CPU가 실제로 프로세스를 실행한 시간의 비율입니다. 운영체제 스케줄러는 대기 시간, 응답 시간과 함께 이 값을 보며 CPU가 놀지 않도록 작업 순서를 조정합니다.",
    analogy:
      "공장 기계가 하루 중 실제로 제품을 만든 시간의 비율을 보는 것과 비슷합니다.",
    example:
      "10초 중 8초 동안 프로세스를 실행했다면 CPU 이용률은 80%입니다.",
    common_misconceptions: [
      "CPU 이용률이 항상 100%에 가까울수록 좋은 것은 아닙니다.",
    ],
    check_questions: [
      {
        question: "CPU 이용률은 무엇의 비율인가요?",
        answer: "전체 시간 중 CPU가 실제 작업을 수행한 시간의 비율입니다.",
      },
    ],
    next_nodes: ["scheduling_criteria"],
  };
}

function incompleteDetail(nodeId: string): NodeDetailResponse {
  return {
    ...detail(nodeId),
    example: "",
    common_misconceptions: [],
    check_questions: [],
  };
}

function visualDecision(): VisualDecision {
  return {
    should_visualize: true,
    skill: "mapping_table",
    confidence: 0.9,
    reason: "핵심 지표와 의미를 표로 보면 바로 비교할 수 있습니다.",
  };
}

function visualBlock(): VisualBlock {
  return {
    type: "mapping_table",
    title: "CPU 이용률 해석",
    columns: ["항목", "의미"],
    rows: [
      ["실행 시간", "CPU가 실제 작업을 처리한 시간"],
      ["전체 시간", "관찰한 전체 시간 구간"],
    ],
    annotations: ["CPU 이용률은 실행 시간을 전체 시간으로 나눈 비율입니다."],
  };
}

function runLocalizedTypeParsingCase(): void {
  const raw = {
    ...detail("cpu_utilization"),
    type: "선수지식",
  };
  const parsed = parseNodeDetailResponse(
    JSON.stringify(raw),
    "cpu_utilization",
    "prerequisite",
  );

  assert(parsed.type === "prerequisite", "parser should trust the requested node type");
}

async function runShortDescriptionGenerationCase(): Promise<void> {
  let generated = false;
  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-short"),
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => concept("concept-short", null),
    loadPanelGraph: async () => ({
      prerequisite_concepts: [],
      related_concepts: [],
      used_in_other_trees: [],
    }),
    persistNodeDetail: async () => true,
    generateGenericNodeDetail: async () => {
      generated = true;
      return { detail: detail("cpu_utilization"), qualityWarnings: [] };
    },
  });

  assert(generated, "short Concept description should still run full generator");
  assert(result.from_concept_store === false, "short description should not be Concept fast path");
  assert(result.example.length > 0, "generated detail should include example");
  assert(result.check_questions.length > 0, "generated detail should include check questions");
}

async function runDocumentPlaceholderFallbackDoesNotMaskGenerationFailureCase(): Promise<void> {
  let failedAsExpected = false;
  const documentNodeContext: DocumentTreeNodeContext = {
    document_id: "doc-1",
    document_title: "fast26-wang",
    document_concept_id: "document-concept-1",
    concept_id: "concept-doc-placeholder",
    concept_title: "PLog (Persistent Log)",
    concept_type: "document_core",
    source_type: "explicit",
    evidence_count: 1,
    evidence: [
      {
        page_start: 5,
        page_end: 5,
        section_title: null,
        snippet: "3.1 Persistent Log (PLog)",
      },
    ],
  };
  const documentContext: DocumentTreeContext = {
    document_id: "doc-1",
    document_title: "fast26-wang",
    by_concept_id: new Map([["concept-doc-placeholder", documentNodeContext]]),
    by_normalized_title: new Map(),
  };

  try {
    await getOrCreateNodeDetail({
      treeId: "tree-1",
      nodeId: "node-1",
      bundle: bundle("concept-doc-placeholder"),
      loadDocumentTreeContext: async () => documentContext,
      loadConcept: async () =>
        concept(
          "concept-doc-placeholder",
          null,
          "PLog (Persistent Log) 문서 기반 추출 개념",
        ),
      persistNodeDetail: async () => {
        throw new Error("failed document detail should not persist placeholder fallback");
      },
      generateDocumentDetail: async () => {
        throw new Error("document detail generation failed");
      },
      generateGenericNodeDetail: async () => {
        throw new Error("document context should use document generator first");
      },
    });
  } catch (error) {
    failedAsExpected =
      error instanceof Error &&
      error.message === "document detail generation failed";
  }

  assert(
    failedAsExpected,
    "document placeholder Concept fallback should not mask detail generation failure",
  );
}

async function runRequiredVisualRepairForCachedDetailCase(): Promise<void> {
  let generatedVisual = false;
  let persistedDetail: NodeDetailResponse | null = null;

  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-cached", detail("cpu_utilization")),
    requireVisualDetail: true,
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => {
      throw new Error("visual repair for cached full detail should not load Concept row");
    },
    persistNodeDetail: async (_nodeId, nextDetail) => {
      persistedDetail = nextDetail;
      return true;
    },
    generateGenericNodeDetail: async () => {
      throw new Error("cached full detail should only need visual repair");
    },
    generateVisualDetail: async () => {
      generatedVisual = true;
      return {
        visual_decision: visualDecision(),
        visual_blocks: [visualBlock()],
      };
    },
  });

  assert(generatedVisual, "cached detail without visual should run visual generator");
  assert(result.visual_blocks.length === 1, "cached detail response should include required visual block");
  assert(persistedDetail?.visual_blocks?.length === 1, "visual-repaired cached detail should be persisted");
}

async function runRequiredVisualForNewDetailCase(): Promise<void> {
  let generatedText = false;
  let persistedDetail: NodeDetailResponse | null = null;

  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-short"),
    requireVisualDetail: true,
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => concept("concept-short", null),
    persistNodeDetail: async (_nodeId, nextDetail) => {
      persistedDetail = nextDetail;
      return true;
    },
    generateGenericNodeDetail: async () => {
      generatedText = true;
      return { detail: detail("cpu_utilization"), qualityWarnings: [] };
    },
    generateVisualDetail: async () => ({
      visual_decision: visualDecision(),
      visual_blocks: [visualBlock()],
    }),
  });

  assert(generatedText, "required visual path should still generate full text detail");
  assert(result.from_concept_store === false, "required visual path should not use concept fallback");
  assert(result.visual_blocks.length === 1, "new detail response should include required visual block");
  assert(persistedDetail?.visual_blocks?.length === 1, "new required visual detail should persist visual block");
}

async function runRequiredVisualRegeneratesIncompleteCachedDetailCase(): Promise<void> {
  let generatedText = false;

  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-incomplete-cache", incompleteDetail("cpu_utilization")),
    requireVisualDetail: true,
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => concept("concept-incomplete-cache", null),
    persistNodeDetail: async () => true,
    generateGenericNodeDetail: async () => {
      generatedText = true;
      return { detail: detail("cpu_utilization"), qualityWarnings: [] };
    },
    generateVisualDetail: async () => ({
      visual_decision: visualDecision(),
      visual_blocks: [visualBlock()],
    }),
  });

  assert(generatedText, "incomplete cached fallback should regenerate full text detail");
  assert(result.check_questions.length > 0, "regenerated detail should include check questions");
  assert(result.common_misconceptions.length > 0, "regenerated detail should include misconceptions");
  assert(result.visual_blocks.length === 1, "regenerated detail should include required visual block");
}

async function runRequiredVisualFallsBackToTextWhenVisualFailsCase(): Promise<void> {
  // 동기 클릭 경로: visual 생성이 실패해도 텍스트 detail은 저장하고 200으로 응답하며
  // VISUAL_PENDING 경고를 포함해야 한다(visual readiness와 text readiness 분리).
  let textPersisted: NodeDetailResponse | null = null;
  let persistCount = 0;

  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-visual-fail"),
    requireVisualDetail: true,
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => concept("concept-visual-fail", null),
    persistNodeDetail: async (_nodeId, nextDetail) => {
      persistCount += 1;
      textPersisted = nextDetail;
      return true;
    },
    generateGenericNodeDetail: async () => ({
      detail: detail("cpu_utilization"),
      qualityWarnings: [],
    }),
    generateVisualDetail: async () => {
      throw new Error("visual generation failed");
    },
  });

  assert(
    result.visual_blocks.length === 0,
    "visual 생성 실패 시 응답 visual_blocks는 비어 있어야 한다",
  );
  assert(
    result.quality_warnings.includes("VISUAL_PENDING"),
    "visual 생성 실패 시 VISUAL_PENDING 경고를 포함해야 한다",
  );
  assert(
    result.why_it_matters.trim().length > 0 &&
      result.easy_explanation.trim().length > 0 &&
      result.check_questions.length > 0,
    "visual 실패와 무관하게 텍스트 detail은 그대로 응답해야 한다",
  );
  assert(
    textPersisted !== null && persistCount >= 1,
    "visual 실패 시에도 텍스트 detail은 저장되어야 한다",
  );
}

async function runConceptExplanationFastPathCase(): Promise<void> {
  let generated = false;
  const richExplanation =
    "CPU 이용률은 전체 시간 중 CPU가 실제로 프로세스를 실행한 시간의 비율입니다. 스케줄링 정책이 CPU를 놀리지 않고 작업을 배치하는지 판단할 때 쓰는 기본 성능 지표입니다.";

  const result = await getOrCreateNodeDetail({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-rich"),
    loadDocumentTreeContext: async () => null,
    loadConcept: async () => concept("concept-rich", richExplanation),
    loadPanelGraph: async () => ({
      prerequisite_concepts: [],
      related_concepts: [],
      used_in_other_trees: [],
    }),
    persistNodeDetail: async () => {
      throw new Error("Concept fast path should not persist generated detail");
    },
    generateGenericNodeDetail: async () => {
      generated = true;
      return { detail: detail("cpu_utilization"), qualityWarnings: [] };
    },
  });

  assert(!generated, "rich Concept explanation should skip full generator");
  assert(result.from_concept_store === true, "rich Concept explanation should use fast path");
  assert(result.easy_explanation === richExplanation, "fast path should reuse Concept explanation");
  assert(result.visual_blocks.length === 0, "Concept fast path should use empty visual blocks");
}

async function runDetailExtrasCase(): Promise<void> {
  let graphLoaded = false;
  const result = await getNodeDetailExtras({
    treeId: "tree-1",
    nodeId: "node-1",
    bundle: bundle("concept-extra"),
    loadDocumentTreeContext: async () => null,
    loadPanelGraph: async (conceptId, treeId) => {
      graphLoaded = true;
      assert(conceptId === "concept-extra", "extras should load graph for the node Concept");
      assert(treeId === "tree-1", "extras should scope graph to the current tree");
      return {
        prerequisite_concepts: [{ id: "concept-prereq", title: "선수 개념" }],
        related_concepts: [{ id: "concept-related", title: "관련 개념" }],
        used_in_other_trees: [
          { tree_id: "tree-2", topic: "다른 주제", role_in_tree: "core" },
        ],
      };
    },
  });

  assert(graphLoaded, "extras endpoint should load the panel graph");
  assert(result.concept_id === "concept-extra", "extras should include Concept id");
  assert(result.prerequisite_concepts.length === 1, "extras should include prerequisite concepts");
  assert(result.related_concepts.length === 1, "extras should include related concepts");
  assert(result.used_in_other_trees.length === 1, "extras should include other tree usage");
}

async function main(): Promise<void> {
  runLocalizedTypeParsingCase();
  assert(
    NODE_DETAIL_SYSTEM_BASE.includes('"type": "prerequisite" | "core" | "supplementary" | "misconception" | "quiz"'),
    "node detail prompt should document the exact type enum",
  );
  assert(
    NODE_DETAIL_SYSTEM_BASE.includes("Do not translate node_id, type, or next_nodes"),
    "node detail prompt should forbid translating structural fields",
  );

  const logs = await captureServiceLogs(async () => {
    await runCacheHitSkipsPanelGraphCase();
    await runShortDescriptionGenerationCase();
    await runDocumentPlaceholderFallbackDoesNotMaskGenerationFailureCase();
    await runRequiredVisualRepairForCachedDetailCase();
    await runRequiredVisualForNewDetailCase();
    await runRequiredVisualRegeneratesIncompleteCachedDetailCase();
    await runRequiredVisualFallsBackToTextWhenVisualFailsCase();
    await runConceptExplanationFastPathCase();
    await runDetailExtrasCase();
  });

  assertServiceLog(logs, "cache_hit");
  assertServiceLog(logs, "cache_check");
  assertServiceLog(logs, "document_context");
  assertServiceLog(logs, "generic_llm_generation");
  assertServiceLog(logs, "visual_llm_generation");
  assertServiceLog(logs, "save_detail");
  assertServiceLog(logs, "panel_graph");
  assertServiceLog(logs, "concept_fast_path");

  const extrasRouteSource = readSource("src/app/api/nodes/[nodeId]/detail/extras/route.ts");
  const generateNodeDetailSource = readSource("src/lib/llm/generate-node-detail.ts");
  const nodeDetailServiceSource = readSource("src/lib/services/node-detail.ts");
  const treeClientSource = readSource("src/components/tree-page-client.tsx");
  assert(
    generateNodeDetailSource.includes("parseNodeDetailResponse(rawText, input.nodeId, input.nodeType)"),
    "generic node detail generation should parse with the requested node type",
  );
  assert(
    extrasRouteSource.includes("getNodeDetailExtrasForRequest"),
    "detail extras route should call the extras-only service",
  );
  assert(
    nodeDetailServiceSource.includes("requireVisualDetail: true"),
    "request detail path should require visual blocks even when async flag is off",
  );
  assert(
    treeClientSource.includes("/api/nodes/${nodeId}/detail/extras?tree_id="),
    "tree UI should load panel graph extras through the extras route",
  );
  assert(
    treeClientSource.includes("setDetailExtrasLoading"),
    "tree UI should track extras loading separately from body detail loading",
  );
  assert(
    treeClientSource.includes("detailInFlightNodeRef.current === nodeId"),
    "tree UI should skip duplicate detail requests for the same in-flight node",
  );
  assert(
    treeClientSource.includes("detailAbortControllerRef.current?.abort()"),
    "tree UI should abort stale detail requests when another node is opened",
  );
  assert(
    treeClientSource.includes("detailExtrasAbortControllerRef.current?.abort()"),
    "tree UI should abort stale detail extras requests when another node is opened",
  );
  assert(
    treeClientSource.includes("detailRequestSeqRef.current"),
    "tree UI should ignore stale detail responses by request sequence",
  );

  console.info("[node-detail-generation-smoke] ok");
}

main().catch((err) => {
  console.error("[node-detail-generation-smoke] failed", err);
  process.exitCode = 1;
});
