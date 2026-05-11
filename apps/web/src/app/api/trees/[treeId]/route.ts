import { jsonError } from "@/lib/api-errors";
import { DEFAULT_USER_ID } from "@/db/constants";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { getDocumentTreeContextForUser } from "@/lib/repository/document-repository";
import { bundleToApiTreeResponse } from "@/lib/tree/bundle-to-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { treeId } = await ctx.params;
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    return jsonError(
      "NOT_FOUND",
      "해당 학습 트리를 찾을 수 없습니다.",
      404,
    );
  }
  const documentContext = getDocumentTreeContextForUser(treeId, DEFAULT_USER_ID);
  return NextResponse.json(bundleToApiTreeResponse(bundle, { documentContext }));
}
