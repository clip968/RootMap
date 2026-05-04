import { InvalidTopicError } from "@/lib/llm/errors";
import { generateLearningTree } from "@/lib/llm/generate-tree";
import { MAX_TOPIC_LENGTH } from "@/lib/constants/limits";
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

export async function generateAndPersistTree(rawTopic: unknown): Promise<
  ReturnType<typeof bundleToApiTreeResponse> & { quality_warnings: string[] }
> {
  const topic = validateTopicInput(rawTopic);
  const { tree: llmTree, qualityWarnings } = await generateLearningTree(topic);

  let treeId: string;
  try {
    treeId = createFullLearningTree(
      topic,
      llmTree.summary ?? null,
      llmTree,
      DEFAULT_USER_ID,
    );
  } catch {
    throw new TreePersistError();
  }

  const bundle = getLearningTree(treeId, DEFAULT_USER_ID);
  if (!bundle) {
    throw new TreePersistError();
  }

  return {
    ...bundleToApiTreeResponse(bundle),
    quality_warnings: qualityWarnings,
  };
}
