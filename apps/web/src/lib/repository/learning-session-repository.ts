import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  learningEvents,
  learningSessions,
  userConceptMastery,
} from "@/db/schema";
import type { ProgressStatus } from "@/types/learning";

export type LearningSessionRow = typeof learningSessions.$inferSelect;
export type LearningEventRow = typeof learningEvents.$inferSelect;
export type UserConceptMasteryRow = typeof userConceptMastery.$inferSelect;

export interface StartLearningSessionInput {
  userId: string;
  treeId?: string | null;
  documentId?: string | null;
  startedAt?: Date;
  summary?: Record<string, unknown>;
}

export interface AppendLearningEventInput {
  userId: string;
  sessionId?: string | null;
  treeId?: string | null;
  nodeId?: string | null;
  conceptId?: string | null;
  eventType: string;
  eventPayload?: Record<string, unknown>;
  createdAt?: Date;
}

export interface UpsertUserConceptMasteryInput {
  userId: string;
  conceptId: string;
  status?: ProgressStatus;
  confidenceScore?: number;
  lastStudiedAt?: Date | null;
  lastQuizScore?: number | null;
  reviewCount?: number;
  wrongCount?: number;
  correctCount?: number;
  needsReview?: boolean;
  masteryMetadata?: Record<string, unknown>;
}

/** 새 학습 세션을 시작하고 이후 이벤트·리포트가 참조할 세션 ID를 만든다. */
export async function startLearningSession(
  input: StartLearningSessionInput,
): Promise<LearningSessionRow> {
  const rows = await getDb()
    .insert(learningSessions)
    .values({
      userId: input.userId,
      treeId: input.treeId ?? null,
      documentId: input.documentId ?? null,
      startedAt: input.startedAt ?? new Date(),
      summary: input.summary ?? {},
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("learning_sessions insert failed");
  return row;
}

/** 세션 소유자를 함께 조건에 걸어 다른 사용자의 세션 종료를 막는다. */
export async function endLearningSession(input: {
  userId: string;
  sessionId: string;
  endedAt?: Date;
  summary?: Record<string, unknown>;
}): Promise<LearningSessionRow | null> {
  const endedAt = input.endedAt ?? new Date();
  const currentRows = await getDb()
    .select()
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.id, input.sessionId),
        eq(learningSessions.userId, input.userId),
      ),
    );
  const current = currentRows[0];
  if (!current) return null;

  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - current.startedAt.getTime()) / 1000),
  );
  const rows = await getDb()
    .update(learningSessions)
    .set({
      endedAt,
      durationSeconds,
      summary: input.summary ?? current.summary,
    })
    .where(
      and(
        eq(learningSessions.id, input.sessionId),
        eq(learningSessions.userId, input.userId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** 학습 행동은 append-only 이벤트로 남겨 추천·리포트가 같은 사실 원천을 보게 한다. */
export async function appendLearningEvent(
  input: AppendLearningEventInput,
): Promise<LearningEventRow> {
  const rows = await getDb()
    .insert(learningEvents)
    .values({
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      treeId: input.treeId ?? null,
      nodeId: input.nodeId ?? null,
      conceptId: input.conceptId ?? null,
      eventType: input.eventType,
      eventPayload: input.eventPayload ?? {},
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("learning_events insert failed");
  return row;
}

export async function getUserConceptMastery(
  userId: string,
  conceptId: string,
): Promise<UserConceptMasteryRow | null> {
  const rows = await getDb()
    .select()
    .from(userConceptMastery)
    .where(
      and(
        eq(userConceptMastery.userId, userId),
        eq(userConceptMastery.conceptId, conceptId),
      ),
    );
  return rows[0] ?? null;
}

/** 사용자+Concept 유니크 키로 숙련도를 갱신해 Phase 4 추천의 단일 소스를 유지한다. */
export async function upsertUserConceptMastery(
  input: UpsertUserConceptMasteryInput,
): Promise<UserConceptMasteryRow> {
  const now = new Date();
  const values = {
    userId: input.userId,
    conceptId: input.conceptId,
    status: input.status ?? "unknown",
    confidenceScore: input.confidenceScore ?? 0.1,
    lastStudiedAt: input.lastStudiedAt ?? null,
    lastQuizScore: input.lastQuizScore ?? null,
    reviewCount: input.reviewCount ?? 0,
    wrongCount: input.wrongCount ?? 0,
    correctCount: input.correctCount ?? 0,
    needsReview: input.needsReview ?? true,
    masteryMetadata: input.masteryMetadata ?? {},
    updatedAt: now,
  };
  const rows = await getDb()
    .insert(userConceptMastery)
    .values(values)
    .onConflictDoUpdate({
      target: [userConceptMastery.userId, userConceptMastery.conceptId],
      set: values,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("user_concept_mastery upsert failed");
  return row;
}
