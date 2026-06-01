/**
 * Node detail generation smoke without external DB or LLM calls.
 *
 * Phase 08 keeps this script in-memory so it verifies service behavior even
 * after the app moved to Postgres-only runtime configuration.
 */
import { DEFAULT_USER_ID } from "../src/db/constants";
import type { ConceptRow } from "../src/lib/repository/concept-repository";
import type {
  LearningNodeRow,
  LearningTreeBundle,
  LearningTreeRow,
} from "../src/lib/repository/learning-repository";
import { getOrCreateNodeDetail } from "../src/lib/services/node-detail";
import type {
  LearningTreeResponse,
  NodeDetailResponse,
} from "../src/types/learning";

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

function bundle(conceptId: string): LearningTreeBundle {
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
    detailJson: null,
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

async function main(): Promise<void> {
  const logs = await captureServiceLogs(async () => {
    await runShortDescriptionGenerationCase();
    await runConceptExplanationFastPathCase();
  });

  assertServiceLog(logs, "generic_llm_generation");
  assertServiceLog(logs, "save_detail");
  assertServiceLog(logs, "panel_graph");
  assertServiceLog(logs, "concept_fast_path");

  console.info("[node-detail-generation-smoke] ok");
}

main().catch((err) => {
  console.error("[node-detail-generation-smoke] failed", err);
  process.exitCode = 1;
});
