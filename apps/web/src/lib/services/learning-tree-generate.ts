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

function logGenerateService(
  event: string,
  details: Record<string, unknown>,
): void {
  console.info("[tree-generate]", { stage: "service", event, ...details });
}

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
  requestId?: string;
}

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
