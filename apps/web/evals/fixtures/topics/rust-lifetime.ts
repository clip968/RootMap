// 골든 주제 픽스처: Rust lifetime
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const rustLifetimeFixture: TreeEvalFixture = {
  topic: "Rust lifetime",
  expected_concepts: [
    "ownership",
    "borrowing",
    "reference",
    "lifetime",
    "lifetime annotation",
    "borrow checker",
    "dangling reference",
    "mutable reference",
    "scope",
    "'static lifetime",
  ],
  required_edges: [
    {
      from: "ownership",
      to: "borrowing",
      reason: "빌림은 소유권 규칙 위에서 동작한다",
    },
    {
      from: "borrowing",
      to: "lifetime",
      reason: "참조의 유효 구간을 따지는 것이 lifetime이다",
    },
    {
      from: "reference",
      to: "lifetime annotation",
      reason: "참조가 있어야 수명 표기가 의미를 가진다",
    },
    {
      from: "scope",
      to: "lifetime",
      reason: "수명은 스코프(유효 범위) 개념 위에서 정의된다",
    },
  ],
  forbidden_edges: [
    {
      from: "lifetime",
      to: "ownership",
      reason: "소유권이 수명의 선수이지 그 반대가 아니다",
    },
    {
      from: "borrow checker",
      to: "borrowing",
      reason: "빌림 개념이 borrow checker 이해의 선수다",
    },
  ],
  beginner_misconceptions: [
    "lifetime annotation이 값의 실제 수명을 바꾼다고 생각한다",
    "borrow checker 에러를 런타임 에러로 오해한다",
  ],
  required_examples: [
    "함수 시그니처에 'a lifetime을 달아 입력·출력 참조 수명을 연결하는 예",
    "dangling reference가 컴파일 단계에서 막히는 예",
  ],
};
