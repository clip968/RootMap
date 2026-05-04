"use client";

import type { ApiTreeResponse } from "@/lib/tree/bundle-to-api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLE_TOPICS = [
  "Transformer",
  "Rust lifetime",
  "가상 메모리",
  "데이터베이스 인덱스",
  "운영체제 스케줄링",
];

export function StartTopicForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [reuseConcepts, setReuseConcepts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const t = topic.trim();
    if (!t) {
      setError("주제를 입력해 주세요.");
      return;
    }
    setError(null);
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
          data?.error?.message ??
            "학습 트리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      const treeId = (data as ApiTreeResponse).tree_id;
      if (treeId) router.push(`/tree/${treeId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          RootMap
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          선수지식부터 잡는 학습 트리
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          배우고 싶은 주제를 입력하면 선수지식 트리를 생성합니다.
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="topic" className="sr-only">
          주제
        </label>
        <textarea
          id="topic"
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="예: Rust lifetime, Transformer, …"
          className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
        />
        <p className="text-xs text-zinc-500">
          Ctrl+Enter (또는 ⌘+Enter)로 빠르게 생성할 수 있습니다.
        </p>
        {error ? (
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        ) : null}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left dark:border-zinc-700 dark:bg-zinc-900/50">
          <input
            type="checkbox"
            checked={reuseConcepts}
            onChange={(e) => setReuseConcepts(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-400 text-emerald-700"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              저장된 개념 재사용
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              켜 두면 이전에 만든 Concept과 연결해 중복을 줄입니다. 끄면 항상
              새 Concept을 만듭니다.
            </span>
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading}
        className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        {loading ? "생성 중…" : "트리 생성"}
      </button>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          예시 주제
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_TOPICS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setTopic(ex)}
              className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
