"use client";

import type { ApiTreeResponse } from "@/lib/tree/bundle-to-api";
import type { ApiNodeDetailResponse } from "@/lib/services/node-detail";
import type {
  ApiLearningNode,
  ApiRecommendationItem,
  NodeType,
  ProgressStatus,
} from "@/types/learning";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const SECTION_ORDER: NodeType[] = [
  "prerequisite",
  "core",
  "supplementary",
  "misconception",
  "quiz",
];

const SECTION_LABEL: Record<NodeType, string> = {
  prerequisite: "선수지식",
  core: "핵심 개념",
  supplementary: "부가 지식",
  misconception: "오개념",
  quiz: "이해 점검",
};

const PROGRESS_LABEL: Record<ProgressStatus, string> = {
  known: "안다",
  partial: "조금 안다",
  unknown: "모른다",
};

export function TreePageClient({ treeId }: { treeId: string }) {
  const router = useRouter();
  const [tree, setTree] = useState<ApiTreeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<
    ApiRecommendationItem[]
  >([]);
  const [recoError, setRecoError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiNodeDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [regenLoading, setRegenLoading] = useState(false);
  const [progressBusy, setProgressBusy] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/trees/${treeId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(
        data?.error?.message ?? "트리를 불러오지 못했습니다.",
      );
      setTree(null);
      return false;
    }
    setTree(data as ApiTreeResponse);
    return true;
  }, [treeId]);

  const loadRecommendations = useCallback(async () => {
    setRecoError(null);
    const res = await fetch(`/api/trees/${treeId}/recommendations`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRecoError(data?.error?.message ?? "추천을 불러오지 못했습니다.");
      setRecommendations([]);
      return;
    }
    setRecommendations(
      (data as { recommended_nodes: ApiRecommendationItem[] })
        .recommended_nodes ?? [],
    );
  }, [treeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadTree();
      if (cancelled || !ok) return;
      await loadRecommendations();
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId, loadTree, loadRecommendations]);

  const recommendSet = useMemo(
    () => new Set(recommendations.map((r) => r.node_id)),
    [recommendations],
  );

  const grouped = useMemo(() => {
    if (!tree) return null;
    const m = new Map<NodeType, ApiLearningNode[]>();
    for (const t of SECTION_ORDER) m.set(t, []);
    for (const n of tree.nodes) {
      m.get(n.type)!.push(n);
    }
    return m;
  }, [tree]);

  const loadDetail = useCallback(
    async (nodeId: string) => {
      setDetailError(null);
      setDetailLoading(true);
      setDetail(null);
      try {
        const res = await fetch(`/api/nodes/${nodeId}/detail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tree_id: treeId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDetailError(
            data?.error?.message ??
              "노드 설명을 불러오지 못했습니다. 다시 시도해 주세요.",
          );
          return;
        }
        setDetail(data as ApiNodeDetailResponse);
        setTree((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === nodeId ? { ...n, has_detail: true } : n,
                ),
              }
            : prev,
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [treeId],
  );

  const onSelectNode = (nodeId: string) => {
    setSelectedId(nodeId);
    void loadDetail(nodeId);
  };

  const onProgressChange = async (
    nodeId: string,
    status: ProgressStatus,
  ) => {
    setProgressBusy(nodeId);
    const prevTree = tree;
    setTree((t) =>
      t
        ? {
            ...t,
            nodes: t.nodes.map((n) =>
              n.id === nodeId ? { ...n, progress: status } : n,
            ),
            progress: t.progress.some((p) => p.node_id === nodeId)
              ? t.progress.map((p) =>
                  p.node_id === nodeId ? { ...p, status } : p,
                )
              : [...t.progress, { node_id: nodeId, status }],
          }
        : t,
    );
    try {
      const res = await fetch(`/api/nodes/${nodeId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setTree(prevTree);
        return;
      }
      await loadRecommendations();
    } finally {
      setProgressBusy(null);
    }
  };

  const onRegenerate = async () => {
    if (!tree) return;
    setRegenLoading(true);
    try {
      const res = await fetch("/api/trees/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: tree.topic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return;
      }
      const newId = (data as ApiTreeResponse).tree_id;
      if (newId) router.push(`/tree/${newId}`);
    } finally {
      setRegenLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <p className="text-zinc-700 dark:text-zinc-300">{loadError}</p>
        <Link
          href="/"
          className="text-emerald-700 underline dark:text-emerald-400"
        >
          처음으로
        </Link>
      </div>
    );
  }

  if (!tree || !grouped) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
      <div className="min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6">
        <header className="space-y-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            RootMap
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {tree.topic}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{tree.summary}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void onRegenerate()}
              disabled={regenLoading}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {regenLoading ? "재생성 중…" : "다시 생성"}
            </button>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              저장됨
            </span>
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 underline dark:text-zinc-400"
            >
              새 주제
            </Link>
          </div>
        </header>

        {recoError ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {recoError}
          </p>
        ) : null}

        {recommendations.length > 0 ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              다음에 볼 만한 노드
            </h2>
            <ul className="mt-2 space-y-2">
              {recommendations.map((r) => (
                <li key={r.node_id}>
                  <button
                    type="button"
                    onClick={() => onSelectNode(r.node_id)}
                    className="text-left text-sm text-emerald-900 underline decoration-emerald-400 decoration-2 underline-offset-2 dark:text-emerald-100"
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="mt-0.5 block text-xs font-normal text-emerald-800/90 dark:text-emerald-200/90">
                      {r.reason}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {SECTION_ORDER.map((type) => {
          const nodes = grouped.get(type) ?? [];
          if (nodes.length === 0) return null;
          return (
            <section key={type} className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {SECTION_LABEL[type]}
              </h2>
              <ul className="space-y-2">
                {nodes.map((n) => {
                  const highlighted = recommendSet.has(n.id);
                  return (
                    <li key={n.id}>
                      <div
                        className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                          highlighted
                            ? "border-emerald-500/70 bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/25"
                            : selectedId === n.id
                              ? "border-zinc-400 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-900"
                              : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectNode(n.id)}
                          className="text-left"
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {n.title}
                          </span>
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                            {n.description}
                          </p>
                          {highlighted ? (
                            <span className="mt-1 inline-block text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              추천
                            </span>
                          ) : null}
                        </button>
                        <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="sr-only">이해 정도</span>
                          <select
                            value={n.progress}
                            disabled={progressBusy === n.id}
                            onChange={(e) =>
                              void onProgressChange(
                                n.id,
                                e.target.value as ProgressStatus,
                              )
                            }
                            onClick={(ev) => ev.stopPropagation()}
                            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900"
                          >
                            {(Object.keys(PROGRESS_LABEL) as ProgressStatus[]).map(
                              (s) => (
                                <option key={s} value={s}>
                                  {PROGRESS_LABEL[s]}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <aside className="lg:w-[420px] lg:shrink-0 lg:border-l lg:border-zinc-200 lg:dark:border-zinc-800">
        <div className="sticky top-0 max-h-[calc(100vh-2rem)] space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
          {!selectedId ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              노드를 선택하면 설명이 여기에 표시됩니다.
            </p>
          ) : detailLoading ? (
            <p className="text-sm text-zinc-500">설명을 불러오는 중…</p>
          ) : detailError ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700 dark:text-red-400">
                {detailError}
              </p>
              <button
                type="button"
                onClick={() => selectedId && void loadDetail(selectedId)}
                className="text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
              >
                다시 시도
              </button>
            </div>
          ) : detail ? (
            <article className="space-y-4 text-sm">
              <header>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {SECTION_LABEL[detail.type]}
                </p>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {detail.title}
                </h2>
              </header>
              {detail.quality_warnings?.length ? (
                <ul className="list-inside list-disc text-xs text-amber-800 dark:text-amber-200">
                  {detail.quality_warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <section>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  왜 중요한가
                </h3>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  {detail.why_it_matters}
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  쉬운 설명
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                  {detail.easy_explanation}
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  비유
                </h3>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  {detail.analogy}
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  예시
                </h3>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  {detail.example}
                </pre>
              </section>
              <section>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  자주 하는 오해
                </h3>
                <ul className="mt-1 list-inside list-disc text-zinc-700 dark:text-zinc-300">
                  {detail.common_misconceptions.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  이해 점검
                </h3>
                <ul className="mt-2 space-y-3">
                  {detail.check_questions.map((q, i) => (
                    <li
                      key={`${q.question}-${i}`}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                    >
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">
                        {q.question}
                      </p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                        {q.answer}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              {detail.next_nodes.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                    다음에 볼 노드 (키)
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {detail.next_nodes.join(", ")}
                  </p>
                </section>
              ) : null}
            </article>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
