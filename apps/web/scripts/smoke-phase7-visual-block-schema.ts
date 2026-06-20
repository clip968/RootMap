/**
 * Phase 07 Task 03: visual block 계약 스모크.
 *
 * API 호출 없이 9개 visual skill(Phase 17에서 worked_example 추가)의 schema,
 * invalid fallback, legacy detail 호환성을 검증한다.
 */
import { parseDocumentNodeDetailResponse, parseNodeDetailResponse } from "../src/lib/llm/parse";
import {
  legacyDetailWithoutVisualFields,
  phase7VisualDetailFixtures,
} from "./fixtures/phase7-visual-detail-fixtures";
import {
  hasRequiredNodeDetailVisual,
  normalizeVisualBlocks,
  visualBlockSchema,
  visualBlocksSchema,
  type VisualBlock,
} from "../src/lib/visualization/visual-block-schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(label: string, fn: () => void): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label} should fail validation`);
}

const validBlocks: VisualBlock[] = [
  {
    type: "linear_space",
    title: "LBA Space",
    unit: "block",
    block_size_bytes: 4096,
    total_units_hint: 1024,
    highlighted_ranges: [{ label: "read", start: 100, length: 3 }],
    annotations: ["LBA는 블록 번호다."],
  },
  {
    type: "mapping_table",
    title: "Virtual to Physical",
    columns: ["virtual page", "physical frame"],
    rows: [
      ["0x10", "0xA0"],
      ["0x11", "0xA1"],
    ],
    annotations: ["각 행은 하나의 변환이다."],
  },
  {
    type: "flow_pipeline",
    title: "read path",
    steps: [
      { label: "user read", description: "사용자가 read를 호출한다.", layer: "user" },
      { label: "vfs", description: "커널 VFS가 요청을 받는다.", layer: "kernel" },
    ],
    annotations: ["요청은 여러 계층을 지난다."],
  },
  {
    type: "timeline",
    title: "context switch",
    lanes: ["process A", "kernel", "process B"],
    events: [
      { time_label: "t0", lane: "process A", label: "running" },
      { time_label: "t1", lane: "kernel", label: "save context" },
      { time_label: "t2", lane: "process B", label: "resume" },
    ],
    annotations: ["시간 순서를 먼저 본다."],
  },
  {
    type: "layer_stack",
    title: "I/O stack",
    layers: [
      { label: "VFS", description: "공통 파일 인터페이스" },
      { label: "block layer", description: "블록 요청 정리" },
      { label: "driver", description: "장치 명령 전송" },
    ],
    annotations: ["위에서 아래로 요청이 내려간다."],
  },
  {
    type: "tree_graph",
    title: "dependency tree",
    nodes: [
      { id: "root", label: "root" },
      { id: "child", label: "child" },
    ],
    edges: [{ from: "root", to: "child", label: "needs" }],
    annotations: ["간선은 의존 방향을 나타낸다."],
  },
  {
    type: "state_machine",
    title: "process states",
    states: [
      { id: "ready", label: "Ready" },
      { id: "running", label: "Running" },
    ],
    transitions: [{ from: "ready", to: "running", label: "scheduled" }],
    annotations: ["전이는 이벤트로 발생한다."],
  },
  {
    type: "compare_matrix",
    title: "polling vs interrupt",
    columns: ["polling", "interrupt"],
    rows: [
      { criterion: "trigger", values: ["CPU가 반복 확인", "장치가 알림"] },
      { criterion: "cost", values: ["낭비 가능", "전환 비용"] },
    ],
    annotations: ["기준별 차이를 비교한다."],
  },
  // Phase 17: worked_example — 단계별 풀이 계약 검증용(선택 필드 intermediate_value/common_mistake 포함).
  {
    type: "worked_example",
    title: "주소 변환 풀이",
    problem: "VPN 2 → PFN 5, offset 0xA50일 때 물리 주소는?",
    steps: [
      { label: "프레임 조회", explanation: "VPN 2의 PFN은 5다.", intermediate_value: "PFN=5" },
      { label: "물리 주소 조립", explanation: "PFN을 옮기고 offset을 더한다.", intermediate_value: "0x5A50" },
    ],
    final_answer: "물리 주소는 0x5A50이다.",
    common_mistake: "offset까지 바꾸려 하면 안 된다.",
    annotations: ["offset은 변환 중에도 유지된다."],
  },
];

