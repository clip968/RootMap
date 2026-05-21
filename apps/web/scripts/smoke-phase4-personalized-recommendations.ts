/**
 * Phase 4 task 05 personalized recommendation smoke.
 *
 * 추천 core는 DB 없이 순수 함수로 검증한다. API route는 같은 서비스를 호출하고 추천 노출을
 * recommendation_logs에 남기는지 source contract로 확인한다.
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
  const serviceSource = readSource("src/lib/recommendation/personalized.ts");
  const treeRouteSource = readSource("src/app/api/trees/[treeId]/personalized/route.ts");
  const recommendationRouteSource = readSource(
    "src/app/api/trees/[treeId]/recommendations/personalized/route.ts",
  );
  assert(serviceSource.includes("calculateNodeRecommendationScore"), "personalized service must expose scoring");
  assert(treeRouteSource.includes("personalized_nodes"), "personalized tree route must return personalized_nodes");
  assert(recommendationRouteSource.includes("createRecommendationLog"), "recommendation route must log exposures");

  const [treeRoute, recommendationRoute] = await Promise.all([
    import("../src/app/api/trees/[treeId]/personalized/route"),
    import("../src/app/api/trees/[treeId]/recommendations/personalized/route"),
  ]);
  assert(typeof treeRoute.GET === "function", "personalized tree route GET export missing");
  assert(typeof recommendationRoute.GET === "function", "personalized recommendation route GET export missing");

  const {
    buildPersonalizedNodes,
    recommendPersonalizedNodes,
    calculateNodeRecommendationScore,
  } = await import("../src/lib/recommendation/personalized");

  const nodes = [
    {
      nodeId: "vector-node",
      nodeKey: "vector",
      title: "Vector",
      type: "prerequisite",
      difficulty: 1,
      prerequisites: [],
      conceptId: "vector-concept",
    },
    {
      nodeId: "softmax-node",
      nodeKey: "softmax",
      title: "Softmax",
      type: "prerequisite",
      difficulty: 2,
      prerequisites: ["vector"],
      conceptId: "softmax-concept",
    },
    {
      nodeId: "attention-node",
      nodeKey: "self_attention",
      title: "Self-Attention",
      type: "core",
      difficulty: 4,
      prerequisites: ["vector", "softmax"],
      conceptId: "attention-concept",
    },
    {
      nodeId: "multi-node",
      nodeKey: "multi_head",
      title: "Multi-Head Attention",
      type: "core",
      difficulty: 5,
      prerequisites: ["self_attention"],
      conceptId: "multi-concept",
    },
  ];

  const userA = new Map([
    ["vector-concept", { status: "known", confidenceScore: 0.9, wrongCount: 0, correctCount: 2, lastStudiedAt: new Date("2026-05-20T00:00:00.000Z") }],
    ["softmax-concept", { status: "partial", confidenceScore: 0.45, wrongCount: 1, correctCount: 0, lastStudiedAt: new Date("2026-05-01T00:00:00.000Z") }],
    ["attention-concept", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, lastStudiedAt: null }],
  ]);

  const userB = new Map([
    ["vector-concept", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, lastStudiedAt: null }],
    ["softmax-concept", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, lastStudiedAt: null }],
    ["attention-concept", { status: "unknown", confidenceScore: 0.1, wrongCount: 0, correctCount: 0, lastStudiedAt: null }],
  ]);

  const aRecommended = recommendPersonalizedNodes(nodes, userA, { now: new Date("2026-05-21T00:00:00.000Z") });
  const bRecommended = recommendPersonalizedNodes(nodes, userB, { now: new Date("2026-05-21T00:00:00.000Z") });

  assert(aRecommended[0]?.node_id === "softmax-node", "user A should review partial prerequisite first");
  assert(bRecommended[0]?.node_id === "vector-node", "user B should start from first unknown prerequisite");
  assert(!aRecommended.some((node) => node.node_id === "vector-node"), "known concepts must be excluded");
  assert(aRecommended[0]!.reasons.length >= 2, "recommendation reasons must be concrete");

  const personalized = buildPersonalizedNodes(nodes, userA, { now: new Date("2026-05-21T00:00:00.000Z") });
  const vector = personalized.find((node) => node.node_id === "vector-node");
  const softmax = personalized.find((node) => node.node_id === "softmax-node");
  assert(vector?.status === "known" && vector.is_recommended === false, "known node personalization");
  assert(softmax?.is_recommended === true, "partial prerequisite should be marked recommended");

  const score = calculateNodeRecommendationScore(nodes[1]!, userA.get("softmax-concept")!, {
    now: new Date("2026-05-21T00:00:00.000Z"),
    prerequisiteGap: 0,
    importance: 0.7,
  });
  assert(score > 0.5 && score <= 1, `expected useful score for weak Softmax, got ${score}`);

  console.log("Phase 4 task 05 personalized recommendation smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:personalized-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
