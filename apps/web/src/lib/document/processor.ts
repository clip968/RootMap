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
  updateDocumentMetadata,
  updateDocumentExtractedInfo,
  bulkInsertDocumentPages,
  bulkInsertDocumentChunks,
  getDocumentChunks,
  updateDocumentChunkMetadata,
  bulkInsertDocumentConcepts,
  getDocumentConceptRows,
  getDocumentLearningTreeForUser,
  createDocumentLearningTreeLink,
} from "@/lib/repository/document-repository";
import type {
  DocumentConceptInput,
  DocumentConceptRow,
  DocumentChunkRow,
  DocumentProcessingStatus,
} from "@/lib/repository/document-repository";
import { extractPdfPages } from "./extract-pdf";
import { splitTextIntoUnits } from "./extract-text";
import { chunkFromPdfPages, chunkUnits } from "./chunker";
import { generateChunkConcepts } from "@/lib/llm/generate-document-chunk-concepts";
import { generateDocumentConsolidation } from "@/lib/llm/generate-document-consolidation";
import { generateDocumentTreeStructure } from "@/lib/llm/generate-document-structure";
import { LlmExhaustedRetriesError } from "@/lib/llm/errors";
import { getDb } from "@/db/client";
import { learningTrees, learningNodes, userNodeProgress } from "@/db/schema";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { prewarmNodeDetailJobsForTree } from "@/lib/services/node-detail-prewarm";
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
import {
  downloadDocumentObject,
  SUPABASE_DOCUMENT_STORAGE_PROVIDER,
  type DocumentStorageRef,
  type SupabaseDocumentStorageRef,
} from "@/lib/storage/supabase-document-storage";

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
const MIN_QUALITY_CONCEPT_COUNT = 2;
const DEFAULT_CHUNK_CONCURRENCY = 3;
const DOCUMENT_EVIDENCE_SNIPPET_MAX = 360;
const CHUNK_CONCEPT_EXTRACTION_METADATA_KEY = "document_concept_extraction";
const DOCUMENT_CONSOLIDATION_METADATA_KEY = "document_concept_consolidation";

type ChunkConceptCandidate = {
  canonical_title: string;
  type: string;
  short_description: string;
  importance: number;
  difficulty: number;
  evidence_snippet: string;
};

type ChunkCandidateBatch = {
  chunk_id: string;
  section_title: string;
  candidates: ChunkConceptCandidate[];
};

type ChunkConceptExtractionMetadata = ChunkCandidateBatch & {
  status: "completed" | "skipped";
  updated_at: string;
  error?: string;
};

type ExtractConceptsFromChunksResult = {
  candidatesJson: string;
  complete: boolean;
  processedChunkCount: number;
  totalChunkCount: number;
  pendingChunkCount: number;
  totalCandidates: number;
};

type DocumentConsolidationMetadata = {
  summary: string;
  main_topic: string;
  consolidated_concepts_json: string;
  updated_at: string;
};

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

