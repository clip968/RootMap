import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

export const PHASE4_OWNER_TABLES = [
  "learning_sessions",
  "learning_events",
  "user_concept_mastery",
  "quiz_attempts",
  "recommendation_logs",
  "learning_reports",
] as const;

export const PHASE11_TEXT_OWNER_TABLES = [
  "learning_trees",
  "documents",
  "user_node_progress",
  "user_concept_progress",
  "llm_provider_settings",
] as const;

export type Phase4OwnerTable = (typeof PHASE4_OWNER_TABLES)[number];
export type Phase11TextOwnerTable = (typeof PHASE11_TEXT_OWNER_TABLES)[number];
export type SecurityTarget = "local" | "staging" | "production";

export interface SecurityConfig {
  target: SecurityTarget;
  supabaseUrl: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
  databaseUrl: string | null;
}

export interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

const VALID_TARGETS = new Set<SecurityTarget>(["local", "staging", "production"]);
const PRODUCTION_CONFIRMATION = "I_UNDERSTAND_THIS_TOUCHES_PRODUCTION";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function appPath(...segments: string[]): string {
  return path.join(process.cwd(), ...segments);
}

export function readText(relativePath: string): string {
  const absolutePath = appPath(relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

/**
 * Scripts are run outside Next.js, so `.env.local` is not loaded automatically.
 * This loader intentionally avoids printing values because these files can contain
 * database URLs, LLM keys, and Supabase service-role keys.
 */
export function loadLocalEnv(): void {
  for (const filename of [".env", ".env.local"]) {
    const absolutePath = appPath(filename);
    if (!fs.existsSync(absolutePath)) continue;

    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = unquoteEnvValue(rawValue.trim());
    }
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function getSecurityTarget(): SecurityTarget {
  const raw = process.env.PHASE6_SECURITY_TEST_TARGET?.trim() || "local";
  assert(
    VALID_TARGETS.has(raw as SecurityTarget),
    `PHASE6_SECURITY_TEST_TARGET must be one of local, staging, production. Received: ${raw}`,
  );
  const target = raw as SecurityTarget;
  if (target === "production") {
    assert(
      process.env.PHASE6_ALLOW_PRODUCTION_SECURITY_TEST === PRODUCTION_CONFIRMATION,
      `production security tests require PHASE6_ALLOW_PRODUCTION_SECURITY_TEST=${PRODUCTION_CONFIRMATION}`,
    );
  }
  return target;
}

export function inferSupabaseUrlFromDatabaseUrl(databaseUrl: string | null): string | null {
  if (!databaseUrl) return null;
  try {
    const parsed = new URL(databaseUrl);
    const dbHostMatch = parsed.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    if (dbHostMatch?.[1]) return `https://${dbHostMatch[1]}.supabase.co`;

    const poolerUserMatch = parsed.username.match(/^postgres\.([a-z0-9-]+)$/i);
    if (poolerUserMatch?.[1]) return `https://${poolerUserMatch[1]}.supabase.co`;
  } catch {
    return null;
  }
  return null;
}

export function getSecurityConfig(): SecurityConfig {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim() || null;
  return {
    target: getSecurityTarget(),
    supabaseUrl:
      process.env.SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      inferSupabaseUrlFromDatabaseUrl(databaseUrl),
    anonKey:
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    databaseUrl,
  };
}

export function assertNoSqliteDatabaseUrl(config: SecurityConfig): CheckResult {
  if (config.databaseUrl?.startsWith("file:")) {
    return {
      label: "DATABASE_URL",
      ok: false,
      detail: "file: URL is not allowed for Phase 6 security checks.",
    };
  }
  return {
    label: "DATABASE_URL",
    ok: Boolean(config.databaseUrl),
    detail: config.databaseUrl
      ? "Postgres-style DATABASE_URL is configured."
      : "DATABASE_URL is missing; DB role audit cannot run.",
  };
}

export function getCombinedPhase4MigrationSql(): string {
  return [
    "drizzle/0004_phase4_learning_sessions_events_mastery.sql",
    "drizzle/0005_phase4_quiz_misconception_recommendation_report.sql",
  ]
    .map(readText)
    .join("\n");
}

export function getPhase11OwnerRlsMigrationSql(): string {
  return readText("drizzle/0009_phase11_legacy_owner_rls.sql");
}

export function assertPhase4MigrationSecurityShape(sql: string): CheckResult[] {
  const checks: CheckResult[] = [];
  for (const table of PHASE4_OWNER_TABLES) {
    checks.push({
      label: `${table}:rls`,
      ok: sql.includes(`alter table "${table}" enable row level security`),
      detail: "RLS must be enabled in the Phase 4 migration.",
    });
    checks.push({
      label: `${table}:owner-policy`,
      ok:
        sql.includes(`"${table}_owner_all"`) &&
        sql.includes("for all to authenticated") &&
        /using\s*\(\s*(?:\(?select\s+)?auth\.uid\(\)?\)?\s*=\s*user_id\s*\)/i.test(sql),
      detail: "Owner policy must restrict authenticated users to their own user_id.",
    });
    checks.push({
      label: `${table}:user-index`,
      ok: sql.includes(`"${table}`) && sql.includes(`"user_id"`),
      detail: "Table must carry user_id so route filters and RLS compare the same owner column.",
    });
  }
  return checks;
}

export function assertPhase11OwnerRlsMigrationShape(sql: string): CheckResult[] {
  const checks: CheckResult[] = [];
  for (const table of PHASE11_TEXT_OWNER_TABLES) {
    const policyShape = new RegExp(
      `create\\s+policy\\s+"${table}_owner_all"\\s+on\\s+"${table}"[\\s\\S]*?for\\s+all\\s+to\\s+authenticated[\\s\\S]*?using\\s*\\(\\s*\\(\\s*select\\s+auth\\.uid\\(\\)\\s*\\)::text\\s*=\\s*user_id\\s*\\)[\\s\\S]*?with\\s+check\\s*\\(\\s*\\(\\s*select\\s+auth\\.uid\\(\\)\\s*\\)::text\\s*=\\s*user_id\\s*\\)`,
      "i",
    );
    checks.push({
      label: `${table}:phase11-rls`,
      ok: sql.includes(`alter table "${table}" enable row level security`),
      detail: "Phase 11 owner migration must explicitly enable RLS on the table.",
    });
    checks.push({
      label: `${table}:phase11-owner-policy`,
      ok: policyShape.test(sql),
      detail: "Owner policy must use auth.uid()::text = user_id for both USING and WITH CHECK.",
    });
  }
  return checks;
}

export function printChecks(checks: CheckResult[]): void {
  for (const check of checks) {
    const status = check.ok ? "OK" : "FAIL";
    console.info(`[${status}] ${check.label} - ${check.detail}`);
  }
}

export function assertAllChecks(checks: CheckResult[]): void {
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      failed.map((check) => `${check.label}: ${check.detail}`).join("\n"),
    );
  }
}

export function hasLiveSupabaseAuthConfig(config: SecurityConfig): boolean {
  return Boolean(config.supabaseUrl && config.anonKey && config.serviceRoleKey);
}

export interface PostgresRoleAudit {
  currentUser: string;
  sessionUser: string;
  rolSuper: boolean;
  rolBypassRls: boolean;
}

export async function auditPostgresRole(
  databaseUrl: string,
): Promise<PostgresRoleAudit> {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });
  try {
    const rows = await sql<{
      current_user: string;
      session_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }[]>`
      select
        current_user::text,
        session_user::text,
        coalesce(r.rolsuper, false) as rolsuper,
        coalesce(r.rolbypassrls, false) as rolbypassrls
      from pg_roles r
      where r.rolname = current_user
    `;
    const row = rows[0];
    assert(row, "current Postgres role was not found in pg_roles");
    return {
      currentUser: row.current_user,
      sessionUser: row.session_user,
      rolSuper: row.rolsuper,
      rolBypassRls: row.rolbypassrls,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function supabaseFetchJson<T>(
  config: SecurityConfig,
  pathAndQuery: string,
  init: RequestInit & { token: string; bearerToken?: string },
): Promise<{ status: number; ok: boolean; data: T | null; text: string }> {
  assert(config.supabaseUrl, "SUPABASE_URL is required");
  const headers = new Headers(init.headers);
  headers.set("apikey", init.token);
  headers.set("Authorization", `Bearer ${init.bearerToken ?? init.token}`);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${config.supabaseUrl}${pathAndQuery}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    data = JSON.parse(text) as T;
  }
  return { status: res.status, ok: res.ok, data, text };
}
