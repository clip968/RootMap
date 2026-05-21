-- Phase 4 task 02: quiz attempts, misconceptions, recommendation logs, and learning reports.
-- These tables follow task 01 by storing Supabase Auth UUID users and enabling owner-only RLS.

create table if not exists "quiz_attempts" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "session_id" uuid references "learning_sessions"("id") on delete set null,
  "tree_id" text references "learning_trees"("id") on delete set null,
  "node_id" text references "learning_nodes"("id") on delete set null,
  "concept_id" text references "concepts"("id") on delete set null,
  "quiz_type" text not null,
  "question" text not null,
  "expected_answer" text,
  "user_answer" text,
  "is_correct" boolean,
  "score" real,
  "feedback" text,
  "detected_misconceptions" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "misconception_events" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "concept_id" text references "concepts"("id") on delete cascade,
  "quiz_attempt_id" uuid references "quiz_attempts"("id") on delete set null,
  "misconception_text" text not null,
  "evidence" text,
  "resolved" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);

create table if not exists "recommendation_logs" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "tree_id" text references "learning_trees"("id") on delete set null,
  "node_id" text references "learning_nodes"("id") on delete set null,
  "concept_id" text references "concepts"("id") on delete set null,
  "score" real not null,
  "reasons" jsonb default '[]'::jsonb not null,
  "clicked" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "learning_reports" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "report_type" text not null,
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "title" text,
  "summary" text,
  "strengths" jsonb default '[]'::jsonb not null,
  "weaknesses" jsonb default '[]'::jsonb not null,
  "recommendations" jsonb default '[]'::jsonb not null,
  "report_json" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create index if not exists "quiz_attempts_user_created_idx" on "quiz_attempts" ("user_id", "created_at");
create index if not exists "quiz_attempts_session_id_idx" on "quiz_attempts" ("session_id");
create index if not exists "quiz_attempts_tree_id_idx" on "quiz_attempts" ("tree_id");
create index if not exists "quiz_attempts_node_id_idx" on "quiz_attempts" ("node_id");
create index if not exists "quiz_attempts_concept_id_idx" on "quiz_attempts" ("concept_id");
create index if not exists "misconception_events_user_resolved_idx" on "misconception_events" ("user_id", "resolved");
create index if not exists "misconception_events_concept_id_idx" on "misconception_events" ("concept_id");
create index if not exists "misconception_events_quiz_attempt_id_idx" on "misconception_events" ("quiz_attempt_id");
create index if not exists "recommendation_logs_user_created_idx" on "recommendation_logs" ("user_id", "created_at");
create index if not exists "recommendation_logs_tree_id_idx" on "recommendation_logs" ("tree_id");
create index if not exists "recommendation_logs_node_id_idx" on "recommendation_logs" ("node_id");
create index if not exists "recommendation_logs_concept_id_idx" on "recommendation_logs" ("concept_id");
create index if not exists "learning_reports_user_type_created_idx" on "learning_reports" ("user_id", "report_type", "created_at");
create index if not exists "learning_reports_period_idx" on "learning_reports" ("period_start", "period_end");

alter table "quiz_attempts" enable row level security;
alter table "misconception_events" enable row level security;
alter table "recommendation_logs" enable row level security;
alter table "learning_reports" enable row level security;

create policy "quiz_attempts_owner_all" on "quiz_attempts"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "misconception_events_owner_all" on "misconception_events"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recommendation_logs_owner_all" on "recommendation_logs"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "learning_reports_owner_all" on "learning_reports"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
