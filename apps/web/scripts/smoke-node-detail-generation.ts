/**
 * 노드 상세 생성 품질 스모크(API/LLM 호출 없음)
 *
 * Concept Store에 짧은 설명이 있어도 detailJson이 없으면 full detail 생성이
 * 먼저 실행되어야 한다. 짧은 Concept 설명은 LLM 실패 fallback으로만 사용한다.
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
import { DEFAULT_USER_ID } from "../src/db/constants";
import {
  createFullLearningTree,
  getLearningTree,
} from "../src/lib/repository/learning-repository";
import { getOrCreateNodeDetail } from "../src/lib/services/node-detail";
import type {
  LearningTreeNode,
  LearningTreeResponse,
  NodeDetailResponse,
  NodeType,
} from "../src/types/learning";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function setupDb(): void {
  const dbRel = path.join("data", "node-detail-generation-smoke.db");
  const dbAbs = path.join(process.cwd(), dbRel);
  process.env.DATABASE_URL = `file:${dbAbs}`;

  resetDbSingleton();
  fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
  try {
    fs.unlinkSync(dbAbs);
  } catch {
    /* noop */
  }
  resetDbSingleton();
  migrate(getDb(), { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

function node(
  id: string,
  title: string,
  type: NodeType,
  shortDescription: string,
): LearningTreeNode {
  return {
    id,
    title,
    type,
    description: shortDescription,
    difficulty: 2,
    prerequisites: [],
    children: [],
    concept_candidate: {
      canonical_title: title,
      aliases: [],
      domain: "operating_system",
      short_description: shortDescription,
      is_reusable: true,
    },
  };
}

function detail(nodeId: string): NodeDetailResponse {
  return {
    node_id: nodeId,
    title: "CPU 이용률 (CPU Utilization)",
    type: "prerequisite",
    why_it_matters:
      "CPU 이용률은 스케줄링 알고리즘이 CPU를 얼마나 쉬지 않고 활용하는지 판단하는 핵심 기준입니다.",
    easy_explanation:
      "CPU 이용률은 전체 시간 중 CPU가 실제로 프로세스를 실행한 시간의 비율입니다. 운영체제 스케줄러는 대기 시간, 응답 시간과 함께 이 값을 보며 CPU가 놀지 않도록 작업 순서를 조정합니다.",
    analogy:
      "공장 기계가 하루 중 실제로 제품을 만든 시간의 비율을 보는 것과 비슷합니다.",
    example:
      "10초 중 8초 동안 프로세스를 실행했다면 CPU 이용률은 80%입니다.",
    common_misconceptions: [
      "CPU 이용률이 항상 100%에 가까울수록 좋은 것은 아닙니다.",
    ],
    check_questions: [
      {
        question: "CPU 이용률은 무엇의 비율인가요?",
        answer: "전체 시간 중 CPU가 실제 작업을 수행한 시간의 비율입니다.",
      },
    ],
    next_nodes: ["scheduling_criteria"],
  };
}

async function main(): Promise<void> {
  setupDb();

  const tree: LearningTreeResponse = {
    topic: "운영체제 스케줄링",
    summary: "CPU 스케줄링 기준을 학습합니다.",
    nodes: [
      node(
        "cpu_utilization",
        "CPU 이용률 (CPU Utilization)",
        "prerequisite",
        "CPU 사용 효율 지표.",
      ),
    ],
    recommended_order: ["cpu_utilization"],
    edges: [],
  };

  const treeId = createFullLearningTree(
    tree.topic,
    tree.summary,
    tree,
    DEFAULT_USER_ID,
    { reuseConcepts: true },
  );
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  assert(bundle, "tree bundle should exist");
  const nodeRow = bundle.nodes[0];
  assert(nodeRow, "node row should exist");
  assert(nodeRow.conceptId, "fixture should be linked to Concept Store");
  assert(!nodeRow.detailJson, "fixture should start without detailJson");

  let generated = false;
  const result = await getOrCreateNodeDetail({
    treeId,
    nodeId: nodeRow.id,
    bundle,
    generateGenericNodeDetail: async () => {
      generated = true;
      return { detail: detail(nodeRow.nodeKey), qualityWarnings: [] };
    },
  });

  assert(generated, "full detail generator should run before Concept fallback");
  assert(result.from_concept_store === false, "result should not be Concept fallback");
  assert(
    result.easy_explanation.length > "CPU 사용 효율 지표.".length,
    "result should contain generated full explanation",
  );
  assert(result.example.length > 0, "generated detail should include example");
  assert(
    result.check_questions.length > 0,
    "generated detail should include check questions",
  );

  console.info("[node-detail-generation-smoke] ok");
}

main().catch((err) => {
  console.error("[node-detail-generation-smoke] failed", err);
  process.exitCode = 1;
});
