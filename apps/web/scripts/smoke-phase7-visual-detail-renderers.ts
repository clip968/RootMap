import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisualBlockRenderer } from "../src/components/visual-blocks/visual-block-renderer";
import { phase7VisualDetailFixtures } from "./fixtures/phase7-visual-detail-fixtures";
import type {
  CompareMatrixVisualBlock,
  FlowPipelineVisualBlock,
  LayerStackVisualBlock,
  LinearSpaceVisualBlock,
  MappingTableVisualBlock,
  StateMachineVisualBlock,
  TimelineVisualBlock,
  TreeGraphVisualBlock,
  WorkedExampleVisualBlock,
} from "../src/lib/visualization/visual-block-schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const skillArg = process.argv.find((arg) => arg.startsWith("--skill="));
const enabledSkills = new Set((skillArg?.replace("--skill=", "") ?? "").split(",").filter(Boolean));

function shouldRun(skill: string): boolean {
  return enabledSkills.size === 0 || enabledSkills.has(skill);
}

function render(blocks: unknown[]): string {
  return renderToStaticMarkup(createElement(VisualBlockRenderer, { blocks }));
}

for (const fixture of phase7VisualDetailFixtures) {
  if (!shouldRun(fixture.expectedSkill)) continue;
  const markup = render(fixture.detail.visual_blocks ?? []);
  if (fixture.shouldRender) {
    const title = fixture.detail.visual_blocks?.[0]?.title ?? fixture.detail.title;
    assert(markup.includes(title), `${fixture.name} fixture should render title`);
    assert(markup.length > 0, `${fixture.name} fixture should render markup`);
  } else {
    assert(markup.length === 0, `${fixture.name} fixture should render empty fallback`);
  }
}

if (shouldRun("linear_space")) {
  const lba: LinearSpaceVisualBlock = {
    type: "linear_space",
    title: "LBA 공간",
    unit: "block",
    block_size_bytes: 4096,
    total_units_hint: 1024,
    highlighted_ranges: [
      {
        label: "read request",
        start: 100,
        length: 3,
        note: "LBA 100부터 3개 블록을 읽는다.",
      },
    ],
    annotations: ["LBA는 byte 주소가 아니라 block 번호다."],
  };

  const virtualAddress: LinearSpaceVisualBlock = {
    type: "linear_space",
    title: "Virtual address space",
    unit: "page",
    highlighted_ranges: [
      { label: "code", start: 0, length: 2 },
      { label: "heap", start: 16, length: 4 },
    ],
    annotations: ["주소 공간은 연속된 번호처럼 볼 수 있다."],
  };

  const lbaMarkup = render([lba]);
  assert(lbaMarkup.includes("LBA 공간"), "LBA title should render");
  assert(lbaMarkup.includes("byte offset"), "LBA byte offset formula should render");
  assert(lbaMarkup.includes("409,600"), "LBA byte offset value should render");
  assert(lbaMarkup.includes("421,887"), "LBA byte end value should render");

  const virtualMarkup = render([virtualAddress]);
  assert(virtualMarkup.includes("Virtual address space"), "virtual address title should render");
  assert(virtualMarkup.includes("code"), "first range should render");
  assert(virtualMarkup.includes("heap"), "second range should render");

  const invalidRangeMarkup = render([
    {
      ...lba,
      highlighted_ranges: [{ label: "bad", start: -1, length: 3 }],
    },
  ]);
  assert(!invalidRangeMarkup.includes("bad"), "invalid negative range should not render");
}

if (shouldRun("mapping_table")) {
  const pageTable: MappingTableVisualBlock = {
    type: "mapping_table",
    title: "Page table mapping",
    columns: ["virtual page", "physical frame", "permission"],
    rows: [
      ["VPN 0x10", "PFN 0xA0", "read/write"],
      ["VPN 0x11", "PFN 0xA1", "read only"],
    ],
    annotations: ["page table은 가상 주소를 물리 프레임으로 바꾼다."],
  };

  const inodeToBlock: MappingTableVisualBlock = {
    type: "mapping_table",
    title: "inode to data block",
    columns: ["inode entry", "data block"],
    rows: [
      ["direct[0]", "block 812"],
      ["direct[1]", "block 813"],
    ],
    annotations: ["inode 항목은 실제 데이터 블록 위치를 가리킨다."],
  };

  const pageTableMarkup = render([pageTable]);
  assert(pageTableMarkup.includes("<table"), "page table should render a table");
  assert(pageTableMarkup.includes("VPN 0x10"), "page table row should render");
  assert(pageTableMarkup.includes("physical frame"), "page table header should render");

  const inodeMarkup = render([inodeToBlock]);
  assert(inodeMarkup.includes("inode to data block"), "inode mapping title should render");
  assert(inodeMarkup.includes("direct[0]"), "inode mapping row should render");

  const invalidRowMarkup = render([
    {
      ...pageTable,
      rows: [["VPN 0x10", "PFN 0xA0"]],
    },
  ]);
  assert(!invalidRowMarkup.includes("<table"), "invalid row shape should not render");
}

