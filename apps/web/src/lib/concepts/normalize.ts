/**
 * Phase 2: 제목 정규화 — 검색·중복 비교 단일 규약.
 */
export function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();
}

/** URL/내부 식별용 슬러그 (충돌 시 저장소에서 접미 부여) */
export function baseSlugFromNormalizedTitle(normalized: string): string {
  let s = normalized.replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 72);
  if (!s) s = "concept";
  return s;
}
