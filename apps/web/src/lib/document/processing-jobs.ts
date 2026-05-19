import {
  processDocument,
  type ProcessDocumentResult,
} from "@/lib/document/processor";

export type DocumentProcessingJobStatus = "queued" | "already_running";

export interface DocumentProcessingJob {
  jobId: string;
  documentId: string;
  userId: string;
  startedAt: string;
}

export interface StartDocumentProcessingJobResult {
  status: DocumentProcessingJobStatus;
  jobId: string;
}

type DocumentProcessor = (
  documentId: string,
  userId: string,
) => Promise<ProcessDocumentResult>;

type JobScheduler = (task: () => Promise<void>) => void;

interface ActiveDocumentProcessingJob extends DocumentProcessingJob {
  promise: Promise<void>;
}

const activeJobs = new Map<string, ActiveDocumentProcessingJob>();

function createJobId(documentId: string): string {
  return `doc-process-${documentId}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function getDocumentProcessingJob(
  documentId: string,
): DocumentProcessingJob | null {
  const job = activeJobs.get(documentId);
  if (!job) return null;
  return {
    jobId: job.jobId,
    documentId: job.documentId,
    userId: job.userId,
    startedAt: job.startedAt,
  };
}

export function startDocumentProcessingJob(options: {
  documentId: string;
  userId: string;
  run?: DocumentProcessor;
  schedule?: JobScheduler;
}): StartDocumentProcessingJobResult {
  const existing = activeJobs.get(options.documentId);
  if (existing) {
    return { status: "already_running", jobId: existing.jobId };
  }

  const jobId = createJobId(options.documentId);
  const run = options.run ?? processDocument;
  const schedule = options.schedule ?? ((task) => void queueMicrotask(task));
  let resolveJob: () => void = () => undefined;

  const promise = new Promise<void>((resolve) => {
    resolveJob = resolve;
  });

  activeJobs.set(options.documentId, {
    jobId,
    documentId: options.documentId,
    userId: options.userId,
    startedAt: new Date().toISOString(),
    promise,
  });

  schedule(async () => {
    try {
      await run(options.documentId, options.userId);
    } catch (err) {
      console.error("[document-processing-job]", {
        event: "failed",
        jobId,
        documentId: options.documentId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      activeJobs.delete(options.documentId);
      resolveJob();
    }
  });

  return { status: "queued", jobId };
}

export function clearDocumentProcessingJobsForTests(): void {
  activeJobs.clear();
}
