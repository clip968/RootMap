"use client";

export const SUPABASE_ACCESS_TOKEN_STORAGE_KEY = "rootmap_supabase_access_token";
export const SUPABASE_ACCESS_TOKEN_EVENT = "rootmap-phase4-auth-token-changed";
export const LOGIN_REQUIRED_MESSAGE = "로그인 후 다시 시도해 주세요.";

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

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { contentType?: string | null } = {},
): Promise<Response> {
  const token = readSupabaseAccessToken();
  if (!token) throw new MissingAuthTokenError();

  // App API requests need the bearer token. Storage signed URL uploads are not
  // routed through this helper, so Supabase object upload auth never leaks here.
  return fetch(input, {
    ...init,
    headers: mergeAuthHeaders(token, init.headers, options.contentType ?? "application/json"),
  });
}
