/**
 * Phase 3 Task 11: 문서 트리 노드 상세 지연 생성 스모크 (OpenRouter 호출 포함)
 * 실행: npm run document:detail-smoke (apps/web)
 *
 * fixture 기반: DB에 직접 document + chunk + concept + tree node를 생성한 후
 * generateNodeDetail을 호출하고 결과를 검증한다.
 * (전체 파이프라인 의존성 없음 → 빠르고 deterministic)
 */
import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { generateNodeDetail } from "../src/lib/llm/generate-document-detail";
import type { GenerateNodeDetailOptions } from "../src/lib/llm/generate-document-detail";
// Fix: drizzle insert
import * as schema from "../src/db/schema";

loadEnvConfig(process.cwd());
process.env.OPENROUTER_TIMEOUT_MS ??= "90000";
process.env.OPENROUTER_MAX_ATTEMPTS ??= "1";

const dbRel = path.join("data", "document-detail-smoke.db");
const dbAbs = path.join(process.cwd(), dbRel);
process.env.DATABASE_URL = `file:${dbAbs}`;

resetDbSingleton();
fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
try { fs.rmSync(dbAbs, { force: true }); } catch { /* noop */ }
resetDbSingleton();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireOpenRouterEnv(): void {
  assert(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is required");
  assert(process.env.OPENROUTER_MODEL, "OPENROUTER_MODEL is required");
}

async function main(): Promise<void> {
  try {
    requireOpenRouterEnv();

    const db = getDb();
    migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

    // 1. fixture 문서 생성 (drizzle insert 사용)
    const documentId = crypto.randomUUID();
    const chunkId = crypto.randomUUID();
    const conceptId = crypto.randomUUID();
    const treeId = crypto.randomUUID();
    const nodeId = crypto.randomUUID();
    const docConceptId = crypto.randomUUID();

    // 문서 + 청크 + 개념 + 트리 + 노드 + 연결 (drizzle insert)
    const chunkContent = [
      "## Scaled Dot-Product Attention",
      "",
      "Scaled dot-product attention compares query and key vectors with a dot product.",
      "The score is divided by the square root of the key dimension before softmax is applied.",
      "The resulting attention weights are used to combine value vectors.",
      "",
      "Multi-head attention runs several attention heads in parallel.",
      "Each head can focus on different token relationships, then the outputs are concatenated and projected.",
      "",
      "## Positional Encoding",
      "",
      "Because self-attention does not inherently know token order, positional encoding injects sequence position information.",
    ].join("\n");

    await db.insert(schema.documents).values({
      id: documentId,
      userId: DEFAULT_USER_ID,
      title: "Transformer Attention Study Note",
      originalFilename: "test.md",
      fileType: "md",
      fileSizeBytes: 1000,
      processingStatus: "tree_generated",
      metadata: {},
    });

    await db.insert(schema.documentChunks).values({
      id: chunkId,
      documentId,
      chunkIndex: 0,
      text: chunkContent,
      tokenCount: 500,
      metadata: {},
    });

    await db.insert(schema.concepts).values({
      id: conceptId,
      slug: "scaled-dot-product-attention",
      title: "Scaled Dot-Product Attention",
      normalizedTitle: "scaled dot-product attention",
      aliases: [],
      domain: "NLP",
      shortDescription: "Attention mechanism used in Transformers",
      difficulty: 3,
      metadata: {},
    });

    await db.insert(schema.documentConcepts).values({
      id: docConceptId,
      documentId,
      conceptId,
      conceptTitle: "Scaled Dot-Product Attention",
      conceptType: "document_core",
      sourceType: "explicit",
      evidence: [],
    });

    await db.insert(schema.learningTrees).values({
      id: treeId,
      userId: DEFAULT_USER_ID,
      topic: "Transformer Attention",
      treeJson: { id: treeId, user_id: DEFAULT_USER_ID, topic: "Transformer Attention", summary: "", nodes: [], edges: [] } as any,
    });

    await db.insert(schema.learningNodes).values({
      id: nodeId,
      treeId,
      nodeKey: "scaled_attention",
      title: "Scaled Dot-Product Attention",
      type: "core",
      description: "",
      difficulty: 3,
      prerequisites: [],
      children: [],
    });

    await db.insert(schema.documentLearningTrees).values({
      documentId,
      treeId,
    });

    console.info("[detail-smoke] Fixture created: document=%s, tree=%s, node=%s", documentId, treeId, nodeId);

    // 2. chunkTexts 조회
    const chunkTexts = [{ chunk_id: chunkId, content: chunkContent }];
    const consolidatedConceptsJson = JSON.stringify([
      { concept_title: "Scaled Dot-Product Attention", concept_type: "document_core", importance: 5 },
      { concept_title: "Multi-Head Attention", concept_type: "document_core", importance: 4 },
      { concept_title: "Positional Encoding", concept_type: "document_core", importance: 4 },
      { concept_title: "Softmax", concept_type: "prerequisite", importance: 3 },
      { concept_title: "Matrix Multiplication", concept_type: "prerequisite", importance: 3 },
    ]);

    // 3. generate-detail 호출
    const detailOptions: GenerateNodeDetailOptions = {
      documentTitle: "Transformer Attention Study Note",
      documentSummary: "Explains self-attention, multi-head attention, positional encoding in Transformer models",
      nodeId: "scaled_attention", // node_key — LLM이 생성할 node_id와 일치
      nodeTitle: "Scaled Dot-Product Attention",
      nodeType: "core",
      sourceType: "explicit",
      consolidatedConceptsJson,
      chunkTexts,
      requestId: `detail-smoke-${crypto.randomUUID().slice(0, 8)}`,
    };

    const detailStart = Date.now();
    const detailResult = await generateNodeDetail(detailOptions);
    const detailDuration = Date.now() - detailStart;

    // 4. 검증
    assert(detailResult.document_context_summary, "document_context_summary should exist");
    assert(detailResult.document_context_summary.length > 20, `summary too short: ${detailResult.document_context_summary.length} chars`);
    assert(detailResult.why_it_matters_for_document, "why_it_matters_for_document should exist");
    assert(detailResult.node_id === "scaled_attention", `node_id mismatch: ${detailResult.node_id} !== scaled_attention`);

    // 5. 리포트
    const DETAIL_TARGET_MS = 15_000;

    console.info("");
    console.info("─── document:detail-smoke report ───");
    const detailOk = detailDuration <= DETAIL_TARGET_MS;
    console.info(`  ${detailOk ? "✓" : "⚠"} 상세 생성: ${detailDuration}ms (기준 ${DETAIL_TARGET_MS}ms${detailOk ? " 이내" : " 초과"})`);
    console.info(`  ✓ document_context_summary: ${detailResult.document_context_summary.length} chars`);
    console.info(`  ✓ why_it_matters_for_document: ${detailResult.why_it_matters_for_document.length} chars`);
    console.info(`  ✓ easy_explanation: ${detailResult.easy_explanation.length} chars`);
    console.info(`  ✓ check_questions: ${detailResult.check_questions.length}개`);
    console.info(`  ✓ common_misconceptions: ${detailResult.common_misconceptions.length}개`);
    console.info("─── document:detail-smoke OK ───");
    console.info("");
  } catch (err) {
    console.error("[detail-smoke] FAILED:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    resetDbSingleton();
    try { fs.rmSync(dbAbs, { force: true }); } catch { /* noop */ }
  }
}

void main();
