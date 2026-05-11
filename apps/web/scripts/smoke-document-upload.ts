/**
 * Phase 3 문서 업로드 API 스모크.
 * 실행: npm run document:upload-smoke (apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { getDb, resetDbSingleton } from "../src/db/client";
import { getDocumentForUser } from "../src/lib/repository/document-repository";
import { POST } from "../src/app/api/documents/upload/route";

const dbRel = path.join("data", "document-upload-smoke.db");
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

async function upload(file: File): Promise<Response> {
  const form = new FormData();
  form.set("file", file);
  return POST(
    new Request("http://localhost/api/documents/upload", {
      method: "POST",
      body: form,
    }),
  );
}

async function main(): Promise<void> {
  const ok = await upload(
    new File(["# RootMap\n문서 기반 학습"], "unsafe/lecture.md", {
      type: "text/markdown",
    }),
  );
  if (ok.status !== 200) throw new Error(`upload status ${ok.status}`);
  const okBody = await ok.json();
  if (!okBody.document_id) throw new Error("missing document_id");
  if (okBody.filename !== "lecture.md") {
    throw new Error("filename not normalized");
  }
  if (okBody.processing_status !== "uploaded") {
    throw new Error("processing status");
  }
  const saved = getDocumentForUser(okBody.document_id, DEFAULT_USER_ID);
  if (!saved) throw new Error("document row missing");
  if (saved.originalFilename !== "lecture.md") {
    throw new Error("original filename not stored");
  }
  if (saved.fileType !== "md") throw new Error("file type");
  if (saved.fileSizeBytes <= 0) throw new Error("file size");
  const storage = saved.metadata.storage;
  if (
    !storage ||
    typeof storage !== "object" ||
    !("filename" in storage) ||
    (storage as { filename: unknown }).filename === "lecture.md"
  ) {
    throw new Error("unsafe storage filename");
  }

  const empty = await upload(
    new File([""], "empty.txt", { type: "text/plain" }),
  );
  if (empty.status !== 400) throw new Error("empty file should fail");

  const badExt = await upload(
    new File(["x"], "malware.exe", { type: "application/x-msdownload" }),
  );
  if (badExt.status !== 400) throw new Error("bad extension should fail");

  const tooLargeBytes = 20 * 1024 * 1024 + 1;
  const tooLarge = await upload(
    new File([new Uint8Array(tooLargeBytes)], "large.pdf", {
      type: "application/pdf",
    }),
  );
  if (tooLarge.status !== 413) throw new Error("large file should fail");

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

  console.log("document:upload-smoke OK");
}

void main();
