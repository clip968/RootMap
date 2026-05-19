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
import type { DocumentConceptInput, DocumentConceptRow, DocumentChunkRow } from "@/lib/repository/document-repository";
import { extractPdfPages } from "./extract-pdf";
import { splitTextIntoUnits } from "./extract-text";
import { chunkFromPdfPages, chunkUnits } from "./chunker";
import { generateChunkConcepts } from "@/lib/llm/generate-document-chunk-concepts";
import { generateDocumentConsolidation } from "@/lib/llm/generate-document-consolidation";
import { generateDocumentTreeStructure } from "@/lib/llm/generate-document-structure";
import { LlmExhaustedRetriesError } from "@/lib/llm/errors";
import { getDb } from "@/db/client";
import { learningTrees, learningNodes, userNodeProgress } from "@/db/schema";
import {
  addAliasesIfNew,
  allocateUniqueSlug,
  insertConceptFromCandidate,
  resolveConceptForReuse,
  tryRecordMergeCandidate,
} from "@/lib/repository/concept-repository";
import type { ConceptCandidate, LearningTreeNode } from "@/types/learning";
import type {
  ConsolidatedConcept,
  DocumentTreeStructureResponse,
  LearningTreeResponse,
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
const DEFAULT_CHUNK_CONCURRENCY = 3;
const DOCUMENT_EVIDENCE_SNIPPET_MAX = 360;

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

function nowIso(): string {
  return new Date().toISOString();
}

function getDocumentChunkConcurrency(): number {
  const raw = process.env.DOCUMENT_CHUNK_CONCURRENCY;
  if (!raw) return DEFAULT_CHUNK_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHUNK_CONCURRENCY;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
    }
  }

  // 청크별 LLM 호출은 서로 독립적이므로 제한된 worker 수만큼 병렬 처리한다.
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
  return results;
}

/**
 * Phase 3 Task 11: DocumentTreeStructureResponse → LearningTreeResponse
 *
 * description/difficulty/evidence/concept_candidate가 없는 구조 전용 응답을
 * DB 저장용 LearningTreeResponse로 변환한다.
 * - description은 빈 문자열 (노드 클릭 시 지연 생성)
 * - difficulty는 기본값 3
 * - concept_candidate는 title 기반으로 생성
 */
function structureToLearningTreeResponse(
  structure: DocumentTreeStructureResponse,
): LearningTreeResponse {
  return {
    topic: structure.topic,
    summary: structure.summary,
    recommended_order: structure.recommended_order,
    edges: structure.edges,
    nodes: structure.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type:
        n.type === "document_core"
          ? "core"
          : (n.type as LearningTreeNode["type"]),
      description: "",
      difficulty: 3,
      prerequisites: n.prerequisites,
      children: n.children,
      concept_candidate: {
        canonical_title: n.title,
        aliases: [],
        domain: null,
        short_description: "",
        is_reusable: true,
      },
    })),
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

  type ChunkCandidateBatch = {
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
  };

  const concurrency = getDocumentChunkConcurrency();

  const allCandidates = await runWithConcurrency(chunks, concurrency, async (chunk): Promise<ChunkCandidateBatch> => {
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

      return {
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
      };
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
      return {
        chunk_id: chunk.id,
        section_title: sectionTitle,
        candidates: [],
      };
    }
  });

  const totalCandidates = allCandidates.reduce((s, c) => s + c.candidates.length, 0);

  console.info("[document-processor]", {
    stage: "chunk_concept_extraction_complete",
    documentId,
    concurrency,
    totalChunks: chunks.length,
    processedChunks: allCandidates.length,
    totalCandidates,
  });

  if (totalCandidates === 0) {
    throw new DocumentProcessorError(
      "CONCEPT_EXTRACTION_FAILED",
      "문서에서 학습 개념 후보를 추출하지 못했습니다. 잠시 후 다시 시도하거나 더 명확한 문서를 업로드해 주세요.",
    );
  }

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
// document_concepts 저장 및 Concept Store 연결
// ──────────────────────────────────────────────

