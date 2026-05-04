import {
  generateNodeDetail,
  type GenerateNodeDetailInput,
} from "@/lib/llm/generate-node-detail";
import type { LearningTreeBundle } from "@/lib/repository/learning-repository";
import {
  getLearningTree,
  saveNodeDetail,
} from "@/lib/repository/learning-repository";
import { DEFAULT_USER_ID } from "@/db/constants";
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
}

function toApiBody(
  dbId: string,
  nodeKey: string,
  d: NodeDetailResponse,
  qw: string[],
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

  if (nodeRow.detailJson) {
    return toApiBody(nodeId, nodeRow.nodeKey, nodeRow.detailJson, []);
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

  return toApiBody(nodeId, nodeRow.nodeKey, detail, qualityWarnings);
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
