import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { toIsoString } from "@/lib/learning/session-events";
import {
  appendLearningEvent,
  endLearningSession,
  getLearningSessionForUser,
} from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sessionId: string }> };

const paramsSchema = z.object({
  sessionId: z.string().uuid(),
});

const bodySchema = z.object({
  generate_report: z.boolean().optional(),
});

async function readOptionalJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const rawParams = await ctx.params;
  const parsedParams = paramsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return jsonError("INVALID_REQUEST", "sessionId는 UUID여야 합니다.", 400);
  }

  let body: unknown;
  try {
    body = await readOptionalJson(req);
  } catch {
    return jsonError(
      "INVALID_REQUEST",
      "JSON 형식의 요청 본문이 필요합니다.",
      400,
    );
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError(
      "INVALID_REQUEST",
      "generate_report는 boolean이어야 합니다.",
      400,
    );
  }

  const current = await getLearningSessionForUser({
    userId: auth.userId,
    sessionId: parsedParams.data.sessionId,
  });
  if (!current) {
    return jsonError("NOT_FOUND", "학습 세션을 찾을 수 없습니다.", 404);
  }
  if (current.endedAt) {
    return jsonError("INVALID_OPERATION", "이미 종료된 학습 세션입니다.", 409);
  }

  const ended = await endLearningSession({
    userId: auth.userId,
    sessionId: parsedParams.data.sessionId,
  });
  if (!ended) {
    return jsonError("NOT_FOUND", "학습 세션을 찾을 수 없습니다.", 404);
  }

  /** 종료 자체도 append-only 이벤트로 남겨 리포트·추천 계산이 세션 수명 주기를 재구성할 수 있게 한다. */
  await appendLearningEvent({
    userId: auth.userId,
    sessionId: ended.id,
    treeId: ended.treeId,
    eventType: "session_ended",
    eventPayload: {
      generate_report: parsedBody.data.generate_report ?? false,
      duration_seconds: ended.durationSeconds ?? 0,
    },
  });

  const response: {
    ended_at: string | null;
    duration_seconds: number | null;
    report_id?: string | null;
  } = {
    ended_at: toIsoString(ended.endedAt),
    duration_seconds: ended.durationSeconds,
  };
  if (parsedBody.data.generate_report) {
    response.report_id = null;
  }

  return NextResponse.json(response);
}
