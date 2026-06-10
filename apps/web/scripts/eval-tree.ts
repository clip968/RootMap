/**
 * Phase 12 Task 04 — `npm run eval:tree` CLI runner.
 *
 * 모든 골든 픽스처(`evals/fixtures/topics/`)를 순회하며 `evaluateLearningTree`로
 * 채점하고, 주제별 5개 점수 + 실패 개수 표와 전체 평균을 출력한다.
 *
 * 채점 대상 트리(입력 소스):
 *   - 기본(LLM 무호출): `evals/fixtures/trees/<slug>.json`에 저장된 트리가 있으면 그것을,
 *     없으면 픽스처에서 결정적으로 합성한 트리를 채점한다. CI에서 비용 없이 돌리기 위함이다.
 *   - `--live`: 실제 `generateLearningTree`를 호출해 채점한다(LLM 비용 발생, 수동 전용).
 *   - `--self-check`: 합성 트리 몇 개로 채점 로직 자체를 검증한다(Task 02 검증용).
 *
 * 종료 코드 정책:
 *   - `error` severity failure가 하나라도 있으면 비정상 종료(코드 1) → CI 실패.
 *   - `--min-*` 임계값을 주면 전체 평균이 그 아래일 때 비정상 종료.
 *   - 그 외(warn만 있음)는 정상 종료(코드 0).
 *
 * 실행 예:
 *   npm run eval:tree
 *   npm run eval:tree -- --json
 *   npm run eval:tree -- --min-coverage 0.8 --min-prerequisite 0.8
 *   npm run eval:tree:live -- --user-id <uuid>
 *   npx tsx scripts/eval-tree.ts --self-check
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import topicFixtures from "../evals/fixtures/topics/index";
import {
  evaluateLearningTree,
  type TreeEvalFixture,
  type TreeEvalResult,
} from "../src/lib/evaluation/tree-eval";
import { normalizeTitle } from "../src/lib/concepts/normalize";
import { deriveLearningGraphView } from "../src/lib/tree/concept-graph";
import type {
  LearningTreeNode,
  LearningTreeResponse,
} from "../src/types/learning";

// ──────────────────────────────────────────────
// 인자 파싱
// ──────────────────────────────────────────────

interface CliOptions {
  selfCheck: boolean;
  live: boolean;
  json: boolean;
  userId: string | null;
  thresholds: Partial<Record<keyof ScoreColumns, number>>;
}

interface ScoreColumns {
  coverage: number;
  prerequisite: number;
  pedagogy: number;
  ordering: number;
  detail: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    selfCheck: false,
    live: false,
    json: false,
    userId: null,
    thresholds: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextValue = () => argv[++i];
    switch (arg) {
      case "--self-check":
        options.selfCheck = true;
        break;
      case "--live":
        options.live = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--user-id":
        options.userId = nextValue() ?? null;
        break;
      case "--min-coverage":
        options.thresholds.coverage = Number(nextValue());
        break;
      case "--min-prerequisite":
        options.thresholds.prerequisite = Number(nextValue());
        break;
      case "--min-pedagogy":
        options.thresholds.pedagogy = Number(nextValue());
        break;
      case "--min-ordering":
        options.thresholds.ordering = Number(nextValue());
        break;
      case "--min-detail":
        options.thresholds.detail = Number(nextValue());
        break;
      default:
        if (arg.startsWith("--")) {
          console.warn(`[eval:tree] 알 수 없는 옵션은 무시합니다: ${arg}`);
        }
        break;
    }
  }

  return options;
}

// ──────────────────────────────────────────────
// 입력 트리 소스
// ──────────────────────────────────────────────

/** 주제명을 저장 트리 파일명 슬러그로 변환한다(예: "가상 메모리" → "가상-메모리"). */
function topicSlug(topic: string): string {
  return normalizeTitle(topic).replace(/\s+/g, "-") || "topic";
}

