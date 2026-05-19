import { jsonError } from "@/lib/api-errors";
import {
  getEnvLlmProviderStatus,
  getLlmProviderStatus,
  normalizeLlmBaseUrl,
  normalizeProviderType,
  providerDisplayName,
} from "@/lib/llm/provider-config";
import {
  assertLlmSettingsSecretAvailable,
  encryptLlmApiKey,
} from "@/lib/llm/provider-crypto";
import {
  deleteActiveLlmProviderSetting,
  getActiveLlmProviderSetting,
  saveActiveLlmProviderSetting,
  type LlmJsonMode,
} from "@/lib/repository/llm-provider-settings-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeJsonMode(value: unknown): LlmJsonMode {
  if (value === "enabled" || value === "disabled" || value === "auto") {
    return value;
  }
  return "auto";
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function statusBody() {
  return getLlmProviderStatus();
}

export async function GET() {
  return NextResponse.json(await statusBody());
}

export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError("INVALID_REQUEST", "JSON 객체 본문이 필요합니다.", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_REQUEST", "JSON 형식의 요청 본문이 필요합니다.", 400);
  }

  const providerType = normalizeProviderType(body.providerType);
  if (!providerType) {
    return jsonError("INVALID_REQUEST", "지원하지 않는 provider type입니다.", 400);
  }

  const apiKey =
    typeof body.apiKey === "string" ? body.apiKey.trim()
    : typeof body.api_key === "string" ? body.api_key.trim()
    : "";
  const existing = await getActiveLlmProviderSetting();
  if (!apiKey && !existing?.apiKeyEncrypted) {
    return jsonError("INVALID_REQUEST", "API key를 입력해 주세요.", 400);
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeLlmBaseUrl(
      typeof body.baseUrl === "string" ? body.baseUrl : null,
      providerType,
    );
    assertLlmSettingsSecretAvailable();
  } catch (err) {
    return jsonError("INVALID_REQUEST", safeMessage(err, "설정 값을 확인해 주세요."), 400);
  }

  const encryptedApiKey =
    apiKey ? encryptLlmApiKey(apiKey)
    : {
        apiKeyEncrypted: existing?.apiKeyEncrypted ?? "",
        apiKeyIv: existing?.apiKeyIv ?? "",
        apiKeyTag: existing?.apiKeyTag ?? "",
        apiKeyHint: existing?.apiKeyHint ?? "",
      };

  try {
    const row = await saveActiveLlmProviderSetting({
      providerType,
      name: providerDisplayName(providerType),
      baseUrl,
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null,
      jsonMode: normalizeJsonMode(body.jsonMode),
      isActive: body.isActive !== false,
      encryptedApiKey,
    });

    return NextResponse.json({
      source: "database",
      providerType: row.providerType,
      name: row.name,
      baseUrl: row.baseUrl,
      model: row.model,
      jsonMode: row.jsonMode,
      isActive: row.isActive,
      hasApiKey: row.apiKeyEncrypted.length > 0,
      apiKeyHint: row.apiKeyHint,
    });
  } catch {
    return jsonError(
      "PROCESSING_FAILED",
      "LLM provider 설정을 저장하지 못했습니다.",
      500,
    );
  }
}

export async function DELETE() {
  await deleteActiveLlmProviderSetting();
  return NextResponse.json(getEnvLlmProviderStatus());
}
