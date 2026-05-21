import { getDb } from "@/db/client";
import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  applyQuizResultToMastery,
  evaluateQuizAnswerWithLlm,
} from "@/lib/learning/quiz";
import { LlmParseError, LlmTransportError, LlmValidationError } from "@/lib/llm";
import { getConceptById } from "@/lib/repository/concept-repository";
import {
  appendLearningEvent,
  createMisconceptionEvent,
  createQuizAttempt,
  getLearningNodeScopeForUser,
  getLearningSessionForUser,
  getLearningTreeAccessForUser,
  getUserConceptMastery,
  upsertUserConceptMastery,
} from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  session_id: z.string().uuid(),
  tree_id: z.string().min(1),
  node_id: z.string().min(1),
  concept_id: z.string().min(1),
  quiz_type: z.enum(["short_answer", "misconception_check"]),
  question: z.string().min(1),
  expected_answer: z.string().min(1),
  user_answer: z.string().min(1),
});

function llmErrorResponse(err: unknown) {
  if (err instanceof LlmParseError || err instanceof LlmValidationError) {
    return jsonError(
      "INVALID_LLM_RESPONSE",
      "퀴즈 평가 응답 형식이 올바르지 않습니다.",
      502,
    );
  }
  if (err instanceof LlmTransportError) {
    return jsonError("LLM_GENERATION_FAILED", err.message, 502);
  }
  return jsonError("LLM_GENERATION_FAILED", "퀴즈 평가에 실패했습니다.", 502);
}

export async function POST(req: Request) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_REQUEST", "퀴즈 시도 요청 형식이 올바르지 않습니다.", 400);
  }

  const session = await getLearningSessionForUser({
    userId: auth.userId,
    sessionId: parsed.data.session_id,
  });
  if (!session) {
    return jsonError("NOT_FOUND", "학습 세션을 찾을 수 없습니다.", 404);
  }
  if (session.endedAt) {
    return jsonError("INVALID_OPERATION", "종료된 세션에는 퀴즈 시도를 저장할 수 없습니다.", 409);
  }
  if (session.treeId && session.treeId !== parsed.data.tree_id) {
    return jsonError("FORBIDDEN", "퀴즈 tree_id가 세션의 학습 트리와 일치하지 않습니다.", 403);
  }

  const tree = await getLearningTreeAccessForUser({
    userId: auth.userId,
    treeId: parsed.data.tree_id,
  });
  if (!tree) {
    return jsonError("FORBIDDEN", "이 학습 트리에 접근할 수 없습니다.", 403);
  }

  const node = await getLearningNodeScopeForUser({
    userId: auth.userId,
    nodeId: parsed.data.node_id,
  });
  if (!node || node.treeId !== parsed.data.tree_id) {
    return jsonError("FORBIDDEN", "이 노드에 접근할 수 없습니다.", 403);
  }
  if (node.conceptId && node.conceptId !== parsed.data.concept_id) {
    return jsonError("INVALID_REQUEST", "node_id와 concept_id가 일치하지 않습니다.", 400);
  }

  const concept = await getConceptById(getDb(), parsed.data.concept_id);
  if (!concept) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }

  let evaluation;
  try {
    evaluation = await evaluateQuizAnswerWithLlm({
      conceptTitle: concept.title,
      question: parsed.data.question,
      expectedAnswer: parsed.data.expected_answer,
      userAnswer: parsed.data.user_answer,
    });
  } catch (err) {
    return llmErrorResponse(err);
  }

  const previous = await getUserConceptMastery(auth.userId, parsed.data.concept_id);
  const updatedMastery = applyQuizResultToMastery(
    previous ?
      {
        status: previous.status as "known" | "partial" | "unknown",
        confidenceScore: previous.confidenceScore,
        lastQuizScore: previous.lastQuizScore,
        wrongCount: previous.wrongCount,
        correctCount: previous.correctCount,
        needsReview: previous.needsReview,
      }
    : null,
    evaluation,
  );

  const attempt = await createQuizAttempt({
    userId: auth.userId,
    sessionId: parsed.data.session_id,
    treeId: parsed.data.tree_id,
    nodeId: parsed.data.node_id,
    conceptId: parsed.data.concept_id,
    quizType: parsed.data.quiz_type,
    question: parsed.data.question,
    expectedAnswer: parsed.data.expected_answer,
    userAnswer: parsed.data.user_answer,
    isCorrect: evaluation.isCorrect,
    score: evaluation.score,
    feedback: evaluation.feedback,
    detectedMisconceptions: evaluation.detectedMisconceptions,
  });

  for (const misconception of evaluation.detectedMisconceptions) {
    await createMisconceptionEvent({
      userId: auth.userId,
      conceptId: parsed.data.concept_id,
      quizAttemptId: attempt.id,
      misconceptionText: misconception,
      evidence: evaluation.feedback,
    });
  }

  const mastery = await upsertUserConceptMastery({
    userId: auth.userId,
    conceptId: parsed.data.concept_id,
    status: updatedMastery.status,
    confidenceScore: updatedMastery.confidenceScore,
    lastStudiedAt: previous?.lastStudiedAt ?? null,
    lastQuizScore: updatedMastery.lastQuizScore,
    reviewCount: previous?.reviewCount ?? 0,
    wrongCount: updatedMastery.wrongCount,
    correctCount: updatedMastery.correctCount,
    needsReview: updatedMastery.needsReview,
    masteryMetadata: {
      ...(previous?.masteryMetadata ?? {}),
      last_source: "quiz",
      last_quiz_attempt_id: attempt.id,
    },
  });

  /** 퀴즈 제출 이벤트에는 평가 요약만 저장하고 원문 답변은 quiz_attempts에만 둔다. */
  await appendLearningEvent({
    userId: auth.userId,
    sessionId: parsed.data.session_id,
    treeId: parsed.data.tree_id,
    nodeId: parsed.data.node_id,
    conceptId: parsed.data.concept_id,
    eventType: "quiz_submitted",
    eventPayload: {
      attempt_id: attempt.id,
      quiz_type: parsed.data.quiz_type,
      is_correct: evaluation.isCorrect,
      score: evaluation.score,
      detected_misconception_count: evaluation.detectedMisconceptions.length,
    },
  });

  return NextResponse.json({
    attempt_id: attempt.id,
    is_correct: evaluation.isCorrect,
    score: evaluation.score,
    feedback: evaluation.feedback,
    detected_misconceptions: evaluation.detectedMisconceptions,
    updated_mastery: {
      concept_id: parsed.data.concept_id,
      status: mastery.status,
      confidence_score: mastery.confidenceScore,
    },
  });
}
