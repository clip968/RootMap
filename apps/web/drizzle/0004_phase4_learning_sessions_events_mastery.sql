-- Phase 4 task 01: user-specific learning sessions, events, and concept mastery.
-- New Phase 4 data uses Supabase Auth UUID users from the start.

create table if not exists "learning_sessions" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "tree_id" text references "learning_trees"("id") on delete set null,
  "document_id" text references "documents"("id") on delete set null,
  "started_at" timestamp with time zone default now() not null,
  "ended_at" timestamp with time zone,
  "duration_seconds" integer,
  "summary" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "learning_events" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "session_id" uuid references "learning_sessions"("id") on delete cascade,
  "tree_id" text references "learning_trees"("id") on delete set null,
  "node_id" text references "learning_nodes"("id") on delete set null,
  "concept_id" text references "concepts"("id") on delete set null,
  "event_type" text not null,
  "event_payload" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "user_concept_mastery" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "concept_id" text not null references "concepts"("id") on delete cascade,
  "status" text default 'unknown' not null,
  "confidence_score" real default 0.1 not null,
  "last_studied_at" timestamp with time zone,
  "last_quiz_score" real,
  "review_count" integer default 0 not null,
  "wrong_count" integer default 0 not null,
  "correct_count" integer default 0 not null,
  "needs_review" boolean default true not null,
  "mastery_metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create index if not exists "learning_sessions_user_id_idx" on "learning_sessions" ("user_id");
create index if not exists "learning_sessions_tree_id_idx" on "learning_sessions" ("tree_id");
create index if not exists "learning_sessions_document_id_idx" on "learning_sessions" ("document_id");
create index if not exists "learning_events_user_session_created_idx" on "learning_events" ("user_id", "session_id", "created_at");
create index if not exists "learning_events_tree_id_idx" on "learning_events" ("tree_id");
create index if not exists "learning_events_node_id_idx" on "learning_events" ("node_id");
create index if not exists "learning_events_concept_id_idx" on "learning_events" ("concept_id");
create index if not exists "user_concept_mastery_concept_id_idx" on "user_concept_mastery" ("concept_id");
create index if not exists "user_concept_mastery_needs_review_idx" on "user_concept_mastery" ("user_id", "needs_review");
create unique index if not exists "user_concept_mastery_user_concept_uidx" on "user_concept_mastery" ("user_id", "concept_id");

alter table "learning_sessions" enable row level security;
alter table "learning_events" enable row level security;
alter table "user_concept_mastery" enable row level security;

create policy "learning_sessions_owner_all" on "learning_sessions"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "learning_events_owner_all" on "learning_events"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_concept_mastery_owner_all" on "user_concept_mastery"
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
