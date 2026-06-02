import {
  assert,
  auditPostgresRole,
  getSecurityConfig,
  hasLiveSupabaseAuthConfig,
  type Phase11TextOwnerTable,
  supabaseFetchJson,
  type Phase4OwnerTable,
  type SecurityConfig,
} from "./phase6-security-utils";

interface CreatedUser {
  id: string;
  email: string;
  password: string;
}

type OwnerTable = Phase4OwnerTable | Phase11TextOwnerTable;
type SeedTable = OwnerTable | "concepts" | "learning_nodes";

interface InsertedRow {
  table: SeedTable;
  id: string;
  patch: Record<string, unknown>;
  checkOwner: boolean;
}

const PATCH_BY_TABLE: Record<OwnerTable, Record<string, unknown>> = {
  learning_sessions: { summary: { phase6_mutation_attempt: true } },
  learning_events: { event_payload: { phase6_mutation_attempt: true } },
  user_concept_mastery: { confidence_score: 0.99 },
  quiz_attempts: { feedback: "phase6 forbidden update attempt" },
  recommendation_logs: { clicked: true },
  learning_reports: { title: "phase6 forbidden update attempt" },
  learning_trees: { summary: "phase6 forbidden update attempt" },
  documents: { processing_status: "phase6_forbidden_update_attempt" },
  user_node_progress: { status: "completed" },
  user_concept_progress: { status: "learning" },
  llm_provider_settings: { name: "phase6 forbidden update attempt" },
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

async function insertRow(
  config: SecurityConfig,
  table: SeedTable,
  body: Record<string, unknown>,
  checkOwner = true,
): Promise<InsertedRow> {
  assert(config.serviceRoleKey, "service role key missing");
  const res = await supabaseFetchJson<Array<{ id: string }>>(config, `/rest/v1/${table}`, {
    method: "POST",
    token: config.serviceRoleKey,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  assert(res.ok && Array.isArray(res.data) && res.data[0]?.id, `failed to seed ${table}: ${res.status} ${res.text}`);
  return {
    table,
    id: res.data[0].id,
    patch: checkOwner ? PATCH_BY_TABLE[table as OwnerTable] : {},
    checkOwner,
  };
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
  }, false);
  rows.push(concept);
  rows.push(await insertRow(config, "learning_sessions", { user_id: userB.id, summary: { phase6_run_id: runId } }));
  rows.push(await insertRow(config, "learning_events", { user_id: userB.id, event_type: "phase6_rls_seed", event_payload: { phase6_run_id: runId } }));
  rows.push(await insertRow(config, "user_concept_mastery", { user_id: userB.id, concept_id: concept.id, status: "unknown", confidence_score: 0.1, mastery_metadata: { phase6_run_id: runId } }));
  rows.push(await insertRow(config, "quiz_attempts", { user_id: userB.id, quiz_type: "phase6", question: "RLS seed?", user_answer: "yes" }));
  rows.push(await insertRow(config, "recommendation_logs", { user_id: userB.id, score: 1, reasons: [{ phase6_run_id: runId }] }));
  rows.push(await insertRow(config, "learning_reports", { user_id: userB.id, report_type: "session", title: `phase6 ${runId}`, report_json: { phase6_run_id: runId } }));

  // Legacy tables use text user_id values, so the seed mirrors the production
  // Phase 11 contract by storing the Supabase Auth UUID string directly.
  const tree = await insertRow(config, "learning_trees", {
    user_id: userB.id,
    topic: `phase6 ${runId}`,
    summary: `phase6 ${runId}`,
    tree_json: { topic: `phase6 ${runId}`, nodes: [] },
    created_at: now,
    updated_at: now,
  });
  rows.push(tree);
  const node = await insertRow(config, "learning_nodes", {
    tree_id: tree.id,
    node_key: `phase6-${runId}-node`,
    title: `Phase6 ${runId} Node`,
    type: "concept",
    prerequisites: [],
    children: [],
    created_at: now,
    updated_at: now,
  }, false);
  rows.push(node);
  rows.push(await insertRow(config, "documents", {
    user_id: userB.id,
    title: `phase6 ${runId}`,
    original_filename: `phase6-${runId}.pdf`,
    file_type: "application/pdf",
    file_size_bytes: 1,
    metadata: { phase6_run_id: runId },
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
    provider_type: "openai_compatible",
    name: `phase6 ${runId}`,
    base_url: "https://example.invalid/v1",
    model: "phase6-smoke",
    json_mode: "auto",
    api_key_encrypted: "phase6-encrypted",
    api_key_iv: "phase6-iv",
    api_key_tag: "phase6-tag",
    api_key_hint: "phase6",
    is_active: true,
    created_at: now,
    updated_at: now,
  }));
}

async function selectWithUserToken(config: SecurityConfig, table: OwnerTable, id: string, token: string): Promise<unknown[]> {
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
  assert(row.checkOwner, `${row.table} rows are not part of owner RLS negative checks`);
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
  assert(row.checkOwner, `${row.table} rows are not part of owner RLS negative checks`);
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
      if (!row.checkOwner) continue;
      const ownerTable = row.table as OwnerTable;
      const positiveRows = await selectWithUserToken(config, ownerTable, row.id, userBToken);
      assert(positiveRows.length === 1, `${row.table} positive owner select should return exactly one row`);

      const crossReadRows = await selectWithUserToken(config, ownerTable, row.id, userAToken);
      assert(crossReadRows.length === 0, `${row.table} cross-user select must return zero rows`);

      const crossUpdateRows = await updateWithUserToken(config, row, userAToken);
      assert(crossUpdateRows.length === 0, `${row.table} cross-user update must return zero rows`);

      const crossDeleteRows = await deleteWithUserToken(config, row, userAToken);
      assert(crossDeleteRows.length === 0, `${row.table} cross-user delete must return zero rows`);

      const ownerRowsAfterDelete = await selectWithUserToken(config, ownerTable, row.id, userBToken);
      assert(ownerRowsAfterDelete.length === 1, `${row.table} owner row must survive cross-user delete attempt`);
      console.info(`[OK] ${row.table} blocks cross-user read/update/delete and owner row survives`);
    }

    console.info("Phase 6 task 01 Supabase Auth/RLS negative smoke passed.");
  } finally {
    await cleanup(config, rows, users);
  }
}

void main().catch((error) => {
  console.error("[phase6:rls-negative-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
