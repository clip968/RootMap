import { jsonError } from "@/lib/api-errors";
import { getDb } from "@/db/client";
import {
  getConceptById,
  listEdgesForConcept,
  updateConceptPatch,
} from "@/lib/repository/concept-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const patchSchema = z.object({
  aliases: z.array(z.string()).optional(),
  short_description: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  explanation: z.string().nullable().optional(),
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
  const prerequisites: Array<{
    relation_type: string;
    target_concept_id: string;
    target_title: string;
    reason: string | null;
  }> = [];
  const usedBy: typeof prerequisites = [];
  const related: typeof prerequisites = [];

  for (const e of edges) {
    const isOut = e.fromConceptId === conceptId;
    const targetId = isOut ? e.toConceptId : e.fromConceptId;
    const target = getConceptById(db, targetId);
    if (!target) continue;
    const row = {
      relation_type: e.relationType,
      target_concept_id: target.id,
      target_title: target.title,
      reason: e.reason,
    };
    if (e.relationType === "prerequisite") {
      if (e.toConceptId === conceptId) prerequisites.push(row);
      else usedBy.push(row);
    } else {
      related.push(row);
    }
  }

  return NextResponse.json({
    id: c.id,
    title: c.title,
    aliases: c.aliases,
    domain: c.domain,
    short_description: c.shortDescription,
    explanation: c.explanation,
    examples: c.examples,
    common_misconceptions: c.commonMisconceptions,
    difficulty: c.difficulty,
    edges: {
      prerequisites,
      used_by: usedBy,
      related,
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_REQUEST", "허용되지 않은 필드입니다.", 400);
  }

  const db = getDb();
  const ok = updateConceptPatch(db, conceptId, {
    aliases: parsed.data.aliases,
    shortDescription: parsed.data.short_description,
    difficulty: parsed.data.difficulty,
    explanation: parsed.data.explanation,
  });
  if (!ok) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }
  return NextResponse.json({ id: conceptId, updated: true });
}
