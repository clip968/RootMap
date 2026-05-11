/**
 * Phase 3 Task 5: 문서 처리 파이프라인
 *
 * 처리 단계 (상태 전이):
 *   uploaded → text_extracted → chunked → concepts_extracted → tree_generated
 *
 * 각 단계 실패 시 → failed 상태로 전이하고 processingError에 원인 저장
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  getDocumentForUser,
  updateDocumentStatus,
  updateDocumentExtractedInfo,
  bulkInsertDocumentPages,
  bulkInsertDocumentChunks,
  getDocumentChunks,
  bulkInsertDocumentConcepts,
  createDocumentLearningTreeLink,
} from "@/lib/repository/document-repository";
import type { DocumentConceptInput, DocumentChunkRow } from "@/lib/repository/document-repository";
import { extractPdfPages } from "./extract-pdf";
import { splitTextIntoUnits } from "./extract-text";
import { chunkFromPdfPages, chunkUnits } from "./chunker";
import { generateChunkConcepts } from "@/lib/llm/generate-document-chunk-concepts";
import { generateDocumentConsolidation } from "@/lib/llm/generate-document-consolidation";
import { generateDocumentTree } from "@/lib/llm/generate-document-tree";
import { LlmExhaustedRetriesError } from "@/lib/llm/errors";
import { getDb } from "@/db/client";
import { learningTrees, learningNodes, userNodeProgress } from "@/db/schema";
import type { LearningTreeResponse, LearningTreeNode } from "@/types/learning";
import type {
  ConsolidatedConcept,
  DocumentTreeResponse,
} from "@/types/learning";

// ──────────────────────────────────────────────
// 오류 타입
// ──────────────────────────────────────────────

export class DocumentProcessorError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DocumentProcessorError";
  }
}

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────

const MAX_PAGES = 80;
const MAX_TEXT_LENGTH = 120_000;
const MIN_EXTRACTED_TEXT_LENGTH = 50;
const MIN_QUALITY_CONCEPT_COUNT = 3;

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * DocumentTreeResponse(DocumentTreeNode[]) → LearningTreeResponse(LearningTreeNode[])
 *
 * 문서 기반 트리 노드를 일반 학습 트리 노드로 변환한다.
 * source_type / evidence 정보는 description에 포함시킨다.
 */
