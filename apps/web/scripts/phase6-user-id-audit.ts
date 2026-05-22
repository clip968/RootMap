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
    const isPhase4Route = PHASE4_AUTH_ROUTES.includes(entry.file as (typeof PHASE4_AUTH_ROUTES)[number]);
    assert(!isPhase4Route, `${entry.file} is a Phase 4 auth route and cannot use DEFAULT_USER_ID`);
    console.info(`[LEGACY] ${entry.file}`);
  }

  if (process.env.PHASE6_ENFORCE_NO_DEFAULT_USER_ID === "1") {
    assert(usage.length === 0, "PHASE6_ENFORCE_NO_DEFAULT_USER_ID=1 forbids all DEFAULT_USER_ID usage in src");
  }
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
  assertDocumentRepositoryHasScopedReads();
  reportLegacyDefaultUserUsage();
  console.info("Phase 6 task 02 legacy user id/auth mapping audit passed.");
}

void main().catch((error) => {
  console.error("[phase6:user-id-audit] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
