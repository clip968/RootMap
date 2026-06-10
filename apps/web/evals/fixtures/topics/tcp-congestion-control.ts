// 골든 주제 픽스처: TCP congestion control
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const tcpCongestionControlFixture: TreeEvalFixture = {
  topic: "TCP congestion control",
  expected_concepts: [
    "congestion window",
    "slow start",
    "congestion avoidance",
    "fast retransmit",
    "fast recovery",
    "acknowledgment",
    "packet loss",
    "round trip time",
    "AIMD",
    "ssthresh",
  ],
  required_edges: [
    {
      from: "congestion window",
      to: "slow start",
      reason: "slow start는 혼잡 윈도우를 키우는 단계다",
    },
    {
      from: "slow start",
      to: "congestion avoidance",
      reason: "임계값(ssthresh) 도달 후 혼잡 회피로 전환한다",
    },
    {
      from: "packet loss",
      to: "fast retransmit",
      reason: "손실 감지가 빠른 재전송의 전제다",
    },
    {
      from: "fast retransmit",
      to: "fast recovery",
      reason: "빠른 재전송 후 빠른 회복 단계로 이어진다",
    },
  ],
  forbidden_edges: [
    {
      from: "congestion avoidance",
      to: "slow start",
      reason: "slow start가 먼저이고 그 반대가 아니다",
    },
    {
      from: "fast recovery",
      to: "packet loss",
      reason: "패킷 손실 개념이 fast recovery의 선수다",
    },
  ],
  beginner_misconceptions: [
    "혼잡 제어와 흐름 제어(flow control)를 같은 것으로 본다",
    "congestion window가 수신자 윈도우와 같다고 생각한다",
  ],
  required_examples: [
    "slow start에서 cwnd가 지수적으로 증가하다가 ssthresh에서 선형 증가로 전환하는 예",
    "3개의 중복 ACK로 패킷 손실을 감지하는 예",
  ],
};
