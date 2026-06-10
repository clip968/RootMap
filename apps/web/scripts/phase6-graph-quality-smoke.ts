import {
  buildCommunityLearningPathActions,
  computeTransitiveReduction,
  detectPrerequisiteCycles,
  identifyCrossCommunityLinks,
  proposePrerequisiteCycleRepairs,
  scoreConceptDuplicateCandidate,
} from "../src/lib/tree/graph-quality";
import {
  deriveLearningGraphView,
  type ConceptGraphInputNode,
} from "../src/lib/tree/concept-graph";
import type { LearningEdgeQuality } from "../src/types/learning";

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

  // ──────────────────────────────────────────────
  // Phase 13: transitive reduction
  // A→B, B→C, A→C가 모두 있으면 A→C는 A→B→C로 함의되므로 redundant여야 한다.
  // ──────────────────────────────────────────────
  const reduction = computeTransitiveReduction([
    { from: "a", to: "b", relationType: "prerequisite" },
    { from: "b", to: "c", relationType: "prerequisite" },
    { from: "a", to: "c", relationType: "prerequisite" },
    { from: "a", to: "x", relationType: "related" },
  ]);
  assert(
    reduction.redundant.some((edge) => edge.from === "a" && edge.to === "c"),
    "transitive reduction should mark A→C redundant when A→B→C exists",
  );
  assert(
    reduction.reduced.some((edge) => edge.from === "a" && edge.to === "b") &&
      reduction.reduced.some((edge) => edge.from === "b" && edge.to === "c"),
    "transitive reduction should keep the direct chain edges",
  );
  assert(
    reduction.reduced.some((edge) => edge.from === "a" && edge.to === "x") &&
      !reduction.redundant.some((edge) => edge.relationType === "related"),
    "transitive reduction must never drop non-prerequisite relations",
  );

  // ──────────────────────────────────────────────
  // Phase 13: cross-community link 식별
  // 서로 다른 community를 잇는 related/application_of만 식별되고, 같은 community나 prerequisite은 제외.
  // ──────────────────────────────────────────────
  const communityByNode = new Map<string, string>([
    ["matrix", "linear"],
    ["softmax", "probability"],
    ["attention", "transformer"],
    ["self_attention", "transformer"],
  ]);
  const crossLinks = identifyCrossCommunityLinks(
    [
      { from: "matrix", to: "attention", relationType: "related" },
      { from: "attention", to: "self_attention", relationType: "related" },
      { from: "softmax", to: "attention", relationType: "application_of" },
      { from: "matrix", to: "attention", relationType: "prerequisite" },
    ],
    communityByNode,
  );
  assert(
    crossLinks.some((link) => link.from === "matrix" && link.to === "attention" && link.relation_type === "related"),
    "cross-community related link should be identified",
  );
  assert(
    crossLinks.some((link) => link.from === "softmax" && link.to === "attention"),
    "cross-community application_of link should be identified",
  );
  assert(
    !crossLinks.some((link) => link.from === "attention" && link.to === "self_attention"),
    "same-community link must not be flagged as cross-community",
  );
  assert(
    !crossLinks.some((link) => link.relation_type === "prerequisite"),
    "prerequisite edges must not be treated as cross-community links",
  );

  // ──────────────────────────────────────────────
  // Phase 13: cycle repair 후보 — 사이클 내 confidence 최저 간선을 끊을 후보로 제시.
  // ──────────────────────────────────────────────
  const repairs = proposePrerequisiteCycleRepairs([
    { from: "a", to: "b", relationType: "prerequisite", confidence: 0.9 },
    { from: "b", to: "c", relationType: "prerequisite", confidence: 0.3 },
    { from: "c", to: "a", relationType: "prerequisite", confidence: 0.8 },
  ]);
  assert(repairs.length === 1, "one cycle should yield one repair proposal");
  assert(
    repairs[0]!.cut_edge.from === "b" && repairs[0]!.cut_edge.to === "c",
    "cycle repair should cut the lowest-confidence edge (b→c)",
  );
  assert(
    Math.abs(repairs[0]!.confidence - 0.3) < 1e-9,
    "cycle repair should report the cut edge confidence",
  );

  // ──────────────────────────────────────────────
  // Phase 13: deriveLearningGraphView 하위 호환 — edges 인자가 depth/순서를 바꾸지 않아야 한다.
  // ──────────────────────────────────────────────
  const viewNodes: ConceptGraphInputNode[] = [
    { id: "a", title: "A", type: "prerequisite", community: "g", priority: 10, prerequisites: [] },
    { id: "b", title: "B", type: "prerequisite", community: "g", priority: 20, prerequisites: ["a"] },
    { id: "c", title: "C", type: "core", community: "g", priority: 30, prerequisites: ["b"] },
  ];
  const relationEdges: LearningEdgeQuality[] = [
    // 비-prerequisite 관계(related)는 depth에 영향을 주면 안 된다.
    { from: "c", to: "a", relation_type: "related", explanation: "되돌아보면 연결됨", confidence: 0.5, is_blocking: false },
    // 양끝 중 하나가 실제 노드가 아니면 보존 대상에서 빠져야 한다.
    { from: "a", to: "ghost", relation_type: "related", explanation: "유령", confidence: 0.5, is_blocking: false },
  ];
  const viewWithoutEdges = deriveLearningGraphView(viewNodes);
  const viewWithEdges = deriveLearningGraphView(viewNodes, relationEdges);
  const depthOf = (view: typeof viewWithEdges, id: string) =>
    view.nodes.find((node) => node.id === id)?.depth ?? -1;
  for (const id of ["a", "b", "c"]) {
    assert(
      depthOf(viewWithoutEdges, id) === depthOf(viewWithEdges, id),
      `edges arg must not change depth for ${id}`,
    );
  }
  assert(
    JSON.stringify(viewWithoutEdges.recommended_order) ===
      JSON.stringify(viewWithEdges.recommended_order),
    "edges arg must not change recommended_order",
  );
  assert(
    viewWithEdges.edges.length === 1 && viewWithEdges.edges[0]!.from === "c",
    "view should preserve only edges whose endpoints are real nodes",
  );
  assert(viewWithoutEdges.edges.length === 0, "view without edges arg should preserve no edges");

  console.log("Phase 6 task 09 + Phase 13 graph quality smoke passed.");
}

void main().catch((error) => {
  console.error("[phase6:graph-quality-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
