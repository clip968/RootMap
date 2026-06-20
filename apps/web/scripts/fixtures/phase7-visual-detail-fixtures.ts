import type { NodeDetailResponse } from "../../src/types/learning";
import type { VisualBlock } from "../../src/lib/visualization/visual-block-schema";

export interface Phase7VisualDetailFixture {
  name: string;
  expectedSkill: VisualBlock["type"] | "none";
  detail: NodeDetailResponse;
  shouldRender: boolean;
}

function detailFixture(
  name: string,
  expectedSkill: VisualBlock["type"] | "none",
  visualBlocks: VisualBlock[],
): Phase7VisualDetailFixture {
  return {
    name,
    expectedSkill,
    shouldRender: expectedSkill !== "none",
    detail: {
      node_id: name,
      title: name,
      type: "core",
      why_it_matters: `${name} 개념을 이해하는 데 필요합니다.`,
      easy_explanation: `${name}을 초보자용으로 설명합니다.`,
      analogy: "",
      example: "짧은 예시",
      common_misconceptions: ["이름만 보고 내부 구조를 안다고 착각하기 쉽습니다."],
      check_questions: [{ question: "핵심은 무엇인가요?", answer: "구조와 역할입니다." }],
      next_nodes: [],
      visual_decision: {
        should_visualize: expectedSkill !== "none",
        skill: expectedSkill,
        confidence: expectedSkill === "none" ? 0.2 : 0.9,
        reason: expectedSkill === "none" ? "시각화가 유용하지 않습니다." : "시각 구조가 이해를 돕습니다.",
      },
      visual_blocks: visualBlocks,
    },
  };
}

export const phase7VisualDetailFixtures: Phase7VisualDetailFixture[] = [
  detailFixture("LBA", "linear_space", [
    {
      type: "linear_space",
      title: "LBA 공간",
      unit: "block",
      block_size_bytes: 4096,
      total_units_hint: 1024,
      highlighted_ranges: [{ label: "read request", start: 100, length: 3 }],
      annotations: ["LBA는 byte 주소가 아니라 block 번호입니다."],
    },
  ]),
  detailFixture("page table", "mapping_table", [
    {
      type: "mapping_table",
      title: "Page table mapping",
      columns: ["virtual page", "physical frame"],
      rows: [["VPN 0x10", "PFN 0xA0"]],
      annotations: ["page table은 가상 주소를 물리 프레임으로 바꿉니다."],
    },
  ]),
  detailFixture("syscall", "flow_pipeline", [
    {
      type: "flow_pipeline",
      title: "System call path",
      steps: [
        { label: "user call", description: "사용자 프로세스가 요청합니다.", layer: "user" },
        { label: "kernel handler", description: "커널 핸들러가 처리합니다.", layer: "kernel" },
      ],
      annotations: ["시스템 콜은 권한 경계를 넘는 요청 흐름입니다."],
    },
  ]),
  detailFixture("CPU scheduling", "timeline", [
    {
      type: "timeline",
      title: "CPU scheduling order",
      lanes: ["process A", "kernel", "process B"],
      events: [
        { time_label: "t0", lane: "process A", label: "running" },
        { time_label: "t1", lane: "kernel", label: "context switch" },
        { time_label: "t2", lane: "process B", label: "running" },
      ],
      annotations: ["스케줄링은 시간에 따라 실행 주체가 바뀌는 과정입니다."],
    },
  ]),
  detailFixture("VFS stack", "layer_stack", [
    {
      type: "layer_stack",
      title: "VFS to device stack",
      layers: [
        { label: "VFS", description: "공통 파일 인터페이스" },
        { label: "file system", description: "파일 시스템별 처리" },
        { label: "block layer", description: "블록 요청 큐 관리" },
        { label: "device driver", description: "장치 명령 전송" },
      ],
      annotations: ["파일 요청은 위 계층에서 아래 계층으로 내려갑니다."],
    },
  ]),
  detailFixture("B-tree", "tree_graph", [
    {
      type: "tree_graph",
      title: "B-tree shape",
      nodes: [
        { id: "root", label: "root" },
        { id: "leaf", label: "leaf" },
      ],
      edges: [{ from: "root", to: "leaf", label: "points to" }],
      annotations: ["탐색은 root에서 leaf로 내려갑니다."],
    },
  ]),
  detailFixture("process state", "state_machine", [
    {
      type: "state_machine",
      title: "Process lifecycle",
      states: [
        { id: "ready", label: "Ready" },
        { id: "running", label: "Running" },
      ],
      transitions: [{ from: "ready", to: "running", label: "scheduled" }],
      annotations: ["프로세스는 이벤트에 따라 상태가 바뀝니다."],
    },
  ]),
  detailFixture("process vs thread", "compare_matrix", [
    {
      type: "compare_matrix",
      title: "Process vs Thread",
      columns: ["Process", "Thread"],
      rows: [{ criterion: "memory", values: ["독립 주소 공간", "주소 공간 공유"] }],
      annotations: ["비슷한 개념은 같은 기준으로 비교합니다."],
    },
  ]),
  // Phase 17: 단계별 풀이(worked_example) fixture.
  // 주소 변환은 "문제 → 단계 → 최종 답"이 분명한 계산형 개념이라 worked_example에 적합하다.
  // decision.skill == "worked_example"와 block.type이 일치해야 required-visual 정책을 만족한다.
  detailFixture("address translation", "worked_example", [
    {
      type: "worked_example",
      title: "가상 주소 변환",
      problem: "페이지 크기 4KB, VPN 2의 물리 프레임이 5일 때 가상 주소 0x2A50의 물리 주소는?",
      steps: [
        {
          label: "VPN과 offset 분리",
          explanation: "하위 12비트가 offset, 나머지가 VPN입니다.",
          intermediate_value: "VPN=2, offset=0xA50",
        },
        {
          label: "프레임 번호 조회",
          explanation: "페이지 테이블에서 VPN 2 → PFN 5를 찾습니다.",
          intermediate_value: "PFN=5",
        },
        {
          label: "물리 주소 조립",
          explanation: "PFN을 12비트 왼쪽으로 옮기고 offset을 더합니다.",
          intermediate_value: "0x5A50",
        },
      ],
      final_answer: "물리 주소는 0x5A50입니다.",
      common_mistake: "offset까지 변환하려 하지만 offset은 그대로 유지됩니다.",
      annotations: ["주소 변환은 offset을 보존합니다."],
    },
  ]),
  detailFixture("abstract concept", "none", []),
];

export const legacyDetailWithoutVisualFields = {
  node_id: "legacy-detail",
  title: "legacy detail",
  type: "core",
  why_it_matters: "기존 저장 데이터입니다.",
  easy_explanation: "visual field가 없는 상세 설명입니다.",
  analogy: "",
  example: "example",
  common_misconceptions: [],
  check_questions: [],
  next_nodes: [],
};
