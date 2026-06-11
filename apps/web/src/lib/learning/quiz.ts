import { LlmParseError, LlmValidationError } from "@/lib/llm/errors";
import { createChatCompletion } from "@/lib/llm";
import type { ResolvedLlmProviderConfig } from "@/lib/llm/provider-config";
import { sliceBalancedJsonObject, stripLlmFences } from "@/lib/llm/parse";
import { clampScore, convertScoreToStatus, shouldNeedReview } from "@/lib/learning/mastery";
import type { ConceptQuestion, ProgressStatus } from "@/types/learning";
import { z } from "zod/v3";

export interface QuizEvaluationInput {
  providerConfig: ResolvedLlmProviderConfig;
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
  ], { providerConfig: input.providerConfig });
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

// ──────────────────────────────────────────────
// Phase 14(§6.4·§6.5): 오개념 distractor와 rubric 기반 결정적 채점
//
// 명세 철학(§1.4·§6): 기본 채점은 LLM judge 없이 어휘 겹침 기반 결정적 규칙으로 둔다.
// 아래 함수들은 LLM 호출 없이 ConceptQuestion.rubric과 misconception_target만으로
// 부분 점수·오개념 일치·피드백을 만든다. UI 객관식 구성과 Phase 15 세션의 feedback
// 스텝이 이 building block을 재사용한다(LLM 비용 없이 CI에서도 결정적으로 동작).
// ──────────────────────────────────────────────

/** 한국어/영문 혼용 텍스트를 비교용 토큰으로 쪼갠다(소문자화 + 2글자 미만 토큰 제거). */
function tokenizeForOverlap(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

/** target 고유 토큰 중 source에 등장한 비율(0~1). target이 비면 0. */
function tokenCoverage(targetTokens: string[], sourceTokenSet: Set<string>): number {
  const unique = new Set(targetTokens);
  if (unique.size === 0) return 0;
  let hit = 0;
  for (const token of unique) {
    if (sourceTokenSet.has(token)) hit += 1;
  }
  return hit / unique.size;
}

// rubric 한 항목을 "충족"으로 볼 어휘 겹침 임계치.
const RUBRIC_ITEM_COVERAGE_THRESHOLD = 0.5;
// 오답이 특정 오개념에 "빠졌다"고 볼 어휘 겹침 임계치.
const MISCONCEPTION_MATCH_THRESHOLD = 0.6;
// rubric 부분 점수가 이 이상이고 오개념에 빠지지 않았으면 정답으로 본다.
const RUBRIC_CORRECT_SCORE_THRESHOLD = 0.6;

export interface RubricGradingResult {
  /** 0~1 부분 점수(충족한 rubric 비율). */
  score: number;
  isCorrect: boolean;
  /** 사용자가 충족한 rubric 항목. */
  matchedRubric: string[];
  /** 빠뜨린 rubric 항목. */
  missedRubric: string[];
  /** 오답이 특정 오개념과 강하게 겹치면 그 오개념 텍스트. */
  matchedMisconception?: string;
  feedback: string;
}

/**
 * rubric 항목 충족 여부로 부분 점수를 매기는 결정적 채점기.
 *
 * 어휘 겹침 휴리스틱이라 완벽한 의미 평가는 아니지만, LLM 없이 CI에서 돌고
 * 채점 기준(rubric)을 명시적으로 드러낸다. 정밀 평가가 필요하면 기존
 * `evaluateQuizAnswerWithLlm`(LLM 경로)를 병행할 수 있다.
 */
export function gradeAnswerWithRubric(
  userAnswer: string,
  question: Pick<
    ConceptQuestion,
    "rubric" | "expected_answer" | "misconception_target"
  >,
): RubricGradingResult {
  const answerTokens = new Set(tokenizeForOverlap(userAnswer));

  const matchedRubric: string[] = [];
  const missedRubric: string[] = [];
  for (const item of question.rubric) {
    const coverage = tokenCoverage(tokenizeForOverlap(item), answerTokens);
    if (coverage >= RUBRIC_ITEM_COVERAGE_THRESHOLD) {
      matchedRubric.push(item);
    } else {
      missedRubric.push(item);
    }
  }

  const score =
    question.rubric.length === 0
      ? 0
      : roundScore(matchedRubric.length / question.rubric.length);

  // 오답이 misconception_target과 강하게 겹치면 그 오개념에 빠진 것으로 본다.
  let matchedMisconception: string | undefined;
  if (question.misconception_target) {
    const coverage = tokenCoverage(
      tokenizeForOverlap(question.misconception_target),
      answerTokens,
    );
    if (coverage >= MISCONCEPTION_MATCH_THRESHOLD) {
      matchedMisconception = question.misconception_target;
    }
  }

  const isCorrect =
    !matchedMisconception && score >= RUBRIC_CORRECT_SCORE_THRESHOLD;
  const feedback = buildRubricFeedback({
    isCorrect,
    matchedMisconception,
    missedRubric,
    expectedAnswer: question.expected_answer,
  });

  return {
    score,
    isCorrect,
    matchedRubric,
    missedRubric,
    matchedMisconception,
    feedback,
  };
}

/** 채점 결과에 대한 한국어 피드백을 만든다. 오개념에 빠졌으면 그 오개념을 짚어 준다. */
export function buildRubricFeedback(input: {
  isCorrect: boolean;
  matchedMisconception?: string;
  missedRubric: string[];
  expectedAnswer: string;
}): string {
  if (input.matchedMisconception) {
    return `흔한 오개념에 가깝습니다: "${input.matchedMisconception}". 기대하는 답은 "${input.expectedAnswer}" 방향입니다.`;
  }
  if (input.isCorrect) {
    return "채점 기준의 핵심 요소를 충분히 짚었습니다.";
  }
  if (input.missedRubric.length > 0) {
    return `다음 채점 요소가 빠졌습니다: ${input.missedRubric.join(" / ")}.`;
  }
  return `기대하는 답은 "${input.expectedAnswer}" 방향입니다.`;
}

/**
 * Phase 14(§6.4): 객관식 distractor(오답 보기)를 기존 오개념 자산에서 만든다.
 *
 * - `misconception_target`을 우선 distractor로 쓴다.
 * - 부족하면 노드 상세의 `common_misconceptions`에서 보충한다(새 오개념을 만들지 않음).
 * - 정답(expected_answer)과 같거나 서로 중복되는 항목은 제외한다.
 */
export function buildMisconceptionDistractors(
  question: Pick<ConceptQuestion, "expected_answer" | "misconception_target">,
  commonMisconceptions: string[],
  maxDistractors = 3,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const expectedNorm = tokenizeForOverlap(question.expected_answer).join(" ");

  const pushCandidate = (text: string | undefined): void => {
    if (!text) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const norm = tokenizeForOverlap(trimmed).join(" ");
    if (!norm || norm === expectedNorm) return; // 정답과 동일하면 distractor로 못 쓴다.
    if (seen.has(norm)) return; // 이미 추가한 보기와 중복.
    seen.add(norm);
    out.push(trimmed);
  };

  pushCandidate(question.misconception_target);
  for (const misconception of commonMisconceptions) {
    if (out.length >= maxDistractors) break;
    pushCandidate(misconception);
  }
  return out.slice(0, maxDistractors);
}
