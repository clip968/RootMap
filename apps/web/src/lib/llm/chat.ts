import { LlmTransportError } from "@/lib/llm/errors";

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
}

function getBaseUrl(): string {
  const u = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  return u.replace(/\/$/, "");
}

function jsonObjectModeEnabled(): boolean {
  return process.env.OPENROUTER_JSON_MODE !== "false";
}

export function getOpenRouterTimeoutMs(): number {
  const raw = process.env.OPENROUTER_TIMEOUT_MS;
  if (!raw) return 60_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

export function getOpenRouterMaxAttempts(): number {
  const raw = process.env.OPENROUTER_MAX_ATTEMPTS;
  if (!raw) return 3;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

/**
 * OpenRouter Chat Completions. 서버 전용(환경 변수 사용).
 *
 * 공식 OpenRouter API는 OpenAI Chat Completions와 유사한 요청/응답 스키마를 사용한다.
 */
export async function createChatCompletion(messages: ChatMessage[]): Promise<{
  rawText: string;
  status: number;
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new LlmTransportError("OPENROUTER_API_KEY가 설정되어 있지 않습니다.", 0);
  }

  const model = process.env.OPENROUTER_MODEL;
  const body: Record<string, unknown> = {
    messages,
    temperature: 0.4,
  };
  if (model) {
    body.model = model;
  }

  if (jsonObjectModeEnabled()) {
    body.response_format = { type: "json_object" };
  }

  const timeoutMs = getOpenRouterTimeoutMs();
  const controller = new AbortController();
  // standalone smoke와 서버 라우트 모두에서 LLM 호출 하나가 무기한 대기하지 않도록 제한한다.
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  let status = 0;
  let json: OpenRouterChatCompletionResponse;
  try {
    res = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(process.env.OPENROUTER_SITE_URL
          ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
          : {}),
        ...(process.env.OPENROUTER_APP_NAME
          ? { "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME }
          : {}),
      },
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

  return { rawText: content, status };
}
