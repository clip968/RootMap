export { createChatCompletion, type ChatMessage, type ChatRole } from "@/lib/llm/chat";
export {
  InvalidTopicError,
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
export {
  parseLearningTreeResponse,
  parseNodeDetailResponse,
  parseChunkConceptExtractionResponse,
  parseDocumentConsolidationResponse,
  parseDocumentTreeResponse,
  parseDocumentNodeDetailResponse,
  sliceBalancedJsonObject,
  stripLlmFences,
} from "@/lib/llm/parse";
export {
  buildLearningTreeUserMessage,
  buildNodeDetailUserMessage,
  buildDocumentChunkConceptUserMessage,
  buildDocumentConsolidationUserMessage,
  buildDocumentTreeUserMessage,
  buildDocumentNodeDetailUserMessage,
  LEARNING_TREE_SYSTEM_PROMPT,
  NODE_DETAIL_SYSTEM_BASE,
  DOCUMENT_CHUNK_CONCEPT_SYSTEM_PROMPT,
  DOCUMENT_CONSOLIDATION_SYSTEM_PROMPT,
  DOCUMENT_TREE_SYSTEM_PROMPT,
  DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
export {
  learningTreeQualityWarnings,
  learningTreeResponseSchema,
  nodeDetailQualityWarnings,
  nodeDetailResponseSchema,
  learningTreeNodeSchema,
  chunkConceptExtractionResponseSchema,
  documentConsolidationResponseSchema,
  documentConsolidationQualityWarnings,
  documentTreeResponseSchema,
  documentTreeQualityWarnings,
  documentNodeDetailResponseSchema,
  documentNodeDetailQualityWarnings,
} from "@/lib/llm/schemas";
export {
  generateLearningTree,
  type GenerateLearningTreeResult,
} from "@/lib/llm/generate-tree";
export {
  generateNodeDetail,
  type GenerateNodeDetailInput,
  type GenerateNodeDetailResult,
} from "@/lib/llm/generate-node-detail";
export {
  generateChunkConcepts,
  type GenerateChunkConceptsOptions,
  type GenerateChunkConceptsResult,
} from "@/lib/llm/generate-document-chunk-concepts";
export {
  generateDocumentConsolidation,
  type GenerateConsolidationOptions,
  type GenerateConsolidationResult,
} from "@/lib/llm/generate-document-consolidation";
export {
  generateDocumentTree,
  type GenerateDocumentTreeOptions,
  type GenerateDocumentTreeResult,
} from "@/lib/llm/generate-document-tree";
export {
  generateDocumentNodeDetail,
  type GenerateDocumentNodeDetailInput,
  type GenerateDocumentNodeDetailResult,
} from "@/lib/llm/generate-document-node-detail";
