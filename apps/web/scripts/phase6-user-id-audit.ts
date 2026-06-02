import fs from "node:fs";
import path from "node:path";
import { assert, readText } from "./phase6-security-utils";

const LEGACY_TABLES = [
  "learning_trees",
  "user_node_progress",
  "documents",
  "user_concept_progress",
] as const;

const PHASE4_AUTH_ROUTES = [
  "src/app/api/sessions/start/route.ts",
  "src/app/api/sessions/[sessionId]/end/route.ts",
  "src/app/api/events/route.ts",
  "src/app/api/concepts/[conceptId]/mastery/route.ts",
  "src/app/api/trees/[treeId]/personalized/route.ts",
  "src/app/api/trees/[treeId]/recommendations/personalized/route.ts",
  "src/app/api/quizzes/attempts/route.ts",
  "src/app/api/reviews/due/route.ts",
  "src/app/api/reports/generate/route.ts",
  "src/app/api/recommendations/click/route.ts",
] as const;

const PHASE11_USER_OWNED_ROUTES = [
  "src/app/api/trees/route.ts",
  "src/app/api/trees/generate/route.ts",
  "src/app/api/trees/[treeId]/route.ts",
  "src/app/api/trees/[treeId]/recommendations/route.ts",
  "src/app/api/nodes/[nodeId]/progress/route.ts",
  "src/app/api/nodes/[nodeId]/detail/route.ts",
  "src/app/api/node-detail-jobs/[jobId]/route.ts",
  "src/app/api/documents/upload-url/route.ts",
  "src/app/api/documents/complete-upload/route.ts",
  "src/app/api/documents/upload/route.ts",
  "src/app/api/documents/[documentId]/route.ts",
  "src/app/api/documents/[documentId]/process/route.ts",
  "src/app/api/documents/[documentId]/tree/route.ts",
  "src/app/api/documents/[documentId]/concepts/route.ts",
  "src/app/api/document-concepts/[documentConceptId]/evidence/route.ts",
  "src/app/api/settings/llm-provider/route.ts",
  "src/app/api/settings/llm-provider/test/route.ts",
] as const;

const DEFAULT_USER_ID_ALLOWED_PATHS = [
  "src/db/constants.ts",
  "src/lib/document/local-runner.ts",
  "scripts/",
] as const;

const USER_OWNED_ROUTE_SET = new Set<string>([
  ...PHASE4_AUTH_ROUTES,
  ...PHASE11_USER_OWNED_ROUTES,
]);

function listFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

function assertLegacyTablesAreTextUserId(schemaSource: string): void {
  for (const table of LEGACY_TABLES) {
    const tableIndex = schemaSource.indexOf(`"${table}"`);
    assert(tableIndex >= 0, `${table} schema definition missing`);
    const window = schemaSource.slice(tableIndex, tableIndex + 1200);
    assert(window.includes('text("user_id")'), `${table} should still be classified as legacy text user_id`);
    console.info(`[OK] ${table} is classified as legacy text user_id`);
  }
}

function assertPhase4RoutesRequireAuth(): void {
  for (const route of PHASE4_AUTH_ROUTES) {
    const source = readText(route);
    assert(source.includes("requireSupabaseAuthUserId"), `${route} must require Supabase Auth`);
    assert(!source.includes("DEFAULT_USER_ID"), `${route} must not use DEFAULT_USER_ID`);
    console.info(`[OK] ${route} uses Supabase Auth user id`);
  }
}

function assertRouteCanPassRequestToAuth(route: string, source: string): void {
  const handlers = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(\s*([A-Za-z_$][\w$]*)\s*:\s*(?:Request|NextRequest)/g)];
  assert(handlers.length > 0, `${route} must expose Request or NextRequest route handlers`);

  for (const [, method, requestVariable] of handlers) {
    assert(
      source.includes(`requireSupabaseAuthUserId(${requestVariable})`),
      `${route} ${method} must pass its Request object to requireSupabaseAuthUserId`,
    );
  }
}

