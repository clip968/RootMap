import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  getLearningTree,
  type LearningTreeBundle,
} from "@/lib/repository/learning-repository";
import {
  documentChunks,
  documentConcepts,
  documentLearningTrees,
  documentPages,
  documents,
} from "@/db/schema";

export type DocumentProcessingStatus =
  | "uploaded"
  | "text_extracted"
  | "chunked"
  | "concepts_extracted"
  | "tree_generated"
  | "failed";

export type DocumentConceptType =
  | "document_topic"
  | "prerequisite"
  | "document_core"
  | "method"
  | "background"
  | "misconception"
  | "evaluation";

export type DocumentSourceType = "explicit" | "inferred" | "generated";

export interface DocumentEvidence {
  documentId: string;
  chunkId: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  sectionTitle: string | null;
  snippet: string;
}

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentPageRow = typeof documentPages.$inferSelect;
export type DocumentChunkRow = typeof documentChunks.$inferSelect;
export type DocumentConceptRow = typeof documentConcepts.$inferSelect;

export interface DocumentConceptSummary {
  document_concept_id: string;
  concept_id: string | null;
  concept_title: string;
  concept_type: DocumentConceptType;
  importance: number | null;
  difficulty: number | null;
  source_type: DocumentSourceType;
  evidence_count: number;
}

export interface DocumentConceptEvidenceResponse {
  document_concept_id: string;
  concept_title: string;
  evidence: Array<{
    page_start: number | null;
    page_end: number | null;
    section_title: string | null;
    snippet: string;
  }>;
}

export interface DocumentTreeNodeContext {
  document_id: string;
  document_title: string;
  document_concept_id: string;
  concept_id: string | null;
  concept_title: string;
  concept_type: DocumentConceptType;
  source_type: DocumentSourceType;
  evidence_count: number;
  evidence: Array<{
    page_start: number | null;
    page_end: number | null;
    section_title: string | null;
    snippet: string;
  }>;
}

export interface DocumentTreeContext {
  document_id: string;
  document_title: string;
  by_concept_id: Map<string, DocumentTreeNodeContext>;
  by_normalized_title: Map<string, DocumentTreeNodeContext>;
}

export interface CreateDocumentInput {
  userId: string;
  title?: string | null;
  originalFilename: string;
  fileType: string;
  fileSizeBytes: number;
  pageCount?: number | null;
  extractedTextLength?: number | null;
  metadata?: Record<string, unknown>;
}

export interface DocumentPageInput {
  pageNumber: number;
  text?: string | null;
}

export interface DocumentChunkInput {
  chunkIndex: number;
  pageStart?: number | null;
  pageEnd?: number | null;
  sectionTitle?: string | null;
  text: string;
  tokenCount?: number | null;
  metadata?: Record<string, unknown>;
}

export interface DocumentConceptInput {
  conceptId?: string | null;
  conceptTitle: string;
  conceptType: DocumentConceptType;
  importance?: number | null;
  difficulty?: number | null;
  sourceType: DocumentSourceType;
  evidence?: DocumentEvidence[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function createDocument(input: CreateDocumentInput): Promise<string> {
  const db = getDb();
  const ts = nowIso();
  const rows = await db
    .insert(documents)
    .values({
      userId: input.userId,
      title: input.title ?? null,
      originalFilename: input.originalFilename,
      fileType: input.fileType,
      fileSizeBytes: input.fileSizeBytes,
      pageCount: input.pageCount ?? null,
      extractedTextLength: input.extractedTextLength ?? null,
      processingStatus: "uploaded",
      processingError: null,
      metadata: input.metadata ?? {},
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: documents.id });
  const row = rows[0];
  if (!row) throw new Error("documents insert failed");
  return row.id;
}

export async function getDocumentForUser(
  documentId: string,
  userId: string,
): Promise<DocumentRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  return rows[0] ?? null;
}

const ACTIVE_DOCUMENT_PROCESSING_STATUSES: DocumentProcessingStatus[] = [
  "uploaded",
  "text_extracted",
  "chunked",
  "concepts_extracted",
];

// 같은 파일을 연속으로 업로드하면 worker가 동일 PDF를 여러 번 처리하며 LLM 토큰을 중복 소모할 수 있다.
// 이 조회는 나중에 들어온 문서가 이미 진행 중인 동일 문서를 다시 enqueue하지 않도록 막는 용도다.
export async function findOlderActiveDuplicateDocumentForProcessing(
  document: DocumentRow,
): Promise<DocumentRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, document.userId),
        eq(documents.originalFilename, document.originalFilename),
        eq(documents.fileType, document.fileType),
        eq(documents.fileSizeBytes, document.fileSizeBytes),
        inArray(documents.processingStatus, ACTIVE_DOCUMENT_PROCESSING_STATUSES),
        lt(documents.createdAt, document.createdAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDocumentStatus(
  documentId: string,
  processingStatus: DocumentProcessingStatus,
  processingError?: string | null,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(documents)
    .set({
      processingStatus,
      processingError: processingError ?? null,
      updatedAt: nowIso(),
    })
    .where(eq(documents.id, documentId))
    .returning({ id: documents.id });
  return rows.length > 0;
}

export async function updateDocumentExtractedInfo(
  documentId: string,
  pageCount: number,
  extractedTextLength: number,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(documents)
    .set({
      pageCount,
      extractedTextLength,
      updatedAt: nowIso(),
    })
    .where(eq(documents.id, documentId))
    .returning({ id: documents.id });
  return rows.length > 0;
}

export async function updateDocumentMetadata(
  documentId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(documents)
    .set({
      metadata,
      updatedAt: nowIso(),
    })
    .where(eq(documents.id, documentId))
    .returning({ id: documents.id });
  return rows.length > 0;
}

export async function getDocumentById(documentId: string): Promise<DocumentRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));
  return rows[0] ?? null;
}

