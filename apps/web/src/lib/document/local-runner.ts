import fs from "node:fs";
import path from "node:path";
import { DEFAULT_USER_ID } from "@/db/constants";
import {
  DocumentProcessorError,
  processDocument,
  type ProcessDocumentOptions,
  type ProcessDocumentResult,
} from "@/lib/document/processor";
import {
  getLocalProcessingSummary,
  type LocalProcessingSummary,
} from "@/lib/document/local-processing-summary";

export const DEFAULT_LOCAL_WORKER_ENV_FILE = ".env.local-worker";

export const REQUIRED_LOCAL_WORKER_ENV_KEYS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DOCUMENT_BUCKET",
  "LLM_SETTINGS_SECRET",
] as const;

export type LocalWorkerEnvKey = (typeof REQUIRED_LOCAL_WORKER_ENV_KEYS)[number];

export type LocalRunnerStatus =
  | "dry_run"
  | "already_processed"
  | "processed"
  | "requeued";

export type LocalRunnerLlmStage =
  | "none"
  | "chunk_concepts"
  | "document_consolidation"
  | "tree_generation"
  | "multiple";

export interface LocalRunnerOptions {
  documentId: string;
  envFile: string;
  dryRun: boolean;
  resume: boolean;
  treeOnly: boolean;
  chunkBatchSize?: number;
  stopAfterConcepts: boolean;
}

export interface LocalRunnerSuccessLog {
  document_id: string | null;
  original_filename: string | null;
  processing_status_before: LocalProcessingSummary["processing_status_before"];
  processing_status_after: LocalProcessingSummary["processing_status_before"];
  page_count: number | null;
  chunk_count: number;
  checkpointed_chunk_count: number;
  pending_chunk_count: number;
  document_concept_count: number;
  tree_id: string | null;
  llm_stage_executed: LocalRunnerLlmStage;
  duration_ms: number;
}

export interface LocalRunnerErrorLog {
  error_code: string;
  error_message: string;
  failed_stage: string;
  recommended_next_action: string;
}

export type LocalRunnerResult =
  | {
      status: "dry_run";
      summary: LocalProcessingSummary;
    }
  | {
      status: "already_processed";
      summary: LocalProcessingSummary;
      log: LocalRunnerSuccessLog;
    }
  | {
      status: "processed" | "requeued";
      summary: LocalProcessingSummary;
      log: LocalRunnerSuccessLog;
      processResult: ProcessDocumentResult;
    };

export class LocalRunnerError extends Error {
  constructor(
    public code: string,
    message: string,
    public failedStage = "local_runner",
    public recommendedNextAction = "dry-run 출력과 문서 상태를 확인한 뒤 다시 실행하세요.",
  ) {
    super(message);
    this.name = "LocalRunnerError";
  }
}

type LocalProcessor = (
  documentId: string,
  userId: string,
  options?: ProcessDocumentOptions,
) => Promise<ProcessDocumentResult>;

type LocalRunnerDependencies = {
  getSummary?: (documentId: string, userId: string) => Promise<LocalProcessingSummary>;
  processDocument?: LocalProcessor;
  getUserId?: () => string;
  now?: () => number;
};

function usage(): string {
  return [
    "Usage: npm run document:process-local -- --document-id <uuid> [options]",
    "",
    "Options:",
    "  --env-file <path>",
    "  --dry-run",
    "  --resume",
    "  --tree-only",
    "  --chunk-batch-size <number>",
    "  --stop-after-concepts",
  ].join("\n");
}

function takeOptionValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new LocalRunnerError(
      "INVALID_CLI_ARGUMENT",
      `${flag} 옵션에는 값이 필요합니다.\n${usage()}`,
      "cli_parse",
      "명령어 옵션 값을 확인한 뒤 다시 실행하세요.",
    );
  }
  return value;
}

