/**
 * Phase 1 MVP 품질 스모크(API/LLM 호출 없음)
 *
 * 세 테스트 주제의 대표 LLM 출력 fixture를 저장소·추천·상세 품질 가드에 통과시켜
 * task 10의 최소 기능/품질 기준을 자동 회귀 테스트한다.
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { learningTreeQualityWarnings, nodeDetailQualityWarnings } from "../src/lib/llm/schemas";
import { recommendNextNodes } from "../src/lib/recommendation/recommend-next";
import {
  createFullLearningTree,
  getLearningTree,
  getNodeById,
  getProgressByTree,
  saveNodeDetail,
  upsertNodeProgress,
} from "../src/lib/repository/learning-repository";
import { bundleToApiTreeResponse } from "../src/lib/tree/bundle-to-api";
import type {
  LearningTreeResponse,
  NodeDetailResponse,
  NodeType,
  ProgressStatus,
} from "../src/types/learning";

type ExpectedConcepts = {
  prerequisite: string[];
  core: string[];
};

type Fixture = {
  tree: LearningTreeResponse;
  expected: ExpectedConcepts;
};

const fixtures: Fixture[] = [
  {
    tree: {
      topic: "Rust lifetime",
      summary:
        "Rust lifetime을 이해하기 위해 소유권, 참조, 빌림, 스코프를 먼저 잡고 lifetime annotation과 borrow checker로 이어지는 학습 트리입니다.",
      nodes: [
        node("ownership", "Ownership", "prerequisite", 1, [], ["reference", "borrowing"]),
        node("reference", "Reference", "prerequisite", 2, ["ownership"], ["borrowing", "scope"]),
        node("borrowing", "Borrowing", "prerequisite", 2, ["ownership", "reference"], ["scope", "borrow_checker"]),
        node("scope", "Scope", "prerequisite", 2, ["reference"], ["lifetime_annotation"]),
        node("lifetime_annotation", "Lifetime annotation", "core", 3, ["scope", "borrowing"], ["lifetime_elision"]),
        node("lifetime_elision", "Lifetime elision", "core", 3, ["lifetime_annotation"], ["borrow_checker"]),
        node("borrow_checker", "Borrow checker", "core", 4, ["borrowing", "lifetime_elision"], []),
        node("static_lifetime", "'static lifetime", "supplementary", 4, ["lifetime_annotation"], []),
        node("mis_lifetime_extends", "Misconception: lifetime extends data", "misconception", 2, ["lifetime_annotation"], []),
        node("quiz_ref_owner", "Quiz: reference and ownership", "quiz", 2, ["borrowing"], []),
        node("quiz_annotation", "Quiz: annotation need", "quiz", 3, ["lifetime_annotation"], []),
      ],
      recommended_order: [
        "ownership",
        "reference",
        "borrowing",
        "scope",
        "lifetime_annotation",
        "lifetime_elision",
        "borrow_checker",
        "static_lifetime",
        "mis_lifetime_extends",
        "quiz_ref_owner",
        "quiz_annotation",
      ],
    },
    expected: {
      prerequisite: ["ownership", "reference", "borrowing", "scope"],
      core: ["lifetime annotation", "lifetime elision", "borrow checker"],
    },
  },
  {
    tree: {
      topic: "Transformer",
      summary:
        "Transformer를 self-attention 중심으로 이해하기 위해 벡터·행렬·내적·softmax·sequence를 선수지식으로 정리한 트리입니다.",
      nodes: [
        node("vector", "Vector", "prerequisite", 1, [], ["matrix", "dot_product"]),
        node("matrix", "Matrix", "prerequisite", 2, ["vector"], ["query_key_value"]),
        node("dot_product", "Dot product", "prerequisite", 2, ["vector"], ["self_attention"]),
        node("softmax", "Softmax", "prerequisite", 2, ["vector"], ["self_attention"]),
        node("sequence", "Sequence", "prerequisite", 1, [], ["positional_encoding", "self_attention"]),
        node("query_key_value", "Query Key Value", "core", 3, ["matrix"], ["self_attention"]),
        node("self_attention", "Self-attention", "core", 4, ["query_key_value", "dot_product", "softmax", "sequence"], ["multi_head_attention"]),
        node("multi_head_attention", "Multi-head attention", "core", 4, ["self_attention"], []),
        node("positional_encoding", "Positional encoding", "core", 3, ["sequence"], []),
        node("feed_forward", "Feed-forward network", "supplementary", 3, ["matrix"], []),
        node("mis_rnn", "Misconception: Transformer is just an RNN", "misconception", 2, ["self_attention"], []),
        node("quiz_qkv", "Quiz: Q/K/V roles", "quiz", 3, ["query_key_value"], []),
        node("quiz_attention", "Quiz: attention weights", "quiz", 3, ["self_attention"], []),
      ],
      recommended_order: [
        "vector",
        "matrix",
        "dot_product",
        "softmax",
        "sequence",
        "query_key_value",
        "self_attention",
        "multi_head_attention",
        "positional_encoding",
        "feed_forward",
        "mis_rnn",
        "quiz_qkv",
        "quiz_attention",
      ],
    },
    expected: {
      prerequisite: ["vector", "matrix", "dot product", "softmax", "sequence"],
      core: ["query", "key", "value", "self-attention", "multi-head attention", "positional encoding"],
    },
  },
  {
    tree: {
      topic: "가상 메모리",
      summary:
        "가상 메모리를 이해하기 위해 프로세스, 주소, 메모리, 페이지를 먼저 익히고 주소 변환·페이지 테이블·TLB·page fault로 이어지는 트리입니다.",
      nodes: [
        node("process", "Process", "prerequisite", 1, [], ["virtual_address"]),
        node("address", "Address", "prerequisite", 1, [], ["virtual_address", "physical_address"]),
        node("memory", "Memory", "prerequisite", 1, [], ["physical_address"]),
        node("page", "Page", "prerequisite", 2, ["memory"], ["page_table", "page_fault"]),
        node("virtual_address", "Virtual address", "core", 2, ["process", "address"], ["page_table"]),
        node("physical_address", "Physical address", "core", 2, ["address", "memory"], ["page_table"]),
        node("page_table", "Page table", "core", 3, ["virtual_address", "physical_address", "page"], ["tlb", "page_fault"]),
        node("tlb", "TLB", "core", 3, ["page_table"], []),
        node("page_fault", "Page fault", "core", 4, ["page", "page_table"], []),
        node("demand_paging", "Demand paging", "supplementary", 3, ["page_fault"], []),
        node("mis_memory_size", "Misconception: virtual memory is just bigger RAM", "misconception", 2, ["virtual_address"], []),
        node("quiz_translation", "Quiz: address translation", "quiz", 3, ["page_table"], []),
        node("quiz_fault", "Quiz: page fault flow", "quiz", 3, ["page_fault"], []),
      ],
      recommended_order: [
        "process",
        "address",
        "memory",
        "page",
        "virtual_address",
        "physical_address",
        "page_table",
        "tlb",
        "page_fault",
        "demand_paging",
        "mis_memory_size",
        "quiz_translation",
        "quiz_fault",
      ],
    },
    expected: {
      prerequisite: ["process", "address", "memory", "page"],
      core: ["virtual address", "physical address", "page table", "tlb", "page fault"],
    },
  },
];

function node(
  id: string,
  title: string,
  type: NodeType,
  difficulty: number,
  prerequisites: string[],
  children: string[],
) {
  return {
    id,
    title,
    type,
    description: `${title}를 초보자 관점에서 설명하는 노드입니다.`,
    difficulty,
    prerequisites,
    children,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

function countByType(tree: LearningTreeResponse, type: NodeType): number {
  return tree.nodes.filter((n) => n.type === type).length;
}

function assertExpectedConcepts(tree: LearningTreeResponse, expected: ExpectedConcepts) {
  for (const [type, concepts] of Object.entries(expected) as Array<[
    keyof ExpectedConcepts,
    string[],
  ]>) {
    const haystack = normalize(
      tree.nodes
        .filter((n) => n.type === type)
        .map((n) => `${n.id} ${n.title}`)
        .join(" "),
    );
    for (const concept of concepts) {
      assert(
        haystack.includes(normalize(concept)),
        `${tree.topic}: ${type} expected concept missing: ${concept}`,
      );
    }
  }
}

function assertPrerequisiteOrder(tree: LearningTreeResponse) {
  const orderIndex = new Map(tree.recommended_order.map((id, i) => [id, i]));
  const firstCoreIndex = tree.recommended_order.findIndex((id) => {
    const n = tree.nodes.find((node) => node.id === id);
    return n?.type === "core";
  });

  for (const node of tree.nodes) {
    const nodeIndex = orderIndex.get(node.id);
    assert(nodeIndex !== undefined, `${tree.topic}: recommended_order missing ${node.id}`);
    for (const prereq of node.prerequisites) {
      const prereqIndex = orderIndex.get(prereq);
      assert(prereqIndex !== undefined, `${tree.topic}: missing prerequisite in order ${prereq}`);
      assert(
        prereqIndex < nodeIndex,
        `${tree.topic}: prerequisite ${prereq} should come before ${node.id}`,
      );
    }
  }

  if (firstCoreIndex >= 0) {
    for (const prereq of tree.nodes.filter((n) => n.type === "prerequisite")) {
      assert(
        orderIndex.get(prereq.id)! < firstCoreIndex,
        `${tree.topic}: prerequisite ${prereq.id} should be before the first core node`,
      );
    }
  }
}

function assertTreeQuality(fixture: Fixture) {
  const { tree, expected } = fixture;
  const warnings = learningTreeQualityWarnings(tree, tree.topic);
  assert(warnings.length === 0, `${tree.topic}: quality warnings: ${warnings.join("; ")}`);
  assert(tree.nodes.length >= 8 && tree.nodes.length <= 20, `${tree.topic}: node count`);
  assert(countByType(tree, "prerequisite") >= 3, `${tree.topic}: prerequisite count`);
  assert(countByType(tree, "core") >= 3, `${tree.topic}: core count`);
  assert(countByType(tree, "supplementary") >= 1, `${tree.topic}: supplementary count`);
  assert(countByType(tree, "misconception") >= 1, `${tree.topic}: misconception count`);
  assert(countByType(tree, "quiz") >= 2, `${tree.topic}: quiz count`);
  assertPrerequisiteOrder(tree);
  assertExpectedConcepts(tree, expected);
}

function sampleDetailFor(nodeId: string, title: string, type: NodeType): NodeDetailResponse {
  return {
    node_id: nodeId,
    title,
    type,
    why_it_matters: `${title}는 이후 개념을 이해하는 발판이 됩니다.`,
    easy_explanation: `${title}를 처음 배우는 사람도 따라갈 수 있도록 핵심 정의와 직관을 함께 설명합니다.`,
    analogy: "지도에서 현재 위치를 먼저 확인해야 다음 경로를 고를 수 있는 것과 비슷합니다.",
    example: `예시: ${title}가 실제 문제에서 어떤 입력과 결과로 나타나는지 한 단계씩 확인합니다.`,
    common_misconceptions: [`${title}를 단순 암기 항목으로만 보면 prerequisite 관계를 놓치기 쉽습니다.`],
    check_questions: [
      {
        question: `${title}가 왜 다음 개념의 선수지식인가요?`,
        answer: "이 개념이 뒤에서 쓰이는 용어와 판단 기준을 제공하기 때문입니다.",
      },
    ],
    next_nodes: [],
  };
}

function assertRecommendations(
  treeId: string,
  progress: Array<{ node_id: string; status: ProgressStatus }>,
) {
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  assert(bundle, `stored tree not found: ${treeId}`);

  const progressMap = new Map(progress.map((p) => [p.node_id, p.status]));
  const inputs = bundle.nodes.map((n) => ({
    id: n.id,
    node_key: n.nodeKey,
    title: n.title,
    type: n.type,
    difficulty: n.difficulty ?? 0,
    prerequisites: n.prerequisites,
  }));
  const recommended = recommendNextNodes(inputs, progressMap);
  assert(recommended.length > 0, `${bundle.tree.topic}: recommendations should not be empty`);
  return { bundle, recommended };
}

const dbRel = path.join("data", "phase1-smoke.db");
const dbAbs = path.join(process.cwd(), dbRel);
process.env.DATABASE_URL = `file:${dbAbs}`;

resetDbSingleton();
fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
try {
  fs.unlinkSync(dbAbs);
} catch {
  /* noop */
}
resetDbSingleton();

