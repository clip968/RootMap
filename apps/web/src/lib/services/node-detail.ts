import {
  generateNodeDetail,
  type GenerateNodeDetailInput,
} from "@/lib/llm/generate-node-detail";
import { getDb } from "@/db/client";
import type { LearningTreeBundle, LearningNodeRow } from "@/lib/repository/learning-repository";
import {
  getLearningTree,
  saveNodeDetail,
} from "@/lib/repository/learning-repository";
import { DEFAULT_USER_ID } from "@/db/constants";
import {
  getConceptById,
  listEdgesForConcept,
  listTreesUsingConcept,
  type ConceptRow,
} from "@/lib/repository/concept-repository";
import { buildPrerequisitePromptContext } from "@/lib/services/node-detail-context";
import type { NodeDetailResponse, NodeType } from "@/types/learning";

export interface ApiNodeDetailResponse {
  node_id: string;
  node_key: string;
  title: string;
  type: NodeType;
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: NodeDetailResponse["check_questions"];
  next_nodes: string[];
  quality_warnings: string[];
  concept_id: string | null;
  topic_context_line?: string;
  from_concept_store?: boolean;
  prerequisite_concepts?: Array<{ id: string; title: string }>;
  related_concepts?: Array<{ id: string; title: string }>;
  used_in_other_trees?: Array<{
    tree_id: string;
    topic: string;
    role_in_tree: string;
  }>;
}

function buildPanelGraph(
  conceptId: string,
  treeId: string,
): {
  prerequisite_concepts: Array<{ id: string; title: string }>;
  related_concepts: Array<{ id: string; title: string }>;
  used_in_other_trees: Array<{
    tree_id: string;
    topic: string;
    role_in_tree: string;
  }>;
} {
  const db = getDb();
  const edges = listEdgesForConcept(db, conceptId);
  const prereq: Array<{ id: string; title: string }> = [];
  const related: Array<{ id: string; title: string }> = [];
  const seenP = new Set<string>();
  const seenR = new Set<string>();
  for (const e of edges) {
    if (e.relationType === "prerequisite") {
      if (e.toConceptId === conceptId) {
        const o = getConceptById(db, e.fromConceptId);
        if (o && !seenP.has(o.id)) {
          seenP.add(o.id);
          prereq.push({ id: o.id, title: o.title });
        }
      } else if (e.fromConceptId === conceptId) {
        const o = getConceptById(db, e.toConceptId);
        if (o && !seenR.has(o.id)) {
          seenR.add(o.id);
          related.push({ id: o.id, title: o.title });
        }
      }
    } else {
      const oid =
        e.fromConceptId === conceptId ? e.toConceptId : e.fromConceptId;
      const o = getConceptById(db, oid);
      if (o && !seenR.has(o.id)) {
        seenR.add(o.id);
        related.push({ id: o.id, title: o.title });
      }
    }
  }
  const used = listTreesUsingConcept(db, conceptId)
    .filter((t) => t.treeId !== treeId)
    .map((t) => ({
      tree_id: t.treeId,
      topic: t.topic,
      role_in_tree: t.roleInTree,
    }));
  return {
    prerequisite_concepts: prereq,
    related_concepts: related,
    used_in_other_trees: used,
  };
}

function topicContextLine(topic: string, nodeTitle: string): string {
  return `현재 주제 「${topic}」를 학습하는 경로에서 「${nodeTitle}」는 흐름을 이어 주는 개념입니다.`;
}

function toApiBody(
  dbId: string,
  nodeKey: string,
  d: NodeDetailResponse,
  qw: string[],
  extras: Partial<
    Pick<
      ApiNodeDetailResponse,
      | "concept_id"
      | "topic_context_line"
      | "from_concept_store"
      | "prerequisite_concepts"
      | "related_concepts"
      | "used_in_other_trees"
    >
  >,
): ApiNodeDetailResponse {
  return {
    node_id: dbId,
    node_key: nodeKey,
    title: d.title,
    type: d.type,
    why_it_matters: d.why_it_matters,
    easy_explanation: d.easy_explanation,
    analogy: d.analogy,
    example: d.example,
    common_misconceptions: d.common_misconceptions,
    check_questions: d.check_questions,
    next_nodes: d.next_nodes,
    quality_warnings: qw,
    concept_id: extras.concept_id ?? null,
    topic_context_line: extras.topic_context_line,
    from_concept_store: extras.from_concept_store,
    prerequisite_concepts: extras.prerequisite_concepts,
    related_concepts: extras.related_concepts,
    used_in_other_trees: extras.used_in_other_trees,
  };
}

