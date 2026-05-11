import { NextResponse } from "next/server";

/**
 * API 에러 응답 표준 형식: `{ error: { code, message } }`
 * 프론트는 `code`로 분기·`message`를 그대로 사용자에게 보여줄 수 있음
 */
/** 공통 API 에러 코드 (Phase 1 명세·계획 문서) */
export type ApiErrorCode =
  | "INVALID_TOPIC"
  | "LLM_GENERATION_FAILED"
  | "INVALID_LLM_RESPONSE"
  | "TREE_SAVE_FAILED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_STATUS"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "DOCUMENT_UPLOAD_FAILED"
  | "PROCESSING_FAILED"
  | "INVALID_OPERATION"
  | "DETAIL_GENERATION_FAILED";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/** 일관된 JSON 에러 응답 — `NextResponse.json` 래퍼 */
export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}
