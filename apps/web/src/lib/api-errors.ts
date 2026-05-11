import { NextResponse } from "next/server";

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
  | "DOCUMENT_UPLOAD_FAILED";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}
