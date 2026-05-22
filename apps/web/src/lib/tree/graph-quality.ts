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
