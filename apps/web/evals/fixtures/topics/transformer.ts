// 골든 주제 픽스처: Transformer
// 트리 생성 결과를 채점할 때의 "정답 기준". 사람이 직접 큐레이션한다.
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const transformerFixture: TreeEvalFixture = {
  topic: "Transformer",
  expected_concepts: [
    "attention",
    "self-attention",
    "query key value",
    "softmax",
    "positional encoding",
    "multi-head attention",
    "feed-forward network",
    "encoder",
    "decoder",
    "embedding",
    "residual connection",
  ],
  required_edges: [
    {
      from: "embedding",
      to: "self-attention",
      reason: "토큰을 벡터로 바꾼 뒤에야 attention 계산이 가능하다",
    },
    {
      from: "softmax",
      to: "attention",
      reason: "attention 가중치는 softmax 정규화로 구한다",
    },
    {
      from: "attention",
      to: "self-attention",
      reason: "self-attention은 attention 메커니즘의 한 형태다",
    },
    {
      from: "self-attention",
      to: "multi-head attention",
      reason: "멀티헤드는 self-attention을 여러 번 병렬로 수행한다",
    },
  ],
  forbidden_edges: [
    {
      from: "multi-head attention",
      to: "attention",
      reason: "기본 attention이 멀티헤드의 선수이지 그 반대가 아니다",
    },
    {
      from: "decoder",
      to: "embedding",
      reason: "임베딩이 디코더의 선수이지 그 반대가 아니다",
    },
  ],
  beginner_misconceptions: [
    "attention과 self-attention을 같은 것으로 본다",
    "positional encoding 없이도 순서 정보가 유지된다고 생각한다",
  ],
  required_examples: [
    "query·key·value 행렬로 attention score를 계산하는 예",
    "문장 안에서 단어 간 attention 가중치를 시각화하는 예",
  ],
};
