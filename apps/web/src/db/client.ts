import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type RootMapDb = ReturnType<typeof drizzle<typeof schema>>;

/** 트랜잭션 콜백 인자 — `RootMapDb`와 동일한 질의 API */
export type RootMapTx = Parameters<
  Parameters<RootMapDb["transaction"]>[0]
>[0];

export type RootMapDbClient = RootMapDb | RootMapTx;

const globalForDb = globalThis as unknown as {
  rootmapPostgres?: postgres.Sql;
  rootmapDb?: RootMapDb;
};

function resolvePostgresConnectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL에 Supabase Postgres 연결 문자열이 필요합니다.");
  }
  if (url.startsWith("file:")) {
    throw new Error("DATABASE_URL는 더 이상 SQLite file: URL을 사용할 수 없습니다. Supabase Postgres URL을 설정하세요.");
  }
  return url;
}

export function getDb(): RootMapDb {
  if (!globalForDb.rootmapDb) {
    const client = postgres(resolvePostgresConnectionString(), {
      max: 5,
      // Supabase Shared Pooler의 transaction 모드에서는 prepared statement를 끈 연결이 안전합니다.
      prepare: false,
    });
    globalForDb.rootmapPostgres = client;
    globalForDb.rootmapDb = drizzle(client, { schema });
  }
  return globalForDb.rootmapDb;
}

/** 테스트·스모크 스크립트에서 DATABASE_URL을 바꾸기 전에 Postgres 연결을 닫는다. */
export async function resetDbSingleton(): Promise<void> {
  if (globalForDb.rootmapPostgres) {
    await globalForDb.rootmapPostgres.end({ timeout: 0 });
    globalForDb.rootmapPostgres = undefined;
    globalForDb.rootmapDb = undefined;
  }
}
