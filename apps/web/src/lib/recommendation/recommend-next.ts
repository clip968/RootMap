import type { ApiRecommendationItem } from "@/types/learning";
import type {
  DocumentNodeType,
  DocumentSourceType,
  NodeType,
  ProgressStatus,
} from "@/types/learning";

export interface RecommendNodeInput {
  id: string;
  node_key: string;
  title: string;
  type: NodeType | DocumentNodeType;
  difficulty: number;
  prerequisites: string[];
  source_type?: DocumentSourceType;
  document_type?: DocumentNodeType;
  recommended_order_index?: number;
}

export interface RecommendNextOptions {
  nodeConceptIds?: Map<string, string>;
  conceptProgress?: Map<string, ProgressStatus>;
}

function byDifficultyAsc(a: RecommendNodeInput, b: RecommendNodeInput): number {
  return a.difficulty - b.difficulty;
}

function byDocumentOrderThenDifficulty(
  a: RecommendNodeInput,
  b: RecommendNodeInput,
): number {
  const orderA = a.recommended_order_index ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.recommended_order_index ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return byDifficultyAsc(a, b);
}

/**
 * 명세 §8 규칙 기반 추천 (supplementary는 우선순위에 없어 후순위로만 포함)
 * Phase 2: 노드가 unknown이면 같은 Concept의 타 트리 진행을 추론에 반영한다.
 * Phase 3: 문서 트리는 inferred prerequisite → explicit prerequisite → document_core 순으로 추천한다.
 */
