-- RootMap Supabase/Postgres initial schema.
-- 앱 서버가 Drizzle/Postgres 연결로 접근하며, Supabase Data API 직접 접근은 RLS로 막는다.

create table if not exists "learning_trees" (
  "id" text primary key default gen_random_uuid()::text not null,
  "user_id" text not null,
  "topic" text not null,
  "summary" text,
  "tree_json" jsonb not null,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "llm_provider_settings" (
  "id" text primary key default gen_random_uuid()::text not null,
  "provider_type" text not null,
  "name" text not null,
  "base_url" text not null,
  "model" text,
  "json_mode" text default 'auto' not null,
  "api_key_encrypted" text not null,
  "api_key_iv" text not null,
  "api_key_tag" text not null,
  "api_key_hint" text not null,
  "is_active" boolean default true not null,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "concepts" (
  "id" text primary key default gen_random_uuid()::text not null,
  "slug" text not null unique,
  "title" text not null,
  "normalized_title" text not null,
  "aliases" jsonb not null,
  "domain" text,
  "short_description" text,
  "explanation" text,
  "difficulty" integer,
  "examples" jsonb not null,
  "common_misconceptions" jsonb not null,
  "metadata" jsonb not null,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "learning_nodes" (
  "id" text primary key default gen_random_uuid()::text not null,
  "tree_id" text not null references "learning_trees"("id") on delete cascade,
  "node_key" text not null,
  "title" text not null,
  "type" text not null,
  "description" text,
  "difficulty" integer,
  "prerequisites" jsonb not null,
  "children" jsonb not null,
  "detail_json" jsonb,
  "concept_id" text references "concepts"("id") on delete set null,
  "is_reused_concept" boolean,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "user_node_progress" (
  "id" text primary key default gen_random_uuid()::text not null,
  "user_id" text not null,
  "tree_id" text not null references "learning_trees"("id") on delete cascade,
  "node_id" text not null references "learning_nodes"("id") on delete cascade,
  "status" text default 'unknown' not null,
  "updated_at" text not null
);

create table if not exists "concept_edges" (
  "id" text primary key default gen_random_uuid()::text not null,
  "from_concept_id" text not null references "concepts"("id") on delete cascade,
  "to_concept_id" text not null references "concepts"("id") on delete cascade,
  "relation_type" text not null,
  "strength" real default 1 not null,
  "reason" text,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "learning_tree_concepts" (
  "id" text primary key default gen_random_uuid()::text not null,
  "tree_id" text not null references "learning_trees"("id") on delete cascade,
  "learning_node_id" text not null references "learning_nodes"("id") on delete cascade,
  "concept_id" text not null references "concepts"("id") on delete cascade,
  "role_in_tree" text not null,
  "created_at" text not null
);

create table if not exists "concept_merge_candidates" (
  "id" text primary key default gen_random_uuid()::text not null,
  "source_concept_id" text not null references "concepts"("id") on delete cascade,
  "target_concept_id" text not null references "concepts"("id") on delete cascade,
  "similarity_score" real not null,
  "reason" text,
  "status" text default 'pending' not null,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "documents" (
  "id" text primary key default gen_random_uuid()::text not null,
  "user_id" text not null,
  "title" text,
  "original_filename" text not null,
  "file_type" text not null,
  "file_size_bytes" integer not null,
  "page_count" integer,
  "extracted_text_length" integer,
  "processing_status" text default 'uploaded' not null,
  "processing_error" text,
  "metadata" jsonb not null,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "document_pages" (
  "id" text primary key default gen_random_uuid()::text not null,
  "document_id" text not null references "documents"("id") on delete cascade,
  "page_number" integer not null,
  "text" text,
  "created_at" text not null
);

create table if not exists "document_chunks" (
  "id" text primary key default gen_random_uuid()::text not null,
  "document_id" text not null references "documents"("id") on delete cascade,
  "chunk_index" integer not null,
  "page_start" integer,
  "page_end" integer,
  "section_title" text,
  "text" text not null,
  "token_count" integer,
  "metadata" jsonb not null,
  "created_at" text not null
);

create table if not exists "document_concepts" (
  "id" text primary key default gen_random_uuid()::text not null,
  "document_id" text not null references "documents"("id") on delete cascade,
  "concept_id" text references "concepts"("id") on delete set null,
  "concept_title" text not null,
  "concept_type" text not null,
  "importance" integer,
  "difficulty" integer,
  "source_type" text not null,
  "evidence" jsonb not null,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "document_learning_trees" (
  "id" text primary key default gen_random_uuid()::text not null,
  "document_id" text not null references "documents"("id") on delete cascade,
  "tree_id" text not null references "learning_trees"("id") on delete cascade,
  "created_at" text not null
);

create table if not exists "user_concept_progress" (
  "id" text primary key default gen_random_uuid()::text not null,
  "user_id" text not null,
  "concept_id" text not null references "concepts"("id") on delete cascade,
  "status" text default 'unknown' not null,
  "updated_at" text not null
);

create index if not exists "llm_provider_settings_active_idx" on "llm_provider_settings" ("is_active");
create index if not exists "llm_provider_settings_provider_type_idx" on "llm_provider_settings" ("provider_type");
create index if not exists "concepts_normalized_title_idx" on "concepts" ("normalized_title");
create index if not exists "learning_nodes_concept_id_idx" on "learning_nodes" ("concept_id");
create index if not exists "user_node_progress_node_id_idx" on "user_node_progress" ("node_id");
create index if not exists "user_node_progress_tree_id_idx" on "user_node_progress" ("tree_id");
create index if not exists "concept_edges_to_concept_id_idx" on "concept_edges" ("to_concept_id");
create index if not exists "learning_tree_concepts_concept_id_idx" on "learning_tree_concepts" ("concept_id");
create index if not exists "learning_tree_concepts_learning_node_id_idx" on "learning_tree_concepts" ("learning_node_id");
create index if not exists "concept_merge_candidates_target_concept_id_idx" on "concept_merge_candidates" ("target_concept_id");
create index if not exists "document_concepts_concept_id_idx" on "document_concepts" ("concept_id");
create index if not exists "document_learning_trees_tree_id_idx" on "document_learning_trees" ("tree_id");
create index if not exists "user_concept_progress_concept_id_idx" on "user_concept_progress" ("concept_id");
create unique index if not exists "learning_nodes_tree_id_node_key_uidx" on "learning_nodes" ("tree_id", "node_key");
create unique index if not exists "user_node_progress_user_id_node_id_uidx" on "user_node_progress" ("user_id", "node_id");
create unique index if not exists "concept_edges_from_to_type_uidx" on "concept_edges" ("from_concept_id", "to_concept_id", "relation_type");
create unique index if not exists "learning_tree_concepts_tree_node_concept_uidx" on "learning_tree_concepts" ("tree_id", "learning_node_id", "concept_id");
create unique index if not exists "concept_merge_candidates_source_target_uidx" on "concept_merge_candidates" ("source_concept_id", "target_concept_id");
create unique index if not exists "document_pages_document_page_uidx" on "document_pages" ("document_id", "page_number");
create unique index if not exists "document_chunks_document_index_uidx" on "document_chunks" ("document_id", "chunk_index");
create unique index if not exists "document_concepts_document_concept_type_uidx" on "document_concepts" ("document_id", "concept_id", "concept_type");
create unique index if not exists "document_learning_trees_document_tree_uidx" on "document_learning_trees" ("document_id", "tree_id");
create unique index if not exists "user_concept_progress_user_concept_uidx" on "user_concept_progress" ("user_id", "concept_id");

alter table "learning_trees" enable row level security;
alter table "llm_provider_settings" enable row level security;
alter table "concepts" enable row level security;
alter table "learning_nodes" enable row level security;
alter table "user_node_progress" enable row level security;
alter table "concept_edges" enable row level security;
alter table "learning_tree_concepts" enable row level security;
alter table "concept_merge_candidates" enable row level security;
alter table "documents" enable row level security;
alter table "document_pages" enable row level security;
alter table "document_chunks" enable row level security;
alter table "document_concepts" enable row level security;
alter table "document_learning_trees" enable row level security;
alter table "user_concept_progress" enable row level security;