export async function bulkInsertDocumentPages(
  documentId: string,
  pages: DocumentPageInput[],
): Promise<DocumentPageRow[]> {
  if (pages.length === 0) return [];
  const db = getDb();
  const ts = nowIso();
  return await db
    .insert(documentPages)
    .values(
      pages.map((page) => ({
        documentId,
        pageNumber: page.pageNumber,
        text: page.text ?? null,
        createdAt: ts,
      })),
    )
    .onConflictDoUpdate({
      target: [documentPages.documentId, documentPages.pageNumber],
      set: { text: sql`excluded.text` },
    })
    .returning();
}

export async function bulkInsertDocumentChunks(
  documentId: string,
  chunks: DocumentChunkInput[],
): Promise<DocumentChunkRow[]> {
  if (chunks.length === 0) return [];
  const db = getDb();
  const ts = nowIso();
  return await db
    .insert(documentChunks)
    .values(
      chunks.map((chunk) => ({
        documentId,
        chunkIndex: chunk.chunkIndex,
        pageStart: chunk.pageStart ?? null,
        pageEnd: chunk.pageEnd ?? null,
        sectionTitle: chunk.sectionTitle ?? null,
        text: chunk.text,
        tokenCount: chunk.tokenCount ?? null,
        metadata: chunk.metadata ?? {},
        createdAt: ts,
      })),
    )
    .onConflictDoUpdate({
      target: [documentChunks.documentId, documentChunks.chunkIndex],
      set: {
        pageStart: sql`excluded.page_start`,
        pageEnd: sql`excluded.page_end`,
        sectionTitle: sql`excluded.section_title`,
        text: sql`excluded.text`,
        tokenCount: sql`excluded.token_count`,
        metadata: sql`excluded.metadata`,
      },
    })
    .returning();
}

export async function bulkInsertDocumentConcepts(
  documentId: string,
  conceptsInput: DocumentConceptInput[],
): Promise<DocumentConceptRow[]> {
  if (conceptsInput.length === 0) return [];
  const db = getDb();
  const ts = nowIso();
  return await db
    .insert(documentConcepts)
    .values(
      conceptsInput.map((concept) => ({
        documentId,
        conceptId: concept.conceptId ?? null,
        conceptTitle: concept.conceptTitle,
        conceptType: concept.conceptType,
        importance: concept.importance ?? null,
        difficulty: concept.difficulty ?? null,
        sourceType: concept.sourceType,
        evidence: concept.evidence ?? [],
        createdAt: ts,
        updatedAt: ts,
      })),
    )
    .onConflictDoUpdate({
      target: [
        documentConcepts.documentId,
        documentConcepts.conceptId,
        documentConcepts.conceptType,
      ],
      set: {
        conceptTitle: sql`excluded.concept_title`,
        importance: sql`excluded.importance`,
        difficulty: sql`excluded.difficulty`,
        sourceType: sql`excluded.source_type`,
        evidence: sql`excluded.evidence`,
        updatedAt: ts,
      },
    })
    .returning();
}

