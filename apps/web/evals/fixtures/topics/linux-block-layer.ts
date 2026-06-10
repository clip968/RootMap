// 골든 주제 픽스처: Linux block layer
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const linuxBlockLayerFixture: TreeEvalFixture = {
  topic: "Linux block layer",
  expected_concepts: [
    "block device",
    "I/O request",
    "request queue",
    "I/O scheduler",
    "bio",
    "request merging",
    "block size",
    "device driver",
    "sector",
    "page cache",
  ],
  required_edges: [
    {
      from: "sector",
      to: "block device",
      reason: "섹터 개념 위에서 블록 장치 추상화가 정의된다",
    },
    {
      from: "block device",
      to: "I/O request",
      reason: "블록 장치 추상화 위에서 I/O 요청이 생성된다",
    },
    {
      from: "I/O request",
      to: "request queue",
      reason: "요청이 있어야 큐에 쌓을 수 있다",
    },
    {
      from: "request queue",
      to: "I/O scheduler",
      reason: "스케줄러는 요청 큐를 정렬·병합한다",
    },
  ],
  forbidden_edges: [
    {
      from: "I/O scheduler",
      to: "I/O request",
      reason: "요청 개념이 스케줄러의 선수다",
    },
    {
      from: "request merging",
      to: "bio",
      reason: "bio 구조가 병합의 선수이지 그 반대가 아니다",
    },
  ],
  beginner_misconceptions: [
    "블록 계층과 파일 시스템 계층을 같은 것으로 본다",
    "I/O 스케줄러가 CPU 스케줄러와 같다고 생각한다",
  ],
  required_examples: [
    "인접한 섹터 요청들이 하나의 요청으로 병합되는 예",
    "bio가 request queue를 거쳐 디바이스 드라이버로 전달되는 흐름",
  ],
};
