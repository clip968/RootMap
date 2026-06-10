// 골든 주제 픽스처: 분산 시스템 consensus
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const distributedConsensusFixture: TreeEvalFixture = {
  topic: "분산 시스템 consensus",
  expected_concepts: [
    "consensus",
    "replication",
    "leader election",
    "quorum",
    "log replication",
    "Raft",
    "Paxos",
    "fault tolerance",
    "split-brain",
    "majority",
    "term",
  ],
  required_edges: [
    {
      from: "replication",
      to: "consensus",
      reason: "복제된 상태를 합의로 일치시킨다",
    },
    {
      from: "quorum",
      to: "consensus",
      reason: "정족수 동의로 합의를 확정한다",
    },
    {
      from: "majority",
      to: "quorum",
      reason: "과반수 개념 위에서 정족수가 정의된다",
    },
    {
      from: "leader election",
      to: "log replication",
      reason: "리더가 정해져야 로그 복제가 진행된다",
    },
  ],
  forbidden_edges: [
    {
      from: "Raft",
      to: "consensus",
      reason: "consensus 개념이 Raft의 선수다",
    },
    {
      from: "consensus",
      to: "quorum",
      reason: "정족수 개념이 합의의 선수다",
    },
  ],
  beginner_misconceptions: [
    "consensus와 단순 다수결 투표를 같은 것으로 본다",
    "리더가 있으면 split-brain이 절대 안 생긴다고 생각한다",
  ],
  required_examples: [
    "과반 노드가 동의해야 로그 엔트리가 커밋되는 예",
    "네트워크 분할로 두 리더가 생기는 split-brain 상황",
  ],
};
