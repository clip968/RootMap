/**
 * Phase 10 async node detail contract smoke.
 *
 * This smoke avoids external DB/LLM calls. It checks the migration, schema,
 * repository exports, and source-level guarantees that protect the async job
 * contract before route/client integration tests are added.
 */
import fs from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { nodeDetailJobs } from "../src/db/schema";
import {
  claimQueuedNodeDetailJob,
  enqueueNodeDetailJob,
  getNodeDetailJob,
  getNodeDetailJobByTarget,
  markNodeDetailJobFailed,
  markNodeDetailJobReady,
  recoverStaleRunningNodeDetailJobs,
} from "../src/lib/repository/node-detail-job-repository";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

function assertMigrationContains(sql: string, pattern: RegExp, message: string): void {
  assert(pattern.test(sql), message);
}

const migrationSql = readSource("drizzle/0007_node_detail_jobs.sql");

assert(getTableName(nodeDetailJobs) === "node_detail_jobs", "node_detail_jobs table name");
const columns = getTableColumns(nodeDetailJobs);
for (const column of [
  "id",
  "treeId",
  "nodeId",
  "detailVersion",
  "status",
  "attemptCount",
  "maxAttempts",
  "lockedAt",
  "lockedBy",
  "startedAt",
  "completedAt",
  "errorMessage",
  "createdAt",
  "updatedAt",
]) {
  assert(column in columns, `node_detail_jobs.${column} column missing`);
}

assertMigrationContains(migrationSql, /create table if not exists "node_detail_jobs"/i, "node_detail_jobs DDL missing");
assertMigrationContains(migrationSql, /"status" text not null check \("status" in \('queued', 'running', 'ready', 'failed'\)\)/i, "status check missing");
assertMigrationContains(migrationSql, /"attempt_count" integer default 0 not null/i, "attempt_count missing");
assertMigrationContains(migrationSql, /"max_attempts" integer default 3 not null/i, "max_attempts missing");
assertMigrationContains(migrationSql, /"locked_at" timestamp with time zone/i, "locked_at missing");
assertMigrationContains(migrationSql, /"locked_by" text/i, "locked_by missing");
assertMigrationContains(migrationSql, /unique index if not exists "node_detail_jobs_tree_node_version_uidx"/i, "unique target index missing");
assertMigrationContains(migrationSql, /create index if not exists "node_detail_jobs_status_created_idx"/i, "status index missing");
assertMigrationContains(migrationSql, /create index if not exists "node_detail_jobs_locked_at_idx"/i, "locked_at index missing");

for (const fn of [
  enqueueNodeDetailJob,
  getNodeDetailJob,
  getNodeDetailJobByTarget,
  claimQueuedNodeDetailJob,
  markNodeDetailJobReady,
  markNodeDetailJobFailed,
  recoverStaleRunningNodeDetailJobs,
]) {
  assert(typeof fn === "function", "node detail job repository export missing");
}

const repositorySource = readSource("src/lib/repository/node-detail-job-repository.ts");
assert(repositorySource.includes("for update skip locked"), "claim must use for update skip locked");
assert(repositorySource.includes("attempt_count = attempt_count + 1"), "claim must increment attempt_count atomically");
assert(repositorySource.includes("resetExhausted"), "enqueue should support resetting exhausted (failed) jobs so retries are not permanently stuck");
assert(repositorySource.includes("transaction(async"), "ready path must use a transaction");
assert(repositorySource.includes("detailJson"), "ready transaction must save learning_nodes.detailJson");

const packageJson = readSource("package.json");
assert(packageJson.includes('"node-detail:worker": "tsx scripts/run-node-detail-worker.ts"'), "node detail worker npm script missing");