function toLearningTreeResponse(
  docTree: DocumentTreeResponse,
): LearningTreeResponse {
  const nodes: LearningTreeNode[] = docTree.nodes.map((n) => {
    const evidenceText =
      n.evidence.length > 0
        ? n.evidence
            .map(
              (e) =>
                `[출처: ${
                  e.section_title
                    ? `${e.section_title} (p.${e.page_start ?? "?"}`
                    : `p.${e.page_start ?? "?"}`
                }${e.page_end ? `-${e.page_end}` : ""})]`,
            )
            .join(" ")
        : "";

    return {
      id: n.id,
      title: n.title,
      type: n.type === "document_core" ? "core" : (n.type as LearningTreeNode["type"]),
      description: evidenceText
        ? `${n.description}\n\n${evidenceText}`
        : n.description,
      difficulty: n.difficulty,
      prerequisites: n.prerequisites,
      children: n.children,
      concept_candidate: n.concept_candidate,
    };
  });

  return {
    topic: docTree.topic,
    summary: docTree.summary,
    nodes,
    recommended_order: docTree.recommended_order,
    edges: docTree.edges,
  };
}

// ──────────────────────────────────────────────
// 청크별 개념 추출
// ──────────────────────────────────────────────

async function extractConceptsFromChunks(
  documentId: string,
  documentTitle: string,
  chunks: DocumentChunkRow[],
): Promise<string> {
  console.info("[document-processor]", {
    stage: "chunk_concept_extraction_start",
    documentId,
    chunkCount: chunks.length,
  });

  // 모든 청크 추출 결과를 모을 배열
  const allCandidates: Array<{
    chunk_id: string;
    section_title: string;
    candidates: Array<{
      canonical_title: string;
      type: string;
      short_description: string;
      importance: number;
      difficulty: number;
      evidence_snippet: string;
    }>;
  }> = [];

  // 청크별로 순차 처리 (LLM 비용/비율 제한 고려)
  for (const chunk of chunks) {
    const sectionTitle = chunk.sectionTitle ?? "";
    try {
      const { extraction } = await generateChunkConcepts({
        documentTitle,
        chunkId: chunk.id,
        sectionTitle,
        chunkText: chunk.text,
        chunkMetadata: JSON.stringify(chunk.metadata ?? {}),
        requestId: `doc-${documentId}-chunk-${chunk.chunkIndex}`,
      });

      allCandidates.push({
        chunk_id: chunk.id,
        section_title: sectionTitle,
        candidates: extraction.concept_candidates.map((c) => ({
          canonical_title: c.canonical_title,
          type: c.type,
          short_description: c.short_description,
          importance: c.importance,
          difficulty: c.difficulty,
          evidence_snippet: c.evidence_snippet,
        })),
      });
    } catch (err) {
      // LLM 재시도 소진 시 해당 청크는 건너뛰고 로그만 남김
      console.warn("[document-processor]", {
        stage: "chunk_concept_extraction_skipped",
        documentId,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        error: err instanceof Error ? err.message : "알 수 없는 오류",
      });
      // 빈 결과로 계속 진행
      allCandidates.push({
        chunk_id: chunk.id,
        section_title: sectionTitle,
        candidates: [],
      });
    }
  }

  console.info("[document-processor]", {
    stage: "chunk_concept_extraction_complete",
    documentId,
    totalChunks: chunks.length,
    processedChunks: allCandidates.length,
    totalCandidates: allCandidates.reduce((s, c) => s + c.candidates.length, 0),
  });

  // JSON 직렬화 (LLM consolidation 입력용)
  return JSON.stringify(allCandidates);
}

// ──────────────────────────────────────────────
// 개념 통합
// ──────────────────────────────────────────────

async function consolidateConcepts(
  documentId: string,
  documentTitle: string,
  allCandidatesJson: string,
): Promise<{
  consolidatedJson: string;
  consolidatedConcepts: ConsolidatedConcept[];
  summary: string;
  mainTopic: string;
}> {
  console.info("[document-processor]", {
    stage: "consolidation_start",
    documentId,
    candidatesLength: allCandidatesJson.length,
  });

  const { consolidation, qualityWarnings } = await generateDocumentConsolidation({
    documentTitle,
    conceptCandidatesJson: allCandidatesJson,
    requestId: `doc-${documentId}-consolidation`,
  });

  if (qualityWarnings.length > 0) {
    console.warn("[document-processor]", {
      stage: "consolidation_quality_warnings",
      documentId,
      warnings: qualityWarnings,
    });
  }

  // 품질 검사: 핵심 개념이 너무 적으면 실패 처리
  const coreConcepts = consolidation.concepts.filter(
    (c) => c.type === "document_core" || c.type === "document_topic",
  );
  if (coreConcepts.length < MIN_QUALITY_CONCEPT_COUNT) {
    throw new DocumentProcessorError(
      "LOW_QUALITY",
      "이 문서에서 충분한 학습 개념을 추출하지 못했습니다. 문서 품질을 확인하거나 다른 자료를 업로드해 주세요.",
    );
  }

  console.info("[document-processor]", {
    stage: "consolidation_complete",
    documentId,
    conceptCount: consolidation.concepts.length,
    qualityWarningCount: qualityWarnings.length,
  });

  return {
    consolidatedJson: JSON.stringify(consolidation.concepts),
    consolidatedConcepts: consolidation.concepts,
    summary: consolidation.summary,
    mainTopic: consolidation.main_topic,
  };
}

// ──────────────────────────────────────────────
// document_concepts 저장
// ──────────────────────────────────────────────

function saveDocumentConcepts(
  documentId: string,
  consolidatedConcepts: ConsolidatedConcept[],
): void {
  const inputs: DocumentConceptInput[] = consolidatedConcepts.map((c) => ({
    conceptTitle: c.canonical_title,
    conceptType: c.type,
    importance: c.importance,
    difficulty: c.difficulty,
    sourceType: c.source_type,
    evidence: c.evidence.map((e) => ({
      documentId,
      chunkId: e.chunk_id,
      pageStart: e.page_start,
      pageEnd: e.page_end,
      sectionTitle: e.section_title,
      snippet: "",
    })),
  }));

  const saved = bulkInsertDocumentConcepts(documentId, inputs);
  console.info("[document-processor]", {
    stage: "document_concepts_saved",
    documentId,
    savedCount: saved.length,
  });
}

// ──────────────────────────────────────────────
// 문서 기반 학습 트리 생성
// ──────────────────────────────────────────────

async function generateDocumentLearningTree(
  documentId: string,
  documentTitle: string,
  summary: string,
  consolidatedConceptsJson: string,
): Promise<DocumentTreeResponse> {
  console.info("[document-processor]", {
    stage: "tree_generation_start",
    documentId,
  });

  const { tree, qualityWarnings } = await generateDocumentTree({
    documentId,
    documentTitle,
    documentSummary: summary,
    consolidatedConceptsJson,
    requestId: `doc-${documentId}-tree`,
  });

  if (qualityWarnings.length > 0) {
    console.warn("[document-processor]", {
      stage: "tree_generation_quality_warnings",
      documentId,
      warnings: qualityWarnings,
    });
  }

  console.info("[document-processor]", {
    stage: "tree_generation_complete",
    documentId,
    nodeCount: tree.nodes.length,
    edgeCount: tree.edges.length,
    qualityWarningCount: qualityWarnings.length,
  });

  return tree;
}

// ──────────────────────────────────────────────
// 학습 트리 저장 (문서용)
// ──────────────────────────────────────────────

function persistDocumentTree(
  docTree: DocumentTreeResponse,
  documentId: string,
  userId: string,
): string {
  const now = nowIso();
  const db = getDb();

  return db.transaction((tx) => {
    // 1. learning_trees 행 생성
    const learningTree = toLearningTreeResponse(docTree);
    const tr = tx
      .insert(learningTrees)
      .values({
        userId,
        topic: docTree.topic,
        summary: docTree.summary,
        treeJson: learningTree,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: learningTrees.id })
      .all();
    const treeId = tr[0]?.id;
    if (!treeId) throw new Error("learning_trees insert failed");

    // 2. learning_nodes 행 생성 (문서 source_type/evidence는 description에 포함)
    const nodeIds: string[] = [];
    for (const n of docTree.nodes) {
      const nr = tx
        .insert(learningNodes)
        .values({
          treeId,
          nodeKey: n.id,
          title: n.title,
          type: n.type === "document_core" ? "core" : (n.type as LearningTreeNode["type"]),
          description: n.description,
          difficulty: n.difficulty,
          prerequisites: n.prerequisites,
          children: n.children,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: learningNodes.id })
        .all();
      const nid = nr[0]?.id;
      if (!nid) throw new Error("learning_nodes insert failed");
      nodeIds.push(nid);
    }

    // 3. user_node_progress 생성 (기본 unknown)
    if (nodeIds.length > 0) {
      tx.insert(userNodeProgress)
        .values(
          nodeIds.map((nodeId) => ({
            userId,
            treeId,
            nodeId,
            status: "unknown" as const,
            updatedAt: now,
          })),
        )
        .run();
    }

    // 4. document_learning_trees 연결
    createDocumentLearningTreeLink(documentId, treeId);

    return treeId;
  });
}

// ──────────────────────────────────────────────
// 메인 파이프라인
// ──────────────────────────────────────────────

export interface ProcessDocumentResult {
  treeId: string | null;
}

export async function processDocument(
  documentId: string,
  userId: string,
): Promise<ProcessDocumentResult> {
  const doc = getDocumentForUser(documentId, userId);
  if (!doc) {
    throw new DocumentProcessorError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  // ── 상태 검증 ──
  // "uploaded": 신규 처리, 그 외 상태는 재처리/오류 처리
  const restartableStates = new Set(["uploaded", "text_extracted", "chunked", "concepts_extracted", "failed"]);
  if (doc.processingStatus === "tree_generated") {
    throw new DocumentProcessorError(
      "ALREADY_PROCESSED",
      "이미 처리 완료된 문서입니다. 재처리가 필요하면 문서를 다시 업로드해 주세요.",
    );
  }
  if (!restartableStates.has(doc.processingStatus)) {
    throw new DocumentProcessorError(
      "INVALID_STATUS",
      "처리할 수 없는 상태의 문서입니다.",
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

  const documentTitle = doc.title || doc.originalFilename;

  // ══════════════════════════════════════════
  // Step 1: 텍스트 추출 (이미 되어있으면 건너뛰기)
  // ══════════════════════════════════════════
  if (doc.processingStatus === "uploaded") {
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
      updateDocumentStatus(documentId, "failed", `텍스트 추출 실패: ${message}`);
      throw new DocumentProcessorError(
        "TEXT_EXTRACTION_FAILED",
        "이 PDF에서는 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.",
      );
    }

    // 추출된 텍스트 최소 길이 검증
    const totalText = pages.map((p) => p.text).join("\n\n");
    if (totalText.length < MIN_EXTRACTED_TEXT_LENGTH) {
      updateDocumentStatus(documentId, "failed", "추출된 텍스트가 너무 적습니다. 스캔본 PDF일 수 있습니다.");
      throw new DocumentProcessorError(
        "TEXT_EXTRACTION_FAILED",
        "이 PDF에서는 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.",
      );
    }

    // 페이지 수 제한
    if (pages.length > MAX_PAGES) {
      updateDocumentStatus(documentId, "failed", `페이지 수 초과: ${pages.length} > ${MAX_PAGES}`);
      throw new DocumentProcessorError(
        "DOCUMENT_TOO_LONG",
        "문서가 너무 깁니다. Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다. 중요한 챕터나 섹션만 분리해서 업로드해 주세요.",
      );
    }

    // 텍스트 길이 제한
    const totalTextLen = pages.map((p) => p.text).join("\n\n");
    if (totalTextLen.length > MAX_TEXT_LENGTH) {
      updateDocumentStatus(documentId, "failed", `텍스트 길이 초과: ${totalTextLen.length} > ${MAX_TEXT_LENGTH}`);
      throw new DocumentProcessorError(
        "DOCUMENT_TOO_LONG",
        "문서가 너무 깁니다. Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다. 중요한 챕터나 섹션만 분리해서 업로드해 주세요.",
      );
    }

    // 페이지 저장
    const pageInputs = pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    bulkInsertDocumentPages(documentId, pageInputs);

    // 문서 메타데이터 갱신
    updateDocumentExtractedInfo(documentId, pages.length, totalTextLen.length);
    updateDocumentStatus(documentId, "text_extracted");
  }

  // ══════════════════════════════════════════
  // Step 2: 청크 분할 (이미 되어있으면 건너뛰기)
  // ══════════════════════════════════════════
  if (doc.processingStatus === "uploaded" || doc.processingStatus === "text_extracted") {
    let pagesForChunking: Array<{ pageNumber: number; text: string }>;

    if (doc.fileType === "pdf") {
      // PDF는 다시 추출
      pagesForChunking = await extractPdfPages(fileBuffer);
    } else {
      const text = fileBuffer.toString("utf-8");
      pagesForChunking = [{ pageNumber: 1, text }];
    }

    const fullText = pagesForChunking.map((p) => p.text).join("\n\n");
    let chunks;
    if (doc.fileType === "pdf") {
      chunks = chunkFromPdfPages(pagesForChunking);
    } else {
      const units = splitTextIntoUnits(fullText, doc.fileType, 1);
      chunks = chunkUnits(units);
    }

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

    updateDocumentStatus(documentId, "chunked");
  }

  // ══════════════════════════════════════════
  // Step 3: 청크별 개념 추출
  // ══════════════════════════════════════════
  if (doc.processingStatus === "chunked" || doc.processingStatus === "uploaded" || doc.processingStatus === "text_extracted") {
    // 이미 "chunked" 상태로 저장된 상태임
    // 그래도 청크 데이터가 확실히 있는지 확인
  }

  const chunks = getDocumentChunks(documentId);
  if (chunks.length === 0) {
    updateDocumentStatus(documentId, "failed", "청크 데이터가 없습니다.");
    throw new DocumentProcessorError(
      "CHUNKING_FAILED",
      "문서를 청크로 분할하는 데 실패했습니다.",
    );
  }

  // ══════════════════════════════════════════
  // Step 4: 청크별 개념 추출 via LLM
  // ══════════════════════════════════════════
  let allCandidatesJson: string;
  let consolidated: {
    consolidatedJson: string;
    consolidatedConcepts: ConsolidatedConcept[];
    summary: string;
    mainTopic: string;
  };

  try {
    allCandidatesJson = await extractConceptsFromChunks(documentId, documentTitle, chunks);
  } catch (err) {
    const msg = err instanceof DocumentProcessorError ? err.message : "청크 개념 추출 중 오류가 발생했습니다.";
    updateDocumentStatus(documentId, "failed", msg);
    throw new DocumentProcessorError("CONCEPT_EXTRACTION_FAILED", msg);
  }

  // ══════════════════════════════════════════
  // Step 5: 개념 통합 via LLM
  // ══════════════════════════════════════════
  try {
    consolidated = await consolidateConcepts(documentId, documentTitle, allCandidatesJson);
  } catch (err) {
    if (err instanceof DocumentProcessorError) {
      updateDocumentStatus(documentId, "failed", err.message);
      throw err;
    }
    const msg = err instanceof LlmExhaustedRetriesError
      ? "개념 통합 중 오류가 발생했습니다."
      : "개념 통합 중 오류가 발생했습니다.";
    updateDocumentStatus(documentId, "failed", msg);
    throw new DocumentProcessorError("CONSOLIDATION_FAILED", msg);
  }

  updateDocumentStatus(documentId, "concepts_extracted");

  // ══════════════════════════════════════════
  // Step 6: document_concepts 저장
  // ══════════════════════════════════════════
  saveDocumentConcepts(documentId, consolidated.consolidatedConcepts);

  // ══════════════════════════════════════════
  // Step 7: 문서 기반 학습 트리 생성 via LLM
  // ══════════════════════════════════════════
  let docTree: DocumentTreeResponse;
  try {
    docTree = await generateDocumentLearningTree(
      documentId,
      documentTitle,
      consolidated.summary,
      consolidated.consolidatedJson,
    );
  } catch (err) {
    const msg = err instanceof LlmExhaustedRetriesError
      ? "학습 트리 생성 중 오류가 발생했습니다."
      : "학습 트리 생성 중 오류가 발생했습니다.";
    updateDocumentStatus(documentId, "failed", msg);
    throw new DocumentProcessorError("TREE_GENERATION_FAILED", msg);
  }

  // ══════════════════════════════════════════
  // Step 8: 학습 트리 저장
  // ══════════════════════════════════════════
  let treeId: string;
  try {
    treeId = persistDocumentTree(docTree, documentId, userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "학습 트리 저장 중 오류가 발생했습니다.";
    updateDocumentStatus(documentId, "failed", `트리 저장 실패: ${msg}`);
    throw new DocumentProcessorError("TREE_PERSIST_FAILED", "학습 트리를 저장하지 못했습니다.");
  }

  // ══════════════════════════════════════════
  // Step 9: 상태 → tree_generated
  // ══════════════════════════════════════════
  updateDocumentStatus(documentId, "tree_generated");

  console.info("[document-processor]", {
    stage: "pipeline_complete",
    documentId,
    treeId,
    conceptCount: consolidated.consolidatedConcepts.length,
    nodeCount: docTree.nodes.length,
  });

  return { treeId };
}
