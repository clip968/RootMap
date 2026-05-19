import {
  generateLearningTreeWithCompletion,
  type ChatCompletionRunner,
} from "../src/lib/llm/generate-tree";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(raw: unknown): string {
  return JSON.stringify(raw);
}

const outline = {
  topic: "운영체제",
  summary: "운영체제를 이해하기 위한 선수지식과 핵심 개념을 순서대로 정리합니다.",
  nodes: [
    {
      id: "computer_system",
      title: "컴퓨터 시스템",
      type: "prerequisite",
      community: "시스템 기초",
      priority: 1,
      prerequisites: [],
    },
    {
      id: "process",
      title: "프로세스 (Process)",
      type: "prerequisite",
      community: "실행 모델",
      priority: 2,
      prerequisites: ["computer_system"],
    },
    {
      id: "memory",
      title: "메모리 (Memory)",
      type: "prerequisite",
      community: "메모리 관리",
      priority: 3,
      prerequisites: ["computer_system"],
    },
    {
      id: "scheduling",
      title: "스케줄링 (Scheduling)",
      type: "core",
      community: "실행 모델",
      priority: 4,
      prerequisites: ["process"],
    },
    {
      id: "virtual_memory",
      title: "가상 메모리 (Virtual Memory)",
      type: "core",
      community: "메모리 관리",
      priority: 5,
      prerequisites: ["memory"],
    },
    {
      id: "cpu_utilization",
      title: "CPU 이용률 (CPU Utilization)",
      type: "core",
      community: "실행 모델",
      priority: 6,
      prerequisites: ["scheduling"],
    },
    {
      id: "deadlock_misconception",
      title: "데드락 오해",
      type: "misconception",
      community: "동시성",
      priority: 7,
      prerequisites: ["process"],
    },
    {
      id: "scheduler_quiz",
      title: "스케줄러 점검 질문",
      type: "quiz",
      community: "실행 모델",
      priority: 8,
      prerequisites: ["scheduling"],
    },
  ],
  edges: [
    {
      from: "process",
      to: "scheduling",
      relation_type: "prerequisite",
      reason: "프로세스 이해가 먼저 필요합니다.",
    },
  ],
  recommended_order: [
    "computer_system",
    "process",
    "memory",
    "scheduling",
    "virtual_memory",
    "cpu_utilization",
    "deadlock_misconception",
    "scheduler_quiz",
  ],
};

function detailFor(ids: string[]) {
  return {
    nodes: outline.nodes
      .filter((node) => ids.includes(node.id))
      .map((node, index) => ({
        id: node.id,
        description: `${node.title}를 이해하기 위한 핵심 설명입니다.`,
        difficulty: Math.min(5, index + 1),
        concept_candidate: {
          canonical_title: node.title,
          aliases: [node.title.replace(/\s*\(.+\)$/, "")],
          domain: "computer_science",
          short_description: `${node.title}의 짧은 설명입니다.`,
          is_reusable: node.type !== "quiz",
        },
      })),
  };
}

const calls: string[] = [];
const completion: ChatCompletionRunner = async (messages) => {
  const system = messages[0]?.content ?? "";
  const user = messages[1]?.content ?? "";
  calls.push(system);

  if (system.includes("graph outline phase")) {
    return { rawText: json(outline), status: 200, model: "test-model" };
  }
  if (user.includes("computer_system")) {
    return {
      rawText: json(detailFor(["computer_system", "process", "memory"])),
      status: 200,
      model: "test-model",
    };
  }
  if (user.includes("scheduling")) {
    return {
      rawText: json(detailFor(["scheduling", "virtual_memory", "cpu_utilization"])),
      status: 200,
      model: "test-model",
    };
  }
  return {
    rawText: json(detailFor(["deadlock_misconception", "scheduler_quiz"])),
    status: 200,
    model: "test-model",
  };
};

async function main() {
  const result = await generateLearningTreeWithCompletion("운영체제", completion, {
    requestId: "split-generation-smoke",
    reuseConcepts: true,
    storeContext: "기존 Concept 없음",
  });

  assert(calls.length === 4, `expected 4 LLM calls, got ${calls.length}`);
  assert(result.tree.nodes.length === 8, "expected 8 assembled nodes");
  assert(
    result.tree.nodes.every((node) => node.description && node.concept_candidate),
    "expected every outline node to be enriched with detail fields",
  );
  assert(
    result.tree.recommended_order[0] === "computer_system",
    "expected outline recommended_order to be preserved",
  );
  assert(
    result.tree.nodes.find((node) => node.id === "computer_system")?.children.includes("process"),
    "expected children to be derived from prerequisites",
  );
  assert(
    result.tree.nodes.find((node) => node.id === "cpu_utilization")?.depth === 3,
    "expected prerequisite depth to be derived",
  );
  assert(
    result.tree.communities?.some((community) => community.name === "실행 모델"),
    "expected community grouping to be preserved",
  );

  console.log("split learning tree generation smoke passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
