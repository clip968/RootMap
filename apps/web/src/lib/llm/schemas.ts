import { z } from "zod/v3";
import type { LearningTreeResponse, NodeDetailResponse } from "@/types/learning";

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
  difficulty: z.number().finite(),
  prerequisites: z.array(z.string()),
  children: z.array(z.string()),
  concept_candidate: conceptCandidateSchema.optional(),
});

export const learningTreeResponseSchema = z
  .object({
    topic: z.string().min(1),
    summary: z.string(),
    nodes: z.array(learningTreeNodeSchema),
    recommended_order: z.array(z.string()),
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