function responseFromStoredConcept(
  dbId: string,
  nodeKey: string,
  nodeRow: LearningNodeRow,
  c: ConceptRow,
  bundle: LearningTreeBundle,
  treeId: string,
): ApiNodeDetailResponse {
  const topic = bundle.tree.topic;
  const tline = topicContextLine(topic, nodeRow.title);
  const graph = buildPanelGraph(c.id, treeId);
  return {
    node_id: dbId,
    node_key: nodeKey,
    title: nodeRow.title,
    type: nodeRow.type,
    why_it_matters: tline,
    easy_explanation:
      (c.explanation?.trim() || c.shortDescription?.trim() || "").trim() ||
      "저장된 설명이 아직 없습니다.",
    analogy: "",
    example: c.examples[0] ?? "",
    common_misconceptions: c.commonMisconceptions,
    check_questions: [],
    next_nodes: nodeRow.children,
    quality_warnings: [],
    concept_id: c.id,
    topic_context_line: tline,
    from_concept_store: true,
    ...graph,
  };
}

export async function getOrCreateNodeDetail(params: {
  treeId: string;
  nodeId: string;
  bundle: LearningTreeBundle;
}): Promise<ApiNodeDetailResponse> {
  const { treeId, nodeId, bundle } = params;
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NODE_NOT_IN_TREE");
  }

  const extrasBase = (): Partial<ApiNodeDetailResponse> => {
    if (!nodeRow.conceptId) return { concept_id: null };
    const graph = buildPanelGraph(nodeRow.conceptId, treeId);
    return {
      concept_id: nodeRow.conceptId,
      topic_context_line: topicContextLine(bundle.tree.topic, nodeRow.title),
      prerequisite_concepts: graph.prerequisite_concepts,
      related_concepts: graph.related_concepts,
      used_in_other_trees: graph.used_in_other_trees,
    };
  };

  if (!nodeRow.detailJson && nodeRow.conceptId) {
    const c = getConceptById(getDb(), nodeRow.conceptId);
    if (c && (c.explanation?.trim() || c.shortDescription?.trim())) {
      return responseFromStoredConcept(
        nodeId,
        nodeRow.nodeKey,
        nodeRow,
        c,
        bundle,
        treeId,
      );
    }
  }

  if (nodeRow.detailJson) {
    return toApiBody(
      nodeId,
      nodeRow.nodeKey,
      nodeRow.detailJson,
      [],
      extrasBase(),
    );
  }

  const prereqContext = buildPrerequisitePromptContext(
    nodeRow,
    bundle.nodes,
    bundle.tree.treeJson.recommended_order,
  );

  const llmInput: GenerateNodeDetailInput = {
    topic: bundle.tree.topic,
    nodeId: nodeRow.nodeKey,
    nodeTitle: nodeRow.title,
    nodeType: nodeRow.type,
    prerequisitesContext: prereqContext,
  };

  const { detail, qualityWarnings } = await generateNodeDetail(llmInput);
  const saved = saveNodeDetail(nodeId, detail);
  if (!saved) {
    throw new Error("DETAIL_SAVE_FAILED");
  }

  return toApiBody(nodeId, nodeRow.nodeKey, detail, qualityWarnings, {
    ...extrasBase(),
    from_concept_store: false,
  });
}

export async function getOrCreateNodeDetailForRequest(
  treeId: string,
  nodeId: string,
): Promise<ApiNodeDetailResponse> {
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    throw new Error("NOT_FOUND");
  }
  const nodeRow = bundle.nodes.find((n) => n.id === nodeId);
  if (!nodeRow || nodeRow.treeId !== treeId) {
    throw new Error("NOT_FOUND");
  }
  return getOrCreateNodeDetail({ treeId, nodeId, bundle });
}