/**
 * 문서의 모든 청크를 chunkIndex 순서로 조회한다.
 */
export async function getDocumentChunks(
  documentId: string,
): Promise<DocumentChunkRow[]> {
  const db = getDb();
  return await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);
}

export async function updateDocumentChunkMetadata(
  documentId: string,
  chunkId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(documentChunks)
    .set({ metadata })
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.id, chunkId)))
    .returning({ id: documentChunks.id });
  return rows.length > 0;
}

export async function getDocumentConceptRows(
  documentId: string,
): Promise<DocumentConceptRow[]> {
  const db = getDb();
  return await db
    .select()
    .from(documentConcepts)
    .where(eq(documentConcepts.documentId, documentId))
    .orderBy(documentConcepts.conceptTitle);
}

export async function createDocumentLearningTreeLink(
  documentId: string,
  treeId: string,
): Promise<string> {
  const db = getDb();
  const rows = await db
    .insert(documentLearningTrees)
    .values({
      documentId,
      treeId,
      createdAt: nowIso(),
    })
    .onConflictDoNothing()
    .returning({ id: documentLearningTrees.id });
  const inserted = rows[0];
  if (inserted) return inserted.id;

  const existing = (await db
    .select({ id: documentLearningTrees.id })
    .from(documentLearningTrees)
    .where(
      and(
        eq(documentLearningTrees.documentId, documentId),
        eq(documentLearningTrees.treeId, treeId),
      ),
    ))[0];
  if (!existing) throw new Error("document_learning_trees insert failed");
  return existing.id;
}

const DOCUMENT_CONCEPT_TYPE_ORDER: Record<DocumentConceptType, number> = {
  document_topic: 0,
  document_core: 1,
  prerequisite: 2,
  method: 3,
  background: 4,
  misconception: 5,
  evaluation: 6,
};

function evidenceCount(evidence: unknown): number {
  return Array.isArray(evidence) ? evidence.length : 0;
}

function normalizeConceptTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function toDocumentTreeNodeContext(
  document: DocumentRow,
  row: DocumentConceptRow,
): DocumentTreeNodeContext {
  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  return {
    document_id: document.id,
    document_title: document.title || document.originalFilename,
    document_concept_id: row.id,
    concept_id: row.conceptId,
    concept_title: row.conceptTitle,
    concept_type: row.conceptType as DocumentConceptType,
    source_type: row.sourceType as DocumentSourceType,
    evidence_count: evidence.length,
    evidence: evidence.map((item) => ({
      page_start: item.pageStart,
      page_end: item.pageEnd,
      section_title: item.sectionTitle,
      snippet: item.snippet,
    })),
  };
}

/**
 * 트리 id가 문서 기반 트리인지 확인하고, 맞다면 노드 UI에 붙일 문서 출처 맵을 만든다.
 * 노드에 concept_id가 없는 과거 데이터도 제목으로 fallback 매칭할 수 있게 두 맵을 함께 둔다.
 */