if (shouldRun("flow_pipeline")) {
  const syscall: FlowPipelineVisualBlock = {
    type: "flow_pipeline",
    title: "System call path",
    steps: [
      { label: "user call", description: "프로세스가 시스템 콜을 호출한다.", layer: "user" },
      { label: "trap", description: "CPU가 커널 모드로 전환한다.", layer: "boundary" },
      { label: "handler", description: "커널 핸들러가 요청을 처리한다.", layer: "kernel" },
    ],
    annotations: ["시스템 콜은 권한 경계를 넘는 요청 흐름이다."],
  };

  const blockIo: FlowPipelineVisualBlock = {
    type: "flow_pipeline",
    title: "Block I/O path",
    steps: [
      { label: "VFS", description: "파일 요청을 받는다." },
      { label: "file system", description: "블록 위치를 찾는다." },
      { label: "block layer", description: "요청을 큐에 넣는다." },
      { label: "driver", description: "장치 명령으로 변환한다." },
    ],
    annotations: ["요청은 계층을 지나며 더 구체적인 장치 작업이 된다."],
  };

  const syscallMarkup = render([syscall]);
  assert(syscallMarkup.includes("System call path"), "syscall title should render");
  assert(syscallMarkup.includes("trap"), "syscall step should render");
  assert(syscallMarkup.includes("kernel"), "syscall layer should render");

  const blockIoMarkup = render([blockIo]);
  assert(blockIoMarkup.includes("Block I/O path"), "block I/O title should render");
  assert(blockIoMarkup.includes("block layer"), "block I/O step should render");
}

if (shouldRun("timeline")) {
  const scheduling: TimelineVisualBlock = {
    type: "timeline",
    title: "CPU scheduling order",
    lanes: ["process A", "kernel", "process B"],
    events: [
      { time_label: "t0", lane: "process A", label: "running" },
      { time_label: "t1", lane: "kernel", label: "save context" },
      { time_label: "t2", lane: "process B", label: "resume" },
    ],
    annotations: ["스케줄링은 실행 주체가 시간에 따라 바뀌는 과정이다."],
  };

  const race: TimelineVisualBlock = {
    type: "timeline",
    title: "Race condition",
    events: [
      { time_label: "1", label: "thread A reads", description: "A가 이전 값을 읽는다." },
      { time_label: "1", label: "thread B reads", description: "B도 같은 값을 읽는다." },
      { time_label: "2", label: "lost update", description: "한쪽 갱신이 사라진다." },
    ],
    annotations: ["같은 시점의 이벤트 순서가 결과를 바꿀 수 있다."],
  };

  const schedulingMarkup = render([scheduling]);
  assert(schedulingMarkup.includes("CPU scheduling order"), "scheduling title should render");
  assert(schedulingMarkup.includes("process A"), "timeline lane should render");
  assert(schedulingMarkup.includes("save context"), "timeline event should render");

  const raceMarkup = render([race]);
  assert(raceMarkup.includes("Race condition"), "race title should render");
  assert(raceMarkup.includes("thread A reads"), "race event should render");
  assert(raceMarkup.indexOf("thread A reads") < raceMarkup.indexOf("thread B reads"), "same-time order should be preserved");
}

if (shouldRun("layer_stack")) {
  const vfsStack: LayerStackVisualBlock = {
    type: "layer_stack",
    title: "VFS to device stack",
    layers: [
      { label: "VFS", description: "공통 파일 인터페이스" },
      { label: "file system", description: "파일 시스템별 블록 계산" },
      { label: "block layer", description: "블록 요청 큐 관리" },
      { label: "device driver", description: "장치 명령 전송" },
    ],
    annotations: ["파일 요청은 위 계층에서 아래 계층으로 내려간다."],
  };

  const tcpStack: LayerStackVisualBlock = {
    type: "layer_stack",
    title: "TCP/IP stack",
    layers: [
      { label: "Application", description: "앱 프로토콜" },
      { label: "TCP", description: "연결과 재전송" },
      { label: "IP", description: "주소와 라우팅" },
      { label: "Link", description: "프레임 전송" },
    ],
    annotations: ["각 계층은 바로 아래 계층을 사용한다."],
  };

  const vfsMarkup = render([vfsStack]);
  assert(vfsMarkup.includes("VFS to device stack"), "VFS stack title should render");
  assert(vfsMarkup.includes("device driver"), "VFS stack layer should render");
  assert(vfsMarkup.includes("아래 계층으로"), "layer direction should render");

  const tcpMarkup = render([tcpStack]);
  assert(tcpMarkup.includes("TCP/IP stack"), "TCP/IP title should render");
  assert(tcpMarkup.includes("Application"), "TCP/IP first layer should render");
}

