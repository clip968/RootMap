/**
 * Phase 3 전체 문서 파이프라인 스모크(OpenRouter 호출 포함)
 * 실행: npm run document:pipeline-smoke (apps/web)
 *
 * standalone tsx 스크립트는 Next.js 런타임이 아니므로 `.env.local`을 직접 로드한다.
 * 이 스모크는 API key/model이 준비된 환경에서만 실행하는 LLM E2E 검증이다.
 */
import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { processDocument } from "../src/lib/document/processor";
import {
  createDocument,
  getDocumentForUser,
  getDocumentLearningTreeForUser,
  listDocumentConceptsForUser,
} from "../src/lib/repository/document-repository";

loadEnvConfig(process.cwd());
process.env.OPENROUTER_TIMEOUT_MS ??= "90000";
process.env.OPENROUTER_MAX_ATTEMPTS ??= "1";
process.env.DOCUMENT_CHUNK_CONCURRENCY ??= "3";

const dbRel = path.join("data", "document-pipeline-smoke.db");
const dbAbs = path.join(process.cwd(), dbRel);
const logAbs = path.join(process.cwd(), "data", "document-pipeline-smoke.log");
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
fs.writeFileSync(logAbs, "");
resetDbSingleton();

function logStage(stage: string, details: Record<string, unknown> = {}): void {
  const payload = {
    stage,
    ...details,
  };
  console.info("[document-pipeline-smoke]", payload);
  fs.appendFileSync(logAbs, `${new Date().toISOString()} ${JSON.stringify(payload)}\n`);
}

logStage("migrate_start");
const db = getDb();
migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
logStage("migrate_complete");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireOpenRouterEnv(): void {
  // 키가 비어 있으면 LLM 호출 실패가 늦게 드러나므로 실행 초기에 명확히 중단한다.
  assert(
    process.env.OPENROUTER_API_KEY,
    "OPENROUTER_API_KEY is required for document:pipeline-smoke",
  );
  assert(
    process.env.OPENROUTER_MODEL,
    "OPENROUTER_MODEL is required for document:pipeline-smoke",
  );
}

function makeStorageKey(userId: string, filename: string): string {
  return path.join("uploads", "documents", userId, filename);
}

function storageAbsPath(key: string): string {
  return path.join(process.cwd(), "data", key);
}

function setupPipelineDocument(): string {
  const filename = `${crypto.randomUUID()}.md`;
  const key = makeStorageKey(DEFAULT_USER_ID, filename);
  const absPath = storageAbsPath(key);
  const content = Buffer.from(
    [
      "# Transformer Attention Study Note",
      "",
      "Transformer models process token sequences without recurrent neural networks.",
      "The document explains why self-attention needs vector representations, matrix multiplication, dot products, and softmax normalization.",
      "",
      "## Scaled Dot-Product Attention",
      "",
      "Scaled dot-product attention compares query and key vectors with a dot product.",
      "The score is divided by the square root of the key dimension before softmax is applied.",
      "The resulting attention weights are used to combine value vectors.",
      "",
      "## Multi-Head Attention",
      "",
      "Multi-head attention runs several attention heads in parallel.",
      "Each head can focus on different token relationships, then the outputs are concatenated and projected.",
      "The output projection combines information from all heads into a representation used by later layers.",
      "",
      "## Positional Encoding",
      "",
      "Because self-attention does not inherently know token order, positional encoding injects sequence position information.",
      "A learner should understand sequence modeling before studying positional encodings.",
      "Sinusoidal positional encoding uses sine and cosine functions so nearby and distant positions can be compared.",
      "",
      "## Encoder and Decoder Blocks",
      "",
      "The encoder stacks self-attention with feed-forward networks and residual connections.",
      "The decoder adds masked self-attention and encoder-decoder attention for autoregressive generation.",
      "Layer normalization stabilizes the signal as it passes through the stacked blocks.",
      "",
      "## Feed-Forward Network",
      "",
      "Each Transformer block includes a position-wise feed-forward network after attention.",
      "The feed-forward network transforms each token representation independently using learned linear layers and nonlinear activation.",
      "",
      "## Common Misconception",
      "",
      "A common misconception is that attention is just a fixed lookup table.",
      "In reality, attention weights are computed from the current query and key vectors for each input.",
    ].join("\n"),
    "utf-8",
  );
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);

  return createDocument({
    userId: DEFAULT_USER_ID,
    title: "Transformer Attention Study Note",
    originalFilename: "transformer-attention.md",
    fileType: "md",
    fileSizeBytes: content.length,
    metadata: { storage: { key, filename, contentType: "text/markdown" } },
  });
}

async function main(): Promise<void> {
  try {
    logStage("env_check_start");
    requireOpenRouterEnv();
    logStage("env_check_complete", {
      model: process.env.OPENROUTER_MODEL,
      timeoutMs: process.env.OPENROUTER_TIMEOUT_MS ?? "60000",
      maxAttempts: process.env.OPENROUTER_MAX_ATTEMPTS ?? "3",
      chunkConcurrency: process.env.DOCUMENT_CHUNK_CONCURRENCY ?? "3",
    });

    logStage("setup_document_start");
    const documentId = setupPipelineDocument();
    logStage("setup_document_complete", { documentId });

    logStage("process_document_start", { documentId });
    const result = await processDocument(documentId, DEFAULT_USER_ID);
    logStage("process_document_complete", { documentId, treeId: result.treeId });

    logStage("assert_document_status_start", { documentId });
    const document = getDocumentForUser(documentId, DEFAULT_USER_ID);
    assert(document, "pipeline document not found after processing");
    assert(
      document.processingStatus === "tree_generated",
      `expected tree_generated, got ${document.processingStatus}`,
    );
    assert(result.treeId, "processDocument should return treeId");
    logStage("assert_document_status_complete", {
      documentId,
      processingStatus: document.processingStatus,
    });

    logStage("assert_concepts_start", { documentId });
    const concepts = listDocumentConceptsForUser(documentId, DEFAULT_USER_ID);
    assert(concepts.length > 0, `expected at least 1 document concept, got ${concepts.length}`);
    logStage("assert_concepts_complete", {
      documentId,
      conceptCount: concepts.length,
    });

    logStage("assert_tree_start", { documentId });
    const bundle = getDocumentLearningTreeForUser(documentId, DEFAULT_USER_ID);
    assert(bundle, "document learning tree link should load a tree bundle");
    assert(bundle.nodes.length > 0, "expected at least 1 tree node");
    logStage("assert_tree_complete", {
      documentId,
      treeId: bundle.tree.id,
      nodeCount: bundle.nodes.length,
    });

    console.log("document:pipeline-smoke OK");
  } catch (err) {
    logStage("failed", {
      errorName: err instanceof Error ? err.name : "UnknownError",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  } finally {
    logStage("cleanup_start");
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
    logStage("cleanup_complete");
  }
}

void main();
