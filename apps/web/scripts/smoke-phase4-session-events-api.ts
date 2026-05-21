/**
 * Phase 4 task 03 session/event API smoke.
 *
 * 실제 Supabase DB에 연결하지 않고 route handler를 fake DB와 fake Supabase Auth 응답으로 실행한다.
 * 목적은 "세션 시작 → 학습 이벤트 기록 → 세션 종료" HTTP 흐름과 사용자 소유권 검증 코드의 존재를
 * 빠르게 확인하는 것이다. 실제 Postgres/RLS 검증은 Phase 4 배포 전 보안 품질 태스크에서 별도로 수행한다.
 */
import fs from "node:fs";
import path from "node:path";
import { getTableName } from "drizzle-orm";
import * as schema from "../src/db/schema";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TREE_ID = "tree-phase4-smoke";
const DOCUMENT_ID = "document-phase4-smoke";
const NODE_ID = "node-phase4-smoke";
const CONCEPT_ID = "concept-phase4-smoke";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

type JsonObject = Record<string, unknown>;

interface FakeSession {
  id: string;
  userId: string;
  treeId: string | null;
  documentId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  summary: JsonObject;
  createdAt: Date;
}

interface FakeEvent {
  id: string;
  userId: string;
  sessionId: string | null;
  treeId: string | null;
  nodeId: string | null;
  conceptId: string | null;
  eventType: string;
  eventPayload: JsonObject;
  createdAt: Date;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

function assertSourceContains(
  source: string,
  pattern: RegExp,
  message: string,
): void {
  assert(pattern.test(source), message);
}

function makeJsonRequest(url: string, body: JsonObject): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer phase4-smoke-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function tableName(table: unknown): string {
  return getTableName(table as never);
}

function makeFakeDb() {
  const sessions: FakeSession[] = [];
  const events: FakeEvent[] = [];
  const fixedStartedAt = new Date("2026-05-21T00:00:00.000Z");
  const fixedEndedAt = new Date("2026-05-21T00:03:00.000Z");

  const rowsForTable = (table: unknown): unknown[] => {
    const name = tableName(table);
    if (name === tableName(schema.learningTrees)) {
      return [{ id: TREE_ID, userId: USER_ID }];
    }
    if (name === tableName(schema.documents)) {
      return [{ id: DOCUMENT_ID, userId: USER_ID }];
    }
    if (name === tableName(schema.learningNodes)) {
      return [
        {
          id: NODE_ID,
          treeId: TREE_ID,
          nodeKey: "phase4_smoke_node",
          title: "Phase 4 Smoke Node",
          type: "core",
          description: "Smoke node",
          difficulty: 2,
          prerequisites: [],
          children: [],
          detailJson: null,
          conceptId: CONCEPT_ID,
          isReusedConcept: false,
          createdAt: fixedStartedAt.toISOString(),
          updatedAt: fixedStartedAt.toISOString(),
        },
      ];
    }
    if (name === tableName(schema.learningTreeConcepts)) {
      return [{ id: "tree-concept-phase4-smoke" }];
    }
    if (name === tableName(schema.learningSessions)) {
      return sessions;
    }
    return [];
  };

  const selectBuilder = (table: unknown) => {
    const builder = {
      innerJoin: () => builder,
      where: () => rowsForTable(table),
      orderBy: () => rowsForTable(table),
      limit: () => rowsForTable(table),
    };
    return builder;
  };

  return {
    state: { sessions, events },
    select: () => ({
      from: (table: unknown) => selectBuilder(table),
    }),
    insert: (table: unknown) => ({
      values: (values: JsonObject) => ({
        returning: () => {
          const name = tableName(table);
          if (name === tableName(schema.learningSessions)) {
            const session: FakeSession = {
              id: SESSION_ID,
              userId: String(values.userId),
              treeId: (values.treeId as string | null | undefined) ?? null,
              documentId: (values.documentId as string | null | undefined) ?? null,
              startedAt: fixedStartedAt,
              endedAt: null,
              durationSeconds: null,
              summary: (values.summary as JsonObject | undefined) ?? {},
              createdAt: fixedStartedAt,
            };
            sessions.push(session);
            return [session];
          }
          if (name === tableName(schema.learningEvents)) {
            const event: FakeEvent = {
              id: `event-phase4-smoke-${events.length + 1}`,
              userId: String(values.userId),
              sessionId: (values.sessionId as string | null | undefined) ?? null,
              treeId: (values.treeId as string | null | undefined) ?? null,
              nodeId: (values.nodeId as string | null | undefined) ?? null,
              conceptId: (values.conceptId as string | null | undefined) ?? null,
              eventType: String(values.eventType),
              eventPayload: (values.eventPayload as JsonObject | undefined) ?? {},
              createdAt: fixedEndedAt,
            };
            events.push(event);
            return [event];
          }
          throw new Error(`unexpected insert table: ${name}`);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: JsonObject) => ({
        where: () => ({
          returning: () => {
            const name = tableName(table);
            assert(name === tableName(schema.learningSessions), `unexpected update table: ${name}`);
            const session = sessions[0];
            assert(session, "session must exist before end route updates it");
            session.endedAt = fixedEndedAt;
            session.durationSeconds =
              typeof patch.durationSeconds === "number" ? patch.durationSeconds : 180;
            session.summary = (patch.summary as JsonObject | undefined) ?? session.summary;
            return [session];
          },
        }),
      }),
    }),
  };
}

async function main(): Promise<void> {
  const startSource = readSource("src/app/api/sessions/start/route.ts");
  const endSource = readSource("src/app/api/sessions/[sessionId]/end/route.ts");
  const eventsSource = readSource("src/app/api/events/route.ts");
  const authSource = readSource("src/lib/auth/supabase-auth.ts");
  const repositorySource = readSource("src/lib/repository/learning-session-repository.ts");

  for (const [label, source] of [
    ["sessions/start route", startSource],
    ["sessions/end route", endSource],
    ["events route", eventsSource],
    ["Phase 4 auth helper", authSource],
  ] as const) {
    assert(!source.includes("DEFAULT_USER_ID"), `${label} must not use DEFAULT_USER_ID`);
    assertSourceContains(source, /requireSupabaseAuthUserId/, `${label} must require Supabase Auth user`);
  }

  assertSourceContains(
    repositorySource,
    /eq\(learningSessions\.userId,\s*input\.userId\)/,
    "learning_sessions access must be scoped by user_id",
  );
  assertSourceContains(
    eventsSource,
    /LEARNING_EVENT_TYPES/,
    "events route must validate event_type with the Phase 4 whitelist",
  );
  assertSourceContains(
    endSource,
    /session_ended/,
    "ending a session must append a session_ended learning event",
  );

  process.env.SUPABASE_URL = "https://phase4-smoke.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "phase4-smoke-service-role-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: USER_ID }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const fakeDb = makeFakeDb();
  const globalForDb = globalThis as unknown as {
    rootmapDb?: unknown;
    rootmapPostgres?: unknown;
  };
  globalForDb.rootmapDb = fakeDb;
  globalForDb.rootmapPostgres = undefined;

  try {
    const [{ POST: startSession }, { POST: appendEvent }, { POST: endSession }] =
      await Promise.all([
        import("../src/app/api/sessions/start/route"),
        import("../src/app/api/events/route"),
        import("../src/app/api/sessions/[sessionId]/end/route"),
      ]);

    const startRes = await startSession(
      makeJsonRequest("http://rootmap.test/api/sessions/start", {
        tree_id: TREE_ID,
        document_id: DOCUMENT_ID,
      }),
    );
    assert(startRes.status === 200, `session start status ${startRes.status}`);
    const started = await startRes.json();
    assert(started.session_id === SESSION_ID, "session start must return session_id");
    assert(typeof started.started_at === "string", "session start must return started_at");

    const eventRes = await appendEvent(
      makeJsonRequest("http://rootmap.test/api/events", {
        session_id: started.session_id,
        tree_id: TREE_ID,
        node_id: NODE_ID,
        concept_id: CONCEPT_ID,
        event_type: "node_opened",
        event_payload: { source: "phase4-smoke" },
      }),
    );
    assert(eventRes.status === 200, `event append status ${eventRes.status}`);
    const event = await eventRes.json();
    assert(event.event_id === "event-phase4-smoke-1", "event append must return event_id");
    assert(event.event_type === "node_opened", "event append must echo event_type");

    const endRes = await endSession(
      makeJsonRequest(`http://rootmap.test/api/sessions/${started.session_id}/end`, {
        generate_report: false,
      }),
      { params: Promise.resolve({ sessionId: started.session_id }) },
    );
    assert(endRes.status === 200, `session end status ${endRes.status}`);
    const ended = await endRes.json();
    assert(typeof ended.ended_at === "string", "session end must return ended_at");
    assert(
      typeof ended.duration_seconds === "number" && ended.duration_seconds >= 0,
      "session end must return duration_seconds",
    );
    assert(fakeDb.state.events.some((e) => e.eventType === "session_ended"), "session end event missing");
  } finally {
    globalThis.fetch = originalFetch;
    globalForDb.rootmapDb = undefined;
    globalForDb.rootmapPostgres = undefined;
  }

  console.log("Phase 4 task 03 session/event API smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:session-events-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