const processorSource = readSource("src/lib/node-detail-jobs/processor.ts");
assert(processorSource.includes("processNodeDetailJob"), "worker core should export processNodeDetailJob");
assert(processorSource.includes("claimQueuedNodeDetailJob"), "worker core should claim queued jobs");
assert(processorSource.includes("markNodeDetailJobReady"), "worker core should mark ready transactionally");
assert(processorSource.includes("loadConcept: async () => null"), "worker generation should not use concept fallback as a quality shortcut");
assert(processorSource.includes("ensureRequiredNodeDetailVisual"), "worker should add required visual before marking ready");
assert(processorSource.includes("NODE_DETAIL_MISSING_REQUIRED_VISUAL"), "worker should reject details that still lack a required visual");
assert(processorSource.includes("hasWorkerReadyTextDetail"), "worker should validate cached text detail quality before visual repair");
assert(processorSource.includes("NODE_DETAIL_CACHED_TEXT_INCOMPLETE"), "worker should regenerate low-quality cached fallback details");

const serviceSource = readSource("src/lib/services/node-detail.ts");
assert(serviceSource.includes("hasRequiredNodeDetailVisual"), "ready lookup should enforce required visual blocks");
assert(serviceSource.includes("cache_missing_required_visual"), "visual-free cached detail should be treated as not ready");
assert(serviceSource.includes("concept_fast_path_missing_required_visual"), "concept fast path should not be ready in async visual-required mode");

const visualGeneratorSource = readSource("src/lib/llm/generate-node-detail-visual.ts");
assert(visualGeneratorSource.includes("generateNodeDetailVisual"), "visual-only generator should exist");
assert(visualGeneratorSource.includes("parseNodeDetailVisualResponse"), "visual-only generator should parse the required visual schema");
assert(visualGeneratorSource.includes("visual_blocks.length !== 1"), "visual-only generator should enforce exactly one visual block");
// 검증 실패 시 처음부터 다시 생성하지 않고, 직전 출력 + 실패 사유를 되먹이는 repair loop여야 한다.
assert(
  visualGeneratorSource.includes("Your previous JSON failed validation"),
  "visual generator should run a validation-issue repair loop instead of regenerating from scratch",
);
assert(
  visualGeneratorSource.includes('role: "assistant"'),
  "visual generator repair loop should feed the previous raw output back as an assistant message",
);
assert(
  visualGeneratorSource.includes("formatValidationIssues"),
  "visual generator should format LlmValidationError.issues into the repair message",
);

const jobRepositorySource = readSource("src/lib/repository/node-detail-job-repository.ts");
assert(jobRepositorySource.includes('CURRENT_NODE_DETAIL_VERSION = "v2"'), "required visual policy should bump detail version");

const runnerSource = readSource("scripts/run-node-detail-worker.ts");
assert(runnerSource.includes("--once"), "worker CLI should support --once");
assert(runnerSource.includes("--loop"), "worker CLI should support --loop");
assert(runnerSource.includes("--recover-stale"), "worker CLI should support stale recovery");

const detailRouteSource = readSource("src/app/api/nodes/[nodeId]/detail/route.ts");
assert(detailRouteSource.includes("requireSupabaseAuthUserId(req)"), "detail route should require Supabase Auth before enqueue");
assert(detailRouteSource.includes("getLearningTree(treeId, auth.userId)"), "detail route should verify tree ownership before enqueue");
assert(detailRouteSource.includes("auth.userId"), "detail route should pass authenticated user id into detail lookup");
assert(detailRouteSource.includes("NODE_DETAIL_ASYNC_ENABLED"), "detail route should gate async behavior behind NODE_DETAIL_ASYNC_ENABLED");
assert(detailRouteSource.includes('status: "ready"'), "detail route should return ready status in async mode");
assert(detailRouteSource.includes('status: "queued"'), "detail route should return queued status in async mode");
assert(detailRouteSource.includes("resetExhausted: true"), "detail route retry should reset failed jobs back to the queue");
assert(!detailRouteSource.includes("export async function GET"), "detail route must not create jobs from GET");

