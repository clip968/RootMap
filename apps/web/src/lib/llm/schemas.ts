import { z } from "zod/v3";
import type {
  LearningTreeResponse,
  NodeDetailResponse,
  ConceptQuestion,
  ChunkConceptExtractionResponse,
  DocumentConsolidationResponse,
  DocumentTreeResponse,
  DocumentTreeStructureResponse,
  DocumentNodeDetailResponse,
} from "@/types/learning";
// Phase 14: learning_objective 동사 접두 검증에 쓰는 허용 동사 목록(값 import).
import { LEARNING_OBJECTIVE_VERBS } from "@/types/learning";
import {
  DEFAULT_VISUAL_DECISION,
  REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT,
  visualBlocksSchema,
  visualDecisionSchema,
  type VisualBlock,
  type VisualDecision,
} from "@/lib/visualization/visual-block-schema";
// Phase 12: 트리 품질 경고는 tree-eval의 단일 검사 로직(collectTreeQualityFailures)에
// 위임한다. 같은 문제를 두 곳에서 중복 검사하지 않기 위한 통합이다(명세 §1.5).
import { collectTreeQualityFailures } from "@/lib/evaluation/tree-eval";

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

/**
 * Phase 13: edge 품질 스키마.
 *
 * 입력에서 `explanation`/`confidence`/`is_blocking`을 받되, 없으면 안전하게 보정한다.
 * - `explanation`이 없으면 옛 필드 `reason`을 쓰고, 둘 다 없으면 빈 문자열로 둔다(UI는 관계 타입만 표시).
 * - `confidence`는 0~1로 강제하고, 없으면 중립값 0.5로 둔다.
 * - `is_blocking`은 없으면 false로 둔다(prerequisite에서만 의미).
 * 이렇게 하면 옛 트리(이 필드들이 없는 데이터)도 파싱·렌더링이 깨지지 않는다.
 */
export const llmConceptEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    relation_type: conceptRelationSchema,
    reason: z.string().optional(),
    explanation: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    is_blocking: z.boolean().optional(),
  })
  .transform((edge) => {
    const explanation = (edge.explanation ?? edge.reason ?? "").trim();
    return {
      from: edge.from,
      to: edge.to,
      relation_type: edge.relation_type,
      // 옛 소비자/응답 형태 보존을 위해 reason도 유지한다(있으면 그대로, 없으면 explanation으로).
      reason: edge.reason ?? (explanation || undefined),
      explanation,
      confidence: edge.confidence ?? 0.5,
      is_blocking: edge.is_blocking ?? false,
    };
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

/**
 * Phase 14(§3.3): learning_objective가 허용 동사로 시작하는지 검사한다.
 *
 * 동사 뒤에는 공백/구분자(`— : -`)나 문장이 자연스럽게 이어질 수 있다.
 * 예: "explain — 가상 주소가 ... 변환되는 과정을 설명할 수 있다."
 */
export function startsWithAllowedObjectiveVerb(objective: string): boolean {
  const head = objective.trim().toLowerCase();
  return LEARNING_OBJECTIVE_VERBS.some(
    (verb) =>
      head === verb ||
      head.startsWith(`${verb} `) ||
      head.startsWith(`${verb}:`) ||
      head.startsWith(`${verb}-`) ||
      head.startsWith(`${verb}—`) ||
      head.startsWith(`${verb}–`),
  );
}

/** Phase 14: learning_objective zod. 허용 동사 접두를 강제한다. */
export const learningObjectiveSchema = z
  .string()
  .trim()
  .min(1)
  .refine(startsWithAllowedObjectiveVerb, {
    message:
      "learning_objective는 define|explain|apply|compare|debug 중 하나로 시작해야 합니다.",
  });

/** Phase 14: mastery_evidence zod. 1개 이상, 각 항목은 비어 있지 않은 행동 진술. */
export const masteryEvidenceSchema = z.array(z.string().trim().min(1)).min(1);

/** Phase 14(§6.3): ConceptQuestion 유형 5종. learning_objective 동사 체계와 정렬된다. */
export const conceptQuestionTypeSchema = z.enum([
  "recall",
  "apply",
  "compare",
  "trace",
  "debug",
]);

/**
 * Phase 14(§6.3): 개념 문항 스키마.
 *
 * - `node_id`는 노드 상세가 이미 자기 id를 가지므로 optional(문항마다 반복 강제하지 않음).
 * - `difficulty`는 코드베이스 관례대로 1~5 정수로 clamp한다(LLM이 3.0/6 등을 줘도 안전).
 * - `rubric`은 채점 기준이므로 최소 1개를 강제한다.
 */
export const conceptQuestionSchema = z.object({
  id: z.string().min(1),
  node_id: z.string().min(1).optional(),
  type: conceptQuestionTypeSchema,
  prompt: z.string().min(1),
  expected_answer: z.string().min(1),
  rubric: z.array(z.string().trim().min(1)).min(1),
  misconception_target: z.string().trim().min(1).optional(),
  difficulty: z
    .number()
    .min(1)
    .max(5)
    .transform((v) => Math.max(1, Math.min(5, Math.round(v)))),
});

export const nodeDetailResponseSchema = z.object({
  node_id: z.string().min(1),
  title: z.string().min(1),
  type: nodeTypeSchema,
  // Phase 14: 신규 학습 계약 필드. optional이라 기존(필드 없는) 상세도 그대로 통과한다.
  learning_objective: learningObjectiveSchema.optional(),
  mastery_evidence: masteryEvidenceSchema.optional(),
  why_it_matters: z.string(),
  easy_explanation: z.string(),
  analogy: z.string(),
  example: z.string(),
  common_misconceptions: z.array(z.string()),
  check_questions: z.array(nodeDetailQuestionSchema),
  // Phase 14: 개념 문항(보강). optional이라 없으면 그대로 통과한다.
  concept_questions: z.array(conceptQuestionSchema).optional(),
  next_nodes: z.array(z.string()),
  visual_decision: visualDecisionSchema.optional().default(DEFAULT_VISUAL_DECISION),
  visual_blocks: visualBlocksSchema.optional().default([]),
});

export const nodeDetailVisualResponseSchema = z
  .object({
    visual_decision: visualDecisionSchema,
    visual_blocks: visualBlocksSchema
      .min(REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT)
      .max(REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT),
  })
  .superRefine((data, ctx) => {
    const block = data.visual_blocks[0];
    if (!data.visual_decision.should_visualize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visual_decision", "should_visualize"],
        message: "required visual detail must set should_visualize=true",
      });
    }
    if (data.visual_decision.skill === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visual_decision", "skill"],
        message: "required visual detail cannot use skill=none",
      });
    }
    if (block && data.visual_decision.skill !== block.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visual_decision", "skill"],
        message: "visual_decision.skill must match visual_blocks[0].type",
      });
    }
  });

