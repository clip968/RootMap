/**
 * Phase 12 — 학습 트리 품질 평가(tree eval) 레이어.
 *
 * 이 모듈의 목적은 "생성된 학습 트리가 좋은가?"를 사람이 만든 골든 픽스처
 * (`evals/fixtures/topics/`) 기준으로 **결정적(LLM 무호출) 규칙**으로 채점하는 것이다.
 *
 * 명세 출처: `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.
 *
 * 핵심 설계 원칙
 * - 모든 점수는 0~1로 정규화한다(`clampScore` 규약, `lib/learning/mastery.ts`).
 * - 개념 매칭은 신규 정규화를 만들지 않고 `lib/concepts/normalize.ts`를 재사용한다.
 * - 위상(ordering) 판정은 `deriveLearningGraphView`(`lib/tree/concept-graph.ts`)의
 *   depth 위상 순서를 기준으로 한다.
 * - LLM judge는 쓰지 않는다. `evaluateEvidenceGrounding`의 어휘 겹침과 같은 철학이다.
 * - 같은 입력에는 항상 같은 결과를 낸다(순수 함수).
 */

import type {
  LearningTreeNode,
  LearningTreeResponse,
  NodeType,
} from "@/types/learning";
import { normalizeTitle } from "@/lib/concepts/normalize";
import { clampScore } from "@/lib/learning/mastery";
import {
  deriveLearningGraphView,
  type ConceptGraphInputNode,
} from "@/lib/tree/concept-graph";

// ──────────────────────────────────────────────
// 1. 타입 계약 (Phase 12 Task 00)
// ──────────────────────────────────────────────

/** 골든 픽스처의 선수/금지 관계 한 쌍. `from`이 `to`의 prerequisite다. */
export interface TreeEvalFixtureEdge {
  /** 선수 개념(먼저 학습해야 하는 쪽). */
  from: string;
  /** 의존 개념(나중에 학습하는 쪽). */
  to: string;
  /** 왜 이 관계가 성립/금지인지에 대한 사람이 읽는 사유. */
  reason: string;
}

/**
 * 사람이 만든 골든 주제 픽스처. 트리 생성 결과를 채점할 때의 "정답 기준"이다.
 * 명세 §1.2와 동일한 형태를 따른다.
 */
export interface TreeEvalFixture {
  /** 주제명(예: "가상 메모리"). 트리의 topic 필드와 비교된다. */
  topic: string;
  /** 트리에 반드시 있어야 하는 핵심 개념(노드 title/alias로 매칭). */
  expected_concepts: string[];
  /** 반드시 성립해야 하는 선수관계(`from`이 `to`의 prerequisite). */
  required_edges: TreeEvalFixtureEdge[];
  /** 절대 나오면 안 되는 역방향/오류 선수관계. */
  forbidden_edges: TreeEvalFixtureEdge[];
  /** 초심자가 자주 하는 오개념(현재는 참고용, 후속 phase에서 채점에 활용). */
  beginner_misconceptions: string[];
  /** 이해를 돕는 핵심 예시(현재는 참고용, 후속 phase에서 채점에 활용). */
  required_examples: string[];
}

/** 실패 항목의 심각도. `error`는 CI 비정상 종료를 유발한다. */
export type TreeEvalFailureSeverity = "error" | "warn";

/**
 * 구조화된 실패 항목. 기존 `learningTreeQualityWarnings`의 자유 문자열 경고를
 * 안정적인 `code`와 `severity`를 가진 형태로 승격한 것이다(명세 §1.5).
 */
export interface TreeEvalFailure {
  severity: TreeEvalFailureSeverity;
  /** 기계가 분기할 수 있는 안정적 코드(예: "FORBIDDEN_EDGE"). */
  code: string;
  /** 관련 노드가 있으면 해당 노드 id. */
  node_id?: string;
  /** 사람이 읽는 설명. */
  message: string;
}

/**
 * 트리 한 개에 대한 평가 결과. 5개 점수는 모두 0~1이다(명세 §1.3).
 */