for (const block of validBlocks) {
  visualBlockSchema.parse(block);
}
assert(visualBlocksSchema.parse(validBlocks).length === 9, "all valid visual blocks should parse");

const fixtureBlocks = phase7VisualDetailFixtures.flatMap(
  (fixture) => fixture.detail.visual_blocks ?? [],
);
const fixtureSkills = new Set(fixtureBlocks.map((block) => block.type));
assert(fixtureSkills.size === 9, "fixture set should cover 9 visual skills");
for (const fixture of phase7VisualDetailFixtures) {
  const parsed = parseNodeDetailResponse(JSON.stringify(fixture.detail), fixture.detail.node_id);
  assert(
    (parsed.visual_blocks ?? []).length === (fixture.detail.visual_blocks ?? []).length,
    `${fixture.name} visual block count should round-trip`,
  );
}

assertThrows("mapping row length", () => {
  visualBlockSchema.parse({
    type: "mapping_table",
    title: "bad table",
    columns: ["a", "b"],
    rows: [["only-a"]],
    annotations: [],
  });
});

assertThrows("tree invalid reference", () => {
  visualBlockSchema.parse({
    type: "tree_graph",
    title: "bad graph",
    nodes: [{ id: "a", label: "A" }],
    edges: [{ from: "a", to: "missing" }],
    annotations: [],
  });
});

assertThrows("state invalid reference", () => {
  visualBlockSchema.parse({
    type: "state_machine",
    title: "bad states",
    states: [{ id: "ready", label: "Ready" }],
    transitions: [{ from: "ready", to: "missing", label: "go" }],
    annotations: [],
  });
});

assertThrows("unknown type", () => {
  visualBlockSchema.parse({
    type: "unknown",
    title: "bad",
    annotations: [],
  });
});

assertThrows("too many annotations", () => {
  visualBlockSchema.parse({
    type: "linear_space",
    title: "bad annotations",
    unit: "block",
    highlighted_ranges: [{ label: "range", start: 0, length: 1 }],
    annotations: ["1", "2", "3", "4"],
  });
});

assertThrows("linear range count", () => {
  visualBlockSchema.parse({
    type: "linear_space",
    title: "bad ranges",
    unit: "block",
    highlighted_ranges: [],
    annotations: [],
  });
});

assertThrows("compare value length", () => {
  visualBlockSchema.parse({
    type: "compare_matrix",
    title: "bad compare",
    columns: ["a", "b"],
    rows: [{ criterion: "cost", values: ["only-a"] }],
    annotations: [],
  });
});

const legacyDetail = parseNodeDetailResponse(
  JSON.stringify(legacyDetailWithoutVisualFields),
  legacyDetailWithoutVisualFields.node_id,
);

assert(legacyDetail.visual_decision?.skill === "none", "legacy detail should default decision");
assert(legacyDetail.visual_blocks?.length === 0, "legacy detail should default visual blocks");
assert(
  !hasRequiredNodeDetailVisual(legacyDetail),
  "legacy detail without a visual should not satisfy required visual policy",
);
assert(
  hasRequiredNodeDetailVisual(phase7VisualDetailFixtures[0]!.detail),
  "detail with matching decision and visual block should satisfy required visual policy",
);

const legacyDocumentDetail = parseDocumentNodeDetailResponse(
  JSON.stringify({
    node_id: "doc-node-1",
    title: "legacy document detail",
    source_type: "explicit",
    why_it_matters_for_document: "문서를 이해하는 데 필요하다.",
    document_context_summary: "문서 안에서 사용된다.",
    easy_explanation: "문서 기반 설명",
    example: "example",
    common_misconceptions: [],
    check_questions: [],
    next_nodes: [],
  }),
  "doc-node-1",
);

assert(
  legacyDocumentDetail.visual_blocks?.length === 0,
  "legacy document detail should default visual blocks",
);
assert(normalizeVisualBlocks([{ type: "unknown" }]).length === 0, "API fallback should be empty");

console.log("Phase 07 visual block schema smoke passed");
