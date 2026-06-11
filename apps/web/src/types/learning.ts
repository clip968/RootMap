/** Phase 1 공통 도메인 타입 (명세·01-project-foundation 기준) */

import type {
  VisualBlock,
  VisualDecision,
} from "@/lib/visualization/visual-block-schema";

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

/** Phase 2: LLM 트리 출력 최상위 간선 (노드 id = node_key)
 *
 * Phase 13: edge를 "단순 위상 관계"에서 "근거·확신도·blocking 여부를 가진 학습 관계"로
 * 끌어올리기 위해 품질 필드를 추가했다. 단, 아래 세 필드는 모두 optional이다.
 * - 기존에 저장된 트리(`tree_json`)에는 이 필드가 없으므로 파서/뷰가 기본값으로 보정한다.
 * - 그래서 화면이나 평가가 옛 데이터에서도 깨지지 않는다(하위 호환).
 */
export interface LlmConceptEdge {
  from: string;
  to: string;
  relation_type: ConceptRelationType;
  /** @deprecated Phase 13에서 `explanation`으로 통합. 옛 데이터 호환을 위해 유지한다. */
  reason?: string;
  /** Phase 13: 왜 이 관계인가(필수화 목표). 비어 있으면 `reason`으로 보정한다. */
  explanation?: string;
  /** Phase 13: 관계 확신도(0~1). 없으면 0.5로 보정한다. */
  confidence?: number;
  /** Phase 13: 이걸 모르면 다음 개념 이해가 막히는가. prerequisite에서만 의미가 있다. */
  is_blocking?: boolean;
}

/**
 * Phase 13: 보정이 끝나 "항상 채워진" 형태의 학습 edge 품질 타입.
 *
 * `LlmConceptEdge`는 LLM/DB 입력 단계라 품질 필드가 optional이지만,
 * 뷰·API·UI는 이 타입을 받아 항상 `explanation`·`confidence`·`is_blocking`이 있다고 가정한다.
 * 명세(§2.2)는 relation_type을 4종으로 좁히지만, RootMap은 cross-community link 식별(§2.4)에
 * `application_of`/`example_of`가 필요하므로 6종 `ConceptRelationType`을 그대로 유지한다.
 */
export interface LearningEdgeQuality {
  from: string;
  to: string;
  relation_type: ConceptRelationType;
  explanation: string;
  confidence: number;
  is_blocking: boolean;
}

export type NodeType =
  | "prerequisite"
  | "core"
  | "supplementary"
  | "misconception"
  | "quiz";

export type ProgressStatus = "known" | "partial" | "unknown";

/**
 * Phase 14(§3.3): `learning_objective`가 시작할 수 있는 허용 동사 5종.
 *
 * 전체 Bloom taxonomy 대신 이 5개 동사만 사용한다(spec Non-Goals).
 * 이 동사는 Section 6 퀴즈 유형(`recall|apply|compare|trace|debug`)과 정렬된다.
 */
export const LEARNING_OBJECTIVE_VERBS = [
  "define",
  "explain",
  "apply",
  "compare",
  "debug",
] as const;
export type LearningObjectiveVerb = (typeof LEARNING_OBJECTIVE_VERBS)[number];

/**
 * Phase 14(§3.2): 노드 학습 계약.
 *
 * - `learning_objective`: "이 노드를 읽은 다음 무엇을 할 수 있어야 하는가"를 한 문장으로 적는다.
 *   허용 동사(영문) 중 하나로 시작해 기계가 검증할 수 있고 UI가 skill 라벨로 쓸 수 있게 한다.
 *   예: "explain — 가상 주소가 페이지 번호와 오프셋으로 나뉘는 과정을 설명할 수 있다."
 * - `mastery_evidence`: 위 목표를 "할 수 있다" 형태로 쪼갠 검증 가능한 행동 진술(1개 이상).
 */
export interface NodeLearningContract {
  learning_objective: string;
  mastery_evidence: string[];
}

/**
 * Phase 14(§6.3): 개념 이해 점검 문항.
 *
 * 퀴즈를 "노드 타입"이 아니라 "각 개념의 mastery_evidence를 검증하는 도구"로 본다.
 * `type`은 Section 3 동사 체계와 정렬된다(define→recall, apply→apply, compare→compare,
 * debug→debug/trace). 기존 `check_questions`(`{question, answer}`)는 유지하고 이 타입으로 보강한다.
 *
 * 설계 메모:
 * - `node_id`는 노드 상세가 이미 자기 node_id를 가지므로 문항마다 반복하지 않아도 되도록 optional이다.
 * - `difficulty`는 코드베이스의 다른 difficulty 필드와 동일하게 number(1~5, 스키마에서 clamp)로 둔다.
 */
export type ConceptQuestionType =
  | "recall"
  | "apply"
  | "compare"
  | "trace"
  | "debug";

export interface ConceptQuestion {
  id: string;
  node_id?: string;
  type: ConceptQuestionType;
  prompt: string;
  expected_answer: string;
  /** 채점 기준 항목(1개 이상). rubric 충족 여부로 부분 점수를 낸다(Phase 14-04). */
  rubric: string[];
  /** 이 문항이 겨냥하는 오개념(기존 misconception 자산에서 재사용). */
  misconception_target?: string;
  /** 1~5 난이도. 스키마에서 정수로 clamp한다. */
  difficulty: number;
}

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
  /**
   * Phase 14(§3.2): 노드 학습 목표. 허용 동사로 시작한다.
   * optional이라 이 필드가 없는 기존 상세(detailJson)도 그대로 동작한다(하위 호환).
   */
  learning_objective?: string;
  /** Phase 14(§3.2): 학습 목표를 검증하는 행동 진술 목록(1개 이상). optional(하위 호환). */
  mastery_evidence?: string[];
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: Array<{
    question: string;
    answer: string;
  }>;
  /**
   * Phase 14(§6): mastery_evidence를 검증하는 개념 문항(보강 필드).
   * optional이라 기존 상세는 그대로 동작하고, check_questions와 병존한다(점진 대체).
   */
  concept_questions?: ConceptQuestion[];
  next_nodes: string[];
  visual_decision?: VisualDecision;
  visual_blocks?: VisualBlock[];
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
  /**
   * Phase 13: 노드 간 관계 근거(edge hover UI가 소비).
   * from/to는 노드의 `node_key`다. 옛 트리에는 없을 수 있으므로 optional이다.
   */
  edges?: LearningEdgeQuality[];
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
  /** Phase 14(§3.2): 문서 노드 학습 목표. 허용 동사로 시작. optional(하위 호환). */
  learning_objective?: string;
  /** Phase 14(§3.2): 문서 노드 숙달 증거(1개 이상). optional(하위 호환). */
  mastery_evidence?: string[];
  why_it_matters_for_document: string;
  document_context_summary: string;
  easy_explanation: string;
  example: string;
  common_misconceptions: string[];
  check_questions: Array<{
    question: string;
    answer: string;
  }>;
  /** Phase 14(§6): 문서 노드의 개념 문항(보강 필드). optional(하위 호환). */
  concept_questions?: ConceptQuestion[];
  next_nodes: string[];
  visual_decision?: VisualDecision;
  visual_blocks?: VisualBlock[];
}
