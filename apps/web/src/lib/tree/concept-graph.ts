import type { LearningEdgeQuality, NodeType } from "@/types/learning";

export interface ConceptGraphInputNode {
  id: string;
  title: string;
  type: NodeType;
  community: string;
  priority: number;
  prerequisites: string[];
}

export interface DerivedConceptGraphNode extends ConceptGraphInputNode {
  children: string[];
  depth: number;
}

export interface ConceptCommunityView {
  id: string;
  name: string;
  priority: number;
  node_ids: string[];
}

export interface DerivedConceptGraphView {
  nodes: DerivedConceptGraphNode[];
  recommended_order: string[];
  communities: ConceptCommunityView[];
  /**
   * Phase 13: prerequisite 외 관계까지 보존한 edge 목록(뷰의 추가 정보).
   *
   * 중요: depth·children·recommended_order는 여전히 prerequisite만으로 계산한다(하위 호환).
   * 이 `edges`는 위상 계산에 전혀 쓰이지 않고, UI hover 근거·cross-community 식별의 입력으로만 쓴다.
   * 양끝이 실제 노드 id가 아닌 edge는 잡음이므로 걸러서 담는다.
   */
  edges: LearningEdgeQuality[];
}

function communityId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "") || "general";
}

function assertValidRefs(nodes: ConceptGraphInputNode[]): Map<string, ConceptGraphInputNode> {
  const byId = new Map<string, ConceptGraphInputNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`duplicate concept id: ${node.id}`);
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    for (const prerequisite of node.prerequisites) {
      if (!byId.has(prerequisite)) {
        throw new Error(`unknown prerequisite id: ${prerequisite}`);
      }
    }
  }
  return byId;
}

function deriveDepths(nodes: ConceptGraphInputNode[]): Map<string, number> {
  const byId = assertValidRefs(nodes);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const depths = new Map<string, number>();

  const visit = (id: string): number => {
    const cached = depths.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) throw new Error(`prerequisite cycle detected at ${id}`);
    if (visited.has(id)) return depths.get(id) ?? 0;

    const node = byId.get(id);
    if (!node) throw new Error(`unknown concept id: ${id}`);

    visiting.add(id);
    const depth =
      node.prerequisites.length === 0 ? 0
      : Math.max(...node.prerequisites.map((prerequisite) => visit(prerequisite))) + 1;
    visiting.delete(id);
    visited.add(id);
    depths.set(id, depth);
    return depth;
  };

  for (const node of nodes) visit(node.id);
  return depths;
}

export function deriveLearningGraphView(
  nodes: ConceptGraphInputNode[],
  edges: LearningEdgeQuality[] = [],
): DerivedConceptGraphView {
  assertValidRefs(nodes);
  const depths = deriveDepths(nodes);
  const childrenById = new Map<string, string[]>(
    nodes.map((node) => [node.id, []]),
  );

  for (const node of nodes) {
    for (const prerequisite of node.prerequisites) {
      childrenById.get(prerequisite)?.push(node.id);
    }
  }

  const priorityById = new Map(nodes.map((node) => [node.id, node.priority]));
  for (const children of childrenById.values()) {
    children.sort((a, b) => (priorityById.get(a) ?? 0) - (priorityById.get(b) ?? 0));
  }

  const derivedNodes = nodes
    .map((node): DerivedConceptGraphNode => ({
      ...node,
      community: node.community.trim() || "기본 개념",
      priority: Number.isFinite(node.priority) ? node.priority : 999,
      children: childrenById.get(node.id) ?? [],
      depth: depths.get(node.id) ?? 0,
    }))
    .sort((a, b) => a.depth - b.depth || a.priority - b.priority || a.title.localeCompare(b.title));

  const communityMap = new Map<string, ConceptCommunityView>();
  for (const node of derivedNodes) {
    const name = node.community.trim() || "기본 개념";
    const id = communityId(name);
    const current = communityMap.get(id);
    if (current) {
      current.priority = Math.min(current.priority, node.priority);
      current.node_ids.push(node.id);
    } else {
      communityMap.set(id, {
        id,
        name,
        priority: node.priority,
        node_ids: [node.id],
      });
    }
  }

  const communities = [...communityMap.values()].sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );

  // Phase 13: 양끝이 모두 실제 노드인 edge만 보존한다(위상 계산엔 영향 없음).
  const nodeIds = new Set(nodes.map((node) => node.id));
  const preservedEdges = edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );

  return {
    nodes: derivedNodes,
    recommended_order: derivedNodes.map((node) => node.id),
    communities,
    edges: preservedEdges,
  };
}
