import type { ApiRecommendationItem } from "@/types/learning";
import type { NodeType, ProgressStatus } from "@/types/learning";

export interface RecommendNodeInput {
  id: string;
  node_key: string;
  title: string;
  type: NodeType;
  difficulty: number;
  prerequisites: string[];
}

function byDifficultyAsc(a: RecommendNodeInput, b: RecommendNodeInput): number {
  return a.difficulty - b.difficulty;
}

/**
 * 명세 §8 규칙 기반 추천 (supplementary는 우선순위에 없어 후순위로만 포함)
 */
export function recommendNextNodes(
  nodes: RecommendNodeInput[],
  progressByNodeId: Map<string, ProgressStatus>,
): ApiRecommendationItem[] {
  const keyToId = Object.fromEntries(nodes.map((n) => [n.node_key, n.id]));

  function statusForKey(key: string): ProgressStatus {
    const id = keyToId[key];
    return id ? (progressByNodeId.get(id) ?? "unknown") : "unknown";
  }

  function prereqsAllKnown(keys: string[]): boolean {
    return keys.every((k) => statusForKey(k) === "known");
  }

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

  const preUnk = nodes.filter(
    (n) => n.type === "prerequisite" && progressByNodeId.get(n.id) === "unknown",
  );
  if (preUnk.length) {
    return mapReason(
      [...preUnk].sort(byDifficultyAsc),
      "아직 다루지 않은 선수지식부터 잡으면 이후 학습이 수월합니다.",
    );
  }

  const prePart = nodes.filter(
    (n) =>
      n.type === "prerequisite" && progressByNodeId.get(n.id) === "partial",
  );
  if (prePart.length) {
    return mapReason(
      [...prePart].sort(byDifficultyAsc),
      "선수지식을 한 번 더 정리하면 핵심 개념으로 넘어가기 좋습니다.",
    );
  }

  const coreCand = nodes.filter(
    (n) => n.type === "core" && progressByNodeId.get(n.id) === "unknown",
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
      n.type === "supplementary" && progressByNodeId.get(n.id) === "unknown",
  );
  if (supUnk.length && coreCand.length === 0) {
    return mapReason(
      [...supUnk].sort(byDifficultyAsc),
      "여유가 있다면 부가 개념으로 시야를 넓혀 보세요.",
    );
  }

  const coreKnown = nodes.some(
    (n) => n.type === "core" && progressByNodeId.get(n.id) === "known",
  );
  const noCoreUnknown = !nodes.some(
    (n) => n.type === "core" && progressByNodeId.get(n.id) === "unknown",
  );
  const mis = nodes.filter(
    (n) =>
      n.type === "misconception" &&
      progressByNodeId.get(n.id) === "unknown" &&
      (coreKnown || noCoreUnknown),
  );
  if (mis.length) {
    return mapReason(
      mis,
      "핵심 개념을 다룬 뒤 흔한 오해를 바로잡으면 이해가 단단해집니다.",
    );
  }

  const quiz = nodes.filter(
    (n) => n.type === "quiz" && progressByNodeId.get(n.id) === "unknown",
  );
  if (quiz.length) {
    return mapReason(
      [...quiz].sort(byDifficultyAsc),
      "배운 내용을 짧게 점검해 볼 차례입니다.",
    );
  }

  return [];
}
