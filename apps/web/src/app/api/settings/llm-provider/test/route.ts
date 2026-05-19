import { jsonError } from "@/lib/api-errors";
import { createChatCompletion } from "@/lib/llm/chat";
import {
  getLlmProviderTimeoutMs,
  normalizeLlmBaseUrl,
  normalizeProviderType,
  providerDisplayName,
  resolveLlmProviderConfig,
  type ResolvedLlmProviderConfig,
} from "@/lib/llm/provider-config";
import { decryptLlmApiKey } from "@/lib/llm/provider-crypto";
import { getActiveLlmProviderSetting } from "@/lib/repository/llm-provider-settings-repository";
import type { LlmJsonMode } from "@/lib/repository/llm-provider-settings-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeJsonMode(value: unknown): LlmJsonMode {
  if (value === "enabled" || value === "disabled" || value === "auto") {
    return value;
  }
  return "auto";
}

async function readOptionalBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ?
        (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function configFromBody(body: Record<string, unknown>): ResolvedLlmProviderConfig | null {
  const providerType = normalizeProviderType(body.providerType);
  if (!providerType) return null;

  const existing = getActiveLlmProviderSetting();
  const apiKey =
    typeof body.apiKey === "string" && body.apiKey.trim() ?
      body.apiKey.trim()
    : existing ? decryptLlmApiKey(existing)
    : process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("연결 테스트에 사용할 API key가 없습니다.");
  }

  return {
    source: existing ? "database" : "env",
    providerType,
    name: providerDisplayName(providerType),
    baseUrl: normalizeLlmBaseUrl(
      typeof body.baseUrl === "string" ? body.baseUrl : null,
      providerType,
    ),
    model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null,
    jsonMode: normalizeJsonMode(body.jsonMode),
    apiKey,
    apiKeyHint: existing?.apiKeyHint ?? null,
    timeoutMs: getLlmProviderTimeoutMs(),
  };
}

export async function POST(req: Request) {
  let config: ResolvedLlmProviderConfig;
  try {
    const body = await readOptionalBody(req);
    config = configFromBody(body) ?? resolveLlmProviderConfig();
  } catch (err) {
    return jsonError(
      "INVALID_REQUEST",
      err instanceof Error ? err.message : "LLM provider 설정을 확인해 주세요.",
      400,
    );
  }

  try {
    const result = await createChatCompletion(
      [
        {
          role: "system",
          content: "Return a compact JSON object for a provider connection test.",
        },
        { role: "user", content: '{"ok":true}' },
      ],
      { providerConfig: config },
    );
    return NextResponse.json({
      ok: true,
      source: config.source,
      status: result.status,
      model: result.model,
    });
  } catch (err) {
    return jsonError(
      "LLM_GENERATION_FAILED",
      err instanceof Error ? err.message : "LLM provider 연결 테스트에 실패했습니다.",
      502,
    );
  }
}
