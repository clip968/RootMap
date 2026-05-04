/**
 * Phase 2 Concept Store 품질 스모크(API/LLM 호출 없음)
 *
 * 명세 §18의 4개 테스트 케이스를 fixture 기반으로 반복 검증한다.
 * 실행: npm run phase2:smoke (apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
import { DEFAULT_USER_ID } from "../src/db/constants";
import { conceptEdges, conceptMergeCandidates, concepts, learningTreeConcepts, userConceptProgress } from "../src/db/schema";
import { normalizeTitle } from "../src/lib/concepts/normalize";
import { listConceptMergeCandidates, listConcepts } from "../src/lib/repository/concept-repository";
import {
  createFullLearningTree,
  getConceptProgressMapForUser,
  getLearningTree,
  saveNodeDetail,
  upsertUserConceptProgress,
} from "../src/lib/repository/learning-repository";
import { getOrCreateNodeDetail } from "../src/lib/services/node-detail";
import type { ConceptRelationType, LearningTreeNode, LearningTreeResponse, NodeDetailResponse, NodeType } from "../src/types/learning";

type EdgeSpec = { from: string; to: string; relation_type: ConceptRelationType; reason: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function node(
  id: string,
  title: string,
  type: NodeType,
  difficulty: number,
  prerequisites: string[],
  children: string[],
  aliases: string[] = [],
  domain = "machine_learning",
): LearningTreeNode {
  return {
    id,
    title,
    type,
    description: `${title}를 학습 경로 안에서 이해하기 위한 개념입니다.`,
    difficulty,
    prerequisites,
    children,
    concept_candidate: {
      canonical_title: title,
      aliases,
      domain,
      short_description: `${title} 핵심 설명`,
      is_reusable: true,
    },
  };
}

function tree(topic: string, nodes: LearningTreeNode[], edges: EdgeSpec[]): LearningTreeResponse {
  return {
    topic,
    summary: `${topic} 학습 트리`,
    nodes,
    edges,
    recommended_order: nodes.map((n) => n.id),
  };
}

function sampleDetail(nodeId: string, title: string, type: NodeType): NodeDetailResponse {
  return {
    node_id: nodeId,
    title,
    type,
    why_it_matters: `${title}는 다음 개념으로 넘어가기 위한 발판입니다.`,
    easy_explanation: `${title} 저장된 Concept 설명입니다. 다른 트리에서도 재사용되어야 합니다.`,
    analogy: "기초 블록을 먼저 맞추는 것과 비슷합니다.",
    example: `${title} 예시`,
    common_misconceptions: [`${title}를 관련 개념과 같은 것으로 병합하면 안 됩니다.`],
    check_questions: [{ question: `${title}가 왜 필요한가요?`, answer: "뒤 개념의 전제가 되기 때문입니다." }],
    next_nodes: [],
  };
}

function setupSmokeDb(): void {
  const dbRel = path.join("data", "phase2-smoke.db");
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

function cleanupSmokeDb(): void {
  const dbAbs = path.join(process.cwd(), "data", "phase2-smoke.db");
  resetDbSingleton();
  try {
    fs.unlinkSync(dbAbs);
  } catch {
    /* noop */
  }
}

function transformerTree(): LearningTreeResponse {
  return tree(
    "Transformer",
    [
      node("vector", "Vector", "prerequisite", 1, [], ["dot_product"]),
      node("dot_product", "Dot product", "prerequisite", 2, ["vector"], ["self_attention"]),
      node("softmax", "Softmax", "prerequisite", 2, ["vector"], ["self_attention"], ["softmax", "소프트맥스", "softmax function"]),
      node("embedding", "Embedding", "prerequisite", 2, [], ["transformer"]),
      node("positional_encoding", "Positional encoding", "core", 3, ["embedding"], ["transformer"]),
      node("self_attention", "Self-attention", "core", 4, ["dot_product", "softmax"], ["transformer"]),
      node("transformer", "Transformer", "core", 4, ["self_attention", "positional_encoding", "embedding"], []),
    ],
    [
      { from: "vector", to: "dot_product", relation_type: "prerequisite", reason: "dot product는 vector 연산입니다." },
      { from: "softmax", to: "self_attention", relation_type: "prerequisite", reason: "attention score 정규화에 softmax가 쓰입니다." },
      { from: "self_attention", to: "transformer", relation_type: "part_of", reason: "self-attention은 Transformer 구성 요소입니다." },
    ],
  );
}

