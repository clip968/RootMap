import type { LearningNodeRow } from "@/lib/repository/learning-repository";

export function buildPrerequisitePromptContext(
  node: LearningNodeRow,
  allNodes: LearningNodeRow[],
  recommendedOrder: string[],
): string {
  const byKey = Object.fromEntries(allNodes.map((n) => [n.nodeKey, n]));
  const pre = node.prerequisites
    .map((k) => byKey[k]?.title ?? k)
    .join(", ");
  const fol = node.children
    .map((k) => byKey[k]?.title ?? k)
    .join(", ");
  const ord = recommendedOrder.slice(0, 20).join(" → ");
  return [
    `Prerequisite concept titles: ${pre || "(none)"}`,
    `Related follow-on concept titles: ${fol || "(none)"}`,
    `Suggested study order (excerpt): ${ord || "(n/a)"}`,
  ].join("\n");
}
