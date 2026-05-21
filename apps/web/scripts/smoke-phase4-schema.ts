/**
 * Phase 4 task 01 schema/repository contract smoke.
 *
 * This test does not connect to Supabase. It checks the local Drizzle schema,
 * migration SQL, and repository exports that later API tasks will depend on.
 */
import fs from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  learningEvents,
  learningSessions,
  userConceptMastery,
} from "../src/db/schema";
import {
  appendLearningEvent,
  endLearningSession,
  getUserConceptMastery,
  startLearningSession,
  upsertUserConceptMastery,
} from "../src/lib/repository/learning-session-repository";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertColumns(
  table: unknown,
  expectedTableName: string,
  expectedColumns: string[],
): void {
  assert(getTableName(table as never) === expectedTableName, `${expectedTableName} table name`);
  const columns = getTableColumns(table as never);
  for (const column of expectedColumns) {
    assert(column in columns, `${expectedTableName}.${column} column missing`);
  }
}

function assertMigrationContains(sql: string, pattern: RegExp, message: string): void {
  assert(pattern.test(sql), message);
}

const migrationPath = path.join(
  process.cwd(),
  "drizzle",
  "0004_phase4_learning_sessions_events_mastery.sql",
);

assertColumns(learningSessions, "learning_sessions", [
  "id",
  "userId",
  "treeId",
  "documentId",
  "startedAt",
  "endedAt",
  "durationSeconds",
  "summary",
  "createdAt",
]);
assertColumns(learningEvents, "learning_events", [
  "id",
  "userId",
  "sessionId",
  "treeId",
  "nodeId",
  "conceptId",
  "eventType",
  "eventPayload",
  "createdAt",
]);
assertColumns(userConceptMastery, "user_concept_mastery", [
  "id",
  "userId",
  "conceptId",
  "status",
  "confidenceScore",
  "lastStudiedAt",
  "lastQuizScore",
  "reviewCount",
  "wrongCount",
  "correctCount",
  "needsReview",
  "masteryMetadata",
  "createdAt",
  "updatedAt",
]);

assert(fs.existsSync(migrationPath), "Phase 4 task 01 migration missing");
const sql = fs.readFileSync(migrationPath, "utf8");
assertMigrationContains(sql, /create table if not exists "learning_sessions"/i, "learning_sessions DDL missing");
assertMigrationContains(sql, /"user_id" uuid not null references auth\.users\(id\)/i, "learning_sessions.user_id must target Supabase Auth UUID users");
assertMigrationContains(sql, /create table if not exists "learning_events"/i, "learning_events DDL missing");
assertMigrationContains(sql, /create table if not exists "user_concept_mastery"/i, "user_concept_mastery DDL missing");
assertMigrationContains(sql, /unique index if not exists "user_concept_mastery_user_concept_uidx"/i, "user_concept_mastery unique user/concept index missing");
assertMigrationContains(sql, /enable row level security/i, "Phase 4 tables must enable RLS");
assertMigrationContains(sql, /create policy/i, "Phase 4 Auth/RLS policy missing");

for (const fn of [
  startLearningSession,
  endLearningSession,
  appendLearningEvent,
  getUserConceptMastery,
  upsertUserConceptMastery,
]) {
  assert(typeof fn === "function", "learning session repository export missing");
}

console.log("Phase 4 task 01 schema/repository smoke passed.");
