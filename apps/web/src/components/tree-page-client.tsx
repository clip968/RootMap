"use client";

/**
 * `/tree/[treeId]` 페이지의 클라이언트 본문.
 *
 * learning-tree 프로젝트와 같은 흐름으로 렌더링한다:
 * - 좌측 패널: 주제, 추천, 학습 경로, 노드 목록
 * - 우측 맵: ReactFlow 기반 지식 맵 + 포커스/타입 필터
 * - 노드 클릭: 선택 상태를 바꾸고 상세 모달을 연다
 */

import type { ApiTreeResponse } from "@/lib/tree/bundle-to-api";
import type { ApiNodeDetailResponse } from "@/lib/services/node-detail";
import type {
  ApiLearningNode,
  ApiRecommendationItem,
  DocumentSourceType,
  NodeType,
  ProgressStatus,
} from "@/types/learning";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  GitBranch,
  Route,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
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

const NODE_KIND_CONFIG: Record<
  NodeType,
  { className: string; icon: LucideIcon; minimapColor: string }
> = {
  prerequisite: {
    className: "kind-prerequisite",
    icon: GitBranch,
    minimapColor: "#047857",
  },
  core: {
    className: "kind-core",
    icon: BookOpen,
    minimapColor: "#047857",
  },
  supplementary: {
    className: "kind-supplementary",
    icon: Route,
    minimapColor: "#047857",
  },
  misconception: {
    className: "kind-misconception",
    icon: AlertTriangle,
    minimapColor: "#047857",
  },
  quiz: {
    className: "kind-quiz",
    icon: CircleHelp,
    minimapColor: "#047857",
  },
};

const FOCUS_OPTIONS = [
  { id: "all", label: "전체" },
  { id: "near", label: "선택 주변" },
  { id: "next", label: "다음 단계" },
] as const;

type FocusMode = (typeof FOCUS_OPTIONS)[number]["id"];
type DocumentEvidenceItem = NonNullable<
  ApiLearningNode["document_context"]
>["evidence"][number];

interface RootMapNodeData {
  [key: string]: unknown;
  node: ApiLearningNode;
  selected: boolean;
  related: boolean;
  recommended: boolean;
  progressBusy: boolean;
  onProgressChange: (nodeId: string, status: ProgressStatus) => void;
}

interface NodeRelation {
  node: ApiLearningNode;
  direction: "parent" | "child";
}

export function documentSourceTypeLabel(sourceType: DocumentSourceType): string {
  if (sourceType === "explicit") return "문서에 직접 등장";
  if (sourceType === "inferred") return "문서 이해를 위해 추론";
  return "AI가 생성한 설명/점검";
}

export function formatDocumentEvidenceLocation(
  evidence: Pick<DocumentEvidenceItem, "page_start" | "page_end" | "section_title">,
): string {
  const page =
    evidence.page_start == null
      ? ""
      : evidence.page_end != null && evidence.page_end !== evidence.page_start
        ? `p.${evidence.page_start}-${evidence.page_end}`
        : `p.${evidence.page_start}`;
  if (evidence.section_title && page) return `${evidence.section_title}, ${page}`;
  return evidence.section_title || page || "문서 위치 미상";
}

function documentSourceTypeTone(sourceType: DocumentSourceType): string {
  if (sourceType === "explicit") return "bg-zinc-950 text-white";
  if (sourceType === "inferred") return "bg-zinc-200 text-zinc-950";
  return "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-300";
}

function generationStageMessage(elapsedSeconds: number): string {
  if (elapsedSeconds < 5) return "주제를 분석하고 학습 목표를 정리하는 중입니다.";
  if (elapsedSeconds < 20) return "학습 경로와 선수지식 Tree를 생성하는 중입니다.";
  if (elapsedSeconds < 40) return "Concept 후보와 관계를 연결하는 중입니다.";
  return "생성 결과를 검증하고 Tree로 저장하는 중입니다.";
}

function statusIcon(status: ProgressStatus) {
  if (status === "known") return <CheckCircle2 size={16} />;
  if (status === "partial") return <CircleHelp size={16} />;
  return <AlertTriangle size={16} />;
}

