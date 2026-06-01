import { jsonError } from "@/lib/api-errors";
import { getNodeDetailJob } from "@/lib/repository/node-detail-job-repository";
import { getReadyNodeDetailForRequest } from "@/lib/services/node-detail";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ jobId: string }> };

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: Ctx) {
  const { jobId } = await ctx.params;
  const job = await getNodeDetailJob(jobId);
  if (!job) {
    return jsonError("NOT_FOUND", "상세 생성 작업을 찾을 수 없습니다.", 404);
  }

  if (job.status === "ready") {
    const ready = await getReadyNodeDetailForRequest(job.treeId, job.nodeId);
    if (ready.status !== "ready") {
      return jsonError(
        "DETAIL_GENERATION_FAILED",
        "상세 생성 작업은 완료됐지만 저장된 상세 설명을 찾지 못했습니다.",
        409,
      );
    }

    return NextResponse.json(
      {
        status: "ready",
        job_id: job.id,
        detail: ready.detail,
      },
      { headers: noStoreHeaders },
    );
  }

  if (job.status === "failed") {
    return NextResponse.json(
      {
        status: "failed",
        job_id: job.id,
        error_message: job.errorMessage ?? "상세 설명 생성에 실패했습니다.",
      },
      { headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    {
      status: job.status,
      job_id: job.id,
      attempt_count: job.attemptCount,
    },
    { headers: noStoreHeaders },
  );
}
