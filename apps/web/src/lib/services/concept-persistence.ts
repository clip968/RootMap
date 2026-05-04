import { eq } from "drizzle-orm";
import type { RootMapDbClient } from "@/db/client";
import { learningNodes, learningTreeConcepts } from "@/db/schema";
import type { ConceptCandidate } from "@/types/learning";
import type { LearningTreeResponse } from "@/types/learning";
import {
  addAliasesIfNew,
  allocateUniqueSlug,
  insertConceptFromCandidate,
  resolveConceptForReuse,
  tryRecordMergeCandidate,
  upsertConceptEdge,
} from "@/lib/repository/concept-repository";
import { normalizeTitle } from "@/lib/concepts/normalize";

function ensureConceptCandidate(
  node: LearningTreeResponse["nodes"][number],
): ConceptCandidate {
  if (node.concept_candidate) {
    return {
      canonical_title: node.concept_candidate.canonical_title.trim() || node.title,
      aliases: node.concept_candidate.aliases ?? [],
      domain: node.concept_candidate.domain ?? null,
      short_description:
        node.concept_candidate.short_description?.trim() ??
        node.description.slice(0, 500),
      is_reusable: node.concept_candidate.is_reusable ?? true,
    };
  }
  return {
    canonical_title: node.title.trim(),
    aliases: [],
    domain: null,
    short_description: node.description.slice(0, 500),
    is_reusable: true,
  };
}

export function persistPhase2Concepts(
  db: RootMapDbClient,
  params: {
    treeId: string;
    tree: LearningTreeResponse;
    nodeKeyToDbId: Map<string, string>;
    reuseConcepts: boolean;
  },
): void {
  const { treeId, tree, nodeKeyToDbId, reuseConcepts } = params;
  const nodeKeyToConceptId = new Map<string, string>();

  for (const n of tree.nodes) {
    const dbNodeId = nodeKeyToDbId.get(n.id);
    if (!dbNodeId) continue;

    const cand = ensureConceptCandidate(n);
    let conceptId: string;
    let reused = false;

    if (!reuseConcepts) {
      const slug = allocateUniqueSlug(cand.canonical_title, db);
      const row = insertConceptFromCandidate(db, cand, slug);
      conceptId = row.id;
      reused = false;
    } else {
      const res = resolveConceptForReuse(db, cand);
      if (res.kind === "reused") {
        conceptId = res.concept.id;
        reused = true;
        const extraAliases = [
          ...cand.aliases,
          ...(normalizeTitle(cand.canonical_title) !==
          normalizeTitle(res.concept.title)
            ? [cand.canonical_title]
            : []),
        ];
        addAliasesIfNew(db, conceptId, extraAliases);
      } else {
        const slug = allocateUniqueSlug(cand.canonical_title, db);
        const row = insertConceptFromCandidate(db, cand, slug);
        conceptId = row.id;
        reused = false;
        if (res.kind === "ambiguous_similar") {
          tryRecordMergeCandidate(
            db,
            row.id,
            res.similar.id,
            0.55,
            `domain 내 유사 제목: "${row.title}" vs "${res.similar.title}"`,
          );
        }
      }
    }

    nodeKeyToConceptId.set(n.id, conceptId);

    db.update(learningNodes)
      .set({
        conceptId,
        isReusedConcept: reused,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(learningNodes.id, dbNodeId))
      .run();

    try {
      db.insert(learningTreeConcepts)
        .values({
          treeId,
          learningNodeId: dbNodeId,
          conceptId,
          roleInTree: n.type,
          createdAt: new Date().toISOString(),
        })
        .run();
    } catch {
      /* UNIQUE 등 */
    }
  }

  const edges = tree.edges ?? [];
  for (const e of edges) {
    const fromC = nodeKeyToConceptId.get(e.from);
    const toC = nodeKeyToConceptId.get(e.to);
    if (!fromC || !toC) continue;
    /** 명세: prerequisite면 from이 선수, to가 이후 */
    upsertConceptEdge(db, fromC, toC, e.relation_type, e.reason ?? null);
  }

  /* 노드 prerequisite 링크로 명시적 prerequisite 간선 보강 */
  for (const n of tree.nodes) {
    const toC = nodeKeyToConceptId.get(n.id);
    if (!toC) continue;
    for (const preKey of n.prerequisites) {
      const fromC = nodeKeyToConceptId.get(preKey);
      if (fromC) {
        upsertConceptEdge(db, fromC, toC, "prerequisite", "learning tree structure");
      }
    }
  }
}
