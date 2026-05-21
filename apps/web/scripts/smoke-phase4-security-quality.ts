/**
 * Phase 4 task 10 security and quality smoke.
 *
 * Live Supabase/Vercel을 호출하지 않고, 보안 route contract·RLS migration·추천/복습/리포트
 * 품질 규칙이 코드에 남아 있는지 검증한다.
 */
import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

function assertPhase4RouteSecurity(relativePath: string): void {
  const source = readSource(relativePath);
  assert(source.includes("requireSupabaseAuthUserId"), `${relativePath} must require Supabase auth`);
  assert(!source.includes("DEFAULT_USER_ID"), `${relativePath} must not use DEFAULT_USER_ID`);
  assert(!/console\.(log|info|warn|error)\(/.test(source), `${relativePath} must not log learning payloads`);
}

async function main(): Promise<void> {
  const phase4Routes = [
    "src/app/api/sessions/start/route.ts",
    "src/app/api/sessions/[sessionId]/end/route.ts",
    "src/app/api/events/route.ts",
    "src/app/api/concepts/[conceptId]/mastery/route.ts",
    "src/app/api/trees/[treeId]/personalized/route.ts",
    "src/app/api/trees/[treeId]/recommendations/personalized/route.ts",
    "src/app/api/quizzes/attempts/route.ts",
    "src/app/api/reviews/due/route.ts",
    "src/app/api/reports/generate/route.ts",
    "src/app/api/recommendations/click/route.ts",
  ];
  for (const routePath of phase4Routes) assertPhase4RouteSecurity(routePath);

  const migration01 = readSource("drizzle/0004_phase4_learning_sessions_events_mastery.sql");
  const migration02 = readSource("drizzle/0005_phase4_quiz_misconception_recommendation_report.sql");
  for (const table of [
    "learning_sessions",
    "learning_events",
    "user_concept_mastery",
    "quiz_attempts",
    "misconception_events",
    "recommendation_logs",
    "learning_reports",
  ]) {
    const sql = `${migration01}\n${migration02}`;
    assert(sql.includes(`alter table "${table}" enable row level security`), `${table} RLS missing`);
    assert(sql.includes(`"${table}_owner_all"`), `${table} owner policy missing`);
  }

  const clickRouteSource = readSource("src/app/api/recommendations/click/route.ts");
  assert(clickRouteSource.includes("markRecommendationLogClicked"), "click route must update recommendation log clicked");
  const personalizedRouteSource = readSource("src/app/api/trees/[treeId]/recommendations/personalized/route.ts");
  assert(personalizedRouteSource.includes("createRecommendationLog"), "personalized recommendations must log impressions");

  const uiSource = readSource("src/components/tree-page-client.tsx");
  assert(uiSource.includes("/api/recommendations/click"), "UI must connect personalized recommendation click log");

  const checklist = readSource("../../docs/plans/phase-04/phase4-completion-checklist.md");
  assert(checklist.includes("§22"), "completion checklist must map Phase 4 completion conditions");
  assert(checklist.includes("npm run phase4:quality-smoke"), "completion checklist must include quality smoke evidence");

  const { recommendPersonalizedNodes } = await import("../src/lib/recommendation/personalized");
  const { buildReviewItems } = await import("../src/lib/recommendation/review-priority");
  const { analyzeWeakConcepts } = await import("../src/lib/learning/report");

  const nodes = [
    {
      nodeId: "prereq",
      nodeKey: "prereq",
      title: "Prerequisite",
      type: "prerequisite",
      difficulty: 1,
      prerequisites: [],
      conceptId: "c-prereq",
    },
    {
      nodeId: "core",
      nodeKey: "core",
      title: "Core",
      type: "core",
      difficulty: 2,
      prerequisites: ["prereq"],
      conceptId: "c-core",
    },
  ];
  const userA = recommendPersonalizedNodes(
    nodes,
    new Map([
      ["c-prereq", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, needsReview: true }],
      ["c-core", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, needsReview: true }],
    ]),
    { now: new Date("2026-05-21T00:00:00.000Z") },
  );
  const userB = recommendPersonalizedNodes(
    nodes,
    new Map([
      ["c-prereq", { status: "known", confidenceScore: 0.9, wrongCount: 0, correctCount: 3, needsReview: false }],
      ["c-core", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, needsReview: true }],
    ]),
    { now: new Date("2026-05-21T00:00:00.000Z") },
  );
  assert(userA[0]?.node_id === "prereq", "user with prerequisite gap should see prerequisite first");
  assert(userB[0]?.node_id === "core", "user with known prerequisite should move to core");

  const review = buildReviewItems(
    [
      {
        conceptId: "known",
        title: "Known",
        confidenceScore: 0.92,
        lastStudiedAt: new Date("2026-05-20T00:00:00.000Z"),
        wrongCount: 0,
        correctCount: 4,
        needsReview: false,
      },
      {
        conceptId: "weak",
        title: "Weak",
        confidenceScore: 0.24,
        lastStudiedAt: null,
        wrongCount: 2,
        correctCount: 0,
        needsReview: true,
      },
    ],
    { now: new Date("2026-05-21T00:00:00.000Z") },
  );
  assert(review[0]?.concept_id === "weak", "weak concept should outrank known concept for review");

  const weak = analyzeWeakConcepts({
    concepts: [
      { conceptId: "prereq-gap", title: "Linear Algebra", role: "prerequisite" },
      { conceptId: "core-gap", title: "Attention", role: "core" },
    ],
    masteryRecords: [
      {
        conceptId: "prereq-gap",
        title: "Linear Algebra",
        status: "unknown",
        confidenceScore: 0.2,
        wrongCount: 1,
        correctCount: 0,
        needsReview: true,
      },
      {
        conceptId: "core-gap",
        title: "Attention",
        status: "partial",
        confidenceScore: 0.45,
        wrongCount: 0,
        correctCount: 1,
        needsReview: true,
      },
    ],
    quizAttempts: [],
    misconceptionEvents: [],
  });
  assert(
    weak.weakConcepts.some((item) => item.reason.includes("선수지식")),
    "weak analysis must distinguish prerequisite gaps",
  );
  assert(weak.weakConcepts.length > 0, "weak analysis must produce actionable weak concepts");

  console.log("Phase 4 task 10 security quality smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:quality-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
