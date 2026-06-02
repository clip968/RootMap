# 04. User-Owned LLM Provider Settings

## 목표

`llm_provider_settings`를 전역 active 설정에서 사용자별 active 설정으로 바꾼다. 사용자 A와 B는 서로 다른 key를 저장할 수 있고, 삭제와 조회는 자기 row에만 영향을 줘야 한다.

## 현재 문제

현재 provider repository는 `is_active=true` row를 전역으로 조회한다. 한 사용자가 provider를 저장하거나 삭제하면 다른 사용자 생성 경로에도 영향을 줄 수 있다.

## 관련 파일

- `apps/web/src/db/schema.ts`
- `apps/web/drizzle/0008_llm_provider_settings_user_id.sql`
- `apps/web/src/lib/repository/llm-provider-settings-repository.ts`
- `apps/web/src/lib/llm/provider-config.ts`
- `apps/web/src/app/api/settings/llm-provider/route.ts`
- `apps/web/src/app/api/settings/llm-provider/test/route.ts`
- `apps/web/scripts/smoke-llm-provider-settings.ts`

## 구현 작업

### 1. Schema와 migration 추가

`llm_provider_settings`에 `user_id text not null`을 추가한다.

Migration 원칙:

- 기존 전역 rows는 운영 사용자에게 자동 귀속하지 않는다.
- migration에서 기존 rows를 active production row로 계속 쓰게 만들지 않는다.
- 신규 unique/index는 `(user_id, is_active)` 또는 active lookup에 필요한 형태로 추가한다.

### 2. Repository API 변경

repository 함수는 user id를 필수로 받는다.

- `getActiveLlmProviderSetting(userId)`
- `saveActiveLlmProviderSetting({ userId, ... })`
- `deleteActiveLlmProviderSetting(userId)`

active lookup/update/delete는 `eq(llmProviderSettings.userId, userId)`를 포함해야 한다.

### 3. Status response 변경

사용자 row가 없으면 다음 상태를 반환한다.

```json
{
  "source": "none",
  "providerType": null,
  "name": "No provider configured",
  "baseUrl": null,
  "model": null,
  "jsonMode": "auto",
  "isActive": false,
  "hasApiKey": false,
  "apiKeyHint": null
}
```

UI가 provider preset을 보여줘야 하는 경우에는 form default를 client에서 선택하되, backend status는 사용자별 미등록 상태를 정확히 표현한다.

### 4. Settings route auth 적용

`/api/settings/llm-provider`의 GET, PUT, DELETE는 모두 auth user id를 요구한다.

- GET: `getLlmProviderStatus(auth.userId)`
- PUT: `saveActiveLlmProviderSetting({ userId: auth.userId, ... })`
- DELETE: `deleteActiveLlmProviderSetting(auth.userId)`

### 5. Test route auth 적용

`/api/settings/llm-provider/test`는 auth user id를 요구한다.

- body에 apiKey가 있으면 그 key로 테스트한다.
- body에 apiKey가 없으면 현재 사용자의 저장된 key를 복호화한다.
- 다른 사용자의 저장 key나 env fallback을 사용하지 않는다.

## 완료 기준(DoD)

- 사용자별 provider settings가 서로 영향을 주지 않는다.
- 사용자 key 미등록 상태는 `source: "none"`과 `hasApiKey: false`로 표현된다.
- DELETE는 자기 row만 삭제한다.
- `npm run llm:smoke-provider-settings`가 A/B 사용자 시나리오를 포함한다.

## 검증 명령

```bash
cd apps/web
npm run llm:smoke-provider-settings
npm run phase6:user-id-audit
```
