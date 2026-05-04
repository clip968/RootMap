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

export interface GenerateLearningTreeResult {
  tree: LearningTreeResponse;
  qualityWarnings: string[];
}

/**
 * 주제로 학습 트리 JSON을 생성·검증한다. 파싱/스키마 실패 시 최대 3회 재시도.
 */
export async function generateLearningTree(
  topic: string,
): Promise<GenerateLearningTreeResult> {
  const trimmed = topic.trim();
  if (!trimmed) {
    throw new InvalidTopicError();
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { rawText } = await createChatCompletion([
        { role: "system", content: LEARNING_TREE_SYSTEM_PROMPT },
        { role: "user", content: buildLearningTreeUserMessage(trimmed) },
      ]);
      const tree = parseLearningTreeResponse(rawText);
      const qualityWarnings = learningTreeQualityWarnings(tree, trimmed);
      return { tree, qualityWarnings };
    } catch (e) {
      lastError = e;
      if (shouldAbortRetries(e)) break;
      const retryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        e instanceof LlmTransportError;
      if (!retryable) break;
    }
  }

  throw new LlmExhaustedRetriesError(
    "LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