function compareNodeKeys(
  a: ApiLearningNode,
  b: ApiLearningNode,
  recommendedIndex: Map<string, number>,
): number {
  const aIndex = recommendedIndex.get(a.node_key) ?? Number.MAX_SAFE_INTEGER;
  const bIndex = recommendedIndex.get(b.node_key) ?? Number.MAX_SAFE_INTEGER;
  if (aIndex !== bIndex) return aIndex - bIndex;
  return SECTION_ORDER.indexOf(a.type) - SECTION_ORDER.indexOf(b.type);
}

function orderedTreeNodes(tree: ApiTreeResponse): ApiLearningNode[] {
  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  const seenIds = new Set<string>();
  const ordered: ApiLearningNode[] = [];

  for (const nodeKey of tree.recommended_order) {
    const node = nodeByKey.get(nodeKey);
    if (!node || seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    ordered.push(node);
  }

  for (const node of tree.nodes) {
    if (seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    ordered.push(node);
  }

  return ordered;
}

function initialSelectedId(tree: ApiTreeResponse): string | null {
  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  for (const nodeKey of tree.recommended_order) {
    const node = nodeByKey.get(nodeKey);
    if (node) return node.id;
  }
  return tree.nodes[0]?.id ?? null;
}

function relatedNodeIds(tree: ApiTreeResponse, selectedId: string | null): Set<string> {
  const related = new Set<string>();
  if (!selectedId) return related;

  const selected = tree.nodes.find((node) => node.id === selectedId);
  if (!selected) return related;

  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  for (const childKey of selected.children) {
    const child = nodeByKey.get(childKey);
    if (child) related.add(child.id);
  }

  for (const node of tree.nodes) {
    if (node.children.includes(selected.node_key)) related.add(node.id);
  }

  return related;
}

function visibleNodeIds(
  tree: ApiTreeResponse,
  selectedId: string | null,
  focusMode: FocusMode,
  enabledTypes: NodeType[],
  recommendedSet: Set<string>,
): Set<string> {
  const typeSet = new Set(enabledTypes);
  const allowedByType = tree.nodes.filter((node) => typeSet.has(node.type));
  if (focusMode === "all" || !selectedId) {
    return new Set(allowedByType.map((node) => node.id));
  }

  if (focusMode === "next") {
    return new Set(
      allowedByType
        .filter((node) => node.id === selectedId || recommendedSet.has(node.id))
        .map((node) => node.id),
    );
  }

  const related = relatedNodeIds(tree, selectedId);
  related.add(selectedId);
  return new Set(
    allowedByType.filter((node) => related.has(node.id)).map((node) => node.id),
  );
}

function nodeDepths(tree: ApiTreeResponse): Map<string, number> {
  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  const parentCount = new Map(tree.nodes.map((node) => [node.node_key, 0]));
  for (const node of tree.nodes) {
    for (const childKey of node.children) {
      if (parentCount.has(childKey)) {
        parentCount.set(childKey, (parentCount.get(childKey) ?? 0) + 1);
      }
    }
  }

  const roots = tree.nodes.filter((node) => (parentCount.get(node.node_key) ?? 0) === 0);
  const queue = roots.length > 0 ? roots : tree.nodes.slice(0, 1);
  const depthByKey = new Map<string, number>();
  for (const root of queue) depthByKey.set(root.node_key, 0);

  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor++];
    const currentDepth = depthByKey.get(current.node_key) ?? 0;
    for (const childKey of current.children) {
      const child = nodeByKey.get(childKey);
      if (!child) continue;
      const nextDepth = currentDepth + 1;
      if ((depthByKey.get(childKey) ?? -1) < nextDepth) {
        depthByKey.set(childKey, nextDepth);
        queue.push(child);
      }
    }
  }

  for (const node of tree.nodes) {
    if (!depthByKey.has(node.node_key)) depthByKey.set(node.node_key, 0);
  }

  return depthByKey;
}

