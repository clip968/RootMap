/**
 * 학습 트리 "생성 + 저장" 오케스트레이션 레이어.
 *
 * - 라우트(`api/trees/generate`)는 HTTP만 담당하고, 이 모듈이 비즈니스 단계를 묶습니다.
 * - 단계: 주제 검증 → (선택) 기존 Concept 요약을 프롬프트에 넣기 → LLM 호출 → DB에 트리/노드/Concept 저장
 *   → 같은 트리를 다시 읽어 API 스키마(`bundleToApiTreeResponse`)로 변환
 */
import { InvalidTopicError } from "@/lib/llm/errors";
import { generateLearningTree } from "@/lib/llm/generate-tree";
import { MAX_TOPIC_LENGTH } from "@/lib/constants/limits";
import { getDb } from "@/db/client";
import {
  formatConceptsForPrompt,
  searchConceptsForPromptContext,
} from "@/lib/repository/concept-repository";
import {
  DEFAULT_USER_ID,
  createFullLearningTree,
  getLearningTree,
} from "@/lib/repository/learning-repository";
import { bundleToApiTreeResponse } from "@/lib/tree/bundle-to-api";

export class TreePersistError extends Error {
  constructor() {
    super("학습 트리를 저장하지 못했습니다.");
    this.name = "TreePersistError";
  }
}

/** `[tree-generate]` 로그에 붙는 stage — 라우트/LLM/퍼시스턴스와 구분 */
function logGenerateService(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "service", event, ...details });
}

/** 라우트에서 넘어온 `topic`을 공통 규칙으로 정제·검증 — 실패 시 `InvalidTopicError` */
export function validateTopicInput(topic: unknown): string {
  if (typeof topic !== "string") {
    throw new InvalidTopicError("주제는 문자열이어야 합니다.");
  }
  const t = topic.trim();
  if (!t) {
    throw new InvalidTopicError();
  }
  if (t.length > MAX_TOPIC_LENGTH) {
    throw new InvalidTopicError(
      `주제는 ${MAX_TOPIC_LENGTH}자 이하로 입력해 주세요.`,
    );
  }
  return t;
}

export interface GenerateAndPersistOptions {
  /** 기본 true — 기존 Concept 재사용 */
  reuseConcepts?: boolean;
  /** 있으면 각 단계마다 구조화 로그 출력 */
  requestId?: string;
}

/**
 * LLM이 돌려준 트리 JSON을 검증한 뒤 DB에 넣고, 클라이언트용 페이로드로 바꿔 반환합니다.
 *
 * @param rawTopic - 라우트에서 온 그대로(문자열 아닐 수 있음) — 내부에서 검증
 * @returns `bundleToApiTreeResponse` 결과 + `quality_warnings`(스키마는 아니지만 UX용 메시지)
 */
export async function generateAndPersistTree(
  rawTopic: unknown,
  options?: GenerateAndPersistOptions,
): Promise<
  ReturnType<typeof bundleToApiTreeResponse> & { quality_warnings: string[] }
> {
  const requestId = options?.requestId;
  const totalStartedAt = Date.now();
  const validationStartedAt = Date.now();
  const topic = validateTopicInput(rawTopic);
  const reuseConcepts = options?.reuseConcepts ?? true;

  if (requestId) {
    logGenerateService("topic_validated", {
      requestId,
      durationMs: Date.now() - validationStartedAt,
      topicLength: topic.length,
      reuseConcepts,
    });
  }

  const db = getDb();
  /** LLM 사용자 메시지에 붙일 "이미 저장된 개념 목록" 텍스트 — 재사용 끄면 비움 */
  let storeContext: string | undefined;
  if (reuseConcepts) {
    const conceptContextStartedAt = Date.now();
    const conceptRows = searchConceptsForPromptContext(db, topic, 24);
    storeContext = formatConceptsForPrompt(conceptRows);
    if (requestId) {
      logGenerateService("concept_context_ready", {
        requestId,
        durationMs: Date.now() - conceptContextStartedAt,
        conceptCount: conceptRows.length,
        storeContextLength: storeContext.length,
      });
    }
  } else if (requestId) {
    logGenerateService("concept_context_skipped", {
      requestId,
      reuseConcepts,
    });
  }

  const llmStartedAt = Date.now();
  /** `LearningTreeResponse` 형태의 노드/간선 + 품질 경고 문자열 */
  const { tree: llmTree, qualityWarnings } = await generateLearningTree(topic, {
    reuseConcepts,
    storeContext,
    requestId,
  });
  if (requestId) {
    logGenerateService("llm_generation_complete", {
      requestId,
      durationMs: Date.now() - llmStartedAt,
      nodeCount: llmTree.nodes.length,
      edgeCount: llmTree.edges?.length ?? 0,
      qualityWarningCount: qualityWarnings.length,
    });
  }

  let treeId: string;
  const persistStartedAt = Date.now();
  try {
    /** 단일 트랜잭션: learning_trees + nodes + progress + Phase2 concepts/edges */
    treeId = createFullLearningTree(
      topic,
      llmTree.summary ?? null,
      llmTree,
      DEFAULT_USER_ID,
      { reuseConcepts, requestId },
    );
  } catch {
    throw new TreePersistError();
  }
  if (requestId) {
    logGenerateService("persist_complete", {
      requestId,
      durationMs: Date.now() - persistStartedAt,
      treeId,
      nodeCount: llmTree.nodes.length,
      edgeCount: llmTree.edges?.length ?? 0,
      reuseConcepts,
    });
  }

  const loadStartedAt = Date.now();
  /** 저장 직후 UI에 줄 필드를 한 번에 모은 번들(노드 행, 진행률, concept 사용 횟수 등) */
  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (requestId) {
    logGenerateService("get_learning_tree_complete", {
      requestId,
      durationMs: Date.now() - loadStartedAt,
      found: Boolean(bundle),
    });
  }
  if (!bundle) {
    throw new TreePersistError();
  }

  const responseStartedAt = Date.now();
  const response = {
    ...bundleToApiTreeResponse(bundle),
    quality_warnings: qualityWarnings,
  };
  if (requestId) {
    logGenerateService("response_conversion_complete", {
      requestId,
      durationMs: Date.now() - responseStartedAt,
      totalDurationMs: Date.now() - totalStartedAt,
      nodeCount: response.nodes.length,
      qualityWarningCount: qualityWarnings.length,
    });
  }

  return response;
}
