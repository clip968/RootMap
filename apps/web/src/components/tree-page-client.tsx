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
import { DetailLearningBlocks } from "@/components/detail-learning-blocks";
import { GenerationLoadingPanel } from "@/components/generation-loading-panel";
import { VisualBlockRenderer } from "@/components/visual-blocks/visual-block-renderer";
import {
  LOGIN_REQUIRED_MESSAGE,
  authHeaders,
  authenticatedFetch,
  readSupabaseAccessToken,
  subscribeSupabaseAccessToken,
} from "@/lib/auth/browser-auth";
import { buildDeepDiveGenerationTopic } from "@/lib/tree/deep-dive";
import type {
  ApiNodeDetailExtrasResponse,
  ApiNodeDetailResponse,
} from "@/lib/services/node-detail";
import type {
  ApiLearningNode,
  ApiPersonalizedNode,
  ApiPersonalizedRecommendationItem,
  ApiPersonalizedRecommendationsResponse,
  ApiPersonalizedTreeResponse,
  ApiRecommendationItem,
  ApiReviewDueResponse,
  ApiReviewItem,
  ApiSessionReportResponse,
  ConceptRelationType,
  DocumentSourceType,
  LearningEdgeQuality,
  NodeType,
  ProgressStatus,
} from "@/types/learning";
import type { Edge, EdgeProps, Node, NodeProps } from "@xyflow/react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getSmoothStepPath,
} from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  FileText,
  GitBranch,
  Play,
  Route,
  Search,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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
  partial: "애매하다",
  unknown: "처음 본다",
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

/**
 * Phase 13: edge 관계 타입별 사람이 읽는 라벨. hover 카드와 접근성 라벨에 쓴다.
 */
const RELATION_LABEL: Record<ConceptRelationType, string> = {
  prerequisite: "선행 관계",
  part_of: "부분 관계",
  related: "관련 개념",
  misconception_of: "오개념 관계",
  example_of: "예시 관계",
  application_of: "응용 관계",
};

/** 관계 타입별 edge CSS 클래스(색·점선 구분). */
const RELATION_EDGE_CLASS: Record<ConceptRelationType, string> = {
  prerequisite: "rel-prerequisite",
  part_of: "rel-part-of",
  related: "rel-related",
  misconception_of: "rel-misconception",
  example_of: "rel-example",
  application_of: "rel-application",
};

const FOCUS_OPTIONS = [
  { id: "all", label: "전체" },
  { id: "near", label: "선택 주변" },
  { id: "next", label: "다음 단계" },
] as const;

const VIEW_OPTIONS = [
  { id: "path", label: "학습 순서 보기", icon: Route },
  { id: "community", label: "개념 묶음 보기", icon: GitBranch },
] as const;

const FLOW_PATH_COLUMN_GAP = 340;
const FLOW_PATH_LEVEL_GAP = 260;
const FLOW_COMMUNITY_COLUMN_GAP = 390;
const DETAIL_JOB_POLL_INTERVAL_MS = 1_000;
const DETAIL_JOB_TIMEOUT_MS = 90_000;
const DETAIL_JOB_MAX_STATUS_FAILURES = 3;

type DetailRequestPayload =
  | { status: "ready"; detail: ApiNodeDetailResponse }
  | { status: "queued"; job_id: string };

type DetailJobPayload =
  | { status: "queued" | "running"; job_id: string; attempt_count?: number }
  | { status: "ready"; job_id: string; detail: ApiNodeDetailResponse }
  | { status: "failed"; job_id: string; error_message?: string };
const FLOW_COMMUNITY_NODE_GAP = 210;
const FLOW_COMMUNITY_DEPTH_OFFSET = 28;

type FocusMode = (typeof FOCUS_OPTIONS)[number]["id"];
type ViewMode = (typeof VIEW_OPTIONS)[number]["id"];
type DocumentEvidenceItem = NonNullable<
  ApiLearningNode["document_context"]
>["evidence"][number];

interface RootMapNodeData {
  [key: string]: unknown;
  node: ApiLearningNode;
  personalization: ApiPersonalizedNode | null;
  selected: boolean;
  related: boolean;
  recommended: boolean;
  progressBusy: boolean;
  onProgressChange: (nodeId: string, status: ProgressStatus) => void;
}

/**
 * Phase 13: ReactFlow edge에 실어 보내는 관계 근거 메타데이터.
 * 커스텀 edge 컴포넌트가 hover/포커스 시 이 정보를 카드로 보여준다.
 */
interface RootMapEdgeData {
  [key: string]: unknown;
  relationType: ConceptRelationType;
  /** 관계 근거(왜 이 순서/연결인가). 비어 있으면 카드에서 관계 타입만 보여준다. */
  explanation: string;
  /** prerequisite에서 "이걸 모르면 다음이 막힘" 여부. */
  isBlocking: boolean;
  /** 관계 확신도(0~1). 0이면 표시하지 않는다. */
  confidence: number;
  /** community를 가로지르는 연결인지(다른 묶음 연결 표시용). */
  crossCommunity: boolean;
  sourceTitle: string;
  targetTitle: string;
}

interface NodeRelation {
  node: ApiLearningNode;
  direction: "parent" | "child";
}

interface UiRecommendationItem {
  node_id: string;
  title: string;
  reason: string;
  score?: number;
  reasons?: string[];
  recommendation_log_id?: string;
}

function subscribeClientReady(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const frame = window.requestAnimationFrame(callback);
  return () => window.cancelAnimationFrame(frame);
}

function readClientReady(): boolean {
  return typeof window !== "undefined";
}

function readServerClientReady(): boolean {
  return false;
}

function recommendationReason(item: ApiPersonalizedRecommendationItem): string {
  return item.reasons[0] ?? "현재 이해 상태를 기준으로 우선순위가 높습니다.";
}

