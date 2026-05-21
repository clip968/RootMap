import type { ProgressStatus } from "@/types/learning";

export type MasteryStatus = ProgressStatus;

const INITIAL_CONFIDENCE_BY_STATUS: Record<MasteryStatus, number> = {
  known: 0.8,
  partial: 0.5,
  unknown: 0.1,
};

/** confidence_score는 추천·복습 계산의 입력이므로 모든 진입점에서 0~1 범위로 고정한다. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

/** Phase 4 명세 §15.3의 score→status 단일 변환 함수다. */
export function convertScoreToStatus(score: number): MasteryStatus {
  const clamped = clampScore(score);
  if (clamped >= 0.75) return "known";
  if (clamped >= 0.4) return "partial";
  return "unknown";
}

export function initialConfidenceForStatus(status: MasteryStatus): number {
  return INITIAL_CONFIDENCE_BY_STATUS[status];
}

export interface SelfAssessmentResult {
  status: MasteryStatus;
  confidenceScore: number;
}

/**
 * 자기 평가는 사용자가 직접 고른 신호라 즉시 반영하되, 기존 점수를 완전히 무시하지 않는다.
 * 새 mastery row를 만들 때만 §6.2 권장 초기값을 사용하고, 기존 row는 §15.1 보정 규칙을 적용한다.
 */
export function applySelfAssessment(
  currentScore: number,
  selectedStatus: MasteryStatus,
  hasExistingMastery: boolean,
): SelfAssessmentResult {
  if (!hasExistingMastery) {
    return {
      status: selectedStatus,
      confidenceScore: initialConfidenceForStatus(selectedStatus),
    };
  }

  const clamped = clampScore(currentScore);
  if (selectedStatus === "known") {
    return {
      status: "known",
      confidenceScore: Math.max(clamped, 0.75),
    };
  }
  if (selectedStatus === "partial") {
    return {
      status: "partial",
      confidenceScore: Math.max(Math.min(clamped, 0.6), 0.4),
    };
  }
  return {
    status: "unknown",
    confidenceScore: Math.min(clamped, 0.25),
  };
}

export function shouldNeedReview(
  status: MasteryStatus,
  confidenceScore: number,
): boolean {
  return status !== "known" || clampScore(confidenceScore) < 0.75;
}