function bertTree(): LearningTreeResponse {
  return tree(
    "BERT",
    [
      node("embedding", "Embedding", "prerequisite", 2, [], ["transformer"]),
      node("softmax", "Softmax", "prerequisite", 2, [], ["masked_language_modeling"], ["softmax", "소프트맥스", "softmax function"]),
      node("self_attention", "Self-attention", "prerequisite", 4, ["embedding"], ["transformer"]),
      node("positional_encoding", "Positional encoding", "prerequisite", 3, ["embedding"], ["transformer"]),
      node("transformer", "Transformer", "core", 4, ["self_attention", "positional_encoding", "embedding"], ["bert"]),
      node("bert", "BERT", "core", 4, ["transformer"], ["masked_language_modeling"]),
      node("masked_language_modeling", "Masked language modeling", "core", 3, ["bert", "softmax"], []),
    ],
    [
      { from: "transformer", to: "bert", relation_type: "prerequisite", reason: "BERT는 Transformer encoder 기반입니다." },
      { from: "self_attention", to: "bert", relation_type: "prerequisite", reason: "BERT의 문맥화 표현은 self-attention을 사용합니다." },
    ],
  );
}

function singleConceptTree(topic: string, conceptTitle: string, aliases: string[]): LearningTreeResponse {
  return tree(topic, [node("concept", conceptTitle, "core", 2, [], [], aliases)], []);
}

function attentionFamilyTree(): LearningTreeResponse {
  return tree(
    "Attention variants",
    [
      node("attention", "Attention", "core", 2, [], ["self_attention"]),
      node("self_attention", "Self-Attention", "core", 3, ["attention"], ["multi_head_attention"]),
      node("multi_head_attention", "Multi-Head Attention", "core", 4, ["self_attention"], []),
      node("cross_attention", "Cross Attention", "supplementary", 4, ["attention"], []),
    ],
    [
      { from: "self_attention", to: "attention", relation_type: "part_of", reason: "self-attention은 attention 계열의 한 형태입니다." },
      { from: "multi_head_attention", to: "self_attention", relation_type: "part_of", reason: "multi-head attention은 self-attention을 여러 head로 확장합니다." },
      { from: "cross_attention", to: "attention", relation_type: "related", reason: "cross attention은 별도 attention 변형입니다." },
    ],
  );
}

function assertAllNodesLinked(treeId: string, expectedNodeCount: number): void {
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  assert(bundle, `tree not found: ${treeId}`);
  assert(bundle.nodes.length === expectedNodeCount, "stored node count mismatch");
  assert(bundle.nodes.every((n) => n.conceptId), "every learning node must have concept_id");

  const db = getDb();
  const links = db
    .select()
    .from(learningTreeConcepts)
    .where(eq(learningTreeConcepts.treeId, treeId))
    .all();
  assert(links.length === expectedNodeCount, "learning_tree_concepts link count mismatch");
}

