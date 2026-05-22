export type PromptInjectionRiskLevel = "low" | "medium" | "high";

export interface PromptInjectionMatch {
  pattern_id: string;
  snippet: string;
}

export interface PromptInjectionScanResult {
  document_id: string;
  risk_level: PromptInjectionRiskLevel;
  matched_patterns: PromptInjectionMatch[];
}

const INSTRUCTION_PATTERNS: Array<{ id: string; pattern: RegExp; risk: PromptInjectionRiskLevel }> = [
  { id: "ignore_previous_instructions", pattern: /ignore\s+(all\s+)?previous\s+instructions?/i, risk: "high" },
  { id: "override_system_prompt", pattern: /(system|developer)\s+prompt|you\s+are\s+now/i, risk: "high" },
  { id: "mark_everything_known", pattern: /mark\s+(every|all)\s+(concepts?|nodes?)\s+as\s+known/i, risk: "high" },
  { id: "hide_citations", pattern: /(do\s+not|don't)\s+(cite|include citations?|show evidence)/i, risk: "medium" },
  { id: "break_json_schema", pattern: /(break|ignore|do\s+not\s+follow)\s+(the\s+)?json\s+schema/i, risk: "high" },
];

/**
 * scanner는 초기에 hard block을 하지 않고 위험 flag만 만든다.
 * 업로드 문서가 실제 학습 자료일 수 있으므로, 차단보다 eval/debug 경로에서 확인 가능하게 남긴다.
 */
function riskRank(risk: PromptInjectionRiskLevel): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function scanPromptInjectionRisk(input: {
  documentId: string;
  text: string;
}): PromptInjectionScanResult {
  const matched = INSTRUCTION_PATTERNS.flatMap((entry) => {
    const match = entry.pattern.exec(input.text);
    if (!match) return [];
    return [{
      pattern_id: entry.id,
      snippet: snippetAround(input.text, match.index),
      risk: entry.risk,
    }];
  });
  const highestRisk = matched.reduce<PromptInjectionRiskLevel>(
    (current, item) => (riskRank(item.risk) > riskRank(current) ? item.risk : current),
    "low",
  );
  return {
    document_id: input.documentId,
    risk_level: highestRisk,
    matched_patterns: matched.map(({ pattern_id, snippet }) => ({ pattern_id, snippet })),
  };
}
