import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { getDocumentTreeContextForUser } from "@/lib/repository/document-repository";
import { bundleToApiTreeResponse } from "@/lib/tree/bundle-to-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const { treeId } = await ctx.params;
  const bundle = await getLearningTree(treeId, auth.userId);
  if (!bundle) {
    return jsonError(
      "NOT_FOUND",
      "해당 학습 트리를 찾을 수 없습니다.",
      404,
    );
  }
  const documentContext = await getDocumentTreeContextForUser(treeId, auth.userId);
  return NextResponse.json(bundleToApiTreeResponse(bundle, { documentContext }));
}
