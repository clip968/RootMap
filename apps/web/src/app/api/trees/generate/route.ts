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

  try {
    const reuseConcepts =
      body &&
      typeof body === "object" &&
      "reuse_concepts" in body &&
      typeof (body as { reuse_concepts: unknown }).reuse_concepts ===
        "boolean" ?
        (body as { reuse_concepts: boolean }).reuse_concepts
      : true;

    const data = await generateAndPersistTree(
      (body as { topic: unknown }).topic,
      { reuseConcepts },
    );
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof InvalidTopicError) {
      return jsonError("INVALID_TOPIC", e.message, 400);
    }
    if (e instanceof LlmExhaustedRetriesError) {
      const c = e.cause;
      if (c instanceof LlmValidationError || c instanceof LlmParseError) {
        return jsonError(
          "INVALID_LLM_RESPONSE",
          "학습 트리 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          422,
        );
      }
      return jsonError(
        "LLM_GENERATION_FAILED",
        "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
    if (e instanceof LlmTransportError) {
      return jsonError(
        "LLM_GENERATION_FAILED",
        "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
    if (e instanceof TreePersistError) {
      return jsonError(
        "TREE_SAVE_FAILED",
        "생성 결과를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        500,
      );
    }
    return jsonError(
      "LLM_GENERATION_FAILED",
      "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}