function buildFlowElements(
  tree: ApiTreeResponse,
  selectedId: string | null,
  recommendations: ApiRecommendationItem[],
  focusMode: FocusMode,
  enabledTypes: NodeType[],
  progressBusy: string | null,
  onProgressChange: (nodeId: string, status: ProgressStatus) => void,
): { nodes: Node<RootMapNodeData>[]; edges: Edge[]; visibleCount: number } {
  const recommendedSet = new Set(recommendations.map((item) => item.node_id));
  const visibleIds = visibleNodeIds(tree, selectedId, focusMode, enabledTypes, recommendedSet);
  const relatedIds = relatedNodeIds(tree, selectedId);
  const depthByKey = nodeDepths(tree);
  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  const recommendedIndex = new Map(
    tree.recommended_order.map((nodeKey, index) => [nodeKey, index]),
  );

  const levels = new Map<number, ApiLearningNode[]>();
  for (const node of tree.nodes) {
    if (!visibleIds.has(node.id)) continue;
    const depth = depthByKey.get(node.node_key) ?? 0;
    const level = levels.get(depth) ?? [];
    level.push(node);
    levels.set(depth, level);
  }

  const flowNodes: Node<RootMapNodeData>[] = [];
  const sortedDepths = [...levels.keys()].sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    const level = (levels.get(depth) ?? []).sort((a, b) =>
      compareNodeKeys(a, b, recommendedIndex),
    );
    const rowWidth = (level.length - 1) * 270;
    level.forEach((node, index) => {
      flowNodes.push({
        id: node.id,
        type: "rootmap",
        position: {
          x: index * 270 - rowWidth / 2,
          y: depth * 190,
        },
        data: {
          node,
          selected: selectedId === node.id,
          related: relatedIds.has(node.id),
          recommended: recommendedSet.has(node.id),
          progressBusy: progressBusy === node.id,
          onProgressChange,
        },
      });
    });
  }

  const flowEdges: Edge[] = [];
  for (const source of tree.nodes) {
    if (!visibleIds.has(source.id)) continue;
    for (const childKey of source.children) {
      const target = nodeByKey.get(childKey);
      if (!target || !visibleIds.has(target.id)) continue;
      const active = source.id === selectedId || target.id === selectedId;
      flowEdges.push({
        id: `${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: "smoothstep",
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColorForNodeType(target.type),
        },
        style: { stroke: edgeColorForNodeType(target.type) },
        className: [
          active ? "rootmap-edge-active" : "rootmap-edge-muted",
          edgeClassForNodeType(target.type),
        ].join(" "),
      });
    }
  }

  return { nodes: flowNodes, edges: flowEdges, visibleCount: flowNodes.length };
}

function nodeRelations(tree: ApiTreeResponse, selected: ApiLearningNode | null): NodeRelation[] {
  if (!selected) return [];
  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  const relations: NodeRelation[] = [];

  for (const parent of tree.nodes) {
    if (parent.children.includes(selected.node_key)) {
      relations.push({ node: parent, direction: "parent" });
    }
  }

  for (const childKey of selected.children) {
    const child = nodeByKey.get(childKey);
    if (child) relations.push({ node: child, direction: "child" });
  }

  return relations;
}

function edgeClassForNodeType(type: NodeType): string {
  if (type === "prerequisite") return "edge-prerequisite";
  if (type === "core") return "edge-core";
  if (type === "supplementary") return "edge-supplementary";
  if (type === "misconception") return "edge-misconception";
  return "edge-quiz";
}

function edgeColorForNodeType(type: NodeType): string {
  return NODE_KIND_CONFIG[type].minimapColor;
}

function RootMapFlowNode({ data }: NodeProps<Node<RootMapNodeData>>) {
  const config = NODE_KIND_CONFIG[data.node.type];
  const Icon = config.icon;

  return (
    <div
      className={[
        "rootmap-flow-node",
        config.className,
        data.selected ? "is-selected" : "",
        data.related ? "is-related" : "",
        data.recommended ? "is-recommended" : "",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-topline">
        <span className="node-kind">
          <Icon size={14} />
          {SECTION_LABEL[data.node.type]}
        </span>
        {data.recommended ? <span className="node-status">추천</span> : null}
      </div>
      <strong>{data.node.title}</strong>
      <p>
        {data.node.description ||
          (data.node.document_context ? "상세 설명을 생성할 수 있습니다." : "설명 없음")}
      </p>
      <label className="node-progress" onClick={(event) => event.stopPropagation()}>
        <span>이해 정도</span>
        <select
          value={data.node.progress}
          disabled={data.progressBusy}
          onChange={(event) =>
            data.onProgressChange(data.node.id, event.target.value as ProgressStatus)
          }
        >
          {(Object.keys(PROGRESS_LABEL) as ProgressStatus[]).map((status) => (
            <option key={status} value={status}>
              {PROGRESS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { rootmap: RootMapFlowNode };

export function TreePageClient({ treeId }: { treeId: string }) {
  const router = useRouter();
  const [tree, setTree] = useState<ApiTreeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ApiRecommendationItem[]>([]);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<ApiNodeDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenElapsedSeconds, setRegenElapsedSeconds] = useState(0);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [reuseConcepts, setReuseConcepts] = useState(true);
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [enabledTypes, setEnabledTypes] = useState<NodeType[]>(SECTION_ORDER);
  const [progressBusy, setProgressBusy] = useState<string | null>(null);

  const loadTree = useCallback(async (): Promise<boolean> => {
    setLoadError(null);
    const res = await fetch(`/api/trees/${treeId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(data?.error?.message ?? "트리를 불러오지 못했습니다.");
      setTree(null);
      return false;
    }
    const nextTree = data as ApiTreeResponse;
    setTree(nextTree);
    setSelectedId((current) =>
      current && nextTree.nodes.some((node) => node.id === current)
        ? current
        : initialSelectedId(nextTree),
    );
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
      (data as { recommended_nodes: ApiRecommendationItem[] }).recommended_nodes ?? [],
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

  const isDocumentTree = Boolean(tree?.document_id);

  const selectedNode = useMemo(() => {
    if (!tree || !selectedId) return null;
    return tree.nodes.find((node) => node.id === selectedId) ?? null;
  }, [selectedId, tree]);

  const orderedNodes = useMemo(() => (tree ? orderedTreeNodes(tree) : []), [tree]);

  const recommendedSet = useMemo(
    () => new Set(recommendations.map((item) => item.node_id)),
    [recommendations],
  );

  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orderedNodes;
    return orderedNodes.filter((node) =>
      [node.title, node.description, SECTION_LABEL[node.type], PROGRESS_LABEL[node.progress]]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [orderedNodes, query]);

  const relations = useMemo(
    () => (tree ? nodeRelations(tree, selectedNode) : []),
    [selectedNode, tree],
  );

  const onProgressChange = useCallback(
    async (nodeId: string, status: ProgressStatus) => {
      setProgressBusy(nodeId);
      try {
        const res = await fetch(`/api/nodes/${nodeId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message ?? "이해 정도 저장 실패");
        setTree((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((node) =>
                  node.id === nodeId ? { ...node, progress: status } : node,
                ),
              }
            : prev,
        );
        await loadRecommendations();
      } finally {
        setProgressBusy(null);
      }
    },
    [loadRecommendations],
  );

  const flow = useMemo(() => {
    if (!tree) return { nodes: [], edges: [], visibleCount: 0 };
    return buildFlowElements(
      tree,
      selectedId,
      recommendations,
      focusMode,
      enabledTypes,
      progressBusy,
      (nodeId, status) => void onProgressChange(nodeId, status),
    );
  }, [
    enabledTypes,
    focusMode,
    onProgressChange,
    progressBusy,
    recommendations,
    selectedId,
    tree,
  ]);

  const loadDetail = useCallback(async (nodeId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree_id: treeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "상세 설명을 불러오지 못했습니다.");
      }
      setDetail(data as ApiNodeDetailResponse);
      setTree((prev) =>
        prev
          ? {
              ...prev,
              nodes: prev.nodes.map((node) =>
                node.id === nodeId ? { ...node, has_detail: true } : node,
              ),
            }
          : prev,
      );
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "상세 설명을 불러오지 못했습니다.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, [treeId]);

  const openNode = useCallback(
    async (nodeId: string) => {
      setSelectedId(nodeId);
      setModalOpen(true);

      if (isDocumentTree && tree) {
        const apiNode = tree.nodes.find((node) => node.id === nodeId);
        if (apiNode && !apiNode.description) {
          try {
            const genRes = await fetch(`/api/trees/${treeId}/nodes/${nodeId}/generate-detail`, {
              method: "POST",
            });
            if (genRes.ok) {
              const genData = await genRes.json().catch(() => ({}));
              const newDesc =
                genData.description ||
                genData.detail?.document_context_summary ||
                genData.detail?.easy_explanation ||
                "";
              if (newDesc) {
                setTree((prev) =>
                  prev
                    ? {
                        ...prev,
                        nodes: prev.nodes.map((node) =>
                          node.id === nodeId
                            ? { ...node, description: newDesc, has_detail: true }
                            : node,
                        ),
                      }
                    : prev,
                );
              }
            }
          } catch {
            // 기존 detail API fallback을 그대로 사용한다.
          }
        }
      }

      void loadDetail(nodeId);
    },
    [isDocumentTree, loadDetail, tree, treeId],
  );

  const closeDetailModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetailModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetailModal, modalOpen]);

  useEffect(() => {
    if (!regenLoading) return;
    const timer = window.setInterval(() => {
      setRegenElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [regenLoading]);

  const onRegenerate = async () => {
    if (!tree) return;
    setRegenElapsedSeconds(0);
    setRegenLoading(true);
    setRegenError(null);
    try {
      const res = await fetch("/api/trees/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: tree.topic,
          reuse_concepts: reuseConcepts,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRegenError(data?.error?.message ?? "다시 생성하지 못했습니다.");
        return;
      }
      const nextId = (data as { tree_id?: string }).tree_id;
      if (nextId) router.push(`/tree/${nextId}`);
    } finally {
      setRegenLoading(false);
    }
  };

  const toggleType = (type: NodeType) => {
    setEnabledTypes((current) => {
      if (current.includes(type)) {
        return current.length === 1 ? current : current.filter((item) => item !== type);
      }
      return [...current, type];
    });
  };

  const renderDocumentNodeContext = (node: ApiLearningNode) => {
    const ctx = node.document_context;
    if (!ctx) return null;
    const firstEvidence = ctx.evidence[0];

    return (
      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${documentSourceTypeTone(
              ctx.source_type,
            )}`}
          >
            {documentSourceTypeLabel(ctx.source_type)}
          </span>
          <span className="text-zinc-500">
            {firstEvidence ? formatDocumentEvidenceLocation(firstEvidence) : "직접 출처 없음"}
          </span>
        </div>
        {firstEvidence?.snippet ? (
          <p className="mt-1 line-clamp-2 leading-relaxed text-zinc-600">
            {firstEvidence.snippet}
          </p>
        ) : null}
      </div>
    );
  };

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <p className="text-zinc-700 dark:text-zinc-300">{loadError}</p>
        <Link href="/" className="text-zinc-900 underline dark:text-zinc-100">
          처음으로
        </Link>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black text-zinc-50">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:h-[calc(100dvh-3rem)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.45)]">
          <div className="grid gap-1">
            <span className="text-sm font-semibold text-emerald-500">RootMap</span>
            <strong className="text-2xl leading-tight text-white">{tree.topic}</strong>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{tree.summary}</p>
          </div>

          <label className="flex h-10 items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 text-zinc-400">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="노드 검색"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-zinc-200">
              <input
                type="checkbox"
                checked={reuseConcepts}
                onChange={(event) => setReuseConcepts(event.target.checked)}
                disabled={regenLoading}
                className="rounded border-zinc-600 accent-emerald-700 disabled:opacity-60"
              />
              개념 재사용
            </label>
            <button
              type="button"
              onClick={() => void onRegenerate()}
              disabled={regenLoading}
              className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {regenLoading ? `재생성 중 · ${regenElapsedSeconds}초` : "다시 생성"}
            </button>
            <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300">
              저장됨
            </span>
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 underline decoration-emerald-700 underline-offset-4">
              새 주제
            </Link>
          </div>

          {regenLoading ? (
            <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
              <p className="font-medium">재생성 중 · {regenElapsedSeconds}초 경과</p>
              <p className="mt-1 text-xs">{generationStageMessage(regenElapsedSeconds)}</p>
              {reuseConcepts ? (
                <p className="mt-1 text-xs text-emerald-200/80">
                  저장된 Concept과 비교해 중복을 줄이는 중이라 조금 더 걸릴 수 있습니다.
                </p>
              ) : null}
            </div>
          ) : null}
          {regenError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {regenError} 다시 생성 버튼으로 재시도할 수 있습니다.
            </p>
          ) : null}

          <section className="rounded-lg border border-zinc-800 bg-black p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">다음에 볼 만한 노드</h2>
              <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white">
                {recommendations.length}
              </span>
            </div>
            {recoError ? (
              <p className="mt-2 text-sm text-zinc-400">{recoError}</p>
            ) : recommendations.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {recommendations.map((item) => (
                  <button
                    key={item.node_id}
                    type="button"
                    onClick={() => void openNode(item.node_id)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm transition hover:border-emerald-700"
                  >
                    <strong className="block text-white">{item.title}</strong>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-400">
                      {item.reason}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">이해 상태를 바꾸면 추천이 갱신됩니다.</p>
            )}
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-400">학습 경로</span>
              <span className="text-xs font-semibold text-zinc-400">
                {filteredNodes.length} nodes
              </span>
            </div>
            <div className="grid gap-2">
              {filteredNodes.map((node, index) => {
                const active = selectedId === node.id;
                const config = NODE_KIND_CONFIG[node.type];
                const Icon = config.icon;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => void openNode(node.id)}
                    className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      active
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : recommendedSet.has(node.id)
                          ? "border-emerald-800 bg-emerald-950/40 text-white"
                          : "border-zinc-800 bg-black text-zinc-100 hover:border-emerald-700"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                        active ? "bg-white text-emerald-800" : "bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-semibold opacity-75">
                        <Icon size={13} />
                        {SECTION_LABEL[node.type]}
                      </span>
                      <span className="mt-1 line-clamp-2 block font-semibold leading-snug">
                        {node.title}
                      </span>
                      <span className={`mt-1 block text-xs ${active ? "text-emerald-50" : "text-zinc-400"}`}>
                        {PROGRESS_LABEL[node.progress]}
                        {recommendedSet.has(node.id) ? " · 추천" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_18px_42px_rgba(0,0,0,0.45)]">
          <div className="flex min-h-[86px] flex-col gap-3 border-b border-zinc-800 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-emerald-500">
                {selectedNode ? SECTION_LABEL[selectedNode.type] : "Main Topic"}
              </span>
              <h1 className="mt-1 text-2xl font-semibold leading-tight text-white">
                {selectedNode?.title ?? tree.topic}
              </h1>
              <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
                {selectedNode?.description ||
                  tree.summary ||
                  "Tree에서 노드를 선택하면 상세 설명을 확인할 수 있습니다."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {selectedNode ? (
                <div className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-zinc-800 bg-black px-3 text-sm font-semibold text-zinc-200">
                  {statusIcon(selectedNode.progress)}
                  {PROGRESS_LABEL[selectedNode.progress]}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => selectedNode && void openNode(selectedNode.id)}
                disabled={!selectedNode}
                className="rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm font-semibold text-white hover:border-emerald-700 disabled:opacity-50"
              >
                상세 보기
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-black px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400">Focus</span>
              <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                {FOCUS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFocusMode(option.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                      focusMode === option.id ? "bg-emerald-700 text-white" : "text-zinc-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-zinc-400">타입 필터</span>
              {SECTION_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                    enabledTypes.includes(type)
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400"
                  }`}
                >
                  {SECTION_LABEL[type]}
                </button>
              ))}
            </div>
            <div className="text-xs font-bold text-zinc-400">
              {flow.visibleCount} cards · {flow.edges.length} links
            </div>
          </div>

          <div className="rootmap-flow-frame">
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.32}
              maxZoom={1.25}
              onNodeClick={(_, node) => void openNode(node.id)}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} color="#14532d" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => {
                  const data = node.data as RootMapNodeData;
                  return NODE_KIND_CONFIG[data.node.type].minimapColor;
                }}
              />
            </ReactFlow>
          </div>
        </section>

        <AnimatePresence>
          {modalOpen && selectedNode ? (
            <motion.div
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={closeDetailModal}
            >
              <motion.article
                className="detail-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="detail-modal-title"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <div className="detail-kind">{SECTION_LABEL[selectedNode.type]}</div>
                    <h2 id="detail-modal-title">{selectedNode.title}</h2>
                    <p className="summary">
                      {selectedNode.description || "상세 설명을 생성하거나 불러오는 중입니다."}
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={closeDetailModal}
                    aria-label="상세 창 닫기"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="modal-content">
                  <div className="modal-main">
                    {detailLoading ? (
                      <div className="detail-section">
                        <h3>불러오는 중</h3>
                        <p className="section-copy">상세 설명을 준비하고 있습니다.</p>
                      </div>
                    ) : detailError ? (
                      <div className="detail-section">
                        <h3>불러오지 못했습니다</h3>
                        <p className="section-copy">{detailError}</p>
                        <button
                          type="button"
                          className="detail-inline-button"
                          onClick={() => void loadDetail(selectedNode.id)}
                        >
                          다시 시도
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="detail-section">
                          <h3>이게 뭔가요?</h3>
                          <p className="section-copy">
                            {detail?.easy_explanation ||
                              selectedNode.description ||
                              "아직 설명이 없습니다."}
                          </p>
                        </div>

                        <div className="detail-section">
                          <h3>왜 중요한가</h3>
                          <p className="section-copy">
                            {detail?.why_it_matters_for_document ??
                              detail?.why_it_matters ??
                              "이 노드의 선수/후속 관계를 맵에서 확인하세요."}
                          </p>
                        </div>

                        {detail?.document_context ? (
                          <div className="detail-section">
                            <h3>문서에서의 역할</h3>
                            <p className="section-copy">
                              {detail.document_context_summary ||
                                detail.topic_context_line ||
                                selectedNode.description ||
                                "문서 기반 맥락 정보가 연결되어 있습니다."}
                            </p>
                            {detail.document_context.evidence.length > 0 ? (
                              <div className="evidence-list">
                                {detail.document_context.evidence.map((evidence, index) => (
                                  <div
                                    key={`${evidence.section_title ?? "section"}-${index}`}
                                    className="evidence-item"
                                  >
                                    <strong>{formatDocumentEvidenceLocation(evidence)}</strong>
                                    <p>{evidence.snippet}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {detail?.example ? (
                          <div className="detail-section">
                            <h3>예시</h3>
                            <pre className="detail-code">{detail.example}</pre>
                          </div>
                        ) : null}

                        {detail?.common_misconceptions?.length ? (
                          <div className="detail-section">
                            <h3>자주 하는 오해</h3>
                            <ul>
                              {detail.common_misconceptions.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <div className="detail-section">
                          <h3>이해 점검</h3>
                          {detail?.check_questions?.length ? (
                            <ul>
                              {detail.check_questions.map((question, index) => (
                                <li key={`${question.question}-${index}`}>
                                  <strong>{question.question}</strong>
                                  <p>{question.answer}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="section-copy">아직 이해 점검 항목이 없습니다.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <aside className="modal-side">
                    <div className="detail-section">
                      <h3>연결 관계</h3>
                      <div className="related-list">
                        {relations.length > 0 ? (
                          relations.map((relation) => (
                            <button
                              key={`${relation.direction}-${relation.node.id}`}
                              onClick={() => void openNode(relation.node.id)}
                            >
                              <span>
                                {relation.direction === "parent" ? "이전" : "다음"} ·{" "}
                                {SECTION_LABEL[relation.node.type]}
                              </span>
                              <strong>{relation.node.title}</strong>
                            </button>
                          ))
                        ) : (
                          <p className="section-copy">연결된 노드가 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="detail-section">
                      <h3>이해 정도</h3>
                      <label className="modal-progress">
                        <span>{PROGRESS_LABEL[selectedNode.progress]}</span>
                        <select
                          value={selectedNode.progress}
                          disabled={progressBusy === selectedNode.id}
                          onChange={(event) =>
                            void onProgressChange(
                              selectedNode.id,
                              event.target.value as ProgressStatus,
                            )
                          }
                        >
                          {(Object.keys(PROGRESS_LABEL) as ProgressStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {PROGRESS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {renderDocumentNodeContext(selectedNode)}

                    {detail?.prerequisite_concepts?.length ? (
                      <div className="detail-section">
                        <h3>선수 개념</h3>
                        <ul>
                          {detail.prerequisite_concepts.map((concept) => (
                            <li key={concept.id}>{concept.title}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {detail?.related_concepts?.length ? (
                      <div className="detail-section">
                        <h3>관련 개념</h3>
                        <ul>
                          {detail.related_concepts.map((concept) => (
                            <li key={concept.id}>{concept.title}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {detail?.used_in_other_trees?.length ? (
                      <div className="detail-section">
                        <h3>다른 Tree</h3>
                        <ul>
                          {detail.used_in_other_trees.map((item) => (
                            <li key={item.tree_id}>
                              <strong>{item.topic}</strong>
                              <p>{item.role_in_tree}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {detail?.next_nodes?.length ? (
                      <div className="detail-section">
                        <h3>다음에 볼 것</h3>
                        <p className="section-copy">{detail.next_nodes.join(", ")}</p>
                      </div>
                    ) : null}
                  </aside>
                </div>
              </motion.article>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