const db = getDb();
migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

for (const fixture of fixtures) {
  assertTreeQuality(fixture);

  const treeId = createFullLearningTree(
    fixture.tree.topic,
    fixture.tree.summary,
    fixture.tree,
    DEFAULT_USER_ID,
  );

  const progress = getProgressByTree(DEFAULT_USER_ID, treeId);
  assert(progress.length === fixture.tree.nodes.length, `${fixture.tree.topic}: progress rows`);
  assert(progress.every((p) => p.status === "unknown"), `${fixture.tree.topic}: default progress`);

  const { bundle, recommended } = assertRecommendations(treeId, progress);
  assert(
    recommended.every((r) => bundle.nodes.find((n) => n.id === r.node_id)?.type === "prerequisite"),
    `${fixture.tree.topic}: initial recommendations should start from prerequisites`,
  );

  for (const prereq of bundle.nodes.filter((n) => n.type === "prerequisite")) {
    upsertNodeProgress(DEFAULT_USER_ID, treeId, prereq.id, "known");
  }

  const afterPrereqs = getProgressByTree(DEFAULT_USER_ID, treeId);
  const { recommended: coreRecommended } = assertRecommendations(treeId, afterPrereqs);
  assert(
    coreRecommended.some((r) => bundle.nodes.find((n) => n.id === r.node_id)?.type === "core"),
    `${fixture.tree.topic}: core recommendations after known prerequisites`,
  );

  const firstNode = bundle.nodes[0]!;
  const detail = sampleDetailFor(firstNode.nodeKey, firstNode.title, firstNode.type);
  const detailWarnings = nodeDetailQualityWarnings(detail);
  assert(detailWarnings.length === 0, `${fixture.tree.topic}: detail warnings`);
  assert(saveNodeDetail(firstNode.id, detail), `${fixture.tree.topic}: detail save`);
  assert(getNodeById(firstNode.id)?.detailJson, `${fixture.tree.topic}: detail retrieval`);

  const apiPayload = bundleToApiTreeResponse(getLearningTree(treeId, DEFAULT_USER_ID)!);
  assert(apiPayload.tree_id === treeId, `${fixture.tree.topic}: API tree id`);
  assert(apiPayload.nodes.length === fixture.tree.nodes.length, `${fixture.tree.topic}: API nodes`);
  assert(apiPayload.nodes.every((n) => n.progress), `${fixture.tree.topic}: API progress restore`);

  resetDbSingleton();
  const reloaded = getLearningTree(treeId, DEFAULT_USER_ID);
  assert(reloaded, `${fixture.tree.topic}: reload stored tree`);
  assert(reloaded.progress.some((p) => p.status === "known"), `${fixture.tree.topic}: reload progress`);
}

resetDbSingleton();
try {
  fs.unlinkSync(dbAbs);
} catch {
  /* noop */
}

console.log("phase1:smoke OK");
