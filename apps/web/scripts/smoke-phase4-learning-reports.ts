/**
 * Phase 4 task 08 learning reports smoke.
 *
 * 외부 LLM과 DB를 호출하지 않고 리포트 JSON parser, 약점 개념 분석,
 * 리포트 생성 route와 세션 종료 연동의 source contract를 검증한다.
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

async function main(): Promise<void> {
  const serviceSource = readSource("src/lib/learning/report.ts");
  const routeSource = readSource("src/app/api/reports/generate/route.ts");
  const endRouteSource = readSource("src/app/api/sessions/[sessionId]/end/route.ts");
  assert(serviceSource.includes("analyzeWeakConcepts"), "report service must expose weak concept analysis");
  assert(serviceSource.includes("createSessionLearningReport"), "report service must expose persisted session report creation");
  assert(serviceSource.includes("next_recommendations"), "LLM report prompt/schema must include next_recommendations");
  assert(routeSource.includes("createSessionLearningReport"), "report route must call shared session report service");
  assert(routeSource.includes("requireSupabaseAuthUserId"), "report route must require Supabase auth");
  assert(endRouteSource.includes("createSessionLearningReport"), "session end route must generate reports when requested");

  const route = await import("../src/app/api/reports/generate/route");
  assert(typeof route.POST === "function", "report generate route POST export missing");

  const {
    analyzeWeakConcepts,
    buildDeterministicSessionReport,
    buildSessionReportUserMessage,
    parseSessionReportResponse,
  } = await import("../src/lib/learning/report");

  const parsed = parseSessionReportResponse(`\`\`\`json
  {
    "title": "Transformer 세션 리포트",
    "summary": "Softmax와 Attention을 학습했지만 Softmax 오개념이 남았습니다.",
    "learned_concepts": ["Dot Product", "Softmax"],
    "strengths": ["Dot Product 계산 흐름은 안정적입니다."],
    "weaknesses": ["Softmax를 argmax로 오해했습니다."],
    "next_recommendations": ["Softmax 확률분포 예제를 다시 풀어보세요."]
  }
  \`\`\``);
  assert(parsed.title.includes("Transformer"), "parser should read report title");
  assert(parsed.strengths.length === 1, "parser should read strengths");
  assert(parsed.nextRecommendations[0]!.includes("Softmax"), "parser should read next recommendations");

  const weak = analyzeWeakConcepts({
    concepts: [
      { conceptId: "dot", title: "Dot Product", role: "prerequisite" },
      { conceptId: "softmax", title: "Softmax", role: "core" },
      { conceptId: "attention", title: "Attention", role: "core" },
    ],
    masteryRecords: [
      {
        conceptId: "dot",
        status: "known",
        confidenceScore: 0.86,
        lastQuizScore: 0.9,
        wrongCount: 0,
        correctCount: 3,
        needsReview: false,
      },
      {
        conceptId: "softmax",
        status: "partial",
        confidenceScore: 0.34,
        lastQuizScore: 0.2,
        wrongCount: 2,
        correctCount: 0,
        needsReview: true,
      },
      {
        conceptId: "attention",
        status: "unknown",
        confidenceScore: 0.18,
        lastQuizScore: null,
        wrongCount: 0,
        correctCount: 0,
        needsReview: true,
      },
    ],
    quizAttempts: [
      {
        conceptId: "softmax",
        score: 0.2,
        isCorrect: false,
        feedback: "softmax는 argmax가 아니라 확률분포입니다.",
        detectedMisconceptions: ["softmax를 argmax로 오해함"],
      },
    ],
    misconceptionEvents: [
      {
        conceptId: "softmax",
        misconceptionText: "softmax를 argmax로 오해함",
        resolved: false,
      },
    ],
  });
  assert(weak.weakConcepts[0]?.concept_id === "softmax", "repeated wrong misconception should rank first");
  assert(weak.weakConcepts[0]!.reason.includes("오개념"), "weak reason should mention misconception");
  assert(weak.summary.includes("Softmax"), "weak summary should name actionable weak concepts");

  const deterministic = buildDeterministicSessionReport({
    topic: "Transformer",
    concepts: [
      { conceptId: "dot", title: "Dot Product", role: "prerequisite" },
      { conceptId: "softmax", title: "Softmax", role: "core" },
    ],
    learningEvents: [
      { eventType: "node_completed", conceptId: "dot" },
      { eventType: "node_opened", conceptId: "softmax" },
    ],
    masteryRecords: [
      {
        conceptId: "dot",
        status: "known",
        confidenceScore: 0.86,
        lastQuizScore: 0.9,
        wrongCount: 0,
        correctCount: 3,
        needsReview: false,
      },
      {
        conceptId: "softmax",
        status: "partial",
        confidenceScore: 0.34,
        lastQuizScore: 0.2,
        wrongCount: 2,
        correctCount: 0,
        needsReview: true,
      },
    ],
    quizAttempts: [
      {
        conceptId: "softmax",
        score: 0.2,
        isCorrect: false,
        feedback: "softmax는 argmax가 아니라 확률분포입니다.",
        detectedMisconceptions: ["softmax를 argmax로 오해함"],
      },
    ],
    misconceptionEvents: [
      {
        conceptId: "softmax",
        misconceptionText: "softmax를 argmax로 오해함",
        resolved: false,
      },
    ],
  });
  assert(deterministic.strengths.some((item) => item.includes("Dot Product")), "known concept should become a strength");
  assert(deterministic.weaknesses.some((item) => item.includes("Softmax")), "weak concept should become a weakness");
  assert(
    deterministic.nextRecommendations.some((item) => item.includes("Softmax")),
    "next actions should include weak concept review",
  );

  const prompt = buildSessionReportUserMessage({
    topic: "Transformer",
    concepts: [{ conceptId: "softmax", title: "Softmax", role: "core" }],
    learningEvents: [{ eventType: "node_opened", conceptId: "softmax" }],
    masteryRecords: [],
    quizAttempts: [],
    misconceptionEvents: [],
  });
  assert(prompt.includes("Learning events"), "prompt should include learning events section");
  assert(prompt.includes("Concept mastery changes"), "prompt should include mastery section");
  assert(prompt.includes("Softmax"), "prompt should include concept context");

  console.log("Phase 4 task 08 learning reports smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:report-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
