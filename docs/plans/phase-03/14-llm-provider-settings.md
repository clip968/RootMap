# LLM Provider Settings

## Goal

OpenRouter 전용 환경 변수 설정을 일반 OpenAI-compatible Provider 설정으로 확장한다. 사용자는 앱 설정 탭에서 `Base URL`, `API Key`, `Model`, `JSON mode`를 입력하고 저장할 수 있어야 하며, API key는 브라우저가 아니라 서버 DB에 암호화 저장한다.

## Scope

### In

- OpenRouter, CrofAI, custom OpenAI-compatible provider 설정
- 설정 탭 UI
- 서버 API를 통한 설정 저장/조회/삭제
- API key AES-GCM 암호화 저장
- 연결 테스트 API
- 기존 `OPENROUTER_*` 환경 변수 fallback 유지
- LLM 호출부의 provider 설정 우선순위 정리

### Out

- 멀티유저 계정별 provider 분리
- 원격 secret manager 연동
- provider별 사용량/과금 대시보드
- 모델 자동 추천 또는 모델 성능 벤치마크

## Product Behavior

1. 설정 탭에서 provider type을 선택한다.
   - `openrouter`
   - `openai-compatible`
   - `crofai`
2. `openai-compatible`과 `crofai`는 사용자가 직접 `Base URL`과 `API Key`를 입력한다.
3. 서버는 `Base URL`을 정규화한 뒤 `{baseUrl}/chat/completions`로 요청한다.
4. API key 원문은 저장 후 다시 클라이언트에 내려주지 않는다.
5. 설정 조회 응답에는 masked key만 포함한다.
6. 저장된 활성 provider가 있으면 모든 LLM 호출은 해당 설정을 우선 사용한다.
7. 저장된 provider가 없으면 기존 `.env.local`의 `OPENROUTER_*` 설정을 사용한다.

## Proposed Fields

`llm_provider_settings`

- `id`
- `providerType`: `openrouter | openai_compatible | crofai`
- `name`
- `baseUrl`
- `model`
- `jsonMode`: `auto | enabled | disabled`
- `apiKeyEncrypted`
- `apiKeyIv`
- `apiKeyTag`
- `apiKeyHint`
- `isActive`
- `createdAt`
- `updatedAt`

## Security Model

- 암호화는 Node `crypto`의 `aes-256-gcm`을 사용한다.
- 마스터키는 `LLM_SETTINGS_SECRET` 환경 변수에서 읽는다.
- `LLM_SETTINGS_SECRET`은 DB에 저장하지 않는다.
- API key 원문은 저장 요청과 연결 테스트 요청의 서버 처리 중에만 존재한다.
- 클라이언트 응답에는 `apiKeyHint`만 포함한다.
- secret이 없으면 provider 저장 API는 실패해야 한다.

## API Plan

### `GET /api/settings/llm-provider`

활성 provider 설정을 조회한다.

- API key 원문 제외
- `hasApiKey`, `apiKeyHint`, `source` 포함
- DB 설정이 없고 env fallback만 있으면 fallback 상태를 알려준다.

### `PUT /api/settings/llm-provider`

provider 설정을 저장한다.

- `providerType`
- `baseUrl`
- `model`
- `apiKey`
- `jsonMode`
- `isActive`

API key가 비어 있으면 기존 암호화 값을 유지할 수 있게 한다.

### `DELETE /api/settings/llm-provider`

저장된 DB provider 설정을 삭제하고 env fallback으로 되돌린다.

### `POST /api/settings/llm-provider/test`

입력값 또는 저장된 설정으로 짧은 Chat Completions 요청을 보내 연결을 검증한다.

- timeout 적용
- 응답 status와 model 정보를 반환
- API key 원문은 로그에 남기지 않는다.

## LLM Client Plan

1. `apps/web/src/lib/llm/chat.ts`의 OpenRouter 중심 이름과 env 접근을 일반화한다.
2. `resolveLlmProviderConfig()`를 추가한다.
   - 1순위: DB의 active provider
   - 2순위: 기존 `OPENROUTER_*` env fallback
3. `createChatCompletion()`은 resolved config를 받아 `POST {baseUrl}/chat/completions`를 호출한다.
4. OpenRouter 전용 헤더는 provider type이 `openrouter`일 때만 붙인다.
5. `response_format: { type: "json_object" }`는 `jsonMode`에 따라 제어한다.
   - `enabled`: 항상 전송
   - `disabled`: 전송하지 않음
   - `auto`: provider별 기본값 사용

## UI Plan

설정 탭은 홈 화면 또는 앱 shell 상단에 둔다.

필드:

- Provider preset
- Base URL
- API Key
- Model
- JSON mode
- 저장 버튼
- 연결 테스트 버튼
- env fallback 상태 표시

UI 원칙:

- API key 저장 후에는 masked value만 표시한다.
- “새 키 입력” 상태와 “기존 키 유지” 상태를 명확히 분리한다.
- 연결 테스트 결과는 성공/실패와 짧은 원인을 보여준다.
- CrofAI preset은 `https://crof.ai/v1`을 기본 base URL로 채운다.

## Validation

- Base URL의 trailing slash를 제거한다.
- 사용자가 `/chat/completions`까지 입력한 경우 중복 경로를 만들지 않게 정규화한다.
- `http://localhost:*`는 개발용 custom endpoint로 허용한다.
- production에서는 `https://`를 기본 권장한다.
- model은 비워둘 수 있지만, OpenAI-compatible provider에서는 입력을 권장한다.

## Tests

- 암호화/복호화 round-trip smoke
- 저장 API가 API key 원문을 응답하지 않는지 검증
- DB active provider가 env fallback보다 우선되는지 검증
- DB 설정이 없으면 기존 `OPENROUTER_*` fallback이 유지되는지 검증
- OpenRouter provider에서만 OpenRouter 전용 헤더가 붙는지 검증
- OpenAI-compatible/CrofAI에서 `Authorization: Bearer`와 `Content-Type`만 기본 전송되는지 검증
- `jsonMode=disabled`일 때 `response_format`이 제외되는지 검증
- `npm run lint`
- `npm run build`

## Risks

- API key 암호화 마스터키를 잃으면 기존 저장 key는 복구할 수 없다.
- Provider별로 `response_format` 지원 여부가 다르므로 `jsonMode=auto` 기본값을 보수적으로 잡아야 한다.
- 현재 앱에 사용자 계정이 없으므로 이 설정은 로컬 단일 사용자 설정으로 취급한다.
- 연결 테스트가 성공해도 긴 문서 생성 요청은 provider timeout/rate limit에 걸릴 수 있다.

## Rollout

1. DB schema와 repository를 추가한다.
2. 암호화 유틸과 설정 API를 추가한다.
3. LLM client를 provider config 기반으로 일반화한다.
4. 설정 탭 UI를 추가한다.
5. smoke와 lint/build 검증을 통과시킨다.
6. README에 `LLM_SETTINGS_SECRET`과 OpenAI-compatible 설정 방법을 추가한다.