/**
 * 명세 §5·task 03 품질 가드레일: 스키마 통과 후 경고만 누적.
 *
 * Phase 12: 검사 로직을 `collectTreeQualityFailures`(tree-eval.ts)로 단일화하고,
 * 이 함수는 하위 호환을 위해 구조화 실패의 message만 추출해 그대로 반환한다.
 * 따라서 반환되는 경고 문자열과 순서는 기존과 동일하게 유지된다(응답/로그 회귀 없음).
 */
export function learningTreeQualityWarnings(
  tree: LearningTreeResponse,
  inputTopic: string,
): string[] {
  return collectTreeQualityFailures(tree, inputTopic).map(
    (failure) => failure.message,
  );
}

/**
 * Phase 14(§3.4·§6.6): 노드 학습 계약·퀴즈 품질 경고.
 *
 * 노드 상세(일반/문서 공통)의 learning_objective·mastery_evidence·concept_questions를
 * 검사해 안정적 code가 붙은 경고를 만든다. LLM 호출 없이 결정적으로 동작한다.
 * 반환 문자열은 "CODE: 설명" 형태라 기계 분기(code)와 사람 읽기(설명)를 함께 만족한다.
 */
function tokenizeForWarnings(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length >= 2),
  );
}

/** 문항 텍스트가 한 mastery_evidence 항목을 검증하는지 어휘 겹침으로 추정한다. */
function quizCoversEvidence(questionText: string, evidence: string): boolean {
  const questionTokens = tokenizeForWarnings(questionText);
  const evidenceTokens = [...tokenizeForWarnings(evidence)];
  if (evidenceTokens.length === 0) return false;
  let hit = 0;
  for (const token of evidenceTokens) {
    if (questionTokens.has(token)) hit += 1;
  }
  return hit / evidenceTokens.length >= 0.4;
}

