import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { listLearningTreeHistory } from "@/lib/repository/learning-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupabaseAuthUserId(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, auth.status);
  }

  /** 히스토리는 로그인한 사용자가 만든 tree만 노출한다. */
  const trees = (await listLearningTreeHistory(auth.userId)).map((tree) => ({
    tree_id: tree.id,
    topic: tree.topic,
    summary: tree.summary ?? "",
    node_count: tree.nodeCount,
    created_at: tree.createdAt,
    updated_at: tree.updatedAt,
  }));

  return NextResponse.json({ trees });
}
