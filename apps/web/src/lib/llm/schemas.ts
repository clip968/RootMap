import { z } from "zod/v3";
import type {
  LearningTreeResponse,
  NodeDetailResponse,
  ChunkConceptExtractionResponse,
  DocumentConsolidationResponse,
  DocumentTreeResponse,
  DocumentTreeStructureResponse,
  DocumentNodeDetailResponse,
} from "@/types/learning";
import {
  DEFAULT_VISUAL_DECISION,
  visualBlocksSchema,
  visualDecisionSchema,
} from "@/lib/visualization/visual-block-schema";

const nodeTypeSchema = z.enum([
  "prerequisite",
  "core",
  "supplementary",
  "misconception",
  "quiz",
]);

const conceptRelationSchema = z.enum([
  "prerequisite",
  "part_of",
  "related",
  "misconception_of",
  "example_of",
  "application_of",
]);

export const conceptCandidateSchema = z.object({
  canonical_title: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  domain: z.string().nullable().optional(),
  short_description: z.string().optional().default(""),
  is_reusable: z.boolean().optional().default(true),
});

export const llmConceptEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation_type: conceptRelationSchema,
  reason: z.string().optional(),
});

export const learningTreeNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: nodeTypeSchema,
  description: z.string(),
  difficulty: z.number().min(1).max(5).transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  prerequisites: z.array(z.string()),
  children: z.array(z.string()),
  community: z.string().optional(),
  priority: z.number().optional(),
  depth: z.number().int().min(0).optional(),
  concept_candidate: conceptCandidateSchema.optional(),
});

export const learningTreeOutlineNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: nodeTypeSchema,
  community: z.string().min(1),
  priority: z.number(),
  prerequisites: z.array(z.string()),
});

export const learningTreeCommunitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priority: z.number(),
  node_ids: z.array(z.string()),
});

export const learningTreeOutlineResponseSchema = z
  .object({
    topic: z.string().min(1),
    summary: z.string(),
    nodes: z.array(learningTreeOutlineNodeSchema),
    recommended_order: z.array(z.string()).optional(),
    edges: z.array(llmConceptEdgeSchema).optional(),
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
    });

    (data.recommended_order ?? []).forEach((id, i) => {
      if (id && !ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `recommended_order에 존재하지 않는 노드 id: ${id}`,
          path: ["recommended_order", i],
        });
      }
    });

    (data.edges ?? []).forEach((edge, i) => {
      if (!ids.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edges[${i}].from이 노드 id에 없습니다: ${edge.from}`,
          path: ["edges", i, "from"],
        });
      }
      if (!ids.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edges[${i}].to가 노드 id에 없습니다: ${edge.to}`,
          path: ["edges", i, "to"],
        });
      }
    });
  })
  .transform((data) => ({
    ...data,
    edges: data.edges ?? [],
    recommended_order: data.recommended_order ?? [],
  }));

export const learningTreeDetailNodeSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  difficulty: z
    .number()
    .min(1)
    .max(5)
    .transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  concept_candidate: conceptCandidateSchema,
});

export const learningTreeDetailResponseSchema = z.object({
  nodes: z.array(learningTreeDetailNodeSchema),
});

export const learningTreeResponseSchema = z
  .object({
    topic: z.string().min(1),
    summary: z.string(),
    nodes: z.array(learningTreeNodeSchema),
    recommended_order: z.array(z.string()),
    communities: z.array(learningTreeCommunitySchema).optional(),
    edges: z.array(llmConceptEdgeSchema).optional(),
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
        if (!ids.has(ref)) {
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
      if (!ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `recommended_order에 존재하지 않는 노드 id: ${id}`,
          path: ["recommended_order", i],
        });
      }
    }

    const edges = data.edges ?? [];
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]!;
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
  .transform((data): LearningTreeResponse => ({
    ...data,
    edges: data.edges ?? [],
    communities: data.communities ?? [],
    nodes: data.nodes.map((node) => {
      const cc =
        node.concept_candidate ?
          {
            canonical_title: node.concept_candidate.canonical_title,
            aliases: node.concept_candidate.aliases ?? [],
            domain: node.concept_candidate.domain ?? null,
            short_description:
              node.concept_candidate.short_description ?? "",
            is_reusable: node.concept_candidate.is_reusable ?? true,
          }
        : {
            canonical_title: node.title,
            aliases: [] as string[],
            domain: null as string | null,
            short_description: node.description,
            is_reusable: true,
          };
      return {
        ...node,
        concept_candidate: cc,
      };
    }),
  }));

