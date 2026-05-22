import {
  buildCommunityLearningPathActions,
  detectPrerequisiteCycles,
  scoreConceptDuplicateCandidate,
} from "../src/lib/tree/graph-quality";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const duplicate = scoreConceptDuplicateCandidate({
    source: {
      id: "self_attention",
      title: "Self Attention",
      normalizedTitle: "self attention",
      aliases: ["self-attention"],
      domain: "transformer",
      prerequisites: ["attention"],
    },
    target: {
      id: "self_attn",
      title: "Self-Attention",
      normalizedTitle: "self attention",
      aliases: ["self attention"],
      domain: "transformer",
      prerequisites: ["attention"],
    },
  });
  assert(duplicate.score >= 0.8, "duplicate candidate should combine title, alias, domain, and neighborhood signals");
  assert(duplicate.reasons.includes("normalized_title_match"), "duplicate reason should include normalized title");

  const cycles = detectPrerequisiteCycles([
    { from: "a", to: "b", relationType: "prerequisite" },
    { from: "b", to: "c", relationType: "prerequisite" },
    { from: "c", to: "a", relationType: "prerequisite" },
    { from: "a", to: "related-only", relationType: "related" },
  ]);
  assert(cycles.length === 1, "prerequisite cycle should be detected");
  assert(!cycles[0]!.includes("related-only"), "related edges must not affect prerequisite cycle detection");

  const actions = buildCommunityLearningPathActions({
    communities: [{ id: "linear", name: "Linear Algebra", node_ids: ["matrix"] }],
    recommendedOrder: ["matrix", "attention"],
  });
  assert(actions[0]?.start_node_id === "matrix", "community should expose a learning path start");
  assert(actions[0]?.deep_dive_topic === "Linear Algebra", "community should expose deep dive topic");

  console.log("Phase 6 task 09 graph quality smoke passed.");
}

void main().catch((error) => {
  console.error("[phase6:graph-quality-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
