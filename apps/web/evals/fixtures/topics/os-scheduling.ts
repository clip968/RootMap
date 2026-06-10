// 골든 주제 픽스처: 운영체제 스케줄링
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const osSchedulingFixture: TreeEvalFixture = {
  topic: "운영체제 스케줄링",
  expected_concepts: [
    "process",
    "CPU scheduler",
    "context switch",
    "time quantum",
    "ready queue",
    "preemption",
    "round robin",
    "priority scheduling",
    "starvation",
    "throughput",
  ],
  required_edges: [
    {
      from: "process",
      to: "CPU scheduler",
      reason: "스케줄링 대상인 프로세스 개념이 전제다",
    },
    {
      from: "context switch",
      to: "preemption",
      reason: "선점은 문맥 교환을 동반한다",
    },
    {
      from: "ready queue",
      to: "round robin",
      reason: "준비 큐 위에서 라운드 로빈이 동작한다",
    },
    {
      from: "ready queue",
      to: "priority scheduling",
      reason: "우선순위 스케줄링도 준비 큐 관리 위에서 동작한다",
    },
  ],
  forbidden_edges: [
    {
      from: "round robin",
      to: "ready queue",
      reason: "준비 큐 개념이 라운드 로빈의 선수다",
    },
    {
      from: "preemption",
      to: "context switch",
      reason: "문맥 교환이 선점 이해의 선수다",
    },
  ],
  beginner_misconceptions: [
    "선점(preemption)과 문맥 교환(context switch)을 같은 것으로 본다",
    "throughput이 높으면 항상 응답 시간도 좋다고 생각한다",
  ],
  required_examples: [
    "타임 퀀텀 만료로 라운드 로빈이 다음 프로세스로 전환하는 예",
    "우선순위 스케줄링에서 낮은 우선순위 프로세스가 starvation을 겪는 예",
  ],
};
