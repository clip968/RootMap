import { DEFAULT_USER_ID } from "@/db/constants";
import { listLearningTreeHistory } from "@/lib/repository/learning-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const trees = listLearningTreeHistory(DEFAULT_USER_ID).map((tree) => ({
    tree_id: tree.id,
    topic: tree.topic,
    summary: tree.summary ?? "",
    node_count: tree.nodeCount,
    created_at: tree.createdAt,
    updated_at: tree.updatedAt,
  }));

  return NextResponse.json({ trees });
}
