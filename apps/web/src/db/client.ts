import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type RootMapDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  rootmapSqlite?: Database.Database;
  rootmapDb?: RootMapDb;
};

function resolveSqliteFilePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/rootmap.db";
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL는 SQLite용 file: URL이어야 합니다.");
  }
  const raw = url.slice("file:".length);
  return path.isAbsolute(raw)
    ? raw
    : path.join(/* turbopackIgnore: true */ process.cwd(), raw);
}

export function getDb(): RootMapDb {
  if (!globalForDb.rootmapDb) {
    const dbPath = resolveSqliteFilePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = ON");
    globalForDb.rootmapSqlite = sqlite;
    globalForDb.rootmapDb = drizzle(sqlite, { schema });
  }
  return globalForDb.rootmapDb;
}

/** 테스트·스모크 스크립트에서 DB 파일을 바꾸기 전에 연결을 닫는다. */
export function resetDbSingleton(): void {
  if (globalForDb.rootmapSqlite) {
    globalForDb.rootmapSqlite.close();
    globalForDb.rootmapSqlite = undefined;
    globalForDb.rootmapDb = undefined;
  }
}
