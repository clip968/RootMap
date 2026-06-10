// 골든 주제 픽스처: B-tree index
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const btreeIndexFixture: TreeEvalFixture = {
  topic: "B-tree index",
  expected_concepts: [
    "B-tree",
    "node",
    "key",
    "leaf node",
    "internal node",
    "balanced tree",
    "node split",
    "disk page",
    "range query",
  ],
  required_edges: [
    {
      from: "balanced tree",
      to: "B-tree",
      reason: "B-tree는 균형 트리의 한 형태다",
    },
    {
      from: "node",
      to: "leaf node",
      reason: "리프 노드는 노드의 특수한 경우다",
    },
    {
      from: "node",
      to: "internal node",
      reason: "내부 노드도 노드 개념을 전제로 한다",
    },
    {
      from: "B-tree",
      to: "range query",
      reason: "범위 질의 효율은 B-tree 구조에서 비롯된다",
    },
  ],
  forbidden_edges: [
    {
      from: "node split",
      to: "B-tree",
      reason: "분할은 B-tree 연산이지 그 선수가 아니다",
    },
    {
      from: "range query",
      to: "key",
      reason: "키 개념이 범위 질의의 선수다",
    },
  ],
  beginner_misconceptions: [
    "B-tree와 binary tree를 같은 것으로 본다",
    "B-tree의 B가 binary를 뜻한다고 생각한다",
  ],
  required_examples: [
    "노드가 가득 차면 분할되어 트리 높이가 증가하는 예",
    "범위 질의에서 리프 노드를 순차 탐색하는 예",
  ],
};