export function learningContractQualityWarnings(detail: {
  learning_objective?: string;
  mastery_evidence?: string[];
  concept_questions?: ConceptQuestion[];
}): string[] {
  const w: string[] = [];

  const objective = detail.learning_objective?.trim() ?? "";
  if (!objective || !startsWithAllowedObjectiveVerb(objective)) {
    w.push(
      "MISSING_OR_INVALID_OBJECTIVE: learning_objective가 없거나 허용 동사(define/explain/apply/compare/debug)로 시작하지 않습니다.",
    );
  }

  const evidence = detail.mastery_evidence ?? [];
  if (evidence.length === 0) {
    w.push("MISSING_MASTERY_EVIDENCE: mastery_evidence가 비어 있습니다.");
  }

  const questions = detail.concept_questions ?? [];
  // 퀴즈와 증거가 모두 있는데 어떤 문항도 증거를 검증하지 않으면 gap으로 본다.
  if (questions.length > 0 && evidence.length > 0) {
    const coversAnyEvidence = evidence.some((item) =>
      questions.some((q) =>
        quizCoversEvidence(
          `${q.prompt} ${q.expected_answer} ${q.rubric.join(" ")}`,
          item,
        ),
      ),
    );
    if (!coversAnyEvidence) {
      w.push(
        "QUIZ_EVIDENCE_GAP: concept_questions가 mastery_evidence를 하나도 검증하지 않는 것으로 보입니다.",
      );
    }
  }
  // 문항이 2개 이상인데 전부 recall이면 정의 암기 편중으로 본다.
  if (questions.length >= 2 && questions.every((q) => q.type === "recall")) {
    w.push(
      "QUIZ_TYPE_IMBALANCE: concept_questions가 모두 recall 유형입니다(정의 암기 편중).",
    );
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
  // Phase 14: 학습 계약·퀴즈 품질 경고를 추가한다.
  w.push(...learningContractQualityWarnings(detail));
  w.push(...visualDetailQualityWarnings(detail));
  return w;
}

function visualDetailQualityWarnings(detail: {
  visual_decision?: VisualDecision;
  visual_blocks?: VisualBlock[];
}): string[] {
  const w: string[] = [];
  const decision = detail.visual_decision ?? DEFAULT_VISUAL_DECISION;
  const blocks = detail.visual_blocks ?? [];

  if (decision.should_visualize && blocks.length === 0) {
    w.push("visual_decision.should_visualize=true이지만 visual_blocks가 비어 있습니다.");
  }
  if (blocks.length > 2) {
    w.push("visual_blocks가 2개를 초과합니다. 핵심 시각화 1~2개만 권장합니다.");
  }

  blocks.forEach((block, blockIndex) => {
    if (block.annotations.length === 0) {
      w.push(`visual_blocks[${blockIndex}].annotations가 비어 있습니다.`);
    }
    block.annotations.forEach((annotation, annotationIndex) => {
      if (!annotation.trim()) {
        w.push(
          `visual_blocks[${blockIndex}].annotations[${annotationIndex}]가 비어 있습니다.`,
        );
      }
      if (annotation.length > 80) {
        w.push(
          `visual_blocks[${blockIndex}].annotations[${annotationIndex}]가 너무 깁니다.`,
        );
      }
    });
  });

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
        // Phase 13: 품질 필드는 llmConceptEdgeSchema의 transform이 이미 보정해 둔다.
        explanation: e.explanation,
        confidence: e.confidence,
        is_blocking: e.is_blocking,
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
        // Phase 13: 품질 필드는 llmConceptEdgeSchema의 transform이 이미 보정해 둔다.
        explanation: e.explanation,
        confidence: e.confidence,
        is_blocking: e.is_blocking,
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
    // Phase 14: 문서 노드도 학습 계약 필드를 optional로 받는다(하위 호환).
    learning_objective: learningObjectiveSchema.optional(),
    mastery_evidence: masteryEvidenceSchema.optional(),
    why_it_matters_for_document: z.string(),
    document_context_summary: z.string(),
    easy_explanation: z.string(),
    example: z.string(),
    common_misconceptions: z.array(z.string()),
    check_questions: z.array(documentNodeDetailQuestionSchema),
    concept_questions: z.array(conceptQuestionSchema).optional(),
    next_nodes: z.array(z.string()),
    visual_decision: visualDecisionSchema.optional().default(DEFAULT_VISUAL_DECISION),
    visual_blocks: visualBlocksSchema.optional().default([]),
  })
  .transform(
    (data): DocumentNodeDetailResponse => ({
      node_id: data.node_id,
      title: data.title,
      source_type: data.source_type,
      // Phase 14: transform이 명시적으로 필드를 매핑하므로 신규 필드도 그대로 통과시킨다.
      learning_objective: data.learning_objective,
      mastery_evidence: data.mastery_evidence,
      why_it_matters_for_document: data.why_it_matters_for_document,
      document_context_summary: data.document_context_summary,
      easy_explanation: data.easy_explanation,
      example: data.example,
      common_misconceptions: data.common_misconceptions,
      check_questions: data.check_questions.map((q) => ({
        question: q.question,
        answer: q.answer,
      })),
      concept_questions: data.concept_questions,
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
  // Phase 14: 문서 노드도 동일한 학습 계약·퀴즈 품질 경고를 적용한다.
  w.push(...learningContractQualityWarnings(detail));
  w.push(...visualDetailQualityWarnings(detail));
  return w;
}
