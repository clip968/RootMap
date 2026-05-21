import { clampScore } from "@/lib/learning/mastery";

export interface ReviewPriorityInput {
  confidenceScore: number;
  lastStudiedAt: Date | string | null;
  wrongCount: number;
  correctCount: number;
  prerequisiteImportanceScore?: number;
  documentImportanceScore?: number;
  now?: Date;
}

export interface ReviewCandidate {
  conceptId: string;
  title: string;
  confidenceScore: number;
  lastStudiedAt: Date | string | null;
  wrongCount: number;
  correctCount: number;
  needsReview: boolean;
}

export interface ReviewItem {
  concept_id: string;
  title: string;
  review_priority_score: number;
  reasons: string[];
}

function roundScore(score: number): number {
  return Math.round(clampScore(score) * 100) / 100;
}

function recencyDecayScore(
  lastStudiedAt: Date | string | null,
  now: Date,
): number {
  if (!lastStudiedAt) return 0.7;
  const studiedAt =
    lastStudiedAt instanceof Date ? lastStudiedAt : new Date(lastStudiedAt);
  const days = Math.max(
    0,
    (now.getTime() - studiedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days >= 14) return 1;
  if (days >= 7) return 0.6;
  if (days >= 1) return 0.2;
  return 0;
}

function quizErrorScore(wrongCount: number, correctCount: number): number {
  const total = wrongCount + correctCount;
  if (total <= 0) return 0;
  return clampScore(wrongCount / total);
}

export function calculateReviewPriorityScore(
  input: ReviewPriorityInput,
): number {
  const now = input.now ?? new Date();
  return roundScore(
    (1 - clampScore(input.confidenceScore)) * 0.4 +
      recencyDecayScore(input.lastStudiedAt, now) * 0.2 +
      quizErrorScore(input.wrongCount, input.correctCount) * 0.2 +
      clampScore(input.prerequisiteImportanceScore ?? 0) * 0.15 +
      clampScore(input.documentImportanceScore ?? 0) * 0.05,
  );
}

function reviewReasons(input: ReviewCandidate, score: number, now: Date): string[] {
  const reasons: string[] = [];
  if (input.confidenceScore < 0.5) {
    reasons.push("confidence_score가 낮아 복습 우선순위가 높습니다.");
  } else if (input.confidenceScore < 0.75) {
    reasons.push("아직 완전히 숙달되지 않은 개념입니다.");
  }
  const recency = recencyDecayScore(input.lastStudiedAt, now);
  if (!input.lastStudiedAt) {
    reasons.push("마지막 학습 기록이 없어 다시 확인하는 것이 좋습니다.");
  } else if (recency >= 1) {
    reasons.push("마지막 학습 이후 14일 이상 지났습니다.");
  } else if (recency >= 0.6) {
    reasons.push("마지막 학습 이후 7일 이상 지났습니다.");
  }
  if (input.wrongCount > 0) {
    reasons.push("관련 퀴즈 오답 기록이 있어 같은 실수를 줄일 수 있습니다.");
  }
  if (score >= 0.8) {
    reasons.push("강한 복습 추천 대상입니다.");
  } else if (score >= 0.6) {
    reasons.push("복습 권장 대상입니다.");
  }
  return reasons.slice(0, 4);
}

export function buildReviewItems(
  candidates: ReviewCandidate[],
  options?: { now?: Date; limit?: number },
): ReviewItem[] {
  const now = options?.now ?? new Date();
  return candidates
    .map((candidate) => {
      const score = calculateReviewPriorityScore({
        confidenceScore: candidate.confidenceScore,
        lastStudiedAt: candidate.lastStudiedAt,
        wrongCount: candidate.wrongCount,
        correctCount: candidate.correctCount,
        now,
      });
      return {
        concept_id: candidate.conceptId,
        title: candidate.title,
        review_priority_score: score,
        reasons: reviewReasons(candidate, score, now),
        include: candidate.needsReview || score >= 0.3,
      };
    })
    .filter((item) => item.include)
    .sort(
      (a, b) =>
        b.review_priority_score - a.review_priority_score ||
        a.title.localeCompare(b.title),
    )
    .slice(0, options?.limit ?? 20)
    .map(({ include: _include, ...item }) => item);
}
