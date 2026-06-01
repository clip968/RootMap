import { createChatCompletion } from "@/lib/llm/chat";
import {
  LlmExhaustedRetriesError,
  LlmParseError,
  LlmTransportError,
  LlmValidationError,
} from "@/lib/llm/errors";
import {
  parseNodeDetailVisualResponse,
  type NodeDetailVisualResponse,
} from "@/lib/llm/parse";
import {
  buildNodeDetailVisualUserMessage,
  NODE_DETAIL_VISUAL_SYSTEM_PROMPT,
} from "@/lib/llm/prompts";
import {
  hasRequiredNodeDetailVisual,
  normalizeVisualBlocks,
  normalizeVisualDecision,
  REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT,
} from "@/lib/visualization/visual-block-schema";
import type { NodeDetailResponse, NodeType } from "@/types/learning";

const MAX_ATTEMPTS = 2;

export const NODE_DETAIL_MISSING_REQUIRED_VISUAL =
  "NODE_DETAIL_MISSING_REQUIRED_VISUAL";

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

export interface GenerateNodeDetailVisualInput {
  topic: string;
  nodeTitle: string;
  nodeType: NodeType;
  prerequisitesContext: string;
  detail: NodeDetailResponse;
}

export type NodeDetailVisualGenerator = (
  input: GenerateNodeDetailVisualInput,
) => Promise<NodeDetailVisualResponse>;

export async function generateNodeDetailVisual(
  input: GenerateNodeDetailVisualInput,
): Promise<NodeDetailVisualResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { rawText } = await createChatCompletion([
        { role: "system", content: NODE_DETAIL_VISUAL_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildNodeDetailVisualUserMessage(input),
        },
      ]);
      const visual = parseNodeDetailVisualResponse(rawText);
      if (visual.visual_blocks.length !== REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT) {
        throw new LlmValidationError("visual_blocks.length !== 1");
      }
      return visual;
    } catch (e) {
      lastError = e;
      if (shouldAbortRetries(e)) break;
      const retryable =
        e instanceof LlmParseError ||
        e instanceof LlmValidationError ||
        e instanceof LlmTransportError;
      if (!retryable) break;
    }
  }

  throw new LlmExhaustedRetriesError(
    "노드 시각화 응답을 처리하지 못했습니다.",
    lastError,
  );
}

export async function ensureRequiredNodeDetailVisual(input: {
  topic: string;
  nodeTitle: string;
  nodeType: NodeType;
  prerequisitesContext: string;
  detail: NodeDetailResponse;
  generateVisual?: NodeDetailVisualGenerator;
}): Promise<NodeDetailResponse> {
  if (hasRequiredNodeDetailVisual(input.detail)) {
    return {
      ...input.detail,
      visual_decision: normalizeVisualDecision(input.detail.visual_decision),
      visual_blocks: normalizeVisualBlocks(input.detail.visual_blocks).slice(
        0,
        REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT,
      ),
    };
  }

  // 텍스트 detail은 유지하고, worker에서 별도 visual-only 호출로 렌더 가능한 block만 보강한다.
  const generateVisual = input.generateVisual ?? generateNodeDetailVisual;
  const visual = await generateVisual({
    topic: input.topic,
    nodeTitle: input.nodeTitle,
    nodeType: input.nodeType,
    prerequisitesContext: input.prerequisitesContext,
    detail: input.detail,
  });
  const detailWithVisual: NodeDetailResponse = {
    ...input.detail,
    visual_decision: visual.visual_decision,
    visual_blocks: visual.visual_blocks,
  };
  if (!hasRequiredNodeDetailVisual(detailWithVisual)) {
    throw new Error(NODE_DETAIL_MISSING_REQUIRED_VISUAL);
  }
  return detailWithVisual;
}
