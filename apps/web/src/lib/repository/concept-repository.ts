import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { RootMapDbClient } from "@/db/client";
import { concepts, conceptEdges, conceptMergeCandidates, learningTreeConcepts, learningTrees } from "@/db/schema";
import {
  baseSlugFromNormalizedTitle,
  normalizeTitle,
} from "@/lib/concepts/normalize";
import type { ConceptCandidate } from "@/types/learning";

export type ConceptRow = typeof concepts.$inferSelect;

function nowIso(): string {
  return new Date().toISOString();
}

function client(db: RootMapDbClient): RootMapDbClient {
  return db;
}

/** 신규 slug: 충돌 시 짧은 접미 추가 */
export function allocateUniqueSlug(base: string, db: RootMapDbClient): string {
  const d = client(db);
  const prefix = baseSlugFromNormalizedTitle(normalizeTitle(base)) || "concept";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? prefix : `${prefix}-${i + 1}`;
    const hit = d.select({ id: concepts.id }).from(concepts).where(eq(concepts.slug, candidate)).all();
    if (hit.length === 0) return candidate;
  }
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function findConceptByNormalizedTitle(
  db: RootMapDbClient,
  normalizedTitle: string,
  domain: string | null | undefined,
): ConceptRow | null {
  const d = client(db);
  const base = d
    .select()
    .from(concepts)
    .where(eq(concepts.normalizedTitle, normalizedTitle))
    .all();
  if (base.length === 0) return null;
  if (domain) {
    const dom = base.filter((r) => r.domain === domain);
    if (dom.length === 1) return dom[0]!;
    if (dom.length > 1) return dom.sort((a, b) => a.title.localeCompare(b.title))[0]!;
  }
  if (base.length === 1) return base[0]!;
  return base.sort((a, b) => a.title.localeCompare(b.title))[0]!;
}

export function findConceptByAlias(
  db: RootMapDbClient,
  aliasNormalized: string,
  domain: string | null | undefined,
): ConceptRow | null {
  const d = client(db);
  const rows = d
    .select()
    .from(concepts)
    .where(
      sql`exists (select 1 from json_each(${concepts.aliases}) j where lower(trim(j.value)) = ${aliasNormalized})`,
    )
    .all();
  if (rows.length === 0) return null;
  if (domain) {
    const dom = rows.filter((r) => r.domain === domain);
    if (dom.length >= 1) return dom[0]!;
  }
  return rows[0]!;
}

/** 같은 domain에서 제목이 한쪽이 다른 쪽을 포함하는 보수적 유사 매칭 */
export function findSimilarConceptInDomain(
  db: RootMapDbClient,
  normalizedTitle: string,
  domain: string | null | undefined,
): ConceptRow | null {
  if (!domain || !normalizedTitle || normalizedTitle.length < 4) return null;
  const d = client(db);
  const rows = d
    .select()
    .from(concepts)
    .where(eq(concepts.domain, domain))
    .all();
  let best: ConceptRow | null = null;
  for (const r of rows) {
    const nt = r.normalizedTitle;
    if (nt === normalizedTitle) continue;
    const shorter = nt.length < normalizedTitle.length ? nt : normalizedTitle;
    const longer = nt.length >= normalizedTitle.length ? nt : normalizedTitle;
    if (shorter.length === 0) continue;
    if (!longer.includes(shorter)) continue;
    if (shorter.length / longer.length < 0.5) continue;
    if (!best || r.updatedAt > best.updatedAt) best = r;
  }
  return best;
}

export type ResolveReuseResult =
  | { kind: "reused"; concept: ConceptRow }
  | { kind: "ambiguous_similar"; similar: ConceptRow }
  | { kind: "none" };

/**
 * reuse가 true일 때 기존 Concept 탐색.
 * 정확 일치·alias만 재사용. 제목 포함 일치 등 애매한 유사는 신규 생성 후 병합 후보로 처리한다.
 */
