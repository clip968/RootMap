export function buildDeepDiveGenerationTopic(
  nodeTitle: string,
  relationTitles: string[],
): string {
  const trimmedTitle = nodeTitle.trim();
  const related = relationTitles
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (related.length === 0) return `${trimmedTitle} 세부 학습`;
  return `${trimmedTitle} 세부 학습: ${related.join(", ")}`;
}