// 알려진 정책 경계: async click 분기는 getReadyNodeDetailForRequest로 ready 여부만 확인하고
// 아니면 job을 enqueue한 뒤 202 queued를 반환한다. 즉 이 분기에서는 동기 text-first 경로
// (getOrCreateNodeDetailForRequest)를 호출하지 않으므로, best-effort visual fallback은
// NODE_DETAIL_ASYNC_ENABLED=false일 때만 클릭 UX에 적용된다. async click을 text-first로
// 만들려면 worker/job status(text_ready 등)를 분리해야 한다(별도 작업).
const asyncBranchStart = detailRouteSource.indexOf("if (NODE_DETAIL_ASYNC_ENABLED())");
assert(asyncBranchStart !== -1, "detail route should gate the async branch on the flag");
const afterAsyncBranch = detailRouteSource.slice(asyncBranchStart);
const enqueueIndex = afterAsyncBranch.indexOf("enqueueNodeDetailJob");
assert(enqueueIndex !== -1, "async branch should enqueue a node detail job");
const asyncBranchBody = afterAsyncBranch.slice(0, enqueueIndex);
assert(
  asyncBranchBody.includes("getReadyNodeDetailForRequest"),
  "async click branch should gate on getReadyNodeDetailForRequest",
);
assert(
  !asyncBranchBody.includes("getOrCreateNodeDetailForRequest"),
  "async click branch must NOT call getOrCreateNodeDetailForRequest; text-first best-effort visual only applies when NODE_DETAIL_ASYNC_ENABLED=false",
);

const jobRouteSource = readSource("src/app/api/node-detail-jobs/[jobId]/route.ts");
assert(jobRouteSource.includes("export async function GET"), "job polling route should expose GET");
assert(jobRouteSource.includes("requireSupabaseAuthUserId(req)"), "job polling route should require Supabase Auth");
assert(jobRouteSource.includes("getLearningTree(job.treeId, auth.userId)"), "job polling route should verify job tree ownership");
assert(jobRouteSource.includes("auth.userId"), "job polling route should pass authenticated user id into ready lookup");
assert(jobRouteSource.includes('status: "ready"'), "job polling route should return ready status");
assert(jobRouteSource.includes("detail:"), "job polling ready response should include detail");

const treeClientSource = readSource("src/components/tree-page-client.tsx");
assert(treeClientSource.includes("/api/node-detail-jobs/"), "client should poll node detail jobs");
assert(treeClientSource.includes("detailJobTimedOut"), "client should expose node detail polling timeout state");
assert(treeClientSource.includes("clearDetailPolling"), "client should clean up detail polling on node switch/close/unmount");
assert(treeClientSource.includes("DETAIL_JOB_MAX_STATUS_FAILURES"), "client should tolerate transient job status polling failures");
assert(treeClientSource.includes("isPermanentDetailPollingError"), "client should only fail immediately for permanent job polling errors");
assert(!treeClientSource.includes("detail?.easy_explanation ||\n                          selectedNode.description"), "client should not render selectedNode.description as detail fallback");

const browserAuthSource = readSource("src/lib/auth/browser-auth.ts");
assert(browserAuthSource.includes("refreshSupabaseAccessToken"), "authenticatedFetch should refresh the session once on 401 token-expiry races");

const prewarmSource = readSource("src/lib/services/node-detail-prewarm.ts");
assert(prewarmSource.includes("NODE_DETAIL_PREWARM_LIMIT"), "prewarm should expose limit config");
assert(prewarmSource.includes("NODE_DETAIL_PREWARM_CONCURRENCY"), "prewarm should expose concurrency config");
assert(prewarmSource.includes("recommended_order"), "prewarm should use recommended_order");
assert(prewarmSource.includes("enqueueNodeDetailJob"), "prewarm should enqueue node detail jobs");

const treeGenerateSource = readSource("src/lib/services/learning-tree-generate.ts");
assert(treeGenerateSource.includes("prewarmNodeDetailJobsForTree"), "normal tree generation should prewarm node detail jobs");

const documentProcessorSource = readSource("src/lib/document/processor.ts");
assert(documentProcessorSource.includes("prewarmNodeDetailJobsForTree"), "document tree generation should prewarm node detail jobs");

console.log("Phase 10 async node detail smoke passed.");
