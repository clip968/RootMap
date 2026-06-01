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
assert(repositorySource.includes("transaction(async"), "ready path must use a transaction");
assert(repositorySource.includes("detailJson"), "ready transaction must save learning_nodes.detailJson");

console.log("Phase 10 async node detail smoke passed.");
