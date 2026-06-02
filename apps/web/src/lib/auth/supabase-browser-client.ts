"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_AUTH_SESSION_STORAGE_KEY =
  "rootmap_supabase_auth_session";

interface SupabaseBrowserConfig {
  url: string;
  anonKey: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedClientKey: string | null = null;

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
  };
}

export function getBrowserSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseBrowserConfig();
  if (!config) return null;

  const clientKey = `${config.url}:${config.anonKey}`;
  if (cachedClient && cachedClientKey === clientKey) return cachedClient;

  // Supabase는 refresh token과 만료 시간을 이 storage key 아래에서 관리하고,
  // RootMap은 access token만 별도 bridge key로 복사해 기존 API fetch와 연결한다.
  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storageKey: SUPABASE_AUTH_SESSION_STORAGE_KEY,
    },
  });
  cachedClientKey = clientKey;
  return cachedClient;
}
