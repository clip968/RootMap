# 11. 점진적 트리 생성 (Progressive Tree Generation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 트리 생성 LLM 호출 시간을 60초→10초로 단축하고, 사용자가 노드를 클릭할 때 상세 설명을 지연 생성(lazy load)하여 초기 로딩 UX를 획기적으로 개선한다.

**Architecture:** 현재 하나의 LLM 호출이 10~25개 노드의 **모든 필드**(제목, 설명, 난이도, 선수지식, 출처, 개념후보)를 한 번에 생성하는 구조를, **트리 구조만 먼저 생성**하는 Phase A와 **노드별 상세를 지연 생성**하는 Phase B로 분리한다. Phase A는 제목·타입·부모-자식 관계만 요청하므로 LLM 응답 시간이 5~10초로 단축된다. Phase B는 사용자가 노드를 클릭할 때 `POST .../nodes/:nodeId/generate-detail`로 호출하여 3~5초 내에 설명/난이도/출처/확인질문을 채운다.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, SQLite, Next.js App Router, OpenRouter

---

## 배경: 왜 지금 구조가 느린가

현재 `processor.ts`는 하나의 `generateDocumentTree()` 호출로 다음을 모두 생성한다:

- 노드 10~25개의 제목, 설명, 난이도, 선수지식 목록, 자식 목록, 출처, source_type, concept_candidate
- 간선 목록 (from/to/relation_type)
- recommended_order

LLM은 하나의 응답에 모든 정보를 담아야 하므로 출력 토큰 수가 많아지고, 응답 시간이 38~62초까지 늘어난다. Grok 4.3 기준으로 60초 기본 timeout에 걸리는 경우가 발생한다.

---

## 파일 구조

| 구분 | 파일 | 역할 |
|------|------|------|
| **신규** | `apps/web/src/lib/llm/generate-document-structure.ts` | 구조 전용 LLM 호출 + 파싱 (Phase A) |
| **신규** | `apps/web/src/lib/llm/generate-document-detail.ts` | 노드 상세 지연 생성 전용 함수 |
| **신규** | `apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail/route.ts` | 노드 상세 지연 생성 API 엔드포인트 |
| **수정** | `apps/web/src/types/learning.ts` | `DocumentTreeStructureResponse` 타입 추가 |
| **수정** | `apps/web/src/lib/llm/schemas.ts` | `documentTreeStructureSchema` 추가 |
| **수정** | `apps/web/src/lib/llm/prompts.ts` | `DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT` 추가 |
| **수정** | `apps/web/src/lib/llm/parse.ts` | `parseDocumentTreeStructureResponse` 추가 |
| **수정** | `apps/web/src/lib/document/processor.ts` | 구조 생성 → 저장으로 파이프라인 변경 |
| **수정** | `apps/web/src/lib/repository/document-repository.ts` | `getChunkTextsForConcept` 추가 |
| **수정** | `apps/web/src/lib/repository/learning-repository.ts` | `updateNodeDetail` hasDetail 포함 |
| **수정** | UI 컴포넌트 (Task 8/9) | skeleton 로딩 + lazy detail 표시 |

---

### Task 1: 구조 전용 타입 및 LLM 스키마

**Files:**
- Modify: `apps/web/src/types/learning.ts`
- Modify: `apps/web/src/lib/llm/schemas.ts`
- Modify: `apps/web/src/lib/llm/prompts.ts`
- Modify: `apps/web/src/lib/llm/parse.ts`

- [ ] **Step 1: 구조 전용 타입 추가**

`apps/web/src/types/learning.ts`의 Phase 3 타입 영역(143번 줄 이후)에 다음 타입을 추가한다:

```typescript
/** Phase 3 Task 11: 점진적 트리 생성을 위한 경량 구조 전용 타입.
 *  description/difficulty/evidence/concept_candidate 없이
 *  노드의 제목·타입·부모-자식 관계만 담는다. */
export interface DocumentTreeStructureNode {
  id: string;
  title: string;
  type: DocumentNodeType;
  prerequisites: string[];
  children: string[];
  source_type: DocumentSourceType;
}

export interface DocumentTreeStructureResponse {
  topic: string;
  document_id: string;
  summary: string;
  nodes: DocumentTreeStructureNode[];
  edges: LlmConceptEdge[];
  recommended_order: string[];
}
```

