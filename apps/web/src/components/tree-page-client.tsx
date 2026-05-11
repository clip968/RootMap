"use client";

/**
 * `/tree/[treeId]` 페이지의 클라이언트 본문.
 *
 * 데이터 흐름 요약:
 * - 마운트 시 `GET /api/trees/:id`로 트리 본문, 이어서 `GET .../recommendations`로 추천 목록
 * - 노드 클릭 시 `POST /api/nodes/:nodeId/detail`로 확장 설명(모달)
 * - 이해 정도 변경 시 `PATCH /api/nodes/:id/progress` 후 추천 재조회
 * - "다시 생성"은 홈과 동일하게 `POST /api/trees/generate` 후 새 `tree_id`로 라우팅
 *
 * UI:
 * - Tree 보기: API `children` 링크로 재귀 가지 + 순환/공유 시 "참조" 배지
 * - 섹션 보기: 노드 타입별(선수지식/핵심/…) 리스트
 * - 트리 뷰포트: 휠로 zoom, 빈 영역 드래그로 패닝
 */

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

/** 섹션·Tree 정렬에 쓰는 노드 타입 순서(화면 표시 순 고정) */
const SECTION_ORDER: NodeType[] = [
  "prerequisite",
  "core",
  "supplementary",
  "misconception",
  "quiz",
];

/** 노드 타입 → 섹션/카드 제목에 쓰는 짧은 한글 */
const SECTION_LABEL: Record<NodeType, string> = {
  prerequisite: "선수지식",
  core: "핵심 개념",
  supplementary: "부가 지식",
  misconception: "오개념",
  quiz: "이해 점검",
};

/** 진행 상태 Enum → `<select>` 옵션 라벨 */
const PROGRESS_LABEL: Record<ProgressStatus, string> = {
  known: "안다",
  partial: "조금 안다",
  unknown: "모른다",
};

/** 트리 캔버스 zoom 한계(너무 작게/크게 못 하게) */
const MIN_TREE_SCALE = 0.2;
const MAX_TREE_SCALE = 1;
const TREE_SCALE_STEP = 0.05;

function clampTreeScale(value: number): number {
  return Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, value));
}

