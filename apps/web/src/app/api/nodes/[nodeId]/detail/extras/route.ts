import { jsonError } from "@/lib/api-errors";
import { getNodeDetailExtrasForRequest } from "@/lib/services/node-detail";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const querySchema = z.object({
  tree_id: z.string().min(1),
});

type Ctx = { params: Promise<{ nodeId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { nodeId } = await ctx.params;
  const parsed = querySchema.safeParse({
    tree_id: new URL(req.url).searchParams.get("tree_id"),
  });

  if (!parsed.success) {
    return jsonError(
      "INVALID_REQUEST",
      "tree_id query parameter가 필요합니다.",
      400,
    );
  }

  try {
    const extras = await getNodeDetailExtrasForRequest(
      parsed.data.tree_id,
      nodeId,
    );
    return NextResponse.json(extras);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError(
        "NOT_FOUND",
        "노드 또는 트리를 찾을 수 없습니다.",
        404,
      );
    }
    if (e instanceof Error && e.message === "NODE_NOT_IN_TREE") {
      return jsonError("NOT_FOUND", "노드가 트리에 속하지 않습니다.", 404);
    }
    return jsonError(
      "PROCESSING_FAILED",
      "노드 연결 관계를 불러오지 못했습니다.",
      502,
    );
  }
}
