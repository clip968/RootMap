import fs from "node:fs/promises";
import path from "node:path";
import {
  getDocumentForUser,
  updateDocumentStatus,
  updateDocumentExtractedInfo,
  bulkInsertDocumentPages,
  bulkInsertDocumentChunks,
} from "@/lib/repository/document-repository";
import { extractPdfPages } from "./extract-pdf";
import { splitTextIntoUnits } from "./extract-text";
import { chunkFromPdfPages, chunkUnits } from "./chunker";

export class DocumentProcessorError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DocumentProcessorError";
  }
}

const MAX_PAGES = 80;
const MAX_TEXT_LENGTH = 120_000;
const MIN_EXTRACTED_TEXT_LENGTH = 50;

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

export async function processDocument(
  documentId: string,
  userId: string,
): Promise<void> {
  const doc = getDocumentForUser(documentId, userId);
  if (!doc) {
    throw new DocumentProcessorError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  if (doc.processingStatus !== "uploaded") {
    throw new DocumentProcessorError(
      "INVALID_STATUS",
      "이미 처리 중이거나 처리 완료된 문서입니다.",
    );
  }

  const storage = doc.metadata?.storage as { key?: string } | undefined;
  const fileKey = storage?.key;
  if (!fileKey) {
    throw new DocumentProcessorError(
      "FILE_NOT_FOUND",
      "문서 파일 경로를 찾을 수 없습니다.",
    );
  }

  const filePath = storageAbsPath(fileKey);
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch {
    throw new DocumentProcessorError(
      "FILE_NOT_FOUND",
      "문서 파일을 읽을 수 없습니다.",
    );
  }

  let pages: Array<{ pageNumber: number; text: string }>;
  try {
    if (doc.fileType === "pdf") {
      pages = await extractPdfPages(fileBuffer);
    } else if (doc.fileType === "txt" || doc.fileType === "md") {
      const text = fileBuffer.toString("utf-8");
      pages = [{ pageNumber: 1, text }];
    } else {
      throw new DocumentProcessorError(
        "UNSUPPORTED_FILE_TYPE",
        "지원하지 않는 파일 형식입니다.",
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    updateDocumentStatus(
      documentId,
      "failed",
      `텍스트 추출 실패: ${message}`,
    );
    throw new DocumentProcessorError(
      "TEXT_EXTRACTION_FAILED",
      "이 PDF에서는 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.",
    );
  }

  // Validate extracted text is meaningful (not scanned image PDF)
  const totalText = pages.map((p) => p.text).join("\n\n");
  if (totalText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    updateDocumentStatus(
      documentId,
      "failed",
      "추출된 텍스트가 너무 적습니다. 스캔본 PDF일 수 있습니다.",
    );
    throw new DocumentProcessorError(
      "TEXT_EXTRACTION_FAILED",
      "이 PDF에서는 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.",
    );
  }

  // Validate page count limit
  if (pages.length > MAX_PAGES) {
    updateDocumentStatus(
      documentId,
      "failed",
      `페이지 수 초과: ${pages.length} > ${MAX_PAGES}`,
    );
    throw new DocumentProcessorError(
      "DOCUMENT_TOO_LONG",
      "문서가 너무 깁니다. Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다. 중요한 챕터나 섹션만 분리해서 업로드해 주세요.",
    );
  }

  // Validate text length limit
  if (totalText.length > MAX_TEXT_LENGTH) {
    updateDocumentStatus(
      documentId,
      "failed",
      `텍스트 길이 초과: ${totalText.length} > ${MAX_TEXT_LENGTH}`,
    );
    throw new DocumentProcessorError(
      "DOCUMENT_TOO_LONG",
      "문서가 너무 깁니다. Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다. 중요한 챕터나 섹션만 분리해서 업로드해 주세요.",
    );
  }

  // Save pages
  const pageInputs = pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
  }));
  bulkInsertDocumentPages(documentId, pageInputs);

  // Update document with extraction info and status
  updateDocumentExtractedInfo(documentId, pages.length, totalText.length);
  updateDocumentStatus(documentId, "text_extracted");

  // Chunk
  let chunks;
  if (doc.fileType === "pdf") {
    chunks = chunkFromPdfPages(pages);
  } else {
    const units = splitTextIntoUnits(totalText, doc.fileType, 1);
    chunks = chunkUnits(units);
  }

  // Save chunks
  if (chunks.length > 0) {
    bulkInsertDocumentChunks(
      documentId,
      chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        sectionTitle: c.sectionTitle,
        text: c.text,
        tokenCount: c.tokenCount,
        metadata: c.metadata,
      })),
    );
  }

  // Update status to chunked
  updateDocumentStatus(documentId, "chunked");
}
