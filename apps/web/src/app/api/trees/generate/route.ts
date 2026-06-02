/**
 * POST /api/trees/generate
 *
 * 사용자가 입력한 학습 주제로 LLM 학습 트리를 만들고 SQLite에 저장한 뒤,
 * 클라이언트가 트리 뷰로 쓸 수 있는 JSON을 돌려줍니다.
 *
 * 흐름(읽는 순서 추천):
 * 1. 이 파일 — HTTP 검증·에러 매핑
 * 2. `learning-tree-generate.ts` — Concept 컨텍스트 준비 + LLM 호출 + 저장 + 응답 변환
 * 3. `generate-tree.ts` — 실제 Chat Completions + 재시도
 * 4. `learning-repository.createFullLearningTree` — DB 트랜잭션
 */
import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
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
import {
  LlmProviderRequiredError,
  LLM_PROVIDER_REQUIRED_MESSAGE,
} from "@/lib/llm/provider-config";
import { NextResponse } from "next/server";

/** Edge/Serverless가 아닌 Node 런타임: better-sqlite3 등 동기 DB 드라이버 사용 */
export const runtime = "nodejs";

/** 로그·디버깅용: 한 요청을 여러 레이어 로그에서 같은 키로 묶기 */
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
  /** 생략 시 true — UI 체크박스와 동일하게 기본은 기존 Concept 재사용 */
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
    /** 본문의 타입 검증은 서비스(`validateTopicInput`)에서 한 번 더 함 */
    const data = await generateAndPersistTree(
      (body as { topic: unknown }).topic,
      { userId: auth.userId, reuseConcepts, requestId },
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
    /** 사용자 입력 문제 — 400 */
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
    /**
     * LLM이 3회까지 시도했는데도 파싱/검증 불가 → 422,
     * 그 외(네트워크·5xx 등) 원인 → 502로 통일 처리
     */
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
    /** OpenRouter 등 HTTP 레벨 실패 — 보통 키/쿼터/503 */
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
    /** 트랜잭션 중 DB 오류(삽입 실패 등) */
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
    if (e instanceof LlmProviderRequiredError) {
      logGenerateRoute("failure", {
        requestId,
        reuseConcepts,
        durationMs,
        status: 400,
        errorClass: e.name,
      });
      return jsonError(
        "LLM_PROVIDER_REQUIRED",
        LLM_PROVIDER_REQUIRED_MESSAGE,
        400,
      );
    }
    /** 위 분기에 안 잡힌 예외는 원인 숨기고 502 */
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
