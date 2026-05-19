create table if not exists "concept_communities" (
  "id" text primary key not null,
  "tree_id" text not null references "learning_trees"("id") on delete cascade,
  "name" text not null,
  "summary" text,
  "priority" integer not null default 0,
  "created_at" text not null,
  "updated_at" text not null
);

create table if not exists "community_members" (
  "id" text primary key not null,
  "community_id" text not null references "concept_communities"("id") on delete cascade,
  "concept_id" text not null references "concepts"("id") on delete cascade,
  "learning_node_id" text references "learning_nodes"("id") on delete cascade,
  "role" text not null,
  "priority" integer not null default 0,
  "created_at" text not null
);

create index if not exists "concept_communities_tree_id_idx" on "concept_communities" ("tree_id");
create unique index if not exists "concept_communities_tree_name_uidx" on "concept_communities" ("tree_id", "name");
create index if not exists "community_members_concept_id_idx" on "community_members" ("concept_id");
create index if not exists "community_members_learning_node_id_idx" on "community_members" ("learning_node_id");
create unique index if not exists "community_members_community_concept_uidx" on "community_members" ("community_id", "concept_id");
