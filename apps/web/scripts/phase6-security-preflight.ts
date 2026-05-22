import {
  assertAllChecks,
  assertNoSqliteDatabaseUrl,
  assertPhase4MigrationSecurityShape,
  getCombinedPhase4MigrationSql,
  getSecurityConfig,
  hasLiveSupabaseAuthConfig,
  printChecks,
} from "./phase6-security-utils";

async function main(): Promise<void> {
  const config = getSecurityConfig();
  console.info(`[phase6:security-preflight] target=${config.target}`);

  const checks = [
    assertNoSqliteDatabaseUrl(config),
    ...assertPhase4MigrationSecurityShape(getCombinedPhase4MigrationSql()),
    {
      label: "supabase-auth-env",
      ok: hasLiveSupabaseAuthConfig(config),
      detail: hasLiveSupabaseAuthConfig(config)
        ? "SUPABASE_URL, anon key, and service role key are available for live Auth/RLS tests."
        : "Live Auth/RLS env is incomplete; 01 can run only after SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are provided.",
    },
  ];

  printChecks(checks);

  const requiredChecks = checks.filter((check) => check.label !== "supabase-auth-env");
  assertAllChecks(requiredChecks);

  if (!hasLiveSupabaseAuthConfig(config)) {
    console.info("[phase6:security-preflight] Live Supabase checks are not executed in this environment.");
  }

  console.info("Phase 6 task 00 local/staging security preflight passed.");
}

void main().catch((error) => {
  console.error("[phase6:security-preflight] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
