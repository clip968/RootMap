/**
 * Phase 3 LLM provider 설정 스모크(API 실호출 없음).
 * 실행: npm run llm:smoke-provider-settings (apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resetDbSingleton, getDb } from "../src/db/client";
import { createChatCompletion } from "../src/lib/llm/chat";
import {
  buildLlmProviderHeaders,
  resolveLlmProviderConfig,
  shouldSendJsonResponseFormat,
  type ResolvedLlmProviderConfig,
} from "../src/lib/llm/provider-config";
import {
  decryptLlmApiKey,
  encryptLlmApiKey,
} from "../src/lib/llm/provider-crypto";
import { GET, PUT, DELETE } from "../src/app/api/settings/llm-provider/route";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
const dbRel = path.join("data", "llm-provider-settings-smoke.db");
const dbAbs = path.join(process.cwd(), dbRel);
process.env.DATABASE_URL = `file:${dbAbs}`;
process.env.LLM_SETTINGS_SECRET = "smoke-secret-for-llm-provider-settings";
process.env.OPENROUTER_API_KEY = "sk-env-fallback";
process.env.OPENROUTER_MODEL = "env/model";
process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/";
process.env.OPENROUTER_SITE_URL = "https://rootmap.local";
process.env.OPENROUTER_APP_NAME = "RootMap Smoke";

resetDbSingleton();
fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
try {
  fs.rmSync(dbAbs, { force: true });
} catch {
  /* 스모크 DB가 없으면 그대로 진행한다. */
}
resetDbSingleton();

const db = getDb();
migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

const encrypted = encryptLlmApiKey("sk-round-trip");
assert(
  decryptLlmApiKey(encrypted) === "sk-round-trip",
  "encrypted API key should decrypt to original value",
);

const saveRes = await PUT(
  new Request("http://localhost/api/settings/llm-provider", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerType: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "db/model",
      apiKey: "sk-db-secret",
      jsonMode: "auto",
      isActive: true,
    }),
  }),
);
assert(saveRes.status === 200, "PUT should save provider settings");
const saveBody = (await saveRes.json()) as Record<string, unknown>;
assert(!JSON.stringify(saveBody).includes("sk-db-secret"), "PUT response should not expose raw API key");
assert(saveBody.apiKeyHint !== "sk-db-secret", "PUT response should return masked API key only");

const getBody = (await (await GET()).json()) as Record<string, unknown>;
assert(getBody.source === "database", "GET should report database source after save");
assert(!JSON.stringify(getBody).includes("sk-db-secret"), "GET response should not expose raw API key");

const resolved = resolveLlmProviderConfig();
assert(resolved.source === "database", "database provider should override env fallback");
assert(resolved.apiKey === "sk-db-secret", "resolved database provider should decrypt API key");
assert(resolved.model === "db/model", "resolved database provider should use DB model");
assert(
  resolved.baseUrl === "https://openrouter.ai/api/v1",
  "base URL should remove duplicate /chat/completions path",
);

const openRouterHeaders = buildLlmProviderHeaders(resolved);
assert(openRouterHeaders["HTTP-Referer"], "OpenRouter provider should include HTTP-Referer when configured");
assert(openRouterHeaders["X-OpenRouter-Title"], "OpenRouter provider should include app title when configured");

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

const previousFetch = globalThis.fetch;
const captured: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  captured.push({ url: input.toString(), init });
  return new Response(
    JSON.stringify({
      model: "custom/model",
      choices: [{ message: { content: "{\"ok\":true}" } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
try {
  await createChatCompletion([{ role: "user", content: "ping" }], {
    providerConfig: customConfig,
  });
} finally {
  globalThis.fetch = previousFetch;
}
const requestBody = JSON.parse(String(captured[0]?.init?.body ?? "{}")) as Record<string, unknown>;
assert(!("response_format" in requestBody), "jsonMode=disabled should omit response_format in request body");
assert(
  captured[0]?.url === "https://example.test/v1/chat/completions",
  "custom provider should call normalized chat completions URL",
);

const deleteBody = (await (await DELETE()).json()) as Record<string, unknown>;
assert(deleteBody.source === "env", "DELETE should return env fallback status");
const fallback = resolveLlmProviderConfig();
assert(fallback.source === "env", "env fallback should resolve after DB setting delete");
assert(fallback.apiKey === "sk-env-fallback", "env fallback should keep OPENROUTER_API_KEY behavior");

resetDbSingleton();
try {
  fs.rmSync(dbAbs, { force: true });
} catch {
  /* 스모크 DB 정리 실패는 다음 실행에서 덮어쓴다. */
}

console.log("llm:smoke-provider-settings OK");
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