export const nodeDetailQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const nodeDetailResponseSchema = z.object({
  node_id: z.string().min(1),
  title: z.string().min(1),
  type: nodeTypeSchema,
  why_it_matters: z.string(),
  easy_explanation: z.string(),
  analogy: z.string(),
  example: z.string(),
  common_misconceptions: z.array(z.string()),
  check_questions: z.array(nodeDetailQuestionSchema),
  next_nodes: z.array(z.string()),
  visual_decision: visualDecisionSchema.optional().default(DEFAULT_VISUAL_DECISION),
  visual_blocks: visualBlocksSchema.optional().default([]),
});

/** 명세 §5·task 03 품질 가드레일: 스키마 통과 후 경고만 누적 */
export function learningTreeQualityWarnings(
  tree: LearningTreeResponse,
  inputTopic: string,
): string[] {
  const w: string[] = [];
  const n = tree.nodes.length;
  if (n < 8 || n > 20) {
    w.push(`노드 수(${n}개)가 권장 범위(8~20)를 벗어났습니다.`);
  }

  const count = (t: (typeof tree.nodes)[number]["type"]) =>
    tree.nodes.filter((x) => x.type === t).length;

  if (count("prerequisite") < 3) {
    w.push("선수지식(prerequisite) 노드가 3개 미만입니다.");
  }
  if (count("core") < 3) {
    w.push("핵심(core) 노드가 3개 미만입니다.");
  }
  if (count("misconception") < 1) {
    w.push("오개념(misconception) 노드가 1개 미만입니다.");
  }
  if (count("quiz") < 2) {
    w.push("이해 점검(quiz) 노드가 2개 미만입니다.");
  }

  const orderSet = new Set(tree.recommended_order);
  if (orderSet.size !== tree.recommended_order.length) {
    w.push("recommended_order에 중복된 id가 있습니다.");
  }

  const idSet = new Set(tree.nodes.map((x) => x.id));
  for (const id of idSet) {
    if (!tree.recommended_order.includes(id)) {
      w.push("일부 노드 id가 recommended_order에 누락되었습니다.");
      break;
    }
  }

  if (tree.topic.trim() !== inputTopic.trim()) {
    w.push('응답의 "topic" 필드가 입력 주제와 다릅니다.');
  }

  return w;
}

export function nodeDetailQualityWarnings(
  detail: NodeDetailResponse,
): string[] {
  const w: string[] = [];
  if (detail.check_questions.length === 0) {
    w.push("이해 점검 질문(check_questions)이 비어 있습니다.");
  }
  if (detail.common_misconceptions.length === 0) {
    w.push("common_misconceptions가 비어 있습니다.");
  }
  return w;
}

// ──────────────────────────────────────────────
// Phase 3 문서 기반 LLM 스키마 (명세 §7·§11)
// ──────────────────────────────────────────────

const documentConceptTypeSchema = z.enum([
  "document_topic",
  "prerequisite",
  "document_core",
  "method",
  "background",
  "misconception",
  "evaluation",
]);

const documentSourceTypeSchema = z.enum([
  "explicit",
  "inferred",
  "generated",
]);

const documentNodeTypeSchema = z.enum([
  "prerequisite",
  "document_core",
  "supplementary",
  "misconception",
  "quiz",
]);

/**
 * 1. 청크별 개념 추출 응답 스키마 (명세 §11.1)
 * - 청크에 명시적으로 등장한 개념만 추출
 */
export const chunkConceptCandidateSchema = z.object({
  canonical_title: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  type: documentConceptTypeSchema,
  short_description: z.string().min(1),
  importance: z.number().min(1).max(5).transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  difficulty: z.number().min(1).max(5).transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  source_type: z.literal("explicit"),
  evidence_snippet: z.string().min(1),
});

