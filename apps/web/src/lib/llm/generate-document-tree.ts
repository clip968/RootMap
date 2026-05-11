/**
 * Phase 3: 문서 기반 학습 트리 생성 LLM 호출 (명세 §12.3)
 *
 * - 통합된 문서 개념을 바탕으로 학습 트리 생성
 * - source_type = explicit | inferred | generated
 * - 노드 10~25개, 선수지식 3개 이상, 문서 핵심 개념 5개 이상
 * - 파싱/검증/transport 오류는 최대 3회 재시도
 */
import { createChatCompletion, getOpenRouterMaxAttempts } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentTreeResponse } from "@/lib/llm/parse";
import {
  buildDocumentTreeUserMessage,
  DOCUMENT_TREE_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import {
  documentTreeQualityWarnings,
} from "@/lib/llm/schemas";
import type { DocumentTreeResponse } from "@/types/learning";

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
  console.info("[document-tree]", details);
}

export interface GenerateDocumentTreeOptions {
  documentId: string;
  documentTitle: string;
  documentSummary: string;
  consolidatedConceptsJson: string;
  matchedConceptsContext?: string;
  requestId?: string;
}

export interface GenerateDocumentTreeResult {
  tree: DocumentTreeResponse;
  qualityWarnings: string[];
}

/**
 * 문서 기반 학습 트리를 LLM에 요청한다.
 */
export async function generateDocumentTree(
  options: GenerateDocumentTreeOptions,
): Promise<GenerateDocumentTreeResult> {
  const {
    documentId,
    documentTitle,
    documentSummary,
    consolidatedConceptsJson,
    matchedConceptsContext,
    requestId,
  } = options;
  const requestId_ = requestId ?? `tree-${documentId}`;
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
      const completionStartedAt = Date.now();
      const { rawText, status } = await createChatCompletion([
        {
          role: "system",
          content: DOCUMENT_TREE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDocumentTreeUserMessage({
            documentTitle,
            documentSummary,
            consolidatedConceptsJson,
            matchedConceptsContext,
          }),
        },
      ]);
      const completionDurationMs = Date.now() - completionStartedAt;

      const parseStartedAt = Date.now();
      const tree = parseDocumentTreeResponse(rawText);
      const qualityWarnings = documentTreeQualityWarnings(tree);
      const parseDurationMs = Date.now() - parseStartedAt;

      logGenerate("attempt_success", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        completionDurationMs,
        parseValidationDurationMs: parseDurationMs,
        status,
        rawLength: rawText.length,
        nodeCount: tree.nodes.length,
        edgeCount: tree.edges.length,
        qualityWarningCount: qualityWarnings.length,
      });

      return { tree, qualityWarnings };
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
    "문서 기반 학습 트리 LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
