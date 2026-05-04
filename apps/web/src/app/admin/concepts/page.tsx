import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import {
  getConceptById,
  listConceptDomains,
  listConceptMergeCandidates,
  listConcepts,
  listEdgesForConcept,
  listTreesUsingConcept,
} from "@/lib/repository/concept-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function isAdminRouteEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ROOTMAP_ADMIN_ENABLED === "true"
  );
}

function short(value: string | null | undefined, fallback = "-"): string {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "pending"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
      : status === "approved" || status === "merged"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
        : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export default async function AdminConceptsPage({ searchParams }: PageProps) {
  if (!isAdminRouteEnabled()) notFound();

  const params = await searchParams;
  const q = firstParam(params.q).trim();
  const domain = firstParam(params.domain).trim();
  const selectedConceptId = firstParam(params.concept_id).trim();
  const mergeStatus = firstParam(params.merge_status).trim() || "pending";

  const db = getDb();
  const domains = listConceptDomains(db);
  const concepts = listConcepts(db, {
    search: q || undefined,
    domain: domain || undefined,
    limit: 80,
  });
  const selected = selectedConceptId
    ? getConceptById(db, selectedConceptId)
    : (concepts[0] ?? null);
  const selectedEdges = selected ? listEdgesForConcept(db, selected.id) : [];
  const selectedTrees = selected ? listTreesUsingConcept(db, selected.id) : [];
  const mergeCandidates = listConceptMergeCandidates(db, {
    status: mergeStatus === "all" ? undefined : mergeStatus,
    limit: 80,
  });

  const queryBase = new URLSearchParams();
  if (q) queryBase.set("q", q);
  if (domain) queryBase.set("domain", domain);
  if (mergeStatus) queryBase.set("merge_status", mergeStatus);

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                RootMap Admin · Phase 2
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Concept Store 점검</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                로컬 개발 또는 ROOTMAP_ADMIN_ENABLED=true 환경에서만 사용하는 최소 관리자 화면입니다.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              홈으로
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Concept 목록</h2>
                <p className="text-sm text-zinc-500">검색·domain 필터로 중복 여부를 빠르게 확인합니다.</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {concepts.length}개 표시
              </span>
            </div>

            <form className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                name="q"
                defaultValue={q}
                placeholder="title, normalized title, alias 검색"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <select
                name="domain"
                defaultValue={domain}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">모든 domain</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600">
                조회
              </button>
            </form>

            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2">Aliases</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {concepts.map((c) => {
                    const hrefParams = new URLSearchParams(queryBase);
                    hrefParams.set("concept_id", c.id);
                    const active = selected?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        className={active ? "bg-emerald-50/70 dark:bg-emerald-950/30" : ""}
                      >
                        <td className="px-3 py-2 align-top">
                          <Link
                            href={`/admin/concepts?${hrefParams.toString()}`}
                            className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                          >
                            {c.title}
                          </Link>
                          <div className="mt-1 font-mono text-xs text-zinc-500">{c.slug}</div>
                        </td>
                        <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-300">
                          {c.domain ?? "-"}
                        </td>
                        <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-300">
                          {c.aliases.slice(0, 4).join(", ") || "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {concepts.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-zinc-500" colSpan={3}>
                        조건에 맞는 Concept이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-semibold">Concept 상세</h2>
              {selected ? (
                <div className="mt-4 space-y-4 text-sm">
                  <div>
                    <h3 className="text-xl font-semibold">{selected.title}</h3>
                    <p className="mt-1 text-zinc-500">{selected.domain ?? "domain 미지정"}</p>
                    <p className="mt-3 text-zinc-700 dark:text-zinc-300">
                      {short(selected.shortDescription ?? selected.explanation, "설명이 없습니다.")}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Aliases</p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                      {selected.aliases.join(", ") || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">연결 Edge</p>
                    <ul className="mt-2 space-y-2">
                      {selectedEdges.map((e) => {
                        const outgoing = e.fromConceptId === selected.id;
                        const otherId = outgoing ? e.toConceptId : e.fromConceptId;
                        const other = getConceptById(db, otherId);
                        return (
                          <li key={e.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-900">
                                {outgoing ? "outgoing" : "incoming"}
                              </span>
                              <span className="font-medium">{e.relationType}</span>
                              <span className="text-zinc-500">→</span>
                              <span>{other?.title ?? otherId}</span>
                            </div>
                            {e.reason ? <p className="mt-1 text-xs text-zinc-500">{e.reason}</p> : null}
                          </li>
                        );
                      })}
                      {selectedEdges.length === 0 ? <li className="text-zinc-500">연결된 Edge가 없습니다.</li> : null}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">사용된 트리</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
                      {selectedTrees.map((t) => (
                        <li key={`${t.treeId}-${t.roleInTree}`}>
                          <Link className="hover:underline" href={`/tree/${t.treeId}`}>
                            {t.topic}
                          </Link>{" "}
                          <span className="text-xs text-zinc-500">({t.roleInTree})</span>
                        </li>
                      ))}
                      {selectedTrees.length === 0 ? <li>아직 연결된 트리가 없습니다.</li> : null}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">선택된 Concept이 없습니다.</p>
              )}
            </section>
          </aside>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">병합 후보</h2>
              <p className="text-sm text-zinc-500">자동 병합하지 않은 유사 Concept 후보를 상태별로 확인합니다.</p>
            </div>
            <form className="flex gap-2">
              {q ? <input type="hidden" name="q" value={q} /> : null}
              {domain ? <input type="hidden" name="domain" value={domain} /> : null}
              {selected?.id ? <input type="hidden" name="concept_id" value={selected.id} /> : null}
              <select
                name="merge_status"
                defaultValue={mergeStatus}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="merged">merged</option>
                <option value="all">all</option>
              </select>
              <button className="rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
                필터
              </button>
            </form>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {mergeCandidates.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 align-top"><StatusBadge status={m.status} /></td>
                    <td className="px-3 py-2 align-top font-medium">{m.sourceConcept?.title ?? m.sourceConceptId}</td>
                    <td className="px-3 py-2 align-top font-medium">{m.targetConcept?.title ?? m.targetConceptId}</td>
                    <td className="px-3 py-2 align-top">{m.similarityScore.toFixed(2)}</td>
                    <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-300">{short(m.reason)}</td>
                  </tr>
                ))}
                {mergeCandidates.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-zinc-500" colSpan={5}>
                      조건에 맞는 병합 후보가 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
