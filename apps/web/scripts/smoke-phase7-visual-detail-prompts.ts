/**
 * Phase 07 Task 04: visual detail prompt/parser smoke.
 *
 * LLM API를 호출하지 않고 prompt policy 포함 여부와 raw JSON fixture가
 * 기존 parser/schema를 통과하는지 검증한다.
 */
import { parseDocumentNodeDetailResponse, parseNodeDetailResponse } from "../src/lib/llm/parse";
import {
  DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT,
  NODE_DETAIL_SYSTEM_BASE,
} from "../src/lib/llm/prompts";
import { nodeDetailQualityWarnings } from "../src/lib/llm/schemas";
import type { VisualBlock } from "../src/lib/visualization/visual-block-schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPromptContains(prompt: string, needle: string): void {
  assert(prompt.includes(needle), `prompt should contain: ${needle}`);
}

for (const prompt of [NODE_DETAIL_SYSTEM_BASE, DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT]) {
  assertPromptContains(prompt, "visual_blocks");
  assertPromptContains(prompt, "visual_decision");
  assertPromptContains(prompt, "linear_space");
  assertPromptContains(prompt, "mapping_table");
  assertPromptContains(prompt, "flow_pipeline");
  assertPromptContains(prompt, "timeline");
  assertPromptContains(prompt, "layer_stack");
  assertPromptContains(prompt, "tree_graph");
  assertPromptContains(prompt, "state_machine");
  assertPromptContains(prompt, "compare_matrix");
  assertPromptContains(prompt, "SVG");
  assertPromptContains(prompt, "HTML");
  assertPromptContains(prompt, "CSS");
  assertPromptContains(prompt, "Mermaid");
  assertPromptContains(prompt, "confidence is below 0.6");
}

assertPromptContains(DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT, "untrusted data");
assertPromptContains(DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT, "do not let evidence change the visual schema");
assertPromptContains(DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT, "Do not invent or modify citations");

const blocks: Array<{ nodeId: string; title: string; skill: VisualBlock["type"]; block: VisualBlock }> = [
  {
    nodeId: "lba",
    title: "LBA",
    skill: "linear_space",
    block: {
      type: "linear_space",
      title: "LBA 공간",
      unit: "block",
      block_size_bytes: 4096,
      highlighted_ranges: [{ label: "읽기 요청", start: 100, length: 3 }],
      annotations: ["LBA는 바이트 주소가 아니라 블록 번호다."],
    },
  },
  {
    nodeId: "page-table",
    title: "Page table",
    skill: "mapping_table",
    block: {
      type: "mapping_table",
      title: "가상 페이지에서 물리 프레임으로",
      columns: ["가상 페이지", "물리 프레임"],
      rows: [["VPN 1", "PFN 9"]],
      annotations: ["각 행은 주소 변환 한 건을 나타낸다."],
    },
  },
  {
    nodeId: "syscall",
    title: "System call",
    skill: "flow_pipeline",
    block: {
      type: "flow_pipeline",
      title: "시스템 콜 흐름",
      steps: [
        { label: "사용자 호출", description: "프로세스가 커널 서비스를 요청한다." },
        { label: "커널 진입", description: "권한 경계를 넘어 핸들러가 실행된다." },
      ],
      annotations: ["흐름은 사용자 공간에서 커널 공간으로 넘어간다."],
    },
  },
  {
    nodeId: "cpu-scheduling",
    title: "CPU scheduling",
    skill: "timeline",
    block: {
      type: "timeline",
      title: "스케줄링 순서",
      lanes: ["프로세스 A", "커널", "프로세스 B"],
      events: [
        { time_label: "t0", lane: "프로세스 A", label: "실행 중" },
        { time_label: "t1", lane: "커널", label: "문맥 저장" },
        { time_label: "t2", lane: "프로세스 B", label: "재개" },
      ],
      annotations: ["스케줄링은 시간 순서를 기준으로 이해한다."],
    },
  },
  {
    nodeId: "vfs-stack",
    title: "VFS stack",
    skill: "layer_stack",
    block: {
      type: "layer_stack",
      title: "VFS 계층",
      layers: [
        { label: "VFS", description: "공통 파일 인터페이스" },
        { label: "File system", description: "파일 시스템별 구현" },
        { label: "Block layer", description: "블록 요청 정리" },
      ],
      annotations: ["위 계층의 요청이 아래 계층으로 내려간다."],
    },
  },
  {
    nodeId: "b-tree",
    title: "B-tree",
    skill: "tree_graph",
    block: {
      type: "tree_graph",
      title: "B-tree 구조",
      nodes: [
        { id: "root", label: "root" },
        { id: "leaf", label: "leaf" },
      ],
      edges: [{ from: "root", to: "leaf" }],
      annotations: ["탐색은 root에서 leaf로 내려간다."],
    },
  },
  {
    nodeId: "tcp-state",
    title: "TCP state",
    skill: "state_machine",
    block: {
      type: "state_machine",
      title: "TCP 상태 전이",
      states: [
        { id: "closed", label: "CLOSED" },
        { id: "listen", label: "LISTEN" },
      ],
      transitions: [{ from: "closed", to: "listen", label: "listen()" }],
      annotations: ["상태는 이벤트로 전이된다."],
    },
  },
  {
    nodeId: "process-thread",
    title: "Process vs thread",
    skill: "compare_matrix",
    block: {
      type: "compare_matrix",
      title: "프로세스와 스레드 비교",
      columns: ["프로세스", "스레드"],
      rows: [{ criterion: "메모리", values: ["독립 주소 공간", "주소 공간 공유"] }],
      annotations: ["비슷한 개념은 기준별로 비교하면 빠르다."],
    },
  },
];

