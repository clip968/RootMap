export interface DuplicateConceptSignalInput {
  id: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  domain: string | null;
  prerequisites: string[];
  embeddingSimilarity?: number | null;
}

export interface DuplicateConceptScoreInput {
  source: DuplicateConceptSignalInput;
  target: DuplicateConceptSignalInput;
}

export interface DuplicateConceptScore {
  score: number;
  reasons: string[];
}

export interface ConceptGraphEdgeInput {
  from: string;
  to: string;
  relationType: string;
}

export interface CommunityLearningPathInput {
  communities: Array<{ id: string; name: string; node_ids: string[] }>;
  recommendedOrder: string[];
}

export interface CommunityLearningPathAction {
  community_id: string;
  community_name: string;
  start_node_id: string;
  deep_dive_topic: string;
}

function overlapRatio(a: string[], b: string[]): number {
  const normalize = (item: string) => item.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ");
  const left = new Set(a.map(normalize).filter(Boolean));
  const right = new Set(b.map(normalize).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export function scoreConceptDuplicateCandidate(input: DuplicateConceptScoreInput): DuplicateConceptScore {
  const reasons: string[] = [];
  let score = 0;
  if (input.source.normalizedTitle && input.source.normalizedTitle === input.target.normalizedTitle) {
    score += 0.4;
    reasons.push("normalized_title_match");
  }
  const aliasOverlap = overlapRatio(input.source.aliases, input.target.aliases);
  if (aliasOverlap > 0) {
    score += aliasOverlap * 0.2;
    reasons.push("alias_overlap");
  }
  if (input.source.domain && input.source.domain === input.target.domain) {
    score += 0.15;
    reasons.push("same_domain");
  }
  const neighborhoodOverlap = overlapRatio(input.source.prerequisites, input.target.prerequisites);
  if (neighborhoodOverlap > 0) {
    score += neighborhoodOverlap * 0.15;
    reasons.push("prerequisite_neighborhood_overlap");
  }
  if (input.source.embeddingSimilarity != null && input.target.embeddingSimilarity != null) {
    const embeddingSignal = Math.min(input.source.embeddingSimilarity, input.target.embeddingSimilarity);
    score += Math.max(0, embeddingSignal) * 0.1;
    reasons.push("embedding_similarity");
  }
  return { score: roundScore(score), reasons };
}

export function detectPrerequisiteCycles(edges: ConceptGraphEdgeInput[]): string[][] {
  const prerequisiteEdges = edges.filter((edge) => edge.relationType === "prerequisite");
  const nextByNode = new Map<string, string[]>();
  for (const edge of prerequisiteEdges) {
    nextByNode.set(edge.from, [...(nextByNode.get(edge.from) ?? []), edge.to]);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of nextByNode.get(node) ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of nextByNode.keys()) visit(node);
  return cycles;
}

export function buildCommunityLearningPathActions(input: CommunityLearningPathInput): CommunityLearningPathAction[] {
  return input.communities.flatMap((community) => {
    const startNodeId = input.recommendedOrder.find((nodeId) => community.node_ids.includes(nodeId));
    if (!startNodeId) return [];
    return [{
      community_id: community.id,
      community_name: community.name,
      start_node_id: startNodeId,
      deep_dive_topic: community.name,
    }];
  });
}

// ──────────────────────────────────────────────
// Phase 13: 그래프 품질 보강 (transitive reduction · cross-community · cycle repair)
//
// 공통 원칙: 어떤 함수도 원본 edge를 삭제·수정하지 않는다. 분류·식별·"끊을 후보 제안"만 한다.
// 실제 적용 여부는 상위(UI/사람)가 결정한다(명세 §2.4).
// ──────────────────────────────────────────────

/** 사이클 후보 키(개념 이름에 등장하지 않는 NUL 구분자). */
const EDGE_PAIR_SEPARATOR = "\u0000";

function edgePairKey(from: string, to: string): string {
  return `${from}${EDGE_PAIR_SEPARATOR}${to}`;
}

/** Phase 13: confidence를 포함한 edge 입력(cycle repair 등에 사용). */
export interface ConceptGraphQualityEdgeInput extends ConceptGraphEdgeInput {
  /** 관계 확신도(0~1). 없으면 중립값 0.5로 본다. */
  confidence?: number;
}

/** transitive reduction 결과. 원본은 그대로 두고 "분류"만 제공한다. */
export interface TransitiveReductionResult {
  /** 시각화 추천 집합: 다른 경로로 함의되는 중복 prerequisite을 뺀 간선들. */
  reduced: ConceptGraphEdgeInput[];
  /** A→B, B→C가 있을 때의 A→C처럼 우회 경로로 이미 함의되는 중복 prerequisite. */
  redundant: ConceptGraphEdgeInput[];
}

/**
 * transitive reduction: prerequisite DAG에서 "우회 경로로 이미 함의되는" 중복 간선을 찾아낸다.
 *
 * 예: A→B, B→C, A→C가 모두 있으면 A→C는 A→B→C로 이미 함의되므로 중복(redundant)이다.
 * - prerequisite 관계만 대상으로 한다. 그 외 관계(related 등)는 항상 reduced에 남긴다.
 * - 원본 간선은 절대 삭제하지 않는다. reduced/redundant로 "분류"만 해서 시각 복잡도를 낮추도록 돕는다.
 * - 사이클이 있어도 visited로 무한루프를 막아 안전하게 동작한다(사이클 처리는 별도 함수가 담당).
 */
export function computeTransitiveReduction(
  edges: ConceptGraphEdgeInput[],
): TransitiveReductionResult {
  const prerequisiteEdges = edges.filter((edge) => edge.relationType === "prerequisite");
  const otherEdges = edges.filter((edge) => edge.relationType !== "prerequisite");

  // from → [to...] 인접 리스트.
  const adjacency = new Map<string, string[]>();
  for (const edge of prerequisiteEdges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }

  /** start에서 target까지, 간선 (skipFrom→skipTo)를 한 번 제외하고 도달 가능한가. */
  const reachableWithoutDirectEdge = (
    start: string,
    target: string,
    skipFrom: string,
    skipTo: string,
  ): boolean => {
    const visited = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        // 검사 대상인 직접 간선은 한 번만 건너뛴다(우회 경로 존재 여부만 보기 위함).
        if (current === skipFrom && next === skipTo) continue;
        if (next === target) return true;
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  };

  const reduced: ConceptGraphEdgeInput[] = [...otherEdges];
  const redundant: ConceptGraphEdgeInput[] = [];

  for (const edge of prerequisiteEdges) {
    if (reachableWithoutDirectEdge(edge.from, edge.to, edge.from, edge.to)) {
      redundant.push(edge);
    } else {
      reduced.push(edge);
    }
  }

  return { reduced, redundant };
}

/** community 경계를 가로지르는 연결. UI에서 별도 스타일로 표시하기 위한 정보. */
export interface CrossCommunityLink {
  from: string;
  to: string;
  relation_type: string;
  from_community: string;
  to_community: string;
}

/**
 * cross-community link 식별: 서로 다른 community에 속한 노드를 잇는 `related`/`application_of` 간선.
 *
 * 이런 간선은 "다른 묶음의 개념이 사실 연결되어 있다"는 통찰을 주므로 별도로 식별해 둔다.
 * prerequisite은 위상(계층)을 만드는 간선이라 여기서 제외한다.
 */
export function identifyCrossCommunityLinks(
  edges: ConceptGraphEdgeInput[],
  communityByNode: Map<string, string>,
): CrossCommunityLink[] {
  const crossCommunityRelations = new Set(["related", "application_of"]);
  const links: CrossCommunityLink[] = [];
  for (const edge of edges) {
    if (!crossCommunityRelations.has(edge.relationType)) continue;
    const fromCommunity = communityByNode.get(edge.from);
    const toCommunity = communityByNode.get(edge.to);
    if (!fromCommunity || !toCommunity) continue;
    if (fromCommunity === toCommunity) continue;
    links.push({
      from: edge.from,
      to: edge.to,
      relation_type: edge.relationType,
      from_community: fromCommunity,
      to_community: toCommunity,
    });
  }
  return links;
}

/** cycle repair 후보 한 건: "이 사이클은 이 간선을 끊으면 풀린다"는 제안. */
export interface PrerequisiteCycleRepair {
  /** detectPrerequisiteCycles가 준 사이클(닫힌 경로, 예: ["a","b","c","a"]). */
  cycle: string[];
  /** 끊을 후보 간선(사이클 내 confidence가 가장 낮은 prerequisite). */
  cut_edge: { from: string; to: string };
  /** 그 후보 간선의 confidence(없으면 0.5로 간주). */
  confidence: number;
}

/**
 * cycle repair 후보 제안: prerequisite 사이클마다 "끊을 간선"을 1개씩 제시한다(자동 적용 없음).
 *
 * 끊을 후보는 "사이클을 이루는 간선 중 confidence가 가장 낮은 것"이다.
 * LLM이 가장 자신 없어 한 관계가 잘못 들어갔을 가능성이 높다는 가정이다.
 * 실제로 끊지는 않고 후보만 돌려준다 — 상위(평가/사람)가 판단한다.
 */
export function proposePrerequisiteCycleRepairs(
  edges: ConceptGraphQualityEdgeInput[],
): PrerequisiteCycleRepair[] {
  const cycles = detectPrerequisiteCycles(edges);
  if (cycles.length === 0) return [];

  // prerequisite 간선의 confidence를 (from,to) → confidence로 빠르게 조회.
  const confidenceByPair = new Map<string, number>();
  for (const edge of edges) {
    if (edge.relationType !== "prerequisite") continue;
    confidenceByPair.set(
      edgePairKey(edge.from, edge.to),
      typeof edge.confidence === "number" ? edge.confidence : 0.5,
    );
  }

  return cycles.map((cycle) => {
    let cutEdge = { from: cycle[0]!, to: cycle[1] ?? cycle[0]! };
    let lowest = Number.POSITIVE_INFINITY;
    // 닫힌 경로의 연속 쌍 (cycle[i], cycle[i+1])을 순회하며 confidence 최저 간선을 찾는다.
    for (let i = 0; i < cycle.length - 1; i++) {
      const from = cycle[i]!;
      const to = cycle[i + 1]!;
      const confidence = confidenceByPair.get(edgePairKey(from, to)) ?? 0.5;
      if (confidence < lowest) {
        lowest = confidence;
        cutEdge = { from, to };
      }
    }
    return {
      cycle,
      cut_edge: cutEdge,
      confidence: Number.isFinite(lowest) ? lowest : 0.5,
    };
  });
}
