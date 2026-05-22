export type EvidenceSourceType = "explicit" | "inferred" | "generated";

export interface ClaimEvidenceCandidate {
  text: string;
  sourceType: EvidenceSourceType;
  evidence_document_id?: string | null;
  evidence_page?: number | null;
  evidence_snippet?: string | null;
}

export interface ClaimEvidenceMapping {
  text: string;
  source_type: EvidenceSourceType;
  evidence_document_id: string | null;
  evidence_page: number | null;
  evidence_snippet: string | null;
  supported: boolean;
  unsupported_reason?: string;
}

export interface EvidenceGroundingEvaluation {
  node_id: string;
  claims: ClaimEvidenceMapping[];
  unsupported_claims: ClaimEvidenceMapping[];
  groundedness_score: number;
  unsupported_rate_by_source_type: Record<EvidenceSourceType, number>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

/**
 * 초기 eval은 LLM judge를 쓰지 않고 claim/evidence의 어휘 겹침만 본다.
 * 비용 없는 CI guard로 unsupported claim 후보를 빠르게 잡는 것이 목적이다.
 */
function hasUsefulOverlap(claim: string, evidence: string): boolean {
  const claimTokens = new Set(tokenize(claim));
  if (claimTokens.size === 0) return false;
  const evidenceTokens = new Set(tokenize(evidence));
  let overlap = 0;
  for (const token of claimTokens) {
    if (evidenceTokens.has(token)) overlap += 1;
  }
  return overlap >= Math.min(2, claimTokens.size);
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function unsupportedRateFor(
  claims: ClaimEvidenceMapping[],
  sourceType: EvidenceSourceType,
): number {
  const scoped = claims.filter((claim) => claim.source_type === sourceType);
  if (scoped.length === 0) return 0;
  return roundScore(scoped.filter((claim) => !claim.supported).length / scoped.length);
}

export function evaluateEvidenceGrounding(input: {
  nodeId: string;
  claims: ClaimEvidenceCandidate[];
}): EvidenceGroundingEvaluation {
  const claims = input.claims.map((claim): ClaimEvidenceMapping => {
    const snippet = claim.evidence_snippet?.trim() || null;
    const evidenceDocumentId = claim.evidence_document_id?.trim() || null;
    if (!evidenceDocumentId || !snippet) {
      return {
        text: claim.text,
        source_type: claim.sourceType,
        evidence_document_id: evidenceDocumentId,
        evidence_page: claim.evidence_page ?? null,
        evidence_snippet: snippet,
        supported: false,
        unsupported_reason: "missing_evidence",
      };
    }

    const supported = hasUsefulOverlap(claim.text, snippet);
    return {
      text: claim.text,
      source_type: claim.sourceType,
      evidence_document_id: evidenceDocumentId,
      evidence_page: claim.evidence_page ?? null,
      evidence_snippet: snippet,
      supported,
      unsupported_reason: supported ? undefined : "low_claim_evidence_overlap",
    };
  });
  const unsupportedClaims = claims.filter((claim) => !claim.supported);
  return {
    node_id: input.nodeId,
    claims,
    unsupported_claims: unsupportedClaims,
    groundedness_score: claims.length === 0
      ? 1
      : roundScore((claims.length - unsupportedClaims.length) / claims.length),
    unsupported_rate_by_source_type: {
      explicit: unsupportedRateFor(claims, "explicit"),
      inferred: unsupportedRateFor(claims, "inferred"),
      generated: unsupportedRateFor(claims, "generated"),
    },
  };
}
