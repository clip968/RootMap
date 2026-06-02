"use client";

import {
  syncSupabaseSessionToAccessTokenBridge,
} from "@/lib/auth/browser-auth";
import {
  getBrowserSupabaseClient,
  getSupabaseBrowserConfig,
} from "@/lib/auth/supabase-browser-client";
import { LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type AuthMode = "login" | "signup";

function safeNextPath(): string {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function authErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(
    () => Boolean(getSupabaseBrowserConfig()),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => getBrowserSupabaseClient(), []);
  const missingEnv = !supabase;

  /** 이미 저장된 Supabase session이 있으면 bridge를 복원하고 요청한 목적지로 이동한다. */
  useEffect(() => {
    if (!supabase) {
      return;
    }

    let cancelled = false;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          syncSupabaseSessionToAccessTokenBridge(data.session);
          router.replace(safeNextPath());
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!supabase) {
      setError("Supabase 공개 Auth 환경변수가 설정되지 않았습니다.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("이메일과 6자 이상의 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
        if (signInError) throw signInError;
        syncSupabaseSessionToAccessTokenBridge(data.session);
        router.replace(safeNextPath());
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        syncSupabaseSessionToAccessTokenBridge(data.session);
        router.replace(safeNextPath());
        return;
      }
      setMessage("메일 확인 필요: 가입을 완료하려면 받은 편지함의 확인 링크를 눌러 주세요.");
    } catch (err) {
      setError(
        authErrorMessage(
          err,
          mode === "login" ? "로그인에 실패했습니다." : "회원가입에 실패했습니다.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              RootMap 로그인
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              계정별 Tree와 LLM 설정을 불러옵니다.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            닫기
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 border border-zinc-200 bg-zinc-100 p-1 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setMessage(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 ${
              mode === "login" ?
                "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
              : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            <LogIn size={15} aria-hidden="true" />
            로그인
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setMessage(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 ${
              mode === "signup" ?
                "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
              : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            <UserPlus size={15} aria-hidden="true" />
            회원가입
          </button>
        </div>

        {missingEnv ?
          <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정해야 로그인할 수 있습니다.
          </p>
        : null}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="rootmap-auth-email"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              이메일
            </label>
            <input
              id="rootmap-auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={loading || checkingSession || missingEnv}
              className="mt-2 w-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:disabled:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="rootmap-auth-password"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              비밀번호
            </label>
            <input
              id="rootmap-auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              disabled={loading || checkingSession || missingEnv}
              className="mt-2 w-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:disabled:bg-zinc-900"
            />
          </div>

          {error ?
            <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          : null}
          {message ?
            <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              {message}
            </p>
          : null}

          <button
            type="submit"
            disabled={loading || checkingSession || missingEnv}
            className="inline-flex w-full items-center justify-center gap-2 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            {mode === "login" ?
              <LogIn size={16} aria-hidden="true" />
            : <UserPlus size={16} aria-hidden="true" />}
            {checkingSession ? "세션 확인 중" : loading ? "처리 중" : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
      </section>
    </main>
  );
}
