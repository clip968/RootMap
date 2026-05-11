/**
 * Phase 3: 문서 전체 개념 통합 LLM 호출 (명세 §12.2)
 *
 * - 모든 청크에서 추출된 개념 후보를 LLM에 보내 중복 병합 + 분류
 * - source_type = explicit / inferred 구분
 * - 파싱/검증/transport 오류는 최대 3회 재시도
 */
import { createChatCompletion, getOpenRouterMaxAttempts } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentConsolidationResponse } from "@/lib/llm/parse";
import {
  buildDocumentConsolidationUserMessage,
  DOCUMENT_CONSOLIDATION_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import {
  documentConsolidationQualityWarnings,
} from "@/lib/llm/schemas";
import type { DocumentConsolidationResponse } from "@/types/learning";

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

function classifyLlmError(
  err: unknown,
): "parse" | "validation" | "transport" | "unknown" {
  if (err instanceof LlmParseError) return "parse";
  if (err instanceof LlmValidationError) return "validation";
  if (err instanceof LlmTransportError) return "transport";
  return "unknown";
}

function logGenerate(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[document-consolidation]", details);
}

export interface GenerateConsolidationOptions {
  documentTitle: string;
  conceptCandidatesJson: string;
  requestId?: string;
}

export interface GenerateConsolidationResult {
  consolidation: DocumentConsolidationResponse;
  qualityWarnings: string[];
}

/**
 * 문서 전체 개념 통합을 LLM에 요청한다.
 */
export async function generateDocumentConsolidation(
  options: GenerateConsolidationOptions,
): Promise<GenerateConsolidationResult> {
  const { documentTitle, conceptCandidatesJson, requestId } = options;
  const requestId_ = requestId ?? "consolidation";
  const maxAttempts = getOpenRouterMaxAttempts();

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    logGenerate("attempt_start", {
      requestId: requestId_,
      attempt: attemptNumber,
      maxAttempts,
      candidatesLength: conceptCandidatesJson.length,
    });

    try {
      const completionStartedAt = Date.now();
      const { rawText, status } = await createChatCompletion([
        {
          role: "system",
          content: DOCUMENT_CONSOLIDATION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDocumentConsolidationUserMessage({
            documentTitle,
            conceptCandidatesJson,
          }),
        },
      ]);
      const completionDurationMs = Date.now() - completionStartedAt;

      const parseStartedAt = Date.now();
      const consolidation = parseDocumentConsolidationResponse(rawText);
      const qualityWarnings = documentConsolidationQualityWarnings(consolidation);
      const parseDurationMs = Date.now() - parseStartedAt;

      logGenerate("attempt_success", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        completionDurationMs,
        parseValidationDurationMs: parseDurationMs,
        status,
        rawLength: rawText.length,
        conceptCount: consolidation.concepts.length,
        qualityWarningCount: qualityWarnings.length,
      });

      return { consolidation, qualityWarnings };
    } catch (e) {
      lastError = e;
      const errorType = classifyLlmError(e);
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
    "문서 개념 통합 LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
