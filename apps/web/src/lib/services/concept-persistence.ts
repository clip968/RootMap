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

function logConceptPersistence(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "concept-persistence", event, ...details });
}

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
    requestId?: string;
  },
): void {
  const { treeId, tree, nodeKeyToDbId, reuseConcepts, requestId } = params;
  const startedAt = Date.now();
  const nodeKeyToConceptId = new Map<string, string>();

  if (requestId) {
    logConceptPersistence("start", {
      requestId,
      treeId,
      nodeCount: tree.nodes.length,
      explicitEdgeCount: tree.edges?.length ?? 0,
      reuseConcepts,
    });
  }

  for (const n of tree.nodes) {
    const dbNodeId = nodeKeyToDbId.get(n.id);
    if (!dbNodeId) continue;

    const nodeStartedAt = Date.now();
    const cand = ensureConceptCandidate(n);
    let conceptId: string;
    let reused = false;
    let outcome: "reused" | "new" | "new_with_merge_candidate" = "new";

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
        outcome = "reused";
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
          outcome = "new_with_merge_candidate";
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

    if (requestId) {
      logConceptPersistence("node_resolved", {
        requestId,
        nodeKey: n.id,
        durationMs: Date.now() - nodeStartedAt,
        aliasCount: cand.aliases.length,
        reused,
        outcome,
        conceptId,
      });
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

  let prerequisiteEdgeCount = 0;
  /* 노드 prerequisite 링크로 명시적 prerequisite 간선 보강 */
  for (const n of tree.nodes) {
    const toC = nodeKeyToConceptId.get(n.id);
    if (!toC) continue;
    for (const preKey of n.prerequisites) {
      const fromC = nodeKeyToConceptId.get(preKey);
      if (fromC) {
        upsertConceptEdge(db, fromC, toC, "prerequisite", "learning tree structure");
        prerequisiteEdgeCount += 1;
      }
    }
  }

  if (requestId) {
    logConceptPersistence("complete", {
      requestId,
      durationMs: Date.now() - startedAt,
      nodeCount: tree.nodes.length,
      explicitEdgeCount: edges.length,
      prerequisiteEdgeCount,
      reuseConcepts,
    });
  }
}
