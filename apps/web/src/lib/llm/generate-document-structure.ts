/**
 * Phase 3 Task 11: 문서 기반 학습 트리 구조만 생성 (경량 LLM 호출)
 *
 * - description/difficulty/evidence 없이 노드 골격만 요청
 * - 응답 시간 목표: 5~10초
 * - 파싱/검증/transport 오류는 최대 3회 재시도
 */
import { createChatCompletion, getOpenRouterMaxAttempts } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentTreeStructureResponse } from "@/lib/llm/parse";
import {
  buildDocumentTreeStructureUserMessage,
  DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import type { DocumentTreeStructureResponse } from "@/types/learning";

function classifyLlmError(
  err: unknown,
): "parse" | "validation" | "transport" | "unknown" {
  if (err instanceof LlmParseError) return "parse";
  if (err instanceof LlmValidationError) return "validation";
  if (err instanceof LlmTransportError) return "transport";
  return "unknown";
}

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

function logGenerate(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[document-structure]", details);
}

export interface GenerateDocumentTreeStructureOptions {
  documentId: string;
  documentTitle: string;
  documentSummary: string;
  consolidatedConceptsJson: string;
  matchedConceptsContext?: string;
  requestId?: string;
}

/**
 * 문서 기반 학습 트리의 구조(제목/타입/관계)만 LLM에 요청한다.
 * description/difficulty/evidence는 포함하지 않아 LLM 응답이 빠르다.
 */
export async function generateDocumentTreeStructure(
  options: GenerateDocumentTreeStructureOptions,
): Promise<DocumentTreeStructureResponse> {
  const {
    documentId,
    documentTitle,
    documentSummary,
    consolidatedConceptsJson,
    matchedConceptsContext,
    requestId,
  } = options;
  const requestId_ = requestId ?? `tree-struct-${documentId}`;
  const maxAttempts = getOpenRouterMaxAttempts();

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    logGenerate("attempt_start", {
      requestId: requestId_,
      attempt: attemptNumber,
      maxAttempts,
      documentId,
    });

    try {
      const { rawText } = await createChatCompletion([
        {
          role: "system",
          content: DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDocumentTreeStructureUserMessage({
            documentTitle,
            documentSummary,
            consolidatedConceptsJson,
            matchedConceptsContext,
          }),
        },
      ]);

      const tree = parseDocumentTreeStructureResponse(rawText);

      logGenerate("attempt_success", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        rawLength: rawText.length,
        nodeCount: tree.nodes.length,
        edgeCount: tree.edges.length,
      });

      return tree;
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
    "문서 기반 학습 트리 구조 LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
