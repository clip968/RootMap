import { createChatCompletion, type ChatMessage } from "@/lib/llm/chat";
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
import type { ResolvedLlmProviderConfig } from "@/lib/llm/provider-config";
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

// 첫 시도(attempt 0) + 검증 실패 시 issue를 되먹이는 repair 시도 2회.
// best-effort visual 경로(동기 클릭에서 inline await)에서 호출되므로 응답 지연이
// 무한정 늘어나지 않도록 3회로 제한한다. 대부분은 attempt 0 또는 1에서 통과한다.
const MAX_ATTEMPTS = 3;

export const NODE_DETAIL_MISSING_REQUIRED_VISUAL =
  "NODE_DETAIL_MISSING_REQUIRED_VISUAL";

function shouldAbortRetries(err: unknown): boolean {
  return err instanceof LlmTransportError && err.status === 401;
}

// LlmValidationError.issues(zod 위반 목록)를 모델에게 돌려줄 수 있는 "경로: 메시지" 줄로 만든다.
// issues가 없으면(예: visual_blocks 개수 검증 실패) 에러 메시지 자체를 힌트로 사용한다.
function formatValidationIssues(err: LlmValidationError): string {
  const lines = (err.issues ?? [])
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return lines.length ? lines.join("\n") : err.message;
}

export interface GenerateNodeDetailVisualInput {
  providerConfig: ResolvedLlmProviderConfig;
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
  // 매 시도마다 처음부터 새로 만들지 않고, 직전 출력과 검증 실패 내역을 대화에 누적해
  // 모델이 "JSON만 고치도록" 유도하는 repair loop로 동작한다. 스키마 제약(예: row 길이,
  // skill=block.type, unit enum)은 한 번에 다 지키기 어려워, 실패 사유를 그대로 돌려주면
  // 처음부터 다시 생성하는 것보다 통과 확률이 높다.
  const messages: ChatMessage[] = [
    { role: "system", content: NODE_DETAIL_VISUAL_SYSTEM_PROMPT },
    { role: "user", content: buildNodeDetailVisualUserMessage(input) },
  ];
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // catch 블록에서 직전 출력을 repair 메시지로 되먹이기 위해 try 밖에 둔다.
    let rawText = "";
    try {
      const completion = await createChatCompletion(messages, {
        providerConfig: input.providerConfig,
      });
      rawText = completion.rawText;
      const visual = parseNodeDetailVisualResponse(rawText);
      if (visual.visual_blocks.length !== REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT) {
        throw new LlmValidationError("visual_blocks.length !== 1");
      }
      return visual;
    } catch (e) {
      lastError = e;
      if (shouldAbortRetries(e)) break;

      // 스키마/검증 실패는 다음 시도에서 "직전 출력 + 실패 사유"를 함께 주어 고치게 한다.
      // (transport 오류 등 rawText가 비어 있는 경우에는 동일 메시지로 재시도한다.)
      if (e instanceof LlmValidationError && rawText) {
        messages.push({ role: "assistant", content: rawText });
        messages.push({
          role: "user",
          content:
            "Your previous JSON failed validation. Fix only the JSON and return JSON only. Do not add prose or code fences.\n" +
            formatValidationIssues(e),
        });
      }

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
  providerConfig: ResolvedLlmProviderConfig;
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
    providerConfig: input.providerConfig,
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
