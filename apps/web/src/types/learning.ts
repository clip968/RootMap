/** Phase 1 공통 도메인 타입 (명세·01-project-foundation 기준) */

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
}

export interface LearningTreeResponse {
  topic: string;
  summary: string;
  nodes: LearningTreeNode[];
  recommended_order: string[];
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
