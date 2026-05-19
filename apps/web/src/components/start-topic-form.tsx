/**
 * 홈(`/`)에서 쓰는 시작 화면.
 *
 * Phase 1/2 흐름: 주제 입력 → `/api/trees/generate` → `/tree/[id]`
 * Phase 3 task 8 흐름: 문서 업로드 → `/api/documents/:id/process` → 분석 결과 → `/tree/[id]`
 */
"use client";

import type { ApiTreeResponse } from "@/lib/tree/bundle-to-api";
import type {
  DocumentConceptType,
  DocumentSourceType,
} from "@/types/learning";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/** 빠른 시연용 클릭 가능한 예시 문구들 */
const EXAMPLE_TOPICS = [
  "Transformer",
  "Rust lifetime",
  "가상 메모리",
  "데이터베이스 인덱스",
  "운영체제 스케줄링",
];

const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(["pdf", "txt", "md"]);
const DOCUMENT_PROCESS_POLL_INTERVAL_MS = 2_000;
const DOCUMENT_PROCESS_TIMEOUT_MS = 10 * 60 * 1_000;

type HomeMode = "topic" | "document";
type DocumentProcessingStatus =
  | "uploaded"
  | "text_extracted"
  | "chunked"
  | "concepts_extracted"
  | "tree_generated"
  | "failed";

interface DocumentUploadResponse {
  document_id: string;
  filename: string;
  processing_status: DocumentProcessingStatus;
}

interface DocumentStatusResponse {
  document_id: string;
  title: string;
  original_filename: string;
  file_type: string;
  page_count: number | null;
  processing_status: DocumentProcessingStatus;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentConceptSummary {
  document_concept_id: string;
  concept_id: string | null;
  concept_title: string;
  concept_type: DocumentConceptType;
  importance: number;
  difficulty: number;
  source_type: DocumentSourceType;
  evidence_count: number;
}

interface DocumentConceptsResponse {
  document_id: string;
  concepts: DocumentConceptSummary[];
}

interface DocumentTreeResponse extends ApiTreeResponse {
  document_id: string;
}

/**
 * 생성이 오래 걸릴 때 단조롭지 않게 단계 메시지를 바꾼다(실제 파이프라인 단계와 1:1 대응은 아님).
 * 경과 시간만 보여주는 것보다 사용자에게 진행 중임을 알려 주는 용도.
 */
function generationStageMessage(elapsedSeconds: number): string {
  if (elapsedSeconds < 8) return "개념 카드를 분류하고 있어요.";
  if (elapsedSeconds < 24) return "선수관계를 계산하고 있어요.";
  if (elapsedSeconds < 40) return "커뮤니티를 묶고 있어요.";
  if (elapsedSeconds < 56) return "학습 순서를 정리하고 있어요.";
  return "생성 결과를 검증하고 저장하고 있어요.";
}

/** 파일명만 보고도 브라우저에서 즉시 막을 수 있는 확장자 검증. 서버에서도 같은 검증을 다시 수행한다. */
export function isAllowedDocumentFileName(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_DOCUMENT_EXTENSIONS.has(ext);
}

/** 업로드 전 파일 크기를 사람이 읽기 쉬운 단위로 보여 주는 표시용 함수. */
export function formatDocumentFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** DB 처리 상태값을 사용자에게 보일 단계 문구로 변환한다. */
export function documentProcessingStage(status: DocumentProcessingStatus): string {
  const messages: Record<DocumentProcessingStatus, string> = {
    uploaded: "파일 업로드 완료",
    text_extracted: "문서 구조 분석 중",
    chunked: "개념 추출 중",
    concepts_extracted: "학습 트리 생성 중",
    tree_generated: "완료",
    failed: "처리 실패",
  };
  return messages[status];
}

/** 문서 분석 결과에서 “문서 핵심 개념”과 “선수지식”을 나눠 보여 주기 위한 그룹핑. */
export function splitDocumentConcepts(concepts: DocumentConceptSummary[]): {
  coreConcepts: DocumentConceptSummary[];
  prerequisiteConcepts: DocumentConceptSummary[];
} {
  const prerequisiteConcepts = concepts.filter(
    (concept) =>
      concept.concept_type === "prerequisite" ||
      concept.source_type === "inferred",
  );
  const prerequisiteIds = new Set(
    prerequisiteConcepts.map((concept) => concept.document_concept_id),
  );

  return {
    coreConcepts: concepts.filter(
      (concept) => !prerequisiteIds.has(concept.document_concept_id),
    ),
    prerequisiteConcepts,
  };
}

function sourceTypeLabel(sourceType: DocumentSourceType): string {
  if (sourceType === "explicit") return "문서에 직접 등장";
  if (sourceType === "inferred") return "이해를 위해 추론";
  return "생성된 학습 항목";
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    data.error &&
    typeof data.error === "object" &&
    "message" in data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }
  return fallback;
}

