/**
 * 학습 트리 LLM 호출 전용 모듈.
 *
 * 트리 생성은 긴 JSON 하나를 한 번에 요구하지 않고,
 * 1) outline 생성, 2) category별 detail 채우기, 3) 코드 조립/검증 순서로 나눈다.
 */
import {
  createChatCompletion,
  getOpenRouterMaxAttempts,
  type ChatMessage,
} from "@/lib/llm/chat";
import {
  InvalidTopicError,
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import {
  parseLearningTreeDetailResponse,
  parseLearningTreeOutlineResponse,
  parseLearningTreeResponse,
  type LearningTreeDetailResponse,
  type LearningTreeOutlineResponse,
} from "@/lib/llm/parse";
import {
  buildLearningTreeDetailUserMessage,
  buildLearningTreeOutlineUserMessage,
  LEARNING_TREE_DETAIL_SYSTEM_PROMPT,
  LEARNING_TREE_OUTLINE_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import {
  learningTreeQualityWarnings,
} from "@/lib/llm/schemas";
import type {
  ConceptCandidate,
  LearningTreeNode,
  LearningTreeResponse,
  NodeType,
} from "@/types/learning";

export type ChatCompletionRunner = (
  messages: ChatMessage[],
) => Promise<{ rawText: string; status: number; model: string | null }>;

export interface GenerateLearningTreeResult {
  tree: LearningTreeResponse;
  qualityWarnings: string[];
}

export interface GenerateLearningTreeOptions {
  reuseConcepts?: boolean;
  /** `reuseConcepts`가 true일 때만 사용자 메시지에 포함 */
  storeContext?: string;
  requestId?: string;
}

type DetailPhase = {
  eventPrefix: string;
  label: string;
  types: NodeType[];
};

const DETAIL_PHASES: DetailPhase[] = [
  {
    eventPrefix: "prerequisite_detail",
    label: "선수지식 상세",
    types: ["prerequisite"],
  },
  {
    eventPrefix: "core_detail",
    label: "핵심 개념 상세",
    types: ["core"],
  },
  {
    eventPrefix: "support_detail",
    label: "보조/오해/퀴즈 상세",
    types: ["supplementary", "misconception", "quiz"],
  },
];

/** 인증 실패는 재시도해도 의미 없음 — 루프 탈출 */
function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

/** 로그/분기용: 마지막 실패 원인을 네 가지 묶음으로만 기록 */
function classifyLlmError(err: unknown): "parse" | "validation" | "transport" | "unknown" {
  if (err instanceof LlmParseError) return "parse";
  if (err instanceof LlmValidationError) return "validation";
  if (err instanceof LlmTransportError) return "transport";
  return "unknown";
}

function logGenerateLlm(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "llm", event, ...details });
}

function isRetryableLlmError(err: unknown): boolean {
  return (
    err instanceof LlmParseError ||
    err instanceof LlmValidationError ||
    err instanceof LlmTransportError
  );
}

async function runLlmPhase<T>(
  eventPrefix: string,
  maxAttempts: number,
  requestId: string | undefined,
  details: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptNumber = attempt + 1;
    const attemptStartedAt = Date.now();
    if (requestId) {
      logGenerateLlm(`${eventPrefix}_start`, {
        requestId,
        attempt: attemptNumber,
        maxAttempts,
        ...details,
      });
    }

    try {
      const result = await operation();
      if (requestId) {
        logGenerateLlm(`${eventPrefix}_success`, {
          requestId,
          attempt: attemptNumber,
          durationMs: Date.now() - attemptStartedAt,
          ...details,
        });
      }
      return result;
    } catch (err) {
      lastError = err;
      const retryable = isRetryableLlmError(err);
      const abortRetries = shouldAbortRetries(err);
      if (requestId) {
        logGenerateLlm(`${eventPrefix}_failure`, {
          requestId,
          attempt: attemptNumber,
          durationMs: Date.now() - attemptStartedAt,
          errorType: classifyLlmError(err),
          errorClass: err instanceof Error ? err.name : "UnknownError",
          status: err instanceof LlmTransportError ? err.status : undefined,
          retryable,
          abortRetries,
          ...details,
        });
      }

      if (abortRetries || !retryable) break;
    }
  }

  if (requestId) {
    logGenerateLlm(`${eventPrefix}_exhausted`, {
      requestId,
      maxAttempts,
      finalErrorType: classifyLlmError(lastError),
      finalErrorClass: lastError instanceof Error ? lastError.name : "UnknownError",
      ...details,
    });
  }

  throw new LlmExhaustedRetriesError(
    "LLM 응답을 처리하지 못했습니다.",
    lastError,
  );
}

function nodesForPhase(
  outline: LearningTreeOutlineResponse,
  phase: DetailPhase,
): Array<{ id: string; title: string; type: NodeType }> {
  return outline.nodes
    .filter((node) => phase.types.includes(node.type))
    .map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
    }));
}

