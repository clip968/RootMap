import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  createSessionLearningReport,
  SessionReportNotFoundError,
} from "@/lib/learning/report";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  report_type: z.enum(["session", "weekly", "topic", "cumulative"]),
  session_id: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(
      "INVALID_REQUEST",
      "JSON 형식의 요청 본문이 필요합니다.",
      400,
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_REQUEST", "리포트 생성 요청 형식이 올바르지 않습니다.", 400);
  }
  if (parsed.data.report_type !== "session") {
    return jsonError(
      "INVALID_REQUEST",
      "현재 MVP에서는 session 리포트만 생성할 수 있습니다.",
      400,
    );
  }
  if (!parsed.data.session_id) {
    return jsonError("INVALID_REQUEST", "session 리포트에는 session_id가 필요합니다.", 400);
  }

  try {
    /** 리포트 생성은 저장까지 포함하는 서비스로 위임해 세션 종료 route와 같은 정책을 사용한다. */
    const report = await createSessionLearningReport({
      userId: auth.userId,
      sessionId: parsed.data.session_id,
    });
    return NextResponse.json({
      report_id: report.reportId,
      title: report.title,
      summary: report.summary,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      recommendations: report.nextRecommendations,
    });
  } catch (err) {
    if (err instanceof SessionReportNotFoundError) {
      return jsonError("NOT_FOUND", err.message, 404);
    }
    return jsonError("PROCESSING_FAILED", "학습 리포트 생성에 실패했습니다.", 500);
  }
}