function formatTreeScale(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type TreeViewMode = "tree" | "sections";

/** 트리 "다시 생성" 배너에서 경과 시간만큼 로테이션하는 안내 문구(start-topic-form과 동일 취지) */
function generationStageMessage(elapsedSeconds: number): string {
  if (elapsedSeconds < 5) return "주제를 분석하고 학습 목표를 정리하는 중입니다.";
  if (elapsedSeconds < 20) return "학습 경로와 선수지식 Tree를 생성하는 중입니다.";
  if (elapsedSeconds < 40) return "Concept 후보와 관계를 연결하는 중입니다.";
  return "생성 결과를 검증하고 Tree로 저장하는 중입니다.";
}

/**
 * 트리 UI 한 줄(재귀 `renderTreeBranch`가 이 구조를 소비).
 * - `isReference`: 같은 노드가 이미 위쪽에서 펼쳐졌거나 순환 경로상이면 자식 없이 링크만 표시
 */
interface TreeBranch {
  key: string;
  node: ApiLearningNode;
  children: TreeBranch[];
  isReference: boolean;
}

/** 타입별 Tailwind 팔레트 — 카드 테두리/배지/세로 연결선 */
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

/** `compareNodeKeys`에서 recommended_order 동률일 때 타입 섹션 순으로 재정렬 */
const TYPE_ORDER_INDEX = new Map<NodeType, number>(
  SECTION_ORDER.map((type, index) => [type, index]),
);

/**
 * 플랫 노드 배열 → 루트에서 아래로만 펼치는 가지 구조.
 *
 * - 간선: API의 `node.children` 만 사용(LLM이 준 “배우는 순서” 방향). `prerequisites` 역간선은 만들지 않음.
 * - 루트: 부모에서 가리키지 않는 노드들.
 * - 사이클·다중 부모: `expanded`와 `path`로 이미 방문한 노드는 참조 노드로 잘라 무한 재귀 방지.
 */
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

  // children은 부모 목표/개념을 이해하기 위한 직접 선수지식으로 해석한다.
  // prerequisites를 뒤집어 선수지식 -> 의존 개념 간선으로 보강하지 않는다.

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

/** `tree/[treeId]/page.tsx`에서 넘기는 URL 세그먼트 */
export function TreePageClient({ treeId }: { treeId: string }) {
  const router = useRouter();
  /** 서버에서 복원한 트리 전체(ApiTreeResponse). 없으면 로딩/에러 분기 */
  const [tree, setTree] = useState<ApiTreeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<
    ApiRecommendationItem[]
  >([]);
  const [recoError, setRecoError] = useState<string | null>(null);

  /** 선택한 학습 노드(DB uuid) — 상세 모달·하이라이트 */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiNodeDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /** 같은 주제로 새 트리를 만들 때(현재 페이지에 머무르지 않고 새 id로 이동) */
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenElapsedSeconds, setRegenElapsedSeconds] = useState(0);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [reuseConcepts, setReuseConcepts] = useState(true);
  const [viewMode, setViewMode] = useState<TreeViewMode>("tree");
  /** 트리 캔버스 CSS transform scale (0.2~1) */
  const [treeScale, setTreeScale] = useState(0.55);
  /** 스크롤 가능한 트리 컨테이너 — 패닝·휠 zoom 리스너 부착 대상 */
  const treeViewportRef = useRef<HTMLDivElement | null>(null);
  /** 포인터 캡처 드래그 중 시작 스크롤 위치 저장 */
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [isTreeDragging, setIsTreeDragging] = useState(false);
  /** PATCH progress 중인 노드 id — 해당 행만 셀렉트 비활성 */
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

  /** `treeId` 변경 시 트리→추천 순으로 로드(언마운트 시 in-flight 무시) */
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

  /** 추천 목록에 든 노드 id — 카드 테두리·배지 하이라이트용 Set */
  const recommendSet = useMemo(
    () => new Set(recommendations.map((r) => r.node_id)),
    [recommendations],
  );

  /** 섹션 보기: 타입별로 노드 그룹핑 */
  const grouped = useMemo(() => {
    if (!tree) return null;
    const m = new Map<NodeType, ApiLearningNode[]>();
    for (const t of SECTION_ORDER) m.set(t, []);
    for (const n of tree.nodes) {
      m.get(n.type)!.push(n);
    }
    return m;
  }, [tree]);

  /** Tree 보기: 순환 안전한 재귀 가지 */
  const treeBranches = useMemo(() => {
    if (!tree) return [];
    return buildTreeBranches(tree.nodes, tree.recommended_order);
  }, [tree]);

  /** scale이 작을수록 내부 박스 너비/최소 높이를 크게 잡아 스크롤 영역 확보 */
  const scaledTreeWidth = `${100 / treeScale}%`;
  const scaledTreeMinHeight = `max(100%, ${100 / treeScale}%)`;

  /**
   * 트리 패닝: 버튼·링크가 아닌 빈 배경에서만 드래그 시작.
   * `setPointerCapture`로 커서가 뷰포트 밖으로 나가도 move 이벤트 수신.
   */
  const onTreePointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const viewport = treeViewportRef.current;
    if (!viewport) return;
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, label")) return;

    ev.preventDefault();
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


  /** 트리 구조 변경·모드 전환 후 첫 프레임에 스크롤 위치를 중앙 상단으로 */
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
  }, [treeBranches.length, viewMode]);

  /** 트리 뷰포트에서 휠 = 페이지 스크롤이 아니라 확대/축소(캡처 단계에서 가로챔) */
  useEffect(() => {
    if (viewMode !== "tree") return;
    const viewport = treeViewportRef.current;
    if (!viewport) return;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const primaryDelta =
        Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
      if (primaryDelta === 0) return;

      const direction = primaryDelta > 0 ? -1 : 1;
      setTreeScale((scale) =>
        clampTreeScale(scale + direction * TREE_SCALE_STEP),
      );
    };

    viewport.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });
    return () => viewport.removeEventListener("wheel", onWheel, { capture: true });
  }, [viewMode, tree?.tree_id]);

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

  const closeDetailModal = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeDetailModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetailModal, selectedId]);

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

  useEffect(() => {
    if (!regenLoading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setRegenElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [regenLoading]);

  const onRegenerate = async () => {
    if (!tree) return;
    setRegenLoading(true);
    setRegenElapsedSeconds(0);
    setRegenError(null);
    try {
      const res = await fetch("/api/trees/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: tree.topic, reuse_concepts: reuseConcepts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRegenError(
          data?.error?.message ??
            "트리를 다시 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
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
              className={`flex items-start justify-start gap-4 pt-6 ${
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
    <div className="flex flex-1 flex-col gap-6">
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
                disabled={regenLoading}
                className="rounded border-zinc-400 disabled:opacity-60"
              />
              개념 재사용
            </label>
            <button
              type="button"
              onClick={() => void onRegenerate()}
              disabled={regenLoading}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {regenLoading ? `재생성 중 · ${regenElapsedSeconds}초` : "다시 생성"}
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
          {regenLoading ? (
            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-medium">
                재생성 중 · {regenElapsedSeconds}초 경과
              </p>
              <p className="mt-1 text-xs">
                {generationStageMessage(regenElapsedSeconds)}
              </p>
              {reuseConcepts ? (
                <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  저장된 Concept과 비교해 중복을 줄이는 중이라 조금 더 걸릴 수 있습니다.
                </p>
              ) : null}
            </div>
          ) : null}
          {regenError ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {regenError} 다시 생성 버튼으로 재시도할 수 있습니다.
            </p>
          ) : null}
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
                  마우스 휠로 확대/축소하고, 빈 공간을 좌클릭 드래그해 상하좌우로 이동합니다.
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
                  onClick={() => setTreeScale(0.35)}
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
              onLostPointerCapture={endTreeDrag}
              className={`h-[78vh] touch-none overflow-scroll overscroll-contain rounded-xl border border-zinc-100 bg-zinc-50/40 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-zinc-900 dark:bg-zinc-950/30 ${
                isTreeDragging ? "cursor-grabbing select-none" : "cursor-grab"
              }`}
            >
              <div
                className="inline-flex min-h-full min-w-full justify-start px-8 py-8 transition-transform"
                style={{
                  transform: `scale(${treeScale})`,
                  transformOrigin: "top left",
                  width: scaledTreeWidth,
                  minHeight: scaledTreeMinHeight,
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
                        className={`flex items-start justify-start gap-5 pt-6 ${
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

      {selectedId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) closeDetailModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="node-detail-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-zinc-200 bg-amber-50 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-4 border-b border-amber-200 bg-amber-100/70 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Node Note
                </p>
                <h2
                  id="node-detail-title"
                  className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
                >
                  {detail?.title ?? "노드 설명"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                aria-label="노트 닫기"
              >
                닫기
              </button>
            </div>
            <div className="max-h-[calc(92vh-5rem)] overflow-y-auto px-5 py-5 sm:px-7">
              {detailLoading ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  설명을 불러오는 중…
                </p>
              ) : detailError ? (
                <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                  <p className="text-sm text-red-700 dark:text-red-300">
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
                <article className="space-y-5 text-sm leading-relaxed">
                  <header className="rounded-2xl border border-amber-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {SECTION_LABEL[detail.type]}
                    </p>
                    <h3 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                      {detail.title}
                    </h3>
                  </header>
                  {detail.quality_warnings?.length ? (
                    <ul className="list-inside list-disc rounded-xl bg-amber-100 px-4 py-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      {detail.quality_warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.topic_context_line ? (
                    <p className="rounded-xl bg-zinc-100 px-4 py-3 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {detail.topic_context_line}
                    </p>
                  ) : null}
                  {detail.from_concept_store ? (
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      Concept 저장소의 설명을 바탕으로 보여 줍니다.
                    </p>
                  ) : null}
                  <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                      왜 중요한가
                    </h3>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {detail.why_it_matters}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                      쉬운 설명
                    </h3>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      {detail.easy_explanation}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                      비유
                    </h3>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {detail.analogy || "—"}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                      예시
                    </h3>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {detail.example}
                    </pre>
                  </section>
                  <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                      자주 하는 오해
                    </h3>
                    <ul className="mt-1 list-inside list-disc text-zinc-700 dark:text-zinc-300">
                      {detail.common_misconceptions.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </section>
                  <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
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
                            className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
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
                    <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
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
                    <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
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
                    <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
                      <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                        다른 학습 주제에서의 사용
                      </h3>
                      <ul className="mt-1 space-y-1 text-zinc-700 dark:text-zinc-300">
                        {detail.used_in_other_trees.map((t) => (
                          <li key={t.tree_id} className="text-xs">
                            <span className="font-medium">{t.topic}</span>
                            <span className="text-zinc-500"> — {t.role_in_tree}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {detail.next_nodes.length > 0 ? (
                    <section className="rounded-2xl bg-white/80 p-4 dark:bg-zinc-900/70">
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
          </section>
        </div>
      ) : null}
    </div>
  );
}