export const chunkConceptExtractionResponseSchema = z
  .object({
    document_id: z.string().min(1),
    chunk_id: z.string().min(1),
    section_title: z.string(),
    concept_candidates: z.array(chunkConceptCandidateSchema),
  })
  .transform(
    (data): ChunkConceptExtractionResponse => ({
      document_id: data.document_id,
      chunk_id: data.chunk_id,
      section_title: data.section_title,
      concept_candidates: data.concept_candidates.map((c) => ({
        canonical_title: c.canonical_title,
        aliases: c.aliases,
        type: c.type,
        short_description: c.short_description,
        importance: c.importance,
        difficulty: c.difficulty,
        source_type: c.source_type,
        evidence_snippet: c.evidence_snippet,
      })),
    }),
  );

/**
 * 2. 문서 전체 개념 통합 응답 스키마 (명세 §11.2)
 * - 중복 병합, source_type = explicit 또는 inferred
 */
export const consolidatedConceptEvidenceSchema = z.object({
  chunk_id: z.string().min(1),
  page_start: z.number().int().nullable().optional(),
  page_end: z.number().int().nullable().optional(),
  section_title: z.string(),
});

export const consolidatedConceptSchema = z.object({
  canonical_title: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  type: documentConceptTypeSchema,
  importance: z.number().min(1).max(5).transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  difficulty: z.number().min(1).max(5).transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  source_type: z.enum(["explicit", "inferred"]),
  evidence: z.array(consolidatedConceptEvidenceSchema).default([]),
});

export const documentConsolidationResponseSchema = z
  .object({
    document_title: z.string().min(1),
    main_topic: z.string().min(1),
    summary: z.string(),
    concepts: z.array(consolidatedConceptSchema),
  })
  .superRefine((data, ctx) => {
    // inferred 개념에 evidence가 있으면 경고 (문서에 직접 등장하지 않았으므로)
    for (let i = 0; i < data.concepts.length; i++) {
      const c = data.concepts[i]!;
      if (c.source_type === "inferred" && c.evidence.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `inferred 개념 "${c.canonical_title}"에 evidence가 있습니다. inferred 개념은 evidence를 비워야 합니다.`,
          path: ["concepts", i, "evidence"],
        });
      }
    }
  })
  .transform(
    (data): DocumentConsolidationResponse => ({
      document_title: data.document_title,
      main_topic: data.main_topic,
      summary: data.summary,
      concepts: data.concepts.map((c) => ({
        canonical_title: c.canonical_title,
        aliases: c.aliases,
        type: c.type,
        importance: c.importance,
        difficulty: c.difficulty,
        source_type: c.source_type,
        evidence: c.evidence.map((e) => ({
          chunk_id: e.chunk_id,
          page_start: e.page_start ?? null,
          page_end: e.page_end ?? null,
          section_title: e.section_title,
        })),
      })),
    }),
  );

/**
 * 3. 문서 기반 학습 트리 응답 스키마 (명세 §11.3)
 */
export const documentTreeEvidenceSchema = z.object({
  page_start: z.number().int().nullable().optional(),
  page_end: z.number().int().nullable().optional(),
  section_title: z.string(),
});

export const documentTreeNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: documentNodeTypeSchema,
  description: z.string(),
  difficulty: z.number().min(1).max(5).transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
  prerequisites: z.array(z.string()),
  children: z.array(z.string()),
  source_type: documentSourceTypeSchema,
  evidence: z.array(documentTreeEvidenceSchema).default([]),
  concept_candidate: conceptCandidateSchema,
});

