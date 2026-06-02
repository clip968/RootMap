/**
 * 홈(`/`)에서 쓰는 시작 화면.
 *
 * Phase 1/2 흐름: 주제 입력 → `/api/trees/generate` → `/tree/[id]`
 * 문서 흐름: 문서 업로드 → document_id 확인. 이후 청킹/트리 생성은 GitHub Actions에서 수동 실행한다.
 */
"use client";

import type { ApiTreeResponse } from "@/lib/tree/bundle-to-api";
import { GenerationLoadingPanel } from "@/components/generation-loading-panel";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

interface DocumentUploadUrlResponse {
  bucket: string;
  key: string;
  signed_url: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  content_type: string;
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
    uploaded: "업로드 완료",
    text_extracted: "문서 구조 분석 중",
    chunked: "개념 추출 중",
    concepts_extracted: "학습 트리 생성 중",
    tree_generated: "완료",
    failed: "처리 실패",
  };
  return messages[status];
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
  const [loading, setLoading] = useState(false);
  /** 생성 시작 후 경과 초 — 로딩 메시지와 타이머 표시에 사용 */
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentElapsedSeconds, setDocumentElapsedSeconds] = useState(0);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [draggingDocument, setDraggingDocument] = useState(false);
  const [documentStatus, setDocumentStatus] =
    useState<DocumentStatusResponse | null>(null);

  /** loading 동안 1초마다 경과 시간만 갱신(서버 진행률과는 무관한 클라이언트 표시용). */
  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  /** 문서 업로드 중에는 경과 시간을 보여 주어 저장소 업로드가 멈춘 것처럼 보이지 않게 한다. */
  useEffect(() => {
    if (!documentUploading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setDocumentElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [documentUploading]);

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
        body: JSON.stringify({ topic: t, reuse_concepts: false }),
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

  const uploadDocument = async () => {
    if (!documentFile) {
      setDocumentError("업로드할 문서를 선택해 주세요.");
      return;
    }

    setDocumentError(null);
    setDocumentElapsedSeconds(0);
    setDocumentUploading(true);
    setDocumentStatus(null);

    try {
      const uploadUrlRes = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: documentFile.name,
          content_type: documentFile.type,
          size: documentFile.size,
        }),
      });
      const uploadUrlData = await uploadUrlRes.json().catch(() => ({}));
      if (!uploadUrlRes.ok) {
        setDocumentError(
          apiErrorMessage(
            uploadUrlData,
            "문서 업로드 URL을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          ),
        );
        return;
      }

      const uploadTicket = uploadUrlData as DocumentUploadUrlResponse;
      const storageUploadRes = await fetch(uploadTicket.signed_url, {
        method: "PUT",
        headers: {
          "Content-Type":
            uploadTicket.content_type || "application/octet-stream",
        },
        body: documentFile,
      });
      if (!storageUploadRes.ok) {
        setDocumentError(
          "문서를 저장소에 업로드하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }

      const completeRes = await fetch("/api/documents/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(uploadTicket),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        setDocumentError(
          apiErrorMessage(
            completeData,
            "문서 업로드 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          ),
        );
        return;
      }

      const uploaded = completeData as DocumentUploadResponse;
      /* complete-upload 응답의 document_id가 GitHub Actions 수동 실행에 필요한 최종 산출물이다. */
      setDocumentStatus({
        document_id: uploaded.document_id,
        title: uploadTicket.original_filename || uploaded.filename,
        original_filename: uploadTicket.original_filename || uploaded.filename,
        file_type: uploadTicket.file_type,
        page_count: null,
        processing_status: uploaded.processing_status,
        processing_error: null,
        created_at: "",
        updated_at: "",
      });
    } catch (err) {
      setDocumentError(
        err instanceof Error ?
          err.message
        : "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setDocumentUploading(false);
    }
  };

  const documentBusy = documentUploading;
  const documentStage =
    documentUploading ? "업로드 중"
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
                  <GenerationLoadingPanel
                    title="생성 중"
                    elapsedSeconds={elapsedSeconds}
                    stageMessage={generationStageMessage(elapsedSeconds)}
                  />
                ) : null}
                {error ? (
                  <p className="px-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                  </p>
                ) : null}
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
                      {documentStatus ? (
                        <div className="mt-2 rounded-xl border border-emerald-200 bg-white/70 px-3 py-2 dark:border-emerald-900 dark:bg-zinc-950/40">
                          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                            document_id
                          </p>
                          <code className="mt-1 block break-all font-mono text-xs text-emerald-950 dark:text-emerald-100">
                            {documentStatus.document_id}
                          </code>
                          <p className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                            GitHub Actions 수동 실행 시 이 값을 입력하면 됩니다.
                          </p>
                        </div>
                      ) : null}
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
                  onClick={() => void uploadDocument()}
                  disabled={!documentFile || documentBusy}
                  className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {documentBusy ? "업로드 중" : "문서 업로드"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
