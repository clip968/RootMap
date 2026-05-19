/**
 * 문서 처리 백그라운드 job dedupe 스모크.
 *
 * 실행: tsx scripts/smoke-document-processing-jobs.ts
 * 외부 LLM/DB 없이 scheduler와 processor를 주입해 route timeout 방지용
 * job 관리 계약만 검증한다.
 */
import {
  clearDocumentProcessingJobsForTests,
  getDocumentProcessingJob,
  startDocumentProcessingJob,
} from "../src/lib/document/processing-jobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  clearDocumentProcessingJobsForTests();

  const scheduled: Array<() => Promise<void>> = [];
  let calls = 0;

  const first = startDocumentProcessingJob({
    documentId: "doc-1",
    userId: "user-1",
    run: async (documentId, userId) => {
      calls += 1;
      assert(documentId === "doc-1", "processor should receive document id");
      assert(userId === "user-1", "processor should receive user id");
      return { treeId: "tree-1" };
    },
    schedule: (task) => {
      scheduled.push(task);
    },
  });

  assert(first.status === "queued", "first enqueue should queue a job");
  assert(scheduled.length === 1, "first enqueue should schedule one task");
  assert(
    getDocumentProcessingJob("doc-1")?.jobId === first.jobId,
    "queued job should be visible while pending",
  );

  const duplicate = startDocumentProcessingJob({
    documentId: "doc-1",
    userId: "user-1",
    run: async () => ({ treeId: "tree-duplicate" }),
    schedule: (task) => {
      scheduled.push(task);
    },
  });

  assert(
    duplicate.status === "already_running",
    "duplicate enqueue should not create a second job",
  );
  assert(duplicate.jobId === first.jobId, "duplicate should return existing job id");
  assert(scheduled.length === 1, "duplicate should not schedule another task");

  await scheduled[0]!();

  assert(calls === 1, "processor should run exactly once");
  assert(
    getDocumentProcessingJob("doc-1") === null,
    "job should be cleared after successful completion",
  );

  const second = startDocumentProcessingJob({
    documentId: "doc-1",
    userId: "user-1",
    run: async () => ({ treeId: "tree-2" }),
    schedule: (task) => {
      scheduled.push(task);
    },
  });

  assert(
    second.status === "queued",
    "same document should be enqueueable again after completion",
  );

  const failing = startDocumentProcessingJob({
    documentId: "doc-fail",
    userId: "user-1",
    run: async () => {
      throw new Error("expected failure");
    },
    schedule: (task) => {
      scheduled.push(task);
    },
  });

  assert(failing.status === "queued", "failing job should still be queued");
  await scheduled[2]!();

  assert(
    getDocumentProcessingJob("doc-fail") === null,
    "job should be cleared after failure",
  );

  console.info("[document-processing-jobs-smoke] ok");
}

main().catch((err) => {
  console.error("[document-processing-jobs-smoke] failed", err);
  process.exitCode = 1;
});
