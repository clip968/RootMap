/**
 * 저장소 계층 스모크: 임시 DB 파일에 마이그레이션 적용 후 CRUD를 검증한다.
 * 실행: npm run db:smoke (apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
import { concepts, documentConcepts } from "../src/db/schema";
import { resolveAndSaveDocumentConcepts } from "../src/lib/document/processor";
import { allocateUniqueSlug, insertConceptFromCandidate } from "../src/lib/repository/concept-repository";
import {
  createLearningNodes,
  createLearningTree,
  DEFAULT_USER_ID,
  getLearningTree,
  getNodeById,
  getProgressByTree,
  initializeNodeProgress,
  saveNodeDetail,
  updateNodeProgress,
} from "../src/lib/repository/learning-repository";
import {
  bulkInsertDocumentChunks,
  bulkInsertDocumentConcepts,
  bulkInsertDocumentPages,
  createDocument,
  createDocumentLearningTreeLink,
  getDocumentForUser,
  updateDocumentStatus,
} from "../src/lib/repository/document-repository";
import type { ConsolidatedConcept, LearningTreeResponse, NodeDetailResponse } from "../src/types/learning";

const dbRel = path.join("data", "smoke.db");
const dbAbs = path.join(process.cwd(), dbRel);
process.env.DATABASE_URL = `file:${dbAbs}`;

resetDbSingleton();
fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
try {
  fs.unlinkSync(dbAbs);
} catch {
  /* 없을 수 있음 */
}
resetDbSingleton();

const db = getDb();
migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

const treeJson: LearningTreeResponse = {
  topic: "스모크 주제",
  summary: "요약",
  nodes: [
    {
      id: "llm-key-1",
      title: "노드 1",
      type: "core",
      description: "설명",
      difficulty: 2,
      prerequisites: [],
      children: [],
    },
  ],
  recommended_order: ["llm-key-1"],
};

const treeId = createLearningTree("스모크 주제", "요약", treeJson);
const created = createLearningNodes(treeId, treeJson.nodes);
initializeNodeProgress(DEFAULT_USER_ID, treeId, created.map((c) => c.id));

const bundle = getLearningTree(treeId);
if (!bundle) throw new Error("getLearningTree returned null");
if (bundle.nodes.length !== 1) throw new Error("nodes count");
if (bundle.progress.length !== 1) throw new Error("progress count");
if (bundle.progress[0]?.status !== "unknown") throw new Error("default progress");

const nodeId = bundle.nodes[0]!.id;
const node = getNodeById(nodeId);
if (!node) throw new Error("getNodeById");

const detail: NodeDetailResponse = {
  node_id: node.nodeKey,
  title: node.title,
  type: node.type,
  why_it_matters: "x",
  easy_explanation: "x",
  analogy: "x",
  example: "x",
  common_misconceptions: [],
  check_questions: [],
  next_nodes: [],
};
if (!saveNodeDetail(nodeId, detail)) throw new Error("saveNodeDetail");
const withDetail = getNodeById(nodeId);
if (!withDetail?.detailJson) throw new Error("detail not persisted");

if (!updateNodeProgress(DEFAULT_USER_ID, nodeId, "known")) {
  throw new Error("updateNodeProgress");
}
const prog = getProgressByTree(DEFAULT_USER_ID, treeId);
if (prog[0]?.status !== "known") throw new Error("progress not updated");

const documentId = createDocument({
  userId: DEFAULT_USER_ID,
  title: "문서 스모크",
  originalFilename: "smoke.md",
  fileType: "md",
  fileSizeBytes: 128,
  pageCount: 1,
  extractedTextLength: 36,
  metadata: { source: "smoke" },
});
const document = getDocumentForUser(documentId, DEFAULT_USER_ID);
if (!document) throw new Error("document not found for user");
if (document.processingStatus !== "uploaded") {
  throw new Error("document default status");
}

updateDocumentStatus(documentId, "text_extracted");
const extractedDocument = getDocumentForUser(documentId, DEFAULT_USER_ID);
if (extractedDocument?.processingStatus !== "text_extracted") {
  throw new Error("document status not updated");
}

