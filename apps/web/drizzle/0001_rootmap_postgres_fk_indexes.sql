-- Supabase advisor가 지적한 외래키 컬럼 보조 인덱스.
-- 부모 행 삭제/갱신과 조인 조회가 커져도 불필요한 순차 스캔을 피하게 한다.

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
