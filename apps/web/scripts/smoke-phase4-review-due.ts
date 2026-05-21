/**
 * Phase 4 task 07 review due smoke.
 *
 * 복습 우선순위 점수와 route contract를 DB 없이 검증한다.
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
  const serviceSource = readSource("src/lib/recommendation/review-priority.ts");
  const routeSource = readSource("src/app/api/reviews/due/route.ts");
  assert(serviceSource.includes("calculateReviewPriorityScore"), "review service must expose score function");
  assert(routeSource.includes("review_items"), "review due route must return review_items");
  assert(routeSource.includes("requireSupabaseAuthUserId"), "review route must require auth");

  const route = await import("../src/app/api/reviews/due/route");
  assert(typeof route.GET === "function", "review due route GET export missing");

  const { buildReviewItems, calculateReviewPriorityScore } = await import("../src/lib/recommendation/review-priority");
  const now = new Date("2026-05-21T00:00:00.000Z");
  const borrowing = calculateReviewPriorityScore({
    confidenceScore: 0.55,
    lastStudiedAt: new Date("2026-05-07T00:00:00.000Z"),
    wrongCount: 2,
    correctCount: 1,
    prerequisiteImportanceScore: 1,
    documentImportanceScore: 0.4,
    now,
  });
  assert(borrowing >= 0.65, `weak old prerequisite should be high priority, got ${borrowing}`);

  const items = buildReviewItems(
    [
      {
        conceptId: "vector",
        title: "Vector",
        confidenceScore: 0.92,
        lastStudiedAt: new Date("2026-05-20T00:00:00.000Z"),
        wrongCount: 0,
        correctCount: 3,
        needsReview: false,
      },
      {
        conceptId: "borrowing",
        title: "Borrowing",
        confidenceScore: 0.55,
        lastStudiedAt: new Date("2026-05-07T00:00:00.000Z"),
        wrongCount: 2,
        correctCount: 1,
        needsReview: true,
      },
      {
        conceptId: "softmax",
        title: "Softmax",
        confidenceScore: 0.32,
        lastStudiedAt: null,
        wrongCount: 1,
        correctCount: 0,
        needsReview: true,
      },
    ],
    { now },
  );
  assert(items[0]?.concept_id === "softmax", "lowest confidence should rank first");
  assert(items.some((item) => item.concept_id === "borrowing"), "old weak concept should be included");
  assert(!items.some((item) => item.concept_id === "vector"), "strong recent concept should be excluded");
  assert(items[0]!.reasons.length >= 2, "review reasons must be concrete");

  console.log("Phase 4 task 07 review due smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:review-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
