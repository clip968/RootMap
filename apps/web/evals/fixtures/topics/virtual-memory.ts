// 골든 주제 픽스처: 가상 메모리
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const virtualMemoryFixture: TreeEvalFixture = {
  topic: "가상 메모리",
  expected_concepts: [
    "page",
    "page table",
    "TLB",
    "page fault",
    "virtual address",
    "physical address",
    "address translation",
    "page number",
    "offset",
    "demand paging",
  ],
  required_edges: [
    {
      from: "page",
      to: "page table",
      reason: "page 개념 위에서 page table이 정의된다",
    },
    {
      from: "page table",
      to: "address translation",
      reason: "주소 변환은 page table 조회가 전제다",
    },
    {
      from: "virtual address",
      to: "address translation",
      reason: "가상 주소가 있어야 변환이 의미를 가진다",
    },
    {
      from: "page number",
      to: "address translation",
      reason: "page number로 page table을 색인해야 변환이 가능하다",
    },
  ],
  forbidden_edges: [
    {
      from: "page fault",
      to: "page",
      reason: "page fault가 page 개념의 선수일 수 없다",
    },
    {
      from: "TLB",
      to: "page table",
      reason: "page table이 TLB 이해의 선수이지 그 반대가 아니다",
    },
  ],
  beginner_misconceptions: [
    "TLB miss와 page fault를 같은 것으로 본다",
    "가상 주소가 곧 물리 주소라고 생각한다",
  ],
  required_examples: [
    "가상 주소를 page number와 offset으로 분리하는 예",
    "page fault 발생 시 디스크에서 page를 적재하는 과정",
  ],
};