bulkInsertDocumentPages(documentId, [
  { pageNumber: 1, text: "RootMap 문서 기반 학습" },
]);
const chunks = bulkInsertDocumentChunks(documentId, [
  {
    chunkIndex: 0,
    pageStart: 1,
    pageEnd: 1,
    sectionTitle: "개요",
    text: "RootMap은 문서를 학습 트리로 바꾼다. Softmax normalizes attention scores. A page fault is different from a page.",
    tokenCount: 12,
    metadata: { headingLevel: 1 },
  },
]);
const chunkId = chunks[0]?.id;
if (!chunkId) throw new Error("document chunk missing");
const docConcepts = bulkInsertDocumentConcepts(documentId, [
  {
    conceptId: null,
    conceptTitle: "문서 기반 학습",
    conceptType: "document_core",
    importance: 5,
    difficulty: 2,
    sourceType: "explicit",
    evidence: [
      {
        documentId,
        chunkId: null,
        pageStart: 1,
        pageEnd: 1,
        sectionTitle: "개요",
        snippet: "문서를 학습 트리로 바꾼다.",
      },
    ],
  },
]);
if (docConcepts.length !== 1) throw new Error("document concepts insert");

const softmaxConcept = insertConceptFromCandidate(
  db,
  {
    canonical_title: "Softmax",
    aliases: ["softmax", "softmax function"],
    domain: "machine_learning",
    short_description: "attention score를 확률처럼 정규화하는 함수",
    is_reusable: true,
  },
  allocateUniqueSlug("Softmax", db),
);
const pageConcept = insertConceptFromCandidate(
  db,
  {
    canonical_title: "Page",
    aliases: [],
    domain: "operating_systems",
    short_description: "메모리를 고정 크기로 나눈 단위",
    is_reusable: true,
  },
  allocateUniqueSlug("Page", db),
);
const resolvedConcepts: ConsolidatedConcept[] = [
  {
    canonical_title: "소프트맥스",
    aliases: ["Softmax"],
    type: "prerequisite",
    importance: 4,
    difficulty: 2,
    source_type: "explicit",
    evidence: [
      {
        chunk_id: chunkId,
        page_start: 1,
        page_end: 1,
        section_title: "개요",
      },
    ],
  },
  {
    canonical_title: "Page Fault",
    aliases: [],
    type: "document_core",
    importance: 5,
    difficulty: 3,
    source_type: "explicit",
    evidence: [
      {
        chunk_id: chunkId,
        page_start: 1,
        page_end: 1,
        section_title: "개요",
      },
    ],
  },
  {
    canonical_title: "Memory Address",
    aliases: [],
    type: "prerequisite",
    importance: 3,
    difficulty: 2,
    source_type: "inferred",
    evidence: [],
  },
];

const resolvedRows = resolveAndSaveDocumentConcepts(documentId, resolvedConcepts);
if (resolvedRows.length !== 3) throw new Error("resolved document concepts count");

const savedDocumentConcepts = db
  .select()
  .from(documentConcepts)
  .where(eq(documentConcepts.documentId, documentId))
  .all();
const softmaxDocumentConcept = savedDocumentConcepts.find((concept) => concept.conceptTitle === "소프트맥스");
if (softmaxDocumentConcept?.conceptId !== softmaxConcept.id) {
  throw new Error("document concept should reuse Softmax by alias");
}
const softmaxEvidence = softmaxDocumentConcept.evidence as Array<{ snippet?: string }>;
if (!softmaxEvidence[0]?.snippet?.includes("Softmax")) {
  throw new Error("explicit document concept should keep chunk evidence snippet");
}
const pageFaultDocumentConcept = savedDocumentConcepts.find((concept) => concept.conceptTitle === "Page Fault");
if (!pageFaultDocumentConcept?.conceptId || pageFaultDocumentConcept.conceptId === pageConcept.id) {
  throw new Error("Page Fault must be stored as a distinct Concept from Page");
}
const inferredDocumentConcept = savedDocumentConcepts.find((concept) => concept.conceptTitle === "Memory Address");
if (!inferredDocumentConcept?.conceptId || inferredDocumentConcept.sourceType !== "inferred") {
  throw new Error("inferred document concept should be connected and keep source_type");
}
if ((inferredDocumentConcept.evidence as unknown[]).length !== 0) {
  throw new Error("inferred document concept should not keep direct evidence");
}
const softmaxRows = db.select().from(concepts).where(eq(concepts.title, "Softmax")).all();
if (softmaxRows.length !== 1) throw new Error("Softmax alias match should not create duplicate Concept");

createDocumentLearningTreeLink(documentId, treeId);
const linkedDocument = getDocumentForUser(documentId, DEFAULT_USER_ID);
if (!linkedDocument) throw new Error("linked document disappeared");

resetDbSingleton();
try {
  fs.unlinkSync(dbAbs);
} catch {
  /* noop */
}

console.log("db:smoke OK");