export async function getDocumentTreeContextForUser(
  treeId: string,
  userId: string,
): Promise<DocumentTreeContext | null> {
  const db = getDb();
  const document = (await db
    .select({
      id: documents.id,
      userId: documents.userId,
      title: documents.title,
      originalFilename: documents.originalFilename,
      fileType: documents.fileType,
      fileSizeBytes: documents.fileSizeBytes,
      pageCount: documents.pageCount,
      extractedTextLength: documents.extractedTextLength,
      processingStatus: documents.processingStatus,
      processingError: documents.processingError,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documentLearningTrees)
    .innerJoin(documents, eq(documents.id, documentLearningTrees.documentId))
    .where(
      and(
        eq(documentLearningTrees.treeId, treeId),
        eq(documents.userId, userId),
      ),
    )
    .orderBy(desc(documentLearningTrees.createdAt)))[0];
  if (!document) return null;

  const conceptRows = await db
    .select()
    .from(documentConcepts)
    .where(eq(documentConcepts.documentId, document.id));

  const byConceptId = new Map<string, DocumentTreeNodeContext>();
  const byTitle = new Map<string, DocumentTreeNodeContext>();
  for (const row of conceptRows) {
    const ctx = toDocumentTreeNodeContext(document, row);
    if (ctx.concept_id) byConceptId.set(ctx.concept_id, ctx);
    byTitle.set(normalizeConceptTitle(ctx.concept_title), ctx);
  }

  return {
    document_id: document.id,
    document_title: document.title || document.originalFilename,
    by_concept_id: byConceptId,
    by_normalized_title: byTitle,
  };
}

export function findDocumentContextForNode(
  context: DocumentTreeContext | null,
  nodeTitle: string,
  conceptId: string | null,
): DocumentTreeNodeContext | null {
  if (!context) return null;
  if (conceptId) {
    const byConcept = context.by_concept_id.get(conceptId);
    if (byConcept) return byConcept;
  }
  return context.by_normalized_title.get(normalizeConceptTitle(nodeTitle)) ?? null;
}

/**
 * 문서 분석 결과 화면의 개념 목록용 DTO를 만든다.
 * 먼저 document ownership을 확인하므로 다른 사용자의 document_id는 빈 목록처럼 처리된다.
 */
export async function listDocumentConceptsForUser(
  documentId: string,
  userId: string,
): Promise<DocumentConceptSummary[]> {
  const document = await getDocumentForUser(documentId, userId);
  if (!document) return [];

  const db = getDb();
  const rows = await db
    .select()
    .from(documentConcepts)
    .where(eq(documentConcepts.documentId, documentId));

  return rows
    .map((row) => ({
      document_concept_id: row.id,
      concept_id: row.conceptId,
      concept_title: row.conceptTitle,
      concept_type: row.conceptType as DocumentConceptType,
      importance: row.importance,
      difficulty: row.difficulty,
      source_type: row.sourceType as DocumentSourceType,
      evidence_count: evidenceCount(row.evidence),
    }))
    .sort((a, b) => {
      const typeDiff =
        DOCUMENT_CONCEPT_TYPE_ORDER[a.concept_type] -
        DOCUMENT_CONCEPT_TYPE_ORDER[b.concept_type];
      if (typeDiff !== 0) return typeDiff;

      const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
      if (importanceDiff !== 0) return importanceDiff;

      const difficultyDiff = (a.difficulty ?? 99) - (b.difficulty ?? 99);
      if (difficultyDiff !== 0) return difficultyDiff;

      return a.concept_title.localeCompare(b.concept_title);
    });
}

/**
 * document_learning_trees에 연결된 최신 트리를 사용자 소유권까지 확인해 반환한다.
 * 문서 소유권과 tree.user_id를 모두 확인해 임의 tree_id 우회 조회를 막는다.
 */
export async function getDocumentLearningTreeForUser(
  documentId: string,
  userId: string,
): Promise<LearningTreeBundle | null> {
  const document = await getDocumentForUser(documentId, userId);
  if (!document) return null;

  const db = getDb();
  const link = (await db
    .select({ treeId: documentLearningTrees.treeId })
    .from(documentLearningTrees)
    .where(eq(documentLearningTrees.documentId, documentId))
    .orderBy(desc(documentLearningTrees.createdAt)))[0];
  if (!link) return null;

  return getLearningTree(link.treeId, userId);
}

/**
 * Phase 3 Task 11: 특정 문서의 청크 텍스트를 반환한다.
 * 노드 상세 지연 생성 시 LLM 컨텍스트로 사용된다.
 */
export async function getChunkTextsForConcept(
  documentId: string,
  _conceptTitle: string,
  limit = 3,
): Promise<Array<{ chunk_id: string; content: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      content: documentChunks.text,
    })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .limit(limit);

  return rows.map((r) => ({ chunk_id: r.chunkId, content: r.content }));
}

/**
 * evidence 조회는 document_concepts.id에서 시작하지만, 반드시 연결된 document의 user_id를 함께 확인한다.
 */
export async function getDocumentConceptEvidenceForUser(
  documentConceptId: string,
  userId: string,
): Promise<DocumentConceptEvidenceResponse | null> {
  const db = getDb();
  const row = (await db
    .select({
      id: documentConcepts.id,
      conceptTitle: documentConcepts.conceptTitle,
      evidence: documentConcepts.evidence,
    })
    .from(documentConcepts)
    .innerJoin(documents, eq(documents.id, documentConcepts.documentId))
    .where(
      and(
        eq(documentConcepts.id, documentConceptId),
        eq(documents.userId, userId),
      ),
    ))[0];
  if (!row) return null;

  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  return {
    document_concept_id: row.id,
    concept_title: row.conceptTitle,
    evidence: evidence.map((item) => ({
      page_start: item.pageStart,
      page_end: item.pageEnd,
      section_title: item.sectionTitle,
      snippet: item.snippet,
    })),
  };
}