export const documentTreeResponseSchema = z
  .object({
    topic: z.string().min(1),
    document_id: z.string().min(1),
    summary: z.string(),
    nodes: z.array(documentTreeNodeSchema),
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
        if (!ids.has(ref)) {
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

    // inferred 노드에 evidence가 있는지 검증
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i]!;
      if (node.source_type === "inferred" && node.evidence.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `inferred 노드 "${node.title}"에 evidence가 있습니다.`,
          path: ["nodes", i, "evidence"],
        });
      }
    }
  })
  .transform(
    (data): DocumentTreeResponse => ({
      topic: data.topic,
      document_id: data.document_id,
      summary: data.summary,
      nodes: data.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        description: n.description,
        difficulty: n.difficulty,
        prerequisites: n.prerequisites,
        children: n.children,
        source_type: n.source_type,
        evidence: n.evidence.map((e) => ({
          page_start: e.page_start ?? null,
          page_end: e.page_end ?? null,
          section_title: e.section_title,
        })),
        concept_candidate: {
          canonical_title: n.concept_candidate.canonical_title,
          aliases: n.concept_candidate.aliases ?? [],
          domain: n.concept_candidate.domain ?? null,
          short_description: n.concept_candidate.short_description ?? "",
          is_reusable: n.concept_candidate.is_reusable ?? true,
        },
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

/**
 * 4. 문서 기반 노드 상세 설명 응답 스키마 (명세 §12.4)
 */
export const documentNodeDetailQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const documentNodeDetailResponseSchema = z
  .object({
    node_id: z.string().min(1),
    title: z.string().min(1),
    source_type: documentSourceTypeSchema,
    why_it_matters_for_document: z.string(),
    document_context_summary: z.string(),
    easy_explanation: z.string(),
    example: z.string(),
    common_misconceptions: z.array(z.string()),
    check_questions: z.array(documentNodeDetailQuestionSchema),
    next_nodes: z.array(z.string()),
    visual_decision: visualDecisionSchema.optional().default(DEFAULT_VISUAL_DECISION),
    visual_blocks: visualBlocksSchema.optional().default([]),
  })
  .transform(
    (data): DocumentNodeDetailResponse => ({
      node_id: data.node_id,
      title: data.title,
      source_type: data.source_type,
      why_it_matters_for_document: data.why_it_matters_for_document,
      document_context_summary: data.document_context_summary,
      easy_explanation: data.easy_explanation,
      example: data.example,
      common_misconceptions: data.common_misconceptions,
      check_questions: data.check_questions.map((q) => ({
        question: q.question,
        answer: q.answer,
      })),
      next_nodes: data.next_nodes,
      visual_decision: data.visual_decision,
      visual_blocks: data.visual_blocks,
    }),
  );

/**
 * 5. Phase 3 품질 가드레일 (명세 §17)
 */
export function documentConsolidationQualityWarnings(
  consolidation: DocumentConsolidationResponse,
): string[] {
  const w: string[] = [];
  const totalConcepts = consolidation.concepts.length;
  if (totalConcepts < 5 || totalConcepts > 50) {
    w.push(`개념 수(${totalConcepts}개)가 권장 범위(5~50)를 벗어났습니다.`);
  }

  const coreCount = consolidation.concepts.filter(
    (c) => c.type === "document_core" || c.type === "document_topic",
  ).length;
  if (coreCount < 2) {
    w.push("문서 핵심 개념(document_core/document_topic)이 2개 미만입니다.");
  }

  const explicitCount = consolidation.concepts.filter(
    (c) => c.source_type === "explicit",
  ).length;
  if (explicitCount < 3) {
    w.push("explicit 개념이 3개 미만입니다.");
  }

  return w;
}

export function documentTreeQualityWarnings(
  tree: DocumentTreeResponse,
): string[] {
  const w: string[] = [];
  const n = tree.nodes.length;
  if (n < 10 || n > 25) {
    w.push(`노드 수(${n}개)가 권장 범위(10~25)를 벗어났습니다.`);
  }

  const prereqCount = tree.nodes.filter(
    (node) => node.type === "prerequisite",
  ).length;
  if (prereqCount < 3) {
    w.push("선수지식(prerequisite) 노드가 3개 미만입니다.");
  }

  const coreCount = tree.nodes.filter(
    (node) => node.type === "document_core",
  ).length;
  if (coreCount < 5) {
    w.push("문서 핵심 개념(document_core) 노드가 5개 미만입니다.");
  }

  const explicitCount = tree.nodes.filter(
    (node) => node.source_type !== "generated",
  ).length;
  if (explicitCount < 5) {
    w.push("출처 연결된 개념이 5개 미만입니다.");
  }

  const orderSet = new Set(tree.recommended_order);
  if (orderSet.size !== tree.recommended_order.length) {
    w.push("recommended_order에 중복된 id가 있습니다.");
  }

  return w;
}

export function documentNodeDetailQualityWarnings(
  detail: DocumentNodeDetailResponse,
): string[] {
  const w: string[] = [];
  if (detail.check_questions.length === 0) {
    w.push("이해 점검 질문(check_questions)이 비어 있습니다.");
  }
  if (detail.common_misconceptions.length === 0) {
    w.push("common_misconceptions가 비어 있습니다.");
  }
  if (!detail.why_it_matters_for_document) {
    w.push("why_it_matters_for_document가 비어 있습니다.");
  }
  return w;
}
