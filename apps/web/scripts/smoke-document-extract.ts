/**
 * Phase 3 Task 3: 텍스트 추출 및 청크 분할 스모크
 * 실행: npm run document:extract-smoke (apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { getDb, resetDbSingleton } from "../src/db/client";
import { documentChunks, documentPages } from "../src/db/schema";
import { createDocument, getDocumentForUser } from "../src/lib/repository/document-repository";
import { processDocument, DocumentProcessorError } from "../src/lib/document/processor";

const dbRel = path.join("data", "document-extract-smoke.db");
const dbAbs = path.join(process.cwd(), dbRel);
process.env.DATABASE_URL = `file:${dbAbs}`;

resetDbSingleton();
fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
try {
  fs.rmSync(dbAbs, { force: true });
  fs.rmSync(path.join(process.cwd(), "data", "uploads"), {
    force: true,
    recursive: true,
  });
} catch {
  /* noop */
}
resetDbSingleton();

const db = getDb();
migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

async function createTestPdf(filePath: string, pages: string[]): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  for (const pageText of pages) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(pageText, {
      x: 50,
      y: 700,
      size: 12,
      font,
      maxWidth: 500,
      lineHeight: 14,
    });
  }
  const pdfBytes = await pdfDoc.save();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pdfBytes);
}

function makeStorageKey(userId: string, filename: string): string {
  return path.join("uploads", "documents", userId, filename);
}

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

async function setupDocument(
  fileName: string,
  fileType: string,
  content: Buffer,
): Promise<string> {
  const filename = `${crypto.randomUUID()}.${fileType}`;
  const key = makeStorageKey(DEFAULT_USER_ID, filename);
  const absPath = storageAbsPath(key);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);

  const docId = createDocument({
    userId: DEFAULT_USER_ID,
    title: fileName.replace(/\.[^.]+$/, ""),
    originalFilename: fileName,
    fileType,
    fileSizeBytes: content.length,
    metadata: { storage: { key, filename, contentType: "application/octet-stream" } },
  });
  return docId;
}

