import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { markRecommendationLogClicked } from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  recommendation_log_id: z.string().uuid(),
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
    return jsonError("INVALID_REQUEST", "recommendation_log_id가 필요합니다.", 400);
  }

  /** 클릭 갱신은 user_id 조건이 포함된 repository 함수로만 수행해 다른 사용자의 추천 로그를 건드리지 않는다. */
  const row = await markRecommendationLogClicked({
    userId: auth.userId,
    recommendationLogId: parsed.data.recommendation_log_id,
  });
  if (!row) {
    return jsonError("NOT_FOUND", "추천 로그를 찾을 수 없습니다.", 404);
  }

  return NextResponse.json({
    recommendation_log_id: row.id,
    clicked: row.clicked,
  });
}
