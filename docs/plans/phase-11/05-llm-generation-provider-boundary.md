# 05. LLM Generation Provider Boundary

## 목표

production LLM 생성 경로가 호출 사용자의 provider config로만 실행되게 한다. 사용자 key가 없으면 env fallback으로 생성하지 않고 `LLM_PROVIDER_REQUIRED`를 반환한다.

## 현재 문제

`createChatCompletion()`은 providerConfig가 없으면 `resolveLlmProviderConfig()`를 호출하며, 이 함수는 저장된 전역 row 또는 `OPENROUTER_API_KEY` env fallback을 사용할 수 있다. production route에서 user id 없이 LLM 호출이 가능하면 계정별 비용/권한 경계가 깨진다.

## 관련 파일

- `apps/web/src/lib/api-errors.ts`
- `apps/web/src/lib/llm/chat.ts`
- `apps/web/src/lib/llm/provider-config.ts`
- `apps/web/src/lib/llm/generate-tree.ts`
- `apps/web/src/lib/llm/generate-node-detail.ts`
- `apps/web/src/lib/llm/generate-document-node-detail.ts`
- `apps/web/src/lib/llm/generate-document-*.ts`
- `apps/web/src/lib/services/learning-tree-generate.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/lib/document/processor.ts`
- `apps/web/src/lib/node-detail-jobs/processor.ts`

## 구현 작업

### 1. API error code 추가

`ApiErrorCode`에 `LLM_PROVIDER_REQUIRED`를 추가한다.

사용자-facing 메시지:

```text
먼저 계정의 LLM API key를 설정해 주세요.
```

### 2. Provider config resolution 분리

`resolveLlmProviderConfig(userId)`는 사용자별 DB row만 조회한다.

사용자 row가 없으면 typed error를 던진다.

env fallback은 다음과 같이 분리한다.

- `resolveEnvLlmProviderConfigForSmoke()` 또는 local-only helper
- smoke scripts와 local runner에서만 사용
- production route/service에서는 import 금지

### 3. createChatCompletion boundary 강화

production에서 `createChatCompletion(messages)`처럼 providerConfig 없이 호출하지 않도록 정리한다.

권장 shape:

- `createChatCompletion(messages, { providerConfig })`
- route/service는 먼저 `resolveLlmProviderConfig(auth.userId)`를 호출한다.
- 하위 generator는 `providerConfig`를 input 또는 options로 받는다.

### 4. Tree generation provider 전달

`generateAndPersistTree`는 `userId`를 받고, tree LLM generation에 해당 사용자의 providerConfig를 전달한다.

key 미등록:

- route에서 `LLM_PROVIDER_REQUIRED` 400 또는 409 계열 응답으로 변환한다.
- 다른 LLM transport error와 섞지 않는다.

### 5. Document and node detail provider 전달

다음 생성 경로도 user providerConfig를 받는다.

- document processing chunk concepts
- document consolidation
- document tree/structure/detail generation
- node detail generation
- visual detail generation
- report/quiz LLM이 production user route에서 호출되는 경우

## 완료 기준(DoD)

- production route/service에서 user id 없이 `createChatCompletion()`을 호출할 수 없다.
- 사용자 key가 없으면 env fallback이 아니라 `LLM_PROVIDER_REQUIRED`가 반환된다.
- smoke/local-only scripts는 명시 helper로 env fallback을 사용할 수 있다.
- A/B provider smoke에서 사용자 A key와 사용자 B key가 서로 섞이지 않는다.

## 검증 명령

```bash
cd apps/web
npm run llm:smoke-provider-settings
npm run phase6:user-id-audit
npm run check
```
