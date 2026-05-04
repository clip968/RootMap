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

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
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

  const status = res.status;
  const json = (await res.json()) as OpenRouterChatCompletionResponse;

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
