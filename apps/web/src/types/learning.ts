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
  /** Phase 2: 없으면 서버/파서가 title 기반으로 보충 */
  concept_candidate?: ConceptCandidate;
}

export interface LearningTreeResponse {
  topic: string;
  summary: string;
  nodes: LearningTreeNode[];
  recommended_order: string[];
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
  has_detail: boolean;
  progress: ProgressStatus;
  /** Phase 2 */
  concept_id: string | null;
  is_reused_concept: boolean | null;
  /** 이 Concept가 포함된 서로 다른 학습 트리 개수(현재 트리 포함) */
  concept_tree_count: number | null;
}

export interface ApiTreePayload {
  tree_id: string;
  topic: string;
  summary: string;
  nodes: ApiLearningNode[];
  recommended_order: string[];
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
