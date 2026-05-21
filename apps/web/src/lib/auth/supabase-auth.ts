import type { ApiErrorCode } from "@/lib/api-errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthenticatedUserResult {
  ok: true;
  userId: string;
}

export interface AuthenticationFailureResult {
  ok: false;
  status: number;
  code: ApiErrorCode;
  message: string;
}

export type SupabaseAuthResult =
  | AuthenticatedUserResult
  | AuthenticationFailureResult;

function authFailure(
  status: number,
  code: ApiErrorCode,
  message: string,
): AuthenticationFailureResult {
  return { ok: false, status, code, message };
}

function extractBearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization")?.trim();
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function inferSupabaseUrlFromDatabaseUrl(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  try {
    const parsed = new URL(databaseUrl);
    const dbHostMatch = parsed.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    if (dbHostMatch?.[1]) return `https://${dbHostMatch[1]}.supabase.co`;

    const poolerUserMatch = parsed.username.match(/^postgres\.([a-z0-9-]+)$/i);
    if (poolerUserMatch?.[1]) return `https://${poolerUserMatch[1]}.supabase.co`;
  } catch {
    return null;
  }
  return null;
}

function getSupabaseUrl(): string | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    inferSupabaseUrlFromDatabaseUrl();
  return url ? url.replace(/\/+$/, "") : null;
}

function getSupabaseAuthApiKey(): string | null {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

async function parseSupabaseUserId(res: Response): Promise<string | null> {
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = (data as { id?: unknown; user?: { id?: unknown } }).id ??
    (data as { user?: { id?: unknown } }).user?.id;
  return isUuid(id) ? id : null;
}

/**
 * Phase 4 신규 API의 사용자 식별 지점.
 *
 * 서버가 받은 Supabase access token을 Supabase Auth `/auth/v1/user`로 검증해 실제 사용자 UUID만 반환한다.
 * 이 함수는 개발용 고정 사용자 id를 fallback으로 쓰지 않기 때문에, 인증이 없으면 세션·이벤트 데이터가
 * 생성되지 않는다.
 */
export async function requireSupabaseAuthUserId(
  req: Request,
): Promise<SupabaseAuthResult> {
  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    return authFailure(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }

  const supabaseUrl = getSupabaseUrl();
  const apiKey = getSupabaseAuthApiKey();
  if (!supabaseUrl || !apiKey) {
    return authFailure(
      500,
      "INVALID_OPERATION",
      "Supabase Auth 검증 환경변수가 설정되지 않았습니다.",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return authFailure(
      503,
      "INVALID_OPERATION",
      "Supabase Auth 사용자 확인에 실패했습니다.",
    );
  }

  if (res.status === 401 || res.status === 403) {
    return authFailure(401, "UNAUTHORIZED", "유효하지 않은 로그인 정보입니다.");
  }
  if (!res.ok) {
    return authFailure(
      502,
      "INVALID_OPERATION",
      "Supabase Auth 응답을 확인할 수 없습니다.",
    );
  }

  const userId = await parseSupabaseUserId(res);
  if (!userId) {
    return authFailure(
      502,
      "INVALID_OPERATION",
      "Supabase Auth 응답에 사용자 UUID가 없습니다.",
    );
  }

  return { ok: true, userId };
}
