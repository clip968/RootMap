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

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

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
      if (!retryable) break;
    }
  }

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
