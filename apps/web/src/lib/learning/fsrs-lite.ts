import { clampScore, type MasteryStatus } from "@/lib/learning/mastery";

export type FsrsLiteGrade = "again" | "hard" | "good" | "easy";

export interface FsrsLiteScheduleInput {
  grade: FsrsLiteGrade;
  previousStability?: number | null;
  previousDifficulty?: number | null;
  reviewedAt?: Date;
}

export interface FsrsLiteSchedule {
  review_due_at: Date;
  memory_stability: number;
  memory_difficulty: number;
  retrievability: number;
  last_review_grade: FsrsLiteGrade;
  review_interval_days: number;
  scheduler_version: "rule_v1";
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * FSRS-lite rule v1.
 * 실제 FSRS 학습 파라미터를 추정하지 않고, 사용자의 최근 성공/실패 신호를
 * stability, difficulty, due date로 바꾸는 설명 가능한 MVP scheduler다.
 */
export function scheduleFsrsLiteReview(input: FsrsLiteScheduleInput): FsrsLiteSchedule {
  const reviewedAt = input.reviewedAt ?? new Date();
  const previousStability = clampRange(input.previousStability ?? 1, 0.5, 60);
  const previousDifficulty = clampRange(input.previousDifficulty ?? 0.5, 0, 1);
  const gradeConfig: Record<FsrsLiteGrade, { stabilityDelta: number; difficultyDelta: number; intervalMultiplier: number }> = {
    again: { stabilityDelta: -0.35, difficultyDelta: 0.16, intervalMultiplier: 0.5 },
    hard: { stabilityDelta: 0.25, difficultyDelta: 0.08, intervalMultiplier: 1.1 },
    good: { stabilityDelta: 1.4, difficultyDelta: -0.06, intervalMultiplier: 2 },
    easy: { stabilityDelta: 2.4, difficultyDelta: -0.12, intervalMultiplier: 3 },
  };
  const config = gradeConfig[input.grade];
  const memoryStability = clampRange(previousStability + config.stabilityDelta, 0.5, 60);
  const memoryDifficulty = clampRange(previousDifficulty + config.difficultyDelta, 0, 1);
  const intervalDays = Math.max(1, Math.round(memoryStability * config.intervalMultiplier));
  return {
    review_due_at: new Date(reviewedAt.getTime() + intervalDays * 24 * 60 * 60 * 1000),
    memory_stability: round2(memoryStability),
    memory_difficulty: round2(memoryDifficulty),
    retrievability: 1,
    last_review_grade: input.grade,
    review_interval_days: intervalDays,
    scheduler_version: "rule_v1",
  };
}

export function calculateRetrievability(input: {
  lastReviewedAt: Date | string | null;
  stability: number | null | undefined;
  now?: Date;
}): number {
  if (!input.lastReviewedAt) return 0;
  const now = input.now ?? new Date();
  const reviewedAt = input.lastReviewedAt instanceof Date ? input.lastReviewedAt : new Date(input.lastReviewedAt);
  const elapsedDays = Math.max(0, (now.getTime() - reviewedAt.getTime()) / (24 * 60 * 60 * 1000));
  const stability = clampRange(input.stability ?? 1, 0.5, 60);
  return round2(clampScore(Math.exp(-elapsedDays / stability)));
}

export function gradeForSelfAssessment(status: MasteryStatus, confidenceScore: number): FsrsLiteGrade {
  if (status === "known" && confidenceScore >= 0.85) return "easy";
  if (status === "known") return "good";
  if (status === "partial") return "hard";
  return "again";
}

export function gradeForQuizResult(input: { isCorrect: boolean; score: number | null }): FsrsLiteGrade {
  if (!input.isCorrect) return "again";
  if (input.score != null && input.score >= 0.9) return "easy";
  if (input.score != null && input.score < 0.7) return "hard";
  return "good";
}
