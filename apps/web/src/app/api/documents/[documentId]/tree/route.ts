import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  getDocumentForUser,
  getDocumentLearningTreeForUser,
  getDocumentTreeContextForUser,
} from "@/lib/repository/document-repository";
import { bundleToApiTreeResponse } from "@/lib/tree/bundle-to-api";
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
  if (document.processingStatus !== "tree_generated") {
    return jsonError(
      "INVALID_STATUS",
      "아직 문서 기반 학습 트리가 생성되지 않았습니다.",
      409,
    );
  }

  const bundle = await getDocumentLearningTreeForUser(documentId, auth.userId);
  if (!bundle) {
    return jsonError("NOT_FOUND", "문서 기반 학습 트리를 찾을 수 없습니다.", 404);
  }

  const documentContext = await getDocumentTreeContextForUser(
    bundle.tree.id,
    auth.userId,
  );

  return NextResponse.json({
    document_id: documentId,
    ...bundleToApiTreeResponse(bundle, { documentContext }),
  });
}
