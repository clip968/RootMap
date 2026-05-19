import { LlmTransportError } from "@/lib/llm/errors";
import {
  buildChatCompletionsUrl,
  buildLlmProviderHeaders,
  getLlmProviderMaxAttempts,
  getLlmProviderTimeoutMs,
  resolveLlmProviderConfig,
  shouldSendJsonResponseFormat,
  type ResolvedLlmProviderConfig,
} from "@/lib/llm/provider-config";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface OpenRouterChoiceMessage {
  content?: string | null;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{ message?: OpenRouterChoiceMessage }>;
  error?: { message?: string };
  model?: string;
}

export function getOpenRouterTimeoutMs(): number {
  return getLlmProviderTimeoutMs();
}

export function getOpenRouterMaxAttempts(): number {
  return getLlmProviderMaxAttempts();
}

/**
 * OpenAI-compatible Chat Completions. 서버 전용(DB 또는 환경 변수의 API key 사용).
 *
 * provider 설정이 있으면 DB 값을 우선 사용하고, 없으면 기존 OpenRouter 환경 변수 fallback을 유지한다.
 */
export async function createChatCompletion(
  messages: ChatMessage[],
  options: { providerConfig?: ResolvedLlmProviderConfig } = {},
): Promise<{
  rawText: string;
  status: number;
  model: string | null;
}> {
  let config: ResolvedLlmProviderConfig;
  try {
    config = options.providerConfig ?? (await resolveLlmProviderConfig());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "LLM provider 설정을 확인해 주세요.";
    throw new LlmTransportError(message, 0);
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: 0.4,
  };
  if (config.model) {
    body.model = config.model;
  }

  if (shouldSendJsonResponseFormat(config.providerType, config.jsonMode)) {
    body.response_format = { type: "json_object" };
  }

  const timeoutMs = config.timeoutMs;
  const controller = new AbortController();
  // standalone smoke와 서버 라우트 모두에서 LLM 호출 하나가 무기한 대기하지 않도록 제한한다.
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  let status = 0;
  let json: OpenRouterChatCompletionResponse;
  try {
    res = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: buildLlmProviderHeaders(config),
      body: JSON.stringify(body),
    });
    status = res.status;
    json = (await res.json()) as OpenRouterChatCompletionResponse;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new LlmTransportError(`LLM 요청 시간이 ${timeoutMs}ms를 초과했습니다.`, 0);
    }
    const message = err instanceof Error ? err.message : "알 수 없는 네트워크 오류";
    throw new LlmTransportError(`LLM 요청 실패: ${message}`, 0);
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!res.ok) {
    const msg =
      json.error?.message ?? `LLM HTTP 오류 (${status})`;
    throw new LlmTransportError(msg, status);
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new LlmTransportError("LLM 응답 본문이 비어 있습니다.", status);
  }

  return { rawText: content, status, model: json.model ?? config.model };
}
