import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { LearningTreeResponse, NodeDetailResponse } from "@/types/learning";

export const learningTrees = pgTable("learning_trees", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  summary: text("summary"),
  treeJson: jsonb("tree_json")
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
export const llmProviderSettings = pgTable(
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
    isActive: boolean("is_active")
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
export const concepts = pgTable(
  "concepts",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    aliases: jsonb("aliases")
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    domain: text("domain"),
    shortDescription: text("short_description"),
    explanation: text("explanation"),
    difficulty: integer("difficulty"),
    examples: jsonb("examples")
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    commonMisconceptions: jsonb("common_misconceptions")
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    metadata: jsonb("metadata")
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

export const learningNodes = pgTable(
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
    prerequisites: jsonb("prerequisites")
      .notNull()
      .$type<string[]>(),
    children: jsonb("children").notNull().$type<string[]>(),
    detailJson: jsonb("detail_json").$type<NodeDetailResponse>(),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    /** 생성 시 기존 Concept 재사용 여부(null = Phase 1 행) */
    isReusedConcept: boolean("is_reused_concept"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("learning_nodes_concept_id_idx").on(t.conceptId),
    uniqueIndex("learning_nodes_tree_id_node_key_uidx").on(t.treeId, t.nodeKey),
  ],
);

export const userNodeProgress = pgTable(
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
    index("user_node_progress_node_id_idx").on(t.nodeId),
    index("user_node_progress_tree_id_idx").on(t.treeId),
    uniqueIndex("user_node_progress_user_id_node_id_uidx").on(
      t.userId,
      t.nodeId,
    ),
  ],
);

export const conceptEdges = pgTable(
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
    index("concept_edges_to_concept_id_idx").on(t.toConceptId),
    uniqueIndex("concept_edges_from_to_type_uidx").on(
      t.fromConceptId,
      t.toConceptId,
      t.relationType,
    ),
  ],
);

export const learningTreeConcepts = pgTable(
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
    index("learning_tree_concepts_concept_id_idx").on(t.conceptId),
    index("learning_tree_concepts_learning_node_id_idx").on(t.learningNodeId),
    uniqueIndex("learning_tree_concepts_tree_node_concept_uidx").on(
      t.treeId,
      t.learningNodeId,
      t.conceptId,
    ),
  ],
);

export const conceptCommunities = pgTable(
  "concept_communities",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    summary: text("summary"),
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("concept_communities_tree_id_idx").on(t.treeId),
    uniqueIndex("concept_communities_tree_name_uidx").on(t.treeId, t.name),
  ],
);

export const communityMembers = pgTable(
  "community_members",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: text("community_id")
      .notNull()
      .references(() => conceptCommunities.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    learningNodeId: text("learning_node_id").references(() => learningNodes.id, {
      onDelete: "cascade",
    }),
    role: text("role").notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("community_members_concept_id_idx").on(t.conceptId),
    index("community_members_learning_node_id_idx").on(t.learningNodeId),
    uniqueIndex("community_members_community_concept_uidx").on(
      t.communityId,
      t.conceptId,
    ),
  ],
);

export const conceptMergeCandidates = pgTable(
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
    index("concept_merge_candidates_target_concept_id_idx").on(t.targetConceptId),
    uniqueIndex("concept_merge_candidates_source_target_uidx").on(
      t.sourceConceptId,
      t.targetConceptId,
    ),
  ],
);

/** Phase 3 Document Store */
export const documents = pgTable("documents", {
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
  metadata: jsonb("metadata")
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

export const documentPages = pgTable(
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

export const documentChunks = pgTable(
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
    metadata: jsonb("metadata")
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

export const documentConcepts = pgTable(
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
    evidence: jsonb("evidence")
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
    index("document_concepts_concept_id_idx").on(t.conceptId),
    uniqueIndex("document_concepts_document_concept_type_uidx").on(
      t.documentId,
      t.conceptId,
      t.conceptType,
    ),
  ],
);

export const documentLearningTrees = pgTable(
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
    index("document_learning_trees_tree_id_idx").on(t.treeId),
    uniqueIndex("document_learning_trees_document_tree_uidx").on(
      t.documentId,
      t.treeId,
    ),
  ],
);

export const userConceptProgress = pgTable(
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
    index("user_concept_progress_concept_id_idx").on(t.conceptId),
    uniqueIndex("user_concept_progress_user_concept_uidx").on(
      t.userId,
      t.conceptId,
    ),
  ],
);

/** Phase 4 Learning Session Store */
export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Supabase Auth 사용자 ID. Phase 4 신규 데이터는 DEFAULT_USER_ID가 아니라 실제 사용자 UUID에 귀속한다. */
    userId: uuid("user_id").notNull(),
    treeId: text("tree_id").references(() => learningTrees.id, {
      onDelete: "set null",
    }),
    documentId: text("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    summary: jsonb("summary")
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("learning_sessions_user_id_idx").on(t.userId),
    index("learning_sessions_tree_id_idx").on(t.treeId),
    index("learning_sessions_document_id_idx").on(t.documentId),
  ],
);

export const learningEvents = pgTable(
  "learning_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 이벤트도 세션과 별도로 user_id를 들고 있어 API/RLS 양쪽에서 사용자 혼입을 막는다. */
    userId: uuid("user_id").notNull(),
    sessionId: uuid("session_id").references(() => learningSessions.id, {
      onDelete: "cascade",
    }),
    treeId: text("tree_id").references(() => learningTrees.id, {
      onDelete: "set null",
    }),
    nodeId: text("node_id").references(() => learningNodes.id, {
      onDelete: "set null",
    }),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    eventPayload: jsonb("event_payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("learning_events_user_session_created_idx").on(
      t.userId,
      t.sessionId,
      t.createdAt,
    ),
    index("learning_events_tree_id_idx").on(t.treeId),
    index("learning_events_node_id_idx").on(t.nodeId),
    index("learning_events_concept_id_idx").on(t.conceptId),
  ],
);

