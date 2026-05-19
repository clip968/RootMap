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

export async function getActiveLlmProviderSetting(): Promise<LlmProviderSettingRow | null> {
  const rows = await getDb()
    .select()
    .from(llmProviderSettings)
    .where(eq(llmProviderSettings.isActive, true))
    .orderBy(desc(llmProviderSettings.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveActiveLlmProviderSetting(
  input: SaveLlmProviderSettingInput,
): Promise<LlmProviderSettingRow> {
  const db = getDb();
  const ts = nowIso();

  return db.transaction(async (tx) => {
    const existing = (await tx
      .select()
      .from(llmProviderSettings)
      .where(eq(llmProviderSettings.isActive, true))
      .orderBy(desc(llmProviderSettings.updatedAt))
      .limit(1))[0];

    // 단일 사용자 로컬 설정이므로 새 active 저장 전 기존 active 플래그를 내려 일관성을 맞춘다.
    if (input.isActive) {
      await tx.update(llmProviderSettings)
        .set({ isActive: false, updatedAt: ts })
        .where(eq(llmProviderSettings.isActive, true));
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
      const rows = await tx
        .update(llmProviderSettings)
        .set(values)
        .where(eq(llmProviderSettings.id, existing.id))
        .returning();
      const row = rows[0];
      if (!row) throw new Error("LLM provider setting update failed");
      return row;
    }

    const rows = await tx
      .insert(llmProviderSettings)
      .values({
        ...values,
        createdAt: ts,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("LLM provider setting insert failed");
    return row;
  });
}

export async function deleteActiveLlmProviderSetting(): Promise<boolean> {
  const result = await getDb()
    .delete(llmProviderSettings)
    .where(eq(llmProviderSettings.isActive, true))
    .returning({ id: llmProviderSettings.id });
  return result.length > 0;
}
