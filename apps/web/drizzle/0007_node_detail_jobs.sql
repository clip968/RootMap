-- Phase 10 task 01: async node detail generation jobs.
-- 사용자 요청에서 LLM 생성을 분리하기 위한 durable job table이다.

create table if not exists "node_detail_jobs" (
  "id" text primary key default gen_random_uuid()::text not null,
  "tree_id" text not null references "learning_trees"("id") on delete cascade,
  "node_id" text not null references "learning_nodes"("id") on delete cascade,
  "detail_version" text not null,
  "status" text not null check ("status" in ('queued', 'running', 'ready', 'failed')),
  "attempt_count" integer default 0 not null,
  "max_attempts" integer default 3 not null,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create unique index if not exists "node_detail_jobs_tree_node_version_uidx"
  on "node_detail_jobs" ("tree_id", "node_id", "detail_version");

create index if not exists "node_detail_jobs_status_created_idx"
  on "node_detail_jobs" ("status", "created_at");

create index if not exists "node_detail_jobs_locked_at_idx"
  on "node_detail_jobs" ("locked_at");
