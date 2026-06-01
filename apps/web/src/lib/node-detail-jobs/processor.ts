import { DEFAULT_USER_ID } from "@/db/constants";
import {
  ensureRequiredNodeDetailVisual,
  NODE_DETAIL_MISSING_REQUIRED_VISUAL,
} from "@/lib/llm/generate-node-detail-visual";
import {
  CURRENT_NODE_DETAIL_VERSION,
  claimQueuedNodeDetailJob,
  markNodeDetailJobFailed,
  markNodeDetailJobReady,
  recoverStaleRunningNodeDetailJobs,
  requeueNodeDetailJob,
  type NodeDetailJobRow,
} from "@/lib/repository/node-detail-job-repository";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { getOrCreateNodeDetail } from "@/lib/services/node-detail";
import { buildPrerequisitePromptContext } from "@/lib/services/node-detail-context";
import type { NodeDetailResponse } from "@/types/learning";

export const NODE_DETAIL_JOB_STALE_MS = 5 * 60 * 1000;
const NODE_DETAIL_CACHED_TEXT_INCOMPLETE =
  "NODE_DETAIL_CACHED_TEXT_INCOMPLETE";

export type NodeDetailWorkerStatus =
  | "idle"
  | "ready"
  | "processed"
  | "requeued"
  | "failed";

export interface NodeDetailWorkerResult {
  status: NodeDetailWorkerStatus;
  jobId?: string;
  treeId?: string;
  nodeId?: string;
  attemptCount?: number;
  reason?: string;
  error?: string;
}

type JobClaimer = (input: {
  workerId: string;
  now?: Date;
}) => Promise<NodeDetailJobRow | null>;

type JobProcessor = (job: NodeDetailJobRow) => Promise<NodeDetailWorkerResult>;

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "node detail worker failed";
}

function shouldRetry(job: NodeDetailJobRow): boolean {
  return job.attemptCount < job.maxAttempts;
}

function hasWorkerReadyTextDetail(detail: NodeDetailResponse): boolean {
  return Boolean(
    detail.why_it_matters.trim() &&
      detail.easy_explanation.trim() &&
      detail.example.trim() &&
      detail.common_misconceptions.length > 0 &&
      detail.check_questions.length > 0,
  );
}

async function processGenerationForJob(
  job: NodeDetailJobRow,
): Promise<NodeDetailResponse> {
  const bundle = await getLearningTree(job.treeId, DEFAULT_USER_ID);
  if (!bundle) throw new Error("TREE_NOT_FOUND");

  const nodeRow = bundle.nodes.find((node) => node.id === job.nodeId);
  if (!nodeRow || nodeRow.treeId !== job.treeId) {
    throw new Error("NODE_NOT_IN_TREE");
  }

  const prerequisitesContext = buildPrerequisitePromptContext(
    nodeRow,
    bundle.nodes,
    bundle.tree.treeJson.recommended_order,
  );
  const ensureVisual = (detail: NodeDetailResponse) =>
    ensureRequiredNodeDetailVisual({
      topic: bundle.tree.topic,
      nodeTitle: nodeRow.title,
      nodeType: nodeRow.type,
      prerequisitesContext,
      detail,
    });

  if (nodeRow.detailJson && hasWorkerReadyTextDetail(nodeRow.detailJson)) {
    return ensureVisual(nodeRow.detailJson);
  }

  if (nodeRow.detailJson) {
    console.info("[node-detail-worker]", {
      event: "cached_text_incomplete",
      jobId: job.id,
      treeId: job.treeId,
      nodeId: job.nodeId,
      reason: NODE_DETAIL_CACHED_TEXT_INCOMPLETE,
    });
  }

  const generationBundle = {
    ...bundle,
    nodes: bundle.nodes.map((node) =>
      node.id === job.nodeId ? { ...node, detailJson: null } : node,
    ),
  };

  let generatedDetail: NodeDetailResponse | null = null;
  await getOrCreateNodeDetail({
    treeId: job.treeId,
    nodeId: job.nodeId,
    bundle: generationBundle,
    // worker는 품질을 낮추는 Concept fallback을 ready detail로 저장하지 않고 full generator를 실행한다.
    loadConcept: async () => null,
    persistNodeDetail: async (_nodeId, detail) => {
      generatedDetail = detail;
      return true;
    },
  });

  if (!generatedDetail) {
    throw new Error("NODE_DETAIL_GENERATION_DID_NOT_RETURN_DETAIL");
  }
  const detailWithVisual = await ensureVisual(generatedDetail);
  if (!detailWithVisual.visual_blocks?.length) {
    throw new Error(NODE_DETAIL_MISSING_REQUIRED_VISUAL);
  }
  return detailWithVisual;
}

export async function processNodeDetailJob(
  job: NodeDetailJobRow,
): Promise<NodeDetailWorkerResult> {
  try {
    const detailJson = await processGenerationForJob(job);
    await markNodeDetailJobReady({
      jobId: job.id,
      treeId: job.treeId,
      nodeId: job.nodeId,
      detailVersion: job.detailVersion,
      detailJson,
    });
    return {
      status: nodeAlreadyHadDetail(job) ? "ready" : "processed",
      jobId: job.id,
      treeId: job.treeId,
      nodeId: job.nodeId,
      attemptCount: job.attemptCount,
    };
  } catch (error) {
    const message = safeMessage(error);
    if (shouldRetry(job)) {
      await requeueNodeDetailJob({
        jobId: job.id,
        errorMessage: message,
      });
      return {
        status: "requeued",
        jobId: job.id,
        treeId: job.treeId,
        nodeId: job.nodeId,
        attemptCount: job.attemptCount,
        reason: message,
      };
    }

    await markNodeDetailJobFailed({
      jobId: job.id,
      errorMessage: message,
    });
    console.error("[node-detail-worker]", {
      event: "job_failed",
      jobId: job.id,
      treeId: job.treeId,
      nodeId: job.nodeId,
      attemptCount: job.attemptCount,
      error: message,
    });
    return {
      status: "failed",
      jobId: job.id,
      treeId: job.treeId,
      nodeId: job.nodeId,
      attemptCount: job.attemptCount,
      error: message,
    };
  }
}

function nodeAlreadyHadDetail(_job: NodeDetailJobRow): boolean {
  // ready와 processed는 운영 로그 구분용이다. 현재는 생성 함수에서 detail 유무를 캡슐화하므로 processed로 취급한다.
  void _job;
  return false;
}

export async function processNextNodeDetailJob(options: {
  workerId: string;
  claim?: JobClaimer;
  process?: JobProcessor;
  now?: Date;
}): Promise<NodeDetailWorkerResult> {
  const claim = options.claim ?? claimQueuedNodeDetailJob;
  const process = options.process ?? processNodeDetailJob;
  const job = await claim({
    workerId: options.workerId,
    now: options.now,
  });
  if (!job) return { status: "idle" };
  return process(job);
}

export async function recoverStaleNodeDetailJobs(options: {
  staleMs?: number;
  now?: Date;
} = {}) {
  const now = options.now ?? new Date();
  const staleMs = options.staleMs ?? NODE_DETAIL_JOB_STALE_MS;
  return recoverStaleRunningNodeDetailJobs({
    staleBefore: new Date(now.getTime() - staleMs),
    now,
  });
}

export function currentNodeDetailVersion(): string {
  return CURRENT_NODE_DETAIL_VERSION;
}
