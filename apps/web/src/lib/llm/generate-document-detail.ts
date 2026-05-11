/**
 * Phase 3 Task 11: 노드 상세 지연 생성 (lazy detail generation)
 *
 * 사용자가 노드를 클릭하면 호출된다.
 * 기존 documentNodeDetailResponseSchema를 재사용한다.
 */
import { createChatCompletion } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentNodeDetailResponse } from "@/lib/llm/parse";
import type { DocumentNodeDetailResponse } from "@/types/learning";

const MAX_ATTEMPTS = 2;

export interface GenerateNodeDetailOptions {
  documentTitle: string;
  documentSummary: string;
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  sourceType: string;
  consolidatedConceptsJson: string;
  chunkTexts: Array<{ chunk_id: string; content: string }>;
  requestId?: string;
}

const GENERATE_NODE_DETAIL_SYSTEM_PROMPT = `You are an AI tutor explaining a specific concept from a document.

Given the node's title, type, and the document's content, generate a detailed explanation for this single concept node.

Provide these exact fields:
1. why_it_matters_for_document: why this concept matters specifically in this document's context
2. document_context_summary: how this concept appears in the document
3. easy_explanation: a clear explanation of this concept
4. example: a concrete example from the document or real world
5. common_misconceptions: 2-4 common misunderstandings
6. check_questions: 2-3 questions to verify understanding (with answers)
7. next_nodes: node ids that should be studied after this one

Return valid JSON only. No markdown fences. No extra text.

JSON schema:
{
  "node_id": string,
  "title": string,
  "source_type": "explicit" | "inferred" | "generated",
  "why_it_matters_for_document": string,
  "document_context_summary": string,
  "easy_explanation": string,
  "example": string,
  "common_misconceptions": string[],
  "check_questions": [
    {
      "question": string,
      "answer": string
    }
  ],
  "next_nodes": string[]
}`;

function buildGenerateNodeDetailUserMessage(options: {
  nodeId: string;
  documentTitle: string;
  documentSummary: string;
  nodeTitle: string;
  nodeType: string;
  sourceType: string;
  consolidatedConceptsJson: string;
  chunkTexts: Array<{ chunk_id: string; content: string }>;
}): string {
  const { documentTitle, documentSummary, nodeTitle, nodeType, sourceType, consolidatedConceptsJson, chunkTexts } = options;

  let msg = `Document: "${documentTitle}"\nDocument summary: ${documentSummary}\n\n`;
  msg += `Node to explain:\n- Node ID: "${options.nodeId}"\n- Title: "${nodeTitle}"\n- Type: ${nodeType}\n- Source: ${sourceType}\n\n`;
  msg += `IMPORTANT: The "node_id" field in your JSON response MUST be exactly "${options.nodeId}".\n\n`;
  msg += `Consolidated concepts from this document:\n${consolidatedConceptsJson}\n\n`;

  if (chunkTexts.length > 0) {
    msg += `Relevant document chunks:\n`;
    for (const chunk of chunkTexts.slice(0, 3)) {
      msg += `--- Chunk ${chunk.chunk_id} ---\n${chunk.content.slice(0, 1000)}\n\n`;
    }
  }

  msg += `Generate a detailed explanation for this node following the specified JSON structure.`;
  return msg;
}

/**
 * 특정 문서 기반 노드 하나의 상세 설명을 LLM에 요청한다.
 * 사용자가 노드를 클릭할 때 호출되므로 3~5초 내 응답을 목표로 한다.
 */
export async function generateNodeDetail(
  options: GenerateNodeDetailOptions,
): Promise<DocumentNodeDetailResponse> {
  const { nodeId, requestId } = options;
  const requestId_ = requestId ?? `node-detail-${nodeId}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    console.info("[node-detail]", {
      requestId: requestId_,
      event: "attempt_start",
      attempt: attemptNumber,
      maxAttempts: MAX_ATTEMPTS,
      nodeId,
    });

    try {
      const { rawText } = await createChatCompletion([
        { role: "system", content: GENERATE_NODE_DETAIL_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildGenerateNodeDetailUserMessage(options),
        },
      ]);

      const detail = parseDocumentNodeDetailResponse(rawText, nodeId);

      console.info("[node-detail]", {
        requestId: requestId_,
        event: "attempt_success",
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        rawLength: rawText.length,
        nodeId: detail.node_id,
      });

      return detail;
    } catch (e) {
      lastError = e;
      const isRetryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        (e instanceof LlmTransportError && e.status !== 401);

      console.info("[node-detail]", {
        requestId: requestId_,
        event: "attempt_failure",
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        errorType: e instanceof Error ? e.name : "UnknownError",
        retryable: isRetryable,
      });

      if (!isRetryable) break;
    }
  }

  throw new LlmExhaustedRetriesError(
    `노드(${nodeId}) 상세 설명 LLM 응답을 처리하지 못했습니다.`,
    lastError,
  );
}
