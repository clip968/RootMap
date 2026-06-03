"use client";

import { getBrowserSupabaseClient } from "./supabase-browser-client";

export const SUPABASE_ACCESS_TOKEN_STORAGE_KEY = "rootmap_supabase_access_token";
export const SUPABASE_ACCESS_TOKEN_EVENT = "rootmap-phase4-auth-token-changed";
export const LOGIN_REQUIRED_MESSAGE = "로그인 후 다시 시도해 주세요.";

export interface SupabaseSessionTokenSource {
  access_token?: string | null;
}

export class MissingAuthTokenError extends Error {
  code = "AUTH_TOKEN_REQUIRED" as const;

  constructor(message = LOGIN_REQUIRED_MESSAGE) {
    super(message);
    this.name = "MissingAuthTokenError";
  }
}

export function readSupabaseAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SUPABASE_ACCESS_TOKEN_STORAGE_KEY)?.trim() || null;
}

function dispatchSupabaseAccessTokenChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPABASE_ACCESS_TOKEN_EVENT));
}

function writeSupabaseAccessTokenBridge(token: string | null): string | null {
  if (typeof window === "undefined") return null;

  const previous = readSupabaseAccessToken();
  const next = token?.trim() || null;
  if (next) {
    window.localStorage.setItem(SUPABASE_ACCESS_TOKEN_STORAGE_KEY, next);
  } else {
    window.localStorage.removeItem(SUPABASE_ACCESS_TOKEN_STORAGE_KEY);
  }

  // React `useSyncExternalStore` 구독자는 같은 탭의 localStorage 변경을 storage 이벤트로 받지 못한다.
  if (previous !== next) dispatchSupabaseAccessTokenChanged();
  return next;
}

export function syncSupabaseSessionToAccessTokenBridge(
  session: SupabaseSessionTokenSource | null,
): string | null {
  return writeSupabaseAccessTokenBridge(session?.access_token ?? null);
}

export function clearSupabaseAccessTokenBridge(): void {
  writeSupabaseAccessTokenBridge(null);
}

export function subscribeSupabaseAccessToken(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(SUPABASE_ACCESS_TOKEN_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SUPABASE_ACCESS_TOKEN_EVENT, callback);
  };
}

export function authHeaders(
  token: string,
  contentType: string | null = "application/json",
): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

export function mergeAuthHeaders(
  token: string,
  headers?: HeadersInit,
  contentType: string | null = "application/json",
): Headers {
  const merged = new Headers(headers);
  merged.set("Authorization", `Bearer ${token}`);
  if (contentType && !merged.has("Content-Type")) {
    merged.set("Content-Type", contentType);
  }
  return merged;
}

export function isMissingAuthTokenError(error: unknown): error is MissingAuthTokenError {
  return error instanceof MissingAuthTokenError;
}

/**
 * 폴링처럼 긴 요청 흐름 도중 access token이 만료되면 서버가 401을 돌려준다.
 * Supabase 세션을 한 번 갱신해 bridge를 새 토큰으로 채우고, 갱신된 토큰만 반환한다.
 * 진짜 로그아웃·권한 없음이면 null을 반환해 호출부가 원래 401 응답을 그대로 쓰게 한다.
 */
async function refreshSupabaseAccessToken(
  staleToken: string,
): Promise<string | null> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;
  try {
    // getSession은 만료된 세션이면 refresh token으로 자동 갱신한다.
    const { data } = await supabase.auth.getSession();
    let session: SupabaseSessionTokenSource | null = data.session ?? null;
    // 서버가 방금 거부한 토큰이 그대로면(시계 오차 등) 명시적으로 갱신을 강제한다.
    if (session?.access_token === staleToken) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session ?? null;
    }
    if (!session?.access_token) return null;
    const next = syncSupabaseSessionToAccessTokenBridge(session);
    return next && next !== staleToken ? next : null;
  } catch {
    return null;
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { contentType?: string | null } = {},
): Promise<Response> {
  const token = readSupabaseAccessToken();
  if (!token) throw new MissingAuthTokenError();
  const contentType =
    "contentType" in options ? options.contentType : "application/json";

  // App API requests need the bearer token. Storage signed URL uploads are not
  // routed through this helper, so Supabase object upload auth never leaks here.
  const res = await fetch(input, {
    ...init,
    headers: mergeAuthHeaders(token, init.headers, contentType),
  });
  if (res.status !== 401) return res;

  // 401은 진짜 권한 없음일 수도, access token이 방금 만료된 레이스일 수도 있다.
  // 세션 갱신으로 새 토큰을 얻은 경우에만 한 번 재시도한다. 모든 호출부의 body가
  // 문자열이고 서버 인증 검사가 라우트 첫 단계라 재전송이 안전하다.
  const refreshedToken = await refreshSupabaseAccessToken(token);
  if (!refreshedToken || init.signal?.aborted) return res;
  return fetch(input, {
    ...init,
    headers: mergeAuthHeaders(refreshedToken, init.headers, contentType),
  });
}
