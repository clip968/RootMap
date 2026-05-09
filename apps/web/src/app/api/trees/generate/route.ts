import { jsonError } from "@/lib/api-errors";
import {
  InvalidTopicError,
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import {
  generateAndPersistTree,
  TreePersistError,
} from "@/lib/services/learning-tree-generate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function createRequestId(): string {
  return `tree-generate-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function logGenerateRoute(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "route", event, ...details });
}

export async function POST(req: Request) {
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
  if (
    !body ||
    typeof body !== "object" ||
    !("topic" in body)
  ) {
    return jsonError(
      "INVALID_REQUEST",
      "topic 필드가 필요합니다.",
      400,
    );
  }

  const requestId = createRequestId();
  const startedAt = Date.now();
  const reuseConcepts =
    body &&
    typeof body === "object" &&
    "reuse_concepts" in body &&
    typeof (body as { reuse_concepts: unknown }).reuse_concepts ===
      "boolean" ?
      (body as { reuse_concepts: boolean }).reuse_concepts
    : true;

  logGenerateRoute("start", { requestId, reuseConcepts });

  try {
    const data = await generateAndPersistTree(
      (body as { topic: unknown }).topic,
      { reuseConcepts, requestId },
    );
    logGenerateRoute("success", {
      requestId,
      reuseConcepts,
      durationMs: Date.now() - startedAt,
      nodeCount: data.nodes.length,
      qualityWarningCount: data.quality_warnings.length,
    });
    return NextResponse.json(data);
  } catch (e) {
    const durationMs = Date.now() - startedAt;
    if (e instanceof InvalidTopicError) {
      logGenerateRoute("failure", {
        requestId,
        reuseConcepts,
        durationMs,
        status: 400,
        errorClass: e.name,
      });
      return jsonError("INVALID_TOPIC", e.message, 400);
    }
    if (e instanceof LlmExhaustedRetriesError) {
      const c = e.cause;
      if (c instanceof LlmValidationError || c instanceof LlmParseError) {
        logGenerateRoute("failure", {
          requestId,
          reuseConcepts,
          durationMs,
          status: 422,
          errorClass: c.name,
        });
        return jsonError(
          "INVALID_LLM_RESPONSE",
          "학습 트리 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          422,
        );
      }
      logGenerateRoute("failure", {
        requestId,
        reuseConcepts,
        durationMs,
        status: 502,
        errorClass: c instanceof Error ? c.name : e.name,
      });
      return jsonError(
        "LLM_GENERATION_FAILED",
        "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
    if (e instanceof LlmTransportError) {
      logGenerateRoute("failure", {
        requestId,
        reuseConcepts,
        durationMs,
        status: 502,
        llmStatus: e.status,
        errorClass: e.name,
      });
      return jsonError(
        "LLM_GENERATION_FAILED",
        "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
    if (e instanceof TreePersistError) {
      logGenerateRoute("failure", {
        requestId,
        reuseConcepts,
        durationMs,
        status: 500,
        errorClass: e.name,
      });
      return jsonError(
        "TREE_SAVE_FAILED",
        "생성 결과를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        500,
      );
    }
    logGenerateRoute("failure", {
      requestId,
      reuseConcepts,
      durationMs,
      status: 502,
      errorClass: e instanceof Error ? e.name : "UnknownError",
    });
    return jsonError(
      "LLM_GENERATION_FAILED",
      "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}
