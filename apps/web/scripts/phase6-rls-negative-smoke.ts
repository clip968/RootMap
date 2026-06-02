import {
  assert,
  auditPostgresRole,
  getSecurityConfig,
  hasLiveSupabaseAuthConfig,
  supabaseFetchJson,
  type Phase11LegacyOwnerTable,
  type Phase4OwnerTable,
  type SecurityConfig,
} from "./phase6-security-utils";

/** Tables seeded only to satisfy foreign keys; never part of owner A/B checks. */
type SupportTable = "concepts" | "learning_nodes";
/** Every table this smoke can insert into. */
type SeedTable = Phase4OwnerTable | Phase11LegacyOwnerTable | SupportTable;
/** Tables whose rows we run cross-user read/update checks against. */
type OwnerCheckTable = Phase4OwnerTable | Phase11LegacyOwnerTable;

interface CreatedUser {
  id: string;
  email: string;
  password: string;
}

interface InsertedRow {
  table: SeedTable;
  id: string;
  /** True for user-owned rows that must block cross-user access. */
  ownerCheck: boolean;
  patch: Record<string, unknown>;
}

const PATCH_BY_TABLE: Record<OwnerCheckTable, Record<string, unknown>> = {
  learning_sessions: { summary: { phase6_mutation_attempt: true } },
  learning_events: { event_payload: { phase6_mutation_attempt: true } },
  user_concept_mastery: { confidence_score: 0.99 },
  quiz_attempts: { feedback: "phase6 forbidden update attempt" },
  recommendation_logs: { clicked: true },
  learning_reports: { title: "phase6 forbidden update attempt" },
  // Phase 11 legacy text user_id tables.
  learning_trees: { summary: "phase11 forbidden update attempt" },
  documents: { title: "phase11 forbidden update attempt" },
  user_node_progress: { status: "mastered" },
  user_concept_progress: { status: "mastered" },
  llm_provider_settings: { name: "phase11 forbidden update attempt" },
};

function requireLiveConfig(config: SecurityConfig): void {
  assert(
    hasLiveSupabaseAuthConfig(config),
    "SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required for the live RLS negative smoke.",
  );
}

async function createTestUser(config: SecurityConfig, runId: string, label: "a" | "b"): Promise<CreatedUser> {
  assert(config.serviceRoleKey, "service role key missing");
  const password = `Phase6-${runId}-${label}!`;
  const email = `phase6-${runId}-${label}@example.invalid`;
  const res = await supabaseFetchJson<{ id?: string }>(config, "/auth/v1/admin/users", {
    method: "POST",
    token: config.serviceRoleKey,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { phase6_run_id: runId },
    }),
  });
  assert(res.ok && res.data?.id, `failed to create test user ${label}: ${res.status} ${res.text}`);
  return { id: res.data.id, email, password };
}

