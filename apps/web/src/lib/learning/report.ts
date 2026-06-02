import { createChatCompletion } from "@/lib/llm";
import { LlmParseError, LlmValidationError } from "@/lib/llm/errors";
import { sliceBalancedJsonObject, stripLlmFences } from "@/lib/llm/parse";
import type { ResolvedLlmProviderConfig } from "@/lib/llm/provider-config";
import { getLearningTree } from "@/lib/repository/learning-repository";
import {
  createLearningReport,
  getLearningSessionForUser,
  listLearningEventsForSession,
  listMisconceptionEventsForQuizAttempts,
  listQuizAttemptsForSession,
  listUserConceptMasteryForConcepts,
  type LearningReportRow,
} from "@/lib/repository/learning-session-repository";
import type { ProgressStatus } from "@/types/learning";
import { z } from "zod/v3";

export interface ReportConceptContext {
  conceptId: string;
  title: string;
  role?: string | null;
}

export interface ReportLearningEventInput {
  eventType: string;
  conceptId?: string | null;
  nodeId?: string | null;
  eventPayload?: Record<string, unknown>;
  createdAt?: Date | string | null;
}

export interface ReportMasteryRecordInput {
  conceptId: string;
  title?: string;
  status: ProgressStatus;
  confidenceScore: number;
  lastQuizScore?: number | null;
  wrongCount?: number;
  correctCount?: number;
  needsReview?: boolean;
}

export interface ReportQuizAttemptInput {
  conceptId?: string | null;
  score?: number | null;
  isCorrect?: boolean | null;
  feedback?: string | null;
  detectedMisconceptions?: string[];
  createdAt?: Date | string | null;
}

export interface ReportMisconceptionEventInput {
  conceptId?: string | null;
  misconceptionText: string;
  evidence?: string | null;
  resolved?: boolean;
  createdAt?: Date | string | null;
}

export interface WeakConceptAnalysisInput {
  concepts: ReportConceptContext[];
  masteryRecords: ReportMasteryRecordInput[];
  quizAttempts: ReportQuizAttemptInput[];
  misconceptionEvents: ReportMisconceptionEventInput[];
}

export interface WeakConceptAnalysisItem {
  concept_id: string;
  title: string;
  reason: string;
  priority: number;
  recommended_action: string;
}

export interface WeakConceptAnalysisResult {
  weakConcepts: WeakConceptAnalysisItem[];
  summary: string;
}

export interface SessionReportInput extends WeakConceptAnalysisInput {
  topic: string;
  learningEvents: ReportLearningEventInput[];
}

export interface SessionReportResult {
  title: string;
  summary: string;
  learnedConcepts: string[];
  strengths: string[];
  weaknesses: string[];
  nextRecommendations: string[];
}

export interface PersistedSessionReportResult extends SessionReportResult {
  reportId: string;
  reportRow: LearningReportRow;
  weakConcepts: WeakConceptAnalysisItem[];
}

export class SessionReportNotFoundError extends Error {
  constructor() {
    super("학습 세션을 찾을 수 없습니다.");
    this.name = "SessionReportNotFoundError";
  }
}

const sessionReportSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  learned_concepts: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  next_recommendations: z.array(z.string()).default([]),
});

const SESSION_REPORT_SYSTEM_PROMPT = [
  "You are generating a learning session report for a student.",
  "Return only valid JSON. Do not include markdown.",
  "Do not overstate mastery; use quiz and confidence evidence conservatively.",
  "The JSON schema is:",
  "{",
  '  "title": string,',
  '  "summary": string,',
  '  "learned_concepts": string[],',
  '  "strengths": string[],',
  '  "weaknesses": string[],',
  '  "next_recommendations": string[]',
  "}",
].join("\n");

function parseJsonObject(raw: string): unknown {
  const primary = stripLlmFences(raw);
  try {
    return JSON.parse(primary);
  } catch {
    const sliced = sliceBalancedJsonObject(raw);
    if (!sliced) throw new LlmParseError();
    try {
      return JSON.parse(sliced);
    } catch {
      throw new LlmParseError();
    }
  }
}

