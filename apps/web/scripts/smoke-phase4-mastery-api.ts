/**
 * Phase 4 task 04 Concept mastery/self-assessment API smoke.
 *
 * DB 없이 fake Drizzle client와 fake Supabase Auth 응답으로 GET/PATCH route를 실행한다.
 * 검증 범위는 score clamp, score→status 변환, 자기 평가 반영, mastery 조회·갱신·이벤트 기록이다.
 */
import fs from "node:fs";
import path from "node:path";
import { getTableName } from "drizzle-orm";
import * as schema from "../src/db/schema";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONCEPT_ID = "concept-phase4-mastery-smoke";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const TREE_ID = "tree-phase4-mastery-smoke";

type JsonObject = Record<string, unknown>;

interface FakeMastery {
  id: string;
  userId: string;
  conceptId: string;
  status: "known" | "partial" | "unknown";
  confidenceScore: number;
  lastStudiedAt: Date | null;
  lastQuizScore: number | null;
  reviewCount: number;
  wrongCount: number;
  correctCount: number;
  needsReview: boolean;
  masteryMetadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} file missing`);
  return fs.readFileSync(absolutePath, "utf8");
}

function makeJsonRequest(url: string, body?: JsonObject): Request {
  return new Request(url, {
    method: body ? "PATCH" : "GET",
    headers: {
      Authorization: "Bearer phase4-mastery-smoke-token",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function tableName(table: unknown): string {
  return getTableName(table as never);
}

function makeFakeDb() {
  const now = new Date("2026-05-21T01:00:00.000Z");
  const masteryRows: FakeMastery[] = [];
  const events: JsonObject[] = [];

  const rowsForTable = (table: unknown): unknown[] => {
    const name = tableName(table);
    if (name === tableName(schema.concepts)) {
      return [
        {
          id: CONCEPT_ID,
          slug: "phase4-mastery-smoke",
          title: "Phase 4 Mastery Smoke",
          normalizedTitle: "phase 4 mastery smoke",
          aliases: [],
          domain: "rootmap",
          shortDescription: "Smoke concept",
          explanation: null,
          difficulty: 2,
          examples: [],
          commonMisconceptions: [],
          metadata: {},
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ];
    }
    if (name === tableName(schema.userConceptMastery)) {
      return masteryRows;
    }
    if (name === tableName(schema.learningSessions)) {
      return [
        {
          id: SESSION_ID,
          userId: USER_ID,
          treeId: TREE_ID,
          documentId: null,
          startedAt: now,
          endedAt: null,
          durationSeconds: null,
          summary: {},
          createdAt: now,
        },
      ];
    }
    return [];
  };

  return {
    state: { masteryRows, events },
    select: () => ({
      from: (table: unknown) => ({
        where: () => rowsForTable(table),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: JsonObject) => ({
        onConflictDoUpdate: ({ set }: { set: JsonObject }) => ({
          returning: () => {
            const name = tableName(table);
            assert(
              name === tableName(schema.userConceptMastery),
              `unexpected upsert table: ${name}`,
            );
            const existing = masteryRows[0];
            const next = {
              ...(existing ?? {
                id: "mastery-phase4-smoke",
                userId: USER_ID,
                conceptId: CONCEPT_ID,
                createdAt: now,
              }),
              ...values,
              ...set,
            } as FakeMastery;
            if (existing) masteryRows[0] = next;
            else masteryRows.push(next);
            return [next];
          },
        }),
        returning: () => {
          const name = tableName(table);
          if (name === tableName(schema.userConceptMastery)) {
            const row = {
              id: "mastery-phase4-smoke",
              userId: String(values.userId),
              conceptId: String(values.conceptId),
              status: "unknown" as const,
              confidenceScore: 0.1,
              lastStudiedAt: null,
              lastQuizScore: null,
              reviewCount: 0,
              wrongCount: 0,
              correctCount: 0,
              needsReview: true,
              masteryMetadata: {},
              createdAt: now,
              updatedAt: now,
              ...values,
            };
            masteryRows.push(row);
            return [row];
          }
          if (name === tableName(schema.learningEvents)) {
            events.push(values);
            return [{ id: "event-phase4-mastery-smoke", ...values, createdAt: now }];
          }
          throw new Error(`unexpected insert table: ${name}`);
        },
      }),
    }),
  };
}

async function main(): Promise<void> {
  const routeSource = readSource("src/app/api/concepts/[conceptId]/mastery/route.ts");
  const serviceSource = readSource("src/lib/learning/mastery.ts");
  assert(routeSource.includes("requireSupabaseAuthUserId"), "mastery API must require Supabase Auth user");
  assert(routeSource.includes("self_assessment_updated"), "PATCH must append self_assessment_updated event");
  assert(serviceSource.includes("convertScoreToStatus"), "mastery service must expose score→status conversion");

  const service = await import("../src/lib/learning/mastery");
  assert(service.clampScore(-1) === 0, "clampScore lower bound");
  assert(service.clampScore(2) === 1, "clampScore upper bound");
  assert(service.convertScoreToStatus(0.75) === "known", "0.75 should be known");
  assert(service.convertScoreToStatus(0.4) === "partial", "0.4 should be partial");
  assert(service.convertScoreToStatus(0.39) === "unknown", "0.39 should be unknown");
  assert(service.applySelfAssessment(0.2, "known", false).confidenceScore === 0.8, "new known starts at 0.8");
  assert(service.applySelfAssessment(0.9, "partial", true).confidenceScore === 0.6, "partial caps high score at 0.6");

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
    const { GET, PATCH } = await import("../src/app/api/concepts/[conceptId]/mastery/route");
    const ctx = { params: Promise.resolve({ conceptId: CONCEPT_ID }) };

    const initialRes = await GET(
      makeJsonRequest(`http://rootmap.test/api/concepts/${CONCEPT_ID}/mastery`),
      ctx,
    );
    assert(initialRes.status === 200, `initial GET status ${initialRes.status}`);
    const initial = await initialRes.json();
    assert(initial.status === "unknown", "initial mastery status");
    assert(initial.confidence_score === 0.1, "initial mastery confidence");

    const patchRes = await PATCH(
      makeJsonRequest(`http://rootmap.test/api/concepts/${CONCEPT_ID}/mastery`, {
        status: "known",
        source: "self_assessment",
        session_id: SESSION_ID,
      }),
      ctx,
    );
    assert(patchRes.status === 200, `PATCH status ${patchRes.status}`);
    const patched = await patchRes.json();
    assert(patched.status === "known", "patched mastery status");
    assert(patched.confidence_score === 0.75, "existing unknown known-assessment raises to 0.75");
    assert(fakeDb.state.events.some((event) => event.eventType === "self_assessment_updated"), "self assessment event missing");

    const finalRes = await GET(
      makeJsonRequest(`http://rootmap.test/api/concepts/${CONCEPT_ID}/mastery`),
      ctx,
    );
    const final = await finalRes.json();
    assert(final.status === "known", "final GET status");
    assert(final.confidence_score === 0.75, "final GET confidence");
  } finally {
    globalThis.fetch = originalFetch;
    globalForDb.rootmapDb = undefined;
    globalForDb.rootmapPostgres = undefined;
  }

  console.log("Phase 4 task 04 mastery API smoke passed.");
}

void main().catch((error) => {
  console.error("[phase4:mastery-smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
