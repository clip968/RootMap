-- Phase 6 task 07: FSRS-lite rule_v1 memory state for review scheduling.

alter table "user_concept_mastery"
  add column if not exists "review_due_at" timestamp with time zone,
  add column if not exists "memory_stability" real,
  add column if not exists "memory_difficulty" real,
  add column if not exists "retrievability" real,
  add column if not exists "last_review_grade" text,
  add column if not exists "review_interval_days" integer,
  add column if not exists "scheduler_version" text default 'rule_v1';

create index if not exists "user_concept_mastery_review_due_idx"
  on "user_concept_mastery" ("user_id", "review_due_at");