function clampDocumentScore(value: number): number {
  return Math.min(5, Math.max(1, Math.trunc(value)));
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function conceptCandidateFromDocumentConcept(concept: ConsolidatedConcept): ConceptCandidate {
  return {
    canonical_title: concept.canonical_title.trim(),
    aliases: uniqueNonEmpty(concept.aliases),
    domain: null,
    short_description: `${concept.canonical_title.trim()} 문서 기반 추출 개념`,
    is_reusable: true,
  };
}

function snippetFromChunk(chunk: DocumentChunkRow | undefined): string {
  if (!chunk) return "";
  return chunk.text.replace(/\s+/g, " ").trim().slice(0, DOCUMENT_EVIDENCE_SNIPPET_MAX);
}

function buildDocumentEvidence(
  documentId: string,
  concept: ConsolidatedConcept,
  chunksById: Map<string, DocumentChunkRow>,
): DocumentConceptInput["evidence"] {
  // inferred 개념은 문서 이해를 위해 추론된 선수지식이므로 직접 출처를 붙이지 않는다.
  if (concept.source_type === "inferred") return [];

  return concept.evidence.map((e) => {
    const chunk = chunksById.get(e.chunk_id);
    return {
      documentId,
      chunkId: e.chunk_id,
      pageStart: e.page_start,
      pageEnd: e.page_end,
      sectionTitle: e.section_title,
      snippet: snippetFromChunk(chunk),
    };
  });
}

function formatMatchedConceptsForPrompt(rows: DocumentConceptRow[]): string {
  const lines = rows
    .filter((row) => row.conceptId)
    .map(
      (row) =>
        `- ${row.conceptTitle} -> concept_id=${row.conceptId}, type=${row.conceptType}, source_type=${row.sourceType}`,
    );
  return lines.length > 0 ? lines.join("\n") : "";
}

export async function resolveAndSaveDocumentConcepts(
  documentId: string,
  consolidatedConcepts: ConsolidatedConcept[],
): Promise<DocumentConceptRow[]> {
  const db = getDb();
  const chunksById = new Map((await getDocumentChunks(documentId)).map((chunk) => [chunk.id, chunk]));

  const inputs: DocumentConceptInput[] = [];
  for (const concept of consolidatedConcepts) {
    const candidate = conceptCandidateFromDocumentConcept(concept);
    const resolution = await resolveConceptForReuse(db, candidate);
    let conceptId: string;

    if (resolution.kind === "reused") {
      conceptId = resolution.concept.id;
      // alias로 재사용된 경우 이후 검색도 쉬워지도록 문서 표기와 alias를 기존 Concept에 보강한다.
      await addAliasesIfNew(db, conceptId, uniqueNonEmpty([concept.canonical_title, ...concept.aliases]));
    } else {
      const created = await insertConceptFromCandidate(
        db,
        candidate,
        await allocateUniqueSlug(candidate.canonical_title, db),
      );
      conceptId = created.id;
      if (resolution.kind === "ambiguous_similar") {
        await tryRecordMergeCandidate(
          db,
          created.id,
          resolution.similar.id,
          0.6,
          "문서 기반 개념이 기존 Concept과 유사하지만 동일 개념인지 확정할 수 없습니다.",
        );
      }
    }

    inputs.push({
      conceptId,
      conceptTitle: concept.canonical_title,
      conceptType: concept.type,
      importance: clampDocumentScore(concept.importance),
      difficulty: clampDocumentScore(concept.difficulty),
      sourceType: concept.source_type,
      evidence: buildDocumentEvidence(documentId, concept, chunksById),
    });
  }

  const saved = await bulkInsertDocumentConcepts(documentId, inputs);
  console.info("[document-processor]", {
    stage: "document_concepts_saved",
    documentId,
    savedCount: saved.length,
  });
  return saved;
}

// ──────────────────────────────────────────────
// 문서 기반 학습 트리 생성
// ──────────────────────────────────────────────

async function generateDocumentLearningTree(
  documentId: string,
  documentTitle: string,
  summary: string,
  consolidatedConceptsJson: string,
  matchedConceptsContext: string,
): Promise<LearningTreeResponse> {
  console.info("[document-processor]", {
    stage: "tree_generation_start",
    documentId,
  });

  const treeStructure = await generateDocumentTreeStructure({
    documentId,
    documentTitle,
    documentSummary: summary,
    consolidatedConceptsJson,
    matchedConceptsContext,
    requestId: `doc-${documentId}-structure`,
  });

  console.info("[document-processor]", {
    stage: "tree_structure_generation_complete",
    documentId,
    nodeCount: treeStructure.nodes.length,
    edgeCount: treeStructure.edges.length,
    durationMs: 0, // 실제 시간은 generate 함수 내부에서 기록
  });

  return structureToLearningTreeResponse(treeStructure);
}

// ──────────────────────────────────────────────
// 학습 트리 저장 (문서용)
// ──────────────────────────────────────────────

async function persistDocumentTree(
  llmTree: LearningTreeResponse,
  documentId: string,
  userId: string,
  documentConceptRows: DocumentConceptRow[],
): Promise<string> {
  const now = nowIso();
  const db = getDb();
  const conceptIdByTitle = new Map(
    documentConceptRows.map((row) => [
      row.conceptTitle.trim().replace(/\s+/g, " ").toLowerCase(),
      row.conceptId,
    ]),
  );

  return db.transaction(async (tx) => {
    // 1. learning_trees 행 생성
    const tr = await tx
      .insert(learningTrees)
      .values({
        userId,
        topic: llmTree.topic,
        summary: llmTree.summary,
        treeJson: llmTree,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: learningTrees.id });
    const treeId = tr[0]?.id;
    if (!treeId) throw new Error("learning_trees insert failed");

    // 2. learning_nodes 행 생성 (source/evidence는 document_concepts에서 조회 시 합친다)
    const nodeIds: string[] = [];
    for (const n of llmTree.nodes) {
      const matchedConceptId =
        conceptIdByTitle.get(n.title.trim().replace(/\s+/g, " ").toLowerCase()) ??
        null;
      const nr = await tx
        .insert(learningNodes)
        .values({
          treeId,
          nodeKey: n.id,
          title: n.title,
          type: n.type,
          description: n.description,
          difficulty: n.difficulty,
          prerequisites: n.prerequisites,
          children: n.children,
          // 문서 트리 노드도 Concept Store id를 갖게 해 이후 상세/추천/재사용 UI에서 같은 개념으로 추적한다.
          conceptId: matchedConceptId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: learningNodes.id });
      const nid = nr[0]?.id;
      if (!nid) throw new Error("learning_nodes insert failed");
      nodeIds.push(nid);
    }

    // 3. user_node_progress 생성 (기본 unknown)
    if (nodeIds.length > 0) {
      await tx.insert(userNodeProgress)
        .values(
          nodeIds.map((nodeId) => ({
            userId,
            treeId,
            nodeId,
            status: "unknown" as const,
            updatedAt: now,
          })),
        );
    }

    // 4. document_learning_trees 연결
    await createDocumentLearningTreeLink(documentId, treeId);

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
  const doc = await getDocumentForUser(documentId, userId);
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
      await updateDocumentStatus(documentId, "failed", `텍스트 추출 실패: ${message}`);
      throw new DocumentProcessorError(
        "TEXT_EXTRACTION_FAILED",
        "이 PDF에서는 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.",
      );
    }

    // 추출된 텍스트 최소 길이 검증
    const totalText = pages.map((p) => p.text).join("\n\n");
    if (totalText.length < MIN_EXTRACTED_TEXT_LENGTH) {
      await updateDocumentStatus(documentId, "failed", "추출된 텍스트가 너무 적습니다. 스캔본 PDF일 수 있습니다.");
      throw new DocumentProcessorError(
        "TEXT_EXTRACTION_FAILED",
        "이 PDF에서는 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.",
      );
    }

    // 페이지 수 제한
    if (pages.length > MAX_PAGES) {
      await updateDocumentStatus(documentId, "failed", `페이지 수 초과: ${pages.length} > ${MAX_PAGES}`);
      throw new DocumentProcessorError(
        "DOCUMENT_TOO_LONG",
        "문서가 너무 깁니다. Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다. 중요한 챕터나 섹션만 분리해서 업로드해 주세요.",
      );
    }

    // 텍스트 길이 제한
    const totalTextLen = pages.map((p) => p.text).join("\n\n");
    if (totalTextLen.length > MAX_TEXT_LENGTH) {
      await updateDocumentStatus(documentId, "failed", `텍스트 길이 초과: ${totalTextLen.length} > ${MAX_TEXT_LENGTH}`);
      throw new DocumentProcessorError(
        "DOCUMENT_TOO_LONG",
        "문서가 너무 깁니다. Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다. 중요한 챕터나 섹션만 분리해서 업로드해 주세요.",
      );
    }

    // 페이지 저장
    const pageInputs = pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    await bulkInsertDocumentPages(documentId, pageInputs);

    // 문서 메타데이터 갱신
    await updateDocumentExtractedInfo(documentId, pages.length, totalTextLen.length);
    await updateDocumentStatus(documentId, "text_extracted");
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
      await bulkInsertDocumentChunks(
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

    await updateDocumentStatus(documentId, "chunked");
  }

  // ══════════════════════════════════════════
  // Step 3: 청크별 개념 추출
  // ══════════════════════════════════════════
  if (doc.processingStatus === "chunked" || doc.processingStatus === "uploaded" || doc.processingStatus === "text_extracted") {
    // 이미 "chunked" 상태로 저장된 상태임
    // 그래도 청크 데이터가 확실히 있는지 확인
  }

  const chunks = await getDocumentChunks(documentId);
  if (chunks.length === 0) {
    await updateDocumentStatus(documentId, "failed", "청크 데이터가 없습니다.");
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
    await updateDocumentStatus(documentId, "failed", msg);
    throw new DocumentProcessorError("CONCEPT_EXTRACTION_FAILED", msg);
  }

  // ══════════════════════════════════════════
  // Step 5: 개념 통합 via LLM
  // ══════════════════════════════════════════
  try {
    consolidated = await consolidateConcepts(documentId, documentTitle, allCandidatesJson);
  } catch (err) {
    if (err instanceof DocumentProcessorError) {
      await updateDocumentStatus(documentId, "failed", err.message);
      throw err;
    }
    const msg = err instanceof LlmExhaustedRetriesError
      ? "개념 통합 중 오류가 발생했습니다."
      : "개념 통합 중 오류가 발생했습니다.";
    await updateDocumentStatus(documentId, "failed", msg);
    throw new DocumentProcessorError("CONSOLIDATION_FAILED", msg);
  }

  await updateDocumentStatus(documentId, "concepts_extracted");

  // ══════════════════════════════════════════
  // Step 6: document_concepts 저장
  // ══════════════════════════════════════════
  const documentConceptRows = await resolveAndSaveDocumentConcepts(documentId, consolidated.consolidatedConcepts);

  // ══════════════════════════════════════════
  // Step 7: 문서 기반 학습 트리 생성 via LLM
  // ══════════════════════════════════════════
  let docTree: LearningTreeResponse;
  try {
    docTree = await generateDocumentLearningTree(
      documentId,
      documentTitle,
      consolidated.summary,
      consolidated.consolidatedJson,
      formatMatchedConceptsForPrompt(documentConceptRows),
    );
  } catch (err) {
    const msg = err instanceof LlmExhaustedRetriesError
      ? "학습 트리 생성 중 오류가 발생했습니다."
      : "학습 트리 생성 중 오류가 발생했습니다.";
    await updateDocumentStatus(documentId, "failed", msg);
    throw new DocumentProcessorError("TREE_GENERATION_FAILED", msg);
  }

  // ══════════════════════════════════════════
  // Step 8: 학습 트리 저장
  // ══════════════════════════════════════════
  let treeId: string;
  try {
    treeId = await persistDocumentTree(docTree, documentId, userId, documentConceptRows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "학습 트리 저장 중 오류가 발생했습니다.";
    await updateDocumentStatus(documentId, "failed", `트리 저장 실패: ${msg}`);
    throw new DocumentProcessorError("TREE_PERSIST_FAILED", "학습 트리를 저장하지 못했습니다.");
  }

  // ══════════════════════════════════════════
  // Step 9: 상태 → tree_generated
  // ══════════════════════════════════════════
  await updateDocumentStatus(documentId, "tree_generated");

  console.info("[document-processor]", {
    stage: "pipeline_complete",
    documentId,
    treeId,
    conceptCount: consolidated.consolidatedConcepts.length,
    nodeCount: docTree.nodes.length,
  });

  return { treeId };
}
