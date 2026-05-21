/** Phase 1 공통 도메인 타입 (명세·01-project-foundation 기준) */

/** Phase 2 LLM·저장소 공통: 개념 간선 relation_type */
export type ConceptRelationType =
  | "prerequisite"
  | "part_of"
  | "related"
  | "misconception_of"
  | "example_of"
  | "application_of";

/** Phase 2: LLM이 노드별로 내보내는 Concept 후보 */
export interface ConceptCandidate {
  canonical_title: string;
  aliases: string[];
  domain: string | null;
  short_description: string;
  is_reusable: boolean;
}

/** Phase 2: LLM 트리 출력 최상위 간선 (노드 id = node_key) */
export interface LlmConceptEdge {
  from: string;
  to: string;
  relation_type: ConceptRelationType;
  reason?: string;
}

export type NodeType =
  | "prerequisite"
  | "core"
  | "supplementary"
  | "misconception"
  | "quiz";

export type ProgressStatus = "known" | "partial" | "unknown";

/** LLM 트리 생성 응답의 단일 노드 (id = LLM node_key) */
export interface LearningTreeNode {
  id: string;
  title: string;
  type: NodeType;
  description: string;
  difficulty: number;
  prerequisites: string[];
  children: string[];
  community?: string;
  priority?: number;
  depth?: number;
  /** Phase 2: 없으면 서버/파서가 title 기반으로 보충 */
  concept_candidate?: ConceptCandidate;
}

export interface LearningTreeResponse {
  topic: string;
  summary: string;
  nodes: LearningTreeNode[];
  recommended_order: string[];
  communities?: Array<{
    id: string;
    name: string;
    priority: number;
    node_ids: string[];
  }>;
  /** Phase 2: 노드 id 간 Concept 관계 */
  edges?: LlmConceptEdge[];
}

export interface NodeDetailResponse {
  node_id: string;
  title: string;
  type: NodeType;
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: Array<{
    question: string;
    answer: string;
  }>;
  next_nodes: string[];
}

/** API·UI에서 사용하는 노드 (DB UUID id) */
export interface ApiLearningNode {
  id: string;
  node_key: string;
  title: string;
  type: NodeType;
  description: string;
  difficulty: number;
  prerequisites: string[];
  children: string[];
  community?: string;
  priority?: number;
  depth?: number;
  has_detail: boolean;
  progress: ProgressStatus;
  /** Phase 2 */
  concept_id: string | null;
  is_reused_concept: boolean | null;
  /** 이 Concept가 포함된 서로 다른 학습 트리 개수(현재 트리 포함) */
  concept_tree_count: number | null;
  /**
   * Phase 3: 문서에서 만든 트리일 때만 붙는 출처 정보.
   * 일반 주제 트리에는 이 값이 없으므로 기존 화면/계약은 그대로 동작한다.
   */
  document_context?: {
    document_id: string;
    document_title: string;
    document_concept_id: string;
    concept_type: DocumentConceptType;
    source_type: DocumentSourceType;
    evidence_count: number;
    evidence: Array<{
      page_start: number | null;
      page_end: number | null;
      section_title: string | null;
      snippet: string;
    }>;
  };
}

export interface ApiTreePayload {
  tree_id: string;
  /** Phase 3: 문서 기반 트리이면 원본 문서 id가 내려온다. */
  document_id?: string;
  document_title?: string;
  topic: string;
  summary: string;
  nodes: ApiLearningNode[];
  recommended_order: string[];
  communities?: Array<{
    id: string;
    name: string;
    priority: number;
    node_ids: string[];
  }>;
}

export interface ApiTreeHistoryItem {
  tree_id: string;
  topic: string;
  summary: string;
  node_count: number;
  created_at: string;
  updated_at: string;
}
export interface ApiProgressEntry {
  node_id: string;
  status: ProgressStatus;
}

export interface ApiRecommendationItem {
  node_id: string;
  title: string;
  reason: string;
}

/** Phase 4 개인화 트리 API가 노드별 숙련도·추천 점수를 내려줄 때 쓰는 프론트 계약 */
export interface ApiPersonalizedNode {
  node_id: string;
  concept_id: string | null;
  title: string;
  status: ProgressStatus;
  confidence_score: number;
  recommendation_score: number;
  is_recommended: boolean;
  reasons: string[];
}