export function parseLocalRunnerArgs(argv: string[]): LocalRunnerOptions {
  const options: LocalRunnerOptions = {
    documentId: "",
    envFile: DEFAULT_LOCAL_WORKER_ENV_FILE,
    dryRun: false,
    resume: false,
    treeOnly: false,
    stopAfterConcepts: false,
  };
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--document-id" || arg === "--env-file" || arg === "--chunk-batch-size") {
      if (seen.has(arg)) {
        throw new LocalRunnerError(
          "INVALID_CLI_ARGUMENT",
          `${arg} 옵션이 중복되었습니다.\n${usage()}`,
          "cli_parse",
          "중복된 옵션을 제거한 뒤 다시 실행하세요.",
        );
      }
      seen.add(arg);
      const value = takeOptionValue(argv, index, arg);
      if (arg === "--document-id") options.documentId = value;
      if (arg === "--env-file") options.envFile = value;
      if (arg === "--chunk-batch-size") {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value) {
          throw new LocalRunnerError(
            "INVALID_CLI_ARGUMENT",
            "--chunk-batch-size는 양의 정수여야 합니다.",
            "cli_parse",
            "chunk batch 크기를 1 이상의 정수로 지정하세요.",
          );
        }
        options.chunkBatchSize = parsed;
      }
      index += 1;
      continue;
    }

    if (
      arg === "--dry-run" ||
      arg === "--resume" ||
      arg === "--tree-only" ||
      arg === "--stop-after-concepts"
    ) {
      if (seen.has(arg)) {
        throw new LocalRunnerError(
          "INVALID_CLI_ARGUMENT",
          `${arg} 옵션이 중복되었습니다.\n${usage()}`,
          "cli_parse",
          "중복된 옵션을 제거한 뒤 다시 실행하세요.",
        );
      }
      seen.add(arg);
      if (arg === "--dry-run") options.dryRun = true;
      if (arg === "--resume") options.resume = true;
      if (arg === "--tree-only") options.treeOnly = true;
      if (arg === "--stop-after-concepts") options.stopAfterConcepts = true;
      continue;
    }

    throw new LocalRunnerError(
      "INVALID_CLI_ARGUMENT",
      `알 수 없는 옵션입니다: ${arg}\n${usage()}`,
      "cli_parse",
      "지원되는 옵션만 사용해 다시 실행하세요.",
    );
  }

  if (!options.documentId.trim()) {
    throw new LocalRunnerError(
      "INVALID_CLI_ARGUMENT",
      `--document-id <uuid> 옵션이 필요합니다.\n${usage()}`,
      "cli_parse",
      "처리할 documentId를 명시하세요.",
    );
  }

  return options;
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvFileContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalizedLine.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = normalizedLine.slice(0, equalsIndex).trim();
    const value = normalizedLine.slice(equalsIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    parsed[key] = unquoteEnvValue(value);
  }
  return parsed;
}

export function resolveLocalWorkerEnvPath(envFile: string, cwd = process.cwd()): string {
  return path.isAbsolute(envFile) ? envFile : path.resolve(cwd, envFile);
}

export function loadLocalWorkerEnvFile(
  envFile: string,
  cwd = process.cwd(),
): { path: string; loaded: boolean; values: Record<string, string> } {
  const resolvedPath = resolveLocalWorkerEnvPath(envFile, cwd);
  if (!fs.existsSync(resolvedPath)) {
    return { path: resolvedPath, loaded: false, values: {} };
  }
  return {
    path: resolvedPath,
    loaded: true,
    values: parseEnvFileContent(fs.readFileSync(resolvedPath, "utf-8")),
  };
}

export function applyEnvValues(
  values: Record<string, string>,
  targetEnv: NodeJS.ProcessEnv = process.env,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (targetEnv[key] === undefined) targetEnv[key] = value;
  }
}

export function validateRequiredLocalWorkerEnv(
  env: Pick<NodeJS.ProcessEnv, string>,
): LocalWorkerEnvKey[] {
  return REQUIRED_LOCAL_WORKER_ENV_KEYS.filter((key) => !env[key]?.trim());
}

export function assertRequiredLocalWorkerEnv(
  envFilePath: string,
  env: Pick<NodeJS.ProcessEnv, string> = process.env,
): void {
  const missing = validateRequiredLocalWorkerEnv(env);
  if (missing.length > 0) {
    throw new LocalRunnerError(
      "MISSING_LOCAL_WORKER_ENV",
      `로컬 문서 처리 env가 부족합니다: ${missing.join(", ")} (env file: ${envFilePath})`,
      "env_validation",
      ".env.local-worker에 필수 값을 채우거나 --env-file로 올바른 env 파일을 지정하세요.",
    );
  }
}

function inferLlmStage(
  options: LocalRunnerOptions,
  before: LocalProcessingSummary,
  result: ProcessDocumentResult,
): LocalRunnerLlmStage {
  if (result.reason === "chunk_concepts_pending") return "chunk_concepts";
  if (result.reason === "tree_generation_deferred") return "multiple";
  if (options.treeOnly || before.processing_status_before === "concepts_extracted") {
    return "tree_generation";
  }
  if (before.processing_status_before === "chunked") return "multiple";
  if (
    before.processing_status_before === "uploaded" ||
    before.processing_status_before === "text_extracted"
  ) {
    return "multiple";
  }
  return "none";
}

