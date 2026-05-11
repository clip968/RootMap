/**
 * 저장소 계층 스모크: 임시 DB 파일에 마이그레이션 적용 후 CRUD를 검증한다.
 * 실행: npm run db:smoke (apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbSingleton } from "../src/db/client";
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
import type { LearningTreeResponse, NodeDetailResponse } from "../src/types/learning";

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
bulkInsertDocumentChunks(documentId, [
  {
    chunkIndex: 0,
    pageStart: 1,
    pageEnd: 1,
    sectionTitle: "개요",
    text: "RootMap은 문서를 학습 트리로 바꾼다.",
    tokenCount: 12,
    metadata: { headingLevel: 1 },
  },
]);
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
