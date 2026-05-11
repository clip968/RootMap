/**
 * Phase 3: 청크별 개념 추출 LLM 호출 (명세 §12.1)
 *
 * - 각 청크에 대해 시스템 + 사용자 메시지로 LLM 호출
 * - JSON 파싱 + Zod 검증 + 품질 검사
 * - 파싱/검증/transport 오류는 최대 3회 재시도 (401은 즉시 중단)
 */
import { createChatCompletion, getOpenRouterMaxAttempts } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseChunkConceptExtractionResponse } from "@/lib/llm/parse";
import {
  buildDocumentChunkConceptUserMessage,
  DOCUMENT_CHUNK_CONCEPT_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import type { ChunkConceptExtractionResponse } from "@/types/learning";

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
  console.info("[document-chunk-concepts]", details);
}

export interface GenerateChunkConceptsOptions {
  documentTitle: string;
  chunkId: string;
  sectionTitle: string;
  chunkText: string;
  chunkMetadata?: string;
  requestId?: string;
}

export interface GenerateChunkConceptsResult {
  extraction: ChunkConceptExtractionResponse;
}

/**
 * 청크 하나에 대한 LLM 개념 추출을 실행한다.
 */
export async function generateChunkConcepts(
  options: GenerateChunkConceptsOptions,
): Promise<GenerateChunkConceptsResult> {
  const { documentTitle, chunkId, sectionTitle, chunkText, chunkMetadata, requestId } =
    options;
  const requestId_ = requestId ?? `chunk-${chunkId}`;
  const maxAttempts = getOpenRouterMaxAttempts();

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    logGenerate("attempt_start", {
      requestId: requestId_,
      attempt: attemptNumber,
      maxAttempts,
      chunkId,
    });

    try {
      const completionStartedAt = Date.now();
      const { rawText, status } = await createChatCompletion([
        {
          role: "system",
          content: DOCUMENT_CHUNK_CONCEPT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDocumentChunkConceptUserMessage({
            documentTitle,
            chunkId,
            sectionTitle,
            chunkText,
            chunkMetadata,
          }),
        },
      ]);
      const completionDurationMs = Date.now() - completionStartedAt;

      const parseStartedAt = Date.now();
      const extraction = parseChunkConceptExtractionResponse(rawText);
      const parseDurationMs = Date.now() - parseStartedAt;

      logGenerate("attempt_success", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        completionDurationMs,
        parseValidationDurationMs: parseDurationMs,
        status,
        rawLength: rawText.length,
        conceptCount: extraction.concept_candidates.length,
      });

      return { extraction };
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
    "청크 개념 추출 LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
