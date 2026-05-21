import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import { toIsoString } from "@/lib/learning/session-events";
import {
  getDocumentAccessForUser,
  getLearningTreeAccessForUser,
  startLearningSession,
} from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  tree_id: z.string().min(1),
  document_id: z.string().min(1).nullable().optional(),
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
    return jsonError(
      "INVALID_REQUEST",
      "tree_id와 선택 document_id를 올바르게 입력해야 합니다.",
      400,
    );
  }

  const tree = await getLearningTreeAccessForUser({
    userId: auth.userId,
    treeId: parsed.data.tree_id,
  });
  if (!tree) {
    return jsonError(
      "FORBIDDEN",
      "이 학습 트리에 접근할 수 없습니다.",
      403,
    );
  }

  const documentId = parsed.data.document_id ?? null;
  if (documentId) {
    const document = await getDocumentAccessForUser({
      userId: auth.userId,
      documentId,
    });
    if (!document) {
      return jsonError(
        "FORBIDDEN",
        "이 문서에 접근할 수 없습니다.",
        403,
      );
    }
  }

  /** 인증된 사용자와 소유권 검증이 끝난 tree/document만 세션 row에 기록한다. */
  const session = await startLearningSession({
    userId: auth.userId,
    treeId: parsed.data.tree_id,
    documentId,
  });

  return NextResponse.json({
    session_id: session.id,
    started_at: toIsoString(session.startedAt),
  });
}
