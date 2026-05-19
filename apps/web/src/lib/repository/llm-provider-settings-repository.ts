import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { llmProviderSettings } from "@/db/schema";
import type { EncryptedApiKey } from "@/lib/llm/provider-crypto";

export type LlmProviderType = "openrouter" | "openai_compatible" | "crofai";
export type LlmJsonMode = "auto" | "enabled" | "disabled";
export type LlmProviderSettingRow = typeof llmProviderSettings.$inferSelect;

export interface SaveLlmProviderSettingInput {
  providerType: LlmProviderType;
  name: string;
  baseUrl: string;
  model: string | null;
  jsonMode: LlmJsonMode;
  isActive: boolean;
  encryptedApiKey: EncryptedApiKey;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getActiveLlmProviderSetting(): LlmProviderSettingRow | null {
  const rows = getDb()
    .select()
    .from(llmProviderSettings)
    .where(eq(llmProviderSettings.isActive, true))
    .orderBy(desc(llmProviderSettings.updatedAt))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export function saveActiveLlmProviderSetting(
  input: SaveLlmProviderSettingInput,
): LlmProviderSettingRow {
  const db = getDb();
  const ts = nowIso();

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(llmProviderSettings)
      .where(eq(llmProviderSettings.isActive, true))
      .orderBy(desc(llmProviderSettings.updatedAt))
      .limit(1)
      .all()[0];

    // 단일 사용자 로컬 설정이므로 새 active 저장 전 기존 active 플래그를 내려 일관성을 맞춘다.
    if (input.isActive) {
      tx.update(llmProviderSettings)
        .set({ isActive: false, updatedAt: ts })
        .where(eq(llmProviderSettings.isActive, true))
        .run();
    }

    const values = {
      providerType: input.providerType,
      name: input.name,
      baseUrl: input.baseUrl,
      model: input.model,
      jsonMode: input.jsonMode,
      apiKeyEncrypted: input.encryptedApiKey.apiKeyEncrypted,
      apiKeyIv: input.encryptedApiKey.apiKeyIv,
      apiKeyTag: input.encryptedApiKey.apiKeyTag,
      apiKeyHint: input.encryptedApiKey.apiKeyHint,
      isActive: input.isActive,
      updatedAt: ts,
    };

    if (existing) {
      const rows = tx
        .update(llmProviderSettings)
        .set(values)
        .where(eq(llmProviderSettings.id, existing.id))
        .returning()
        .all();
      const row = rows[0];
      if (!row) throw new Error("LLM provider setting update failed");
      return row;
    }

    const rows = tx
      .insert(llmProviderSettings)
      .values({
        ...values,
        createdAt: ts,
      })
      .returning()
      .all();
    const row = rows[0];
    if (!row) throw new Error("LLM provider setting insert failed");
    return row;
  });
}

export function deleteActiveLlmProviderSetting(): boolean {
  const result = getDb()
    .delete(llmProviderSettings)
    .where(eq(llmProviderSettings.isActive, true))
    .run();
  return result.changes > 0;
}

