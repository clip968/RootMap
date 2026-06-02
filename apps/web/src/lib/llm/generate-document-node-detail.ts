/**
 * Phase 3: 문서 기반 노드 상세 설명 LLM 호출 (명세 §12.4)
 *
 * - 문서 맥락에서의 개념 설명 생성
 * - source_type = explicit | inferred | generated
 * - 파싱/검증/transport 오류는 최대 3회 재시도
 */
import { createChatCompletion } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentNodeDetailResponse } from "@/lib/llm/parse";
import {
  buildDocumentNodeDetailUserMessage,
  DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import {
  documentNodeDetailQualityWarnings,
} from "@/lib/llm/schemas";
import type { ResolvedLlmProviderConfig } from "@/lib/llm/provider-config";
import type {
  DocumentNodeDetailResponse,
  DocumentSourceType,
} from "@/types/learning";

const MAX_ATTEMPTS = 3;

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

function logGenerate(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[document-node-detail]", details);
}

export interface GenerateDocumentNodeDetailInput {
  providerConfig: ResolvedLlmProviderConfig;
  documentTitle: string;
  nodeId: string;
  conceptTitle: string;
  sourceType: DocumentSourceType;
  evidenceText: string;
  prerequisites: string;
  requestId?: string;
}

export interface GenerateDocumentNodeDetailResult {
  detail: DocumentNodeDetailResponse;
  qualityWarnings: string[];
}

/**
 * 문서 기반 노드 상세 설명을 LLM에 요청한다.
 */
export async function generateDocumentNodeDetail(
  input: GenerateDocumentNodeDetailInput,
): Promise<GenerateDocumentNodeDetailResult> {
  const {
    documentTitle,
    nodeId,
    conceptTitle,
    sourceType,
    evidenceText,
    prerequisites,
    requestId,
  } = input;
  const requestId_ = requestId ?? `node-detail-${nodeId}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    logGenerate("attempt_start", {
      requestId: requestId_,
      attempt: attemptNumber,
      maxAttempts: MAX_ATTEMPTS,
      nodeId,
      conceptTitle,
    });

    try {
      const completionStartedAt = Date.now();
      const { rawText, status } = await createChatCompletion([
        {
          role: "system",
          content: DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDocumentNodeDetailUserMessage({
            documentTitle,
            nodeId,
            conceptTitle,
            sourceType,
            evidenceText,
            prerequisites,
          }),
        },
      ], { providerConfig: input.providerConfig });
      const completionDurationMs = Date.now() - completionStartedAt;

      const parseStartedAt = Date.now();
      const detail = parseDocumentNodeDetailResponse(rawText, nodeId);
      const qualityWarnings = documentNodeDetailQualityWarnings(detail);
      const parseDurationMs = Date.now() - parseStartedAt;

      logGenerate("attempt_success", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        completionDurationMs,
        parseValidationDurationMs: parseDurationMs,
        status,
        rawLength: rawText.length,
        qualityWarningCount: qualityWarnings.length,
      });

      return { detail, qualityWarnings };
    } catch (e) {
      lastError = e;
      const errorType =
        e instanceof LlmParseError
          ? "parse"
          : e instanceof LlmValidationError
            ? "validation"
            : e instanceof LlmTransportError
              ? "transport"
              : "unknown";
      const retryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        e instanceof LlmTransportError;
      const abortRetries = shouldAbortRetries(e);

      logGenerate("attempt_failure", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        errorType,
        errorClass: e instanceof Error ? e.name : "UnknownError",
        status: e instanceof LlmTransportError ? e.status : undefined,
        retryable,
        abortRetries,
      });

      if (abortRetries) break;
      if (!retryable) break;
    }
  }

  throw new LlmExhaustedRetriesError(
    "문서 기반 노드 상세 LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
