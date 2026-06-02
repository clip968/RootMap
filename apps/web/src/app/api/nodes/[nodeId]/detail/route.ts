import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import {
  LlmProviderRequiredError,
  LLM_PROVIDER_REQUIRED_MESSAGE,
} from "@/lib/llm/provider-config";
import {
  getOrCreateNodeDetailForRequest,
  getReadyNodeDetailForRequest,
} from "@/lib/services/node-detail";
import {
  CURRENT_NODE_DETAIL_VERSION,
  enqueueNodeDetailJob,
} from "@/lib/repository/node-detail-job-repository";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  tree_id: z.string().min(1),
});

type Ctx = { params: Promise<{ nodeId: string }> };

function NODE_DETAIL_ASYNC_ENABLED(): boolean {
  return process.env.NODE_DETAIL_ASYNC_ENABLED === "true";
}

export async function POST(req: Request, ctx: Ctx) {
  const { nodeId } = await ctx.params;
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

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
      "INVALID_REQUEST",
      "tree_id 필드가 필요합니다.",
      400,
    );
  }

  const { tree_id: treeId } = parsed.data;

  try {
    const bundle = await getLearningTree(treeId, auth.userId);
    if (!bundle) {
      return jsonError(
        "NOT_FOUND",
        "노드 또는 트리를 찾을 수 없습니다.",
        404,
      );
    }
    const node = bundle.nodes.find((n) => n.id === nodeId);
    if (!node || node.treeId !== treeId) {
      return jsonError("NOT_FOUND", "노드가 트리에 속하지 않습니다.", 404);
    }

    if (NODE_DETAIL_ASYNC_ENABLED()) {
      const ready = await getReadyNodeDetailForRequest(
        treeId,
        nodeId,
        auth.userId,
      );
      if (ready.status === "ready") {
        return NextResponse.json(
          { status: "ready", detail: ready.detail },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const job = await enqueueNodeDetailJob({
        treeId,
        nodeId,
        detailVersion: CURRENT_NODE_DETAIL_VERSION,
      });
      return NextResponse.json(
        {
          status: "queued",
          job_id: job.id,
        },
        {
          status: 202,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const detail = await getOrCreateNodeDetailForRequest(
      treeId,
      nodeId,
      auth.userId,
    );
    return NextResponse.json(detail);
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
    if (e instanceof LlmProviderRequiredError) {
      return jsonError(
        "LLM_PROVIDER_REQUIRED",
        LLM_PROVIDER_REQUIRED_MESSAGE,
        400,
      );
    }
    if (e instanceof LlmExhaustedRetriesError) {
      const c = e.cause;
      if (c instanceof LlmValidationError || c instanceof LlmParseError) {
        return jsonError(
          "INVALID_LLM_RESPONSE",
          "노드 설명 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          422,
        );
      }
      return jsonError(
        "LLM_GENERATION_FAILED",
        "노드 설명을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
    if (e instanceof LlmTransportError) {
      return jsonError(
        "LLM_GENERATION_FAILED",
        "노드 설명을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
    return jsonError(
      "LLM_GENERATION_FAILED",
      "노드 설명을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}