if (shouldRun("tree_graph")) {
  const btree: TreeGraphVisualBlock = {
    type: "tree_graph",
    title: "B-tree shape",
    nodes: [
      { id: "root", label: "root" },
      { id: "left", label: "left leaf" },
      { id: "right", label: "right leaf" },
    ],
    edges: [
      { from: "root", to: "left", label: "< key" },
      { from: "root", to: "right", label: ">= key" },
    ],
    annotations: ["B-tree 탐색은 root에서 leaf로 내려간다."],
  };

  const waitFor: TreeGraphVisualBlock = {
    type: "tree_graph",
    title: "Wait-for graph",
    nodes: [
      { id: "tx-a", label: "Tx A" },
      { id: "tx-b", label: "Tx B" },
    ],
    edges: [{ from: "tx-a", to: "tx-b", label: "waits for" }],
    annotations: ["순환이 생기면 deadlock 후보가 된다."],
  };

  const btreeMarkup = render([btree]);
  assert(btreeMarkup.includes("B-tree shape"), "B-tree title should render");
  assert(btreeMarkup.includes("left leaf"), "B-tree node should render");
  assert(btreeMarkup.includes("&lt; key"), "B-tree edge label should render");

  const waitForMarkup = render([waitFor]);
  assert(waitForMarkup.includes("Wait-for graph"), "wait-for title should render");
  assert(waitForMarkup.includes("waits for"), "wait-for edge should render");
}

if (shouldRun("state_machine")) {
  const processState: StateMachineVisualBlock = {
    type: "state_machine",
    title: "Process lifecycle",
    states: [
      { id: "ready", label: "Ready", description: "CPU를 기다린다." },
      { id: "running", label: "Running", description: "CPU에서 실행 중이다." },
      { id: "blocked", label: "Blocked", description: "I/O를 기다린다." },
    ],
    transitions: [
      { from: "ready", to: "running", label: "scheduled" },
      { from: "running", to: "blocked", label: "wait I/O" },
      { from: "blocked", to: "ready", label: "I/O done" },
    ],
    annotations: ["프로세스는 이벤트에 따라 상태가 바뀐다."],
  };

  const tcpState: StateMachineVisualBlock = {
    type: "state_machine",
    title: "TCP connection states",
    states: [
      { id: "closed", label: "CLOSED" },
      { id: "listen", label: "LISTEN" },
      { id: "established", label: "ESTABLISHED" },
    ],
    transitions: [
      { from: "closed", to: "listen", label: "listen()" },
      { from: "listen", to: "established", label: "handshake" },
      { from: "established", to: "established", label: "data transfer" },
    ],
    annotations: ["TCP 연결은 상태 전이로 이해할 수 있다."],
  };

  const processMarkup = render([processState]);
  assert(processMarkup.includes("Process lifecycle"), "process state title should render");
  assert(processMarkup.includes("scheduled"), "process transition should render");
  assert(processMarkup.includes("Blocked"), "process state should render");

  const tcpMarkup = render([tcpState]);
  assert(tcpMarkup.includes("TCP connection states"), "TCP state title should render");
  assert(tcpMarkup.includes("data transfer"), "self-loop transition should render");
}