async function main(): Promise<void> {
  // 1. TXT processing
  const txtContent = Buffer.from(
    Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1}. This is sample text for testing text extraction and chunking in RootMap Phase 3. 한글 텍스트도 포함합니다.`).join("\n\n"),
    "utf-8",
  );
  const txtDocId = await setupDocument("sample.txt", "txt", txtContent);
  await processDocument(txtDocId, DEFAULT_USER_ID);
  const txtDoc = getDocumentForUser(txtDocId, DEFAULT_USER_ID);
  if (!txtDoc) throw new Error("TXT doc not found after processing");
  if (txtDoc.processingStatus !== "chunked") throw new Error(`TXT expected chunked, got ${txtDoc.processingStatus}`);
  if (txtDoc.pageCount !== 1) throw new Error(`TXT expected pageCount 1, got ${txtDoc.pageCount}`);
  if (!txtDoc.extractedTextLength || txtDoc.extractedTextLength <= 0) throw new Error("TXT expected extractedTextLength > 0");

  // Verify chunks exist in DB
  const txtChunks = db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, txtDocId))
    .all();
  if (txtChunks.length === 0) throw new Error("TXT expected chunks > 0");
  for (const chunk of txtChunks) {
    if (!chunk.text || chunk.text.length === 0) throw new Error("TXT chunk text empty");
    if (chunk.tokenCount === null || chunk.tokenCount === undefined) throw new Error("TXT chunk tokenCount missing");
    if (chunk.tokenCount > 1500) throw new Error(`TXT chunk tokenCount ${chunk.tokenCount} exceeds max 1500`);
  }

  const txtPages = db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, txtDocId))
    .all();
  if (txtPages.length !== 1) throw new Error(`TXT expected 1 page, got ${txtPages.length}`);
  if (!txtPages[0].text || txtPages[0].text.length === 0) throw new Error("TXT page text empty");

  console.log("  TXT: OK");

  // 2. MD processing with headings
  const mdContent = Buffer.from(
    `# Introduction\nThis is the intro section with enough text to make a meaningful chunk.\n\n## Section A\nContent for section A. More text here to increase length. ${"A ".repeat(200)}\n\n## Section B\nContent for section B. More text here to increase length. ${"B ".repeat(200)}\n\n### Subsection B1\nDeeper content here. ${"C ".repeat(200)}\n`,
    "utf-8",
  );
  const mdDocId = await setupDocument("sample.md", "md", mdContent);
  await processDocument(mdDocId, DEFAULT_USER_ID);
  const mdDoc = getDocumentForUser(mdDocId, DEFAULT_USER_ID);
  if (!mdDoc) throw new Error("MD doc not found after processing");
  if (mdDoc.processingStatus !== "chunked") throw new Error(`MD expected chunked, got ${mdDoc.processingStatus}`);

  const mdChunks = db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, mdDocId))
    .all();
  if (mdChunks.length === 0) throw new Error("MD expected chunks > 0");
  const hasSectionTitle = mdChunks.some((c) => c.sectionTitle !== null && c.sectionTitle !== "");
  if (!hasSectionTitle) throw new Error("MD expected at least one chunk with sectionTitle from headings");

  console.log("  MD: OK");

  // 3. PDF processing (multi-page)
  const pdfPath = storageAbsPath(makeStorageKey(DEFAULT_USER_ID, "test.pdf"));
  await createTestPdf(pdfPath, [
    "Page one content. This is the first page of a test PDF document for RootMap.",
    "Page two content. This is the second page with different text to verify page separation.",
    "Page three content. Third page here to ensure multi-page extraction works correctly.",
  ]);
  const pdfKey = makeStorageKey(DEFAULT_USER_ID, "test.pdf");
  const pdfDocId = createDocument({
    userId: DEFAULT_USER_ID,
    title: "test",
    originalFilename: "test.pdf",
    fileType: "pdf",
    fileSizeBytes: fs.statSync(pdfPath).size,
    metadata: { storage: { key: pdfKey, filename: "test.pdf", contentType: "application/pdf" } },
  });
  await processDocument(pdfDocId, DEFAULT_USER_ID);
  const pdfDoc = getDocumentForUser(pdfDocId, DEFAULT_USER_ID);
  if (!pdfDoc) throw new Error("PDF doc not found after processing");
  if (pdfDoc.processingStatus !== "chunked") throw new Error(`PDF expected chunked, got ${pdfDoc.processingStatus}`);
  if (pdfDoc.pageCount !== 3) throw new Error(`PDF expected pageCount 3, got ${pdfDoc.pageCount}`);

  const pdfPages = db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, pdfDocId))
    .all();
  if (pdfPages.length !== 3) throw new Error(`PDF expected 3 pages, got ${pdfPages.length}`);
  for (let i = 0; i < pdfPages.length; i++) {
    if (!pdfPages[i]?.text || pdfPages[i]!.text!.length === 0) throw new Error(`PDF page ${i + 1} text empty`);
  }

  const pdfChunks = db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, pdfDocId))
    .all();
  if (pdfChunks.length === 0) throw new Error("PDF expected chunks > 0");

  console.log("  PDF: OK");

  // 4. Too long document
  const longContent = Buffer.from("A".repeat(120_001), "utf-8");
  const longDocId = await setupDocument("long.txt", "txt", longContent);
  let longError: unknown;
  try {
    await processDocument(longDocId, DEFAULT_USER_ID);
  } catch (e) {
    longError = e;
  }
  if (!(longError instanceof DocumentProcessorError)) throw new Error("Long doc expected DocumentProcessorError");
  if (longError.code !== "DOCUMENT_TOO_LONG") throw new Error(`Long doc expected DOCUMENT_TOO_LONG, got ${longError.code}`);
  const longDocAfter = getDocumentForUser(longDocId, DEFAULT_USER_ID);
  if (longDocAfter?.processingStatus !== "failed") throw new Error("Long doc expected failed status");

  console.log("  Too long rejection: OK");

  // 5. Empty/scanned-like PDF
  const emptyPdfPath = storageAbsPath(makeStorageKey(DEFAULT_USER_ID, "empty.pdf"));
  await createTestPdf(emptyPdfPath, ["   "]);
  const emptyKey = makeStorageKey(DEFAULT_USER_ID, "empty.pdf");
  const emptyDocId = createDocument({
    userId: DEFAULT_USER_ID,
    title: "empty",
    originalFilename: "empty.pdf",
    fileType: "pdf",
    fileSizeBytes: fs.statSync(emptyPdfPath).size,
    metadata: { storage: { key: emptyKey, filename: "empty.pdf", contentType: "application/pdf" } },
  });
  let emptyError: unknown;
  try {
    await processDocument(emptyDocId, DEFAULT_USER_ID);
  } catch (e) {
    emptyError = e;
  }
  if (!(emptyError instanceof DocumentProcessorError)) throw new Error("Empty doc expected DocumentProcessorError");
  if (emptyError.code !== "TEXT_EXTRACTION_FAILED") throw new Error(`Empty doc expected TEXT_EXTRACTION_FAILED, got ${(emptyError as DocumentProcessorError).code}`);
  const emptyDocAfter = getDocumentForUser(emptyDocId, DEFAULT_USER_ID);
  if (emptyDocAfter?.processingStatus !== "failed") throw new Error("Empty doc expected failed status");

  console.log("  Empty text rejection: OK");

  // Cleanup
  resetDbSingleton();
  try {
    fs.rmSync(dbAbs, { force: true });
    fs.rmSync(path.join(process.cwd(), "data", "uploads"), {
      force: true,
      recursive: true,
    });
  } catch {
    /* noop */
  }

  console.log("document:extract-smoke OK");
}

void main();