function confidencePercent(score: number | null | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function isKnownPrerequisite(
  node: ApiLearningNode,
  personalizationByNodeId: Map<string, ApiPersonalizedNode>,
): boolean {
  const personalized = personalizationByNodeId.get(node.id);
  const status = personalized?.status ?? node.progress;
  const confidence = personalized?.confidence_score ?? (node.progress === "known" ? 0.8 : 0);
  return node.type === "prerequisite" && status === "known" && confidence >= 0.75;
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isPermanentDetailPollingError(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

function generationStageMessage(elapsedSeconds: number): string {
  if (elapsedSeconds < 8) return "개념 카드를 분류하고 있어요.";
  if (elapsedSeconds < 24) return "선수관계를 계산하고 있어요.";
  if (elapsedSeconds < 40) return "커뮤니티를 묶고 있어요.";
  if (elapsedSeconds < 56) return "학습 순서를 정리하고 있어요.";
  return "생성 결과를 검증하고 저장하고 있어요.";
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
  personalizationByNodeId: Map<string, ApiPersonalizedNode>,
  hideKnownPrerequisites: boolean,
): Set<string> {
  const typeSet = new Set(enabledTypes);
  const allowedByType = tree.nodes.filter((node) => {
    if (!typeSet.has(node.type)) return false;
    /** 이미 아는 선수지식은 추천·선택 상태가 아닐 때만 접어 핵심 경로를 짧게 만든다. */
    if (
      hideKnownPrerequisites &&
      node.id !== selectedId &&
      !recommendedSet.has(node.id) &&
      isKnownPrerequisite(node, personalizationByNodeId)
    ) {
      return false;
    }
    return true;
  });
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
  recommendations: UiRecommendationItem[],
  viewMode: ViewMode,
  focusMode: FocusMode,
  enabledTypes: NodeType[],
  personalizationByNodeId: Map<string, ApiPersonalizedNode>,
  hideKnownPrerequisites: boolean,
  progressBusy: string | null,
  onProgressChange: (nodeId: string, status: ProgressStatus) => void,
): { nodes: Node<RootMapNodeData>[]; edges: Edge<RootMapEdgeData>[]; visibleCount: number } {
  const recommendedSet = new Set(recommendations.map((item) => item.node_id));
  const visibleIds = visibleNodeIds(
    tree,
    selectedId,
    focusMode,
    enabledTypes,
    recommendedSet,
    personalizationByNodeId,
    hideKnownPrerequisites,
  );
  const relatedIds = relatedNodeIds(tree, selectedId);
  const depthByKey = nodeDepths(tree);
  const nodeByKey = new Map(tree.nodes.map((node) => [node.node_key, node]));
  const recommendedIndex = new Map(
    tree.recommended_order.map((nodeKey, index) => [nodeKey, index]),
  );

  const levels = new Map<number, ApiLearningNode[]>();
  const flowNodes: Node<RootMapNodeData>[] = [];
  if (viewMode === "community") {
    const communityOrder = new Map<string, number>();
    for (const community of tree.communities ?? []) {
      communityOrder.set(community.name, communityOrder.size);
    }
    for (const node of tree.nodes) {
      const name = node.community ?? "기타";
      if (!communityOrder.has(name)) communityOrder.set(name, communityOrder.size);
    }

    const communityNodes = new Map<string, ApiLearningNode[]>();
    for (const node of tree.nodes) {
      if (!visibleIds.has(node.id)) continue;
      const name = node.community ?? "기타";
      const group = communityNodes.get(name) ?? [];
      group.push(node);
      communityNodes.set(name, group);
    }

    const groupCount = Math.max(communityNodes.size, 1);
    const groupWidth = FLOW_COMMUNITY_COLUMN_GAP;
    const totalWidth = (groupCount - 1) * groupWidth;
    for (const [community, nodes] of [...communityNodes.entries()].sort(
      ([a], [b]) => (communityOrder.get(a) ?? 0) - (communityOrder.get(b) ?? 0),
    )) {
      const column = communityOrder.get(community) ?? 0;
      nodes
        .sort((a, b) => compareNodeKeys(a, b, recommendedIndex))
        .forEach((node, index) => {
          flowNodes.push({
            id: node.id,
            type: "rootmap",
            position: {
              x: column * groupWidth - totalWidth / 2,
              y:
                index * FLOW_COMMUNITY_NODE_GAP +
                (node.depth ?? depthByKey.get(node.node_key) ?? 0) *
                  FLOW_COMMUNITY_DEPTH_OFFSET,
            },
            data: {
              node,
              personalization: personalizationByNodeId.get(node.id) ?? null,
              selected: selectedId === node.id,
              related: relatedIds.has(node.id),
              recommended: recommendedSet.has(node.id),
              progressBusy: progressBusy === node.id,
              onProgressChange,
            },
          });
        });
    }
  } else {
    for (const node of tree.nodes) {
      if (!visibleIds.has(node.id)) continue;
      const depth = node.depth ?? depthByKey.get(node.node_key) ?? 0;
      const level = levels.get(depth) ?? [];
      level.push(node);
      levels.set(depth, level);
    }

    const sortedDepths = [...levels.keys()].sort((a, b) => a - b);
    for (const depth of sortedDepths) {
      const level = (levels.get(depth) ?? []).sort((a, b) =>
        compareNodeKeys(a, b, recommendedIndex),
      );
      const rowWidth = (level.length - 1) * FLOW_PATH_COLUMN_GAP;
      level.forEach((node, index) => {
        flowNodes.push({
          id: node.id,
          type: "rootmap",
          position: {
            x: index * FLOW_PATH_COLUMN_GAP - rowWidth / 2,
            y: depth * FLOW_PATH_LEVEL_GAP,
          },
          data: {
            node,
            personalization: personalizationByNodeId.get(node.id) ?? null,
            selected: selectedId === node.id,
            related: relatedIds.has(node.id),
            recommended: recommendedSet.has(node.id),
            progressBusy: progressBusy === node.id,
            onProgressChange,
          },
        });
      });
    }
  }

  // Phase 13: 노드 간 관계 근거를 (from,to) 쌍으로 빠르게 조회(키는 node_key).
  const edgeQualityByPair = new Map<string, LearningEdgeQuality>();
  for (const edge of tree.edges ?? []) {
    edgeQualityByPair.set(`${edge.from}\u0000${edge.to}`, edge);
  }
  /** 같은 두 노드 쌍에 edge를 중복으로 그리지 않기 위한 집합(DB id 기준). */
  const drawnPairs = new Set<string>();

  const flowEdges: Edge<RootMapEdgeData>[] = [];
  // 1) 위상(prerequisite) 계층 edge: children 관계로 그리고, 관계 근거가 있으면 실어 보낸다.
  for (const source of tree.nodes) {
    if (!visibleIds.has(source.id)) continue;
    for (const childKey of source.children) {
      const target = nodeByKey.get(childKey);
      if (!target || !visibleIds.has(target.id)) continue;
      const active = source.id === selectedId || target.id === selectedId;
      const quality = edgeQualityByPair.get(`${source.node_key}\u0000${target.node_key}`);
      drawnPairs.add(`${source.id}\u0000${target.id}`);
      flowEdges.push({
        id: `${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: "rootmap",
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColorForNodeType(target.type),
        },
        style: { stroke: edgeColorForNodeType(target.type) },
        className: [
          active ? "rootmap-edge-active" : "rootmap-edge-muted",
          edgeClassForNodeType(target.type),
          RELATION_EDGE_CLASS[quality?.relation_type ?? "prerequisite"],
        ].join(" "),
        data: {
          relationType: quality?.relation_type ?? "prerequisite",
          explanation: quality?.explanation ?? "",
          isBlocking: quality?.is_blocking ?? false,
          confidence: quality?.confidence ?? 0,
          crossCommunity: false,
          sourceTitle: source.title,
          targetTitle: target.title,
        },
      });
    }
  }

  // 2) 비-prerequisite 관계(related/application_of 등) edge: 계층에는 없지만 "개념이 연결돼 있다"는
  //    통찰을 주므로 별도 스타일(점선·약하게)로 추가한다. cross-community면 별도 클래스로 강조한다.
  (tree.edges ?? []).forEach((edge, index) => {
    if (edge.relation_type === "prerequisite") return;
    const source = nodeByKey.get(edge.from);
    const target = nodeByKey.get(edge.to);
    if (!source || !target) return;
    if (!visibleIds.has(source.id) || !visibleIds.has(target.id)) return;
    const pairKey = `${source.id}\u0000${target.id}`;
    if (drawnPairs.has(pairKey)) return;
    drawnPairs.add(pairKey);
    const crossCommunity =
      Boolean(source.community) &&
      Boolean(target.community) &&
      source.community !== target.community;
    const active = source.id === selectedId || target.id === selectedId;
    flowEdges.push({
      id: `rel-${index}-${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      type: "rootmap",
      animated: false,
      className: [
        active ? "rootmap-edge-active" : "rootmap-edge-muted",
        "rootmap-edge-relation",
        RELATION_EDGE_CLASS[edge.relation_type],
        crossCommunity ? "rootmap-edge-cross" : "",
      ].join(" "),
      data: {
        relationType: edge.relation_type,
        explanation: edge.explanation ?? "",
        isBlocking: edge.is_blocking ?? false,
        confidence: edge.confidence ?? 0,
        crossCommunity,
        sourceTitle: source.title,
        targetTitle: target.title,
      },
    });
  });

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
  const personalized = data.personalization;
  const progressLabel = PROGRESS_LABEL[personalized?.status ?? data.node.progress];

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
        {personalized?.is_recommended || data.recommended ? (
          <span className="node-status">지금 볼 것</span>
        ) : null}
      </div>
      {data.node.community ? (
        <span className="node-status">{data.node.community}</span>
      ) : null}
      <strong>{data.node.title}</strong>
      <span className="node-progress-summary">{progressLabel}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { rootmap: RootMapFlowNode };

/**
 * Phase 13: 관계 근거를 보여주는 커스텀 edge.
 *
 * - edge 경로(BaseEdge)는 기존 smoothstep과 동일하게 그린다.
 * - 경로 중앙에 작은 칩을 두고, 마우스 hover 또는 키보드 포커스 시 관계 근거 카드를 띄운다.
 * - `is_blocking`이면 자물쇠 표시와 "이걸 모르면 막힘" 배지를 보여준다.
 * - 근거(explanation)가 없으면 관계 타입만 보여주고 화면이 깨지지 않게 한다(fallback).
 * - hover뿐 아니라 버튼 포커스로도 카드가 열려 키보드 접근성을 유지한다(Phase 07 기조).
 */
function RootMapFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<Edge<RootMapEdgeData>>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const relationType = data?.relationType ?? "prerequisite";
  const explanation = (data?.explanation ?? "").trim();
  const isBlocking = data?.isBlocking ?? false;
  const crossCommunity = data?.crossCommunity ?? false;
  const confidence = data?.confidence ?? 0;
  const relationLabel = RELATION_LABEL[relationType];
  const sourceTitle = data?.sourceTitle ?? "";
  const targetTitle = data?.targetTitle ?? "";
  const tooltipId = `${id}-rationale`;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="rootmap-edge-label nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            className={[
              "rootmap-edge-chip",
              isBlocking ? "is-blocking" : "",
              crossCommunity ? "is-cross" : "",
            ].join(" ")}
            aria-label={`${sourceTitle}에서 ${targetTitle}로: ${relationLabel}${
              explanation ? `. 이유: ${explanation}` : ""
            }${isBlocking ? ". 이걸 모르면 다음 개념 이해가 막힙니다." : ""}`}
            aria-describedby={tooltipId}
          >
            {isBlocking ? "!" : "·"}
          </button>
          <div role="tooltip" id={tooltipId} className="rootmap-edge-card">
            <div className="rootmap-edge-card-head">
              <span className="rootmap-edge-card-relation">{relationLabel}</span>
              {isBlocking ? (
                <span className="rootmap-edge-card-blocking">이걸 모르면 막힘</span>
              ) : null}
              {crossCommunity ? (
                <span className="rootmap-edge-card-cross">다른 묶음 연결</span>
              ) : null}
            </div>
            <strong className="rootmap-edge-card-title">
              {sourceTitle} → {targetTitle}
            </strong>
            <p className="rootmap-edge-card-reason">
              {explanation ? `이유: ${explanation}` : "아직 관계 근거가 없습니다."}
            </p>
            {confidence > 0 ? (
              <span className="rootmap-edge-card-confidence">
                확신도 {Math.round(confidence * 100)}%
              </span>
            ) : null}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { rootmap: RootMapFlowEdge };

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
  const [detailExtrasLoading, setDetailExtrasLoading] = useState(false);
  const [detailExtrasError, setDetailExtrasError] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailJobStatus, setDetailJobStatus] = useState<"queued" | "running" | null>(null);
  const [detailJobTimedOut, setDetailJobTimedOut] = useState(false);
  const detailRequestSeqRef = useRef(0);
  const detailInFlightNodeRef = useRef<string | null>(null);
  const detailAbortControllerRef = useRef<AbortController | null>(null);
  const detailExtrasAbortControllerRef = useRef<AbortController | null>(null);
  const detailJobAbortControllerRef = useRef<AbortController | null>(null);
  const detailJobPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailJobStatusFailureCountRef = useRef(0);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenElapsedSeconds, setRegenElapsedSeconds] = useState(0);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("path");
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [enabledTypes, setEnabledTypes] = useState<NodeType[]>(SECTION_ORDER);
  const [progressBusy, setProgressBusy] = useState<string | null>(null);
  const phase4AuthToken = useSyncExternalStore(
    subscribeSupabaseAccessToken,
    readSupabaseAccessToken,
    () => null,
  );
  const [personalizedNodes, setPersonalizedNodes] = useState<ApiPersonalizedNode[]>([]);
  const [personalizedRecommendations, setPersonalizedRecommendations] = useState<
    ApiPersonalizedRecommendationItem[]
  >([]);
  const [reviewItems, setReviewItems] = useState<ApiReviewItem[]>([]);
  const [phase4Error, setPhase4Error] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [latestReport, setLatestReport] = useState<ApiSessionReportResponse | null>(null);
  const [hideKnownPrerequisites, setHideKnownPrerequisites] = useState(true);
  const flowMounted = useSyncExternalStore(
    subscribeClientReady,
    readClientReady,
    readServerClientReady,
  );

  const loadTree = useCallback(async (): Promise<boolean> => {
    setLoadError(null);
    try {
      const res = await authenticatedFetch(`/api/trees/${treeId}`, {}, { contentType: null });
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
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : LOGIN_REQUIRED_MESSAGE);
      setTree(null);
      return false;
    }
  }, [treeId]);

  const loadRecommendations = useCallback(async () => {
    setRecoError(null);
    try {
      const res = await authenticatedFetch(
        `/api/trees/${treeId}/recommendations`,
        {},
        { contentType: null },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecoError(data?.error?.message ?? "추천을 불러오지 못했습니다.");
        setRecommendations([]);
        return;
      }
      setRecommendations(
        (data as { recommended_nodes: ApiRecommendationItem[] }).recommended_nodes ?? [],
      );
    } catch (error) {
      setRecoError(error instanceof Error ? error.message : LOGIN_REQUIRED_MESSAGE);
      setRecommendations([]);
    }
  }, [treeId]);

  const loadPhase4Data = useCallback(async () => {
    if (!phase4AuthToken) {
      setPersonalizedNodes([]);
      setPersonalizedRecommendations([]);
      setReviewItems([]);
      setPhase4Error(null);
      return;
    }

    const headers = authHeaders(phase4AuthToken);
    setPhase4Error(null);
    const [personalizedRes, recommendationsRes, reviewRes] = await Promise.all([
      fetch(`/api/trees/${treeId}/personalized`, { headers }),
      fetch(`/api/trees/${treeId}/recommendations/personalized`, { headers }),
      fetch("/api/reviews/due?limit=5", { headers }),
    ]);
    const [personalizedData, recommendationsData, reviewData] = await Promise.all([
      personalizedRes.json().catch(() => ({})),
      recommendationsRes.json().catch(() => ({})),
      reviewRes.json().catch(() => ({})),
    ]);

    if (personalizedRes.ok) {
      setPersonalizedNodes(
        (personalizedData as ApiPersonalizedTreeResponse).personalized_nodes ?? [],
      );
    } else {
      setPersonalizedNodes([]);
      setPhase4Error(personalizedData?.error?.message ?? "개인화 트리를 불러오지 못했습니다.");
    }

    if (recommendationsRes.ok) {
      setPersonalizedRecommendations(
        (recommendationsData as ApiPersonalizedRecommendationsResponse).recommended_nodes ?? [],
      );
    } else {
      setPersonalizedRecommendations([]);
    }

    if (reviewRes.ok) {
      setReviewItems((reviewData as ApiReviewDueResponse).review_items ?? []);
    } else {
      setReviewItems([]);
    }
  }, [phase4AuthToken, treeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadTree();
      if (cancelled || !ok) return;
      if (cancelled) return;
      await loadRecommendations();
      if (cancelled) return;
      await loadPhase4Data();
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId, phase4AuthToken, loadTree, loadRecommendations, loadPhase4Data]);

  const selectedNode = useMemo(() => {
    if (!tree || !selectedId) return null;
    return tree.nodes.find((node) => node.id === selectedId) ?? null;
  }, [selectedId, tree]);

  const orderedNodes = useMemo(() => (tree ? orderedTreeNodes(tree) : []), [tree]);

  const personalizationByNodeId = useMemo(
    () => new Map(personalizedNodes.map((node) => [node.node_id, node])),
    [personalizedNodes],
  );

  const effectiveRecommendations: UiRecommendationItem[] = useMemo(() => {
    if (personalizedRecommendations.length > 0) {
      return personalizedRecommendations.map((item) => ({
        node_id: item.node_id,
        title: item.title,
        reason: recommendationReason(item),
        score: item.score,
        reasons: item.reasons,
        recommendation_log_id: item.recommendation_log_id,
      }));
    }
    return recommendations.map((item) => ({
      node_id: item.node_id,
      title: item.title,
      reason: item.reason,
    }));
  }, [personalizedRecommendations, recommendations]);

  const recommendedSet = useMemo(
    () => new Set(effectiveRecommendations.map((item) => item.node_id)),
    [effectiveRecommendations],
  );

  const nextStepItems: UiRecommendationItem[] = useMemo(() => {
    if (effectiveRecommendations.length > 0) {
      return effectiveRecommendations.slice(0, 3);
    }

    return orderedNodes
      .filter((node) => (personalizationByNodeId.get(node.id)?.status ?? node.progress) !== "known")
      .slice(0, 3)
      .map((node) => ({
        node_id: node.id,
        title: node.title,
        reason: `${SECTION_LABEL[node.type]} · ${
          PROGRESS_LABEL[personalizationByNodeId.get(node.id)?.status ?? node.progress]
        }`,
      }));
  }, [effectiveRecommendations, orderedNodes, personalizationByNodeId]);

  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visibleOrdered = orderedNodes.filter(
      (node) =>
        !hideKnownPrerequisites ||
        node.id === selectedId ||
        recommendedSet.has(node.id) ||
        !isKnownPrerequisite(node, personalizationByNodeId),
    );
    if (!needle) return visibleOrdered;
    return visibleOrdered.filter((node) =>
      [
        node.title,
        node.description,
        SECTION_LABEL[node.type],
        PROGRESS_LABEL[personalizationByNodeId.get(node.id)?.status ?? node.progress],
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [
    hideKnownPrerequisites,
    orderedNodes,
    personalizationByNodeId,
    query,
    recommendedSet,
    selectedId,
  ]);

  const relations = useMemo(
    () => (tree ? nodeRelations(tree, selectedNode) : []),
    [selectedNode, tree],
  );
  const detailNextNodes = detail?.next_nodes;
  const nextActionNode = useMemo(() => {
    const childRelation = relations.find((relation) => relation.direction === "child");
    if (childRelation) return childRelation.node;
    if (!tree || !detailNextNodes?.length) return null;

    const nextNodeIds = new Set(detailNextNodes);
    return (
      tree.nodes.find(
        (node) =>
          nextNodeIds.has(node.id) ||
          nextNodeIds.has(node.node_key) ||
          nextNodeIds.has(node.title),
      ) ?? null
    );
  }, [detailNextNodes, relations, tree]);

  const onProgressChange = useCallback(
    async (nodeId: string, status: ProgressStatus) => {
      setProgressBusy(nodeId);
      try {
        const res = await authenticatedFetch(`/api/nodes/${nodeId}/progress`, {
          method: "PATCH",
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
        const changedNode = tree?.nodes.find((node) => node.id === nodeId) ?? null;
        if (phase4AuthToken && changedNode?.concept_id) {
          /** Phase 4 mastery API는 Supabase Auth 사용자 기준이므로 토큰이 있을 때만 자기 평가를 함께 기록한다. */
          const masteryRes = await fetch(`/api/concepts/${changedNode.concept_id}/mastery`, {
            method: "PATCH",
            headers: authHeaders(phase4AuthToken),
            body: JSON.stringify({
              status,
              source: "self_assessment",
              session_id: activeSessionId,
            }),
          });
          const masteryData = await masteryRes.json().catch(() => ({}));
          if (!masteryRes.ok) {
            setPhase4Error(masteryData?.error?.message ?? "개인화 이해 상태를 저장하지 못했습니다.");
          }
        }
        await loadRecommendations();
        await loadPhase4Data();
      } catch (error) {
        setPhase4Error(
          error instanceof Error ? error.message : "이해 정도를 저장하지 못했습니다.",
        );
      } finally {
        setProgressBusy(null);
      }
    },
    [activeSessionId, loadPhase4Data, loadRecommendations, phase4AuthToken, tree],
  );

  const flow = useMemo(() => {
    if (!tree || !flowMounted) return { nodes: [], edges: [], visibleCount: 0 };
    return buildFlowElements(
      tree,
      selectedId,
      effectiveRecommendations,
      viewMode,
      focusMode,
      enabledTypes,
      personalizationByNodeId,
      hideKnownPrerequisites,
      progressBusy,
      (nodeId, status) => void onProgressChange(nodeId, status),
    );
  }, [
    enabledTypes,
    effectiveRecommendations,
    focusMode,
    flowMounted,
    hideKnownPrerequisites,
    onProgressChange,
    personalizationByNodeId,
    progressBusy,
    selectedId,
    tree,
    viewMode,
  ]);

  const clearDetailPolling = useCallback(() => {
    if (detailJobPollTimerRef.current) {
      clearTimeout(detailJobPollTimerRef.current);
      detailJobPollTimerRef.current = null;
    }
    detailJobAbortControllerRef.current?.abort();
    detailJobAbortControllerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      detailAbortControllerRef.current?.abort();
      detailExtrasAbortControllerRef.current?.abort();
      clearDetailPolling();
    };
  }, [clearDetailPolling]);

  const loadDetailExtras = useCallback(async (nodeId: string, requestSeq: number) => {
    detailExtrasAbortControllerRef.current?.abort();
    const controller = new AbortController();
    detailExtrasAbortControllerRef.current = controller;
    setDetailExtrasLoading(true);
    setDetailExtrasError(null);
    try {
      const res = await authenticatedFetch(
        `/api/nodes/${nodeId}/detail/extras?tree_id=${encodeURIComponent(treeId)}`,
        { signal: controller.signal },
        { contentType: null },
      );
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || detailRequestSeqRef.current !== requestSeq) return;
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "연결 관계를 불러오지 못했습니다.");
      }

      // 본문 detail과 패널 graph를 다른 요청으로 받기 때문에 현재 노드에만 병합한다.
      setDetail((current) =>
        current?.node_id === nodeId
          ? { ...current, ...(data as ApiNodeDetailExtrasResponse) }
          : current,
      );
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      if (detailRequestSeqRef.current !== requestSeq) return;
      setDetailExtrasError(
        error instanceof Error ? error.message : "연결 관계를 불러오지 못했습니다.",
      );
    } finally {
      if (detailExtrasAbortControllerRef.current === controller) {
        detailExtrasAbortControllerRef.current = null;
      }
      if (detailRequestSeqRef.current === requestSeq) {
        setDetailExtrasLoading(false);
      }
    }
  }, [treeId]);

  const applyReadyDetail = useCallback((nodeId: string, requestSeq: number, readyDetail: ApiNodeDetailResponse) => {
    setDetail(readyDetail);
    setDetailJobId(null);
    setDetailJobStatus(null);
    setDetailJobTimedOut(false);
    void loadDetailExtras(nodeId, requestSeq);
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
  }, [loadDetailExtras]);

  const pollDetailJob = useCallback((nodeId: string, jobId: string, requestSeq: number, startedAt: number) => {
    clearDetailPolling();
    detailJobStatusFailureCountRef.current = 0;
    setDetailJobId(jobId);
    setDetailJobStatus("queued");
    setDetailJobTimedOut(false);

    const pollOnce = async () => {
      if (detailRequestSeqRef.current !== requestSeq) return;
      if (Date.now() - startedAt >= DETAIL_JOB_TIMEOUT_MS) {
        setDetailJobTimedOut(true);
        setDetailLoading(false);
        detailInFlightNodeRef.current = null;
        return;
      }

      const controller = new AbortController();
      detailJobAbortControllerRef.current = controller;
      const scheduleNextPoll = () => {
        detailJobPollTimerRef.current = setTimeout(pollOnce, DETAIL_JOB_POLL_INTERVAL_MS);
      };
      const registerTransientStatusFailure = (message: string) => {
        detailJobStatusFailureCountRef.current += 1;
        if (detailJobStatusFailureCountRef.current < DETAIL_JOB_MAX_STATUS_FAILURES) {
          scheduleNextPoll();
          return;
        }
        clearDetailPolling();
        setDetailError(message);
        setDetailLoading(false);
        detailInFlightNodeRef.current = null;
      };
      try {
        const res = await authenticatedFetch(`/api/node-detail-jobs/${jobId}`, {
          signal: controller.signal,
          headers: { "Cache-Control": "no-store" },
        }, { contentType: null });
        const data = await res.json().catch(() => ({})) as Partial<DetailJobPayload>;
        if (controller.signal.aborted || detailRequestSeqRef.current !== requestSeq) return;
        if (!res.ok) {
          const message =
            (data as { error?: { message?: string } })?.error?.message ??
            "상세 설명 생성 상태를 확인하지 못했습니다.";
          if (isPermanentDetailPollingError(res.status)) {
            clearDetailPolling();
            setDetailError(message);
            setDetailLoading(false);
            detailInFlightNodeRef.current = null;
            return;
          }
          registerTransientStatusFailure(message);
          return;
        }
        detailJobStatusFailureCountRef.current = 0;

        if (data.status === "ready" && "detail" in data && data.detail) {
          clearDetailPolling();
          applyReadyDetail(nodeId, requestSeq, data.detail);
          setDetailLoading(false);
          detailInFlightNodeRef.current = null;
          return;
        }

        if (data.status === "failed") {
          clearDetailPolling();
          setDetailError(data.error_message ?? "상세 설명 생성에 실패했습니다.");
          setDetailLoading(false);
          detailInFlightNodeRef.current = null;
          return;
        }

        if (data.status === "queued" || data.status === "running") {
          setDetailJobStatus(data.status);
        }
        scheduleNextPoll();
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (detailRequestSeqRef.current !== requestSeq) return;
        registerTransientStatusFailure(
          error instanceof Error ? error.message : "상세 설명 생성 상태를 확인하지 못했습니다.",
        );
      } finally {
        if (detailJobAbortControllerRef.current === controller) {
          detailJobAbortControllerRef.current = null;
        }
      }
    };

    detailJobPollTimerRef.current = setTimeout(pollOnce, DETAIL_JOB_POLL_INTERVAL_MS);
  }, [applyReadyDetail, clearDetailPolling]);

  const loadDetail = useCallback(async (nodeId: string) => {
    if (detailInFlightNodeRef.current === nodeId) return;

    clearDetailPolling();
    detailAbortControllerRef.current?.abort();
    detailExtrasAbortControllerRef.current?.abort();
    const controller = new AbortController();
    const requestSeq = detailRequestSeqRef.current + 1;
    detailRequestSeqRef.current = requestSeq;
    detailInFlightNodeRef.current = nodeId;
    detailAbortControllerRef.current = controller;
    let queued = false;

    setDetailLoading(true);
    setDetailError(null);
    setDetailExtrasError(null);
    setDetailExtrasLoading(false);
    setDetailJobId(null);
    setDetailJobStatus(null);
    setDetailJobTimedOut(false);
    setDetail(null);
    try {
      const res = await authenticatedFetch(`/api/nodes/${nodeId}/detail`, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ tree_id: treeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || detailRequestSeqRef.current !== requestSeq) return;
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "상세 설명을 불러오지 못했습니다.");
      }
      const payload = data as ApiNodeDetailResponse | DetailRequestPayload;
      if ("status" in payload) {
        if (payload.status === "ready") {
          applyReadyDetail(nodeId, requestSeq, payload.detail);
          return;
        }
        queued = true;
        pollDetailJob(nodeId, payload.job_id, requestSeq, Date.now());
        return;
      }

      applyReadyDetail(nodeId, requestSeq, payload);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      if (detailRequestSeqRef.current !== requestSeq) return;
      setDetailError(
        error instanceof Error ? error.message : "상세 설명을 불러오지 못했습니다.",
      );
    } finally {
      if (detailAbortControllerRef.current === controller) {
        detailAbortControllerRef.current = null;
      }
      if (detailRequestSeqRef.current === requestSeq && !queued) {
        detailInFlightNodeRef.current = null;
        setDetailLoading(false);
      }
    }
  }, [applyReadyDetail, clearDetailPolling, pollDetailJob, treeId]);

  const recordPhase4NodeEvent = useCallback(
    async (node: ApiLearningNode, eventType: "node_opened" | "node_completed") => {
      if (!phase4AuthToken || !activeSessionId) return;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: authHeaders(phase4AuthToken),
        body: JSON.stringify({
          session_id: activeSessionId,
          tree_id: treeId,
          node_id: node.id,
          concept_id: node.concept_id,
          event_type: eventType,
          event_payload: {
            title: node.title,
            progress: personalizationByNodeId.get(node.id)?.status ?? node.progress,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPhase4Error(data?.error?.message ?? "학습 이벤트를 저장하지 못했습니다.");
      }
    },
    [activeSessionId, personalizationByNodeId, phase4AuthToken, treeId],
  );

  const openNode = useCallback(
    async (nodeId: string) => {
      setSelectedId(nodeId);
      setModalOpen(true);
      const openedNode = tree?.nodes.find((node) => node.id === nodeId) ?? null;
      if (openedNode) {
        void recordPhase4NodeEvent(openedNode, "node_opened");
      }

      void loadDetail(nodeId);
    },
    [loadDetail, recordPhase4NodeEvent, tree],
  );

  const openRecommendedNode = useCallback(
    async (item: UiRecommendationItem) => {
      if (phase4AuthToken && item.recommendation_log_id) {
        const res = await fetch("/api/recommendations/click", {
          method: "POST",
          headers: authHeaders(phase4AuthToken),
          body: JSON.stringify({
            recommendation_log_id: item.recommendation_log_id,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setPhase4Error(data?.error?.message ?? "추천 클릭 로그를 저장하지 못했습니다.");
        }
      }
      await openNode(item.node_id);
    },
    [openNode, phase4AuthToken],
  );

  const closeDetailModal = useCallback(() => {
    detailRequestSeqRef.current += 1;
    detailAbortControllerRef.current?.abort();
    detailExtrasAbortControllerRef.current?.abort();
    clearDetailPolling();
    detailInFlightNodeRef.current = null;
    setDetailLoading(false);
    setDetailJobId(null);
    setDetailJobStatus(null);
    setDetailJobTimedOut(false);
    setModalOpen(false);
  }, [clearDetailPolling]);

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
      const res = await authenticatedFetch("/api/trees/generate", {
        method: "POST",
        body: JSON.stringify({
          topic: tree.topic,
          reuse_concepts: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRegenError(data?.error?.message ?? "다시 생성하지 못했습니다.");
        return;
      }
      const nextId = (data as { tree_id?: string }).tree_id;
      if (nextId) router.push(`/tree/${nextId}`);
    } catch (error) {
      setRegenError(error instanceof Error ? error.message : LOGIN_REQUIRED_MESSAGE);
    } finally {
      setRegenLoading(false);
    }
  };

  const onDeepDive = async (node: ApiLearningNode) => {
    if (!tree) return;
    const relationTitles = nodeRelations(tree, node)
      .slice(0, 4)
      .map((relation) => relation.node.title);
    const topic = buildDeepDiveGenerationTopic(node.title, relationTitles);

    setRegenElapsedSeconds(0);
    setRegenLoading(true);
    setRegenError(null);
    try {
      const res = await authenticatedFetch("/api/trees/generate", {
        method: "POST",
        body: JSON.stringify({
          topic,
          reuse_concepts: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRegenError(data?.error?.message ?? "세부 맵을 생성하지 못했습니다.");
        return;
      }
      const nextId = (data as { tree_id?: string }).tree_id;
      if (nextId) router.push(`/tree/${nextId}`);
    } catch (error) {
      setRegenError(error instanceof Error ? error.message : LOGIN_REQUIRED_MESSAGE);
    } finally {
      setRegenLoading(false);
    }
  };

  const startPhase4Session = async () => {
    if (!tree || !phase4AuthToken) return;
    setSessionBusy(true);
    setPhase4Error(null);
    setLatestReport(null);
    try {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers: authHeaders(phase4AuthToken),
        body: JSON.stringify({
          tree_id: tree.tree_id,
          document_id: tree.document_id ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase4Error(data?.error?.message ?? "학습 세션을 시작하지 못했습니다.");
        return;
      }
      setActiveSessionId((data as { session_id?: string }).session_id ?? null);
      await loadPhase4Data();
    } finally {
      setSessionBusy(false);
    }
  };

  const generatePhase4Report = async () => {
    if (!phase4AuthToken || !activeSessionId) return;
    setReportBusy(true);
    setPhase4Error(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: authHeaders(phase4AuthToken),
        body: JSON.stringify({
          report_type: "session",
          session_id: activeSessionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase4Error(data?.error?.message ?? "학습 리포트를 생성하지 못했습니다.");
        return;
      }
      setLatestReport(data as ApiSessionReportResponse);
    } finally {
      setReportBusy(false);
    }
  };

  const endPhase4Session = async () => {
    if (!phase4AuthToken || !activeSessionId) return;
    setSessionBusy(true);
    setPhase4Error(null);
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}/end`, {
        method: "POST",
        headers: authHeaders(phase4AuthToken),
        body: JSON.stringify({ generate_report: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase4Error(data?.error?.message ?? "학습 세션을 종료하지 못했습니다.");
        return;
      }
      setActiveSessionId(null);
      await loadPhase4Data();
    } finally {
      setSessionBusy(false);
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

          <section className="rounded-lg border border-zinc-800 bg-black p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">오늘의 다음 단계</h2>
              <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white">
                {nextStepItems.length}
              </span>
            </div>
            {recoError ? (
              <p className="mt-2 text-sm text-zinc-400">{recoError}</p>
            ) : nextStepItems.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {nextStepItems.map((item, index) => (
                  <button
                    key={item.node_id}
                    type="button"
                    onClick={() => void openRecommendedNode(item)}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm transition hover:border-emerald-700"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-700 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <strong className="line-clamp-2 block text-white">{item.title}</strong>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-400">
                        {item.reason}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">아직 다음 단계가 없습니다.</p>
            )}
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-400">학습 경로</span>
              <span className="text-xs font-semibold text-zinc-400">
                {filteredNodes.length}개 개념
              </span>
            </div>
            <div className="grid gap-2">
              {filteredNodes.map((node, index) => {
                const active = selectedId === node.id;
                const config = NODE_KIND_CONFIG[node.type];
                const Icon = config.icon;
                const personalized = personalizationByNodeId.get(node.id);
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
                        {PROGRESS_LABEL[personalized?.status ?? node.progress]}
                        {recommendedSet.has(node.id) ? " · 지금 볼 것" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <details className="rounded-lg border border-zinc-800 bg-black p-3">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              학습 도구
            </summary>
            <div className="mt-3 grid gap-3">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-400">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="개념 검색"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                />
              </label>

              <div className="flex flex-wrap gap-2">
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
                <Link
                  href="/"
                  className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 underline decoration-emerald-700 underline-offset-4"
                >
                  새 주제
                </Link>
              </div>

              {regenLoading ? (
                <GenerationLoadingPanel
                  title="재생성 중"
                  elapsedSeconds={regenElapsedSeconds}
                  stageMessage={generationStageMessage(regenElapsedSeconds)}
                  compact
                />
              ) : null}
              {regenError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {regenError} 다시 생성 버튼으로 재시도할 수 있습니다.
                </p>
              ) : null}

              <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">개인화 코치</h2>
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-300">
                    {activeSessionId ? "세션 중" : phase4AuthToken ? "대기" : "비활성"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void startPhase4Session()}
                    disabled={!phase4AuthToken || Boolean(activeSessionId) || sessionBusy}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2 text-xs font-semibold text-white hover:border-emerald-700 disabled:opacity-45"
                  >
                    <Play size={13} />
                    시작
                  </button>
                  <button
                    type="button"
                    onClick={() => void generatePhase4Report()}
                    disabled={!phase4AuthToken || !activeSessionId || reportBusy}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2 text-xs font-semibold text-white hover:border-emerald-700 disabled:opacity-45"
                  >
                    <FileText size={13} />
                    리포트
                  </button>
                  <button
                    type="button"
                    onClick={() => void endPhase4Session()}
                    disabled={!phase4AuthToken || !activeSessionId || sessionBusy}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2 text-xs font-semibold text-white hover:border-emerald-700 disabled:opacity-45"
                  >
                    <Square size={12} />
                    종료
                  </button>
                </div>
                {phase4Error ? (
                  <p className="mt-2 rounded-md border border-amber-700/40 bg-amber-950/40 px-2 py-1.5 text-xs text-amber-100">
                    {phase4Error}
                  </p>
                ) : null}
                {latestReport ? (
                  <div className="mt-3 rounded-md border border-zinc-800 bg-black p-2 text-xs">
                    <strong className="block text-white">{latestReport.title}</strong>
                    <p className="mt-1 line-clamp-3 text-zinc-400">{latestReport.summary}</p>
                    <div className="mt-2 grid gap-1 text-zinc-300">
                      {latestReport.recommendations.slice(0, 2).map((item) => (
                        <span key={item}>· {item}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">복습 큐</h2>
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-300">
                    {reviewItems.length}
                  </span>
                </div>
                {reviewItems.length > 0 ? (
                  <div className="mt-2 grid gap-2">
                    {reviewItems.map((item) => (
                      <div
                        key={item.concept_id}
                        className="rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="min-w-0 text-white">{item.title}</strong>
                          <span className="shrink-0 text-xs font-semibold text-emerald-400">
                            {Math.round(item.review_priority_score * 100)}%
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                          {item.reasons[0] ?? "복습 우선순위가 있습니다."}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-400">복습 대상이 없습니다.</p>
                )}
              </section>
            </div>
          </details>
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
                  {statusIcon(personalizationByNodeId.get(selectedNode.id)?.status ?? selectedNode.progress)}
                  {PROGRESS_LABEL[personalizationByNodeId.get(selectedNode.id)?.status ?? selectedNode.progress]}
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
              <span className="text-xs font-bold text-zinc-400">보기</span>
              <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                {VIEW_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setViewMode(option.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${
                        viewMode === option.id ? "bg-emerald-700 text-white" : "text-zinc-400"
                      }`}
                    >
                      <Icon size={13} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400">보기 범위</span>
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
              <label className="inline-flex min-h-7 cursor-pointer items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 text-xs font-bold text-zinc-300">
                <input
                  type="checkbox"
                  checked={hideKnownPrerequisites}
                  onChange={(event) => setHideKnownPrerequisites(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-600 accent-emerald-700"
                />
                안다 선수지식 접기
              </label>
            </div>
            <div className="text-xs font-bold text-zinc-400">
              {flow.visibleCount}개 개념 · {flow.edges.length}개 연결
            </div>
          </div>

          <div className="rootmap-flow-frame">
            {flowMounted ? (
              <ReactFlow
                nodes={flow.nodes}
                edges={flow.edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.2}
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
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center bg-zinc-950 text-sm font-semibold text-zinc-400">
                맵을 준비하는 중입니다.
              </div>
            )}
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
                    <div className="detail-badge-row">
                      <span className="detail-kind">{SECTION_LABEL[selectedNode.type]}</span>
                      <span className="detail-status-badge">
                        {
                          PROGRESS_LABEL[
                            personalizationByNodeId.get(selectedNode.id)?.status ??
                              selectedNode.progress
                          ]
                        }
                      </span>
                      {selectedNode.document_context ? (
                        <span className="detail-status-badge">
                          {documentSourceTypeLabel(selectedNode.document_context.source_type)}
                        </span>
                      ) : null}
                    </div>
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
                        <h3>{detailJobId ? "상세 설명 생성 중" : "불러오는 중"}</h3>
                        <p className="section-copy">
                          {detailJobId
                            ? detailJobStatus === "running"
                              ? "전체 상세 설명을 생성하고 있습니다."
                              : "상세 설명 생성 작업을 준비하고 있습니다."
                            : "상세 설명을 준비하고 있습니다."}
                        </p>
                      </div>
                    ) : detailJobTimedOut && detailJobId ? (
                      <div className="detail-section">
                        <h3>생성이 오래 걸리고 있습니다</h3>
                        <p className="section-copy">
                          상세 설명 생성이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 열면 이어서 확인할 수 있습니다.
                        </p>
                        <button
                          type="button"
                          className="detail-inline-button"
                          onClick={() => {
                            setDetailLoading(true);
                            pollDetailJob(selectedNode.id, detailJobId, detailRequestSeqRef.current, Date.now());
                          }}
                        >
                          다시 확인
                        </button>
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
                    ) : !detail ? (
                      <div className="detail-section">
                        <h3>상세 설명 대기 중</h3>
                        <p className="section-copy">전체 상세 설명이 준비되면 이곳에 표시됩니다.</p>
                      </div>
                    ) : (
                      (() => {
                        const easyExplanation =
                          detail.easy_explanation || "아직 설명이 없습니다.";
                        const whyItMatters =
                          detail.why_it_matters_for_document ??
                          detail.why_it_matters ??
                          "이 노드의 선수/후속 관계를 맵에서 확인하세요.";
                        const appliedContext =
                          detail.document_context_summary ||
                          detail.topic_context_line ||
                          `${SECTION_LABEL[selectedNode.type]} 흐름에서 다음 개념으로 이어집니다.`;
                        const misconception = detail.common_misconceptions?.[0];
                        const checkQuestions = detail.check_questions?.slice(0, 2) ?? [];

                        return (
                          <>
                            <VisualBlockRenderer blocks={detail.visual_blocks ?? []} />

                            <DetailLearningBlocks
                              node={selectedNode}
                              detail={detail}
                              sectionLabel={SECTION_LABEL}
                            />

                            <div className="detail-section">
                              <h3>핵심 3개</h3>
                              <ul className="detail-core-list">
                                <li>
                                  <span>무엇인가</span>
                                  <p>{easyExplanation}</p>
                                </li>
                                <li>
                                  <span>왜 필요한가</span>
                                  <p>{whyItMatters}</p>
                                </li>
                                <li>
                                  <span>어디에 쓰이는가</span>
                                  <p>{appliedContext}</p>
                                </li>
                              </ul>
                            </div>

                            {detail?.example ? (
                              <div className="detail-section">
                                <h3>예시 1개</h3>
                                <pre className="detail-code">{detail.example}</pre>
                              </div>
                            ) : null}

                            {misconception ? (
                              <div className="detail-section">
                                <h3>오해/주의 1개</h3>
                                <p className="section-copy">{misconception}</p>
                              </div>
                            ) : null}

                            <div className="detail-section">
                              <h3>확인 질문</h3>
                              {checkQuestions.length ? (
                                <ul className="detail-check-list">
                                  {checkQuestions.map((question, index) => (
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

                            <div className="detail-section">
                              <h3>다음 행동</h3>
                              <div className="detail-action-grid">
                                <button
                                  type="button"
                                  className="detail-inline-button is-primary"
                                  aria-label={`${selectedNode.title}을 이해한 상태로 저장`}
                                  disabled={progressBusy === selectedNode.id}
                                  onClick={() => void onProgressChange(selectedNode.id, "known")}
                                >
                                  이해했음
                                </button>
                                <button
                                  type="button"
                                  className="detail-inline-button"
                                  aria-label={`${selectedNode.title}을 애매한 상태로 저장`}
                                  disabled={progressBusy === selectedNode.id}
                                  onClick={() => void onProgressChange(selectedNode.id, "partial")}
                                >
                                  애매함
                                </button>
                                <button
                                  type="button"
                                  className="detail-inline-button"
                                  aria-label={`${selectedNode.title} 세부 학습 맵 생성`}
                                  disabled={regenLoading}
                                  onClick={() => void onDeepDive(selectedNode)}
                                >
                                  {regenLoading ? "생성 중" : "더 쪼개기"}
                                </button>
                                <button
                                  type="button"
                                  className="detail-inline-button"
                                  aria-label={
                                    nextActionNode
                                      ? `다음 개념 ${nextActionNode.title} 보기`
                                      : "다음 개념 없음"
                                  }
                                  disabled={!nextActionNode}
                                  onClick={() => {
                                    // eslint-disable-next-line react-hooks/refs -- event handler calls a ref-guarded request helper after render.
                                    if (nextActionNode) void openNode(nextActionNode.id);
                                  }}
                                >
                                  다음 개념 보기
                                </button>
                              </div>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </div>

                  <aside className="modal-side">
                    {(() => {
                      const personalized = personalizationByNodeId.get(selectedNode.id);
                      const confidence = confidencePercent(personalized?.confidence_score);
                      const currentProgress = personalized?.status ?? selectedNode.progress;
                      const reasons = personalized?.reasons ?? [];
                      const documentEvidence =
                        detail?.document_context?.evidence ??
                        selectedNode.document_context?.evidence ??
                        [];

                      return (
                        <details className="detail-section modal-more-details">
                          <summary>자세히 보기</summary>
                          <div className="more-detail-stack">
                            <div className="more-detail-group">
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

                            <div className="more-detail-group">
                              <h3>내 학습 상태</h3>
                              <div className="concept-metric">
                                <div className="concept-metric-header">
                                  <span>이해도</span>
                                  <strong>{confidence}%</strong>
                                </div>
                                <div className="concept-metric-bar">
                                  <div style={{ width: `${confidence}%` }} />
                                </div>
                                {personalized ? (
                                  <p className="section-copy">
                                    추천도 {Math.round(personalized.recommendation_score * 100)}%
                                    {personalized.is_recommended ? " · 지금 볼 것" : ""}
                                  </p>
                                ) : null}
                              </div>
                              {reasons.length > 0 ? (
                                <ul>
                                  {reasons.slice(0, 3).map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              ) : null}
                              <label className="modal-progress">
                                <span>{PROGRESS_LABEL[currentProgress]}</span>
                                <select
                                  value={currentProgress}
                                  disabled={progressBusy === selectedNode.id}
                                  onChange={(event) =>
                                    void onProgressChange(
                                      selectedNode.id,
                                      event.target.value as ProgressStatus,
                                    )
                                  }
                                >
                                  {(Object.keys(PROGRESS_LABEL) as ProgressStatus[]).map(
                                    (status) => (
                                      <option key={status} value={status}>
                                        {PROGRESS_LABEL[status]}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                              <button
                                type="button"
                                className="detail-inline-button"
                                disabled={!phase4AuthToken || !activeSessionId}
                                onClick={() =>
                                  void recordPhase4NodeEvent(selectedNode, "node_completed")
                                }
                              >
                                완료 이벤트 기록
                              </button>
                            </div>

                            <div className="more-detail-group">
                              <h3>전체 설명</h3>
                              <p className="section-copy">
                                {detail?.easy_explanation ||
                                  selectedNode.description ||
                                  "아직 설명이 없습니다."}
                              </p>
                              <p className="section-copy">
                                {detail?.why_it_matters_for_document ??
                                  detail?.why_it_matters ??
                                  "이 노드의 선수/후속 관계를 맵에서 확인하세요."}
                              </p>
                              {detail?.analogy ? (
                                <p className="section-copy">{detail.analogy}</p>
                              ) : null}
                            </div>

                            {selectedNode.document_context || detail?.document_context ? (
                              <div className="more-detail-group">
                                <h3>문서 근거 전체</h3>
                                {renderDocumentNodeContext(selectedNode)}
                                {documentEvidence.length > 0 ? (
                                  <div className="evidence-list">
                                    {documentEvidence.map((evidence, index) => (
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

                            {detail?.prerequisite_concepts?.length ? (
                              <div className="more-detail-group">
                                <h3>선수 개념</h3>
                                <ul>
                                  {detail.prerequisite_concepts.map((concept) => (
                                    <li key={concept.id}>{concept.title}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {detail?.related_concepts?.length ? (
                              <div className="more-detail-group">
                                <h3>관련 개념</h3>
                                <ul>
                                  {detail.related_concepts.map((concept) => (
                                    <li key={concept.id}>{concept.title}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {detail?.used_in_other_trees?.length ? (
                              <div className="more-detail-group">
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

                            {detailExtrasLoading ? (
                              <div className="more-detail-group">
                                <h3>연결 관계</h3>
                                <p className="section-copy">연결 관계를 불러오는 중입니다.</p>
                              </div>
                            ) : null}

                            {detailExtrasError ? (
                              <div className="more-detail-group">
                                <h3>연결 관계</h3>
                                <p className="section-copy">{detailExtrasError}</p>
                              </div>
                            ) : null}

                            {detail?.check_questions?.length ? (
                              <div className="more-detail-group">
                                <h3>전체 질문 목록</h3>
                                <ul>
                                  {detail.check_questions.map((question, index) => (
                                    <li key={`${question.question}-${index}`}>
                                      <strong>{question.question}</strong>
                                      <p>{question.answer}</p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {detail?.next_nodes?.length ? (
                              <div className="more-detail-group">
                                <h3>다음에 볼 것</h3>
                                <p className="section-copy">{detail.next_nodes.join(", ")}</p>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      );
                    })()}
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
