import { clampScore, convertScoreToStatus } from "@/lib/learning/mastery";
import type { NodeType, ProgressStatus } from "@/types/learning";

export interface PersonalizedNodeInput {
  nodeId: string;
  nodeKey: string;
  title: string;
  type: NodeType | string;
  difficulty: number;
  prerequisites: string[];
  conceptId: string | null;
  importance?: number | null;
}

export interface PersonalizedMasteryState {
  status: ProgressStatus;
  confidenceScore: number;
  lastStudiedAt?: Date | string | null;
  lastQuizScore?: number | null;
  wrongCount?: number;
  correctCount?: number;
  needsReview?: boolean;
}

export interface PersonalizedScoringContext {
  now?: Date;
  prerequisiteGap?: number;
  importance?: number;
}

export interface PersonalizedNodeResult {
  node_id: string;
  concept_id: string | null;
  title: string;
  status: ProgressStatus;
  confidence_score: number;
  recommendation_score: number;
  is_recommended: boolean;
  reasons: string[];
}

export interface PersonalizedRecommendationResult {
  node_id: string;
  concept_id: string | null;
  title: string;
  score: number;
  reasons: string[];
}

const DEFAULT_MASTERY: PersonalizedMasteryState = {
  status: "unknown",
  confidenceScore: 0.1,
  lastStudiedAt: null,
  lastQuizScore: null,
  wrongCount: 0,
  correctCount: 0,
  needsReview: true,
};

function masteryForNode(
  node: PersonalizedNodeInput,
  masteryByConceptId: Map<string, PersonalizedMasteryState>,
): PersonalizedMasteryState {
  if (!node.conceptId) return DEFAULT_MASTERY;
  return masteryByConceptId.get(node.conceptId) ?? DEFAULT_MASTERY;
}

function isMastered(mastery: PersonalizedMasteryState): boolean {
  return mastery.status === "known" && mastery.confidenceScore >= 0.75;
}

