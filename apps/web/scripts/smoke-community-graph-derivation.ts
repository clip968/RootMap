import { deriveLearningGraphView } from "../src/lib/tree/concept-graph";
import { buildDeepDiveGenerationTopic } from "../src/lib/tree/deep-dive";
import type { NodeType } from "../src/types/learning";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const nodes: Array<{
  id: string;
  title: string;
  type: NodeType;
  community: string;
  priority: number;
  prerequisites: string[];
}> = [
  {
    id: "process",
    title: "프로세스",
    type: "prerequisite",
    community: "실행 모델",
    priority: 10,
    prerequisites: [],
  },
  {
    id: "thread",
    title: "스레드",
    type: "core",
    community: "실행 모델",
    priority: 20,
    prerequisites: ["process"],
  },
  {
    id: "lock",
    title: "락",
    type: "core",
    community: "동시성",
    priority: 30,
    prerequisites: ["thread"],
  },
  {
    id: "deadlock",
    title: "데드락",
    type: "misconception",
    community: "동시성",
    priority: 40,
    prerequisites: ["lock"],
  },
  {
    id: "quiz",
    title: "동시성 점검",
    type: "quiz",
    community: "동시성",
    priority: 50,
    prerequisites: ["deadlock"],
  },
];

const graph = deriveLearningGraphView(nodes);
const byId = new Map(graph.nodes.map((node) => [node.id, node]));

assert(byId.get("process")?.children.includes("thread"), "process should point to thread");
assert(byId.get("thread")?.depth === 1, "thread depth should follow process");
assert(byId.get("deadlock")?.depth === 3, "deadlock depth should be derived from prerequisites");
assert(
  graph.recommended_order.join(",") === "process,thread,lock,deadlock,quiz",
  "recommended_order should follow depth then priority",
);
assert(graph.communities[0]?.name === "실행 모델", "first community should be ordered by priority");
assert(graph.communities[1]?.node_ids.includes("deadlock"), "community should include member ids");
assert(
  buildDeepDiveGenerationTopic("스레드", ["프로세스", "락", "데드락", "퀴즈", "초과"]) ===
    "스레드 세부 학습: 프로세스, 락, 데드락, 퀴즈",
  "deep-dive topic should include selected concept and bounded related context",
);

let cycleRejected = false;
try {
  deriveLearningGraphView([
    { ...nodes[0]!, prerequisites: ["quiz"] },
    ...nodes.slice(1),
  ]);
} catch (err) {
  cycleRejected = err instanceof Error && err.message.includes("cycle");
}
assert(cycleRejected, "cyclic prerequisites should be rejected");

console.log("community graph derivation smoke passed");