function fallbackConceptCandidate(node: LearningTreeOutlineResponse["nodes"][number]): ConceptCandidate {
  return {
    canonical_title: node.title,
    aliases: [],
    domain: null,
    short_description: `${node.title}에 대한 핵심 개념입니다.`,
    is_reusable: node.type !== "quiz",
  };
}

function normalizeConceptCandidate(
  candidate:
    | LearningTreeDetailResponse["nodes"][number]["concept_candidate"]
    | undefined,
  node: LearningTreeOutlineResponse["nodes"][number],
): ConceptCandidate {
  if (!candidate) return fallbackConceptCandidate(node);
  return {
    canonical_title: candidate.canonical_title,
    aliases: candidate.aliases ?? [],
    domain: candidate.domain ?? null,
    short_description: candidate.short_description ?? "",
    is_reusable: candidate.is_reusable ?? true,
  };
}

function assembleLearningTree(
  outline: LearningTreeOutlineResponse,
  detailResponses: LearningTreeDetailResponse[],
): LearningTreeResponse {
  const detailById = new Map(
    detailResponses.flatMap((response) =>
      response.nodes.map((node) => [node.id, node] as const),
    ),
  );

  const nodes: LearningTreeNode[] = outline.nodes.map((node) => {
    const detail = detailById.get(node.id);
    return {
      id: node.id,
      title: node.title,
      type: node.type,
      description: detail?.description ?? `${node.title}를 학습합니다.`,
      difficulty: detail?.difficulty ?? 2,
      prerequisites: node.prerequisites,
      children: node.children,
      concept_candidate: normalizeConceptCandidate(
        detail?.concept_candidate,
        node,
      ),
    };
  });

  return parseLearningTreeResponse(
    JSON.stringify({
      topic: outline.topic,
      summary: outline.summary,
      nodes,
      edges: outline.edges,
      recommended_order: outline.recommended_order,
    }),
  );
}

/**
 * 테스트와 production 양쪽에서 쓰는 주입형 생성 코어.
 * production은 `generateLearningTree`가 실제 chat completion runner를 넘긴다.
 */
export async function generateLearningTreeWithCompletion(
  topic: string,
  completion: ChatCompletionRunner,
  options?: GenerateLearningTreeOptions,
): Promise<GenerateLearningTreeResult> {
  const trimmed = topic.trim();
  if (!trimmed) {
    throw new InvalidTopicError();
  }

  const storeContext =
    options?.reuseConcepts === false ? undefined : options?.storeContext;
  const requestId = options?.requestId;
  const maxAttempts = getOpenRouterMaxAttempts();

  const outline = await runLlmPhase(
    "outline",
    maxAttempts,
    requestId,
    {
      reuseConcepts: options?.reuseConcepts ?? true,
      storeContextLength: storeContext?.length ?? 0,
    },
    async () => {
      const { rawText } = await completion([
        { role: "system", content: LEARNING_TREE_OUTLINE_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildLearningTreeOutlineUserMessage(trimmed, storeContext),
        },
      ]);
      const parsed = parseLearningTreeOutlineResponse(rawText);
      if (requestId) {
        logGenerateLlm("outline_parsed", {
          requestId,
          nodeCount: parsed.nodes.length,
          edgeCount: parsed.edges.length,
          rawLength: rawText.length,
        });
      }
      return parsed;
    },
  );

  const detailResponses: LearningTreeDetailResponse[] = [];
  for (const phase of DETAIL_PHASES) {
    const nodes = nodesForPhase(outline, phase);
    if (nodes.length === 0) continue;

    const response = await runLlmPhase(
      phase.eventPrefix,
      maxAttempts,
      requestId,
      {
        phase: phase.label,
        nodeCount: nodes.length,
      },
      async () => {
        const { rawText } = await completion([
          { role: "system", content: LEARNING_TREE_DETAIL_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildLearningTreeDetailUserMessage(trimmed, nodes),
          },
        ]);
        const parsed = parseLearningTreeDetailResponse(rawText);
        if (requestId) {
          logGenerateLlm(`${phase.eventPrefix}_parsed`, {
            requestId,
            phase: phase.label,
            nodeCount: parsed.nodes.length,
            rawLength: rawText.length,
          });
        }
        return parsed;
      },
    );
    detailResponses.push(response);
  }

  const tree = assembleLearningTree(outline, detailResponses);
  const qualityWarnings = learningTreeQualityWarnings(tree, trimmed);
  if (requestId) {
    logGenerateLlm("assembled", {
      requestId,
      nodeCount: tree.nodes.length,
      edgeCount: tree.edges?.length ?? 0,
      qualityWarningCount: qualityWarnings.length,
    });
  }

  return { tree, qualityWarnings };
}

/**
 * 주제로 학습 트리 JSON을 생성·검증한다.
 */
export async function generateLearningTree(
  topic: string,
  options?: GenerateLearningTreeOptions,
): Promise<GenerateLearningTreeResult> {
  return generateLearningTreeWithCompletion(topic, createChatCompletion, options);
}
