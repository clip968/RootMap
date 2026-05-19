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

/**
 * Phase 2: LLM이 트리와 함께 내려준 `concept_candidate`를
 * 글로벌 `concepts` 테이블의 행으로 "확정"하고, 학습 노드에 `concept_id`를 붙입니다.
 *
 * - `reuseConcepts === true`: 제목 정규화·유사도로 기존 행 재사용 시도, 아니면 새로 insert
 * - `reuseConcepts === false`: 항상 새 Concept (중복 허용)
 * - 트리 수준 `edges`와 노드 `prerequisites` 둘 다 Concept 간 prerequisite 간선으로 반영
 */

function logConceptPersistence(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "concept-persistence", event, ...details });
}

function ensureConceptCandidate(
  node: LearningTreeResponse["nodes"][number],
): ConceptCandidate {
  /** LLM이 후보를 안 주면 노드 제목/설명에서 최소 필드만 채움 */
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

export async function persistPhase2Concepts(
  db: RootMapDbClient,
  params: {
    treeId: string;
    tree: LearningTreeResponse;
    nodeKeyToDbId: Map<string, string>;
    reuseConcepts: boolean;
    requestId?: string;
  },
): Promise<void> {
  const { treeId, tree, nodeKeyToDbId, reuseConcepts, requestId } = params;
  const startedAt = Date.now();
  /** LLM 노드 id → 방금 확정한 concept UUID — edge 해석에 필요 */
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
      /** 강제 신규: slug 충돌 방지까지 포함해 insert */
      const slug = await allocateUniqueSlug(cand.canonical_title, db);
      const row = await insertConceptFromCandidate(db, cand, slug);
      conceptId = row.id;
      reused = false;
    } else {
      const res = await resolveConceptForReuse(db, cand);
      if (res.kind === "reused") {
        conceptId = res.concept.id;
        reused = true;
        outcome = "reused";
        /** 재사용 시에도 이번 트리에서 쓴 별칭·표기는 aliases로 흡수 */
        const extraAliases = [
          ...cand.aliases,
          ...(normalizeTitle(cand.canonical_title) !==
          normalizeTitle(res.concept.title)
            ? [cand.canonical_title]
            : []),
        ];
        await addAliasesIfNew(db, conceptId, extraAliases);
      } else {
        const slug = await allocateUniqueSlug(cand.canonical_title, db);
        const row = await insertConceptFromCandidate(db, cand, slug);
        conceptId = row.id;
        reused = false;
        if (res.kind === "ambiguous_similar") {
          outcome = "new_with_merge_candidate";
          /** 관리자 병합 큐에 넣음 — 자동 병합은 하지 않음 */
          await tryRecordMergeCandidate(
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

    /** `learning_nodes`에 Phase 2 외래키 + 이번 생성에서 재사용 여부 플래그 */
    await db.update(learningNodes)
      .set({
        conceptId,
        isReusedConcept: reused,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(learningNodes.id, dbNodeId));

    /** 이 트리 안에서 노드가 어떤 Concept 역할인지 join 테이블에 기록 — UNIQUE 충돌은 무시 */
    await db.insert(learningTreeConcepts)
      .values({
        treeId,
        learningNodeId: dbNodeId,
        conceptId,
        roleInTree: n.type,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing();

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
    await upsertConceptEdge(db, fromC, toC, e.relation_type, e.reason ?? null);
  }

  let prerequisiteEdgeCount = 0;
  /* 노드 prerequisite 링크로 명시적 prerequisite 간선 보강 */
  for (const n of tree.nodes) {
    const toC = nodeKeyToConceptId.get(n.id);
    if (!toC) continue;
    for (const preKey of n.prerequisites) {
      const fromC = nodeKeyToConceptId.get(preKey);
      if (fromC) {
        await upsertConceptEdge(db, fromC, toC, "prerequisite", "learning tree structure");
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
