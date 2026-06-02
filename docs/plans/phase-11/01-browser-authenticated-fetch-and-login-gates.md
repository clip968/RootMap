# 01. Browser Authenticated Fetch와 로그인 요구 UI

## 목표

브라우저에서 user-owned API를 호출할 때 공통 helper로 Supabase access token을 붙인다. 로그인하지 않은 사용자는 데이터 생성, 조회, 업로드, LLM 설정 화면에서 명확한 로그인 요구 상태를 본다.

## 현재 문제

`tree-page-client.tsx`에는 Phase 4용 localStorage token 처리 코드가 있지만 tree/document/provider route 호출은 별도 `fetch()`를 직접 사용한다. route auth를 먼저 적용하면 UI가 401을 반복해서 보여줄 수 있으므로 공통 fetch helper와 gate가 필요하다.

## 관련 파일

- `apps/web/src/lib/auth/browser-auth.ts`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/start-topic-form.tsx`
- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/components/llm-provider-settings-panel.tsx`

## 구현 작업

### 1. Browser auth helper 추가

`apps/web/src/lib/auth/browser-auth.ts`를 추가한다.

역할:

- 기존 storage key `rootmap_supabase_access_token`을 단일 source로 둔다.
- `readSupabaseAccessToken()`으로 token을 읽는다.
- `subscribeSupabaseAccessToken()`으로 storage/custom event 변경을 구독한다.
- `authHeaders(token, contentType?)`로 `Authorization` 헤더를 만든다.
- `authenticatedFetch(input, init)`로 token이 없으면 client-side error를 반환하거나 throw한다.

### 2. 기존 Phase 4 token helper 통합

`tree-page-client.tsx`에 직접 정의된 token storage 상수와 helper를 새 helper import로 교체한다.

교체 대상:

- `PHASE4_AUTH_TOKEN_STORAGE_KEY`
- `PHASE4_AUTH_TOKEN_EVENT`
- `readPhase4AuthToken`
- `subscribePhase4AuthToken`
- `phase4AuthHeaders`

### 3. AppShell history gate 적용

`app-shell.tsx`의 `/api/trees` fetch를 authenticated fetch로 바꾼다.

로그인하지 않은 상태:

- history loading을 멈춘다.
- history error 대신 “로그인 후 생성한 Tree를 볼 수 있습니다.” 수준의 상태를 보여준다.
- `/settings/llm-provider` 링크는 유지하되 settings 화면에서 별도 gate가 동작한다.

### 4. StartTopicForm gate 적용

`start-topic-form.tsx`에서 다음 액션을 token 없이는 실행하지 않는다.

- topic tree 생성
- document upload-url 생성
- complete-upload 호출

로그인하지 않은 상태:

- 생성 버튼과 업로드 버튼은 disabled 또는 즉시 error 상태를 보여준다.
- 문구는 사용자-facing 한국어로 자연스럽게 쓴다.
- storage signed URL에 직접 PUT 하는 요청에는 Authorization header를 붙이지 않는다.

### 5. LLM settings gate 적용

`llm-provider-settings-panel.tsx`에서 GET/PUT/DELETE/test 요청에 auth header를 붙인다.

로그인하지 않은 상태:

- provider 설정 form 대신 “로그인 후 계정의 LLM API key를 설정할 수 있습니다.” 상태를 보여준다.
- 저장된 env fallback처럼 보이는 UI를 보여주지 않는다.

## 완료 기준(DoD)

- user-owned browser fetch는 공통 helper를 통해 token을 붙인다.
- 로그인하지 않은 사용자는 tree 생성, tree 목록, document upload, LLM settings에서 로그인 요구 상태를 본다.
- signed storage upload request에는 app auth header를 붙이지 않는다.
- token helper는 기존 Phase 4 personalized API 호출에도 재사용된다.

## 검증 명령

```bash
cd apps/web
npm run check
```
