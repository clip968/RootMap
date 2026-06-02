"use client";

import {
  authenticatedFetch,
  readSupabaseAccessToken,
  subscribeSupabaseAccessToken,
} from "@/lib/auth/browser-auth";
import {
  PlugZap,
  RefreshCcw,
  Save,
  Settings,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

type ProviderType = "openrouter" | "openai_compatible" | "crofai";
type JsonMode = "auto" | "enabled" | "disabled";

interface ProviderStatus {
  source: "database" | "env" | "none";
  providerType: ProviderType | null;
  name: string;
  baseUrl: string | null;
  model: string | null;
  jsonMode: JsonMode;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyHint: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
  status?: number;
  model?: string | null;
}

const PROVIDERS: Array<{
  type: ProviderType;
  label: string;
  defaultBaseUrl: string;
}> = [
  {
    type: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
  {
    type: "openai_compatible",
    label: "Custom",
    defaultBaseUrl: "",
  },
  {
    type: "crofai",
    label: "CrofAI",
    defaultBaseUrl: "https://crof.ai/v1",
  },
];

function apiErrorMessage(data: unknown, fallback: string): string {
  const error =
    data && typeof data === "object" && "error" in data ?
      (data as { error?: { message?: unknown } }).error
    : null;
  if (typeof error?.message === "string") return error.message;
  return fallback;
}

function providerLabel(type: ProviderType): string {
  return PROVIDERS.find((item) => item.type === type)?.label ?? "Provider";
}

async function fetchProviderStatus(): Promise<ProviderStatus> {
  const res = await authenticatedFetch(
    "/api/settings/llm-provider",
    {},
    { contentType: null },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(data, "LLM provider 설정을 불러오지 못했습니다."));
  }
  return data as ProviderStatus;
}

export function LlmProviderSettingsPanel() {
  const accessToken = useSyncExternalStore(
    subscribeSupabaseAccessToken,
    readSupabaseAccessToken,
    () => null,
  );
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [providerType, setProviderType] = useState<ProviderType>("openrouter");
  const [baseUrl, setBaseUrl] = useState("https://openrouter.ai/api/v1");
  const [model, setModel] = useState("");
  const [jsonMode, setJsonMode] = useState<JsonMode>("auto");
  const [apiKey, setApiKey] = useState("");
  const [replaceApiKey, setReplaceApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((item) => item.type === providerType) ?? PROVIDERS[0],
    [providerType],
  );
  const hasStoredKey = Boolean(status?.hasApiKey && status.source === "database");

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchProviderStatus();
      setStatus(next);
      setProviderType(next.providerType ?? "openrouter");
      setBaseUrl(next.baseUrl ?? "https://openrouter.ai/api/v1");
      setModel(next.model ?? "");
      setJsonMode(next.jsonMode);
      setApiKey("");
      setReplaceApiKey(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "LLM provider 설정을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) return;
    fetchProviderStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setProviderType(next.providerType ?? "openrouter");
        setBaseUrl(next.baseUrl ?? "https://openrouter.ai/api/v1");
        setModel(next.model ?? "");
        setJsonMode(next.jsonMode);
        setApiKey("");
        setReplaceApiKey(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "LLM provider 설정을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken) {
    return (
      <section className="w-full max-w-4xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <Settings size={16} aria-hidden="true" />
          <span>LLM Provider</span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Provider 설정
        </h2>
        <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
          로그인 후 계정의 LLM API key를 설정할 수 있습니다.
        </p>
      </section>
    );
  }

  function selectProvider(nextType: ProviderType) {
    const nextProvider = PROVIDERS.find((item) => item.type === nextType);
    setProviderType(nextType);
    // preset 전환 시 기본 URL이 명확한 provider는 즉시 채워 저장 실수를 줄인다.
    if (nextProvider?.defaultBaseUrl && baseUrl !== nextProvider.defaultBaseUrl) {
      setBaseUrl(nextProvider.defaultBaseUrl);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    setTestResult(null);
    try {
      const res = await authenticatedFetch("/api/settings/llm-provider", {
        method: "PUT",
        body: JSON.stringify({
          providerType,
          baseUrl,
          model,
          jsonMode,
          apiKey: hasStoredKey && !replaceApiKey ? "" : apiKey,
          isActive: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "LLM provider 설정을 저장하지 못했습니다."));
      }
      const next = data as ProviderStatus;
      setStatus(next);
      setProviderType(next.providerType ?? "openrouter");
      setBaseUrl(next.baseUrl ?? "https://openrouter.ai/api/v1");
      setModel(next.model ?? "");
      setJsonMode(next.jsonMode);
      setApiKey("");
      setReplaceApiKey(false);
      setMessage("저장되었습니다.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "LLM provider 설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setMessage(null);
    setTestResult(null);
    try {
      const res = await authenticatedFetch("/api/settings/llm-provider/test", {
        method: "POST",
        body: JSON.stringify({
          providerType,
          baseUrl,
          model,
          jsonMode,
          apiKey: hasStoredKey && !replaceApiKey ? "" : apiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "연결 테스트에 실패했습니다."));
      }
      const result = data as { status?: number; model?: string | null };
      setTestResult({
        ok: true,
        message: "연결되었습니다.",
        status: result.status,
        model: result.model ?? (model || null),
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "연결 테스트에 실패했습니다.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function deleteSettings() {
    setDeleting(true);
    setError(null);
    setMessage(null);
    setTestResult(null);
    try {
      const res = await authenticatedFetch(
        "/api/settings/llm-provider",
        { method: "DELETE" },
        { contentType: null },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "저장된 설정을 삭제하지 못했습니다."));
      }
      const next = data as ProviderStatus;
      setStatus(next);
      setProviderType(next.providerType ?? "openrouter");
      setBaseUrl(next.baseUrl ?? "https://openrouter.ai/api/v1");
      setModel(next.model ?? "");
      setJsonMode(next.jsonMode);
      setApiKey("");
      setReplaceApiKey(false);
      setMessage("저장된 설정이 삭제되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장된 설정을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="w-full max-w-4xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <Settings size={16} aria-hidden="true" />
            <span>LLM Provider</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Provider 설정
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <RefreshCcw size={15} aria-hidden="true" />
          새로고침
        </button>
      </div>

      <form onSubmit={saveSettings} className="mt-5 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Provider preset
              </label>
              <div className="mt-2 grid grid-cols-3 border border-zinc-200 bg-zinc-100 p-1 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.type}
                    type="button"
                    onClick={() => selectProvider(provider.type)}
                    className={`px-3 py-2 ${
                      providerType === provider.type ?
                        "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                    }`}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Base URL
                </span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={selectedProvider.defaultBaseUrl || "https://example.com/v1"}
                  className="mt-2 w-full border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Model
                </span>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={
                    providerType === "openrouter" ? "google/gemini-2.5-flash" : "gpt-4o-mini"
                  }
                  className="mt-2 w-full border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  JSON mode
                </span>
                <select
                  value={jsonMode}
                  onChange={(event) => setJsonMode(event.target.value as JsonMode)}
                  className="mt-2 w-full border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                >
                  <option value="auto">auto</option>
                  <option value="enabled">enabled</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>

              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  API Key
                </span>
                {hasStoredKey && !replaceApiKey ? (
                  <div className="mt-2 flex min-h-10 items-center justify-between gap-3 border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      기존 키 유지 · {status?.apiKeyHint}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplaceApiKey(true)}
                      className="text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                    >
                      새 키 입력
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="sk-..."
                      className="min-w-0 flex-1 border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                    {hasStoredKey ? (
                      <button
                        type="button"
                        onClick={() => {
                          setApiKey("");
                          setReplaceApiKey(false);
                        }}
                        className="border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        유지
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Active source
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {loading
                ? "확인 중"
                : status?.source === "database"
                  ? "DB 설정"
                  : status?.source === "none"
                    ? "미설정"
                    : "env fallback"}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Provider</dt>
                <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {providerLabel(providerType)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">API key</dt>
                <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {status?.hasApiKey ? status.apiKeyHint ?? "저장됨" : "없음"}
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        {message ? (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {testResult ? (
          <p
            className={`border px-3 py-2 text-sm ${
              testResult.ok ?
                "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            }`}
          >
            {testResult.message}
            {testResult.ok ?
              ` status ${testResult.status ?? "-"} · model ${testResult.model ?? "-"}`
            : ""}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void deleteSettings()}
            disabled={deleting || loading || status?.source !== "database"}
            className="inline-flex items-center justify-center gap-2 border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <Trash2 size={16} aria-hidden="true" />
            삭제
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={testing || saving || loading}
              className="inline-flex items-center justify-center gap-2 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            >
              <PlugZap size={16} aria-hidden="true" />
              {testing ? "테스트 중" : "연결 테스트"}
            </button>
            <button
              type="submit"
              disabled={saving || testing || loading}
              className="inline-flex items-center justify-center gap-2 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <Save size={16} aria-hidden="true" />
              {saving ? "저장 중" : "저장"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
