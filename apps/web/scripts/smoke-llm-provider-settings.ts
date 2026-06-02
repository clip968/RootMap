/**
 * Phase 11 LLM provider settings smoke.
 *
 * The app database client is Postgres-only, so this smoke avoids the removed
 * SQLite test database path. It verifies the user-owned source contract and
 * still exercises pure crypto/provider helpers with real values.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildLlmProviderHeaders,
  shouldSendJsonResponseFormat,
  type ResolvedLlmProviderConfig,
} from "../src/lib/llm/provider-config";
import {
  decryptLlmApiKey,
  encryptLlmApiKey,
} from "../src/lib/llm/provider-crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function assertContains(source: string, needle: string, message: string): void {
  assert(source.includes(needle), message);
}

function assertNotContains(source: string, needle: string, message: string): void {
  assert(!source.includes(needle), message);
}

function assertUserScopedRepository(): void {
  const source = readSource("src/lib/repository/llm-provider-settings-repository.ts");
  assertContains(source, "getActiveLlmProviderSetting(userId", "active lookup must require userId");
  assertContains(source, "deleteActiveLlmProviderSetting(userId", "delete must require userId");
  assertContains(source, "userId: string", "save input must carry userId");
  assertContains(
    source,
    "eq(llmProviderSettings.userId, userId)",
    "active lookup/delete must filter by authenticated user id",
  );
  assertContains(
    source,
    "eq(llmProviderSettings.userId, input.userId)",
    "save/update must filter by the input user id",
  );
}

function assertSettingsRoutesUseAuthUser(): void {
  const route = readSource("src/app/api/settings/llm-provider/route.ts");
  const testRoute = readSource("src/app/api/settings/llm-provider/test/route.ts");

  for (const [label, source] of [
    ["settings route", route],
    ["settings test route", testRoute],
  ] as const) {
    assertContains(source, "requireSupabaseAuthUserId(req)", `${label} must require Supabase Auth`);
    assertContains(source, "auth.userId", `${label} must pass authenticated user id`);
  }

  assertContains(route, "getActiveLlmProviderSetting(auth.userId)", "PUT must keep only the user's existing key");
  assertContains(route, "userId: auth.userId", "PUT must save settings under the authenticated user");
  assertContains(route, "deleteActiveLlmProviderSetting(auth.userId)", "DELETE must remove only the user's setting");
  assertContains(testRoute, "getActiveLlmProviderSetting(userId)", "test route must read only the user's saved key");
  assertNotContains(testRoute, "OPENROUTER_API_KEY", "test route must not use env fallback for logged-in users");
}

function assertSchemaAndMigration(): void {
  const schema = readSource("src/db/schema.ts");
  const migration = readSource("drizzle/0008_llm_provider_settings_user_id.sql");

  assertContains(schema, 'userId: text("user_id").notNull()', "schema must include llm_provider_settings.user_id");
  assertContains(schema, "llm_provider_settings_user_active_idx", "schema must index user active lookup");
  assertContains(migration, 'add column if not exists "user_id" text', "migration must add user_id");
  assertContains(migration, "legacy_global_provider", "migration must not auto-assign legacy rows to real users");
  assertContains(migration, 'where "is_active" = true', "migration must enforce one active row per user");
}

function assertProviderHelpers(): void {
  process.env.LLM_SETTINGS_SECRET = "smoke-secret-for-llm-provider-settings";
  process.env.OPENROUTER_SITE_URL = "https://rootmap.local";
  process.env.OPENROUTER_APP_NAME = "RootMap Smoke";

  const encrypted = encryptLlmApiKey("sk-round-trip");
  assert(
    decryptLlmApiKey(encrypted) === "sk-round-trip",
    "encrypted API key should decrypt to original value",
  );

  const customConfig: ResolvedLlmProviderConfig = {
    source: "database",
    providerType: "openai_compatible",
    name: "Custom",
    baseUrl: "https://example.test/v1",
    model: "custom/model",
    jsonMode: "disabled",
    apiKey: "sk-custom",
    apiKeyHint: "sk-c...stom",
    timeoutMs: 1_000,
  };
  const customHeaders = buildLlmProviderHeaders(customConfig);
  assert(customHeaders.Authorization === "Bearer sk-custom", "custom provider should send bearer token");
  assert(customHeaders["Content-Type"] === "application/json", "custom provider should send JSON content type");
  assert(!customHeaders["HTTP-Referer"], "custom provider should not send OpenRouter referer header");
  assert(!customHeaders["X-OpenRouter-Title"], "custom provider should not send OpenRouter title header");
  assert(
    !shouldSendJsonResponseFormat(customConfig.providerType, customConfig.jsonMode),
    "jsonMode=disabled should skip response_format",
  );

  const openRouterConfig: ResolvedLlmProviderConfig = {
    ...customConfig,
    providerType: "openrouter",
    jsonMode: "auto",
  };
  const openRouterHeaders = buildLlmProviderHeaders(openRouterConfig);
  assert(openRouterHeaders["HTTP-Referer"], "OpenRouter provider should include configured referer");
  assert(openRouterHeaders["X-OpenRouter-Title"], "OpenRouter provider should include configured app title");
  assert(
    shouldSendJsonResponseFormat(openRouterConfig.providerType, openRouterConfig.jsonMode),
    "OpenRouter auto JSON mode should request JSON response format",
  );
}

function main(): void {
  assertSchemaAndMigration();
  assertUserScopedRepository();
  assertSettingsRoutesUseAuthUser();
  assertProviderHelpers();
  console.log("llm:smoke-provider-settings OK");
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
