import { getActiveLlmProviderSetting } from "@/lib/repository/llm-provider-settings-repository";
import {
  decryptLlmApiKey,
  createApiKeyHint,
} from "@/lib/llm/provider-crypto";
import type {
  LlmJsonMode,
  LlmProviderSettingRow,
  LlmProviderType,
} from "@/lib/repository/llm-provider-settings-repository";

export interface ResolvedLlmProviderConfig {
  source: "database" | "env";
  providerType: LlmProviderType;
  name: string;
  baseUrl: string;
  model: string | null;
  jsonMode: LlmJsonMode;
  apiKey: string;
  apiKeyHint: string | null;
  timeoutMs: number;
}

export interface LlmProviderStatus {
  source: "database" | "env" | "none";
  providerType: LlmProviderType | null;
  name: string;
  baseUrl: string | null;
  model: string | null;
  jsonMode: LlmJsonMode;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyHint: string | null;
}

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_CROFAI_BASE_URL = "https://crof.ai/v1";

export function providerDisplayName(providerType: LlmProviderType): string {
  if (providerType === "openrouter") return "OpenRouter";
  if (providerType === "crofai") return "CrofAI";
  return "OpenAI-compatible";
}

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLlmProviderTimeoutMs(): number {
  return parseTimeoutMs(process.env.OPENROUTER_TIMEOUT_MS, 60_000);
}

export function getLlmProviderMaxAttempts(): number {
  return parseTimeoutMs(process.env.OPENROUTER_MAX_ATTEMPTS, 3);
}

export function normalizeProviderType(value: unknown): LlmProviderType | null {
  if (value === "openrouter") return "openrouter";
  if (value === "crofai") return "crofai";
  if (value === "openai_compatible" || value === "openai-compatible") {
    return "openai_compatible";
  }
  return null;
}

export function normalizeLlmBaseUrl(
  baseUrl: string | null | undefined,
  providerType: LlmProviderType,
): string {
  const fallback =
    providerType === "crofai" ? DEFAULT_CROFAI_BASE_URL
    : providerType === "openrouter" ? DEFAULT_OPENROUTER_BASE_URL
    : "";
  const raw = (baseUrl?.trim() || fallback).replace(/\/+$/, "");
  if (!raw) {
    throw new Error("Base URL을 입력해 주세요.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Base URL 형식이 올바르지 않습니다.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL은 http 또는 https URL이어야 합니다.");
  }

  // 사용자가 endpoint 전체를 붙여 넣어도 실제 호출 URL이 중복되지 않도록 base path만 남긴다.
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/chat/completions")) {
    parsed.pathname = pathname.slice(0, -"/chat/completions".length) || "/";
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export function shouldSendJsonResponseFormat(
  providerType: LlmProviderType,
  jsonMode: LlmJsonMode,
): boolean {
  if (jsonMode === "enabled") return true;
  if (jsonMode === "disabled") return false;
  // 기존 OpenRouter fallback 동작은 유지하고, custom provider는 보수적으로 끈다.
  return providerType === "openrouter";
}

function envJsonMode(): LlmJsonMode {
  if (process.env.OPENROUTER_JSON_MODE === "false") return "disabled";
  if (process.env.OPENROUTER_JSON_MODE === "true") return "enabled";
  return "auto";
}

function statusFromRow(row: LlmProviderSettingRow): LlmProviderStatus {
  return {
    source: "database",
    providerType: row.providerType as LlmProviderType,
    name: row.name,
    baseUrl: row.baseUrl,
    model: row.model,
    jsonMode: row.jsonMode as LlmJsonMode,
    isActive: row.isActive,
    hasApiKey: row.apiKeyEncrypted.length > 0,
    apiKeyHint: row.apiKeyHint,
  };
}

export function getEnvLlmProviderStatus(): LlmProviderStatus {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return {
    source: "env",
    providerType: "openrouter",
    name: "OpenRouter env fallback",
    baseUrl: normalizeLlmBaseUrl(
      process.env.OPENROUTER_BASE_URL,
      "openrouter",
    ),
    model: process.env.OPENROUTER_MODEL?.trim() || null,
    jsonMode: envJsonMode(),
    isActive: true,
    hasApiKey: apiKey.length > 0,
    apiKeyHint: apiKey ? createApiKeyHint(apiKey) : null,
  };
}

export function getEmptyLlmProviderStatus(): LlmProviderStatus {
  return {
    source: "none",
    providerType: null,
    name: "No provider configured",
    baseUrl: null,
    model: null,
    jsonMode: "auto",
    isActive: false,
    hasApiKey: false,
    apiKeyHint: null,
  };
}

export async function getLlmProviderStatus(userId: string): Promise<LlmProviderStatus> {
  const row = await getActiveLlmProviderSetting(userId);
  return row ? statusFromRow(row) : getEmptyLlmProviderStatus();
}

export async function resolveLlmProviderConfig(userId?: string): Promise<ResolvedLlmProviderConfig> {
  const row = userId ? await getActiveLlmProviderSetting(userId) : null;
  if (row) {
    return {
      source: "database",
      providerType: row.providerType as LlmProviderType,
      name: row.name,
      baseUrl: row.baseUrl,
      model: row.model,
      jsonMode: row.jsonMode as LlmJsonMode,
      apiKey: decryptLlmApiKey(row),
      apiKeyHint: row.apiKeyHint,
      timeoutMs: getLlmProviderTimeoutMs(),
    };
  }

  if (userId) {
    throw new Error("먼저 계정의 LLM API key를 설정해 주세요.");
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY 또는 저장된 LLM provider API key가 필요합니다.");
  }
  return {
    ...getEnvLlmProviderStatus(),
    apiKey,
    timeoutMs: getLlmProviderTimeoutMs(),
  };
}

export function buildLlmProviderHeaders(
  config: ResolvedLlmProviderConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.providerType === "openrouter") {
    if (process.env.OPENROUTER_SITE_URL) {
      headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
    }
    if (process.env.OPENROUTER_APP_NAME) {
      headers["X-OpenRouter-Title"] = process.env.OPENROUTER_APP_NAME;
    }
  }
  return headers;
}
