/**
 * Phase 09 로컬 문서 처리 runner 스모크.
 *
 * 실제 Supabase DB나 LLM provider를 호출하지 않고, CLI parsing과 dry-run/tree-only
 * 실행 계약을 순수 helper와 주입 dependency로 검증한다.
 */
import {
  formatLocalRunnerErrorLog,
  parseEnvFileContent,
  parseLocalRunnerArgs,
  runLocalDocumentProcessing,
  validateRequiredLocalWorkerEnv,
} from "../src/lib/document/local-runner";
import {
  summarizeLocalDocumentProcessing,
  type LocalProcessingSummary,
} from "../src/lib/document/local-processing-summary";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const parsedEnv = parseEnvFileContent([
    "DATABASE_URL='postgres://user:pass@localhost:5432/rootmap'",
    'SUPABASE_URL="https://rootmap.supabase.co"',
    "SUPABASE_SERVICE_ROLE_KEY=service-role",
    "SUPABASE_DOCUMENT_BUCKET=rootmap-documents",
    "LLM_SETTINGS_SECRET=llm-secret",
  ].join("\n"));
  assert(parsedEnv.DATABASE_URL === "postgres://user:pass@localhost:5432/rootmap", "single quotes should be removed");
  assert(parsedEnv.SUPABASE_URL === "https://rootmap.supabase.co", "double quotes should be removed");
  assert(validateRequiredLocalWorkerEnv(parsedEnv).length === 0, "complete local worker env should pass");
  assert(
    validateRequiredLocalWorkerEnv({ DATABASE_URL: "postgres://db" }).includes("SUPABASE_URL"),
    "missing env keys should be reported before DB access",
  );

  const cli = parseLocalRunnerArgs([
    "--document-id",
    "00000000-0000-0000-0000-000000000123",
    "--dry-run",
    "--chunk-batch-size",
    "3",
  ]);
  assert(cli.documentId === "00000000-0000-0000-0000-000000000123", "document id should parse");
  assert(cli.dryRun === true, "dry-run flag should parse");
  assert(cli.chunkBatchSize === 3, "chunk batch size should parse as positive integer");

  let invalidBatchFailed = false;
  try {
    parseLocalRunnerArgs(["--document-id", "doc-1", "--chunk-batch-size", "0"]);
  } catch {
    invalidBatchFailed = true;
  }
  assert(invalidBatchFailed, "non-positive chunk batch size should fail");

  const chunkedSummary = summarizeLocalDocumentProcessing({
    document: {
      id: "doc-chunked",
      originalFilename: "paper.pdf",
      processingStatus: "chunked",
      pageCount: 7,
    },
    chunks: [
      { metadata: { document_concept_extraction: { status: "completed" } } },
      { metadata: {} },
      { metadata: { document_concept_extraction: { status: "skipped" } } },
    ],
    documentConceptCount: 0,
    treeId: null,
    activeDuplicateDocumentId: "doc-original",
  });
  assert(chunkedSummary.chunk_count === 3, "summary should include chunk count");
  assert(chunkedSummary.checkpointed_chunk_count === 2, "completed and skipped checkpoints should count");
  assert(chunkedSummary.pending_chunk_count === 1, "summary should include pending chunk count");
  assert(chunkedSummary.can_process === true, "active duplicate should warn but allow local processing");
  assert(
    chunkedSummary.recommended_next_action.includes("현재 문서도 처리할 수 있습니다"),
    "active duplicate should be shown as a warning, not a blocker",
  );

  let processCalls = 0;
  const dryRun = await runLocalDocumentProcessing(
    { ...cli, dryRun: true },
    {
      getSummary: async () => chunkedSummary,
      processDocument: async () => {
        processCalls += 1;
        return { treeId: null };
      },
    },
  );
  assert(dryRun.status === "dry_run", "dry-run should return dry_run status");
  assert(processCalls === 0, "dry-run must not call processDocument");

  const conceptsSummary: LocalProcessingSummary = {
    document_id: "doc-concepts",
    original_filename: "paper.pdf",
    processing_status_before: "concepts_extracted",
    page_count: 7,
    chunk_count: 3,
    checkpointed_chunk_count: 3,
    pending_chunk_count: 0,
    document_concept_count: 5,
    active_duplicate_document_id: null,
    tree_id: null,
    can_process: true,
    recommended_next_action: "tree-only 실행",
  };
  const treeOnly = await runLocalDocumentProcessing(
    {
      documentId: "doc-concepts",
      envFile: ".env.local-worker",
      dryRun: false,
      resume: false,
      treeOnly: true,
      stopAfterConcepts: false,
    },
    {
      getSummary: async () => conceptsSummary,
      processDocument: async (_documentId, _userId, options) => {
        processCalls += 1;
        assert(options?.treeOnly === true, "tree-only option should reach processDocument");
        return { treeId: "tree-1" };
      },
      getUserId: () => "user-1",
    },
  );
  assert(treeOnly.status === "processed", "tree-only run should process concepts_extracted document");
  assert(treeOnly.log.tree_id === "tree-1", "tree-only success log should include tree id");
  assert(treeOnly.log.llm_stage_executed === "tree_generation", "tree-only should only report tree generation");

  const alreadyGenerated = await runLocalDocumentProcessing(
    {
      documentId: "doc-tree",
      envFile: ".env.local-worker",
      dryRun: false,
      resume: false,
      treeOnly: false,
      stopAfterConcepts: false,
    },
    {
      getSummary: async () => ({
        ...conceptsSummary,
        document_id: "doc-tree",
        processing_status_before: "tree_generated",
        tree_id: "tree-existing",
        can_process: false,
        recommended_next_action: "이미 완료됨",
      }),
      processDocument: async () => {
        throw new Error("tree_generated document should not run processor");
      },
    },
  );
  assert(alreadyGenerated.status === "already_processed", "tree_generated document should be skipped");

  const errorLog = formatLocalRunnerErrorLog(new Error("boom"), conceptsSummary);
  assert(errorLog.error_code === "LOCAL_RUNNER_ERROR", "generic errors should be mapped");
  assert(errorLog.recommended_next_action.length > 0, "error log should include next action");

  console.info("[document-processing-local-smoke] ok");
}

main().catch((err) => {
  console.error("[document-processing-local-smoke] failed", err);
  process.exitCode = 1;
});
