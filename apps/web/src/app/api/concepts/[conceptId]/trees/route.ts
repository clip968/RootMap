import { jsonError } from "@/lib/api-errors";
import { getDb } from "@/db/client";
import {
  getConceptById,
  listTreesUsingConcept,
} from "@/lib/repository/concept-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ conceptId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { conceptId } = await ctx.params;
  const db = getDb();
  const c = await getConceptById(db, conceptId);
  if (!c) {
    return jsonError("NOT_FOUND", "개념을 찾을 수 없습니다.", 404);
  }
  const trees = (await listTreesUsingConcept(db, conceptId)).map((t) => ({
    tree_id: t.treeId,
    topic: t.topic,
    role_in_tree: t.roleInTree,
  }));
  return NextResponse.json({
    concept_id: conceptId,
    title: c.title,
    trees,
  });
}
