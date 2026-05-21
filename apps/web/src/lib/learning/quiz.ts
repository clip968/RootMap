import { LlmParseError, LlmValidationError } from "@/lib/llm/errors";
import { createChatCompletion } from "@/lib/llm";
import { sliceBalancedJsonObject, stripLlmFences } from "@/lib/llm/parse";
import { clampScore, convertScoreToStatus, shouldNeedReview } from "@/lib/learning/mastery";
import type { ProgressStatus } from "@/types/learning";
import { z } from "zod/v3";

export interface QuizEvaluationInput {
  conceptTitle: string;
  question: string;
  expectedAnswer: string;
  userAnswer: string;
}

export interface QuizEvaluationResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
  detectedMisconceptions: string[];
}

export interface QuizMasteryState {
  status: ProgressStatus;
  confidenceScore: number;
  lastQuizScore: number | null;
  wrongCount: number;
  correctCount: number;
  needsReview: boolean;
}

const quizEvaluationSchema = z.object({
  is_correct: z.boolean(),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1),
  detected_misconceptions: z.array(z.string()).default([]),
});

const QUIZ_EVALUATION_SYSTEM_PROMPT = [
  "You evaluate a short learning quiz answer for RootMap.",
  "Return only a JSON object with is_correct, score, feedback, detected_misconceptions.",
  "Use a score from 0 to 1. Keep feedback concise and educational.",
].join("\n");

function parseJsonObject(raw: string): unknown {
  const primary = stripLlmFences(raw);
  try {
    return JSON.parse(primary);
  } catch {
    const sliced = sliceBalancedJsonObject(raw);
    if (!sliced) throw new LlmParseError();
    try {
      return JSON.parse(sliced);
    } catch {
      throw new LlmParseError();
    }
  }
}

function roundScore(score: number): number {
  return Math.round(clampScore(score) * 100) / 100;
}

/** LLM에 보내는 입력은 Concept·문항·기대답·사용자답으로 제한해 불필요한 개인정보 전송을 막는다. */
export function buildQuizEvaluationUserMessage(
  input: QuizEvaluationInput,
): string {
  return JSON.stringify(
    {
      concept: input.conceptTitle,
      question: input.question,
      expected_answer: input.expectedAnswer,
      user_answer: input.userAnswer,
    },
    null,
    2,
  );
}

export function parseQuizEvaluationResponse(raw: string): QuizEvaluationResult {
  const parsed = parseJsonObject(raw);
  const result = quizEvaluationSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError("퀴즈 평가 응답 형식이 올바르지 않습니다.", result.error.issues);
  }
  return {
    isCorrect: result.data.is_correct,
    score: roundScore(result.data.score),
    feedback: result.data.feedback,
    detectedMisconceptions: result.data.detected_misconceptions,
  };
}

export async function evaluateQuizAnswerWithLlm(
  input: QuizEvaluationInput,
): Promise<QuizEvaluationResult> {
  const completion = await createChatCompletion([
    { role: "system", content: QUIZ_EVALUATION_SYSTEM_PROMPT },
    { role: "user", content: buildQuizEvaluationUserMessage(input) },
  ]);
  return parseQuizEvaluationResponse(completion.rawText);
}

/**
 * Phase 4 §10.3/§15.2 정책.
 * 퀴즈는 자기 평가보다 강한 신호로 보고, 정답은 confidence를 올리고 오답은 오개념과 함께 낮춘다.
 */
export function applyQuizResultToMastery(
  previous: QuizMasteryState | null,
  evaluation: QuizEvaluationResult,
): QuizMasteryState {
  const before = previous ?? {
    status: "unknown" as const,
    confidenceScore: 0.1,
    lastQuizScore: null,
    wrongCount: 0,
    correctCount: 0,
    needsReview: true,
  };

  const nextScore =
    evaluation.isCorrect ?
      before.confidenceScore + 0.15 * evaluation.score
    : before.confidenceScore - 0.2 * (1 - evaluation.score);
  const confidenceScore = roundScore(nextScore);
  const status = convertScoreToStatus(confidenceScore);

  return {
    status,
    confidenceScore,
    lastQuizScore: evaluation.score,
    wrongCount: before.wrongCount + (evaluation.isCorrect ? 0 : 1),
    correctCount: before.correctCount + (evaluation.isCorrect ? 1 : 0),
    needsReview: shouldNeedReview(status, confidenceScore),
  };
}
