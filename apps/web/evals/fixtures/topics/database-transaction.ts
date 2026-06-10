// 골든 주제 픽스처: 데이터베이스 트랜잭션
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const databaseTransactionFixture: TreeEvalFixture = {
  topic: "데이터베이스 트랜잭션",
  expected_concepts: [
    "transaction",
    "ACID",
    "atomicity",
    "consistency",
    "isolation",
    "durability",
    "commit",
    "rollback",
    "isolation level",
    "lock",
    "deadlock",
  ],
  required_edges: [
    {
      from: "transaction",
      to: "ACID",
      reason: "ACID는 트랜잭션이 보장하는 성질이다",
    },
    {
      from: "atomicity",
      to: "rollback",
      reason: "원자성 보장을 위해 rollback이 필요하다",
    },
    {
      from: "isolation",
      to: "isolation level",
      reason: "격리성 개념 위에서 격리 수준이 정의된다",
    },
    {
      from: "lock",
      to: "deadlock",
      reason: "교착은 잠금 획득 과정에서 발생한다",
    },
  ],
  forbidden_edges: [
    {
      from: "ACID",
      to: "transaction",
      reason: "트랜잭션 개념이 ACID의 선수다",
    },
    {
      from: "deadlock",
      to: "lock",
      reason: "잠금 개념이 교착의 선수다",
    },
  ],
  beginner_misconceptions: [
    "isolation level이 높을수록 항상 좋다고 생각한다",
    "commit하면 동시성 문제도 자동으로 사라진다고 본다",
  ],
  required_examples: [
    "계좌 이체에서 출금·입금이 모두 성공하거나 모두 취소되는 예",
    "두 트랜잭션이 서로의 잠금을 기다리는 deadlock 예",
  ],
};
