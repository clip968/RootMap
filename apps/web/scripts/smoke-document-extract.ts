/**
 * Phase 3 Task 3: 텍스트 추출 및 청크 분할 스모크(API/LLM 호출 없음)
 * 실행: npm run document:extract-smoke (apps/web)
 *
 * 이 스모크는 문서 처리의 기초 단계만 검증한다.
 * 전체 LLM 파이프라인은 `smoke-document-pipeline.ts`에서 별도로 검증한다.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDb, resetDbSingleton } from "../src/db/client";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { documentChunks, documentPages } from "../src/db/schema";
import { chunkFromPdfPages, chunkUnits } from "../src/lib/document/chunker";
import { extractPdfPages } from "../src/lib/document/extract-pdf";
import { splitTextIntoUnits } from "../src/lib/document/extract-text";
import {
  bulkInsertDocumentChunks,
  bulkInsertDocumentPages,
  createDocument,
  getDocumentForUser,
  updateDocumentExtractedInfo,
  updateDocumentStatus,
} from "../src/lib/repository/document-repository";

const MAX_PAGES = 80;
const MAX_TEXT_LENGTH = 120_000;
const MIN_EXTRACTED_TEXT_LENGTH = 50;

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

type TestFileType = "pdf" | "txt" | "md";

class ExtractSmokeError extends Error {
  constructor(
    public readonly code: "DOCUMENT_TOO_LONG" | "TEXT_EXTRACTION_FAILED" | "CHUNKING_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ExtractSmokeError";
  }
}

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
  fileType: TestFileType,
  content: Buffer,
): Promise<string> {
  const filename = `${crypto.randomUUID()}.${fileType}`;
  const key = makeStorageKey(DEFAULT_USER_ID, filename);
  const absPath = storageAbsPath(key);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);

  return createDocument({
    userId: DEFAULT_USER_ID,
    title: fileName.replace(/\.[^.]+$/, ""),
    originalFilename: fileName,
    fileType,
    fileSizeBytes: content.length,
    metadata: { storage: { key, filename, contentType: "application/octet-stream" } },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getStorageKey(documentId: string): string {
  const document = getDocumentForUser(documentId, DEFAULT_USER_ID);
  assert(document, `document not found: ${documentId}`);
  const storage = document.metadata?.storage as { key?: string } | undefined;
  assert(storage?.key, `document storage key missing: ${documentId}`);
  return storage.key;
}

async function extractAndChunkDocument(documentId: string): Promise<void> {
  const document = getDocumentForUser(documentId, DEFAULT_USER_ID);
  assert(document, `document not found: ${documentId}`);

  const fileType = document.fileType as TestFileType;
  const fileBuffer = fs.readFileSync(storageAbsPath(getStorageKey(documentId)));
  const pages =
    fileType === "pdf" ?
      await extractPdfPages(fileBuffer)
    : [{ pageNumber: 1, text: fileBuffer.toString("utf-8") }];

  // Task 3의 실패 정책을 LLM 호출 없이 검증하기 위해 processor와 같은 한계를 적용한다.
  const totalText = pages.map((page) => page.text).join("\n\n");
  if (totalText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    updateDocumentStatus(documentId, "failed", "추출된 텍스트가 너무 적습니다.");
    throw new ExtractSmokeError(
      "TEXT_EXTRACTION_FAILED",
      "텍스트가 포함된 문서를 업로드해야 합니다.",
    );
  }
  if (pages.length > MAX_PAGES || totalText.length > MAX_TEXT_LENGTH) {
    updateDocumentStatus(documentId, "failed", "문서가 너무 깁니다.");
    throw new ExtractSmokeError(
      "DOCUMENT_TOO_LONG",
      "Phase 3 문서 길이 제한을 초과했습니다.",
    );
  }

  bulkInsertDocumentPages(
    documentId,
    pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
  );
  updateDocumentExtractedInfo(documentId, pages.length, totalText.length);
  updateDocumentStatus(documentId, "text_extracted");

  const chunks =
    fileType === "pdf" ?
      chunkFromPdfPages(pages)
    : chunkUnits(splitTextIntoUnits(totalText, fileType, 1));
  if (chunks.length === 0) {
    updateDocumentStatus(documentId, "failed", "청크 데이터가 없습니다.");
    throw new ExtractSmokeError("CHUNKING_FAILED", "문서를 청크로 분할하지 못했습니다.");
  }

  bulkInsertDocumentChunks(
    documentId,
    chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sectionTitle: chunk.sectionTitle,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      metadata: chunk.metadata,
    })),
  );
  updateDocumentStatus(documentId, "chunked");
}

async function main(): Promise<void> {
  const txtContent = Buffer.from(
    Array.from(
      { length: 50 },
      (_, i) =>
        `Paragraph ${i + 1}. This is sample text for testing text extraction and chunking in RootMap Phase 3. 한글 텍스트도 포함합니다.`,
    ).join("\n\n"),
    "utf-8",
  );
  const txtDocId = await setupDocument("sample.txt", "txt", txtContent);
  await extractAndChunkDocument(txtDocId);
  const txtDoc = getDocumentForUser(txtDocId, DEFAULT_USER_ID);
  assert(txtDoc, "TXT doc not found after processing");
  assert(txtDoc.processingStatus === "chunked", `TXT expected chunked, got ${txtDoc.processingStatus}`);
  assert(txtDoc.pageCount === 1, `TXT expected pageCount 1, got ${txtDoc.pageCount}`);
  assert((txtDoc.extractedTextLength ?? 0) > 0, "TXT expected extractedTextLength > 0");

  const txtChunks = db.select().from(documentChunks).where(eq(documentChunks.documentId, txtDocId)).all();
  assert(txtChunks.length > 0, "TXT expected chunks > 0");
  for (const chunk of txtChunks) {
    assert(chunk.text.length > 0, "TXT chunk text empty");
    assert(chunk.tokenCount != null, "TXT chunk tokenCount missing");
    assert(chunk.tokenCount <= 1500, `TXT chunk tokenCount ${chunk.tokenCount} exceeds max 1500`);
  }

  const txtPages = db.select().from(documentPages).where(eq(documentPages.documentId, txtDocId)).all();
  assert(txtPages.length === 1, `TXT expected 1 page, got ${txtPages.length}`);
  assert((txtPages[0]?.text?.length ?? 0) > 0, "TXT page text empty");
  console.log("  TXT: OK");

  const mdContent = Buffer.from(
    `# Introduction\nThis is the intro section with enough text to make a meaningful chunk.\n\n## Section A\nContent for section A. More text here to increase length. ${"A ".repeat(200)}\n\n## Section B\nContent for section B. More text here to increase length. ${"B ".repeat(200)}\n\n### Subsection B1\nDeeper content here. ${"C ".repeat(200)}\n`,
    "utf-8",
  );
  const mdDocId = await setupDocument("sample.md", "md", mdContent);
  await extractAndChunkDocument(mdDocId);
  const mdDoc = getDocumentForUser(mdDocId, DEFAULT_USER_ID);
  assert(mdDoc, "MD doc not found after processing");
  assert(mdDoc.processingStatus === "chunked", `MD expected chunked, got ${mdDoc.processingStatus}`);

  const mdChunks = db.select().from(documentChunks).where(eq(documentChunks.documentId, mdDocId)).all();
  assert(mdChunks.length > 0, "MD expected chunks > 0");
  assert(
    mdChunks.some((chunk) => chunk.sectionTitle != null && chunk.sectionTitle !== ""),
    "MD expected at least one chunk with sectionTitle from headings",
  );
  console.log("  MD: OK");

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
  await extractAndChunkDocument(pdfDocId);
  const pdfDoc = getDocumentForUser(pdfDocId, DEFAULT_USER_ID);
  assert(pdfDoc, "PDF doc not found after processing");
  assert(pdfDoc.processingStatus === "chunked", `PDF expected chunked, got ${pdfDoc.processingStatus}`);
  assert(pdfDoc.pageCount === 3, `PDF expected pageCount 3, got ${pdfDoc.pageCount}`);

  const pdfPages = db.select().from(documentPages).where(eq(documentPages.documentId, pdfDocId)).all();
  assert(pdfPages.length === 3, `PDF expected 3 pages, got ${pdfPages.length}`);
  for (let i = 0; i < pdfPages.length; i++) {
    assert((pdfPages[i]?.text?.length ?? 0) > 0, `PDF page ${i + 1} text empty`);
  }
  const pdfChunks = db.select().from(documentChunks).where(eq(documentChunks.documentId, pdfDocId)).all();
  assert(pdfChunks.length > 0, "PDF expected chunks > 0");
  console.log("  PDF: OK");

  const longContent = Buffer.from("A".repeat(120_001), "utf-8");
  const longDocId = await setupDocument("long.txt", "txt", longContent);
  let longError: unknown;
  try {
    await extractAndChunkDocument(longDocId);
  } catch (err) {
    longError = err;
  }
  assert(longError instanceof ExtractSmokeError, "Long doc expected ExtractSmokeError");
  assert(longError.code === "DOCUMENT_TOO_LONG", `Long doc expected DOCUMENT_TOO_LONG, got ${longError.code}`);
  assert(getDocumentForUser(longDocId, DEFAULT_USER_ID)?.processingStatus === "failed", "Long doc expected failed status");
  console.log("  Too long rejection: OK");

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
    await extractAndChunkDocument(emptyDocId);
  } catch (err) {
    emptyError = err;
  }
  assert(emptyError instanceof ExtractSmokeError, "Empty doc expected ExtractSmokeError");
  assert(
    emptyError.code === "TEXT_EXTRACTION_FAILED",
    `Empty doc expected TEXT_EXTRACTION_FAILED, got ${emptyError.code}`,
  );
  assert(getDocumentForUser(emptyDocId, DEFAULT_USER_ID)?.processingStatus === "failed", "Empty doc expected failed status");
  console.log("  Empty text rejection: OK");

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
