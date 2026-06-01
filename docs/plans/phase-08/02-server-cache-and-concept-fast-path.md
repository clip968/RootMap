# 02. 서버 Cache와 Concept Fast Path

## 목표

서버 detail 생성 흐름에서 이미 쓸 수 있는 설명이 있으면 LLM 호출 전에 빠르게 응답한다.

## 관련 파일

- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/lib/repository/learning-repository.ts`
- `apps/web/scripts/smoke-node-detail-generation.ts`

## 구현 작업

### 1. fast path 기준 정의

- `nodeRow.detailJson`이 있으면 기존처럼 가장 먼저 cache hit로 반환한다.
- `nodeRow.conceptId`가 있고 연결된 Concept에 충분한 `explanation`이 있으면 LLM을 호출하지 않는다.
- `shortDescription`만 있는 Concept은 너무 짧을 수 있으므로 기본 fast path로 쓰지 않는다.
- 기준 예시:
  - `concept.explanation.trim().length >= 80`
  - 또는 기존 fixture와 실제 데이터에 맞춰 명확한 helper 함수로 분리

### 2. Concept 응답 형태 고정

- `responseFromStoredConcept`를 fast path에서도 사용한다.
- 반환값은 기존 API 계약과 같아야 한다.
  - `from_concept_store: true`
  - `check_questions: []`
  - `visual_decision`은 기본 none fallback
  - `visual_blocks: []`
  - `next_nodes`는 node children 기반

### 3. LLM fallback 순서 정리

- LLM 생성이 필요한 경우에만 `generateDocumentNodeDetail` 또는 `generateNodeDetail`을 호출한다.
- LLM 실패 시 기존 `responseFromStoredConceptFallback`은 유지한다.
- fallback은 fast path 기준보다 느슨하게 둘 수 있다. 실패 상황에서는 짧은 설명이라도 오류 화면보다 낫기 때문이다.

### 4. smoke script 갱신

- 기존 `smoke-node-detail-generation.ts`는 짧은 Concept 설명만 있으면 full detail generator가 실행되어야 함을 검증한다.
- 새 테스트를 추가한다.
  - 충분한 `concept.explanation`을 가진 fixture를 만든다.
  - `generateGenericNodeDetail` stub이 호출되면 실패하게 한다.
  - 결과가 `from_concept_store === true`인지 확인한다.
- 기존 짧은 설명 fixture는 유지해 `shortDescription`만으로는 fast path를 타지 않음을 검증한다.

## 완료 기준(DoD)

- 충분한 Concept 설명이 있으면 detail API가 LLM 없이 응답한다.
- 짧은 Concept 설명만 있는 경우에는 기존처럼 full detail generation을 시도한다.
- LLM 실패 fallback은 유지된다.
- 검증 명령: `npm run node-detail:generation-smoke` (`apps/web`에서 실행)
