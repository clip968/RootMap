export const LEARNING_EVENT_TYPES = [
  "tree_opened",
  "node_opened",
  "node_completed",
  "self_assessment_updated",
  "quiz_started",
  "quiz_submitted",
  "recommendation_clicked",
  "session_ended",
] as const;

export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

/**
 * Phase 4 명세의 이벤트 타입 whitelist.
 * API route와 smoke가 같은 상수를 보므로 새 이벤트 타입을 추가할 때 검증 누락을 줄일 수 있다.
 */
export function isLearningEventType(value: string): value is LearningEventType {
  return LEARNING_EVENT_TYPES.some((eventType) => eventType === value);
}

export function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