async function readStoredDocumentFile(
  storage: DocumentStorageRef,
): Promise<Buffer> {
  if (storage.provider === SUPABASE_DOCUMENT_STORAGE_PROVIDER) {
    return downloadDocumentObject(storage as SupabaseDocumentStorageRef);
  }
  return fs.readFile(storageAbsPath(storage.key));
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isChunkCandidateBatch(value: unknown): value is ChunkCandidateBatch {
  const record = asRecord(value);
  return (
    typeof record.chunk_id === "string" &&
    typeof record.section_title === "string" &&
    Array.isArray(record.candidates)
  );
}

function getChunkConceptExtraction(
  chunk: DocumentChunkRow,
): ChunkConceptExtractionMetadata | null {
  const metadata = asRecord(chunk.metadata);
  const extraction = metadata[CHUNK_CONCEPT_EXTRACTION_METADATA_KEY];
  if (!isChunkCandidateBatch(extraction)) return null;
  const status = asRecord(extraction).status;
  if (status !== "completed" && status !== "skipped") return null;
  return extraction as ChunkConceptExtractionMetadata;
}

function getDocumentConsolidationMetadata(
  metadata: unknown,
): DocumentConsolidationMetadata | null {
  const record = asRecord(metadata)[DOCUMENT_CONSOLIDATION_METADATA_KEY];
  const consolidation = asRecord(record);
  if (
    typeof consolidation.summary !== "string" ||
    typeof consolidation.main_topic !== "string" ||
    typeof consolidation.consolidated_concepts_json !== "string"
  ) {
    return null;
  }
  return consolidation as DocumentConsolidationMetadata;
}

async function saveChunkConceptExtraction(
  documentId: string,
  chunk: DocumentChunkRow,
  extraction: ChunkConceptExtractionMetadata,
): Promise<void> {
  // 청크 metadata는 worker 재시작 후 어느 청크까지 LLM 호출이 끝났는지 확인하는 checkpoint다.
  await updateDocumentChunkMetadata(documentId, chunk.id, {
    ...asRecord(chunk.metadata),
    [CHUNK_CONCEPT_EXTRACTION_METADATA_KEY]: extraction,
  });
}

async function saveDocumentConsolidationMetadata(
  documentId: string,
  documentMetadata: unknown,
  consolidation: DocumentConsolidationMetadata,
): Promise<Record<string, unknown>> {
  // 통합 결과를 document metadata에 남겨 concepts_extracted 이후 트리 생성만 별도 worker에서 이어간다.
  const nextMetadata = {
    ...asRecord(documentMetadata),
    [DOCUMENT_CONSOLIDATION_METADATA_KEY]: consolidation,
  };
  await updateDocumentMetadata(documentId, nextMetadata);
  return nextMetadata;
}

function consolidatedJsonFromDocumentConceptRows(rows: DocumentConceptRow[]): string {
  const concepts: ConsolidatedConcept[] = rows.map((row) => ({
    canonical_title: row.conceptTitle,
    aliases: [],
    type: row.conceptType as ConsolidatedConcept["type"],
    importance: row.importance ?? 3,
    difficulty: row.difficulty ?? 3,
    source_type: row.sourceType === "explicit" ? "explicit" : "inferred",
    evidence: Array.isArray(row.evidence)
      ? row.evidence.map((item) => ({
          chunk_id: item.chunkId ?? "",
          page_start: item.pageStart,
          page_end: item.pageEnd,
          section_title: item.sectionTitle ?? "",
        }))
      : [],
  }));
  return JSON.stringify(concepts);
}

export function hasMinimumDocumentConceptQuality(
  concepts: ConsolidatedConcept[],
): boolean {
  const coreConcepts = concepts.filter(
    (c) => c.type === "document_core" || c.type === "document_topic",
  );
  return coreConcepts.length >= MIN_QUALITY_CONCEPT_COUNT;
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
  options: { chunkBatchSize?: number } = {},
): Promise<ExtractConceptsFromChunksResult> {
  console.info("[document-processor]", {
    stage: "chunk_concept_extraction_start",
    documentId,
    chunkCount: chunks.length,
  });

  const concurrency = getDocumentChunkConcurrency();
  const savedCandidates = new Map<string, ChunkCandidateBatch>();
  const missingChunks: DocumentChunkRow[] = [];

  for (const chunk of chunks) {
    const extraction = getChunkConceptExtraction(chunk);
    if (extraction) {
      savedCandidates.set(chunk.id, {
        chunk_id: extraction.chunk_id,
        section_title: extraction.section_title,
        candidates: extraction.candidates,
      });
      continue;
    }
    missingChunks.push(chunk);
  }

  const chunkBatchSize =
    options.chunkBatchSize === undefined
      ? missingChunks.length
      : Math.max(1, Math.floor(options.chunkBatchSize));
  const chunksToProcess = missingChunks.slice(0, chunkBatchSize);

  const processedCandidates = await runWithConcurrency(
    chunksToProcess,
    concurrency,
    async (chunk): Promise<ChunkCandidateBatch> => {
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

        const batch: ChunkCandidateBatch = {
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
        await saveChunkConceptExtraction(documentId, chunk, {
          ...batch,
          status: "completed",
          updated_at: nowIso(),
        });
        return batch;
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
        const batch: ChunkCandidateBatch = {
          chunk_id: chunk.id,
          section_title: sectionTitle,
          candidates: [],
        };
        await saveChunkConceptExtraction(documentId, chunk, {
          ...batch,
          status: "skipped",
          updated_at: nowIso(),
          error: err instanceof Error ? err.message : "알 수 없는 오류",
        });
        return batch;
      }
    },
  );

  for (const batch of processedCandidates) {
    savedCandidates.set(batch.chunk_id, batch);
  }

  const allCandidates = chunks
    .map((chunk) => savedCandidates.get(chunk.id))
    .filter((batch): batch is ChunkCandidateBatch => Boolean(batch));
  const totalCandidates = allCandidates.reduce((s, c) => s + c.candidates.length, 0);
  const pendingChunkCount = chunks.length - allCandidates.length;
  const complete = pendingChunkCount === 0;

  console.info("[document-processor]", {
    stage: "chunk_concept_extraction_complete",
    documentId,
    concurrency,
    totalChunks: chunks.length,
    processedChunks: processedCandidates.length,
    checkpointedChunks: allCandidates.length,
    pendingChunkCount,
    totalCandidates,
  });

  if (complete && totalCandidates === 0) {
    throw new DocumentProcessorError(
      "CONCEPT_EXTRACTION_FAILED",
      "문서에서 학습 개념 후보를 추출하지 못했습니다. 잠시 후 다시 시도하거나 더 명확한 문서를 업로드해 주세요.",
    );
  }

  // JSON 직렬화 (LLM consolidation 입력용)
  return {
    candidatesJson: JSON.stringify(allCandidates),
    complete,
    processedChunkCount: processedCandidates.length,
    totalChunkCount: chunks.length,
    pendingChunkCount,
    totalCandidates,
  };
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

  // 품질 검사: schema warning 기준과 맞춰 document_core/document_topic이 2개 이상이면 통과시킨다.
  if (!hasMinimumDocumentConceptQuality(consolidation.concepts)) {
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
    // 같은 transaction 안에서 방금 만든 learning_trees 행을 참조해야 FK 검증이 통과한다.
    await createDocumentLearningTreeLink(documentId, treeId, tx);

    return treeId;
  });
}