export const userConceptMastery = pgTable(
  "user_concept_mastery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Concept 숙련도는 Phase 4 개인화 추천의 단일 소스다. */
    userId: uuid("user_id").notNull(),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("unknown"),
    confidenceScore: real("confidence_score").notNull().default(0.1),
    lastStudiedAt: timestamp("last_studied_at", { withTimezone: true }),
    lastQuizScore: real("last_quiz_score"),
    reviewCount: integer("review_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    needsReview: boolean("needs_review").notNull().default(true),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    memoryStability: real("memory_stability"),
    memoryDifficulty: real("memory_difficulty"),
    retrievability: real("retrievability"),
    lastReviewGrade: text("last_review_grade"),
    reviewIntervalDays: integer("review_interval_days"),
    schedulerVersion: text("scheduler_version").default("rule_v1"),
    masteryMetadata: jsonb("mastery_metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_concept_mastery_concept_id_idx").on(t.conceptId),
    index("user_concept_mastery_needs_review_idx").on(t.userId, t.needsReview),
    index("user_concept_mastery_review_due_idx").on(t.userId, t.reviewDueAt),
    uniqueIndex("user_concept_mastery_user_concept_uidx").on(
      t.userId,
      t.conceptId,
    ),
  ],
);

/** Phase 4 Quiz/Recommendation/Report Store */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 퀴즈 결과는 사용자별 학습 상태에 직접 반영되므로 Supabase Auth UUID를 필수로 보관한다. */
    userId: uuid("user_id").notNull(),
    sessionId: uuid("session_id").references(() => learningSessions.id, {
      onDelete: "set null",
    }),
    treeId: text("tree_id").references(() => learningTrees.id, {
      onDelete: "set null",
    }),
    nodeId: text("node_id").references(() => learningNodes.id, {
      onDelete: "set null",
    }),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    quizType: text("quiz_type").notNull(),
    question: text("question").notNull(),
    expectedAnswer: text("expected_answer"),
    userAnswer: text("user_answer"),
    isCorrect: boolean("is_correct"),
    score: real("score"),
    feedback: text("feedback"),
    /** LLM이 감지한 오개념 원문은 배열로 제한해 후속 misconception_events 생성 입력으로 재사용한다. */
    detectedMisconceptions: jsonb("detected_misconceptions")
      .notNull()
      .$type<string[]>()
      .$defaultFn(() => []),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("quiz_attempts_user_created_idx").on(t.userId, t.createdAt),
    index("quiz_attempts_session_id_idx").on(t.sessionId),
    index("quiz_attempts_tree_id_idx").on(t.treeId),
    index("quiz_attempts_node_id_idx").on(t.nodeId),
    index("quiz_attempts_concept_id_idx").on(t.conceptId),
  ],
);

export const misconceptionEvents = pgTable(
  "misconception_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 오개념 기록도 사용자 소유 데이터라 RLS 정책에서 직접 비교할 user_id를 둔다. */
    userId: uuid("user_id").notNull(),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "cascade",
    }),
    quizAttemptId: uuid("quiz_attempt_id").references(() => quizAttempts.id, {
      onDelete: "set null",
    }),
    misconceptionText: text("misconception_text").notNull(),
    evidence: text("evidence"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("misconception_events_user_resolved_idx").on(t.userId, t.resolved),
    index("misconception_events_concept_id_idx").on(t.conceptId),
    index("misconception_events_quiz_attempt_id_idx").on(t.quizAttemptId),
  ],
);

export const recommendationLogs = pgTable(
  "recommendation_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 추천 노출과 클릭은 개인화 품질 평가용 사용자 데이터라 사용자 UUID에 귀속한다. */
    userId: uuid("user_id").notNull(),
    treeId: text("tree_id").references(() => learningTrees.id, {
      onDelete: "set null",
    }),
    nodeId: text("node_id").references(() => learningNodes.id, {
      onDelete: "set null",
    }),
    conceptId: text("concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    score: real("score").notNull(),
    reasons: jsonb("reasons")
      .notNull()
      .$type<Array<Record<string, unknown>>>()
      .$defaultFn(() => []),
    clicked: boolean("clicked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("recommendation_logs_user_created_idx").on(t.userId, t.createdAt),
    index("recommendation_logs_tree_id_idx").on(t.treeId),
    index("recommendation_logs_node_id_idx").on(t.nodeId),
    index("recommendation_logs_concept_id_idx").on(t.conceptId),
  ],
);

export const learningReports = pgTable(
  "learning_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 리포트는 세션·기간 단위로 다시 조회되므로 사용자 UUID와 report_type을 함께 인덱싱한다. */
    userId: uuid("user_id").notNull(),
    reportType: text("report_type").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    title: text("title"),
    summary: text("summary"),
    strengths: jsonb("strengths")
      .notNull()
      .$type<Array<Record<string, unknown>>>()
      .$defaultFn(() => []),
    weaknesses: jsonb("weaknesses")
      .notNull()
      .$type<Array<Record<string, unknown>>>()
      .$defaultFn(() => []),
    recommendations: jsonb("recommendations")
      .notNull()
      .$type<Array<Record<string, unknown>>>()
      .$defaultFn(() => []),
    reportJson: jsonb("report_json")
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("learning_reports_user_type_created_idx").on(
      t.userId,
      t.reportType,
      t.createdAt,
    ),
    index("learning_reports_period_idx").on(t.periodStart, t.periodEnd),
  ],
);