export interface ApiPersonalizedTreeResponse {
  tree_id: string;
  topic: string;
  personalized_nodes: ApiPersonalizedNode[];
}

export interface ApiPersonalizedRecommendationItem {
  node_id: string;
  concept_id: string | null;
  title: string;
  score: number;
  reasons: string[];
  recommendation_log_id?: string;
}

export interface ApiPersonalizedRecommendationsResponse {
  tree_id: string;
  recommended_nodes: ApiPersonalizedRecommendationItem[];
}

export interface ApiReviewItem {
  concept_id: string;
  title: string;
  review_priority_score: number;
  reasons: string[];
}

export interface ApiReviewDueResponse {
  review_items: ApiReviewItem[];
}

export interface ApiSessionReportResponse {
  report_id: string;
  title: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

// ──────────────────────────────────────────────
// Phase 3 문서 기반 LLM 응답 타입 (명세 §7·§11)
// ──────────────────────────────────────────────

/** 문서 개념 유형 */
export type DocumentConceptType =
  | "document_topic"
  | "prerequisite"
  | "document_core"
  | "method"
  | "background"
  | "misconception"
  | "evaluation";

/** 출처 유형 */
export type DocumentSourceType = "explicit" | "inferred" | "generated";

/** 문서 기반 트리 노드 유형 */
export type DocumentNodeType =
  | "prerequisite"
  | "document_core"
  | "supplementary"
  | "misconception"
  | "quiz";

/** 청크별 개념 추출 — 단일 후보 */
export interface ChunkConceptCandidate {
  canonical_title: string;
  aliases: string[];
  type: DocumentConceptType;
  short_description: string;
  importance: number;
  difficulty: number;
  source_type: "explicit";
  evidence_snippet: string;
}

/** 청크별 개념 추출 — LLM 응답 최상위 */
export interface ChunkConceptExtractionResponse {
  document_id: string;
  chunk_id: string;
  section_title: string;
  concept_candidates: ChunkConceptCandidate[];
}

/** 문서 통합 개념 — 단일 개념 */
export interface ConsolidatedConcept {
  canonical_title: string;
  aliases: string[];
  type: DocumentConceptType;
  importance: number;
  difficulty: number;
  source_type: "explicit" | "inferred";
  evidence: Array<{
    chunk_id: string;
    page_start: number | null;
    page_end: number | null;
    section_title: string;
  }>;
}

/** 문서 전체 개념 통합 — LLM 응답 */
export interface DocumentConsolidationResponse {
  document_title: string;
  main_topic: string;
  summary: string;
  concepts: ConsolidatedConcept[];
}

/** Phase 3 Task 11: 점진적 트리 생성을 위한 경량 구조 전용 노드 타입.
 *  description/difficulty/evidence/concept_candidate 없이
 *  노드의 제목·타입·부모-자식 관계만 담는다. */
export interface DocumentTreeStructureNode {
  id: string;
  title: string;
  type: DocumentNodeType;
  prerequisites: string[];
  children: string[];
  source_type: DocumentSourceType;
}

export interface DocumentTreeStructureResponse {
  topic: string;
  document_id: string;
  summary: string;
  nodes: DocumentTreeStructureNode[];
  edges: LlmConceptEdge[];
  recommended_order: string[];
}

/** 문서 기반 트리 노드 */
export interface DocumentTreeNode {
  id: string;
  title: string;
  type: DocumentNodeType;
  description: string;
  difficulty: number;
  prerequisites: string[];
  children: string[];
  source_type: DocumentSourceType;
  evidence: Array<{
    page_start: number | null;
    page_end: number | null;
    section_title: string;
  }>;
  concept_candidate: ConceptCandidate;
}

/** 문서 기반 학습 트리 — LLM 응답 */
export interface DocumentTreeResponse {
  topic: string;
  document_id: string;
  summary: string;
  nodes: DocumentTreeNode[];
  edges: LlmConceptEdge[];
  recommended_order: string[];
}

/** 문서 기반 노드 상세 설명 — LLM 응답 */
export interface DocumentNodeDetailResponse {
  node_id: string;
  title: string;
  source_type: DocumentSourceType;
  why_it_matters_for_document: string;
  document_context_summary: string;
  easy_explanation: string;
  example: string;
  common_misconceptions: string[];
  check_questions: Array<{
    question: string;
    answer: string;
  }>;
  next_nodes: string[];
}
