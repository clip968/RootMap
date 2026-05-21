/**
 * Phase 4 task 06 quiz attempts smoke.
 *
 * 외부 LLM은 호출하지 않는다. 대신 평가 JSON parser, quiz 결과→mastery 반영 규칙,
 * route가 저장소와 이벤트를 연결하는 source contract를 검증한다.
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
  const serviceSource = readSource("src/lib/learning/quiz.ts");
  const routeSource = readSource("src/app/api/quizzes/attempts/route.ts");
  assert(serviceSource.includes("applyQuizResultToMastery"), "quiz service must expose mastery update policy");
  assert(serviceSource.includes("expected_answer"), "LLM prompt must include expected_answer");
  assert(routeSource.includes("createQuizAttempt"), "route must save quiz_attempts");
  assert(routeSource.includes("createMisconceptionEvent"), "route must save misconception events");
  assert(routeSource.includes("quiz_submitted"), "route must append quiz_submitted learning event");
  const route = await import("../src/app/api/quizzes/attempts/route");
  assert(typeof route.POST === "function", "quiz attempts route POST export missing");

  const {
    applyQuizResultToMastery,
    parseQuizEvaluationResponse,
    buildQuizEvaluationUserMessage,
  } = await import("../src/lib/learning/quiz");

  const parsed = parseQuizEvaluationResponse(`\`\`\`json
  {
    "is_correct": false,
    "score": 0.2,
    "feedback": "softmax는 argmax와 다릅니다.",
    "detected_misconceptions": ["softmax를 argmax로 오해함"]
  }
  \`\`\``);
  assert(parsed.isCorrect === false, "parser should read is_correct");
  assert(parsed.score === 0.2, "parser should read score");
  assert(parsed.detectedMisconceptions.length === 1, "parser should read misconceptions");

  const wrong = applyQuizResultToMastery(
    {
      status: "partial",
      confidenceScore: 0.48,
      wrongCount: 0,
      correctCount: 0,
      lastQuizScore: null,
      needsReview: true,
    },
    parsed,
  );
  assert(wrong.confidenceScore === 0.32, `wrong answer should lower confidence to 0.32, got ${wrong.confidenceScore}`);
  assert(wrong.status === "unknown", "wrong answer should convert low score to unknown");
  assert(wrong.wrongCount === 1, "wrong answer should increment wrong_count");

  const correct = applyQuizResultToMastery(
    {
      status: "partial",
      confidenceScore: 0.7,
      wrongCount: 1,
      correctCount: 0,
      lastQuizScore: null,
      needsReview: true,
    },
    { ...parsed, isCorrect: true, score: 1, detectedMisconceptions: [] },
  );
  assert(correct.confidenceScore === 0.85, `correct answer should raise confidence to 0.85, got ${correct.confidenceScore}`);
  assert(correct.status === "known", "correct answer should convert high score to known");
  assert(correct.correctCount === 1, "correct answer should increment correct_count");

  const prompt = buildQuizEvaluationUserMessage({
    conceptTitle: "Softmax",
    question: "softmax는 입력 값을 어떤 형태로 변환하는가?",
    expectedAnswer: "전체 합이 1이 되는 확률분포 형태",
    userAnswer: "가장 큰 값을 선택한다",
  });
  assert(prompt.includes("Softmax"), "prompt should include concept title");
  assert(prompt.includes("전체 합이 1"), "prompt should include expected answer");
  assert(prompt.includes("가장 큰 값"), "prompt should include user answer");

  console.log("Phase 4 task 06 quiz attempts smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:quiz-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