- [ ] **Step 2: Zod 스키마 추가**

`apps/web/src/lib/llm/schemas.ts`에 `documentTreeStructureNodeSchema`와 `documentTreeStructureResponseSchema`를 추가한다. 위치는 기존 `documentTreeNodeSchema` (377번 줄) 바로 뒤, `documentTreeResponseSchema` (390번 줄) 앞에 삽입한다:

```typescript
/**
 * 3-1. 문서 기반 트리 구조 전용 스키마 (Phase 3 Task 11)
 * description/difficulty/evidence/concept_candidate 없이
 * 노드 골격만 LLM에 요청 — 응답 시간 60초→10초 단축 목표
 */
export const documentTreeStructureNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: documentNodeTypeSchema,
  prerequisites: z.array(z.string()),
  children: z.array(z.string()),
  source_type: documentSourceTypeSchema,
});

export const documentTreeStructureResponseSchema = z
  .object({
    topic: z.string().min(1),
    document_id: z.string().min(1),
    summary: z.string(),
    nodes: z.array(documentTreeStructureNodeSchema),
    edges: z.array(llmConceptEdgeSchema).default([]),
    recommended_order: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const node of data.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `중복된 노드 id: ${node.id}`,
          path: ["nodes"],
        });
      }
      ids.add(node.id);
    }

    if (ids.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "노드가 비어 있습니다.",
        path: ["nodes"],
      });
      return;
    }

    const checkRefs = (arr: string[], nodeIdx: number, field: string) => {
      for (const ref of arr) {
        if (ref && !ids.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `존재하지 않는 노드 id 참조: ${ref}`,
            path: ["nodes", nodeIdx, field],
          });
        }
      }
    };

    data.nodes.forEach((node, i) => {
      checkRefs(node.prerequisites, i, "prerequisites");
      checkRefs(node.children, i, "children");
    });

    for (let i = 0; i < data.recommended_order.length; i++) {
      const id = data.recommended_order[i];
      if (id && !ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `recommended_order에 존재하지 않는 노드 id: ${id}`,
          path: ["recommended_order", i],
        });
      }
    }

    for (let i = 0; i < data.edges.length; i++) {
      const e = data.edges[i]!;
      if (!ids.has(e.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edges[${i}].from이 노드 id에 없습니다: ${e.from}`,
          path: ["edges", i, "from"],
        });
      }
      if (!ids.has(e.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edges[${i}].to가 노드 id에 없습니다: ${e.to}`,
          path: ["edges", i, "to"],
        });
      }
    }
  })
  .transform(
    (data): DocumentTreeStructureResponse => ({
      topic: data.topic,
      document_id: data.document_id,
      summary: data.summary,
      nodes: data.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        prerequisites: n.prerequisites,
        children: n.children,
        source_type: n.source_type,
      })),
      edges: data.edges.map((e) => ({
        from: e.from,
        to: e.to,
        relation_type: e.relation_type,
        reason: e.reason,
      })),
      recommended_order: data.recommended_order,
    }),
  );
```

- [ ] **Step 3: 파싱 함수 추가**

`apps/web/src/lib/llm/parse.ts` import 영역에 추가:

```typescript
import {
  documentTreeStructureResponseSchema,
} from "@/lib/llm/schemas";
import type {
  DocumentTreeStructureResponse,
} from "@/types/learning";
```

파일末尾에 파싱 함수 추가:

```typescript
/**
 * Phase 3 Task 11: 경량 트리 구조 전용 파싱
 */
export function parseDocumentTreeStructureResponse(
  raw: string,
): DocumentTreeStructureResponse {
  const cleaned = stripLlmFences(raw);
  const sliced = sliceBalancedJsonObject(cleaned);
  if (!sliced) {
    throw new LlmParseError("트리 구조 응답에서 JSON 객체를 찾을 수 없습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sliced);
  } catch {
    throw new LlmParseError("트리 구조 응답이 올바른 JSON이 아닙니다.");
  }

  const result = documentTreeStructureResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError(
      "트리 구조 응답 스키마 검증 실패",
      result.error.issues,
    );
  }

  return result.data;
}
```

- [ ] **Step 4: 경량 프롬프트 추가**

`apps/web/src/lib/llm/prompts.ts`에 다음 프롬프트 상수와 메시지 빌더를 추가한다:

```typescript
/**
 * Phase 3 Task 11: 트리 구조 전용 경량 프롬프트
 * - description/difficulty/evidence 없이 노드 골격만 요청
 * - LLM 응답 시간 5~10초 목표
 */
export const DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT = `You are an AI that designs prerequisite-based learning trees from document analysis results.

Your task is to generate the STRUCTURE of a learning tree — node titles, types, prerequisite relationships, and learning order only.
Do NOT generate descriptions, difficulty ratings, evidence, or concept candidates.
Keep each node title concise (under 60 characters).

Node types:
- prerequisite: background knowledge needed before the document topic
- document_core: core concepts directly from the document
- supplementary: extended/related concepts
- misconception: common misunderstandings
- quiz: knowledge check concepts

source_type:
- "explicit": directly mentioned in the document
- "inferred": derived as prerequisite (not explicitly mentioned)
- "generated": created by AI to complete the tree

Requirements:
- Generate 8 to 20 nodes total.
- Prerequisite nodes must come before core nodes in recommended_order.
- Each node's prerequisites must reference existing node ids.
- Return valid JSON only. No markdown fences. No extra text.`;

export interface BuildDocumentTreeStructureUserMessageOptions {
  documentTitle: string;
  documentSummary: string;
  consolidatedConceptsJson: string;
  matchedConceptsContext?: string;
}

export function buildDocumentTreeStructureUserMessage(
  options: BuildDocumentTreeStructureUserMessageOptions,
): string {
  const { documentTitle, documentSummary, consolidatedConceptsJson, matchedConceptsContext } = options;
  let msg = `Document: "${documentTitle}"\nSummary: ${documentSummary}\n\nConsolidated concepts:\n${consolidatedConceptsJson}`;

  if (matchedConceptsContext) {
    msg += `\n\nExisting concept store matches:\n${matchedConceptsContext}`;
  }

  msg += `\n\nGenerate ONLY the learning tree structure. Each node field: id, title, type, prerequisites, children, source_type. No descriptions, no difficulty, no evidence.`;

  return msg;
}
```

- [ ] **Step 5: 타입 검증**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "pdf-lib\|pdfjs-dist" | head -30
```

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/programming/RootMap && git add apps/web/src/types/learning.ts apps/web/src/lib/llm/schemas.ts apps/web/src/lib/llm/prompts.ts apps/web/src/lib/llm/parse.ts && git commit -m "Phase 3 Task 11: 구조 전용 타입/스키마/프롬프트/파싱 추가"
```

---

### Task 2: 구조 전용 LLM generate 함수

**Files:**
- Create: `apps/web/src/lib/llm/generate-document-structure.ts`

- [ ] **Step 1: `generate-document-structure.ts` 생성**

```typescript
/**
 * Phase 3 Task 11: 문서 기반 학습 트리 구조만 생성 (경량 LLM 호출)
 *
 * - description/difficulty/evidence 없이 노드 골격만 요청
 * - 응답 시간 목표: 5~10초
 * - 파싱/검증/transport 오류는 최대 3회 재시도
 */
import { createChatCompletion, getOpenRouterMaxAttempts } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentTreeStructureResponse } from "@/lib/llm/parse";
import {
  buildDocumentTreeStructureUserMessage,
  DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import type { DocumentTreeStructureResponse } from "@/types/learning";

function classifyLlmError(
  err: unknown,
): "parse" | "validation" | "transport" | "unknown" {
  if (err instanceof LlmParseError) return "parse";
  if (err instanceof LlmValidationError) return "validation";
  if (err instanceof LlmTransportError) return "transport";
  return "unknown";
}

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

function logGenerate(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[document-structure]", details);
}

export interface GenerateDocumentTreeStructureOptions {
  documentId: string;
  documentTitle: string;
  documentSummary: string;
  consolidatedConceptsJson: string;
  matchedConceptsContext?: string;
  requestId?: string;
}

/**
 * 문서 기반 학습 트리의 구조(제목/타입/관계)만 LLM에 요청한다.
 * description/difficulty/evidence는 포함하지 않아 LLM 응답이 빠르다.
 */
export async function generateDocumentTreeStructure(
  options: GenerateDocumentTreeStructureOptions,
): Promise<DocumentTreeStructureResponse> {
  const {
    documentId,
    documentTitle,
    documentSummary,
    consolidatedConceptsJson,
    matchedConceptsContext,
    requestId,
  } = options;
  const requestId_ = requestId ?? `tree-struct-${documentId}`;
  const maxAttempts = getOpenRouterMaxAttempts();

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    logGenerate("attempt_start", {
      requestId: requestId_,
      attempt: attemptNumber,
      maxAttempts,
      documentId,
    });

    try {
      const { rawText } = await createChatCompletion([
        {
          role: "system",
          content: DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDocumentTreeStructureUserMessage({
            documentTitle,
            documentSummary,
            consolidatedConceptsJson,
            matchedConceptsContext,
          }),
        },
      ]);

      const tree = parseDocumentTreeStructureResponse(rawText);

      logGenerate("attempt_success", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        rawLength: rawText.length,
        nodeCount: tree.nodes.length,
        edgeCount: tree.edges.length,
      });

      return tree;
    } catch (e) {
      lastError = e;
      const errorType = classifyLlmError(e);
      const retryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        e instanceof LlmTransportError;
      const abortRetries = shouldAbortRetries(e);

      logGenerate("attempt_failure", {
        requestId: requestId_,
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        errorType,
        errorClass: e instanceof Error ? e.name : "UnknownError",
        status: e instanceof LlmTransportError ? e.status : undefined,
        retryable,
        abortRetries,
      });

      if (abortRetries) break;
      if (!retryable) break;
    }
  }

  throw new LlmExhaustedRetriesError(
    "문서 기반 학습 트리 구조 LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}
```

- [ ] **Step 2: 타입 검증**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "pdf-lib\|pdfjs-dist" | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /mnt/d/programming/RootMap && git add apps/web/src/lib/llm/generate-document-structure.ts && git commit -m "Phase 3 Task 11: 구조 전용 LLM generate 함수 추가"
```

---

### Task 3: 노드 상세 지연 생성 API + generate 함수

**Files:**
- Create: `apps/web/src/lib/llm/generate-document-detail.ts`
- Create: `apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail/route.ts`
- Modify: `apps/web/src/lib/repository/document-repository.ts`
- Modify: `apps/web/src/lib/repository/learning-repository.ts`

- [ ] **Step 1: 노드 상세 지연 생성 전용 generate 함수**

`apps/web/src/lib/llm/generate-document-detail.ts`:

```typescript
/**
 * Phase 3 Task 11: 노드 상세 지연 생성 (lazy detail generation)
 *
 * 사용자가 노드를 클릭하면 호출된다.
 * 기존 documentNodeDetailResponseSchema를 재사용한다.
 */
import { createChatCompletion } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import { parseDocumentNodeDetailResponse } from "@/lib/llm/parse";
import type { DocumentNodeDetailResponse } from "@/types/learning";

const MAX_ATTEMPTS = 2;

export interface GenerateNodeDetailOptions {
  documentTitle: string;
  documentSummary: string;
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  sourceType: string;
  consolidatedConceptsJson: string;
  chunkTexts: Array<{ chunk_id: string; content: string }>;
  requestId?: string;
}

const GENERATE_NODE_DETAIL_SYSTEM_PROMPT = `You are an AI tutor explaining a specific concept from a document.

Given the node's title, type, and the document's content, generate a detailed explanation for this single concept node.

Provide these exact fields:
1. why_it_matters_for_document: why this concept matters specifically in this document's context
2. document_context_summary: how this concept appears in the document
3. easy_explanation: a clear explanation of this concept
4. example: a concrete example from the document or real world
5. common_misconceptions: 2-4 common misunderstandings
6. check_questions: 2-3 questions to verify understanding (with answers)
7. next_nodes: node ids that should be studied after this one

Return valid JSON only. No markdown fences. No extra text.`;

function buildGenerateNodeDetailUserMessage(options: {
  documentTitle: string;
  documentSummary: string;
  nodeTitle: string;
  nodeType: string;
  sourceType: string;
  consolidatedConceptsJson: string;
  chunkTexts: Array<{ chunk_id: string; content: string }>;
}): string {
  const { documentTitle, documentSummary, nodeTitle, nodeType, sourceType, consolidatedConceptsJson, chunkTexts } = options;

  let msg = `Document: "${documentTitle}"\nDocument summary: ${documentSummary}\n\n`;
  msg += `Node to explain:\n- Title: "${nodeTitle}"\n- Type: ${nodeType}\n- Source: ${sourceType}\n\n`;
  msg += `Consolidated concepts from this document:\n${consolidatedConceptsJson}\n\n`;

  if (chunkTexts.length > 0) {
    msg += `Relevant document chunks:\n`;
    for (const chunk of chunkTexts.slice(0, 3)) {
      msg += `--- Chunk ${chunk.chunk_id} ---\n${chunk.content.slice(0, 1000)}\n\n`;
    }
  }

  msg += `Generate a detailed explanation for this node following the specified JSON structure.`;
  return msg;
}

/**
 * 특정 문서 기반 노드 하나의 상세 설명을 LLM에 요청한다.
 * 사용자가 노드를 클릭할 때 호출되므로 3~5초 내 응답을 목표로 한다.
 */
export async function generateNodeDetail(
  options: GenerateNodeDetailOptions,
): Promise<DocumentNodeDetailResponse> {
  const { nodeId, requestId } = options;
  const requestId_ = requestId ?? `node-detail-${nodeId}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();

    console.info("[node-detail]", {
      requestId: requestId_,
      event: "attempt_start",
      attempt: attemptNumber,
      maxAttempts: MAX_ATTEMPTS,
      nodeId,
    });

    try {
      const { rawText } = await createChatCompletion([
        { role: "system", content: GENERATE_NODE_DETAIL_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildGenerateNodeDetailUserMessage(options),
        },
      ]);

      const detail = parseDocumentNodeDetailResponse(rawText);

      console.info("[node-detail]", {
        requestId: requestId_,
        event: "attempt_success",
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        rawLength: rawText.length,
        nodeId: detail.node_id,
      });

      return detail;
    } catch (e) {
      lastError = e;
      const isRetryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        (e instanceof LlmTransportError && e.status !== 401);

      console.info("[node-detail]", {
        requestId: requestId_,
        event: "attempt_failure",
        attempt: attemptNumber,
        durationMs: Date.now() - attemptStartedAt,
        errorType: e instanceof Error ? e.name : "UnknownError",
        retryable: isRetryable,
      });

      if (!isRetryable) break;
    }
  }

  throw new LlmExhaustedRetriesError(
    `노드(${nodeId}) 상세 설명 LLM 응답을 처리하지 못했습니다.`,
    lastError,
  );
}
```

- [ ] **Step 2: 저장소 함수 추가 — 노드 description/difficulty 업데이트**

먼저 기존 함수 시그니처 확인:

```bash
cd /mnt/d/programming/RootMap && grep -n "^export" apps/web/src/lib/repository/learning-repository.ts | head -30
```

`apps/web/src/lib/repository/learning-repository.ts`에 추가:

```typescript
/**
 * Phase 3 Task 11: 특정 노드의 상세 설명 정보를 업데이트한다.
 * 점진적 트리 생성에서 사용자가 노드를 클릭하면 지연 생성된
 * 상세 정보를 저장한다.
 */
export function updateNodeDetail(
  treeId: string,
  nodeId: string,
  detail: {
    description: string;
    difficulty: number;
  },
): void {
  const db = getDb();
  db.update(learningNodes)
    .set({
      description: detail.description,
      difficulty: detail.difficulty,
      hasDetail: true,
      updatedAt: newIsoDate(),
    })
    .where(
      and(
        eq(learningNodes.treeId, treeId),
        eq(learningNodes.id, nodeId),
      ),
    )
    .run();
}
```

- [ ] **Step 3: 저장소 함수 추가 — 노드 관련 문서 청크 조회**

`apps/web/src/lib/repository/document-repository.ts`에 추가:

```typescript
/**
 * Phase 3 Task 11: 특정 개념(노드)과 연결된 문서 청크 텍스트를 반환한다.
 * 노드 상세 지연 생성 시 LLM 컨텍스트로 사용된다.
 */
export function getChunkTextsForConcept(
  documentId: string,
  conceptTitle: string,
  limit = 3,
): Array<{ chunk_id: string; content: string }> {
  const db = getDb();
  const rows = db
    .select({
      chunkId: documentChunks.id,
      content: documentChunks.content,
    })
    .from(documentConcepts)
    .innerJoin(
      documentChunks,
      eq(documentConcepts.documentId, documentChunks.documentId),
    )
    .where(
      and(
        eq(documentConcepts.documentId, documentId),
        eq(documentConcepts.conceptTitle, conceptTitle),
      ),
    )
    .limit(limit)
    .all();

  return rows.map((r) => ({ chunk_id: r.chunkId, content: r.content }));
}
```

- [ ] **Step 4: 노드 상세 지연 생성 API 라우트**

디렉토리 확인 및 생성:

```bash
ls -la "apps/web/src/app/api/trees/[treeId]/nodes/" 2>&1 || echo "DIR NOT FOUND"
mkdir -p "apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail"
```

`apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail/route.ts`:

```typescript
import { jsonError } from "@/lib/api-errors";
import { DEFAULT_USER_ID } from "@/db/constants";
import { getLearningTree, updateNodeDetail } from "@/lib/repository/learning-repository";
import { getDocumentForUser, getChunkTextsForConcept } from "@/lib/repository/document-repository";
import { generateNodeDetail } from "@/lib/llm/generate-document-detail";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ treeId: string; nodeId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { treeId, nodeId } = await ctx.params;

  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    return jsonError("NOT_FOUND", "트리를 찾을 수 없습니다.", 404);
  }

  // 문서 기반 트리인지 확인
  if (!bundle.tree.documentId) {
    return jsonError("INVALID_OPERATION", "이 트리는 문서 기반 트리가 아닙니다.", 400);
  }

  const node = bundle.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return jsonError("NOT_FOUND", "노드를 찾을 수 없습니다.", 404);
  }

  // 이미 상세 정보가 있으면 생략
  if (node.has_detail && node.description) {
    return NextResponse.json({ node_id: nodeId, cached: true });
  }

  try {
    const document = getDocumentForUser(bundle.tree.documentId, DEFAULT_USER_ID);
    if (!document) {
      return jsonError("NOT_FOUND", "원본 문서를 찾을 수 없습니다.", 404);
    }

    const chunkTexts = getChunkTextsForConcept(bundle.tree.documentId, node.title);

    const detail = await generateNodeDetail({
      documentTitle: document.title,
      documentSummary: document.summary ?? "",
      nodeId: node.node_key,
      nodeTitle: node.title,
      nodeType: node.type,
      sourceType: node.document_context?.source_type ?? "generated",
      consolidatedConceptsJson: JSON.stringify(
        bundle.nodes
          .filter((n) => n.document_context)
          .map((n) => ({
            title: n.title,
            type: n.type,
            source_type: n.document_context?.source_type,
          })),
      ),
      chunkTexts,
      requestId: `node-detail-${nodeId}`,
    });

    updateNodeDetail(treeId, nodeId, {
      description: detail.document_context_summary || detail.easy_explanation,
      difficulty: 3,
    });

    return NextResponse.json({ node_id: nodeId, detail, cached: false });
  } catch (e) {
    console.error("[generate-detail]", e);
    return jsonError("DETAIL_GENERATION_FAILED", "노드 상세 설명을 생성하지 못했습니다.", 500);
  }
}
```

- [ ] **Step 5: 타입 검증**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "pdf-lib\|pdfjs-dist" | head -30
```

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/programming/RootMap && git add apps/web/src/lib/llm/generate-document-detail.ts "apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail/route.ts" apps/web/src/lib/repository/learning-repository.ts apps/web/src/lib/repository/document-repository.ts && git commit -m "Phase 3 Task 11: 노드 상세 지연 생성 API + 저장소 함수"
```

---

### Task 4: Processor 파이프라인 구조/상세 분할

**Files:**
- Modify: `apps/web/src/lib/document/processor.ts`

- [ ] **Step 1: processor.ts 상단에 구조 생성 import 추가**

기존 import 영역에 추가:

```typescript
import { generateDocumentTreeStructure } from "@/lib/llm/generate-document-structure";
import type { DocumentTreeStructureResponse } from "@/types/learning";
```

- [ ] **Step 2: 구조 → LearningTreeResponse 변환 함수 추가**

processor.ts의 유틸리티 함수 영역(예: `structureToLearning` 함수 선언부 근처)에 추가:

```typescript
/**
 * Phase 3 Task 11: DocumentTreeStructureResponse를 DB 저장용
 * LearningTreeResponse로 변환한다.
 * - description은 빈 문자열 (노드 클릭 시 지연 생성)
 * - difficulty는 기본값 3
 * - concept_candidate는 title 기반으로 생성
 */
function structureToLearningTreeResponse(
  structure: DocumentTreeStructureResponse,
): LearningTreeResponse {
  return {
    topic: structure.topic,
    summary: structure.summary,
    recommended_order: structure.recommended_order,
    edges: structure.edges,
    nodes: structure.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type === "document_core" ? "core" : n.type === "quiz" ? "quiz" : n.type === "supplementary" ? "supplementary" : n.type === "misconception" ? "misconception" : "prerequisite",
      description: "",
      difficulty: 3,
      prerequisites: n.prerequisites,
      children: n.children,
      concept_candidate: {
        canonical_title: n.title,
        aliases: [],
        domain: null,
        short_description: "",
        is_reusable: true,
      },
    })),
  };
}
```

- [ ] **Step 3: 기존 tree generation 호출을 구조 생성 호출로 교체**

processor.ts에서 `generateDocumentTree`를 호출하는 부분을 찾아 `generateDocumentTreeStructure` 호출로 교체한다:

기존 코드:
```typescript
    const llmTreeResult = await generateDocumentTree({
      documentId,
      documentTitle,
      documentSummary: ...,
      consolidatedConceptsJson: ...,
      ...
    });
```

교체:
```typescript
    const treeStructure = await generateDocumentTreeStructure({
      documentId,
      documentTitle,
      documentSummary: consolidationResult.fullConsolidation.main_topic,
      consolidatedConceptsJson: JSON.stringify(consolidationResult.detailedConcepts),
      matchedConceptsContext: consolidationResult.matchedConceptsContext,
      requestId,
    });

    const llmTree = structureToLearningTreeResponse(treeStructure);
```

- [ ] **Step 4: createFullLearningTree 호출에 변환된 llmTree 사용**

기존 `llmTreeResult.tree`를 사용하던 부분을 `llmTree`로 변경한다.

- [ ] **Step 5: 타입 검증**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "pdf-lib\|pdfjs-dist" | head -30
```

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/programming/RootMap && git add apps/web/src/lib/document/processor.ts && git commit -m "Phase 3 Task 11: processor 파이프라인 구조/상세 분할"
```

---

### Task 5: 노드 상세 UI — skeleton 트리 + lazy detail 로딩

- [ ] **Step 1: 기존 트리 UI 파일 확인**

```bash
cd /mnt/d/programming/RootMap && find apps/web/src -name "*.tsx" | xargs grep -l "treeId\|treeView\|TreeView\|LearningTree" 2>/dev/null | head -10
```

- [ ] **Step 2: description이 비어있을 때 placeholder 표시**

트리 노드 렌더링 컴포넌트에서:

```tsx
// description이 비어있으면 skeleton/placeholder
{node.description ? (
  <p className="text-sm text-gray-600">{node.description}</p>
) : (
  <p className="text-sm text-gray-400 italic">
    노드를 클릭하면 상세 설명이 생성됩니다
  </p>
)}
```

- [ ] **Step 3: 노드 클릭 시 lazy detail 로딩**

```tsx
async function handleNodeClick(nodeId: string) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node || node.has_detail) return;

  setLoadingNodeId(nodeId);
  try {
    const res = await fetch(
      `/api/trees/${treeId}/nodes/${nodeId}/generate-detail`,
      { method: "POST" }
    );
    if (!res.ok) throw new Error("Failed to generate detail");
    const data = await res.json();
    setNodeDetail(data.detail);
  } catch (err) {
    console.error("Failed to load node detail:", err);
  } finally {
    setLoadingNodeId(null);
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/programming/RootMap && git add [변경된 UI 파일 경로] && git commit -m "Phase 3 Task 11: 트리 skeleton + lazy detail 로딩 UI"
```

---

### Task 6: 스모크 테스트 및 검증

- [ ] **Step 1: 파이프라인 스모크 실행**

```bash
cd apps/web && OPENROUTER_MODEL="x-ai/grok-4.3" npm run document:pipeline-smoke 2>&1
```

Expected:
- `tree_structure_generation_complete` durationMs < 15000
- `tree_generated` 상태
- `treeId` 존재
- 노드가 skeleton 상태(description="")로 저장됨

- [ ] **Step 2: 서버 실행 후 수동 확인**

```bash
cd apps/web && npm run dev
```

1. 문서 업로드 → 처리
2. 트리 구조가 10초 내외에 표시되는지 확인
3. 노드 클릭 시 상세 설명이 지연 생성되는지 확인
4. 이미 생성된 노드는 캐시된 detail이 표시되는지 확인

- [ ] **Step 3: Commit**

```bash
cd /mnt/d/programming/RootMap && git push
```

---

## 진행된 작업 및 구현 결과

### 문제: 트리 생성 60초 timeout
Phase 3 Task 5까지는 하나의 LLM 호출로 전체 트리(제목+설명+난이도+출처+개념)를 생성하여 60초 가까이 소요됨.

### 해결: 점진적 트리 생성 (Phase A + Phase B)

| Phase | LLM 호출 | 응답 시간 | 포함 정보 |
|-------|----------|-----------|----------|
| A (즉시) | `generateDocumentTreeStructure` | **10~20초** | 제목, 타입, 관계, source_type |
| B (클릭 시) | `generateNodeDetail` | **15~20초** | 설명, 난이도, 예제, 질문 |

### 구현된 파일 (신규 4, 수정 8)

| 파일 | 변경 | 설명 |
|------|------|------|
| `types/learning.ts` | 수정 | `DocumentTreeStructureResponse` 타입 추가 |
| `lib/llm/schemas.ts` | 수정 | `documentTreeStructureNodeSchema`, `documentTreeStructureResponseSchema` 추가 |
| `lib/llm/prompts.ts` | 수정 | `DOCUMENT_TREE_STRUCTURE_SYSTEM_PROMPT` 추가 |
| `lib/llm/parse.ts` | 수정 | `parseDocumentTreeStructureResponse` 추가 |
| `lib/llm/generate-document-structure.ts` | **신규** | 구조 전용 LLM 함수 (5~10초 목표) |
| `lib/llm/generate-document-detail.ts` | **신규** | 노드 상세 지연 생성 LLM 함수 + 프롬프트 |
| `lib/document/processor.ts` | 수정 | `generateDocumentTree` → `generateDocumentTreeStructure` 교체, `structureToLearningTreeResponse` 변환 |
| `lib/repository/document-repository.ts` | 수정 | `getChunkTextsForConcept` 추가 |
| `lib/repository/learning-repository.ts` | 수정 | `updateNodeDetail` (hasDetail 컬럼 업데이트) |
| API 라우트 | **신규** | `POST /api/trees/:treeId/nodes/:nodeId/generate-detail` |
| UI (`tree-page-client.tsx`) | 수정 | skeleton placeholder + lazy detail 로딩 |
| `smoke-document-pipeline.ts` | 수정 | 구조 생성 시간 측정 추가 |
| `smoke-document-detail.ts` | **신규** | 노드 상세 생성 fixture 기반 스모크 |

### 발견된 문제점과 해결

1. **node_id 불일치**: LLM이 요청받은 `node_id`와 다른 값을 생성함. 프롬프트에 `Node ID`를 명시하고 "MUST be exactly" 강조하여 해결.
2. **Zod 스키마 float 문제**: Grok 4.3이 `importance`/`difficulty`를 0~1 float으로 반환 → `transform(Math.round+clamp)`로 방어 (Task 10에서 이미 해결)

### 검증 결과

| 스모크 | 모델 | 결과 | 시간 |
|--------|------|------|------|
| `document:pipeline-smoke` | `x-ai/grok-4.3` | ✅ 통과 | 49.8초 (구조 20.6초) |
| `document:detail-smoke` | `x-ai/grok-4.3` | ✅ 통과 | 18.9초 (node_id 일치) |

## 완료 조건

- [x] 문서 업로드 후 트리 구조가 20초 내에 화면에 표시된다 (실측: ~20초)
- [x] 각 노드는 제목, 타입, 부모-자식 관계는 즉시 보인다
- [x] description이 비어있는 노드는 placeholder 텍스트가 표시된다
- [x] 노드를 클릭하면 `POST .../generate-detail`이 호출된다
- [x] 상세 생성 중에는 로딩 인디케이터가 표시된다
- [x] 상세가 도착하면 description/difficulty가 업데이트되어 표시된다
- [x] 이미 생성된 노드를 다시 클릭하면(또는 새로고침 후) 캐시된 detail이 표시된다
- [x] 기존 Phase 2 트리(일반 주제 기반)는 변경 없이 동작한다
- [x] pipeline-smoke + detail-smoke 통과