function createSuccessLog(options: {
  before: LocalProcessingSummary;
  after: LocalProcessingSummary;
  result?: ProcessDocumentResult;
  durationMs: number;
  llmStageExecuted: LocalRunnerLlmStage;
}): LocalRunnerSuccessLog {
  return {
    document_id: options.before.document_id,
    original_filename: options.before.original_filename,
    processing_status_before: options.before.processing_status_before,
    processing_status_after: options.after.processing_status_before,
    page_count: options.after.page_count ?? options.before.page_count,
    chunk_count: options.after.chunk_count,
    checkpointed_chunk_count: options.after.checkpointed_chunk_count,
    pending_chunk_count: options.after.pending_chunk_count,
    document_concept_count: options.after.document_concept_count,
    tree_id: options.result?.treeId ?? options.after.tree_id ?? options.before.tree_id,
    llm_stage_executed: options.llmStageExecuted,
    duration_ms: options.durationMs,
  };
}

export async function runLocalDocumentProcessing(
  options: LocalRunnerOptions,
  dependencies: LocalRunnerDependencies = {},
): Promise<LocalRunnerResult> {
  const getSummary = dependencies.getSummary ?? getLocalProcessingSummary;
  const runProcessor = dependencies.processDocument ?? processDocument;
  const getUserId = dependencies.getUserId ?? (() => DEFAULT_USER_ID);
  const now = dependencies.now ?? (() => Date.now());
  const startedAt = now();
  const userId = getUserId();
  const before = await getSummary(options.documentId, userId);

  if (options.dryRun) {
    return { status: "dry_run", summary: before };
  }

  if (before.processing_status_before === "tree_generated") {
    return {
      status: "already_processed",
      summary: before,
      log: createSuccessLog({
        before,
        after: before,
        durationMs: now() - startedAt,
        llmStageExecuted: "none",
      }),
    };
  }

  if (!before.can_process) {
    throw new LocalRunnerError(
      "INVALID_LOCAL_PROCESSING_STATE",
      "현재 문서 상태에서는 로컬 처리를 시작하지 않습니다.",
      "preflight",
      before.recommended_next_action,
    );
  }

  if (options.treeOnly && before.processing_status_before !== "concepts_extracted") {
    throw new LocalRunnerError(
      "INVALID_LOCAL_PROCESSING_STATE",
      "--tree-only는 concepts_extracted 상태에서만 실행할 수 있습니다.",
      "preflight",
      "문서 상태를 확인하고 concepts_extracted 상태의 문서에만 --tree-only를 사용하세요.",
    );
  }

  const processOptions: ProcessDocumentOptions = {
    chunkBatchSize: options.chunkBatchSize,
    stopAfterConcepts: options.stopAfterConcepts,
    treeOnly: options.treeOnly,
  };
  const result = await runProcessor(options.documentId, userId, processOptions);
  const after = await getSummary(options.documentId, userId);
  const status: "processed" | "requeued" = result.shouldRequeue ? "requeued" : "processed";

  return {
    status,
    summary: after,
    processResult: result,
    log: createSuccessLog({
      before,
      after,
      result,
      durationMs: now() - startedAt,
      llmStageExecuted: inferLlmStage(options, before, result),
    }),
  };
}

function isErrorWithCode(error: unknown): error is { code: string; message?: string } {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

export function formatLocalRunnerErrorLog(
  error: unknown,
  summary?: LocalProcessingSummary | null,
): LocalRunnerErrorLog {
  if (error instanceof LocalRunnerError) {
    return {
      error_code: error.code,
      error_message: error.message,
      failed_stage: error.failedStage,
      recommended_next_action: error.recommendedNextAction,
    };
  }
  if (error instanceof DocumentProcessorError) {
    return {
      error_code: error.code,
      error_message: error.message,
      failed_stage: error.code.toLowerCase(),
      recommended_next_action:
        summary?.recommended_next_action ??
        "문서 처리 로그와 DB 상태를 확인한 뒤 dry-run부터 다시 실행하세요.",
    };
  }
  if (isErrorWithCode(error)) {
    return {
      error_code: error.code,
      error_message: error.message ?? "알 수 없는 오류가 발생했습니다.",
      failed_stage: error.code.toLowerCase(),
      recommended_next_action:
        summary?.recommended_next_action ??
        "문서 처리 로그와 DB 상태를 확인한 뒤 dry-run부터 다시 실행하세요.",
    };
  }
  return {
    error_code: "LOCAL_RUNNER_ERROR",
    error_message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    failed_stage: "local_runner",
    recommended_next_action:
      summary?.recommended_next_action ??
      "문서 처리 로그와 DB 상태를 확인한 뒤 dry-run부터 다시 실행하세요.",
  };
}