export function resolveConceptForReuse(
  db: RootMapDbClient,
  cand: ConceptCandidate,
): ResolveReuseResult {
  const nt = normalizeTitle(cand.canonical_title);
  if (!nt) return { kind: "none" };

  const byTitle = findConceptByNormalizedTitle(db, nt, cand.domain);
  if (byTitle) {
    return { kind: "reused", concept: byTitle };
  }

  for (const a of cand.aliases) {
    const an = normalizeTitle(a);
    if (!an) continue;
    const byAlias = findConceptByAlias(db, an, cand.domain);
    if (byAlias) {
      return { kind: "reused", concept: byAlias };
    }
  }

  const similar = findSimilarConceptInDomain(db, nt, cand.domain);
  if (similar) {
    return { kind: "ambiguous_similar", similar };
  }

  return { kind: "none" };
}

export function insertConceptFromCandidate(
  db: RootMapDbClient,
  cand: ConceptCandidate,
  slug: string,
): ConceptRow {
  const d = client(db);
  const ts = nowIso();
  const nt = normalizeTitle(cand.canonical_title);
  const rows = d
    .insert(concepts)
    .values({
      slug,
      title: cand.canonical_title.trim(),
      normalizedTitle: nt || normalizeTitle(cand.canonical_title),
      aliases: cand.aliases ?? [],
      domain: cand.domain ?? null,
      shortDescription: cand.short_description || null,
      explanation: null,
      difficulty: null,
      examples: [],
      commonMisconceptions: [],
      metadata: {},
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .all();
  const row = rows[0];
  if (!row) throw new Error("concepts insert failed");
  return row;
}

export function addAliasesIfNew(db: RootMapDbClient, conceptId: string, next: string[]): void {
  if (next.length === 0) return;
  const d = client(db);
  const cur = d.select({ aliases: concepts.aliases }).from(concepts).where(eq(concepts.id, conceptId)).all();
  const row = cur[0];
  if (!row) return;
  const set = new Set(
    row.aliases.map((a) => normalizeTitle(a)).filter(Boolean),
  );
  const merged = [...row.aliases];
  for (const a of next) {
    const n = normalizeTitle(a);
    if (!n || set.has(n)) continue;
    set.add(n);
    merged.push(a);
  }
  if (merged.length === row.aliases.length) return;
  d.update(concepts)
    .set({ aliases: merged, updatedAt: nowIso() })
    .where(eq(concepts.id, conceptId))
    .run();
}

export function tryRecordMergeCandidate(
  db: RootMapDbClient,
  sourceId: string,
  targetId: string,
  score: number,
  reason: string,
): void {
  if (sourceId === targetId) return;
  const d = client(db);
  try {
    d.insert(conceptMergeCandidates)
      .values({
        sourceConceptId: sourceId,
        targetConceptId: targetId,
        similarityScore: score,
        reason,
        status: "pending",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .run();
  } catch {
    /* UNIQUE 등은 무시 */
  }
}

export function upsertConceptEdge(
  db: RootMapDbClient,
  fromId: string,
  toId: string,
  relationType: string,
  reason?: string | null,
): void {
  if (fromId === toId) return;
  const d = client(db);
  const ts = nowIso();
  try {
    d.insert(conceptEdges)
      .values({
        fromConceptId: fromId,
        toConceptId: toId,
        relationType,
        reason: reason ?? null,
        strength: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  } catch {
    /* UNIQUE */
  }
}

/** 트리 생성 프롬프트에 넣을 최근·검색 Concept 스니펫 */
export function searchConceptsForPromptContext(
  db: RootMapDbClient,
  topic: string,
  limit: number,
): ConceptRow[] {
  const d = client(db);
  const tokens = topic
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);
  const recent = d
    .select()
    .from(concepts)
    .orderBy(desc(concepts.updatedAt))
    .limit(Math.min(limit, 40))
    .all();

  if (tokens.length === 0) return recent.slice(0, limit);

  const patterns = tokens.map((t) => like(concepts.normalizedTitle, `%${t}%`));
  const match = d
    .select()
    .from(concepts)
    .where(or(...patterns))
    .orderBy(desc(concepts.updatedAt))
    .limit(limit)
    .all();

  const seen = new Set<string>();
  const out: ConceptRow[] = [];
  for (const r of [...match, ...recent]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatConceptsForPrompt(rows: ConceptRow[]): string {
  if (rows.length === 0) {
    return "(아직 저장된 개념이 없습니다. 새 Concept 후보를 제안하세요.)";
  }
  return rows
    .map(
      (r) =>
        `- ${r.title} (domain: ${r.domain ?? "미지정"}) — ${r.shortDescription ?? r.explanation ?? ""}`.trim(),
    )
    .join("\n");
}

export function getConceptById(db: RootMapDbClient, id: string): ConceptRow | null {
  const rows = client(db)
    .select()
    .from(concepts)
    .where(eq(concepts.id, id))
    .all();
  return rows[0] ?? null;
}

export function updateConceptPatch(
  db: RootMapDbClient,
  id: string,
  patch: {
    aliases?: string[];
    shortDescription?: string | null;
    difficulty?: number | null;
    explanation?: string | null;
  },
): boolean {
  const d = client(db);
  const ts = nowIso();
  const updates: Partial<typeof concepts.$inferInsert> = { updatedAt: ts };
  if (patch.aliases !== undefined) updates.aliases = patch.aliases;
  if (patch.shortDescription !== undefined)
    updates.shortDescription = patch.shortDescription ?? null;
  if (patch.difficulty !== undefined) updates.difficulty = patch.difficulty ?? null;
  if (patch.explanation !== undefined) updates.explanation = patch.explanation ?? null;
  const r = d.update(concepts).set(updates).where(eq(concepts.id, id)).run();
  return r.changes > 0;
}

export function listConcepts(
  db: RootMapDbClient,
  q: { search?: string; domain?: string; limit: number },
): ConceptRow[] {
  const d = client(db);
  const conds = [];
  if (q.search?.trim()) {
    const raw = q.search.trim();
    const nt = normalizeTitle(raw).replace(/%/g, "");
    const s = nt ? `%${nt}%` : `%${raw}%`;
    conds.push(
      or(
        like(concepts.normalizedTitle, s),
        like(concepts.title, `%${raw}%`),
        sql`exists (select 1 from json_each(${concepts.aliases}) j where j.value like ${"%" + raw.replace(/%/g, "") + "%"})`,
      ),
    );
  }
  if (q.domain?.trim()) {
    conds.push(eq(concepts.domain, q.domain.trim()));
  }
  if (conds.length === 0) {
    return d
      .select()
      .from(concepts)
      .orderBy(desc(concepts.updatedAt))
      .limit(q.limit)
      .all();
  }
  const w = conds.length === 1 ? conds[0]! : and(...conds);
  return d
    .select()
    .from(concepts)
    .where(w)
    .orderBy(desc(concepts.updatedAt))
    .limit(q.limit)
    .all();
}

export function listEdgesForConcept(
  db: RootMapDbClient,
  conceptId: string,
): (typeof conceptEdges.$inferSelect)[] {
  return client(db)
    .select()
    .from(conceptEdges)
    .where(
      or(
        eq(conceptEdges.fromConceptId, conceptId),
        eq(conceptEdges.toConceptId, conceptId),
      ),
    )
    .all();
}

export function listTreesUsingConcept(
  db: RootMapDbClient,
  conceptId: string,
): { treeId: string; topic: string; roleInTree: string }[] {
  return client(db)
    .select({
      treeId: learningTrees.id,
      topic: learningTrees.topic,
      roleInTree: learningTreeConcepts.roleInTree,
    })
    .from(learningTreeConcepts)
    .innerJoin(
      learningTrees,
      eq(learningTreeConcepts.treeId, learningTrees.id),
    )
    .where(eq(learningTreeConcepts.conceptId, conceptId))
    .all();
}
