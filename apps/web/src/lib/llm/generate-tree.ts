/**
 * 학습 트리 LLM 호출 전용 모듈.
 *
 * - `createChatCompletion`: OpenRouter 등에 system+user 메시지 전송
 * - `parseLearningTreeResponse`: 원문 텍스트(JSON) → Zod/타입 검증된 `LearningTreeResponse`
 * - 파싱·검증·일시적 네트워크 오류는 최대 `MAX_ATTEMPTS`회까지 재시도(401은 즉시 중단)
 */
import { createChatCompletion } from "@/lib/llm/chat";
import {
  InvalidTopicError,
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseLearningTreeResponse } from "@/lib/llm/parse";
import {
  buildLearningTreeUserMessage,
  LEARNING_TREE_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import {
  learningTreeQualityWarnings,
} from "@/lib/llm/schemas";
import type { LearningTreeResponse } from "@/types/learning";

const MAX_ATTEMPTS = 3;

/** 인증 실패는 재시도해도 의미 없음 — 루프 탈출 */
function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

/** 로그/분기용: 마지막 실패 원인을 네 가지 묶음으로만 기록 */
function classifyLlmError(err: unknown): "parse" | "validation" | "transport" | "unknown" {
  if (err instanceof LlmParseError) return "parse";
  if (err instanceof LlmValidationError) return "validation";
  if (err instanceof LlmTransportError) return "transport";
  return "unknown";
}

function logGenerateLlm(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "llm", event, ...details });
}

export interface GenerateLearningTreeResult {
  tree: LearningTreeResponse;
  qualityWarnings: string[];
}

export interface GenerateLearningTreeOptions {
  reuseConcepts?: boolean;
  /** `reuseConcepts`가 true일 때만 사용자 메시지에 포함 */
  storeContext?: string;
  requestId?: string;
}

/**
 * 주제로 학습 트리 JSON을 생성·검증한다. 파싱/스키마 실패 시 최대 3회 재시도.
 */
export async function generateLearningTree(
  topic: string,
  options?: GenerateLearningTreeOptions,
): Promise<GenerateLearningTreeResult> {
  const trimmed = topic.trim();
  if (!trimmed) {
    throw new InvalidTopicError();
  }

  const storeContext =
    options?.reuseConcepts === false ? undefined : options?.storeContext;
  const requestId = options?.requestId;

  let lastError: unknown;
  /** 파싱/스키마/transport 중 retryable이면 다음 attempt로 — 최종 실패 시 cause를 넘김 */
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();
    if (requestId) {
      logGenerateLlm("attempt_start", {
        requestId,
        attempt: attemptNumber,
        maxAttempts: MAX_ATTEMPTS,
        reuseConcepts: options?.reuseConcepts ?? true,
        storeContextLength: storeContext?.length ?? 0,
      });
    }

    try {
      const completionStartedAt = Date.now();
      /** 시스템 프롬프트는 고정, 사용자 메시지에 주제 + (있으면) 기존 Concept 컨텍스트 포함 */
      const { rawText, status } = await createChatCompletion([
        { role: "system", content: LEARNING_TREE_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildLearningTreeUserMessage(trimmed, storeContext),
        },
      ]);
      const completionDurationMs = Date.now() - completionStartedAt;

      const parseStartedAt = Date.now();
      const tree = parseLearningTreeResponse(rawText);
      /** 트리 구조는 유효해도 누락·중복 등 경고를 사람이 읽을 문자열로 모음 */
      const qualityWarnings = learningTreeQualityWarnings(tree, trimmed);
      const parseDurationMs = Date.now() - parseStartedAt;

      if (requestId) {
        logGenerateLlm("attempt_success", {
          requestId,
          attempt: attemptNumber,
          durationMs: Date.now() - attemptStartedAt,
          completionDurationMs,
          parseValidationDurationMs: parseDurationMs,
          status,
          rawLength: rawText.length,
          nodeCount: tree.nodes.length,
          edgeCount: tree.edges?.length ?? 0,
          qualityWarningCount: qualityWarnings.length,
        });
      }
      return { tree, qualityWarnings };
    } catch (e) {
      lastError = e;
      const errorType = classifyLlmError(e);
      const retryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        e instanceof LlmTransportError;
      const abortRetries = shouldAbortRetries(e);
      if (requestId) {
        logGenerateLlm("attempt_failure", {
          requestId,
          attempt: attemptNumber,
          durationMs: Date.now() - attemptStartedAt,
          errorType,
          errorClass: e instanceof Error ? e.name : "UnknownError",
          status: e instanceof LlmTransportError ? e.status : undefined,
          retryable,
          abortRetries,
        });
      }
      if (abortRetries) break;
      /** InvalidTopicError 등 retryable이 아닌 예외는 즉시 종료 */
      if (!retryable) break;
    }
  }

  /** 모든 시도 실패 — 라우트에서 cause 보고 422 vs 502 구분 */
  if (requestId) {
    logGenerateLlm("exhausted_retries", {
      requestId,
      maxAttempts: MAX_ATTEMPTS,
      finalErrorType: classifyLlmError(lastError),
      finalErrorClass: lastError instanceof Error ? lastError.name : "UnknownError",
    });
  }

  throw new LlmExhaustedRetriesError(
    "LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
