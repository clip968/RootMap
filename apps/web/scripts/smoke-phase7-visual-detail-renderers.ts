import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisualBlockRenderer } from "../src/components/visual-blocks/visual-block-renderer";
import type {
  LinearSpaceVisualBlock,
  MappingTableVisualBlock,
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

console.log("Phase 07 visual detail renderer smoke passed");
