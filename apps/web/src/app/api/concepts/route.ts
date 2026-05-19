import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { listConcepts } from "@/lib/repository/concept-repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const domain = searchParams.get("domain") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    100,
    Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 40 : 40),
  );

  const db = getDb();
  const rows = await listConcepts(db, { search: q, domain, limit });
  return NextResponse.json({
    concepts: rows.map((r) => ({
      id: r.id,
      title: r.title,
      aliases: r.aliases,
      domain: r.domain,
      short_description: r.shortDescription,
    })),
  });
}
