import { jsonError } from "@/lib/api-errors";
import { DEFAULT_USER_ID } from "@/db/constants";
import {
  getLearningTree,
  getNodeById,
  upsertNodeProgress,
  upsertUserConceptProgress,
} from "@/lib/repository/learning-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: z.enum(["known", "partial", "unknown"]),
});

type Ctx = { params: Promise<{ nodeId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { nodeId } = await ctx.params;

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "INVALID_STATUS",
      "status는 known, partial, unknown 중 하나여야 합니다.",
      400,
    );
  }

  const node = await getNodeById(nodeId);
  if (!node) {
    return jsonError("NOT_FOUND", "노드를 찾을 수 없습니다.", 404);
  }

  const bundle = await getLearningTree(node.treeId, DEFAULT_USER_ID);
  if (!bundle) {
    return jsonError(
      "FORBIDDEN",
      "이 트리에 접근할 수 없습니다.",
      403,
    );
  }

  await upsertNodeProgress(
    DEFAULT_USER_ID,
    node.treeId,
    nodeId,
    parsed.data.status,
  );
  if (node.conceptId) {
    await upsertUserConceptProgress(
      DEFAULT_USER_ID,
      node.conceptId,
      parsed.data.status,
    );
  }

  return NextResponse.json({
    node_id: nodeId,
    status: parsed.data.status,
  });
}
