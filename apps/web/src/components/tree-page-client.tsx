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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const MIN_TREE_SCALE = 0.45;
const MAX_TREE_SCALE = 1;
const TREE_SCALE_STEP = 0.05;

function clampTreeScale(value: number): number {
  return Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, value));
}

function formatTreeScale(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type TreeViewMode = "tree" | "sections";

interface TreeBranch {
  key: string;
  node: ApiLearningNode;
  children: TreeBranch[];
  isReference: boolean;
}

const NODE_TYPE_TONE: Record<NodeType, { card: string; badge: string; connector: string }> = {
  prerequisite: {
    card: "border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/25",
    badge: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200",
    connector: "bg-blue-300 dark:bg-blue-800",
  },
  core: {
    card: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/25",
    badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    connector: "bg-emerald-300 dark:bg-emerald-800",
  },
  supplementary: {
    card: "border-violet-200 bg-violet-50/80 dark:border-violet-900 dark:bg-violet-950/25",
    badge: "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
    connector: "bg-violet-300 dark:bg-violet-800",
  },
  misconception: {
    card: "border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/25",
    badge: "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200",
    connector: "bg-rose-300 dark:bg-rose-800",
  },
  quiz: {
    card: "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/25",
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    connector: "bg-amber-300 dark:bg-amber-800",
  },
};

const TYPE_ORDER_INDEX = new Map<NodeType, number>(
  SECTION_ORDER.map((type, index) => [type, index]),
);

function buildTreeBranches(
  nodes: ApiLearningNode[],
  recommendedOrder: string[],
): TreeBranch[] {
  const nodeByKey = new Map(nodes.map((node) => [node.node_key, node]));
  const recommendedIndex = new Map(
    recommendedOrder.map((nodeKey, index) => [nodeKey, index]),
  );

  const compareNodeKeys = (a: string, b: string) => {
    const nodeA = nodeByKey.get(a);
    const nodeB = nodeByKey.get(b);
    const orderA = recommendedIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = recommendedIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const typeA = nodeA ? (TYPE_ORDER_INDEX.get(nodeA.type) ?? 99) : 99;
    const typeB = nodeB ? (TYPE_ORDER_INDEX.get(nodeB.type) ?? 99) : 99;
    if (typeA !== typeB) return typeA - typeB;
    return (nodeA?.title ?? a).localeCompare(nodeB?.title ?? b, "ko");
  };

  const childKeysByKey = new Map<string, Set<string>>();
  for (const node of nodes) {
    childKeysByKey.set(node.node_key, new Set());
  }

  for (const node of nodes) {
    const childSet = childKeysByKey.get(node.node_key)!;
    for (const childKey of node.children) {
      if (nodeByKey.has(childKey) && childKey !== node.node_key) {
        childSet.add(childKey);
      }
    }
  }

  // LLM 응답에서 children이 듬성듬성 비어 있어도 prerequisites 관계로 트리 간선을 보강한다.
  for (const node of nodes) {
    for (const prerequisiteKey of node.prerequisites) {
      if (nodeByKey.has(prerequisiteKey) && prerequisiteKey !== node.node_key) {
        childKeysByKey.get(prerequisiteKey)!.add(node.node_key);
      }
    }
  }

  const normalizedChildKeysByKey = new Map<string, string[]>();
  const incomingCount = new Map(nodes.map((node) => [node.node_key, 0]));
  for (const [nodeKey, childSet] of childKeysByKey) {
    const childKeys = [...childSet].sort(compareNodeKeys);
    normalizedChildKeysByKey.set(nodeKey, childKeys);
    for (const childKey of childKeys) {
      incomingCount.set(childKey, (incomingCount.get(childKey) ?? 0) + 1);
    }
  }

  const sortedNodeKeys = nodes.map((node) => node.node_key).sort(compareNodeKeys);
  const rootKeys = sortedNodeKeys.filter(
    (nodeKey) => (incomingCount.get(nodeKey) ?? 0) === 0,
  );
  if (rootKeys.length === 0 && sortedNodeKeys.length > 0) {
    rootKeys.push(sortedNodeKeys[0]!);
  }

  const expanded = new Set<string>();

  const buildBranch = (nodeKey: string, path: Set<string>): TreeBranch | null => {
    const node = nodeByKey.get(nodeKey);
    if (!node) return null;

    const isReference = expanded.has(nodeKey) || path.has(nodeKey);
    if (isReference) {
      return { key: nodeKey, node, children: [], isReference: true };
    }

    expanded.add(nodeKey);
    const nextPath = new Set(path);
    nextPath.add(nodeKey);

    const children: TreeBranch[] = [];
    for (const childKey of normalizedChildKeysByKey.get(nodeKey) ?? []) {
      const child = buildBranch(childKey, nextPath);
      if (child) children.push(child);
    }

    return { key: nodeKey, node, children, isReference: false };
  };

  const branches: TreeBranch[] = [];
  for (const rootKey of rootKeys) {
    const branch = buildBranch(rootKey, new Set());
    if (branch) branches.push(branch);
  }

  // 순환·공유 참조 때문에 루트에서 펼치지 못한 노드도 놓치지 않고 별도 가지로 표시한다.
  for (const nodeKey of sortedNodeKeys) {
    if (expanded.has(nodeKey)) continue;
    const branch = buildBranch(nodeKey, new Set());
    if (branch) branches.push(branch);
  }

  return branches;
}

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
  const [reuseConcepts, setReuseConcepts] = useState(true);
  const [viewMode, setViewMode] = useState<TreeViewMode>("tree");
  const [treeScale, setTreeScale] = useState(0.65);
  const treeViewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [isTreeDragging, setIsTreeDragging] = useState(false);
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

  const treeBranches = useMemo(() => {
    if (!tree) return [];
    return buildTreeBranches(tree.nodes, tree.recommended_order);
  }, [tree]);

  const scaledTreeWidth = `${100 / treeScale}%`;

  const onTreePointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const viewport = treeViewportRef.current;
    if (!viewport) return;
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, label")) return;

    dragStateRef.current = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(ev.pointerId);
    setIsTreeDragging(true);
  };

  const onTreePointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const viewport = treeViewportRef.current;
    const drag = dragStateRef.current;
    if (!viewport || !drag || drag.pointerId !== ev.pointerId) return;

    const deltaX = ev.clientX - drag.startX;
    const deltaY = ev.clientY - drag.startY;
    ev.preventDefault();
    viewport.scrollLeft = drag.scrollLeft - deltaX;
    viewport.scrollTop = drag.scrollTop - deltaY;
  };

  const endTreeDrag = (ev: React.PointerEvent<HTMLDivElement>) => {
    const viewport = treeViewportRef.current;
    const drag = dragStateRef.current;
    if (!viewport || !drag || drag.pointerId !== ev.pointerId) return;

    if (viewport.hasPointerCapture(ev.pointerId)) {
      viewport.releasePointerCapture(ev.pointerId);
    }
    dragStateRef.current = null;
    setIsTreeDragging(false);
  };

  const centerTreeViewport = () => {
    const viewport = treeViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = 0;
  };

  useEffect(() => {
    if (viewMode !== "tree") return;
    const frame = window.requestAnimationFrame(centerTreeViewport);
    return () => window.cancelAnimationFrame(frame);
  }, [treeScale, treeBranches.length, viewMode]);

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
        body: JSON.stringify({ topic: tree.topic, reuse_concepts: reuseConcepts }),
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
  const renderTreeBranch = (branch: TreeBranch, pathKey: string) => {
    const n = branch.node;
    const highlighted = recommendSet.has(n.id);
    const tone = NODE_TYPE_TONE[n.type];
    const selected = selectedId === n.id;

    return (
      <li key={pathKey} className="flex flex-col items-center">
        <div
          className={`w-72 rounded-2xl border px-4 py-3 shadow-sm transition ${tone.card} ${
            highlighted
              ? "ring-2 ring-emerald-400 dark:ring-emerald-500"
              : selected
                ? "ring-2 ring-zinc-400 dark:ring-zinc-500"
                : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onSelectNode(n.id)}
            className="block w-full text-left"
          >
            <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
              <span className={`rounded-full px-2 py-0.5 ${tone.badge}`}>
                {SECTION_LABEL[n.type]}
              </span>
              {n.is_reused_concept === true ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200">
                  이전에 본 개념
                </span>
              ) : n.is_reused_concept === false ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                  새 개념
                </span>
              ) : null}
              {highlighted ? (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-white">
                  추천
                </span>
              ) : null}
              {branch.isReference ? (
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  참조
                </span>
              ) : null}
            </span>
            <span className="mt-2 block font-semibold leading-snug text-zinc-950 dark:text-zinc-50">
              {n.title}
            </span>
            <span className="mt-1 line-clamp-3 block text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {n.description}
            </span>
            {n.concept_tree_count != null && n.concept_tree_count > 1 ? (
              <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">
                다른 학습 주제에서도 쓰임 · 총 {n.concept_tree_count}개 트리
              </span>
            ) : null}
          </button>
          <label className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <span>이해 정도</span>
            <select
              value={n.progress}
              disabled={progressBusy === n.id}
              onChange={(e) =>
                void onProgressChange(n.id, e.target.value as ProgressStatus)
              }
              onClick={(ev) => ev.stopPropagation()}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
            >
              {(Object.keys(PROGRESS_LABEL) as ProgressStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PROGRESS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {branch.children.length > 0 ? (
          <>
            <div className={`h-6 w-px ${tone.connector}`} />
            <ul
              className={`flex items-start justify-center gap-4 pt-6 ${
                branch.children.length > 1
                  ? "border-t border-zinc-300 dark:border-zinc-700"
                  : ""
              }`}
            >
              {branch.children.map((child, index) =>
                renderTreeBranch(child, `${pathKey}-${child.key}-${index}`),
              )}
            </ul>
          </>
        ) : null}
      </li>
    );
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
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={reuseConcepts}
                onChange={(e) => setReuseConcepts(e.target.checked)}
                className="rounded border-zinc-400"
              />
              개념 재사용
            </label>
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
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              보기 방식
            </span>
            {(["tree", "sections"] as TreeViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === mode
                    ? "border-emerald-500 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500 dark:text-zinc-950"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {mode === "tree" ? "Tree 보기" : "섹션 보기"}
              </button>
            ))}
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

        {viewMode === "tree" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  학습 Tree
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  선수관계와 children 연결을 따라 위에서 아래로 펼친 mindmap형 트리입니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {SECTION_ORDER.map((type) => (
                  <span
                    key={type}
                    className={`rounded-full px-2 py-0.5 ${NODE_TYPE_TONE[type].badge}`}
                  >
                    {SECTION_LABEL[type]}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/70">
                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                  Zoom
                </span>
                <button
                  type="button"
                  onClick={() => setTreeScale(0.55)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  한눈에
                </button>
                <button
                  type="button"
                  onClick={() => setTreeScale((s) => clampTreeScale(s - TREE_SCALE_STEP))}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  aria-label="트리 축소"
                >
                  −
                </button>
                <input
                  type="range"
                  min={MIN_TREE_SCALE}
                  max={MAX_TREE_SCALE}
                  step={TREE_SCALE_STEP}
                  value={treeScale}
                  onChange={(e) => setTreeScale(Number(e.target.value))}
                  className="w-28 accent-emerald-600"
                  aria-label="트리 확대/축소"
                />
                <button
                  type="button"
                  onClick={() => setTreeScale((s) => clampTreeScale(s + TREE_SCALE_STEP))}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  aria-label="트리 확대"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setTreeScale(1)}
                  className="rounded-lg px-2 py-1 font-medium text-zinc-600 underline underline-offset-2 dark:text-zinc-300"
                >
                  원본
                </button>
                <button
                  type="button"
                  onClick={centerTreeViewport}
                  className="rounded-lg px-2 py-1 font-medium text-zinc-600 underline underline-offset-2 dark:text-zinc-300"
                >
                  중앙
                </button>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatTreeScale(treeScale)}
                </span>
              </div>
            </div>
            <div
              ref={treeViewportRef}
              onPointerDown={onTreePointerDown}
              onPointerMove={onTreePointerMove}
              onPointerUp={endTreeDrag}
              onPointerCancel={endTreeDrag}
              className={`max-h-[72vh] touch-none overflow-auto rounded-xl border border-zinc-100 bg-zinc-50/40 pb-4 dark:border-zinc-900 dark:bg-zinc-950/30 ${
                isTreeDragging ? "cursor-grabbing select-none" : "cursor-grab"
              }`}
            >
              <div
                className="inline-flex min-w-full justify-center px-8 py-8 transition-transform"
                style={{
                  transform: `scale(${treeScale})`,
                  transformOrigin: "top center",
                  width: scaledTreeWidth,
                  minHeight: scaledTreeWidth,
                }}
              >
                <div className="flex flex-col items-center">
                  <div className="max-w-xl rounded-3xl border border-emerald-300 bg-emerald-600 px-6 py-4 text-center text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      Main Topic
                    </p>
                    <h2 className="text-xl font-bold leading-tight">{tree.topic}</h2>
                    {tree.summary ? (
                      <p className="mt-1 text-sm opacity-90">{tree.summary}</p>
                    ) : null}
                  </div>
                  {treeBranches.length > 0 ? (
                    <>
                      <div className="h-8 w-px bg-emerald-300 dark:bg-emerald-700" />
                      <ul
                        className={`flex items-start justify-center gap-5 pt-6 ${
                          treeBranches.length > 1
                            ? "border-t border-zinc-300 dark:border-zinc-700"
                            : ""
                        }`}
                      >
                        {treeBranches.map((branch, index) =>
                          renderTreeBranch(branch, `${branch.key}-${index}`),
                        )}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-6 text-sm text-zinc-500">표시할 노드가 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : (
          SECTION_ORDER.map((type) => {
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
                            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-zinc-900 dark:text-zinc-50">
                              {n.title}
                              {n.is_reused_concept === true ? (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                                  이전에 본 개념
                                </span>
                              ) : n.is_reused_concept === false ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                  새 개념
                                </span>
                              ) : null}
                            </span>
                            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                              {n.description}
                            </p>
                            {n.concept_tree_count != null &&
                            n.concept_tree_count > 1 ? (
                              <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                                다른 학습 주제에서도 쓰인 개념 (총 {n.concept_tree_count}개 트리)
                              </span>
                            ) : null}
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
          })
        )}
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
              {detail.topic_context_line ? (
                <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {detail.topic_context_line}
                </p>
              ) : null}
              {detail.from_concept_store ? (
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Concept 저장소의 설명을 바탕으로 보여 줍니다.
                </p>
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
                  {detail.analogy || "—"}
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
                {detail.check_questions.length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">항목 없음</p>
                ) : (
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
                )}
              </section>
              {detail.prerequisite_concepts &&
              detail.prerequisite_concepts.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                    선수 개념 (저장소)
                  </h3>
                  <ul className="mt-1 list-inside list-disc text-zinc-700 dark:text-zinc-300">
                    {detail.prerequisite_concepts.map((p) => (
                      <li key={p.id}>{p.title}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {detail.related_concepts && detail.related_concepts.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                    관련 개념
                  </h3>
                  <ul className="mt-1 list-inside list-disc text-zinc-700 dark:text-zinc-300">
                    {detail.related_concepts.map((p) => (
                      <li key={p.id}>{p.title}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {detail.used_in_other_trees &&
              detail.used_in_other_trees.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                    다른 학습 주제에서의 사용
                  </h3>
                  <ul className="mt-1 space-y-1 text-zinc-700 dark:text-zinc-300">
                    {detail.used_in_other_trees.map((t) => (
                      <li key={t.tree_id} className="text-xs">
                        <span className="font-medium">{t.topic}</span>
                        <span className="text-zinc-500">
                          {" "}
                          — {t.role_in_tree}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
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
