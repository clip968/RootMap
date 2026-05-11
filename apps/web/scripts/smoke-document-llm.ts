/**
 * Phase 3 문서 기반 LLM·추천 품질 스모크(API/LLM 호출 없음)
 *
 * plan 10의 자동 회귀 테스트:
 * - 문서 기반 추천은 source_type과 문서 노드 유형을 우선 고려해야 한다.
 * - 문서 LLM 파서는 JSON 파싱 실패와 낮은 품질 출력을 검출해야 한다.
 */
import { LlmParseError } from "../src/lib/llm/errors";
import { parseDocumentTreeResponse } from "../src/lib/llm/parse";
import { documentTreeQualityWarnings } from "../src/lib/llm/schemas";
import { getOpenRouterMaxAttempts, getOpenRouterTimeoutMs } from "../src/lib/llm/chat";
import { runWithConcurrency } from "../src/lib/document/processor";
import {
  recommendNextNodes,
  type RecommendNodeInput,
} from "../src/lib/recommendation/recommend-next";
import type {
  DocumentSourceType,
  ProgressStatus,
} from "../src/types/learning";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows<T extends Error>(
  fn: () => unknown,
  errorClass: new (...args: never[]) => T,
  message: string,
) {
  try {
    fn();
  } catch (err) {
    assert(err instanceof errorClass, `${message}: unexpected error class`);
    return;
  }
  throw new Error(`${message}: expected error`);
}

type DocumentRecommendNode = RecommendNodeInput & {
  source_type: DocumentSourceType;
  document_type: "prerequisite" | "document_core" | "misconception" | "quiz";
  recommended_order_index: number;
};

function docNode(
  id: string,
  title: string,
  documentType: DocumentRecommendNode["document_type"],
  sourceType: DocumentSourceType,
  difficulty: number,
  prerequisites: string[],
  recommendedOrderIndex: number,
): DocumentRecommendNode {
  return {
    id,
    node_key: id,
    title,
    type: documentType === "document_core" ? "document_core" : documentType,
    difficulty,
    prerequisites,
    source_type: sourceType,
    document_type: documentType,
    recommended_order_index: recommendedOrderIndex,
  };
}

function recommendedIds(
  nodes: DocumentRecommendNode[],
  progress: Array<[string, ProgressStatus]>,
): string[] {
  return recommendNextNodes(nodes, new Map(progress)).map((item) => item.node_id);
}

const documentNodes = [
  docNode("vector", "Vector", "prerequisite", "explicit", 1, [], 0),
  docNode("softmax", "Softmax", "prerequisite", "inferred", 3, [], 1),
  docNode("scaled_attention", "Scaled Dot-Product Attention", "document_core", "explicit", 2, [
    "softmax",
  ], 2),
  docNode("multi_head", "Multi-Head Attention", "document_core", "explicit", 4, [
    "scaled_attention",
  ], 3),
  docNode("attention_misread", "Attention is a fixed lookup table", "misconception", "generated", 2, [
    "scaled_attention",
  ], 4),
  docNode("attention_quiz", "Attention 이해 점검", "quiz", "generated", 1, [
    "multi_head",
  ], 5),
];

let ids = recommendedIds(documentNodes, []);
assert(
  ids[0] === "softmax",
  `inferred prerequisite should be recommended before explicit prerequisite, got ${ids.join(", ")}`,
);

ids = recommendedIds(documentNodes, [["softmax", "known"]]);
assert(
  ids[0] === "vector",
  `explicit prerequisite should follow inferred prerequisite, got ${ids.join(", ")}`,
);

ids = recommendedIds(documentNodes, [
  ["softmax", "known"],
  ["vector", "known"],
]);
assert(
  ids[0] === "scaled_attention",
  `ready document_core should be recommended after prerequisites, got ${ids.join(", ")}`,
);

ids = recommendedIds(documentNodes, [
  ["softmax", "known"],
  ["vector", "known"],
  ["scaled_attention", "known"],
  ["multi_head", "known"],
]);
assert(
  ids[0] === "attention_misread",
  `misconception should be recommended before quiz after core concepts, got ${ids.join(", ")}`,
);

assertThrows(
  () => parseDocumentTreeResponse("not json"),
  LlmParseError,
  "invalid document tree JSON",
);

const lowQualityTree = parseDocumentTreeResponse(`{
  "topic": "Transformer",
  "document_id": "doc_1",
  "summary": "Too small",
  "nodes": [
    {
      "id": "softmax",
      "title": "Softmax",
      "type": "prerequisite",
      "description": "A prerequisite.",
      "difficulty": 2,
      "prerequisites": [],
      "children": [],
      "source_type": "inferred",
      "evidence": [],
      "concept_candidate": {
        "canonical_title": "Softmax",
        "aliases": [],
        "domain": "ML",
        "short_description": "A normalization function.",
        "is_reusable": true
      }
    }
  ],
  "edges": [],
  "recommended_order": ["softmax"]
}`);

const warnings = documentTreeQualityWarnings(lowQualityTree);
assert(
  warnings.some((warning) => warning.includes("노드 수")),
  "low quality document tree should warn about node count",
);
assert(
  warnings.some((warning) => warning.includes("문서 핵심 개념")),
  "low quality document tree should warn about document_core count",
);

const previousTimeout = process.env.OPENROUTER_TIMEOUT_MS;
delete process.env.OPENROUTER_TIMEOUT_MS;
assert(getOpenRouterTimeoutMs() === 60_000, "OpenRouter timeout should default to 60 seconds");
process.env.OPENROUTER_TIMEOUT_MS = "1500";
assert(getOpenRouterTimeoutMs() === 1_500, "OpenRouter timeout should read OPENROUTER_TIMEOUT_MS");
process.env.OPENROUTER_TIMEOUT_MS = "bad";
assert(getOpenRouterTimeoutMs() === 60_000, "invalid OpenRouter timeout should fall back to default");
if (previousTimeout == null) {
  delete process.env.OPENROUTER_TIMEOUT_MS;
} else {
  process.env.OPENROUTER_TIMEOUT_MS = previousTimeout;
}

const previousAttempts = process.env.OPENROUTER_MAX_ATTEMPTS;
delete process.env.OPENROUTER_MAX_ATTEMPTS;
assert(getOpenRouterMaxAttempts() === 3, "OpenRouter max attempts should default to 3");
process.env.OPENROUTER_MAX_ATTEMPTS = "1";
assert(getOpenRouterMaxAttempts() === 1, "OpenRouter max attempts should read OPENROUTER_MAX_ATTEMPTS");
process.env.OPENROUTER_MAX_ATTEMPTS = "bad";
assert(getOpenRouterMaxAttempts() === 3, "invalid OpenRouter max attempts should fall back to default");
if (previousAttempts == null) {
  delete process.env.OPENROUTER_MAX_ATTEMPTS;
} else {
  process.env.OPENROUTER_MAX_ATTEMPTS = previousAttempts;
}

async function assertConcurrencyLimit(): Promise<void> {
  let active = 0;
  let maxActive = 0;
  const parallelResults = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return value * 10;
  });
  assert(maxActive <= 2, `concurrency limit should cap active jobs, got ${maxActive}`);
  assert(
    parallelResults.join(",") === "10,20,30,40,50",
    `concurrency helper should preserve result order, got ${parallelResults.join(",")}`,
  );
}

void assertConcurrencyLimit().then(() => {
  console.log("llm:smoke-document OK");
});
