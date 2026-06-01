import {
  findOlderActiveDuplicateDocumentForProcessing,
  getDocumentChunks,
  getDocumentConceptRows,
  getDocumentForUser,
  getDocumentLearningTreeForUser,
  type DocumentProcessingStatus,
} from "@/lib/repository/document-repository";

const CHUNK_CONCEPT_EXTRACTION_METADATA_KEY = "document_concept_extraction";

type SummaryDocumentSnapshot = {
  id: string;
  originalFilename: string;
  processingStatus: string;
  pageCount: number | null;
};

type SummaryChunkSnapshot = {
  metadata: unknown;
};

export interface LocalProcessingSummarySnapshot {
  document: SummaryDocumentSnapshot | null;
  chunks: SummaryChunkSnapshot[];
  documentConceptCount: number;
  treeId: string | null;
  activeDuplicateDocumentId: string | null;
}

export interface LocalProcessingSummary {
  document_id: string | null;
  original_filename: string | null;
  processing_status_before: DocumentProcessingStatus | "not_found";
  page_count: number | null;
  chunk_count: number;
  checkpointed_chunk_count: number;
  pending_chunk_count: number;
  document_concept_count: number;
  active_duplicate_document_id: string | null;
  tree_id: string | null;
  can_process: boolean;
  recommended_next_action: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function isCheckpointedDocumentChunk(metadata: unknown): boolean {
  const extraction = asRecord(metadata)[CHUNK_CONCEPT_EXTRACTION_METADATA_KEY];
  const status = asRecord(extraction).status;
  return status === "completed" || status === "skipped";
}

function toProcessingStatus(status: string): DocumentProcessingStatus {
  if (
    status === "uploaded" ||
    status === "text_extracted" ||
    status === "chunked" ||
    status === "concepts_extracted" ||
    status === "tree_generated" ||
    status === "failed"
  ) {
    return status;
  }
  return "failed";
}

function recommendedNextAction(options: {
  status: DocumentProcessingStatus | "not_found";
  activeDuplicateDocumentId: string | null;
  chunkCount: number;
  pendingChunkCount: number;
  documentConceptCount: number;
}): string {
  if (options.status === "not_found") {
    return "documentId와 사용자 ID를 확인한 뒤 다시 dry-run을 실행하세요.";
  }
  if (options.activeDuplicateDocumentId) {
    return `같은 파일의 활성 문서(${options.activeDuplicateDocumentId})가 있습니다. 기존 문서 처리를 먼저 확인하거나 중복 문서를 정리한 뒤 실행하세요.`;
  }

  switch (options.status) {
    case "uploaded":
      return "텍스트 추출부터 로컬 처리를 시작할 수 있습니다. 먼저 --dry-run 결과를 확인한 뒤 --resume으로 실행하세요.";
    case "text_extracted":
      return "이미 텍스트 추출이 끝났습니다. chunk 분할부터 이어서 처리하려면 --resume으로 실행하세요.";
    case "chunked":
      if (options.chunkCount === 0) {
        return "청크가 없습니다. 문서 상태와 document_chunks 저장 결과를 확인하세요.";
      }
      return `미처리 chunk ${options.pendingChunkCount}개가 남았습니다. --chunk-batch-size를 작게 두고 --resume으로 실행하세요.`;
    case "concepts_extracted":
      if (options.documentConceptCount === 0) {
        return "document_concepts가 없습니다. chunk/concept 단계 결과를 복구한 뒤 다시 실행하세요.";
      }
      return "chunk LLM 호출 없이 tree 생성/저장만 재시도하려면 --tree-only로 실행하세요.";
    case "tree_generated":
      return "이미 tree_generated 상태입니다. 추가 LLM 호출 없이 기존 tree를 사용하세요.";
    case "failed":
      return "failed 상태는 자동 재개하지 않습니다. 실패 원인을 확인하고 필요한 경우 concepts_extracted로 되돌린 뒤 --tree-only를 실행하세요.";
  }
}

function canProcess(options: {
  status: DocumentProcessingStatus | "not_found";
  activeDuplicateDocumentId: string | null;
  chunkCount: number;
  documentConceptCount: number;
}): boolean {
  if (options.status === "not_found") return false;
  if (options.activeDuplicateDocumentId) return false;
  if (options.status === "failed" || options.status === "tree_generated") return false;
  if (options.status === "chunked" && options.chunkCount === 0) return false;
  if (options.status === "concepts_extracted" && options.documentConceptCount === 0) {
    return false;
  }
  return true;
}

export function summarizeLocalDocumentProcessing(
  snapshot: LocalProcessingSummarySnapshot,
): LocalProcessingSummary {
  const document = snapshot.document;
  if (!document) {
    return {
      document_id: null,
      original_filename: null,
      processing_status_before: "not_found",
      page_count: null,
      chunk_count: 0,
      checkpointed_chunk_count: 0,
      pending_chunk_count: 0,
      document_concept_count: 0,
      active_duplicate_document_id: null,
      tree_id: null,
      can_process: false,
      recommended_next_action: recommendedNextAction({
        status: "not_found",
        activeDuplicateDocumentId: null,
        chunkCount: 0,
        pendingChunkCount: 0,
        documentConceptCount: 0,
      }),
    };
  }

  const status = toProcessingStatus(document.processingStatus);
  // checkpoint 수는 LLM 비용 중복 여부를 판단하는 핵심 값이라 completed와 skipped를 모두 완료 처리한다.
  const checkpointedChunkCount = snapshot.chunks.filter((chunk) =>
    isCheckpointedDocumentChunk(chunk.metadata),
  ).length;
  const chunkCount = snapshot.chunks.length;
  const pendingChunkCount = Math.max(0, chunkCount - checkpointedChunkCount);
  const activeDuplicateDocumentId = snapshot.activeDuplicateDocumentId;
  const documentConceptCount = snapshot.documentConceptCount;

  return {
    document_id: document.id,
    original_filename: document.originalFilename,
    processing_status_before: status,
    page_count: document.pageCount,
    chunk_count: chunkCount,
    checkpointed_chunk_count: checkpointedChunkCount,
    pending_chunk_count: pendingChunkCount,
    document_concept_count: documentConceptCount,
    active_duplicate_document_id: activeDuplicateDocumentId,
    tree_id: snapshot.treeId,
    can_process: canProcess({
      status,
      activeDuplicateDocumentId,
      chunkCount,
      documentConceptCount,
    }),
    recommended_next_action: recommendedNextAction({
      status,
      activeDuplicateDocumentId,
      chunkCount,
      pendingChunkCount,
      documentConceptCount,
    }),
  };
}

export async function getLocalProcessingSummary(
  documentId: string,
  userId: string,
): Promise<LocalProcessingSummary> {
  const document = await getDocumentForUser(documentId, userId);
  if (!document) {
    return summarizeLocalDocumentProcessing({
      document: null,
      chunks: [],
      documentConceptCount: 0,
      treeId: null,
      activeDuplicateDocumentId: null,
    });
  }

  const [chunks, conceptRows, treeBundle, duplicate] = await Promise.all([
    getDocumentChunks(documentId),
    getDocumentConceptRows(documentId),
    getDocumentLearningTreeForUser(documentId, userId),
    findOlderActiveDuplicateDocumentForProcessing(document),
  ]);

  return summarizeLocalDocumentProcessing({
    document,
    chunks,
    documentConceptCount: conceptRows.length,
    treeId: treeBundle?.tree.id ?? null,
    activeDuplicateDocumentId: duplicate?.id ?? null,
  });
}