/** evals/fixtures/trees/<slug>.json이 있으면 로드한다(없으면 null). */
function loadStoredTree(fixture: TreeEvalFixture): LearningTreeResponse | null {
  const file = join(process.cwd(), "evals", "fixtures", "trees", `${topicSlug(fixture.topic)}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LearningTreeResponse;
  } catch (error) {
    console.warn(
      `[eval:tree] 저장 트리 로드 실패(${file}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * 픽스처에서 결정적으로 트리를 합성한다(LLM 무호출 기본 채점 대상).
 *
 * 합성 규칙
 * - expected_concepts와 edge 양끝 개념마다 노드를 만든다.
 * - required_edges를 node.prerequisites와 prerequisite edge로 반영한다(from이 선수).
 * - prerequisite 타입 노드가 3개 미만이면 선수 없는 core 노드를 승격해 구조 가이드를 만족시킨다.
 * - 오개념(misconception) 노드와 이해 점검(quiz) 노드 2개를 추가한다.
 * - recommended_order는 deriveLearningGraphView로 위상 정렬해 생성한다(ordering 위반 0).
 *
 * 이 합성 트리는 "픽스처에 충실한 트리"가 어떤 점수를 받는지 보여주는 결정적 baseline이다.
 * 실제 생성 모델 품질의 baseline은 --live로 측정한다.
 */
function synthesizeTreeFromFixture(fixture: TreeEvalFixture): LearningTreeResponse {
  const labelToId = new Map<string, string>();
  const usedIds = new Set<string>();
  const nodes: LearningTreeNode[] = [];

  // required_edges의 from(선수쪽) 개념은 prerequisite 타입으로 만든다.
  const prerequisiteSources = new Set(
    fixture.required_edges.map((edge) => normalizeTitle(edge.from)),
  );

  const slugFor = (label: string): string => {
    const normalized = normalizeTitle(label);
    const base =
      normalized.replace(/\s+/g, "_").replace(/[^a-z0-9가-힣_]/g, "") || "node";
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}_${suffix++}`;
    }
    usedIds.add(id);
    return id;
  };

  const ensureConcept = (label: string): string => {
    const normalized = normalizeTitle(label);
    const existing = labelToId.get(normalized);
    if (existing) return existing;

    const id = slugFor(label);
    labelToId.set(normalized, id);
    const type = prerequisiteSources.has(normalized) ? "prerequisite" : "core";
    nodes.push({
      id,
      title: label,
      type,
      description: `${label}의 핵심 정의와 ${fixture.topic} 맥락에서의 역할, 그리고 자주 헷갈리는 지점을 함께 정리한 설명입니다.`,
      difficulty: type === "prerequisite" ? 2 : 3,
      prerequisites: [],
      children: [],
      community: fixture.topic,
      priority: nodes.length + 1,
      concept_candidate: {
        canonical_title: label,
        aliases: [],
        domain: null,
        short_description: `${label} 요약`,
        is_reusable: true,
      },
    });
    return id;
  };

  // 1) 개념 노드 생성(expected + edge 양끝).
  for (const concept of fixture.expected_concepts) ensureConcept(concept);
  for (const edge of [...fixture.required_edges, ...fixture.forbidden_edges]) {
    ensureConcept(edge.from);
    ensureConcept(edge.to);
  }

  // 2) required_edges를 prerequisites로 반영(from이 to의 선수).
  for (const edge of fixture.required_edges) {
    const fromId = labelToId.get(normalizeTitle(edge.from));
    const toId = labelToId.get(normalizeTitle(edge.to));
    if (!fromId || !toId || fromId === toId) continue;
    const toNode = nodes.find((node) => node.id === toId);
    if (toNode && !toNode.prerequisites.includes(fromId)) {
      toNode.prerequisites.push(fromId);
    }
  }

  // 3) prerequisite 노드가 3개 미만이면 선수 없는 core 노드를 승격(구조 가이드 충족).
  let prerequisiteCount = nodes.filter((node) => node.type === "prerequisite").length;
  for (const node of nodes) {
    if (prerequisiteCount >= 3) break;
    if (node.type === "core" && node.prerequisites.length === 0) {
      node.type = "prerequisite";
      prerequisiteCount += 1;
    }
  }

  // 4) 오개념 노드 추가(beginner_misconceptions 기반).
  fixture.beginner_misconceptions.forEach((misconception, index) => {
    nodes.push({
      id: slugFor(`misconception_${index + 1}`),
      title: misconception,
      type: "misconception",
      description: `${fixture.topic} 학습에서 자주 나오는 오개념입니다: ${misconception}. 왜 틀린 생각인지와 올바른 이해를 함께 설명합니다.`,
      difficulty: 2,
      prerequisites: [],
      children: [],
      community: fixture.topic,
      priority: 900 + index,
      concept_candidate: {
        canonical_title: misconception,
        aliases: [],
        domain: null,
        short_description: "자주 하는 오개념",
        is_reusable: false,
      },
    });
  });

  // 5) 이해 점검(quiz) 노드 2개 추가.
  for (let index = 0; index < 2; index++) {
    nodes.push({
      id: slugFor(`quiz_${index + 1}`),
      title: `${fixture.topic} 이해 점검 ${index + 1}`,
      type: "quiz",
      description: `${fixture.topic}의 핵심 개념을 직접 적용하거나 구분해 보는 이해 점검 질문입니다.`,
      difficulty: 3,
      prerequisites: [],
      children: [],
      community: fixture.topic,
      priority: 950 + index,
      concept_candidate: {
        canonical_title: `${fixture.topic} 이해 점검 ${index + 1}`,
        aliases: [],
        domain: null,
        short_description: "이해 점검",
        is_reusable: false,
      },
    });
  }

  // 6) recommended_order는 위상 정렬로 생성(선수 → 의존 순서 보장).
  const view = deriveLearningGraphView(
    nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      community: node.community ?? fixture.topic,
      priority: node.priority ?? 999,
      prerequisites: node.prerequisites,
    })),
  );

  return {
    topic: fixture.topic,
    summary: `${fixture.topic}의 선수지식과 핵심 개념을 정리한 학습 트리(결정적 합성 baseline).`,
    nodes,
    recommended_order: view.recommended_order,
    communities: view.communities,
    edges: fixture.required_edges
      .map((edge) => {
        const from = labelToId.get(normalizeTitle(edge.from));
        const to = labelToId.get(normalizeTitle(edge.to));
        return from && to
          ? { from, to, relation_type: "prerequisite" as const, reason: edge.reason }
          : null;
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null),
  };
}

// ──────────────────────────────────────────────
// 점수표 출력
// ──────────────────────────────────────────────

function fmtScore(value: number): string {
  return value.toFixed(2);
}

/** 문자열을 char 길이 기준으로 우측 공백 패딩한다(터미널 정렬용, 근사치). */
function padEndChars(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStartChars(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

interface RowResult {
  topic: string;
  result: TreeEvalResult;
  source: string;
}

function countBySeverity(result: TreeEvalResult): { errors: number; warns: number } {
  let errors = 0;
  let warns = 0;
  for (const failure of result.failures) {
    if (failure.severity === "error") errors += 1;
    else warns += 1;
  }
  return { errors, warns };
}

const TOPIC_WIDTH = 30;
const SCORE_WIDTH = 8;
const COUNT_WIDTH = 6;

function printTable(rows: RowResult[]): void {
  const header =
    padEndChars("topic", TOPIC_WIDTH) +
    padStartChars("cover", SCORE_WIDTH) +
    padStartChars("prereq", SCORE_WIDTH) +
    padStartChars("pedag", SCORE_WIDTH) +
    padStartChars("order", SCORE_WIDTH) +
    padStartChars("detail", SCORE_WIDTH) +
    padStartChars("err", COUNT_WIDTH) +
    padStartChars("warn", COUNT_WIDTH);
  console.log(header);
  console.log("-".repeat(header.length));

  const totals: ScoreColumns = {
    coverage: 0,
    prerequisite: 0,
    pedagogy: 0,
    ordering: 0,
    detail: 0,
  };
  let totalErrors = 0;
  let totalWarns = 0;

  for (const row of rows) {
    const { errors, warns } = countBySeverity(row.result);
    totals.coverage += row.result.coverage_score;
    totals.prerequisite += row.result.prerequisite_score;
    totals.pedagogy += row.result.pedagogy_score;
    totals.ordering += row.result.ordering_score;
    totals.detail += row.result.detail_score;
    totalErrors += errors;
    totalWarns += warns;

    console.log(
      padEndChars(row.topic, TOPIC_WIDTH) +
        padStartChars(fmtScore(row.result.coverage_score), SCORE_WIDTH) +
        padStartChars(fmtScore(row.result.prerequisite_score), SCORE_WIDTH) +
        padStartChars(fmtScore(row.result.pedagogy_score), SCORE_WIDTH) +
        padStartChars(fmtScore(row.result.ordering_score), SCORE_WIDTH) +
        padStartChars(fmtScore(row.result.detail_score), SCORE_WIDTH) +
        padStartChars(String(errors), COUNT_WIDTH) +
        padStartChars(String(warns), COUNT_WIDTH),
    );
  }

  const count = rows.length || 1;
  console.log("-".repeat(header.length));
  console.log(
    padEndChars("AVERAGE", TOPIC_WIDTH) +
      padStartChars(fmtScore(totals.coverage / count), SCORE_WIDTH) +
      padStartChars(fmtScore(totals.prerequisite / count), SCORE_WIDTH) +
      padStartChars(fmtScore(totals.pedagogy / count), SCORE_WIDTH) +
      padStartChars(fmtScore(totals.ordering / count), SCORE_WIDTH) +
      padStartChars(fmtScore(totals.detail / count), SCORE_WIDTH) +
      padStartChars(String(totalErrors), COUNT_WIDTH) +
      padStartChars(String(totalWarns), COUNT_WIDTH),
  );
}

function averageScores(rows: RowResult[]): ScoreColumns {
  const count = rows.length || 1;
  const totals: ScoreColumns = {
    coverage: 0,
    prerequisite: 0,
    pedagogy: 0,
    ordering: 0,
    detail: 0,
  };
  for (const row of rows) {
    totals.coverage += row.result.coverage_score;
    totals.prerequisite += row.result.prerequisite_score;
    totals.pedagogy += row.result.pedagogy_score;
    totals.ordering += row.result.ordering_score;
    totals.detail += row.result.detail_score;
  }
  return {
    coverage: totals.coverage / count,
    prerequisite: totals.prerequisite / count,
    pedagogy: totals.pedagogy / count,
    ordering: totals.ordering / count,
    detail: totals.detail / count,
  };
}

/** error severity failure를 주제별로 자세히 출력한다(원인 분리용). */
function printErrorDetails(rows: RowResult[]): void {
  const withErrors = rows.filter((row) =>
    row.result.failures.some((failure) => failure.severity === "error"),
  );
  if (withErrors.length === 0) return;
  console.log("\n[error severity failures]");
  for (const row of withErrors) {
    for (const failure of row.result.failures) {
      if (failure.severity !== "error") continue;
      const where = failure.node_id ? ` (node=${failure.node_id})` : "";
      console.log(`  - ${row.topic}: [${failure.code}]${where} ${failure.message}`);
    }
  }
}

// ──────────────────────────────────────────────
// 모드 구현
// ──────────────────────────────────────────────

/** 기본/라이브 모드: 픽스처를 순회하며 채점하고 표를 출력한다. exit code를 반환한다. */
async function runScoringMode(
  fixtures: TreeEvalFixture[],
  options: CliOptions,
): Promise<number> {
  // --live면 LLM/DB 모듈을 동적 import한다(기본 경로는 절대 LLM을 로드하지 않는다).
  let liveGenerate:
    | ((fixture: TreeEvalFixture) => Promise<LearningTreeResponse>)
    | null = null;

  if (options.live) {
    if (!options.userId) {
      console.error(
        "[eval:tree] --live에는 --user-id <uuid>가 필요합니다(DB에 저장된 LLM provider 설정 사용).",
      );
      return 1;
    }
    try {
      const [{ generateLearningTree }, { resolveLlmProviderConfig }] =
        await Promise.all([
          import("../src/lib/llm/generate-tree"),
          import("../src/lib/llm/provider-config"),
        ]);
      const providerConfig = await resolveLlmProviderConfig(options.userId);
      liveGenerate = async (fixture) => {
        const { tree } = await generateLearningTree(fixture.topic, { providerConfig });
        return tree;
      };
    } catch (error) {
      console.error(
        `[eval:tree] --live 초기화 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
  }

  const rows: RowResult[] = [];
  for (const fixture of fixtures) {
    let tree: LearningTreeResponse;
    let source: string;

    if (liveGenerate) {
      try {
        tree = await liveGenerate(fixture);
        source = "live";
      } catch (error) {
        console.error(
          `[eval:tree] "${fixture.topic}" 라이브 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
        // 생성 실패는 해당 주제를 EMPTY_TREE로 채점해 error로 드러낸다.
        tree = { topic: fixture.topic, summary: "", nodes: [], recommended_order: [], edges: [] };
        source = "live-failed";
      }
    } else {
      const stored = loadStoredTree(fixture);
      if (stored) {
        tree = stored;
        source = "stored";
      } else {
        tree = synthesizeTreeFromFixture(fixture);
        source = "synthetic";
      }
    }

    rows.push({ topic: fixture.topic, result: evaluateLearningTree(tree, fixture), source });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mode: options.live ? "live" : "default",
          rows: rows.map((row) => ({
            topic: row.topic,
            source: row.source,
            scores: {
              coverage_score: row.result.coverage_score,
              prerequisite_score: row.result.prerequisite_score,
              pedagogy_score: row.result.pedagogy_score,
              ordering_score: row.result.ordering_score,
              detail_score: row.result.detail_score,
            },
            failures: row.result.failures,
          })),
          average: averageScores(rows),
        },
        null,
        2,
      ),
    );
  } else {
    const sources = new Set(rows.map((row) => row.source));
    console.log(`[eval:tree] 입력 소스: ${[...sources].join(", ")} | 픽스처 ${rows.length}개\n`);
    printTable(rows);
    printErrorDetails(rows);
  }

  // 종료 코드 판정.
  const totalErrors = rows.reduce(
    (sum, row) => sum + countBySeverity(row.result).errors,
    0,
  );
  const average = averageScores(rows);
  const thresholdViolations: string[] = [];
  for (const [key, min] of Object.entries(options.thresholds)) {
    if (typeof min === "number" && !Number.isNaN(min)) {
      const actual = average[key as keyof ScoreColumns];
      if (actual < min) {
        thresholdViolations.push(`${key} 평균 ${fmtScore(actual)} < 임계값 ${fmtScore(min)}`);
      }
    }
  }

  if (totalErrors > 0) {
    console.error(`\n[eval:tree] FAIL: error severity failure ${totalErrors}건`);
    return 1;
  }
  if (thresholdViolations.length > 0) {
    console.error(`\n[eval:tree] FAIL: 임계값 위반\n  - ${thresholdViolations.join("\n  - ")}`);
    return 1;
  }
  console.log("\n[eval:tree] OK: error severity failure 없음.");
  return 0;
}

/** --self-check: 합성 트리로 채점 규칙이 의도대로 동작하는지 검증한다. */
function runSelfCheck(): number {
  const failures: string[] = [];
  const check = (condition: unknown, message: string): void => {
    if (!condition) failures.push(message);
  };

  // 작은 데모 픽스처: a→b→c 선수관계.
  const fixture: TreeEvalFixture = {
    topic: "demo",
    expected_concepts: ["a", "b", "c"],
    required_edges: [
      { from: "a", to: "b", reason: "a는 b의 선수" },
      { from: "b", to: "c", reason: "b는 c의 선수" },
    ],
    forbidden_edges: [{ from: "c", to: "a", reason: "c는 a의 선수가 아님" }],
    beginner_misconceptions: ["a와 c를 혼동"],
    required_examples: ["a로 b를 유도"],
  };

  const baseNode = (
    id: string,
    type: LearningTreeNode["type"],
    prerequisites: string[],
  ): LearningTreeNode => ({
    id,
    title: id,
    type,
    description: `${id} 개념을 자기완결적으로 충분히 설명하는 본문입니다.`,
    difficulty: 2,
    prerequisites,
    children: [],
    community: "demo",
    priority: 1,
  });

  // 1) 좋은 트리: 모든 required 충족, forbidden 없음, 순서 정상.
  const goodTree: LearningTreeResponse = {
    topic: "demo",
    summary: "good",
    nodes: [
      baseNode("a", "prerequisite", []),
      baseNode("b", "prerequisite", ["a"]),
      baseNode("c", "core", ["b"]),
    ],
    recommended_order: ["a", "b", "c"],
    edges: [],
  };
  const good = evaluateLearningTree(goodTree, fixture);
  check(good.coverage_score === 1, `self-check: good coverage 기대 1, 실제 ${good.coverage_score}`);
  check(good.prerequisite_score === 1, `self-check: good prerequisite 기대 1, 실제 ${good.prerequisite_score}`);
  check(good.ordering_score === 1, `self-check: good ordering 기대 1, 실제 ${good.ordering_score}`);
  check(
    !good.failures.some((f) => f.severity === "error"),
    "self-check: good 트리에 error failure가 없어야 함",
  );

  // 2) 금지 관계 + 역방향: forbidden edge(c→a)와 reversed required를 만든다.
  const badTree: LearningTreeResponse = {
    topic: "demo",
    summary: "bad",
    nodes: [
      baseNode("a", "prerequisite", ["c"]), // c→a: forbidden 관계가 실제로 존재
      baseNode("b", "core", []), // a→b 누락
      baseNode("c", "core", ["b"]), // b→c는 정상
    ],
    recommended_order: ["a", "b", "c"],
    edges: [],
  };
  const bad = evaluateLearningTree(badTree, fixture);
  check(
    bad.failures.some((f) => f.code === "FORBIDDEN_EDGE" && f.severity === "error"),
    "self-check: bad 트리에 FORBIDDEN_EDGE error가 있어야 함",
  );
  check(
    bad.prerequisite_score < 1,
    `self-check: bad prerequisite < 1 기대, 실제 ${bad.prerequisite_score}`,
  );

  // 3) 사이클 트리: a↔b 상호 선수 → PREREQUISITE_CYCLE error, ordering 0.
  const cycleTree: LearningTreeResponse = {
    topic: "demo",
    summary: "cycle",
    nodes: [
      baseNode("a", "prerequisite", ["b"]),
      baseNode("b", "prerequisite", ["a"]),
      baseNode("c", "core", []),
    ],
    recommended_order: ["a", "b", "c"],
    edges: [],
  };
  const cycle = evaluateLearningTree(cycleTree, fixture);
  check(
    cycle.failures.some((f) => f.code === "PREREQUISITE_CYCLE" && f.severity === "error"),
    "self-check: cycle 트리에 PREREQUISITE_CYCLE error가 있어야 함",
  );
  check(cycle.ordering_score === 0, `self-check: cycle ordering 기대 0, 실제 ${cycle.ordering_score}`);

  // 4) 빈 트리: EMPTY_TREE error, 모든 점수 0.
  const emptyTree: LearningTreeResponse = {
    topic: "demo",
    summary: "empty",
    nodes: [],
    recommended_order: [],
    edges: [],
  };
  const empty = evaluateLearningTree(emptyTree, fixture);
  check(
    empty.failures.some((f) => f.code === "EMPTY_TREE" && f.severity === "error"),
    "self-check: empty 트리에 EMPTY_TREE error가 있어야 함",
  );
  check(
    empty.coverage_score === 0 && empty.detail_score === 0,
    "self-check: empty 트리 점수는 0이어야 함",
  );

  // 5) 모든 점수가 0~1 범위인지(결정적 정규화) 확인.
  for (const result of [good, bad, cycle, empty]) {
    for (const value of [
      result.coverage_score,
      result.prerequisite_score,
      result.pedagogy_score,
      result.ordering_score,
      result.detail_score,
    ]) {
      check(value >= 0 && value <= 1, `self-check: 점수 ${value}가 0~1 범위를 벗어남`);
    }
  }

  if (failures.length > 0) {
    console.error("[eval:tree --self-check] FAIL");
    for (const message of failures) console.error(`  - ${message}`);
    return 1;
  }
  console.log("[eval:tree --self-check] PASS: 채점 규칙 4개 시나리오 검증 통과.");
  return 0;
}

// ──────────────────────────────────────────────
// 진입점
// ──────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  let exitCode: number;
  if (options.selfCheck) {
    exitCode = runSelfCheck();
  } else {
    exitCode = await runScoringMode(topicFixtures, options);
  }
  process.exitCode = exitCode;
}

void main().catch((error) => {
  console.error("[eval:tree] 실행 중 오류:", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
