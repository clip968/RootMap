import { jsonError } from "@/lib/api-errors";
import { getDb } from "@/db/client";
import {
  getConceptById,
  listEdgesForConcept,
  upsertConceptEdge,
} from "@/lib/repository/concept-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const postSchema = z.object({
  to_concept_id: z.string().min(1),
  relation_type: z.enum([
    "prerequisite",
    "part_of",
    "related",
    "misconception_of",
    "example_of",
    "application_of",
  ]),
  reason: z.string().optional(),
});

type Ctx = { params: Promise<{ conceptId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { conceptId } = await ctx.params;
  const db = getDb();
  const c = getConceptById(db, conceptId);
  if (!c) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }
  const edges = listEdgesForConcept(db, conceptId);
  const out = edges.map((e) => ({
    relation_type: e.relationType,
    direction: e.fromConceptId === conceptId ? "outgoing" : "incoming",
    target_concept_id:
      e.fromConceptId === conceptId ? e.toConceptId : e.fromConceptId,
    target_title: (() => {
      const tid = e.fromConceptId === conceptId ? e.toConceptId : e.fromConceptId;
      return getConceptById(db, tid)?.title ?? "";
    })(),
    reason: e.reason,
  }));
  return NextResponse.json({ concept_id: conceptId, title: c.title, edges: out });
}

export async function POST(req: Request, ctx: Ctx) {
  const { conceptId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(
      "INVALID_REQUEST",
      "JSON 형식의 요청 본문이 필요합니다.",
      400,
    );
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_REQUEST", "간선 본문이 올바르지 않습니다.", 400);
  }
  const db = getDb();
  const fromC = getConceptById(db, conceptId);
  const toC = getConceptById(db, parsed.data.to_concept_id);
  if (!fromC || !toC) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }
  upsertConceptEdge(
    db,
    conceptId,
    parsed.data.to_concept_id,
    parsed.data.relation_type,
    parsed.data.reason,
  );
  const edges = listEdgesForConcept(db, conceptId);
  const last = edges.find(
    (e) =>
      e.fromConceptId === conceptId &&
      e.toConceptId === parsed.data.to_concept_id &&
      e.relationType === parsed.data.relation_type,
  );
  return NextResponse.json({
    edge_id: last?.id ?? "",
    created: true,
  });
}
