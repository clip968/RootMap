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
  learningReports,
  learningSessions,
  misconceptionEvents,
  quizAttempts,
  recommendationLogs,
  userConceptMastery,
} from "../src/db/schema";
import {
  appendLearningEvent,
  createLearningReport,
  createMisconceptionEvent,
  createQuizAttempt,
  createRecommendationLog,
  endLearningSession,
  getUserConceptMastery,
  markRecommendationLogClicked,
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
const task02MigrationPath = path.join(
  process.cwd(),
  "drizzle",
  "0005_phase4_quiz_misconception_recommendation_report.sql",
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
assertColumns(quizAttempts, "quiz_attempts", [
  "id",
  "userId",
  "sessionId",
  "treeId",
  "nodeId",
  "conceptId",
  "quizType",
  "question",
  "expectedAnswer",
  "userAnswer",
  "isCorrect",
  "score",
  "feedback",
  "detectedMisconceptions",
  "createdAt",
]);
assertColumns(misconceptionEvents, "misconception_events", [
  "id",
  "userId",
  "conceptId",
  "quizAttemptId",
  "misconceptionText",
  "evidence",
  "resolved",
  "createdAt",
  "resolvedAt",
]);
assertColumns(recommendationLogs, "recommendation_logs", [
  "id",
  "userId",
  "treeId",
  "nodeId",
  "conceptId",
  "score",
  "reasons",
  "clicked",
  "createdAt",
]);
assertColumns(learningReports, "learning_reports", [
  "id",
  "userId",
  "reportType",
  "periodStart",
  "periodEnd",
  "title",
  "summary",
  "strengths",
  "weaknesses",
  "recommendations",
  "reportJson",
  "createdAt",
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
  createQuizAttempt,
  createMisconceptionEvent,
  createRecommendationLog,
  markRecommendationLogClicked,
  createLearningReport,
]) {
  assert(typeof fn === "function", "Phase 4 repository export missing");
}

assert(fs.existsSync(task02MigrationPath), "Phase 4 task 02 migration missing");
const task02Sql = fs.readFileSync(task02MigrationPath, "utf8");
assertMigrationContains(task02Sql, /create table if not exists "quiz_attempts"/i, "quiz_attempts DDL missing");
assertMigrationContains(task02Sql, /"user_id" uuid not null references auth\.users\(id\)/i, "task 02 tables must target Supabase Auth UUID users");
assertMigrationContains(task02Sql, /create table if not exists "misconception_events"/i, "misconception_events DDL missing");
assertMigrationContains(task02Sql, /create table if not exists "recommendation_logs"/i, "recommendation_logs DDL missing");
assertMigrationContains(task02Sql, /create table if not exists "learning_reports"/i, "learning_reports DDL missing");
assertMigrationContains(task02Sql, /"report_type" text not null/i, "learning_reports.report_type missing");
assertMigrationContains(task02Sql, /enable row level security/i, "Phase 4 task 02 tables must enable RLS");
assertMigrationContains(task02Sql, /create policy/i, "Phase 4 task 02 Auth/RLS policy missing");

console.log("Phase 4 task 01-02 schema/repository smoke passed.");
