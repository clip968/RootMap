# Graph Report - .  (2026-05-21)

## Corpus Check
- 179 files · ~98,405 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1071 nodes · 2503 edges · 65 communities (61 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Concept Repository|Concept Repository]]
- [[_COMMUNITY_Phase 1-2 Plans|Phase 1-2 Plans]]
- [[_COMMUNITY_LLM Provider Chat|LLM Provider Chat]]
- [[_COMMUNITY_Processing Queue|Processing Queue]]
- [[_COMMUNITY_Document Processor|Document Processor]]
- [[_COMMUNITY_Tree UI Detail|Tree UI Detail]]
- [[_COMMUNITY_Learning Repo Smoke|Learning Repo Smoke]]
- [[_COMMUNITY_LLM Parse Schemas|LLM Parse Schemas]]
- [[_COMMUNITY_Tree Generation|Tree Generation]]
- [[_COMMUNITY_LLM Error Handling|LLM Error Handling]]
- [[_COMMUNITY_Document Repository|Document Repository]]
- [[_COMMUNITY_Start Form Loading|Start Form Loading]]
- [[_COMMUNITY_Learning Repository|Learning Repository]]
- [[_COMMUNITY_Phase 1 Smoke|Phase 1 Smoke]]
- [[_COMMUNITY_Upload Routes|Upload Routes]]
- [[_COMMUNITY_Supabase Storage|Supabase Storage]]
- [[_COMMUNITY_Document API Errors|Document API Errors]]
- [[_COMMUNITY_Concept REST API|Concept REST API]]
- [[_COMMUNITY_Learning Types|Learning Types]]
- [[_COMMUNITY_Document Extraction Smoke|Document Extraction Smoke]]
- [[_COMMUNITY_Node Detail Storage|Node Detail Storage]]
- [[_COMMUNITY_Tree Retrieval API|Tree Retrieval API]]
- [[_COMMUNITY_Community Graph|Community Graph]]
- [[_COMMUNITY_Generate Tree API|Generate Tree API]]
- [[_COMMUNITY_Concept Store Spec|Concept Store Spec]]
- [[_COMMUNITY_Phase 5 Detail UX|Phase 5 Detail UX]]
- [[_COMMUNITY_Phase 2 Smoke|Phase 2 Smoke]]
- [[_COMMUNITY_Document Tree Schema|Document Tree Schema]]
- [[_COMMUNITY_Document Pipeline Smoke|Document Pipeline Smoke]]
- [[_COMMUNITY_Chunking Extraction|Chunking Extraction]]
- [[_COMMUNITY_Node Detail Prompts|Node Detail Prompts]]
- [[_COMMUNITY_PDF Extraction|PDF Extraction]]
- [[_COMMUNITY_Service Design PDF|Service Design PDF]]
- [[_COMMUNITY_Personalized Recommendations|Personalized Recommendations]]
- [[_COMMUNITY_Document LLM Smoke|Document LLM Smoke]]
- [[_COMMUNITY_Provider Settings UI|Provider Settings UI]]
- [[_COMMUNITY_Infra Security|Infra Security]]
- [[_COMMUNITY_Public SVG Assets|Public SVG Assets]]
- [[_COMMUNITY_Document Consolidation|Document Consolidation]]
- [[_COMMUNITY_Document Tree LLM|Document Tree LLM]]
- [[_COMMUNITY_Document Processing Plan|Document Processing Plan]]
- [[_COMMUNITY_App Shell|App Shell]]
- [[_COMMUNITY_Chunk Concept LLM|Chunk Concept LLM]]
- [[_COMMUNITY_Document Structure LLM|Document Structure LLM]]
- [[_COMMUNITY_Node Detail Smoke|Node Detail Smoke]]
- [[_COMMUNITY_Tree View UX|Tree View UX]]
- [[_COMMUNITY_Document Detail Smoke|Document Detail Smoke]]
- [[_COMMUNITY_Phase 3 Quality|Phase 3 Quality]]
- [[_COMMUNITY_Async Document Flow|Async Document Flow]]
- [[_COMMUNITY_Learning Events|Learning Events]]
- [[_COMMUNITY_Quiz Misconceptions|Quiz Misconceptions]]
- [[_COMMUNITY_Upload Smoke|Upload Smoke]]
- [[_COMMUNITY_Loading UX|Loading UX]]
- [[_COMMUNITY_Document Upload API|Document Upload API]]
- [[_COMMUNITY_Spec Workflow|Spec Workflow]]
- [[_COMMUNITY_Next Asset|Next Asset]]
- [[_COMMUNITY_Phase 4 Roadmap|Phase 4 Roadmap]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Progress Recommendation|Progress Recommendation]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 76 edges
2. `jsonError()` - 41 edges
3. `getLearningTree()` - 27 edges
4. `processDocument()` - 27 edges
5. `getDocumentForUser()` - 24 edges
6. `createChatCompletion()` - 24 edges
7. `main()` - 21 edges
8. `resetDbSingleton()` - 19 edges
9. `client()` - 17 edges
10. `getConceptById()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `AI Wiki Internal Knowledge Graph` --semantically_similar_to--> `Phase 2 Concept Node Store`  [INFERRED] [semantically similar]
  docs/specs/오픈ai서비스_디자인_20212985_남재준 (1).pdf → docs/specs/rootmap_phase_2_spec.md
- `cleanupSmokeDb()` --calls--> `resetDbSingleton()`  [EXTRACTED]
  scripts/smoke-learning-repo.ts → src/db/client.ts
- `내가 만들 AI 서비스 기획서` --semantically_similar_to--> `RootMap`  [EXTRACTED] [semantically similar]
  docs/specs/오픈ai서비스_디자인_20212985_남재준 (1).pdf → docs/specs/rootmap_phase_1_spec.md
- `University Student Target Users` --conceptually_related_to--> `Phase 4 Personalized Learning Coach`  [INFERRED]
  docs/specs/오픈ai서비스_디자인_20212985_남재준 (1).pdf → docs/specs/rootmap_phase_4_spec.md
- `main()` --calls--> `getDb()`  [EXTRACTED]
  scripts/smoke-llm-provider-settings.ts → src/db/client.ts

## Hyperedges (group relationships)
- **Phase 1 MVP Task Sequence** — project_foundation, phase1_data_model, llm_prompts_and_schema, tree_generation_api, start_screen, tree_result_screen, node_detail_flow, progress_and_recommendations, saved_tree_retrieval, quality_tests_and_polish [EXTRACTED 0.98]
- **Phase 1 Data Persistence Model** — learning_trees_table, learning_nodes_table, user_node_progress_table [EXTRACTED 0.96]
- **Phase 1 Tree Generation Flow** — start_screen, tree_generation_api, learning_tree_generation_prompt, json_schema_validation, learning_trees_table, learning_nodes_table, user_node_progress_table, tree_result_screen [EXTRACTED 0.90]
- **Phase 1 Learning Experience Flow** — tree_result_screen, node_detail_flow, progress_and_recommendations, saved_tree_retrieval, rule_based_recommendation [EXTRACTED 0.90]
- **RootMap Architecture Layers** — api_routes_layer, service_layer, llm_layer, repository_layer, database_schema [EXTRACTED 0.95]
- **Phase 2 Concept Storage Model** — concepts_table, concept_edges_table, learning_tree_concepts_table, concept_merge_candidates_table, user_concept_progress_table, learning_nodes_table [EXTRACTED 0.96]
- **Phase 2 Concept Resolution Pipeline** — phase2_llm_schema_prompts, concept_candidate_schema, concept_repository_resolution, concept_resolution_search, post_generation_concept_persistence, tree_generate_api_phase2_extension, reuse_concepts_flag [EXTRACTED 0.90]
- **Phase 2 Concept Reuse System** — concept_store, concept_rest_api, concept_edges, learning_tree_concepts, user_concept_progress, concept_reuse_indicators, concept_detail_panel [EXTRACTED 0.90]
- **Phase 2 Quality Suite** — phase2_smoke_verification, admin_concepts_screen, concept_merge_candidates, concept_edges, learning_tree_concepts [EXTRACTED 0.86]
- **Phase 2.5 Tree Experience** — tree_view, top_down_prerequisite_decomposition, tree_view_interactions, tree_generation_latency_instrumentation, perceived_performance_wait_ui [EXTRACTED 0.88]
- **Phase 3 Document Storage Model** — documents_table, document_pages, document_chunks, document_concepts, document_learning_trees, document_storage_schema [EXTRACTED 0.95]
- **Phase 3 Document Processing Flow** — document_upload_api, text_extraction, chunking, chunk_concept_extraction, document_concept_integration, document_concept_resolution, document_based_learning_tree, document_processing_pipeline [EXTRACTED 0.95]
- **Phase 3 Evidence Aware Document UI** — document_upload_result_ui, document_tree_ui, document_node_detail, source_type, evidence, document_query_apis [EXTRACTED 0.88]
- **Phase 3 Recommendation Quality Cases** — document_recommendation_logic, phase3_quality_verification, transformer_test_case, virtual_memory_test_case, rust_lifetime_test_case [EXTRACTED 0.90]
- **Phase 3 Progressive Generation Pipeline** — phase3_document_learning_flow, progressive_tree_generation, structure_detail_split, lazy_node_detail_generation, chunk_level_llm_checkpoint [EXTRACTED 0.88]
- **Phase 3 Provider and Postgres Infrastructure** — llm_provider_settings, openai_compatible_provider_config, api_key_encryption_aes_gcm, supabase_postgres_transition [EXTRACTED 0.82]
- **Phase 4 Data Model** — learning_sessions, learning_events, user_concept_mastery, quiz_attempts, misconception_events, recommendation_logs, learning_reports [EXTRACTED 0.95]
- **Phase 4 Personalization Loop** — session_events_api, concept_mastery_api, personalized_recommendation_engine, quiz_evaluation_llm, review_priority_score, weak_concept_analysis [EXTRACTED 0.88]
- **Phase 4 Security Preconditions** — live_infra_auth_preflight, default_user_id_risk, rls_policy_strategy, security_quality_tests [EXTRACTED 0.91]
- **Phase 5 Graph Views** — community_concept_graph, graph_first_generation_contract, community_map_view, learning_path_view, deep_dive_generation [EXTRACTED 0.90]
- **Phase 5 Detail Learning Block Set** — detail_learning_blocks, concept_sketch_block, misconception_reminder_block, node_detail_quality_policy [INFERRED 0.76]
- **RootMap Phase Roadmap** — phase_1_mvp, phase_2_concept_store, phase_3_document_based_learning, phase_4_personalized_learning_coach [EXTRACTED 0.98]
- **Phase 1 Core MVP Data Flow** — text_topic_input, prerequisite_learning_tree, learning_node_detail, user_node_progress, rule_based_recommendation_logic [EXTRACTED 0.95]
- **Phase 2 Concept Reuse Model** — concept_node, concept_edge, learning_tree_concepts, duplicate_concept_detection, concept_reuse, user_concept_progress [EXTRACTED 0.96]
- **Phase 3 Document Processing Pipeline** — document_upload, pdf_text_extraction, document_chunking, document_concept_extraction, document_concept_evidence, document_learning_trees_table [EXTRACTED 0.97]
- **Phase 4 Personalization Feedback Loop** — learning_sessions, learning_events, quiz_attempts, user_concept_mastery, review_priority_score, personalized_recommendation_logic, learning_reports [EXTRACTED 0.96]
- **PDF RootMap Service Positioning** — student_target_users, ai_learning_path_designer, ai_wiki_internal_knowledge_graph, karpathy_llm_wiki, notebooklm, claude_for_education, pdf_rationale_learning_order_over_summary [EXTRACTED 0.90]

## Communities (65 total, 4 thin omitted)

### Community 0 - "Concept Repository"
Cohesion: 0.07
Nodes (61): Ctx, GET(), PATCH(), patchSchema, baseSlugFromNormalizedTitle(), normalizeTitle(), AdminConceptsPage(), firstParam() (+53 more)

### Community 1 - "Phase 1-2 Plans"
Cohesion: 0.06
Nodes (60): Agent Operating Rules, API Error Contract, API Routes Layer, apps/web Directory, Architecture Decision Records, Common Types, Concept Candidate Schema, concept_edges Table (+52 more)

### Community 2 - "LLM Provider Chat"
Cohesion: 0.11
Nodes (48): ChatMessage, ChatRole, createChatCompletion(), OpenRouterChatCompletionResponse, OpenRouterChoiceMessage, buildChatCompletionsUrl(), buildLlmProviderHeaders(), envJsonMode() (+40 more)

### Community 3 - "Processing Queue"
Cohesion: 0.08
Nodes (30): getSqlClient(), createQueuePayload(), DocumentLookup, DocumentProcessingJob, DocumentProcessingJobStatus, DocumentProcessingWorkerResult, DocumentProcessingWorkerStatus, DocumentProcessor (+22 more)

### Community 4 - "Document Processor"
Cohesion: 0.09
Nodes (36): asRecord(), buildDocumentEvidence(), ChunkCandidateBatch, ChunkConceptCandidate, ChunkConceptExtractionMetadata, clampDocumentScore(), conceptCandidateFromDocumentConcept(), consolidateConcepts() (+28 more)

### Community 5 - "Tree UI Detail"
Cohesion: 0.07
Nodes (26): DetailLearningBlocks(), DetailLearningBlocksProps, firstSentence(), buildFlowElements(), DocumentEvidenceItem, edgeClassForNodeType(), edgeColorForNodeType(), FOCUS_OPTIONS (+18 more)

### Community 6 - "Learning Repo Smoke"
Cohesion: 0.06
Nodes (35): Ctx, GET(), getDocumentConceptEvidenceForUser(), bundle, chunks, cleanupSmokeDb(), created, db (+27 more)

### Community 7 - "LLM Parse Schemas"
Cohesion: 0.08
Nodes (34): parseDocumentTreeStructureResponse(), parseJsonObject(), parseLearningTreeDetailResponse(), parseLearningTreeOutlineResponse(), sliceBalancedJsonObject(), stripLlmFences(), chunkConceptCandidateSchema, chunkConceptExtractionResponseSchema (+26 more)

### Community 8 - "Tree Generation"
Cohesion: 0.1
Nodes (29): assembleLearningTree(), ChatCompletionRunner, classifyLlmError(), DETAIL_PHASES, DetailPhase, fallbackConceptCandidate(), GenerateLearningTreeOptions, GenerateLearningTreeResult (+21 more)

### Community 9 - "LLM Error Handling"
Cohesion: 0.13
Nodes (19): bodySchema, Ctx, POST(), InvalidTopicError, LlmExhaustedRetriesError, LlmParseError, LlmTransportError, LlmValidationError (+11 more)

### Community 10 - "Document Repository"
Cohesion: 0.08
Nodes (26): bulkInsertDocumentChunks(), bulkInsertDocumentConcepts(), bulkInsertDocumentPages(), CreateDocumentInput, createDocumentLearningTreeLink(), DOCUMENT_CONCEPT_TYPE_ORDER, DocumentChunkInput, DocumentChunkRow (+18 more)

### Community 11 - "Start Form Loading"
Cohesion: 0.09
Nodes (19): GenerationLoadingPanel(), GenerationLoadingPanelProps, waitHint(), ALLOWED_DOCUMENT_EXTENSIONS, DocumentConceptsResponse, DocumentConceptSummary, documentProcessingStage(), DocumentProcessingStatus (+11 more)

### Community 12 - "Learning Repository"
Cohesion: 0.15
Nodes (20): getDb(), userConceptProgress, bodySchema, Ctx, PATCH(), createLearningNodes(), createLearningTree(), FullTreeOptions (+12 more)

### Community 13 - "Phase 1 Smoke"
Cohesion: 0.11
Nodes (22): afterPrereqs, apiPayload, assert(), assertExpectedConcepts(), assertPrerequisiteOrder(), assertRecommendations(), assertTreeQuality(), { bundle, recommended } (+14 more)

### Community 14 - "Upload Routes"
Cohesion: 0.2
Nodes (19): CompleteUploadRequest, POST(), ALLOWED_DOCUMENT_MIME_TYPES, documentTitleFromFilename(), EXECUTABLE_EXTENSIONS, EXECUTABLE_MIME_PREFIXES, extensionOf(), isAllowedMime() (+11 more)

### Community 15 - "Supabase Storage"
Cohesion: 0.23
Nodes (18): authHeaders(), createSignedDocumentUpload(), DocumentStorageRef, downloadDocumentObject(), encodeObjectPath(), getDocumentStorageBucket(), getSupabaseServiceRoleKey(), getSupabaseUrl() (+10 more)

### Community 16 - "Document API Errors"
Cohesion: 0.23
Nodes (13): Ctx, GET(), Ctx, GET(), ApiErrorBody, jsonError(), POST(), getDocumentForUser() (+5 more)

### Community 17 - "Concept REST API"
Cohesion: 0.14
Nodes (19): Admin Concepts Screen, Concept Detail Panel, Concept Edges, Concept Merge Candidates, Concept REST API, Concept Reuse, Concept Reuse Indicators, Duplicate Concept Detection (+11 more)

### Community 18 - "Learning Types"
Cohesion: 0.16
Nodes (15): byDifficultyAsc(), byDocumentOrderThenDifficulty(), RecommendNextOptions, ApiLearningNode, ApiProgressEntry, ApiRecommendationItem, ApiTreePayload, ChunkConceptCandidate (+7 more)

### Community 19 - "Document Extraction Smoke"
Cohesion: 0.2
Nodes (16): documentChunks, documentPages, updateDocumentExtractedInfo(), assert(), createTestPdf(), db, dbAbs, dbRel (+8 more)

### Community 20 - "Node Detail Storage"
Cohesion: 0.18
Nodes (15): findDocumentContextForNode(), normalizeConceptTitle(), LearningNodeRow, LearningTreeBundle, saveNodeDetail(), buildPrerequisitePromptContext(), DocumentNodeDetailGenerator, formatDocumentEvidenceForPrompt() (+7 more)

### Community 21 - "Tree Retrieval API"
Cohesion: 0.21
Nodes (14): Ctx, POST(), recommendNextNodes(), Ctx, GET(), getDocumentTreeContextForUser(), getConceptProgressMapForUser(), getConceptTreeUsageCounts() (+6 more)

### Community 22 - "Community Graph"
Cohesion: 0.17
Nodes (12): byId, graph, nodes, assertValidRefs(), communityId(), ConceptCommunityView, ConceptGraphInputNode, DerivedConceptGraphNode (+4 more)

### Community 23 - "Generate Tree API"
Cohesion: 0.22
Nodes (12): createRequestId(), logGenerateRoute(), POST(), generateLearningTree(), formatConceptsForPrompt(), searchConceptsForPromptContext(), GenerateAndPersistOptions, generateAndPersistTree() (+4 more)

### Community 24 - "Concept Store Spec"
Cohesion: 0.12
Nodes (16): AI Wiki Internal Knowledge Graph, Concept Aware Tree Generation, Concept Edge, Concept Node, Document Chunking, Document Concept Evidence, Document Concept Extraction, document_concepts Table (+8 more)

### Community 25 - "Phase 5 Detail UX"
Cohesion: 0.12
Nodes (16): Community Concept Graph, Community Map View, Concept Sketch Block, Deep Dive Generation, Detail Learning Blocks, Graph First Generation Contract, Lazy Node Detail Generation, Learning Path View (+8 more)

### Community 26 - "Phase 2 Smoke"
Cohesion: 0.34
Nodes (14): resetDbSingleton(), assert(), assertAllNodesLinked(), attentionFamilyTree(), bertTree(), cleanupSmokeDb(), EdgeSpec, main() (+6 more)

### Community 27 - "Document Tree Schema"
Cohesion: 0.23
Nodes (15): Document Based Learning Tree, Document Concept Integration, Document Concepts, Document LLM Schemas, Document Node Detail, Document Query APIs, Document Recommendation Logic, Document Tree UI (+7 more)

### Community 28 - "Document Pipeline Smoke"
Cohesion: 0.24
Nodes (13): createDocument(), assert(), checkQuality(), db, dbAbs, dbRel, logAbs, logStage() (+5 more)

### Community 29 - "Chunking Extraction"
Cohesion: 0.26
Nodes (11): buildChunk(), chunkFromPdfPages(), chunkFromText(), ChunkInput, chunkUnits(), estimateTokens(), getOverlapUnits(), parseMarkdownHeadings() (+3 more)

### Community 30 - "Node Detail Prompts"
Cohesion: 0.22
Nodes (10): generateNodeDetail(), GenerateNodeDetailInput, GenerateNodeDetailResult, shouldAbortRetries(), parseNodeDetailResponse(), BuildDocumentTreeStructureUserMessageOptions, buildLearningTreeDetailUserMessage(), buildLearningTreeOutlineUserMessage() (+2 more)

### Community 31 - "PDF Extraction"
Cohesion: 0.19
Nodes (6): ensurePdfJsTextExtractionPolyfills(), extractPdfPages(), loadPdfJs(), PdfPage, readPdfFile(), TextExtractionDOMMatrix

### Community 32 - "Service Design PDF"
Cohesion: 0.18
Nodes (13): AI Learning Path Designer Role, Claude for Education, Learning Node Detail, NotebookLM, Learning Order Design Over Simple Summary, Phase 1 LLM JSON Schema, Phase 1 MVP, Validate Core Learning Tree UX Before Full Wiki (+5 more)

### Community 33 - "Personalized Recommendations"
Cohesion: 0.19
Nodes (13): Concept Mastery API, Confidence Score, Personalized Recommendation Engine, Personalized Recommendation Logic, Personalized UI, Phase 4 Concept Mastery and Self Assessment Plan, Phase 4 Personalized Recommendations and Tree API Plan, Phase 4 Personalized UI Plan (+5 more)

### Community 34 - "Document LLM Smoke"
Cohesion: 0.2
Nodes (10): getOpenRouterTimeoutMs(), RecommendNodeInput, assert(), assertConcurrencyLimit(), assertThrows(), documentNodes, DocumentRecommendNode, ids (+2 more)

### Community 35 - "Provider Settings UI"
Cohesion: 0.21
Nodes (9): apiErrorMessage(), fetchProviderStatus(), JsonMode, LlmProviderSettingsPanel(), providerLabel(), PROVIDERS, ProviderStatus, ProviderType (+1 more)

### Community 36 - "Infra Security"
Cohesion: 0.17
Nodes (12): API Key AES-GCM Encryption, DEFAULT_USER_ID Risk, Live Infra Auth Preflight, LLM Provider Settings, OpenAI-compatible Provider Config, Phase 3 LLM Provider Settings Plan, Phase 3 Supabase Postgres Transition Handoff, Phase 4 Live Infra Auth and Deployment Preflight (+4 more)

### Community 37 - "Public SVG Assets"
Cohesion: 0.18
Nodes (12): Browser Window UI Concept, Document File UI Concept, File SVG Icon, Global Web Concept, Globe SVG Icon, Next Web App, Next.js Logo SVG Public Asset, Next.js Web App (+4 more)

### Community 38 - "Document Consolidation"
Cohesion: 0.29
Nodes (10): classifyLlmError(), GenerateConsolidationOptions, GenerateConsolidationResult, generateDocumentConsolidation(), logGenerate(), shouldAbortRetries(), parseDocumentConsolidationResponse(), buildDocumentConsolidationUserMessage() (+2 more)

### Community 39 - "Document Tree LLM"
Cohesion: 0.29
Nodes (10): classifyLlmError(), generateDocumentTree(), GenerateDocumentTreeOptions, GenerateDocumentTreeResult, logGenerate(), shouldAbortRetries(), parseDocumentTreeResponse(), buildDocumentTreeUserMessage() (+2 more)

### Community 40 - "Document Processing Plan"
Cohesion: 0.25
Nodes (11): Chunk Concept Extraction, Chunking, Document Chunks, Document Learning Trees, Document Pages, Document Processing Pipeline, Document Storage Schema, 05 Document Processing Pipeline Plan (+3 more)

### Community 41 - "App Shell"
Cohesion: 0.22
Nodes (6): geistMono, geistSans, metadata, AppShell(), AppShellProps, ApiTreeHistoryItem

### Community 42 - "Chunk Concept LLM"
Cohesion: 0.31
Nodes (9): classifyLlmError(), generateChunkConcepts(), GenerateChunkConceptsOptions, GenerateChunkConceptsResult, logGenerate(), shouldAbortRetries(), parseChunkConceptExtractionResponse(), buildDocumentChunkConceptUserMessage() (+1 more)

### Community 43 - "Document Structure LLM"
Cohesion: 0.36
Nodes (8): getOpenRouterMaxAttempts(), classifyLlmError(), generateDocumentTreeStructure(), GenerateDocumentTreeStructureOptions, logGenerate(), shouldAbortRetries(), buildDocumentTreeStructureUserMessage(), DocumentTreeStructureResponse

### Community 44 - "Node Detail Smoke"
Cohesion: 0.33
Nodes (7): createFullLearningTree(), assert(), main(), node(), setupDb(), LearningTreeNode, NodeDetailResponse

### Community 45 - "Tree View UX"
Cohesion: 0.22
Nodes (9): Perceived Performance Wait UI, RootMap Phase 2.5 Implementation Plan README, 04 Tree Generation Latency And Perceived Performance Plan, 01 Tree View Layout Plan, 02 Tree View Polish And Quality Plan, Top-Down Prerequisite Decomposition, Tree Generation Latency Instrumentation, Tree View (+1 more)

### Community 46 - "Document Detail Smoke"
Cohesion: 0.36
Nodes (7): GenerateNodeDetailOptions, assert(), dbAbs, dbRel, main(), requireOpenRouterEnv(), LearningTreeResponse

### Community 47 - "Phase 3 Quality"
Cohesion: 0.36
Nodes (8): Concept Store, Document Concept Resolution, 06 Document Concept Resolution And Persistence Plan, 10 Document Recommendations Quality And Tests Plan, Phase 3 Quality Verification, Rust Lifetime Test Case, Transformer Test Case, Virtual Memory Test Case

### Community 48 - "Async Document Flow"
Cohesion: 0.25
Nodes (8): Chunk Level LLM Checkpoint, Document Evidence and Source Types, Phase 3 Async Document Processing Plan, Phase 3 Concept Store Integration, Phase 3 Document Learning Flow, RootMap Phase 3 README, RootMap Phase 3 Task Breakdown, Supabase Queue Async Processing

### Community 49 - "Learning Events"
Cohesion: 0.36
Nodes (8): learning_events, learning_reports, learning_sessions, Phase 4 Session and Learning Events API Plan, Phase 4 Sessions Events and Mastery Schema Plan, Phase 4 Personalized Learning Coach, Adjust Learning Paths To Each User State, Session and Learning Events API

### Community 50 - "Quiz Misconceptions"
Cohesion: 0.38
Nodes (7): misconception_events, Phase 4 Learning Reports and LLM Prompts Plan, Phase 4 Quiz Evaluation and Attempts API Plan, Phase 4 Quiz Misconception Recommendation Report Schema Plan, quiz_attempts, Quiz Evaluation LLM, Weak Concept Analysis

### Community 51 - "Upload Smoke"
Cohesion: 0.4
Nodes (5): db, dbAbs, dbRel, main(), upload()

### Community 52 - "Loading UX"
Cohesion: 0.4
Nodes (5): Existing Loading State Logic, Loading UX Minimal Plan, Make Long Generation Wait Understandable, Animated Map Skeleton, Reusable Visual Loading Panel

### Community 53 - "Document Upload API"
Cohesion: 0.5
Nodes (4): Document File Validation, Document Upload API, Documents Table, 02 Document Upload And Validation API Plan

### Community 54 - "Spec Workflow"
Cohesion: 0.5
Nodes (4): Authoritative Feature Specification, Feature Specifications Directory, Senior Model Spec Reader, Worker Model Plan Reader

### Community 55 - "Next Asset"
Cohesion: 0.5
Nodes (4): Next.js SVG Logo, Next.js Wordmark, Web App Public Assets, Web Public Static Asset

### Community 56 - "Phase 4 Roadmap"
Cohesion: 0.67
Nodes (3): Phase 4 Personalized Learning, RootMap Phase 4 README, RootMap Phase 4 Task Breakdown

## Knowledge Gaps
- **311 isolated node(s):** `config`, `nextConfig`, `eslintConfig`, `RootMapDb`, `RootMapTx` (+306 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Learning Repository` to `Concept Repository`, `LLM Provider Chat`, `Processing Queue`, `Document Processor`, `Learning Repo Smoke`, `Document Repository`, `Node Detail Smoke`, `Phase 1 Smoke`, `Document Detail Smoke`, `Document API Errors`, `Upload Smoke`, `Node Detail Storage`, `Document Extraction Smoke`, `Tree Retrieval API`, `Generate Tree API`, `Phase 2 Smoke`, `Document Pipeline Smoke`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `jsonError()` connect `Document API Errors` to `Concept Repository`, `LLM Provider Chat`, `Learning Repo Smoke`, `LLM Error Handling`, `Learning Repository`, `Upload Routes`, `Tree Retrieval API`, `Generate Tree API`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getDb()` (e.g. with `GET()` and `GET()`) actually correct?**
  _`getDb()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `config`, `nextConfig`, `eslintConfig` to the rest of the system?**
  _311 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Concept Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Phase 1-2 Plans` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `LLM Provider Chat` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._