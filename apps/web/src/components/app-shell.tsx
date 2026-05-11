/**
 * 전역 레이아웃 래퍼: 상단 바 + 좌측 "생성한 Tree" 히스토리 사이드바 + 페이지 본문.
 * `layout.tsx`에서 모든 페이지를 감싸므로, 트리 상세(`/tree/...`)와 홈(`/`)이 같은 네비게이션을 공유한다.
 */
"use client";

import type { ApiTreeHistoryItem } from "@/types/learning";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface AppShellProps {
  /** `layout.tsx`에서 넘기는 자식 — 보통 각 경로의 `page.tsx` 전체 */
  children: React.ReactNode;
}

/** API가 돌려주는 ISO 날짜 문자열을 짧은 한국어 표기(월·일·시·분)로 바꾼다. 파싱 실패 시 빈 문자열. */
function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  /** 데스크톱(md+)에서는 기본으로 펼친 상태. 닫으면 좁은 화면에서는 aside가 `hidden` 처리됨. */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<ApiTreeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  /**
   * 히스토리 목록을 서버에서 다시 가져온다.
   * - 의존성에 `pathname`을 넣어: 다른 트리로 이동·생성 직후에도 목록이 갱신되도록 한다.
   * - `cancelled`: 빠른 연속 네비게이션 시 언마운트된 뒤 setState가 호출되지 않게 한다.
   */
  useEffect(() => {
    let cancelled = false;

    void fetch("/api/trees")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data?.error?.message ?? "히스토리를 불러오지 못했습니다.",
          );
        }
        if (!cancelled) {
          setHistory((data as { trees?: ApiTreeHistoryItem[] }).trees ?? []);
          setHistoryError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHistoryError(
            error instanceof Error
              ? error.message
              : "히스토리를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      {/*
        사이드바 반응형 요약:
        - 기본 클래스에 `hidden`이 있어, md 미만에서는 상단 버튼으로 열 때만 `md:block` 분기로 보임.
        - sidebarOpen이 false면 너비 0 + md에서도 hidden → 본문만 넓게.
      */}
      <aside
        id="rootmap-history-sidebar"
        className={`${
          sidebarOpen
            ? "w-72 border-r px-3 md:block"
            : "w-0 border-r-0 px-0 md:hidden"
        } hidden shrink-0 overflow-hidden border-zinc-200 bg-white/90 py-3 transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950/90`}
      >
        <div className="flex h-full flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              RootMap
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              aria-label="히스토리 닫기"
            >
              ←
            </button>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + 새 Tree
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              History
            </p>
            {historyLoading ? (
              <p className="px-2 py-3 text-sm text-zinc-500">불러오는 중…</p>
            ) : historyError ? (
              <p className="px-2 py-3 text-sm text-red-600 dark:text-red-400">
                {historyError}
              </p>
            ) : history.length === 0 ? (
              <p className="px-2 py-3 text-sm leading-relaxed text-zinc-500">
                아직 만든 Tree가 없습니다.
              </p>
            ) : (
              <nav className="space-y-1" aria-label="생성한 Tree 히스토리">
                {history.map((item) => {
                  const href = `/tree/${item.tree_id}`;
                  /** 현재 URL과 동일하면 시각적으로 "선택된 히스토리" 스타일 적용. */
                  const active = pathname === href;
                  return (
                    <Link
                      key={item.tree_id}
                      href={href}
                      className={`block rounded-xl px-3 py-2 text-sm transition ${
                        active
                          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span className="line-clamp-2 font-medium leading-snug">
                        {item.topic}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {formatHistoryDate(item.updated_at)} · 노드 {item.node_count}개
                      </span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </div>
      </aside>

      {/* min-w-0: flex 자식이 긴 콘텐츠로 가로로 늘어나 뷰포트를 밀지 않도록 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-zinc-200 bg-zinc-50/85 px-3 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-expanded={sidebarOpen}
            aria-controls="rootmap-history-sidebar"
          >
            {sidebarOpen ? "히스토리 닫기" : "히스토리 열기"}
          </button>
          <Link
            href="/"
            className="rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            RootMap
          </Link>
        </div>
        {/* 각 페이지(`page.tsx`)가 여기로 렌더된다. */}
        <main className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-black">
          {children}
        </main>
      </div>
    </div>
  );
}