export function StartTopicForm() {
  const router = useRouter();
  const [mode, setMode] = useState<HomeMode>("topic");
  const [topic, setTopic] = useState("");
  /**
   * true: Phase 2 Concept 스토어와 매칭해 기존 개념을 재사용(중복 완화, 약간 더 느릴 수 있음).
   * API 본문 필드명은 스네이크 케이스 `reuse_concepts`.
   */
  const [reuseConcepts, setReuseConcepts] = useState(true);
  const [loading, setLoading] = useState(false);
  /** 생성 시작 후 경과 초 — 로딩 메시지와 타이머 표시에 사용 */
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentElapsedSeconds, setDocumentElapsedSeconds] = useState(0);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentProcessing, setDocumentProcessing] = useState(false);
  const [draggingDocument, setDraggingDocument] = useState(false);
  const [documentStatus, setDocumentStatus] =
    useState<DocumentStatusResponse | null>(null);
  const [documentTree, setDocumentTree] = useState<DocumentTreeResponse | null>(
    null,
  );
  const [documentConcepts, setDocumentConcepts] = useState<
    DocumentConceptSummary[]
  >([]);

  /** loading 동안 1초마다 경과 시간만 갱신(서버 진행률과는 무관한 클라이언트 표시용). */
  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  /** 문서 처리 중에도 같은 방식으로 경과 시간을 보여 주어 장시간 LLM 처리에서 멈춘 화면처럼 보이지 않게 한다. */
  useEffect(() => {
    if (!documentUploading && !documentProcessing) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setDocumentElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [documentUploading, documentProcessing]);

  const { coreConcepts, prerequisiteConcepts } = useMemo(
    () => splitDocumentConcepts(documentConcepts),
    [documentConcepts],
  );

  const submit = async () => {
    const t = topic.trim();
    if (!t) {
      setError("주제를 입력해 주세요.");
      return;
    }
    setError(null);
    setElapsedSeconds(0);
    setLoading(true);
    try {
      const res = await fetch("/api/trees/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t, reuse_concepts: reuseConcepts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          apiErrorMessage(
            data,
            "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          ),
        );
        return;
      }
      const treeId = (data as ApiTreeResponse).tree_id;
      if (treeId) router.push(`/tree/${treeId}`);
    } finally {
      /* 성공/실패와 관계없이 버튼을 다시 누를 수 있게(실패 시 같은 화면에 남음). */
      setLoading(false);
    }
  };

  const selectDocumentFile = (file: File | null) => {
    setDocumentError(null);
    setDocumentTree(null);
    setDocumentConcepts([]);
    setDocumentStatus(null);

    if (!file) {
      setDocumentFile(null);
      return;
    }
    if (!isAllowedDocumentFileName(file.name)) {
      setDocumentFile(null);
      setDocumentError("PDF, TXT, MD 문서만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setDocumentFile(null);
      setDocumentError("문서 파일은 최대 20MB까지 업로드할 수 있습니다.");
      return;
    }
    setDocumentFile(file);
  };

  const loadDocumentStatus = async (nextDocumentId: string) => {
    const res = await fetch(`/api/documents/${nextDocumentId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(apiErrorMessage(data, "문서 상태를 불러오지 못했습니다."));
    }
    const status = data as DocumentStatusResponse;
    setDocumentStatus(status);
    return status;
  };

  const loadDocumentResult = async (nextDocumentId: string) => {
    const [treeRes, conceptsRes] = await Promise.all([
      fetch(`/api/documents/${nextDocumentId}/tree`),
      fetch(`/api/documents/${nextDocumentId}/concepts`),
    ]);
    const treeData = await treeRes.json().catch(() => ({}));
    const conceptsData = await conceptsRes.json().catch(() => ({}));

    if (!treeRes.ok) {
      throw new Error(
        apiErrorMessage(treeData, "문서 기반 학습 트리를 불러오지 못했습니다."),
      );
    }
    if (!conceptsRes.ok) {
      throw new Error(
        apiErrorMessage(conceptsData, "문서 개념 목록을 불러오지 못했습니다."),
      );
    }

    setDocumentTree(treeData as DocumentTreeResponse);
    setDocumentConcepts(
      ((conceptsData as DocumentConceptsResponse).concepts ?? []).slice(0, 12),
    );
  };

  const waitForDocumentProcessingComplete = async (nextDocumentId: string) => {
    const deadline = Date.now() + DOCUMENT_PROCESS_TIMEOUT_MS;

    while (true) {
      const latest = await loadDocumentStatus(nextDocumentId);
      if (latest.processing_status === "tree_generated") return latest;
      if (latest.processing_status === "failed") {
        throw new Error(
          latest.processing_error ??
            "문서 처리 중 오류가 발생했습니다. 파일 내용을 확인한 뒤 다시 시도해 주세요.",
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          "문서 처리가 예상보다 오래 걸리고 있습니다. 잠시 후 히스토리에서 다시 확인해 주세요.",
        );
      }
      await new Promise((resolve) =>
        window.setTimeout(resolve, DOCUMENT_PROCESS_POLL_INTERVAL_MS),
      );
    }
  };

  const uploadAndProcessDocument = async () => {
    if (!documentFile) {
      setDocumentError("업로드할 문서를 선택해 주세요.");
      return;
    }

    setDocumentError(null);
    setDocumentElapsedSeconds(0);
    setDocumentUploading(true);
    setDocumentProcessing(false);
    setDocumentTree(null);
    setDocumentConcepts([]);

    try {
      const form = new FormData();
      form.set("file", documentFile);

      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        setDocumentError(
          apiErrorMessage(
            uploadData,
            "문서를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          ),
        );
        return;
      }

      const uploaded = uploadData as DocumentUploadResponse;
      setDocumentUploading(false);
      setDocumentProcessing(true);

      await loadDocumentStatus(uploaded.document_id);
      const processRes = await fetch(
        `/api/documents/${uploaded.document_id}/process`,
        { method: "POST" },
      );
      const processData = await processRes.json().catch(() => ({}));

      if (!processRes.ok) {
        setDocumentError(
          apiErrorMessage(
            processData,
            "문서 처리 중 오류가 발생했습니다. 파일 내용을 확인한 뒤 다시 시도해 주세요.",
          ),
        );
        return;
      }

      await waitForDocumentProcessingComplete(uploaded.document_id);
      await loadDocumentResult(uploaded.document_id);
    } catch (err) {
      setDocumentError(
        err instanceof Error ?
          err.message
        : "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setDocumentUploading(false);
      setDocumentProcessing(false);
    }
  };

  const documentBusy = documentUploading || documentProcessing;
  const documentStage =
    documentUploading ? "업로드 중"
    : documentProcessing && documentStatus?.processing_status === "uploaded" ?
      "텍스트 추출 중"
    : documentStatus ? documentProcessingStage(documentStatus.processing_status)
    : "문서 대기 중";

  return (
    /*
      화면: 상단 AppShell 툴바 높이를 빼고 세로 중앙에 히어로 + 모드 선택 + 입력 패널을 배치한다.
     */
    <div className="flex min-h-[calc(100dvh-3rem)] w-full flex-col items-center justify-center px-4 py-10">
      {/** 마케팅/안내 문구 */}
      <div className="mb-6 max-w-2xl space-y-3 text-center">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          RootMap
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          어떤 지식이 궁금하신가요?
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          주제를 직접 입력하거나 PDF/TXT/MD 문서를 올려 학습 Tree를 생성합니다.
        </p>
      </div>

      {/** 두 시작 방식을 분명히 나누는 세그먼트 컨트롤. */}
      <div className="mb-4 grid w-full max-w-2xl grid-cols-2 rounded-2xl border border-zinc-200 bg-zinc-100 p-1 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("topic")}
          className={`rounded-xl px-4 py-2 ${
            mode === "topic" ?
              "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          주제로 시작
        </button>
        <button
          type="button"
          onClick={() => setMode("document")}
          className={`rounded-xl px-4 py-2 ${
            mode === "document" ?
              "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          문서로 시작
        </button>
      </div>

      {mode === "topic" ? (
        <>
          {/** 주제 입력 · 생성 옵션 · 제출 */}
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <label htmlFor="topic" className="sr-only">
              주제
            </label>
            <textarea
              id="topic"
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                /* textarea에서는 Enter가 줄바꿈이므로, Ctrl/⌘+Enter만 제출 */
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="예: Rust lifetime, Transformer, ..."
              className="max-h-48 min-h-28 w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-50"
            />

            <div className="flex flex-col gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="px-2 text-xs text-zinc-500">
                  Ctrl+Enter (또는 ⌘+Enter)로 빠르게 생성할 수 있습니다.
                </p>
                {loading ? (
                  <div className="mx-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <p className="font-medium">
                      생성 중 · {elapsedSeconds}초 경과
                    </p>
                    <p className="mt-1 text-xs">
                      {generationStageMessage(elapsedSeconds)}
                    </p>
                    {reuseConcepts ? (
                      <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                        저장된 Concept과 비교해 중복을 줄이는 중이라 조금 더 걸릴 수 있습니다.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {error ? (
                  <p className="px-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                  </p>
                ) : null}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                  <input
                    type="checkbox"
                    checked={reuseConcepts}
                    onChange={(e) => setReuseConcepts(e.target.checked)}
                    disabled={loading}
                    className="mt-1 h-4 w-4 rounded border-zinc-400 text-emerald-700 disabled:opacity-60"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      저장된 개념 재사용
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      이전에 만든 Concept과 연결해 중복을 줄입니다.
                    </span>
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => void submit()}
                disabled={loading}
                className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {loading ? `생성 중 · ${elapsedSeconds}초` : "트리 생성"}
              </button>
            </div>
          </div>

          {/** 한 번에 주제 채우기용 */}
          <div className="mt-6 w-full max-w-2xl space-y-2">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500 sm:text-left">
              예시 주제
            </p>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {EXAMPLE_TOPICS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setTopic(ex)}
                  disabled={loading}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="w-full max-w-4xl space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <label
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDraggingDocument(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggingDocument(true);
                }}
                onDragLeave={() => setDraggingDocument(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDraggingDocument(false);
                  selectDocumentFile(e.dataTransfer.files.item(0));
                }}
                className={`flex min-h-52 flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition ${
                  draggingDocument ?
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-zinc-300 bg-zinc-50 hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900/50"
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  disabled={documentBusy}
                  onChange={(e) => selectDocumentFile(e.target.files?.item(0) ?? null)}
                  className="sr-only"
                />
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  문서를 끌어오거나 클릭해서 선택
                </span>
                <span className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  지원 형식: PDF, TXT, MD · 최대 파일 크기: 20MB
                </span>
                <span className="mt-1 text-xs text-zinc-500">
                  PDF는 텍스트가 포함된 파일을 권장합니다.
                </span>
              </label>

              <div className="flex w-full flex-col justify-between gap-4 lg:w-80">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      선택된 파일
                    </p>
                    {documentFile ? (
                      <div className="mt-2 rounded-2xl border border-zinc-200 px-3 py-3 dark:border-zinc-800">
                        <p className="break-all text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {documentFile.name}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDocumentFileSize(documentFile.size)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">
                        아직 선택된 문서가 없습니다.
                      </p>
                    )}
                  </div>

                  {documentBusy || documentStatus ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                      <p className="font-medium">
                        {documentStage}
                        {documentBusy ? ` · ${documentElapsedSeconds}초 경과` : ""}
                      </p>
                      {documentStatus?.page_count != null ? (
                        <p className="mt-1 text-xs">
                          추출된 페이지: {documentStatus.page_count}쪽
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {documentError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                      <p>{documentError}</p>
                      <p className="mt-1 text-xs">
                        파일 형식과 텍스트 포함 여부를 확인한 뒤 다시 시도해 주세요.
                      </p>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => void uploadAndProcessDocument()}
                  disabled={!documentFile || documentBusy}
                  className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {documentBusy ? "처리 중" : "업로드하고 분석 시작"}
                </button>
              </div>
            </div>
          </section>

          {documentTree ? (
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    분석 완료
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {documentStatus?.title ?? documentTree.topic}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    핵심 주제: {documentTree.topic}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/tree/${documentTree.tree_id}`)}
                  className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                >
                  학습 트리로 이동
                </button>
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {documentTree.summary || "문서 요약이 비어 있습니다."}
              </p>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <section>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    문서 핵심 개념
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {coreConcepts.length > 0 ?
                      coreConcepts.map((concept) => (
                        <li
                          key={concept.document_concept_id}
                          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {concept.concept_title}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500">
                            {sourceTypeLabel(concept.source_type)} · 근거 {concept.evidence_count}개
                          </span>
                        </li>
                      ))
                    : <li className="text-sm text-zinc-500">표시할 핵심 개념이 없습니다.</li>}
                  </ul>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    필요한 선수지식
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {prerequisiteConcepts.length > 0 ?
                      prerequisiteConcepts.map((concept) => (
                        <li
                          key={concept.document_concept_id}
                          className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-sm dark:border-blue-900 dark:bg-blue-950/25"
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {concept.concept_title}
                          </span>
                          <span className="mt-1 block text-xs text-blue-900/70 dark:text-blue-200/80">
                            {sourceTypeLabel(concept.source_type)}
                          </span>
                        </li>
                      ))
                    : <li className="text-sm text-zinc-500">표시할 선수지식이 없습니다.</li>}
                  </ul>
                </section>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
