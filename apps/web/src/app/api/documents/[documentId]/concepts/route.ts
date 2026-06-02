import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  getDocumentForUser,
  listDocumentConceptsForUser,
} from "@/lib/repository/document-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { documentId } = await ctx.params;
  const document = await getDocumentForUser(documentId, auth.userId);
  if (!document) {
    return jsonError("NOT_FOUND", "문서를 찾을 수 없습니다.", 404);
  }

  return NextResponse.json({
    document_id: documentId,
    concepts: await listDocumentConceptsForUser(documentId, auth.userId),
  });
}
