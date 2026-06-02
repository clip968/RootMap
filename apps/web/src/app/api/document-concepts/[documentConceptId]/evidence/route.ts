import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { getDocumentConceptEvidenceForUser } from "@/lib/repository/document-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentConceptId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { documentConceptId } = await ctx.params;
  const evidence = await getDocumentConceptEvidenceForUser(
    documentConceptId,
    auth.userId,
  );
  if (!evidence) {
    return jsonError("NOT_FOUND", "문서 개념 출처를 찾을 수 없습니다.", 404);
  }

  return NextResponse.json(evidence);
}