export interface TreeEvalResult {
  /** 핵심 개념이 빠지지 않았는가. */
  coverage_score: number;
  /** 선수관계 방향이 맞는가(required 충족 − forbidden 위반). */
  prerequisite_score: number;
  /** 학습 목표·오개념·퀴즈 등 교육적 장치가 갖춰졌는가. */
  pedagogy_score: number;
  /** recommended_order가 위상 순서를 위반하지 않는가. */
  ordering_score: number;
  /** 노드 상세 설명이 자기완결적인가. */
  detail_score: number;
  /** 누적된 실패/경고 목록. */
  failures: TreeEvalFailure[];
}

// ──────────────────────────────────────────────
// 2. 개념 매칭 헬퍼 (normalize.ts 재사용)
// ──────────────────────────────────────────────

/** 노드 id 쌍을 Set의 key로 만들 때 쓰는 구분자(개념 이름에 등장하지 않는 NUL). */
const PAIR_SEPARATOR = "\u0000";

function pairKey(prerequisiteId: string, dependentId: string): string {
  return `${prerequisiteId}${PAIR_SEPARATOR}${dependentId}`;
}

/**
 * 한 노드가 가질 수 있는 모든 표기(title + concept_candidate.canonical_title + aliases)를
 * 정규화해 반환한다. 빈 문자열은 제거한다.
 */
function nodeLabels(node: LearningTreeNode): string[] {
  const labels: string[] = [normalizeTitle(node.title)];
  const candidate = node.concept_candidate;
  if (candidate) {
    if (candidate.canonical_title) {
      labels.push(normalizeTitle(candidate.canonical_title));
    }
    for (const alias of candidate.aliases ?? []) {
      labels.push(normalizeTitle(alias));
    }
  }
  return labels.filter((label) => label.length > 0);
}

/**
 * 정규화된 개념명이 노드 라벨과 어떤 강도로 매칭되는지 판정하는 세 가지 술어.
 *
 * 매칭은 "구체적인 것 우선" 원칙을 따른다. 더 긴(구체적인) 개념이 더 짧은(일반적인)
 * 노드 라벨에 매칭되면 안 된다. 예: 개념 "multi-head attention"은 노드 "attention"에
 * 매칭되면 안 되고, 노드 "multi-head attention"에만 매칭돼야 한다.
 * 그래서 "개념이 라벨을 포함" 방향은 일부러 쓰지 않는다(오탐의 주원인).
 */

/** 1) 완전 일치. */
function labelExactlyMatches(normalizedConcept: string, normalizedLabel: string): boolean {
  return normalizedConcept.length > 0 && normalizedConcept === normalizedLabel;
}

/**
 * 2) 노드 라벨이 개념을 통째(공백 경계)로 포함한다.
 * 예: 노드 "virtual address translation"은 개념 "virtual address"를 포함 → 매칭.
 * (노드가 개념보다 같거나 더 구체적인 경우만 허용한다.)
 */
function labelContainsConcept(normalizedConcept: string, normalizedLabel: string): boolean {
  if (!normalizedConcept || !normalizedLabel) return false;
  return ` ${normalizedLabel} `.includes(` ${normalizedConcept} `);
}

/**
 * 3) 개념의 모든 토큰이 한 라벨의 토큰 집합에 포함된다(어순·부가어 차이 허용).
 * 예: 개념 "address translation"은 노드 "virtual address translation"에 매칭.
 * 단, 개념 토큰이 라벨 토큰의 부분집합일 때만 매칭되므로
 * "multi-head attention"(2토큰)은 "attention"(1토큰)에 매칭되지 않는다.
 */
function labelTokenSuperset(normalizedConcept: string, normalizedLabel: string): boolean {
  const conceptTokens = normalizedConcept.split(" ").filter(Boolean);
  if (conceptTokens.length === 0) return false;
  const labelTokens = new Set(normalizedLabel.split(" ").filter(Boolean));
  return conceptTokens.every((token) => labelTokens.has(token));
}

