import { LlmParseError, LlmValidationError } from "@/lib/llm/errors";
import {
  learningTreeResponseSchema,
  nodeDetailResponseSchema,
  chunkConceptExtractionResponseSchema,
  documentConsolidationResponseSchema,
  documentTreeResponseSchema,
  documentNodeDetailResponseSchema,
} from "@/lib/llm/schemas";
import type {
  LearningTreeResponse,
  NodeDetailResponse,
  ChunkConceptExtractionResponse,
  DocumentConsolidationResponse,
  DocumentTreeResponse,
  DocumentNodeDetailResponse,
} from "@/types/learning";

export function stripLlmFences(raw: string): string {
  let s = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fenced) s = fenced[1]!.trim();
  return s;
}

/** 첫 '{'부터 균형 잡힌 객체까지 잘라 JSON 후보로 쓴다. */
export function sliceBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonObject(raw: string): unknown {
  const primary = stripLlmFences(raw);
  try {
    return JSON.parse(primary);
  } catch {
    const slice = sliceBalancedJsonObject(raw);
    if (!slice) throw new LlmParseError();
    try {
      return JSON.parse(slice);
    } catch {
      throw new LlmParseError();
    }
  }
}

export function parseLearningTreeResponse(
  rawModelText: string,
): LearningTreeResponse {
  const parsed = parseJsonObject(rawModelText);
  const result = learningTreeResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError("응답 형식이 올바르지 않습니다.", result.error.issues);
  }
  return result.data;
}

export function parseNodeDetailResponse(
  rawModelText: string,
  expectedNodeId: string,
): NodeDetailResponse {
  const parsed = parseJsonObject(rawModelText);
  const result = nodeDetailResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError("응답 형식이 올바르지 않습니다.", result.error.issues);
  }
  const data = result.data;
  if (data.node_id !== expectedNodeId) {
    throw new LlmValidationError(
      `응답의 node_id가 요청과 일치하지 않습니다. (expected ${expectedNodeId})`,
    );
  }
  return data;
}

// ──────────────────────────────────────────────
// Phase 3 문서 기반 파서
// ──────────────────────────────────────────────

export function parseChunkConceptExtractionResponse(
  rawModelText: string,
): ChunkConceptExtractionResponse {
  const parsed = parseJsonObject(rawModelText);
  const result = chunkConceptExtractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError(
      "청크 개념 추출 응답 형식이 올바르지 않습니다.",
      result.error.issues,
    );
  }
  return result.data;
}

export function parseDocumentConsolidationResponse(
  rawModelText: string,
): DocumentConsolidationResponse {
  const parsed = parseJsonObject(rawModelText);
  const result = documentConsolidationResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError(
      "문서 개념 통합 응답 형식이 올바르지 않습니다.",
      result.error.issues,
    );
  }
  return result.data;
}

export function parseDocumentTreeResponse(
  rawModelText: string,
): DocumentTreeResponse {
  const parsed = parseJsonObject(rawModelText);
  const result = documentTreeResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError(
      "문서 기반 학습 트리 응답 형식이 올바르지 않습니다.",
      result.error.issues,
    );
  }
  return result.data;
}

export function parseDocumentNodeDetailResponse(
  rawModelText: string,
  expectedNodeId: string,
): DocumentNodeDetailResponse {
  const parsed = parseJsonObject(rawModelText);
  const result = documentNodeDetailResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError(
      "문서 기반 노드 설명 응답 형식이 올바르지 않습니다.",
      result.error.issues,
    );
  }
  const data = result.data;
  if (data.node_id !== expectedNodeId) {
    throw new LlmValidationError(
      `응답의 node_id가 요청과 일치하지 않습니다. (expected ${expectedNodeId})`,
    );
  }
  return data;
}