// ──────────────────────────────────────────────
// 메인 파이프라인
// ──────────────────────────────────────────────

export interface ProcessDocumentResult {
  treeId: string | null;
  shouldRequeue?: boolean;
  reason?: "chunk_concepts_pending" | "tree_generation_deferred" | "already_processed";
  processedChunkCount?: number;
  totalChunkCount?: number;
  pendingChunkCount?: number;
}

export interface ProcessDocumentOptions {
  chunkBatchSize?: number;
  stopAfterConcepts?: boolean;
  treeOnly?: boolean;
  resumeFailed?: boolean;
}

export async function processDocument(
  documentId: string,
  userId: string,
  options: ProcessDocumentOptions = {},
): Promise<ProcessDocumentResult> {
  const doc = await getDocumentForUser(documentId, userId);
  if (!doc) {
    throw new DocumentProcessorError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  let currentStatus = doc.processingStatus as DocumentProcessingStatus;
  let documentMetadata = asRecord(doc.metadata);
  const documentTitle = doc.title || doc.originalFilename;

  // ── 상태 검증 ──
  // failed 상태는 자동 재개하지 않는다. 운영자가 원인을 확인하고 상태를 되돌린 뒤 tree-only를 실행하는 것이 기본 복구 경로다.
  const restartableStates = new Set<DocumentProcessingStatus>([
    "uploaded",
    "text_extracted",
    "chunked",
    "concepts_extracted",
  ]);
  if (currentStatus === "tree_generated") {
    const bundle = await getDocumentLearningTreeForUser(documentId, userId);
    return { treeId: bundle?.tree.id ?? null, reason: "already_processed" };
  }
  if (currentStatus === "failed" && !options.resumeFailed) {
    throw new DocumentProcessorError(
      "INVALID_STATUS",
      "failed 상태 문서는 자동 재개하지 않습니다. 실패 원인을 확인한 뒤 필요한 상태로 복구해 주세요.",
    );
  }
  if (currentStatus === "failed" && options.resumeFailed) {
    restartableStates.add("failed");
  }
  if (options.treeOnly && currentStatus !== "concepts_extracted") {
    throw new DocumentProcessorError(
      "INVALID_STATUS",
      "--tree-only는 concepts_extracted 상태에서만 실행할 수 있습니다.",
    );
  }
  if (!restartableStates.has(currentStatus)) {
    throw new DocumentProcessorError(
      "INVALID_STATUS",
      "처리할 수 없는 상태의 문서입니다.",
    );
  }

  let fileBuffer: Buffer | null = null;
  if (currentStatus !== "concepts_extracted") {
    const storage = documentMetadata.storage as DocumentStorageRef | undefined;
    const fileKey = storage?.key;
    if (!fileKey) {
      throw new DocumentProcessorError(
        "FILE_NOT_FOUND",
        "문서 파일 경로를 찾을 수 없습니다.",
      );
    }

    try {
      fileBuffer = await readStoredDocumentFile(storage);
    } catch {
      throw new DocumentProcessorError(
        "FILE_NOT_FOUND",
        "문서 파일을 읽을 수 없습니다.",
      );
    }
  }

  let extractedPagesForThisRun: Array<{ pageNumber: number; text: string }> | null = null;

  // ══════════════════════════════════════════
  // Step 1: 텍스트 추출 (이미 되어있으면 건너뛰기)
  // ══════════════════════════════════════════
  if (currentStatus === "uploaded") {
    if (!fileBuffer) {
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
    extractedPagesForThisRun = pages;
    await updateDocumentExtractedInfo(documentId, pages.length, totalTextLen.length);
    await updateDocumentStatus(documentId, "text_extracted");
    currentStatus = "text_extracted";
  }

  // ══════════════════════════════════════════
  // Step 2: 청크 분할 (이미 되어있으면 건너뛰기)
  // ══════════════════════════════════════════
  if (currentStatus === "text_extracted") {
    if (!fileBuffer) {
      throw new DocumentProcessorError(
        "FILE_NOT_FOUND",
        "문서 파일을 읽을 수 없습니다.",
      );
    }
    let pagesForChunking: Array<{ pageNumber: number; text: string }>;

    if (doc.fileType === "pdf") {
      // 같은 worker 호출에서 텍스트 추출을 끝냈다면 PDF를 다시 파싱하지 않고 그 결과를 재사용한다.
      pagesForChunking = extractedPagesForThisRun ?? await extractPdfPages(fileBuffer);
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
    currentStatus = "chunked";
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
  let treeSummary = `${documentTitle} 문서에서 추출한 학습 개념입니다.`;
  let treeConsolidatedJson = "";
  let documentConceptRows: DocumentConceptRow[] = [];
  let extractionResult: ExtractConceptsFromChunksResult | null = null;

  if (currentStatus !== "concepts_extracted") {
    try {
      extractionResult = await extractConceptsFromChunks(
        documentId,
        documentTitle,
        chunks,
        { chunkBatchSize: options.chunkBatchSize },
      );
    } catch (err) {
      const msg = err instanceof DocumentProcessorError ? err.message : "청크 개념 추출 중 오류가 발생했습니다.";
      await updateDocumentStatus(documentId, "failed", msg);
      throw new DocumentProcessorError("CONCEPT_EXTRACTION_FAILED", msg);
    }

    if (!extractionResult.complete) {
      return {
        treeId: null,
        shouldRequeue: true,
        reason: "chunk_concepts_pending",
        processedChunkCount: extractionResult.processedChunkCount,
        totalChunkCount: extractionResult.totalChunkCount,
        pendingChunkCount: extractionResult.pendingChunkCount,
      };
    }

    // ══════════════════════════════════════════
    // Step 5: 개념 통합 via LLM
    // ══════════════════════════════════════════
    let consolidated: {
      consolidatedJson: string;
      consolidatedConcepts: ConsolidatedConcept[];
      summary: string;
      mainTopic: string;
    };
    try {
      consolidated = await consolidateConcepts(
        documentId,
        documentTitle,
        extractionResult.candidatesJson,
      );
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

    treeSummary = consolidated.summary;
    treeConsolidatedJson = consolidated.consolidatedJson;
    documentMetadata = await saveDocumentConsolidationMetadata(documentId, documentMetadata, {
      summary: consolidated.summary,
      main_topic: consolidated.mainTopic,
      consolidated_concepts_json: consolidated.consolidatedJson,
      updated_at: nowIso(),
    });

    // ══════════════════════════════════════════
    // Step 6: document_concepts 저장
    // ══════════════════════════════════════════
    documentConceptRows = await resolveAndSaveDocumentConcepts(documentId, consolidated.consolidatedConcepts);
    await updateDocumentStatus(documentId, "concepts_extracted");
    currentStatus = "concepts_extracted";

    if (options.stopAfterConcepts) {
      return {
        treeId: null,
        shouldRequeue: true,
        reason: "tree_generation_deferred",
        processedChunkCount: extractionResult.processedChunkCount,
        totalChunkCount: extractionResult.totalChunkCount,
        pendingChunkCount: 0,
      };
    }
  } else {
    const consolidationMetadata = getDocumentConsolidationMetadata(documentMetadata);
    documentConceptRows = await getDocumentConceptRows(documentId);
    if (documentConceptRows.length === 0) {
      throw new DocumentProcessorError(
        "CONCEPT_EXTRACTION_FAILED",
        "문서 개념 저장 결과를 찾을 수 없습니다. 문서를 다시 처리해 주세요.",
      );
    }
    treeSummary = consolidationMetadata?.summary ?? treeSummary;
    treeConsolidatedJson =
      consolidationMetadata?.consolidated_concepts_json ??
      consolidatedJsonFromDocumentConceptRows(documentConceptRows);
  }

  // ══════════════════════════════════════════
  // Step 7: 문서 기반 학습 트리 생성 via LLM
  // ══════════════════════════════════════════
  let docTree: LearningTreeResponse;
  try {
    docTree = await generateDocumentLearningTree(
      documentId,
      documentTitle,
      treeSummary,
      treeConsolidatedJson,
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
  const bundle = await getLearningTree(treeId, userId);
  if (bundle) void prewarmNodeDetailJobsForTree(bundle);

  console.info("[document-processor]", {
    stage: "pipeline_complete",
    documentId,
    treeId,
    conceptCount: documentConceptRows.length,
    nodeCount: docTree.nodes.length,
  });

  return { treeId };
}
