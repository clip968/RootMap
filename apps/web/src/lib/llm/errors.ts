import type { z } from "zod/v3";

/** LLM HTTP/연결 단계 오류 (상태 코드가 있으면 설정) */
export class LlmTransportError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0,
    public readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = "LlmTransportError";
  }
}

/** JSON 텍스트 파싱 실패 */
export class LlmParseError extends Error {
  constructor(message = "JSON 파싱에 실패했습니다.") {
    super(message);
    this.name = "LlmParseError";
  }
}

/** 스키마·그래프 일관성 검증 실패 */
export class LlmValidationError extends Error {
  constructor(
    message = "응답 형식이 올바르지 않습니다.",
    public readonly issues?: z.ZodIssue[],
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}

export class LlmExhaustedRetriesError extends Error {
  constructor(message = "LLM 응답을 처리하지 못했습니다.", cause?: unknown) {
    super(message, { cause });
    this.name = "LlmExhaustedRetriesError";
  }
}

export class InvalidTopicError extends Error {
  constructor(message = "주제를 입력해 주세요.") {
    super(message);
    this.name = "InvalidTopicError";
  }
}
