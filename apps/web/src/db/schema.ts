import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { LearningTreeResponse, NodeDetailResponse } from "@/types/learning";

export const learningTrees = sqliteTable("learning_trees", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  summary: text("summary"),
  treeJson: text("tree_json", { mode: "json" })
    .notNull()
    .$type<LearningTreeResponse>(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/** Phase 3 LLM provider 설정: API key 원문은 저장하지 않고 AES-GCM 결과만 보관한다. */
export const llmProviderSettings = sqliteTable(
  "llm_provider_settings",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    providerType: text("provider_type").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model"),
    jsonMode: text("json_mode").notNull().default("auto"),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    apiKeyIv: text("api_key_iv").notNull(),
    apiKeyTag: text("api_key_tag").notNull(),
    apiKeyHint: text("api_key_hint").notNull(),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("llm_provider_settings_active_idx").on(t.isActive),
    index("llm_provider_settings_provider_type_idx").on(t.providerType),
  ],
);

/** Phase 2 Concept Node Store */
export const concepts = sqliteTable(
  "concepts",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    aliases: text("aliases", { mode: "json" })
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    domain: text("domain"),
    shortDescription: text("short_description"),
    explanation: text("explanation"),
    difficulty: integer("difficulty"),
    examples: text("examples", { mode: "json" })
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    commonMisconceptions: text("common_misconceptions", { mode: "json" })
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    metadata: text("metadata", { mode: "json" })
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("concepts_normalized_title_idx").on(t.normalizedTitle)],
);

export const learningNodes = sqliteTable(
  "learning_nodes",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    difficulty: integer("difficulty"),
    prerequisites: text("prerequisites", { mode: "json" })
      .notNull()
      .$type<string[]>(),
    children: text("children", { mode: "json" }).notNull().$type<string[]>(),
    detailJson: text("detail_json", { mode: "json" }).$type<NodeDetailResponse>(),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    /** 생성 시 기존 Concept 재사용 여부(null = Phase 1 행) */
    isReusedConcept: integer("is_reused_concept", { mode: "boolean" }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("learning_nodes_tree_id_node_key_uidx").on(t.treeId, t.nodeKey),
  ],
);

export const userNodeProgress = sqliteTable(
  "user_node_progress",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => learningNodes.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("unknown"),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("user_node_progress_user_id_node_id_uidx").on(
      t.userId,
      t.nodeId,
    ),
  ],
);

export const conceptEdges = sqliteTable(
  "concept_edges",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    fromConceptId: text("from_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    toConceptId: text("to_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    strength: real("strength").notNull().default(1),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("concept_edges_from_to_type_uidx").on(
      t.fromConceptId,
      t.toConceptId,
      t.relationType,
    ),
  ],
);

export const learningTreeConcepts = sqliteTable(
  "learning_tree_concepts",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    learningNodeId: text("learning_node_id")
      .notNull()
      .references(() => learningNodes.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    roleInTree: text("role_in_tree").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("learning_tree_concepts_tree_node_concept_uidx").on(
      t.treeId,
      t.learningNodeId,
      t.conceptId,
    ),
  ],
);

export const conceptMergeCandidates = sqliteTable(
  "concept_merge_candidates",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    sourceConceptId: text("source_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    targetConceptId: text("target_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    similarityScore: real("similarity_score").notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("concept_merge_candidates_source_target_uidx").on(
      t.sourceConceptId,
      t.targetConceptId,
    ),
  ],
);

/** Phase 3 Document Store */
export const documents = sqliteTable("documents", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  title: text("title"),
  originalFilename: text("original_filename").notNull(),
  fileType: text("file_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  pageCount: integer("page_count"),
  extractedTextLength: integer("extracted_text_length"),
  processingStatus: text("processing_status").notNull().default("uploaded"),
  processingError: text("processing_error"),
  metadata: text("metadata", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>()
    .$defaultFn(() => ({})),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const documentPages = sqliteTable(
  "document_pages",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    text: text("text"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("document_pages_document_page_uidx").on(
      t.documentId,
      t.pageNumber,
    ),
  ],
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    sectionTitle: text("section_title"),
    text: text("text").notNull(),
    tokenCount: integer("token_count"),
    metadata: text("metadata", { mode: "json" })
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("document_chunks_document_index_uidx").on(
      t.documentId,
      t.chunkIndex,
    ),
  ],
);

export const documentConcepts = sqliteTable(
  "document_concepts",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    conceptTitle: text("concept_title").notNull(),
    conceptType: text("concept_type").notNull(),
    importance: integer("importance"),
    difficulty: integer("difficulty"),
    sourceType: text("source_type").notNull(),
    evidence: text("evidence", { mode: "json" })
      .notNull()
      .$type<
        Array<{
          documentId: string;
          chunkId: string | null;
          pageStart: number | null;
          pageEnd: number | null;
          sectionTitle: string | null;
          snippet: string;
        }>
      >()
      .$defaultFn(() => []),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("document_concepts_document_concept_type_uidx").on(
      t.documentId,
      t.conceptId,
      t.conceptType,
    ),
  ],
);

export const documentLearningTrees = sqliteTable(
  "document_learning_trees",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("document_learning_trees_document_tree_uidx").on(
      t.documentId,
      t.treeId,
    ),
  ],
);

export const userConceptProgress = sqliteTable(
  "user_concept_progress",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("unknown"),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("user_concept_progress_user_concept_uidx").on(
      t.userId,
      t.conceptId,
    ),
  ],
);