function roundPriority(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

function uniqueStrings(items: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function titleMapForConcepts(
  concepts: ReportConceptContext[],
): Map<string, ReportConceptContext> {
  return new Map(concepts.map((concept) => [concept.conceptId, concept]));
}

function conceptTitle(
  conceptId: string | null | undefined,
  conceptsById: Map<string, ReportConceptContext>,
): string {
  if (!conceptId) return "미지정 개념";
  return conceptsById.get(conceptId)?.title ?? conceptId;
}

function scoreFromQuizAttempts(
  conceptId: string,
  quizAttempts: ReportQuizAttemptInput[],
): { wrong: number; total: number; lowScore: boolean } {
  const attempts = quizAttempts.filter((attempt) => attempt.conceptId === conceptId);
  const wrong = attempts.filter((attempt) => attempt.isCorrect === false).length;
  const lowScore = attempts.some(
    (attempt) => typeof attempt.score === "number" && attempt.score < 0.5,
  );
  return { wrong, total: attempts.length, lowScore };
}

function unresolvedMisconceptionsForConcept(
  conceptId: string,
  misconceptionEvents: ReportMisconceptionEventInput[],
): ReportMisconceptionEventInput[] {
  return misconceptionEvents.filter(
    (event) => event.conceptId === conceptId && event.resolved !== true,
  );
}

function roleWeight(role: string | null | undefined): number {
  if (role === "prerequisite") return 0.12;
  if (role === "core" || role === "document_core") return 0.1;
  return 0.04;
}

function actionForWeakConcept(input: {
  title: string;
  role?: string | null;
  hasMisconception: boolean;
  hasWrongQuiz: boolean;
}): string {
  if (input.hasMisconception) {
    return `${input.title}의 대표 오개념을 다시 확인하고 짧은 예제 퀴즈를 풀어보세요.`;
  }
  if (input.role === "prerequisite") {
    return `${input.title} 선수지식을 먼저 복습한 뒤 다음 핵심 개념으로 넘어가세요.`;
  }
  if (input.hasWrongQuiz) {
    return `${input.title} 관련 오답 피드백을 읽고 같은 유형의 문제를 한 번 더 풀어보세요.`;
  }
  return `${input.title}의 핵심 정의와 예제를 짧게 복습하세요.`;
}

function reasonForWeakConcept(input: {
  confidenceScore: number;
  wrongCount: number;
  quizWrongCount: number;
  misconceptions: ReportMisconceptionEventInput[];
  role?: string | null;
  needsReview: boolean;
}): string {
  const reasons: string[] = [];
  if (input.confidenceScore < 0.4) {
    reasons.push("confidence_score가 낮습니다");
  }
  if (input.wrongCount > 0 || input.quizWrongCount > 0) {
    reasons.push("관련 오답 기록이 있습니다");
  }
  if (input.misconceptions.length > 0) {
    reasons.push(`해결되지 않은 오개념이 ${input.misconceptions.length}개 있습니다`);
  }
  if (input.role === "prerequisite") {
    reasons.push("후속 개념의 선수지식입니다");
  } else if (input.role === "core" || input.role === "document_core") {
    reasons.push("현재 트리의 핵심 개념입니다");
  }
  if (input.needsReview) {
    reasons.push("복습 필요 상태입니다");
  }
  return reasons.length > 0 ? reasons.join(", ") : "추가 확인이 필요한 개념입니다";
}

/** 약점 분석은 LLM 없이도 테스트 가능해야 하므로 confidence, 오답, 오개념 신호만으로 우선순위를 계산한다. */
export function analyzeWeakConcepts(
  input: WeakConceptAnalysisInput,
): WeakConceptAnalysisResult {
  const conceptsById = titleMapForConcepts(input.concepts);
  const candidates = input.masteryRecords
    .map((record) => {
      const concept = conceptsById.get(record.conceptId);
      const quiz = scoreFromQuizAttempts(record.conceptId, input.quizAttempts);
      const misconceptions = unresolvedMisconceptionsForConcept(
        record.conceptId,
        input.misconceptionEvents,
      );
      const wrongCount = record.wrongCount ?? 0;
      const confidenceScore = Math.max(0, Math.min(1, record.confidenceScore));
      const lowConfidence = 1 - confidenceScore;
      const quizSignal =
        quiz.total > 0 ? Math.min(1, (quiz.wrong + (quiz.lowScore ? 1 : 0)) / quiz.total) : 0;
      const misconceptionSignal = Math.min(1, misconceptions.length / 2);
      const reviewSignal = record.needsReview === false ? 0 : 0.05;
      const priority = roundPriority(
        lowConfidence * 0.35 +
          Math.min(1, wrongCount / 3) * 0.18 +
          quizSignal * 0.2 +
          misconceptionSignal * 0.25 +
          roleWeight(concept?.role) +
          reviewSignal,
      );
      return {
        record,
        concept,
        quiz,
        misconceptions,
        priority,
      };
    })
    .filter((candidate) => {
      if (candidate.priority >= 0.45) return true;
      if (candidate.misconceptions.length > 0) return true;
      return candidate.record.needsReview === true && candidate.record.confidenceScore < 0.6;
    })
    .sort((a, b) => b.priority - a.priority || a.record.conceptId.localeCompare(b.record.conceptId));

  const weakConcepts = candidates.slice(0, 5).map((candidate) => {
    const title = candidate.record.title ?? candidate.concept?.title ?? candidate.record.conceptId;
    const hasMisconception = candidate.misconceptions.length > 0;
    const hasWrongQuiz = candidate.quiz.wrong > 0 || (candidate.record.wrongCount ?? 0) > 0;
    return {
      concept_id: candidate.record.conceptId,
      title,
      reason: reasonForWeakConcept({
        confidenceScore: candidate.record.confidenceScore,
        wrongCount: candidate.record.wrongCount ?? 0,
        quizWrongCount: candidate.quiz.wrong,
        misconceptions: candidate.misconceptions,
        role: candidate.concept?.role,
        needsReview: candidate.record.needsReview ?? true,
      }),
      priority: candidate.priority,
      recommended_action: actionForWeakConcept({
        title,
        role: candidate.concept?.role,
        hasMisconception,
        hasWrongQuiz,
      }),
    };
  });

  return {
    weakConcepts,
    summary:
      weakConcepts.length > 0 ?
        `${weakConcepts.map((item) => item.title).join(", ")} 순서로 복습하면 다음 학습 흐름이 안정됩니다.`
      : "이번 세션에서는 뚜렷한 약점 개념이 발견되지 않았습니다.",
  };
}

/** LLM에 전달하는 메시지는 세션 학습 근거만 압축해 보내고, 원문 답변 전체나 불필요한 사용자 정보는 제외한다. */
export function buildSessionReportUserMessage(input: SessionReportInput): string {
  return [
    `Session topic:\n${input.topic}`,
    "Learning events:",
    JSON.stringify(
      input.learningEvents.map((event) => ({
        event_type: event.eventType,
        concept_id: event.conceptId ?? null,
        node_id: event.nodeId ?? null,
        event_payload: event.eventPayload ?? {},
        created_at: iso(event.createdAt),
      })),
      null,
      2,
    ),
    "Concept mastery changes:",
    JSON.stringify(
      input.masteryRecords.map((record) => ({
        concept_id: record.conceptId,
        title: record.title ?? conceptTitle(record.conceptId, titleMapForConcepts(input.concepts)),
        status: record.status,
        confidence_score: record.confidenceScore,
        last_quiz_score: record.lastQuizScore ?? null,
        wrong_count: record.wrongCount ?? 0,
        correct_count: record.correctCount ?? 0,
        needs_review: record.needsReview ?? true,
      })),
      null,
      2,
    ),
    "Quiz attempts:",
    JSON.stringify(
      input.quizAttempts.map((attempt) => ({
        concept_id: attempt.conceptId ?? null,
        score: attempt.score ?? null,
        is_correct: attempt.isCorrect ?? null,
        feedback: attempt.feedback ?? null,
        detected_misconceptions: attempt.detectedMisconceptions ?? [],
        created_at: iso(attempt.createdAt),
      })),
      null,
      2,
    ),
    "Misconception events:",
    JSON.stringify(
      input.misconceptionEvents.map((event) => ({
        concept_id: event.conceptId ?? null,
        misconception_text: event.misconceptionText,
        evidence: event.evidence ?? null,
        resolved: event.resolved ?? false,
        created_at: iso(event.createdAt),
      })),
      null,
      2,
    ),
    "Learning tree context:",
    JSON.stringify(
      input.concepts.map((concept) => ({
        concept_id: concept.conceptId,
        title: concept.title,
        role: concept.role ?? null,
      })),
      null,
      2,
    ),
    "Generate a concise learning report with actionable next steps.",
  ].join("\n\n");
}

export function parseSessionReportResponse(raw: string): SessionReportResult {
  const parsed = parseJsonObject(raw);
  const result = sessionReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError("학습 리포트 응답 형식이 올바르지 않습니다.", result.error.issues);
  }
  return {
    title: result.data.title,
    summary: result.data.summary,
    learnedConcepts: result.data.learned_concepts,
    strengths: result.data.strengths,
    weaknesses: result.data.weaknesses,
    nextRecommendations: result.data.next_recommendations,
  };
}

export async function generateSessionReportWithLlm(
  input: SessionReportInput,
  providerConfig: ResolvedLlmProviderConfig,
): Promise<SessionReportResult> {
  const completion = await createChatCompletion([
    { role: "system", content: SESSION_REPORT_SYSTEM_PROMPT },
    { role: "user", content: buildSessionReportUserMessage(input) },
  ], { providerConfig });
  return parseSessionReportResponse(completion.rawText);
}

function eventConceptTitles(input: SessionReportInput): string[] {
  const conceptsById = titleMapForConcepts(input.concepts);
  return uniqueStrings(
    input.learningEvents
      .map((event) => event.conceptId)
      .filter((conceptId): conceptId is string => Boolean(conceptId))
      .map((conceptId) => conceptTitle(conceptId, conceptsById)),
  );
}

/** LLM 실패나 로컬 스모크에서 같은 정책을 쓸 수 있게 세션 리포트의 최소 산출물을 결정론적으로 만든다. */
export function buildDeterministicSessionReport(
  input: SessionReportInput,
): SessionReportResult {
  const weakAnalysis = analyzeWeakConcepts(input);
  const conceptsById = titleMapForConcepts(input.concepts);
  const learnedConcepts = uniqueStrings([
    ...eventConceptTitles(input),
    ...input.masteryRecords
      .filter((record) => record.confidenceScore >= 0.4 || (record.correctCount ?? 0) > 0)
      .map((record) => record.title ?? conceptTitle(record.conceptId, conceptsById)),
  ]);
  const strengths = uniqueStrings(
    input.masteryRecords
      .filter((record) => record.status === "known" || record.confidenceScore >= 0.75)
      .map((record) => {
        const title = record.title ?? conceptTitle(record.conceptId, conceptsById);
        return `${title}: 이해도와 퀴즈 기록이 안정적입니다.`;
      }),
    5,
  );
  const weaknesses = weakAnalysis.weakConcepts.map(
    (item) => `${item.title}: ${item.reason}`,
  );
  const completedCount = input.learningEvents.filter(
    (event) => event.eventType === "node_completed",
  ).length;
  const openedCount = input.learningEvents.filter(
    (event) => event.eventType === "node_opened",
  ).length;

  return {
    title: `${input.topic} 학습 세션 리포트`,
    summary:
      weakAnalysis.weakConcepts.length > 0 ?
        `${openedCount}개 노드를 확인하고 ${completedCount}개 노드를 완료했습니다. ${weakAnalysis.summary}`
      : `${openedCount}개 노드를 확인하고 ${completedCount}개 노드를 완료했습니다. 다음 학습으로 넘어갈 준비가 되어 있습니다.`,
    learnedConcepts,
    strengths:
      strengths.length > 0 ?
        strengths
      : ["이번 세션의 강점은 추가 퀴즈나 자기 평가가 쌓이면 더 명확해집니다."],
    weaknesses:
      weaknesses.length > 0 ?
        weaknesses
      : ["이번 세션에서는 즉시 보강해야 할 약점이 크게 드러나지 않았습니다."],
    nextRecommendations:
      weakAnalysis.weakConcepts.length > 0 ?
        weakAnalysis.weakConcepts.map((item) => item.recommended_action)
      : ["다음 추천 노드로 이동해 새 개념을 학습하세요."],
  };
}

function mergeSessionReport(
  llmReport: SessionReportResult | null,
  fallback: SessionReportResult,
): SessionReportResult {
  if (!llmReport) return fallback;
  return {
    title: llmReport.title || fallback.title,
    summary: llmReport.summary || fallback.summary,
    learnedConcepts: uniqueStrings([...llmReport.learnedConcepts, ...fallback.learnedConcepts]),
    strengths: uniqueStrings(llmReport.strengths.length > 0 ? llmReport.strengths : fallback.strengths),
    weaknesses: uniqueStrings([...llmReport.weaknesses, ...fallback.weaknesses], 8),
    nextRecommendations: uniqueStrings(
      [...llmReport.nextRecommendations, ...fallback.nextRecommendations],
      8,
    ),
  };
}

function textRecords(items: string[]): Array<Record<string, unknown>> {
  return items.map((text) => ({ text }));
}

function weakRecords(items: WeakConceptAnalysisItem[]): Array<Record<string, unknown>> {
  return items.map((item) => ({
    concept_id: item.concept_id,
    title: item.title,
    reason: item.reason,
    priority: item.priority,
    recommended_action: item.recommended_action,
  }));
}

async function collectSessionReportInput(input: {
  userId: string;
  sessionId: string;
}): Promise<SessionReportInput> {
  const session = await getLearningSessionForUser(input);
  if (!session) throw new SessionReportNotFoundError();

  const [events, quizAttempts] = await Promise.all([
    listLearningEventsForSession(input),
    listQuizAttemptsForSession(input),
  ]);
  const misconceptionEvents = await listMisconceptionEventsForQuizAttempts({
    userId: input.userId,
    quizAttemptIds: quizAttempts.map((attempt) => attempt.id),
  });
  const tree = session.treeId ? await getLearningTree(session.treeId, input.userId) : null;
  const conceptById = new Map<string, ReportConceptContext>();
  for (const node of tree?.nodes ?? []) {
    if (!node.conceptId) continue;
    /** 같은 Concept이 여러 노드에 나오면 먼저 발견한 제목/역할을 대표 문맥으로 사용한다. */
    if (!conceptById.has(node.conceptId)) {
      conceptById.set(node.conceptId, {
        conceptId: node.conceptId,
        title: node.title,
        role: node.type,
      });
    }
  }
  for (const conceptId of [
    ...events.map((event) => event.conceptId),
    ...quizAttempts.map((attempt) => attempt.conceptId),
    ...misconceptionEvents.map((event) => event.conceptId),
  ]) {
    if (conceptId && !conceptById.has(conceptId)) {
      conceptById.set(conceptId, { conceptId, title: conceptId, role: null });
    }
  }
  const masteryRows = await listUserConceptMasteryForConcepts({
    userId: input.userId,
    conceptIds: [...conceptById.keys()],
  });
  const concepts = [...conceptById.values()];
  const conceptsById = titleMapForConcepts(concepts);

  return {
    topic: tree?.tree.topic ?? "학습 세션",
    concepts,
    learningEvents: events.map((event) => ({
      eventType: event.eventType,
      conceptId: event.conceptId,
      nodeId: event.nodeId,
      eventPayload: event.eventPayload,
      createdAt: event.createdAt,
    })),
    masteryRecords: masteryRows.map((row) => ({
      conceptId: row.conceptId,
      title: conceptTitle(row.conceptId, conceptsById),
      status: row.status as ProgressStatus,
      confidenceScore: row.confidenceScore,
      lastQuizScore: row.lastQuizScore,
      wrongCount: row.wrongCount,
      correctCount: row.correctCount,
      needsReview: row.needsReview,
    })),
    quizAttempts: quizAttempts.map((attempt) => ({
      conceptId: attempt.conceptId,
      score: attempt.score,
      isCorrect: attempt.isCorrect,
      feedback: attempt.feedback,
      detectedMisconceptions: attempt.detectedMisconceptions,
      createdAt: attempt.createdAt,
    })),
    misconceptionEvents: misconceptionEvents.map((event) => ({
      conceptId: event.conceptId,
      misconceptionText: event.misconceptionText,
      evidence: event.evidence,
      resolved: event.resolved,
      createdAt: event.createdAt,
    })),
  };
}

/** API route와 세션 종료 route가 공유하는 저장 함수다. LLM이 실패해도 결정론적 리포트를 저장해 세션 종료 흐름을 끊지 않는다. */
export async function createSessionLearningReport(input: {
  userId: string;
  sessionId: string;
  providerConfig: ResolvedLlmProviderConfig;
}): Promise<PersistedSessionReportResult> {
  const session = await getLearningSessionForUser(input);
  if (!session) throw new SessionReportNotFoundError();
  const reportInput = await collectSessionReportInput(input);
  const weakAnalysis = analyzeWeakConcepts(reportInput);
  const fallback = buildDeterministicSessionReport(reportInput);
  let llmReport: SessionReportResult | null = null;
  let llmError: string | null = null;
  try {
    llmReport = await generateSessionReportWithLlm(reportInput, input.providerConfig);
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
  }
  const report = mergeSessionReport(llmReport, fallback);
  const row = await createLearningReport({
    userId: input.userId,
    reportType: "session",
    periodStart: session.startedAt,
    periodEnd: session.endedAt ?? new Date(),
    title: report.title,
    summary: report.summary,
    strengths: textRecords(report.strengths),
    weaknesses: weakAnalysis.weakConcepts.length > 0 ? weakRecords(weakAnalysis.weakConcepts) : textRecords(report.weaknesses),
    recommendations: textRecords(report.nextRecommendations),
    reportJson: {
      report_type: "session",
      session_id: input.sessionId,
      generated_by: llmReport ? "llm" : "deterministic_fallback",
      llm_error: llmError,
      learned_concepts: report.learnedConcepts,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      next_recommendations: report.nextRecommendations,
      weak_concepts: weakAnalysis.weakConcepts,
      weak_concept_summary: weakAnalysis.summary,
    },
  });

  return {
    ...report,
    reportId: row.id,
    reportRow: row,
    weakConcepts: weakAnalysis.weakConcepts,
  };
}