export function recommendNextNodes(
  nodes: RecommendNodeInput[],
  progressByNodeId: Map<string, ProgressStatus>,
  opts?: RecommendNextOptions,
): ApiRecommendationItem[] {
  const conceptProgress = opts?.conceptProgress;
  const nodeConceptIds = opts?.nodeConceptIds;

  function effectiveStatus(nodeId: string): ProgressStatus {
    const direct = progressByNodeId.get(nodeId) ?? "unknown";
    if (direct !== "unknown") return direct;
    const cid = nodeConceptIds?.get(nodeId);
    if (cid == null) return "unknown";
    return conceptProgress?.get(cid) ?? "unknown";
  }

  const keyToId = Object.fromEntries(nodes.map((n) => [n.node_key, n.id]));

  function statusForKey(key: string): ProgressStatus {
    const id = keyToId[key];
    return id ? effectiveStatus(id) : "unknown";
  }

  function prereqsAllKnown(keys: string[]): boolean {
    return keys.every((k) => statusForKey(k) === "known");
  }

  function documentType(node: RecommendNodeInput): DocumentNodeType | null {
    if (node.document_type) return node.document_type;
    if (node.type === "document_core") return "document_core";
    if (
      node.source_type &&
      ["prerequisite", "supplementary", "misconception", "quiz"].includes(
        node.type,
      )
    ) {
      return node.type as DocumentNodeType;
    }
    return null;
  }

  const isDocumentTree = nodes.some((n) => documentType(n) != null);

  function mapReason(
    list: RecommendNodeInput[],
    reason: string,
  ): ApiRecommendationItem[] {
    return list.map((n) => ({
      node_id: n.id,
      title: n.title,
      reason,
    }));
  }

  if (isDocumentTree) {
    const inferredUnknownPrereqs = nodes.filter(
      (n) =>
        documentType(n) === "prerequisite" &&
        n.source_type === "inferred" &&
        effectiveStatus(n.id) === "unknown",
    );
    if (inferredUnknownPrereqs.length) {
      return mapReason(
        [...inferredUnknownPrereqs].sort(byDifficultyAsc),
        "문서 이해를 위해 먼저 채워야 하는 추론된 선수지식입니다.",
      );
    }

    const explicitUnknownPrereqs = nodes.filter(
      (n) =>
        documentType(n) === "prerequisite" &&
        n.source_type !== "inferred" &&
        effectiveStatus(n.id) === "unknown",
    );
    if (explicitUnknownPrereqs.length) {
      return mapReason(
        [...explicitUnknownPrereqs].sort(byDocumentOrderThenDifficulty),
        "문서에 직접 등장한 선수지식을 먼저 정리하면 핵심 개념으로 넘어가기 좋습니다.",
      );
    }

    const partialPrereqs = nodes.filter(
      (n) =>
        documentType(n) === "prerequisite" &&
        effectiveStatus(n.id) === "partial",
    );
    if (partialPrereqs.length) {
      return mapReason(
        [...partialPrereqs].sort(byDocumentOrderThenDifficulty),
        "문서 핵심 개념으로 넘어가기 전에 선수지식을 한 번 더 정리해 보세요.",
      );
    }

    const readyCore = nodes.filter(
      (n) =>
        documentType(n) === "document_core" &&
        effectiveStatus(n.id) === "unknown" &&
        prereqsAllKnown(n.prerequisites),
    );
    if (readyCore.length) {
      return mapReason(
        [...readyCore].sort(byDocumentOrderThenDifficulty),
        "필요한 선수지식이 갖춰져 있어, 문서의 핵심 개념을 학습할 차례입니다.",
      );
    }

    const knownCore = nodes.some(
      (n) =>
        documentType(n) === "document_core" &&
        effectiveStatus(n.id) === "known",
    );
    const noUnknownCore = !nodes.some(
      (n) =>
        documentType(n) === "document_core" &&
        effectiveStatus(n.id) === "unknown",
    );
    const misconceptionReady = nodes.filter(
      (n) =>
        documentType(n) === "misconception" &&
        effectiveStatus(n.id) === "unknown" &&
        (prereqsAllKnown(n.prerequisites) || knownCore || noUnknownCore),
    );
    if (misconceptionReady.length) {
      return mapReason(
        [...misconceptionReady].sort(byDocumentOrderThenDifficulty),
        "문서 핵심 개념을 다룬 뒤 연결된 오개념을 바로잡으면 이해가 단단해집니다.",
      );
    }

    const quiz = nodes.filter(
      (n) =>
        documentType(n) === "quiz" && effectiveStatus(n.id) === "unknown",
    );
    if (quiz.length) {
      return mapReason(
        [...quiz].sort(byDocumentOrderThenDifficulty),
        "문서 이해도를 짧게 점검해 볼 차례입니다.",
      );
    }

    return [];
  }

  const preUnk = nodes.filter(
    (n) => n.type === "prerequisite" && effectiveStatus(n.id) === "unknown",
  );
  if (preUnk.length) {
    return mapReason(
      [...preUnk].sort(byDifficultyAsc),
      "아직 다루지 않은 선수지식부터 잡으면 이후 학습이 수월합니다.",
    );
  }

  const prePart = nodes.filter(
    (n) =>
      n.type === "prerequisite" && effectiveStatus(n.id) === "partial",
  );
  if (prePart.length) {
    return mapReason(
      [...prePart].sort(byDifficultyAsc),
      "선수지식을 한 번 더 정리하면 핵심 개념으로 넘어가기 좋습니다.",
    );
  }

  const coreCand = nodes.filter(
    (n) => n.type === "core" && effectiveStatus(n.id) === "unknown",
  );
  const coreReady = coreCand.filter((n) => prereqsAllKnown(n.prerequisites));
  if (coreReady.length) {
    const sorted = [...coreReady].sort(byDifficultyAsc);
    return mapReason(
      sorted,
      "필요한 선수지식이 갖춰져 있어, 핵심 개념을 학습할 차례입니다.",
    );
  }

  const supUnk = nodes.filter(
    (n) =>
      n.type === "supplementary" && effectiveStatus(n.id) === "unknown",
  );
  if (supUnk.length && coreCand.length === 0) {
    return mapReason(
      [...supUnk].sort(byDifficultyAsc),
      "여유가 있다면 부가 개념으로 시야를 넓혀 보세요.",
    );
  }

  const coreKnown = nodes.some(
    (n) => n.type === "core" && effectiveStatus(n.id) === "known",
  );
  const noCoreUnknown = !nodes.some(
    (n) => n.type === "core" && effectiveStatus(n.id) === "unknown",
  );
  const mis = nodes.filter(
    (n) =>
      n.type === "misconception" &&
      effectiveStatus(n.id) === "unknown" &&
      (coreKnown || noCoreUnknown),
  );
  if (mis.length) {
    return mapReason(
      mis,
      "핵심 개념을 다룬 뒤 흔한 오해를 바로잡으면 이해가 단단해집니다.",
    );
  }

  const quiz = nodes.filter(
    (n) => n.type === "quiz" && effectiveStatus(n.id) === "unknown",
  );
  if (quiz.length) {
    return mapReason(
      [...quiz].sort(byDifficultyAsc),
      "배운 내용을 짧게 점검해 볼 차례입니다.",
    );
  }

  return [];
}