/**
 * 주어진 개념명과 매칭되는 노드 id를 반환한다(없으면 null).
 *
 * 노드 순서가 아니라 "매칭 강도"가 우선이다. 완전 일치를 가장 먼저 찾고,
 * 그다음 라벨-포함, 마지막으로 토큰-부분집합 순으로 본다. 이렇게 하면
 * 노드 배열 순서와 무관하게 가장 구체적인 노드를 결정적으로 고른다.
 */
function findNodeIdForConcept(
  concept: string,
  tree: LearningTreeResponse,
): string | null {
  const normalizedConcept = normalizeTitle(concept);
  if (!normalizedConcept) return null;

  const labelsByNode = tree.nodes.map((node) => ({
    id: node.id,
    labels: nodeLabels(node),
  }));

  // 강도 높은 술어부터 순서대로 전체 노드를 훑는다.
  const predicates = [labelExactlyMatches, labelContainsConcept, labelTokenSuperset];
  for (const predicate of predicates) {
    for (const { id, labels } of labelsByNode) {
      if (labels.some((label) => predicate(normalizedConcept, label))) {
        return id;
      }
    }
  }
  return null;
}

/**
 * 트리에 존재하는 모든 선수관계 쌍 (prerequisiteId → dependentId)을 모은다.
 * 두 출처를 합친다.
 * - `node.prerequisites`: B.prerequisites가 A를 포함하면 (A, B). (A가 B의 선수)
 * - `tree.edges` 중 relation_type === "prerequisite": (edge.from, edge.to).
 *   (코드 규약상 prerequisite edge는 from이 선수, to가 이후 — concept-persistence.ts 참고)
 */
function buildPrerequisitePairs(tree: LearningTreeResponse): Set<string> {
  const pairs = new Set<string>();
  const ids = new Set(tree.nodes.map((node) => node.id));

  for (const node of tree.nodes) {
    for (const prerequisite of node.prerequisites) {
      if (ids.has(prerequisite)) {
        pairs.add(pairKey(prerequisite, node.id));
      }
    }
  }

  for (const edge of tree.edges ?? []) {
    if (
      edge.relation_type === "prerequisite" &&
      ids.has(edge.from) &&
      ids.has(edge.to)
    ) {
      pairs.add(pairKey(edge.from, edge.to));
    }
  }

  return pairs;
}

/** LearningTreeNode[] → deriveLearningGraphView가 받는 입력 형태로 변환한다. */
function toGraphInput(nodes: LearningTreeNode[]): ConceptGraphInputNode[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    type: node.type,
    community: node.community?.trim() || "기본 개념",
    priority: Number.isFinite(node.priority) ? (node.priority as number) : 999,
    prerequisites: node.prerequisites,
  }));
}

