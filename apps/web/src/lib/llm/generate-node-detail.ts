import { createChatCompletion } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseNodeDetailResponse } from "@/lib/llm/parse";
import type { ResolvedLlmProviderConfig } from "@/lib/llm/provider-config";
import {
  buildNodeDetailUserMessage,
  NODE_DETAIL_SYSTEM_BASE,
} from "@/lib/llm/prompts";
import { nodeDetailQualityWarnings } from "@/lib/llm/schemas";
import type { NodeDetailResponse, NodeType } from "@/types/learning";

const MAX_ATTEMPTS = 3;

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

export interface GenerateNodeDetailInput {
  providerConfig: ResolvedLlmProviderConfig;
  topic: string;
  nodeId: string;
  nodeTitle: string;
  nodeType: NodeType;
  /** 선수지식 요약(자유 형식 문자열) */
  prerequisitesContext: string;
}

export interface GenerateNodeDetailResult {
  detail: NodeDetailResponse;
  qualityWarnings: string[];
}

export async function generateNodeDetail(
  input: GenerateNodeDetailInput,
): Promise<GenerateNodeDetailResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { rawText } = await createChatCompletion([
        { role: "system", content: NODE_DETAIL_SYSTEM_BASE },
        {
          role: "user",
          content: buildNodeDetailUserMessage({
            topic: input.topic,
            nodeTitle: input.nodeTitle,
            nodeType: input.nodeType,
            prerequisitesContext: input.prerequisitesContext,
          }),
        },
      ], { providerConfig: input.providerConfig });
      const detail = parseNodeDetailResponse(rawText, input.nodeId, input.nodeType);
      const qualityWarnings = nodeDetailQualityWarnings(detail);
      return { detail, qualityWarnings };
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
