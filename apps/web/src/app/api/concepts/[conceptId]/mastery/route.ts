import { getDb } from "@/db/client";
import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  applySelfAssessment,
  clampScore,
  convertScoreToStatus,
  shouldNeedReview,
  type MasteryStatus,
} from "@/lib/learning/mastery";
import { toIsoString } from "@/lib/learning/session-events";
import { getConceptById } from "@/lib/repository/concept-repository";
import {
  appendLearningEvent,
  getLearningSessionForUser,
  getUserConceptMastery,
  upsertUserConceptMastery,
  type UserConceptMasteryRow,
} from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ conceptId: string }> };

const statusSchema = z.enum(["known", "partial", "unknown"]);

const patchSchema = z
  .object({
    status: statusSchema.optional(),
    confidence_score: z.number().min(0).max(1).optional(),
    source: z.enum(["self_assessment"]).optional(),
    session_id: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.confidence_score !== undefined);

function masteryResponse(input: {
  conceptId: string;
  title: string;
  mastery: UserConceptMasteryRow;
}) {
  return {
    concept_id: input.conceptId,
    title: input.title,
    status: input.mastery.status,
    confidence_score: input.mastery.confidenceScore,
    last_studied_at: toIsoString(input.mastery.lastStudiedAt),
    last_quiz_score: input.mastery.lastQuizScore,
    review_count: input.mastery.reviewCount,
    wrong_count: input.mastery.wrongCount,
    correct_count: input.mastery.correctCount,
    needs_review: input.mastery.needsReview,
  };
}

async function ensureConcept(conceptId: string) {
  const concept = await getConceptById(getDb(), conceptId);
  return concept;
}

async function getOrCreateMastery(input: {
  userId: string;
  conceptId: string;
}): Promise<UserConceptMasteryRow> {
  const existing = await getUserConceptMastery(input.userId, input.conceptId);
  if (existing) return existing;
  return upsertUserConceptMastery({
    userId: input.userId,
    conceptId: input.conceptId,
    status: "unknown",
    confidenceScore: 0.1,
    needsReview: true,
    masteryMetadata: { source: "initial_default" },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { conceptId } = await ctx.params;
  if (!conceptId) {
    return jsonError("INVALID_REQUEST", "conceptId가 필요합니다.", 400);
  }

  const concept = await ensureConcept(conceptId);
  if (!concept) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }

  const mastery = await getOrCreateMastery({
    userId: auth.userId,
    conceptId,
  });

  return NextResponse.json(
    masteryResponse({
      conceptId,
      title: concept.title,
      mastery,
    }),
  );
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { conceptId } = await ctx.params;
  if (!conceptId) {
    return jsonError("INVALID_REQUEST", "conceptId가 필요합니다.", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(
      "INVALID_REQUEST",
      "JSON 형식의 요청 본문이 필요합니다.",
      400,
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "INVALID_REQUEST",
      "status 또는 confidence_score가 필요합니다.",
      400,
    );
  }

  const concept = await ensureConcept(conceptId);
  if (!concept) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }

  const previous = await getUserConceptMastery(auth.userId, conceptId);
  const source = parsed.data.source ?? "self_assessment";
  let nextStatus: MasteryStatus;
  let nextConfidence: number;

  if (parsed.data.confidence_score !== undefined) {
    nextConfidence = clampScore(parsed.data.confidence_score);
    nextStatus = parsed.data.status ?? convertScoreToStatus(nextConfidence);
    if (
      parsed.data.status &&
      convertScoreToStatus(nextConfidence) !== parsed.data.status
    ) {
      return jsonError(
        "INVALID_REQUEST",
        "status와 confidence_score 범위가 일치하지 않습니다.",
        400,
      );
    }
  } else {
    const assessment = applySelfAssessment(
      previous?.confidenceScore ?? 0.1,
      parsed.data.status!,
      previous != null,
    );
    nextStatus = assessment.status;
    nextConfidence = assessment.confidenceScore;
  }

  let sessionTreeId: string | null = null;
  const sessionId = parsed.data.session_id ?? null;
  if (sessionId) {
    const session = await getLearningSessionForUser({
      userId: auth.userId,
      sessionId,
    });
    if (!session) {
      return jsonError("NOT_FOUND", "학습 세션을 찾을 수 없습니다.", 404);
    }
    if (session.endedAt) {
      return jsonError("INVALID_OPERATION", "종료된 세션에는 자기 평가를 기록할 수 없습니다.", 409);
    }
    sessionTreeId = session.treeId;
  }

  const now = new Date();
  const mastery = await upsertUserConceptMastery({
    userId: auth.userId,
    conceptId,
    status: nextStatus,
    confidenceScore: nextConfidence,
    lastStudiedAt: now,
    lastQuizScore: previous?.lastQuizScore ?? null,
    reviewCount: previous?.reviewCount ?? 0,
    wrongCount: previous?.wrongCount ?? 0,
    correctCount: previous?.correctCount ?? 0,
    needsReview: shouldNeedReview(nextStatus, nextConfidence),
    masteryMetadata: {
      ...(previous?.masteryMetadata ?? {}),
      last_source: source,
      last_self_assessment_status: parsed.data.status ?? null,
    },
  });

  if (sessionId) {
    /** 자기 평가는 mastery와 별개로 이벤트에도 남겨 세션 리포트가 사용자의 선택 이유를 재구성할 수 있게 한다. */
    await appendLearningEvent({
      userId: auth.userId,
      sessionId,
      treeId: sessionTreeId,
      conceptId,
      eventType: "self_assessment_updated",
      eventPayload: {
        source,
        previous_status: previous?.status ?? null,
        previous_confidence_score: previous?.confidenceScore ?? null,
        status: mastery.status,
        confidence_score: mastery.confidenceScore,
      },
    });
  }

  return NextResponse.json(
    masteryResponse({
      conceptId,
      title: concept.title,
      mastery,
    }),
  );
}
