import { jsonError } from "@/lib/api-errors";
import { requireSupabaseAuthUserId } from "@/lib/auth/supabase-auth";
import {
  LEARNING_EVENT_TYPES,
  isLearningEventType,
  toIsoString,
} from "@/lib/learning/session-events";
import {
  appendLearningEvent,
  getLearningNodeScopeForUser,
  getLearningSessionForUser,
  getLearningTreeAccessForUser,
  getLearningTreeConceptAccessForUser,
} from "@/lib/repository/learning-session-repository";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const runtime = "nodejs";

const bodySchema = z.object({
  session_id: z.string().uuid(),
  tree_id: z.string().min(1).nullable().optional(),
  node_id: z.string().min(1).nullable().optional(),
  concept_id: z.string().min(1).nullable().optional(),
  event_type: z.string().refine(isLearningEventType),
  event_payload: z.record(z.unknown()).optional(),
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
      `session_id와 event_type(${LEARNING_EVENT_TYPES.join(", ")})을 올바르게 입력해야 합니다.`,
      400,
    );
  }

  const session = await getLearningSessionForUser({
    userId: auth.userId,
    sessionId: parsed.data.session_id,
  });
  if (!session) {
    return jsonError("NOT_FOUND", "학습 세션을 찾을 수 없습니다.", 404);
  }
  if (session.endedAt) {
    return jsonError("INVALID_OPERATION", "종료된 세션에는 이벤트를 추가할 수 없습니다.", 409);
  }

  let treeId = parsed.data.tree_id ?? session.treeId ?? null;
  let conceptId = parsed.data.concept_id ?? null;
  const nodeId = parsed.data.node_id ?? null;

  if (session.treeId && parsed.data.tree_id && parsed.data.tree_id !== session.treeId) {
    return jsonError(
      "FORBIDDEN",
      "이벤트의 tree_id가 세션의 학습 트리와 일치하지 않습니다.",
      403,
    );
  }

  if (treeId) {
    const tree = await getLearningTreeAccessForUser({
      userId: auth.userId,
      treeId,
    });
    if (!tree) {
      return jsonError(
        "FORBIDDEN",
        "이 학습 트리에 접근할 수 없습니다.",
        403,
      );
    }
  }

  if (nodeId) {
    const node = await getLearningNodeScopeForUser({
      userId: auth.userId,
      nodeId,
    });
    if (!node) {
      return jsonError("FORBIDDEN", "이 노드에 접근할 수 없습니다.", 403);
    }
    if (treeId && node.treeId !== treeId) {
      return jsonError(
        "FORBIDDEN",
        "이벤트의 node_id가 tree_id에 속하지 않습니다.",
        403,
      );
    }
    treeId = treeId ?? node.treeId;
    if (conceptId && node.conceptId && conceptId !== node.conceptId) {
      return jsonError(
        "INVALID_REQUEST",
        "이벤트의 concept_id가 node_id의 Concept과 일치하지 않습니다.",
        400,
      );
    }
    conceptId = conceptId ?? node.conceptId;
  }

  if (treeId && conceptId && !nodeId) {
    const concept = await getLearningTreeConceptAccessForUser({
      userId: auth.userId,
      treeId,
      conceptId,
    });
    if (!concept) {
      return jsonError(
        "FORBIDDEN",
        "이 Concept은 해당 학습 트리에 연결되어 있지 않습니다.",
        403,
      );
    }
  }

  /** 세션·트리·노드 scope 검증이 끝난 뒤에만 append-only 이벤트를 저장한다. */
  const event = await appendLearningEvent({
    userId: auth.userId,
    sessionId: session.id,
    treeId,
    nodeId,
    conceptId,
    eventType: parsed.data.event_type,
    eventPayload: parsed.data.event_payload ?? {},
  });

  return NextResponse.json({
    event_id: event.id,
    session_id: event.sessionId,
    tree_id: event.treeId,
    node_id: event.nodeId,
    concept_id: event.conceptId,
    event_type: event.eventType,
    created_at: toIsoString(event.createdAt),
  });
}
