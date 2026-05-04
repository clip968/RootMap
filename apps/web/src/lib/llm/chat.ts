import { LlmTransportError } from "@/lib/llm/errors";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface OpenAiChoiceMessage {
  content?: string | null;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{ message?: OpenAiChoiceMessage }>;
  error?: { message?: string };
}

function getBaseUrl(): string {
  const u = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  return u.replace(/\/$/, "");
}

function jsonObjectModeEnabled(): boolean {
  return process.env.OPENAI_JSON_MODE !== "false";
}

/**
 * OpenAI 호환 Chat Completions. 서버 전용(환경 변수 사용).
 */
export async function createChatCompletion(messages: ChatMessage[]): Promise<{
  rawText: string;
  status: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmTransportError("OPENAI_API_KEY가 설정되어 있지 않습니다.", 0);
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.4,
  };

  if (jsonObjectModeEnabled()) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const status = res.status;
  const json = (await res.json()) as OpenAiChatCompletionResponse;

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
