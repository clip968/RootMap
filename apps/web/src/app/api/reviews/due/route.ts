import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { buildReviewItems } from "@/lib/recommendation/review-priority";
import { listUserConceptMasteryForReview } from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(50, Number(limitRaw) || 20)) : 20;
  const rows = await listUserConceptMasteryForReview(auth.userId);

  return NextResponse.json({
    review_items: buildReviewItems(rows, { limit }),
  });
}