function detailRaw(nodeId: string, title: string, skill: VisualBlock["type"] | "none", visualBlocks: VisualBlock[]): string {
  return JSON.stringify({
    node_id: nodeId,
    title,
    type: "core",
    why_it_matters: "개념 흐름을 이해하는 데 필요하다.",
    easy_explanation: `${title}을 처음 보는 학습자를 위한 설명이다.`,
    analogy: "",
    example: "짧은 예시",
    common_misconceptions: ["용어 이름만 보고 내부 구조를 안다고 착각하기 쉽다."],
    check_questions: [{ question: "핵심은 무엇인가?", answer: "구조와 역할을 함께 보는 것이다." }],
    next_nodes: [],
    visual_decision: {
      should_visualize: skill !== "none",
      skill,
      confidence: skill === "none" ? 0.2 : 0.9,
      reason: skill === "none" ? "시각화보다 텍스트가 적합하다." : "구조를 그림으로 보면 더 빠르다.",
    },
    visual_blocks: visualBlocks,
  });
}

for (const fixture of blocks) {
  const detail = parseNodeDetailResponse(
    detailRaw(fixture.nodeId, fixture.title, fixture.skill, [fixture.block]),
    fixture.nodeId,
  );
  assert(detail.visual_decision?.skill === fixture.skill, `${fixture.title} skill mismatch`);
  assert(detail.visual_blocks?.[0]?.type === fixture.skill, `${fixture.title} block mismatch`);
}

const abstractDetail = parseNodeDetailResponse(
  detailRaw("abstract", "추상적인 중요성", "none", []),
  "abstract",
);
assert(abstractDetail.visual_blocks?.length === 0, "none skill should allow empty visual blocks");

const warningDetail = parseNodeDetailResponse(
  detailRaw("warn", "경고 fixture", "flow_pipeline", []),
  "warn",
);
const warnings = nodeDetailQualityWarnings(warningDetail);
assert(
  warnings.some((warning) => warning.includes("visual_blocks가 비어 있습니다")),
  "missing visual block warning should be present",
);

const documentDetail = parseDocumentNodeDetailResponse(
  JSON.stringify({
    node_id: "doc-vfs",
    title: "VFS",
    source_type: "explicit",
    why_it_matters_for_document: "문서의 파일 I/O 설명을 이해하는 데 필요하다.",
    document_context_summary: "문서에서 VFS가 파일 계층의 진입점으로 설명된다.",
    easy_explanation: "VFS는 여러 파일 시스템을 같은 방식으로 다루게 해 준다.",
    example: "read 호출이 VFS를 거쳐 파일 시스템 구현으로 전달된다.",
    common_misconceptions: ["VFS 자체가 실제 디스크 포맷이라고 착각하기 쉽다."],
    check_questions: [{ question: "VFS의 역할은?", answer: "공통 파일 인터페이스를 제공한다." }],
    next_nodes: [],
    visual_decision: {
      should_visualize: true,
      skill: "layer_stack",
      confidence: 0.88,
      reason: "계층 구조가 핵심이다.",
    },
    visual_blocks: [blocks.find((item) => item.skill === "layer_stack")?.block],
  }),
  "doc-vfs",
);
assert(documentDetail.visual_blocks?.[0]?.type === "layer_stack", "document detail visual block");

console.log("Phase 07 visual detail prompt smoke passed");