async function main(): Promise<void> {
  setupSmokeDb();
  const db = getDb();

  // 케이스 1: Transformer → BERT 재사용
  const transformer = transformerTree();
  const transformerTreeId = createFullLearningTree(transformer.topic, transformer.summary, transformer, DEFAULT_USER_ID, { reuseConcepts: true });
  assertAllNodesLinked(transformerTreeId, transformer.nodes.length);
  assert(db.select().from(conceptEdges).all().length >= 3, "concept_edges must be persisted");

  const transformerBundle = getLearningTree(transformerTreeId, DEFAULT_USER_ID)!;
  const transformerSoftmax = transformerBundle.nodes.find((n) => n.nodeKey === "softmax")!;
  assert(saveNodeDetail(transformerSoftmax.id, sampleDetail(transformerSoftmax.nodeKey, transformerSoftmax.title, transformerSoftmax.type)), "detail save should update node and concept explanation");

  const bert = bertTree();
  const bertTreeId = createFullLearningTree(bert.topic, bert.summary, bert, DEFAULT_USER_ID, { reuseConcepts: true });
  assertAllNodesLinked(bertTreeId, bert.nodes.length);
  const bertBundle = getLearningTree(bertTreeId, DEFAULT_USER_ID)!;
  for (const key of ["transformer", "self_attention", "embedding"]) {
    assert(bertBundle.nodes.find((n) => n.nodeKey === key)?.isReusedConcept === true, `BERT should reuse ${key}`);
  }
  assert(bertBundle.nodes.find((n) => n.nodeKey === "masked_language_modeling")?.isReusedConcept === false, "masked language modeling should be newly created");

  const bertSoftmax = bertBundle.nodes.find((n) => n.nodeKey === "softmax")!;
  const reusedDetail = await getOrCreateNodeDetail({ treeId: bertTreeId, nodeId: bertSoftmax.id, bundle: bertBundle });
  assert(reusedDetail.from_concept_store === true, "existing Concept explanation should be reused in another tree");

  upsertUserConceptProgress(DEFAULT_USER_ID, bertSoftmax.conceptId!, "known");
  assert(getConceptProgressMapForUser(DEFAULT_USER_ID).get(bertSoftmax.conceptId!) === "known", "concept progress should be stored per concept");
  assert(db.select().from(userConceptProgress).all().length >= 1, "user_concept_progress row missing");

  // 케이스 2: Rust lifetime → Borrow checker 재사용
  const rustLifetime = tree("Rust lifetime", [
    node("ownership", "Ownership", "prerequisite", 1, [], ["borrowing"], [], "rust"),
    node("borrowing", "Borrowing", "prerequisite", 2, ["ownership"], ["reference"], [], "rust"),
    node("reference", "Reference", "prerequisite", 2, ["borrowing"], ["lifetime"], [], "rust"),
    node("scope", "Scope", "prerequisite", 2, ["reference"], ["lifetime"], [], "rust"),
    node("lifetime", "Lifetime", "core", 3, ["scope", "borrowing"], [], ["Rust lifetime"], "rust"),
  ], [
    { from: "ownership", to: "borrowing", relation_type: "prerequisite", reason: "borrowing은 ownership 규칙 위에 있습니다." },
  ]);
  createFullLearningTree(rustLifetime.topic, rustLifetime.summary, rustLifetime, DEFAULT_USER_ID, { reuseConcepts: true });
  const borrowChecker = tree("Borrow checker", [
    node("ownership", "Ownership", "prerequisite", 1, [], ["borrowing"], [], "rust"),
    node("borrowing", "Borrowing", "prerequisite", 2, ["ownership"], ["borrow_checker"], [], "rust"),
    node("reference", "Reference", "prerequisite", 2, ["borrowing"], ["borrow_checker"], [], "rust"),
    node("lifetime", "Lifetime", "prerequisite", 3, ["reference"], ["borrow_checker"], ["Rust lifetime"], "rust"),
    node("borrow_checker", "Borrow checker", "core", 4, ["ownership", "borrowing", "reference", "lifetime"], [], [], "rust"),
  ], []);
  const borrowTreeId = createFullLearningTree(borrowChecker.topic, borrowChecker.summary, borrowChecker, DEFAULT_USER_ID, { reuseConcepts: true });
  const borrowBundle = getLearningTree(borrowTreeId, DEFAULT_USER_ID)!;
  for (const key of ["ownership", "borrowing", "reference", "lifetime"]) {
    assert(borrowBundle.nodes.find((n) => n.nodeKey === key)?.isReusedConcept === true, `Borrow checker should reuse ${key}`);
  }

  // 케이스 3: Softmax 표현 중복 처리
  createFullLearningTree("Softmax", "Softmax", singleConceptTree("Softmax", "Softmax", ["softmax", "소프트맥스", "softmax function"]), DEFAULT_USER_ID, { reuseConcepts: true });
  createFullLearningTree("소프트맥스", "소프트맥스", singleConceptTree("소프트맥스", "소프트맥스", ["softmax", "softmax function"]), DEFAULT_USER_ID, { reuseConcepts: true });
  createFullLearningTree("softmax function", "softmax function", singleConceptTree("softmax function", "softmax function", ["softmax", "소프트맥스"]), DEFAULT_USER_ID, { reuseConcepts: true });
  createFullLearningTree("Transformer attention", "Transformer attention", tree("Transformer attention", [node("softmax", "Softmax", "prerequisite", 2, [], [], ["softmax", "소프트맥스", "softmax function"])], []), DEFAULT_USER_ID, { reuseConcepts: true });

  const softmaxConcepts = db.select().from(concepts).all().filter((c) => {
    const terms = new Set([c.normalizedTitle, normalizeTitle(c.title), ...c.aliases.map(normalizeTitle)]);
    return terms.has("softmax") || terms.has("소프트맥스") || terms.has("softmax function");
  });
  assert(softmaxConcepts.length === 1, `Softmax variants should remain one Concept, got ${softmaxConcepts.length}`);
  const softmaxAliases = new Set(softmaxConcepts[0]!.aliases.map(normalizeTitle));
  assert(softmaxAliases.has("소프트맥스"), "Softmax aliases should include 소프트맥스");
  assert(softmaxAliases.has("softmax function"), "Softmax aliases should include softmax function");
  assert(listConcepts(db, { search: "softmax", limit: 20 }).length >= 1, "concept search should find Softmax");

  // 케이스 4: 비슷하지만 다른 Attention 계열 분리
  const attention = attentionFamilyTree();
  const attentionTreeId = createFullLearningTree(attention.topic, attention.summary, attention, DEFAULT_USER_ID, { reuseConcepts: true });
  const attentionBundle = getLearningTree(attentionTreeId, DEFAULT_USER_ID)!;
  const attentionConceptIds = attentionBundle.nodes.map((n) => n.conceptId);
  assert(new Set(attentionConceptIds).size === attention.nodes.length, "Attention variants must stay as distinct Concepts");
  const attentionId = attentionBundle.nodes.find((n) => n.nodeKey === "attention")?.conceptId;
  const selfAttentionId = attentionBundle.nodes.find((n) => n.nodeKey === "self_attention")?.conceptId;
  const multiHeadId = attentionBundle.nodes.find((n) => n.nodeKey === "multi_head_attention")?.conceptId;
  assert(attentionId !== selfAttentionId, "Self-Attention should not be merged into Attention");
  assert(attentionId !== multiHeadId, "Multi-Head Attention should not be merged into Attention");
  const nonPrereqEdges = db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(conceptEdges)
    .where(sql`${conceptEdges.relationType} in ('related', 'part_of')`)
    .all()[0]?.count ?? 0;
  assert(nonPrereqEdges >= 3, "Attention variants should be connected with related/part_of edges");

  const pendingMergeCandidates = listConceptMergeCandidates(db, { status: "pending", limit: 50 });
  assert(pendingMergeCandidates.length >= 1, "ambiguous similar concepts should create pending merge candidates");
  assert(db.select().from(conceptMergeCandidates).all().length >= pendingMergeCandidates.length, "merge candidate table should be queryable");

  cleanupSmokeDb();
  console.log("phase2:smoke OK");
}

main().catch((error) => {
  cleanupSmokeDb();
  console.error(error);
  process.exit(1);
});
