import { resetDbSingleton } from "../src/db";
import {
  processNextNodeDetailJob,
  recoverStaleNodeDetailJobs,
} from "../src/lib/node-detail-jobs/processor";

interface CliOptions {
  mode: "once" | "loop";
  sleepMs: number;
  workerId: string;
  recoverStale: boolean;
}

function usage(): string {
  return [
    "Usage: npm run node-detail:worker -- --once|--loop [--sleep-ms <ms>] [--worker-id <id>] [--recover-stale]",
    "",
    "Options:",
    "  --once            Process one queued node detail job and exit.",
    "  --loop            Keep polling queued node detail jobs.",
    "  --sleep-ms <ms>   Idle delay for --loop. Default: 1000.",
    "  --worker-id <id>  Lock owner label. Default: node-detail-worker-<pid>.",
    "  --recover-stale   Recover stale running jobs before processing.",
  ].join("\n");
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} 값이 필요합니다.\n${usage()}`);
  }
  return value;
}

function parseArgs(args: string[]): CliOptions {
  let mode: CliOptions["mode"] | null = null;
  let sleepMs = 1000;
  let workerId = `node-detail-worker-${process.pid}`;
  let recoverStale = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--once" || arg === "--loop") {
      const nextMode = arg === "--once" ? "once" : "loop";
      if (mode && mode !== nextMode) {
        throw new Error("--once와 --loop는 함께 사용할 수 없습니다.\n" + usage());
      }
      mode = nextMode;
      continue;
    }
    if (arg === "--sleep-ms") {
      const parsed = Number.parseInt(readValue(args, index, arg), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--sleep-ms는 양의 정수여야 합니다.\n" + usage());
      }
      sleepMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--worker-id") {
      workerId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--recover-stale") {
      recoverStale = true;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${arg}\n${usage()}`);
  }

  if (!mode) throw new Error("--once 또는 --loop가 필요합니다.\n" + usage());
  return { mode, sleepMs, workerId, recoverStale };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.recoverStale) {
    const recovered = await recoverStaleNodeDetailJobs();
    console.info("[node-detail-worker]", {
      event: "recover_stale",
      ...recovered,
    });
  }

  do {
    const result = await processNextNodeDetailJob({
      workerId: options.workerId,
    });
    console.info("[node-detail-worker]", result);
    if (options.mode === "once") return;
    if (result.status === "idle") await sleep(options.sleepMs);
  } while (options.mode === "loop");
}

main()
  .catch((error) => {
    console.error("[node-detail-worker]", {
      status: "failed",
      error: error instanceof Error ? error.message : "unknown error",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await resetDbSingleton();
  });
