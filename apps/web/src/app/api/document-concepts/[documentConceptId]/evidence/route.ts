import { DEFAULT_USER_ID } from "@/db/constants";
import { jsonError } from "@/lib/api-errors";
import { getDocumentConceptEvidenceForUser } from "@/lib/repository/document-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentConceptId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { documentConceptId } = await ctx.params;
  const evidence = getDocumentConceptEvidenceForUser(
    documentConceptId,
    DEFAULT_USER_ID,
  );
  if (!evidence) {
    return jsonError("NOT_FOUND", "문서 개념 출처를 찾을 수 없습니다.", 404);
  }

  return NextResponse.json(evidence);
}