function recencyDecayScore(
  lastStudiedAt: Date | string | null | undefined,
  now: Date,
): number {
  if (!lastStudiedAt) return 0.5;
  const studiedAt =
    lastStudiedAt instanceof Date ? lastStudiedAt : new Date(lastStudiedAt);
  const days = Math.max(
    0,
    (now.getTime() - studiedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days >= 14) return 1;
  if (days >= 7) return 0.6;
  if (days >= 1) return 0.2;
  return 0;
}

function quizErrorScore(mastery: PersonalizedMasteryState): number {
  const wrong = mastery.wrongCount ?? 0;
  const correct = mastery.correctCount ?? 0;
  if (wrong + correct > 0) return clampScore(wrong / (wrong + correct));
  if (typeof mastery.lastQuizScore === "number") {
    return clampScore(1 - mastery.lastQuizScore);
  }
  return 0;
}

function defaultImportance(node: PersonalizedNodeInput): number {
  if (typeof node.importance === "number") return clampScore(node.importance);
  if (node.type === "core" || node.type === "document_core") return 0.8;
  if (node.type === "prerequisite") return 0.7;
  return 0.5;
}

export function calculateNodeRecommendationScore(
  node: PersonalizedNodeInput,
  mastery: PersonalizedMasteryState,
  context?: PersonalizedScoringContext,
): number {
  const prerequisiteGap = clampScore(context?.prerequisiteGap ?? 0);
  const lowConfidence = 1 - clampScore(mastery.confidenceScore);
  const quizError = quizErrorScore(mastery);
  const recencyDecay = recencyDecayScore(
    mastery.lastStudiedAt,
    context?.now ?? new Date(),
  );
  const importance = context?.importance ?? defaultImportance(node);

  return clampScore(
    prerequisiteGap * 0.35 +
      lowConfidence * 0.25 +
      quizError * 0.15 +
      recencyDecay * 0.15 +
      importance * 0.1,
  );
}

function prerequisiteGapForNode(
  node: PersonalizedNodeInput,
  nodeByKey: Map<string, PersonalizedNodeInput>,
  masteryByConceptId: Map<string, PersonalizedMasteryState>,
): number {
  if (node.prerequisites.length === 0) return 0;
  const unmet = node.prerequisites.filter((key) => {
    const prerequisite = nodeByKey.get(key);
    if (!prerequisite) return true;
    return !isMastered(masteryForNode(prerequisite, masteryByConceptId));
  });
  return unmet.length / node.prerequisites.length;
}

function collectActionableCandidateKeys(
  node: PersonalizedNodeInput,
  nodeByKey: Map<string, PersonalizedNodeInput>,
  masteryByConceptId: Map<string, PersonalizedMasteryState>,
  seen: Set<string>,
): string[] {
  if (seen.has(node.nodeKey)) return [];
  seen.add(node.nodeKey);

  const unmetPrerequisites = node.prerequisites
    .map((key) => nodeByKey.get(key))
    .filter((prerequisite): prerequisite is PersonalizedNodeInput => {
      if (!prerequisite) return false;
      return !isMastered(masteryForNode(prerequisite, masteryByConceptId));
    });

  if (unmetPrerequisites.length === 0) return [node.nodeKey];

  return unmetPrerequisites.flatMap((prerequisite) =>
    collectActionableCandidateKeys(
      prerequisite,
      nodeByKey,
      masteryByConceptId,
      new Set(seen),
    ),
  );
}

function generateRecommendationReasons(input: {
  node: PersonalizedNodeInput;
  mastery: PersonalizedMasteryState;
  prerequisiteGap: number;
  now: Date;
}): string[] {
  const reasons: string[] = [];
  if (input.prerequisiteGap > 0) {
    reasons.push("이후 개념으로 넘어가기 전에 비어 있는 선수지식을 먼저 채워야 합니다.");
  }
  if (input.mastery.status === "unknown") {
    reasons.push("현재 이해 상태가 아직 모름으로 기록되어 있습니다.");
  } else if (input.mastery.status === "partial") {
    reasons.push("이전에 조금 안다로 표시해 짧은 복습 효과가 큽니다.");
  }
  if (input.mastery.confidenceScore < 0.5) {
    reasons.push("confidence_score가 낮아 다음 학습 전에 보강이 필요합니다.");
  }
  if ((input.mastery.wrongCount ?? 0) > 0) {
    reasons.push("최근 관련 오답 기록이 있어 같은 실수를 줄이는 데 도움이 됩니다.");
  }
  if (recencyDecayScore(input.mastery.lastStudiedAt, input.now) >= 0.6) {
    reasons.push("마지막 학습 이후 시간이 지나 복습 우선순위가 올라갔습니다.");
  }
  if (input.node.type === "core" || input.node.type === "document_core") {
    reasons.push("현재 학습 트리의 핵심 개념으로 이어지는 단계입니다.");
  } else if (input.node.type === "prerequisite") {
    reasons.push("핵심 개념을 이해하기 위한 선수지식입니다.");
  }

  return reasons.slice(0, 4);
}

export function recommendPersonalizedNodes(
  nodes: PersonalizedNodeInput[],
  masteryByConceptId: Map<string, PersonalizedMasteryState>,
  options?: { now?: Date; limit?: number },
): PersonalizedRecommendationResult[] {
  const now = options?.now ?? new Date();
  const nodeByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  const candidateKeys = new Set<string>();

  for (const node of nodes) {
    if (isMastered(masteryForNode(node, masteryByConceptId))) continue;
    for (const key of collectActionableCandidateKeys(
      node,
      nodeByKey,
      masteryByConceptId,
      new Set(),
    )) {
      candidateKeys.add(key);
    }
  }

  return [...candidateKeys]
    .map((key) => nodeByKey.get(key))
    .filter((node): node is PersonalizedNodeInput => Boolean(node))
    .filter((node) => !isMastered(masteryForNode(node, masteryByConceptId)))
    .map((node) => {
      const mastery = masteryForNode(node, masteryByConceptId);
      const prerequisiteGap = prerequisiteGapForNode(
        node,
        nodeByKey,
        masteryByConceptId,
      );
      const score = calculateNodeRecommendationScore(node, mastery, {
        now,
        prerequisiteGap,
      });
      return {
        node_id: node.nodeId,
        concept_id: node.conceptId,
        title: node.title,
        score,
        reasons: generateRecommendationReasons({
          node,
          mastery,
          prerequisiteGap,
          now,
        }),
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, options?.limit ?? 5);
}

export function buildPersonalizedNodes(
  nodes: PersonalizedNodeInput[],
  masteryByConceptId: Map<string, PersonalizedMasteryState>,
  options?: { now?: Date; recommendedLimit?: number },
): PersonalizedNodeResult[] {
  const now = options?.now ?? new Date();
  const nodeByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  const recommended = recommendPersonalizedNodes(nodes, masteryByConceptId, {
    now,
    limit: options?.recommendedLimit ?? 5,
  });
  const recommendedIds = new Set(recommended.map((node) => node.node_id));
  const recommendationById = new Map(
    recommended.map((node) => [node.node_id, node]),
  );

  return nodes.map((node) => {
    const mastery = masteryForNode(node, masteryByConceptId);
    const prerequisiteGap = prerequisiteGapForNode(
      node,
      nodeByKey,
      masteryByConceptId,
    );
    const score =
      recommendationById.get(node.nodeId)?.score ??
      calculateNodeRecommendationScore(node, mastery, {
        now,
        prerequisiteGap,
      });
    return {
      node_id: node.nodeId,
      concept_id: node.conceptId,
      title: node.title,
      status: mastery.status ?? convertScoreToStatus(mastery.confidenceScore),
      confidence_score: mastery.confidenceScore,
      recommendation_score: score,
      is_recommended: recommendedIds.has(node.nodeId),
      reasons:
        recommendationById.get(node.nodeId)?.reasons ??
        generateRecommendationReasons({
          node,
          mastery,
          prerequisiteGap,
          now,
        }),
    };
  });
}
