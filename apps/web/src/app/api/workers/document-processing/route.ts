import { NextResponse } from "next/server";
import {
  processNextDocumentProcessingMessage,
  type DocumentProcessingWorkerResult,
} from "@/lib/document/processing-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_WORKER_MAX_ITERATIONS = 10;
const DEFAULT_WORKER_MAX_MS = 240_000;

type WorkerBatchStatus =
  | "idle"
  | "completed"
  | "time_budget_exhausted"
  | "iteration_budget_exhausted"
  | "failed";

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runDocumentProcessingBatch(): Promise<{
  status: WorkerBatchStatus;
  results: DocumentProcessingWorkerResult[];
}> {
  const startedAt = Date.now();
  const maxIterations = readPositiveIntegerEnv(
    "DOCUMENT_WORKER_MAX_ITERATIONS",
    DEFAULT_WORKER_MAX_ITERATIONS,
  );
  const maxMs = readPositiveIntegerEnv(
    "DOCUMENT_WORKER_MAX_MS",
    DEFAULT_WORKER_MAX_MS,
  );
  const results: DocumentProcessingWorkerResult[] = [];

  for (let index = 0; index < maxIterations; index += 1) {
    if (Date.now() - startedAt >= maxMs) {
      return {
        status: "time_budget_exhausted",
        results,
      };
    }

    // Cloud Tasks가 worker를 한 번 깨웠을 때 requeue된 메시지를 같은 요청 안에서 이어 처리한다.
    const result = await processNextDocumentProcessingMessage();
    results.push(result);

    if (result.status === "failed") {
      return {
        status: "failed",
        results,
      };
    }
    if (result.status === "idle") {
      return {
        status: results.length === 1 ? "idle" : "completed",
        results,
      };
    }
  }

  return {
    status: "iteration_budget_exhausted",
    results,
  };
}

function getCloudTaskPostStatus(status: WorkerBatchStatus): number {
  // 배치 예산이 끝났다는 것은 큐에 이어 처리할 메시지가 남아 있을 수 있다는 뜻이다.
  // Cloud Tasks에 503을 돌려 재시도시키면 Supabase Queue visibility timeout 이후 안전하게 다시 깨어난다.
  if (
    status === "time_budget_exhausted" ||
    status === "iteration_budget_exhausted"
  ) {
    return 503;
  }
  return status === "failed" ? 500 : 200;
}

export async function GET() {
  // Vercel Cron이 호출하는 pull-based worker다. 한 번에 한 메시지만 처리해 함수 시간을 예측 가능하게 둔다.
  const result = await processNextDocumentProcessingMessage();
  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

export async function POST() {
  // Cloud Tasks와 수동 점검은 POST를 사용한다. 배치 처리로 cron 대기 없이 문서 처리 단계를 이어간다.
  const result = await runDocumentProcessingBatch();
  return NextResponse.json(result, {
    status: getCloudTaskPostStatus(result.status),
  });
}