if (shouldRun("compare_matrix")) {
  const processThread: CompareMatrixVisualBlock = {
    type: "compare_matrix",
    title: "Process vs Thread",
    columns: ["Process", "Thread"],
    rows: [
      { criterion: "memory", values: ["독립 주소 공간", "주소 공간 공유"] },
      { criterion: "switching", values: ["상대적으로 무거움", "상대적으로 가벼움"] },
    ],
    annotations: ["비슷한 개념은 같은 기준으로 나란히 비교한다."],
  };

  const pollingInterrupt: CompareMatrixVisualBlock = {
    type: "compare_matrix",
    title: "Polling vs Interrupt",
    columns: ["Polling", "Interrupt"],
    rows: [
      { criterion: "trigger", values: ["CPU가 반복 확인", "장치가 알림"] },
      { criterion: "cost", values: ["CPU 낭비 가능", "전환 비용 발생"] },
    ],
    annotations: ["둘 다 완료 확인 방식이지만 주도권이 다르다."],
  };

  const processThreadMarkup = render([processThread]);
  assert(processThreadMarkup.includes("Process vs Thread"), "compare title should render");
  assert(processThreadMarkup.includes("독립 주소 공간"), "compare value should render");
  assert(processThreadMarkup.includes("data-label=\"Process\""), "compare mobile labels should render");

  const pollingMarkup = render([pollingInterrupt]);
  assert(pollingMarkup.includes("Polling vs Interrupt"), "polling comparison should render");
  assert(pollingMarkup.includes("CPU가 반복 확인"), "polling value should render");
}

if (shouldRun("worked_example")) {
  // 주소 변환: 중간 계산값(intermediate_value)과 common_mistake가 모두 있는 케이스.
  const addressTranslation: WorkedExampleVisualBlock = {
    type: "worked_example",
    title: "가상 주소 변환",
    problem: "페이지 크기 4KB, VPN 2의 물리 프레임이 5일 때 가상 주소 0x2A50의 물리 주소는?",
    steps: [
      {
        label: "VPN과 offset 분리",
        explanation: "하위 12비트가 offset, 나머지가 VPN이다.",
        intermediate_value: "VPN=2, offset=0xA50",
      },
      {
        label: "프레임 번호 조회",
        explanation: "페이지 테이블에서 VPN 2 → PFN 5를 찾는다.",
        intermediate_value: "PFN=5",
      },
      {
        label: "물리 주소 조립",
        explanation: "PFN을 12비트 왼쪽으로 옮기고 offset을 더한다.",
        intermediate_value: "0x5A50",
      },
    ],
    final_answer: "물리 주소는 0x5A50이다.",
    common_mistake: "offset까지 변환하려 하지만 offset은 그대로 유지된다.",
    annotations: ["주소 변환은 offset을 보존한다."],
  };

  // B-tree 삽입: common_mistake와 intermediate_value가 없는 최소 케이스(선택 필드 생략 검증).
  const btreeInsert: WorkedExampleVisualBlock = {
    type: "worked_example",
    title: "B-tree 삽입",
    problem: "차수 3인 B-tree의 가득 찬 노드에 키를 넣으면?",
    steps: [
      { label: "중앙 키 선택", explanation: "노드의 중앙 키를 고른다." },
      { label: "분할", explanation: "노드를 둘로 나눈다." },
      { label: "승격", explanation: "중앙 키를 부모로 올린다." },
    ],
    final_answer: "노드가 분할되고 중앙 키가 부모로 승격된다.",
    annotations: ["가득 찬 노드는 분할로 높이를 키운다."],
  };

  const addressMarkup = render([addressTranslation]);
  assert(addressMarkup.includes("가상 주소 변환"), "worked_example title should render");
  assert(addressMarkup.includes("문제"), "worked_example problem tag should render");
  assert(addressMarkup.includes("0x5A50"), "worked_example final answer should render");
  assert(addressMarkup.includes("0xA50"), "worked_example intermediate value should render");
  assert(addressMarkup.includes("자주 하는 실수"), "worked_example common_mistake should render");
  // 단계 순서가 보존되어야 한다(VPN 분리가 프레임 조회보다 먼저).
  assert(
    addressMarkup.indexOf("VPN과 offset 분리") < addressMarkup.indexOf("프레임 번호 조회"),
    "worked_example step order should be preserved",
  );

  const btreeMarkup = render([btreeInsert]);
  assert(btreeMarkup.includes("B-tree 삽입"), "minimal worked_example title should render");
  assert(btreeMarkup.includes("중앙 키가 부모로"), "minimal worked_example answer should render");
  // common_mistake가 없으면 "자주 하는 실수" 영역이 렌더되지 않아야 한다.
  assert(
    !btreeMarkup.includes("자주 하는 실수"),
    "worked_example without common_mistake should omit the mistake section",
  );

  // steps가 비어 있으면(schema 위반) 렌더되지 않고 빈 fallback이어야 한다.
  const invalidMarkup = render([
    {
      type: "worked_example",
      title: "빈 풀이",
      problem: "문제만 있고 단계가 없다.",
      steps: [],
      final_answer: "답",
      annotations: [],
    },
  ]);
  assert(!invalidMarkup.includes("빈 풀이"), "worked_example without steps should not render");
}

console.log("Phase 07 visual detail renderer smoke passed");