function assertPhase11UserOwnedRoutesRequireAuth(): void {
  for (const route of PHASE11_USER_OWNED_ROUTES) {
    const source = readText(route);

    // Phase 11 moves these production APIs from the shared development user
    // into the Supabase Auth boundary. Keeping the checks source-based makes
    // regressions visible before any route can be exercised manually.
    assert(source.includes("requireSupabaseAuthUserId"), `${route} must require Supabase Auth`);
    assertRouteCanPassRequestToAuth(route, source);
    assert(source.includes("auth.userId"), `${route} must pass the authenticated user id into user-owned work`);
    assert(!source.includes("DEFAULT_USER_ID"), `${route} must not use DEFAULT_USER_ID`);
    console.info(`[OK] ${route} uses Phase 11 Supabase Auth ownership`);
  }
}

function isDefaultUserAllowedPath(relativePath: string): boolean {
  return DEFAULT_USER_ID_ALLOWED_PATHS.some((allowedPath) =>
    allowedPath.endsWith("/") ? relativePath.startsWith(allowedPath) : relativePath === allowedPath,
  );
}

function reportLegacyDefaultUserUsage(): void {
  const files = listFiles(path.join(process.cwd(), "src"));
  const usage = files
    .map((file) => ({
      file: path.relative(process.cwd(), file),
      source: fs.readFileSync(file, "utf8"),
    }))
    .filter((entry) => entry.source.includes("DEFAULT_USER_ID"));

  console.info(`[phase6:user-id-audit] DEFAULT_USER_ID appears in ${usage.length} src files.`);
  for (const entry of usage) {
    const isUserOwnedRoute = USER_OWNED_ROUTE_SET.has(entry.file);
    const isAllowedException = isDefaultUserAllowedPath(entry.file);
    assert(!isUserOwnedRoute, `${entry.file} is a user-owned production route and cannot use DEFAULT_USER_ID`);
    assert(
      isAllowedException,
      `${entry.file} uses DEFAULT_USER_ID but is not listed in the Phase 11 local/dev exception list`,
    );
    console.info(`[LOCAL-ONLY] ${entry.file}`);
  }

  if (process.env.PHASE6_ENFORCE_NO_DEFAULT_USER_ID === "1") {
    assert(usage.length === 0, "PHASE6_ENFORCE_NO_DEFAULT_USER_ID=1 forbids all DEFAULT_USER_ID usage in src");
  }
}

function assertLlmProviderRepositoryIsUserScoped(): void {
  const source = readText("src/lib/repository/llm-provider-settings-repository.ts");

  // These repository calls are a cost and secret boundary. Every active lookup,
  // write, and delete must include the caller's Supabase Auth user id.
  assert(
    source.includes("getActiveLlmProviderSetting(userId"),
    "getActiveLlmProviderSetting must require userId",
  );
  assert(
    source.includes("saveActiveLlmProviderSetting") &&
      (source.includes("userId: string") || source.includes("userId:")),
    "saveActiveLlmProviderSetting must require userId",
  );
  assert(
    source.includes("deleteActiveLlmProviderSetting(userId"),
    "deleteActiveLlmProviderSetting must require userId",
  );
  assert(
    source.includes("eq(llmProviderSettings.userId, userId)"),
    "LLM provider active lookup/save/delete paths must filter by llmProviderSettings.userId",
  );
  console.info("[OK] LLM provider settings repository is user-scoped");
}

function assertDocumentRepositoryHasScopedReads(): void {
  const source = readText("src/lib/repository/document-repository.ts");
  assert(
    source.includes("getDocumentForUser") &&
      source.includes("eq(documents.id, documentId)") &&
      source.includes("eq(documents.userId, userId)"),
    "getDocumentForUser must filter by document id and user id",
  );

  const unsafeUpdates = [
    "updateDocumentStatus",
    "updateDocumentExtractedInfo",
    "updateDocumentMetadata",
  ].filter((name) => source.includes(`export async function ${name}`));
  console.info(`[phase6:user-id-audit] documentId-only update helpers: ${unsafeUpdates.join(", ")}`);
}

async function main(): Promise<void> {
  const schemaSource = readText("src/db/schema.ts");
  assertLegacyTablesAreTextUserId(schemaSource);
  assertPhase4RoutesRequireAuth();
  assertPhase11UserOwnedRoutesRequireAuth();
  assertLlmProviderRepositoryIsUserScoped();
  assertDocumentRepositoryHasScopedReads();
  reportLegacyDefaultUserUsage();
  console.info("Phase 11 auth isolation audit passed.");
}

void main().catch((error) => {
  console.error("[phase6:user-id-audit] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
