import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisualBlockRenderer } from "../src/components/visual-blocks/visual-block-renderer";
import type {
  FlowPipelineVisualBlock,
  LayerStackVisualBlock,
  LinearSpaceVisualBlock,
  MappingTableVisualBlock,
  TimelineVisualBlock,
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

console.log("Phase 07 visual detail renderer smoke passed");
