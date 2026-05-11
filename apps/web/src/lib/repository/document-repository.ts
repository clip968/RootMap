import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
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

export function createDocument(input: CreateDocumentInput): string {
  const db = getDb();
  const ts = nowIso();
  const rows = db
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
    .returning({ id: documents.id })
    .all();
  const row = rows[0];
  if (!row) throw new Error("documents insert failed");
  return row.id;
}

export function getDocumentForUser(
  documentId: string,
  userId: string,
): DocumentRow | null {
  const db = getDb();
  const rows = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .all();
  return rows[0] ?? null;
}

export function updateDocumentStatus(
  documentId: string,
  processingStatus: DocumentProcessingStatus,
  processingError?: string | null,
): boolean {
  const db = getDb();
  const result = db
    .update(documents)
    .set({
      processingStatus,
      processingError: processingError ?? null,
      updatedAt: nowIso(),
    })
    .where(eq(documents.id, documentId))
    .run();
  return result.changes > 0;
}

export function bulkInsertDocumentPages(
  documentId: string,
  pages: DocumentPageInput[],
): DocumentPageRow[] {
  if (pages.length === 0) return [];
  const db = getDb();
  const ts = nowIso();
  return db
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
    .returning()
    .all();
}

export function bulkInsertDocumentChunks(
  documentId: string,
  chunks: DocumentChunkInput[],
): DocumentChunkRow[] {
  if (chunks.length === 0) return [];
  const db = getDb();
  const ts = nowIso();
  return db
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
    .returning()
    .all();
}

export function bulkInsertDocumentConcepts(
  documentId: string,
  conceptsInput: DocumentConceptInput[],
): DocumentConceptRow[] {
  if (conceptsInput.length === 0) return [];
  const db = getDb();
  const ts = nowIso();
  return db
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
    .returning()
    .all();
}

export function createDocumentLearningTreeLink(
  documentId: string,
  treeId: string,
): string {
  const db = getDb();
  const rows = db
    .insert(documentLearningTrees)
    .values({
      documentId,
      treeId,
      createdAt: nowIso(),
    })
    .onConflictDoNothing()
    .returning({ id: documentLearningTrees.id })
    .all();
  const inserted = rows[0];
  if (inserted) return inserted.id;

  const existing = db
    .select({ id: documentLearningTrees.id })
    .from(documentLearningTrees)
    .where(
      and(
        eq(documentLearningTrees.documentId, documentId),
        eq(documentLearningTrees.treeId, treeId),
      ),
    )
    .all()[0];
  if (!existing) throw new Error("document_learning_trees insert failed");
  return existing.id;
}