async function signIn(config: SecurityConfig, user: CreatedUser): Promise<string> {
  assert(config.anonKey, "anon key missing");
  const res = await supabaseFetchJson<{ access_token?: string }>(config, "/auth/v1/token?grant_type=password", {
    method: "POST",
    token: config.anonKey,
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  assert(res.ok && res.data?.access_token, `failed to sign in ${user.email}: ${res.status} ${res.text}`);
  return res.data.access_token;
}

function isOwnerCheckTable(table: SeedTable): table is OwnerCheckTable {
  return table !== "concepts" && table !== "learning_nodes";
}

async function insertRow(
  config: SecurityConfig,
  table: SeedTable,
  body: Record<string, unknown>,
): Promise<InsertedRow> {
  assert(config.serviceRoleKey, "service role key missing");
  const res = await supabaseFetchJson<Array<{ id: string }>>(config, `/rest/v1/${table}`, {
    method: "POST",
    token: config.serviceRoleKey,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  assert(res.ok && Array.isArray(res.data) && res.data[0]?.id, `failed to seed ${table}: ${res.status} ${res.text}`);
  const ownerCheck = isOwnerCheckTable(table);
  return { table, id: res.data[0].id, ownerCheck, patch: ownerCheck ? PATCH_BY_TABLE[table] : {} };
}

async function seedRowsForUserB(
  config: SecurityConfig,
  userB: CreatedUser,
  runId: string,
  rows: InsertedRow[],
): Promise<void> {
  const now = new Date().toISOString();
  const concept = await insertRow(config, "concepts", {
    id: `phase6-${runId}-concept`,
    slug: `phase6-${runId}-concept`,
    title: `Phase6 ${runId} Concept`,
    normalized_title: `phase6 ${runId} concept`,
    aliases: [],
    examples: [],
    common_misconceptions: [],
    metadata: { phase6_run_id: runId },
    created_at: now,
    updated_at: now,
  });
  rows.push(concept);
  rows.push(await insertRow(config, "learning_sessions", { user_id: userB.id, summary: { phase6_run_id: runId } }));
  rows.push(await insertRow(config, "learning_events", { user_id: userB.id, event_type: "phase6_rls_seed", event_payload: { phase6_run_id: runId } }));
  rows.push(await insertRow(config, "user_concept_mastery", { user_id: userB.id, concept_id: concept.id, status: "unknown", confidence_score: 0.1, mastery_metadata: { phase6_run_id: runId } }));
  rows.push(await insertRow(config, "quiz_attempts", { user_id: userB.id, quiz_type: "phase6", question: "RLS seed?", user_answer: "yes" }));
  rows.push(await insertRow(config, "recommendation_logs", { user_id: userB.id, score: 1, reasons: [{ phase6_run_id: runId }] }));
  rows.push(await insertRow(config, "learning_reports", { user_id: userB.id, report_type: "session", title: `phase6 ${runId}`, report_json: { phase6_run_id: runId } }));

  // Phase 11 task 07: legacy text user_id owner tables.
  // learning_trees is both an owner-checked row and the FK parent for the
  // learning_node / user_node_progress rows seeded below.
  const tree = await insertRow(config, "learning_trees", {
    user_id: userB.id,
    topic: `phase11 ${runId}`,
    tree_json: { phase11_run_id: runId, nodes: [] },
    created_at: now,
    updated_at: now,
  });
  rows.push(tree);
  // Support row (no user_id, not owner-checked); satisfies user_node_progress.node_id.
  const node = await insertRow(config, "learning_nodes", {
    tree_id: tree.id,
    node_key: `phase11-${runId}-root`,
    title: `Phase11 ${runId} node`,
    type: "concept",
    prerequisites: [],
    children: [],
    created_at: now,
    updated_at: now,
  });
  rows.push(node);
  rows.push(await insertRow(config, "documents", {
    user_id: userB.id,
    original_filename: `phase11-${runId}.pdf`,
    file_type: "pdf",
    file_size_bytes: 1,
    processing_status: "uploaded",
    metadata: { phase11_run_id: runId },
    created_at: now,
    updated_at: now,
  }));
  rows.push(await insertRow(config, "user_node_progress", {
    user_id: userB.id,
    tree_id: tree.id,
    node_id: node.id,
    status: "unknown",
    updated_at: now,
  }));
  rows.push(await insertRow(config, "user_concept_progress", {
    user_id: userB.id,
    concept_id: concept.id,
    status: "unknown",
    updated_at: now,
  }));
  rows.push(await insertRow(config, "llm_provider_settings", {
    user_id: userB.id,
    provider_type: "openai",
    name: `phase11 ${runId}`,
    base_url: "https://example.invalid",
    json_mode: "auto",
    api_key_encrypted: "phase11-seed",
    api_key_iv: "phase11-seed",
    api_key_tag: "phase11-seed",
    api_key_hint: "se...ed",
    is_active: false,
    created_at: now,
    updated_at: now,
  }));
}

async function selectWithUserToken(config: SecurityConfig, table: SeedTable, id: string, token: string): Promise<unknown[]> {
  assert(config.anonKey, "anon key missing");
  const res = await supabaseFetchJson<unknown[]>(config, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "GET",
    token: config.anonKey,
    bearerToken: token,
  });
  assert(res.ok, `select ${table} failed with authenticated token: ${res.status} ${res.text}`);
  assert(Array.isArray(res.data), `select ${table} did not return an array`);
  return res.data;
}

async function updateWithUserToken(config: SecurityConfig, row: InsertedRow, token: string): Promise<unknown[]> {
  assert(row.ownerCheck, "support rows are not part of owner RLS negative checks");
  assert(config.anonKey, "anon key missing");
  const res = await supabaseFetchJson<unknown[]>(config, `/rest/v1/${row.table}?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    token: config.anonKey,
    bearerToken: token,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row.patch),
  });
  if (res.status === 401 || res.status === 403) return [];
  assert(res.ok, `update ${row.table} failed unexpectedly: ${res.status} ${res.text}`);
  assert(Array.isArray(res.data), `update ${row.table} did not return an array`);
  return res.data;
}

async function deleteWithUserToken(config: SecurityConfig, row: InsertedRow, token: string): Promise<unknown[]> {
  assert(row.ownerCheck, "support rows are not part of owner RLS negative checks");
  assert(config.anonKey, "anon key missing");
  const res = await supabaseFetchJson<unknown[]>(config, `/rest/v1/${row.table}?id=eq.${encodeURIComponent(row.id)}`, {
    method: "DELETE",
    token: config.anonKey,
    bearerToken: token,
    headers: { Prefer: "return=representation" },
  });
  if (res.status === 401 || res.status === 403) return [];
  assert(res.ok, `delete ${row.table} failed unexpectedly: ${res.status} ${res.text}`);
  assert(Array.isArray(res.data), `delete ${row.table} did not return an array`);
  return res.data;
}

async function cleanup(config: SecurityConfig, rows: InsertedRow[], users: CreatedUser[]): Promise<void> {
  if (!config.serviceRoleKey) return;
  for (const row of [...rows].reverse()) {
    await supabaseFetchJson(config, `/rest/v1/${row.table}?id=eq.${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      token: config.serviceRoleKey,
    }).catch(() => null);
  }
  for (const user of users) {
    await supabaseFetchJson(config, `/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      token: config.serviceRoleKey,
    }).catch(() => null);
  }
}

async function main(): Promise<void> {
  const config = getSecurityConfig();
  requireLiveConfig(config);

  if (config.databaseUrl) {
    const role = await auditPostgresRole(config.databaseUrl);
    console.info(
      `[phase6:rls-negative-smoke] database role=${role.currentUser} superuser=${role.rolSuper} bypassrls=${role.rolBypassRls}`,
    );
  }

  const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const users: CreatedUser[] = [];
  const rows: InsertedRow[] = [];
  try {
    const userA = await createTestUser(config, runId, "a");
    const userB = await createTestUser(config, runId, "b");
    users.push(userA, userB);

    const userAToken = await signIn(config, userA);
    const userBToken = await signIn(config, userB);
    await seedRowsForUserB(config, userB, runId, rows);

    for (const row of rows) {
      if (!row.ownerCheck) continue;
      const positiveRows = await selectWithUserToken(config, row.table, row.id, userBToken);
      assert(positiveRows.length === 1, `${row.table} positive owner select should return exactly one row`);

      const crossReadRows = await selectWithUserToken(config, row.table, row.id, userAToken);
      assert(crossReadRows.length === 0, `${row.table} cross-user select must return zero rows`);

      const crossUpdateRows = await updateWithUserToken(config, row, userAToken);
      assert(crossUpdateRows.length === 0, `${row.table} cross-user update must return zero rows`);

      const crossDeleteRows = await deleteWithUserToken(config, row, userAToken);
      assert(crossDeleteRows.length === 0, `${row.table} cross-user delete must return zero rows`);

      // The owner's row must survive the blocked cross-user delete.
      const survivingRows = await selectWithUserToken(config, row.table, row.id, userBToken);
      assert(survivingRows.length === 1, `${row.table} owner row must survive a blocked cross-user delete`);
      console.info(`[OK] ${row.table} blocks cross-user read/update/delete`);
    }

    console.info("Phase 6 task 01 + Phase 11 task 07 Supabase Auth/RLS negative smoke passed.");
  } finally {
    await cleanup(config, rows, users);
  }
}

void main().catch((error) => {
  console.error("[phase6:rls-negative-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