/** Phase 14 의존 필드(learning_objective 등)를 타입 깨짐 없이 안전하게 읽는다. */
function readOptionalField(node: LearningTreeNode, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

// ──────────────────────────────────────────────
// 3. 기존 품질 경고 → 구조화 실패 (Phase 12 Task 03)
// ──────────────────────────────────────────────

/**
 * 기존 `learningTreeQualityWarnings`(string[] 경고)와 동일한 검사를 수행하되,
 * 안정적인 `code`를 가진 `TreeEvalFailure[]`(모두 warn)로 반환한다.
 *
 * 하위 호환: `learningTreeQualityWarnings`는 이 함수에 위임하고 `message`만 추출하므로
 * 메시지 문자열과 순서가 기존과 100% 동일하게 유지된다(트리 생성 응답/로그 회귀 방지).
 * 그래서 push 순서를 기존 구현과 똑같이 맞췄다.
 */
export function collectTreeQualityFailures(
  tree: LearningTreeResponse,
  inputTopic: string,
): TreeEvalFailure[] {
  const failures: TreeEvalFailure[] = [];
  const nodeCount = tree.nodes.length;

  if (nodeCount < 8 || nodeCount > 20) {
    failures.push({
      severity: "warn",
      code: "NODE_COUNT_OUT_OF_RANGE",
      message: `노드 수(${nodeCount}개)가 권장 범위(8~20)를 벗어났습니다.`,
    });
  }

  const count = (type: NodeType) =>
    tree.nodes.filter((node) => node.type === type).length;

  if (count("prerequisite") < 3) {
    failures.push({
      severity: "warn",
      code: "INSUFFICIENT_PREREQUISITE_NODES",
      message: "선수지식(prerequisite) 노드가 3개 미만입니다.",
    });
  }
  if (count("core") < 3) {
    failures.push({
      severity: "warn",
      code: "INSUFFICIENT_CORE_NODES",
      message: "핵심(core) 노드가 3개 미만입니다.",
    });
  }
  if (count("misconception") < 1) {
    failures.push({
      severity: "warn",
      code: "INSUFFICIENT_MISCONCEPTION_NODES",
      message: "오개념(misconception) 노드가 1개 미만입니다.",
    });
  }
  if (count("quiz") < 2) {
    failures.push({
      severity: "warn",
      code: "INSUFFICIENT_QUIZ_NODES",
      message: "이해 점검(quiz) 노드가 2개 미만입니다.",
    });
  }

  const orderSet = new Set(tree.recommended_order);
  if (orderSet.size !== tree.recommended_order.length) {
    failures.push({
      severity: "warn",
      code: "DUPLICATE_ORDER_ID",
      message: "recommended_order에 중복된 id가 있습니다.",
    });
  }

  const idSet = new Set(tree.nodes.map((node) => node.id));
  for (const id of idSet) {
    if (!tree.recommended_order.includes(id)) {
      failures.push({
        severity: "warn",
        code: "MISSING_ORDER_ID",
        message: "일부 노드 id가 recommended_order에 누락되었습니다.",
      });
      break;
    }
  }

  if (tree.topic.trim() !== inputTopic.trim()) {
    failures.push({
      severity: "warn",
      code: "TOPIC_MISMATCH",
      message: '응답의 "topic" 필드가 입력 주제와 다릅니다.',
    });
  }

  return failures;
}

// ──────────────────────────────────────────────
// 4. 개별 점수 규칙 (Phase 12 Task 02)
// ──────────────────────────────────────────────

/** 상세 설명 자기완결성 휴리스틱에 쓰는 상수들. */
const MIN_DETAIL_LENGTH = 20;
const PLACEHOLDER_PATTERN = /\b(todo|tbd|fixme|xxx|placeholder|lorem ipsum)\b/i;
const KOREAN_PLACEHOLDERS = ["준비 중", "내용 없음", "작성 예정", "추후 작성", "설명 없음"];
const DANGLING_REFERENCES = [
  "위에서 설명",
  "앞서 설명",
  "앞에서 설명",
  "전술한",
  "위 참조",
  "see above",
  "as mentioned above",
];

/**
 * coverage_score: expected_concepts 중 트리 노드에 매칭된 비율.
 * 누락된 개념은 warn(MISSING_CONCEPT)으로 기록한다.
 */
function scoreCoverage(
  tree: LearningTreeResponse,
  fixture: TreeEvalFixture,
  failures: TreeEvalFailure[],
): number {
  const expected = fixture.expected_concepts;
  if (expected.length === 0) return 1;

  let matched = 0;
  for (const concept of expected) {
    if (findNodeIdForConcept(concept, tree) != null) {
      matched += 1;
    } else {
      failures.push({
        severity: "warn",
        code: "MISSING_CONCEPT",
        message: `기대 개념 "${concept}"이(가) 트리에 없습니다.`,
      });
    }
  }
  return clampScore(matched / expected.length);
}

/**
 * prerequisite_score: required_edges 충족과 forbidden_edges 부재를 함께 본다.
 * 점수 = (충족된 required + 올바르게 부재한 forbidden) / (required + forbidden).
 * - required가 반대 방향으로 존재하면 error(REVERSED_PREREQUISITE).
 * - required가 아예 없으면 warn(MISSING_REQUIRED_EDGE).
 * - forbidden이 존재하면 error(FORBIDDEN_EDGE).
 */
function scorePrerequisite(
  tree: LearningTreeResponse,
  fixture: TreeEvalFixture,
  prerequisitePairs: Set<string>,
  failures: TreeEvalFailure[],
): number {
  const { required_edges: required, forbidden_edges: forbidden } = fixture;
  const totalChecks = required.length + forbidden.length;
  if (totalChecks === 0) return 1;

  let good = 0;

  for (const edge of required) {
    const fromId = findNodeIdForConcept(edge.from, tree);
    const toId = findNodeIdForConcept(edge.to, tree);
    if (fromId && toId && prerequisitePairs.has(pairKey(fromId, toId))) {
      good += 1; // 올바른 방향으로 선수관계가 존재
    } else if (fromId && toId && prerequisitePairs.has(pairKey(toId, fromId))) {
      failures.push({
        severity: "error",
        code: "REVERSED_PREREQUISITE",
        message: `선수관계 방향이 뒤집혔습니다: "${edge.from}" → "${edge.to}" (${edge.reason})`,
      });
    } else {
      failures.push({
        severity: "warn",
        code: "MISSING_REQUIRED_EDGE",
        message: `필수 선수관계가 없습니다: "${edge.from}" → "${edge.to}" (${edge.reason})`,
      });
    }
  }

  for (const edge of forbidden) {
    const fromId = findNodeIdForConcept(edge.from, tree);
    const toId = findNodeIdForConcept(edge.to, tree);
    if (fromId && toId && prerequisitePairs.has(pairKey(fromId, toId))) {
      failures.push({
        severity: "error",
        code: "FORBIDDEN_EDGE",
        message: `금지된 선수관계가 있습니다: "${edge.from}" → "${edge.to}" (${edge.reason})`,
      });
    } else {
      good += 1; // 금지 관계가 올바르게 부재
    }
  }

  return clampScore(good / totalChecks);
}

/**
 * ordering_score: recommended_order가 선수관계 위상 순서를 위반하지 않는 비율.
 *
 * `deriveLearningGraphView`의 depth는 항상 depth(선수) < depth(의존)을 만족하므로,
 * "선수 노드가 의존 노드보다 recommended_order에서 앞에 오는가"를 검사하는 것은
 * 곧 depth 위상 순서 위반 여부를 검사하는 것과 같다(명세 의사결정 포인트).
 *
 * 점수 = 1 − (위반 쌍 수 / 검사한 쌍 수). 검사 가능한 쌍이 없으면 1.
 */
function scoreOrdering(
  tree: LearningTreeResponse,
  prerequisitePairs: Set<string>,
  failures: TreeEvalFailure[],
): number {
  const position = new Map<string, number>();
  tree.recommended_order.forEach((id, index) => {
    if (!position.has(id)) position.set(id, index);
  });

  let checked = 0;
  let violations = 0;

  for (const key of prerequisitePairs) {
    const [prerequisiteId, dependentId] = key.split(PAIR_SEPARATOR);
    const prerequisitePos = position.get(prerequisiteId);
    const dependentPos = position.get(dependentId);
    // 둘 중 하나라도 recommended_order에 없으면 순서를 판정할 수 없으므로 건너뛴다
    // (누락 자체는 collectTreeQualityFailures의 MISSING_ORDER_ID가 잡는다).
    if (prerequisitePos == null || dependentPos == null) continue;

    checked += 1;
    if (prerequisitePos >= dependentPos) {
      violations += 1;
      failures.push({
        severity: "warn",
        code: "ORDER_VIOLATION",
        node_id: dependentId,
        message: `recommended_order에서 선수 노드(${prerequisiteId})가 의존 노드(${dependentId})보다 앞서지 않습니다.`,
      });
    }
  }

  if (checked === 0) return 1;
  return clampScore(1 - violations / checked);
}

/**
 * pedagogy_score: 학습 목표·숙달 증거·이해 점검 장치가 갖춰진 정도.
 *
 * learning_objective/mastery_evidence는 Phase 14에서 추가되는 필드다.
 * 명세 의사결정에 따라 "필드가 없으면 0 처리"하지 않는다. 대신:
 * - Phase 14 필드가 트리에 아예 없으면 warn(MISSING_LEARNING_CONTRACT)만 남기고,
 *   해당 항목을 채점 분모에서 제외한다(Phase 간 결합도 최소화).
 * - 오늘 측정 가능한 신호(퀴즈/오개념 노드 존재)로 점수를 구성한다.
 */
function scorePedagogy(
  tree: LearningTreeResponse,
  failures: TreeEvalFailure[],
): number {
  const nodes = tree.nodes;
  const nodeCount = nodes.length;
  const checks: number[] = [];

  // Phase 14 학습 계약 필드가 트리에 존재하는지(=Phase 14 구현 여부) 탐지.
  const hasLearningContractCapability = nodes.some(
    (node) =>
      readOptionalField(node, "learning_objective") !== undefined ||
      readOptionalField(node, "mastery_evidence") !== undefined,
  );

  if (hasLearningContractCapability) {
    // Phase 14가 적용된 트리: 노드별 학습 계약 충족 비율을 채점에 포함한다.
    let withObjective = 0;
    let withEvidence = 0;
    for (const node of nodes) {
      const objective = readOptionalField(node, "learning_objective");
      const evidence = readOptionalField(node, "mastery_evidence");
      const hasObjective = typeof objective === "string" && objective.trim().length > 0;
      const hasEvidence = Array.isArray(evidence) && evidence.length > 0;
      if (hasObjective) withObjective += 1;
      if (hasEvidence) withEvidence += 1;
      if (!hasObjective || !hasEvidence) {
        failures.push({
          severity: "warn",
          code: "MISSING_LEARNING_CONTRACT",
          node_id: node.id,
          message: `노드 "${node.title}"에 learning_objective 또는 mastery_evidence가 없습니다.`,
        });
      }
    }
    checks.push(withObjective / nodeCount);
    checks.push(withEvidence / nodeCount);
  } else {
    // Phase 14 미구현: 0으로 깎지 않고 warn만 남긴 뒤 분모에서 제외한다.
    failures.push({
      severity: "warn",
      code: "MISSING_LEARNING_CONTRACT",
      message:
        "노드에 learning_objective/mastery_evidence가 없습니다(Phase 14 미구현). pedagogy_score는 사용 가능한 신호로만 계산했습니다.",
    });
  }

  // 오늘 측정 가능한 교육적 신호: 이해 점검(quiz)·오개념(misconception) 노드 존재.
  // 가이드라인(quiz>=2, misconception>=1)을 채우면 1.0이 되도록 비율화한다.
  const quizCount = nodes.filter((node) => node.type === "quiz").length;
  const misconceptionCount = nodes.filter((node) => node.type === "misconception").length;
  checks.push(clampScore(quizCount / 2));
  checks.push(clampScore(misconceptionCount / 1));

  if (checks.length === 0) return 0;
  const average = checks.reduce((sum, value) => sum + value, 0) / checks.length;
  return clampScore(average);
}

/**
 * detail_score: 노드 description이 외부 참조 없이 자기완결적인 비율.
 * 휴리스틱(길이·placeholder 부재·"위에서 설명" 같은 dangling 참조 부재)으로 판정한다.
 * (노드 상세 본문은 별도 생성물이므로, 트리 단계에서는 description을 대상으로 본다.)
 */
function scoreDetail(
  tree: LearningTreeResponse,
  failures: TreeEvalFailure[],
): number {
  const nodes = tree.nodes;
  if (nodes.length === 0) return 0;

  let selfContained = 0;
  for (const node of nodes) {
    const text = (node.description ?? "").trim();
    const lowered = text.toLowerCase();

    if (text.length < MIN_DETAIL_LENGTH) {
      failures.push({
        severity: "warn",
        code: "DETAIL_TOO_SHORT",
        node_id: node.id,
        message: `노드 "${node.title}" 설명이 너무 짧아 자기완결적이지 않습니다(${text.length}자).`,
      });
      continue;
    }
    if (
      PLACEHOLDER_PATTERN.test(text) ||
      KOREAN_PLACEHOLDERS.some((token) => lowered.includes(token.toLowerCase()))
    ) {
      failures.push({
        severity: "warn",
        code: "DETAIL_PLACEHOLDER",
        node_id: node.id,
        message: `노드 "${node.title}" 설명에 미완성 placeholder가 있습니다.`,
      });
      continue;
    }
    if (DANGLING_REFERENCES.some((token) => lowered.includes(token.toLowerCase()))) {
      failures.push({
        severity: "warn",
        code: "DETAIL_NOT_SELF_CONTAINED",
        node_id: node.id,
        message: `노드 "${node.title}" 설명이 외부 참조에 의존합니다.`,
      });
      continue;
    }
    selfContained += 1;
  }

  return clampScore(selfContained / nodes.length);
}

// ──────────────────────────────────────────────
// 5. 메인 진입점 (Phase 12 Task 02)
// ──────────────────────────────────────────────

/**
 * 학습 트리 한 개를 골든 픽스처 기준으로 채점한다.
 * 5개 점수(0~1)와 구조화된 failures를 반환한다. LLM을 호출하지 않으며 결정적이다.
 */
export function evaluateLearningTree(
  tree: LearningTreeResponse,
  fixture: TreeEvalFixture,
): TreeEvalResult {
  const failures: TreeEvalFailure[] = [];

  // 노드가 0개면 점수 0과 error를 반환한다(명세 §1.4 공통 규칙).
  if (!tree.nodes || tree.nodes.length === 0) {
    failures.push({
      severity: "error",
      code: "EMPTY_TREE",
      message: "트리에 노드가 없습니다.",
    });
    return {
      coverage_score: 0,
      prerequisite_score: 0,
      pedagogy_score: 0,
      ordering_score: 0,
      detail_score: 0,
      failures,
    };
  }

  // 1) 기존 품질 경고를 구조화 실패(warn)로 흡수한다(Task 03).
  //    fixture.topic을 입력 주제로 사용해 TOPIC_MISMATCH를 판정한다.
  failures.push(...collectTreeQualityFailures(tree, fixture.topic));

  // 2) 선수관계 쌍을 모은다(노드 prerequisites + prerequisite edges).
  const prerequisitePairs = buildPrerequisitePairs(tree);

  // 3) ordering 채점 전에 그래프 유효성(사이클/잘못된 참조)을 검증한다.
  //    deriveLearningGraphView는 사이클이나 미해결 참조에서 throw한다.
  let orderingScore: number;
  try {
    deriveLearningGraphView(toGraphInput(tree.nodes));
    orderingScore = scoreOrdering(tree, prerequisitePairs, failures);
  } catch (error) {
    failures.push({
      severity: "error",
      code: "PREREQUISITE_CYCLE",
      message: `선수관계 그래프에 사이클 또는 잘못된 참조가 있습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    orderingScore = 0;
  }

  const coverageScore = scoreCoverage(tree, fixture, failures);
  const prerequisiteScore = scorePrerequisite(tree, fixture, prerequisitePairs, failures);
  const pedagogyScore = scorePedagogy(tree, failures);
  const detailScore = scoreDetail(tree, failures);

  return {
    coverage_score: clampScore(coverageScore),
    prerequisite_score: clampScore(prerequisiteScore),
    pedagogy_score: clampScore(pedagogyScore),
    ordering_score: clampScore(orderingScore),
    detail_score: clampScore(detailScore),
    failures,
  };
}
