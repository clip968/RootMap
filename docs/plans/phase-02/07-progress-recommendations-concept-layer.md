# 07. 진행 상태·추천·상세와 Concept 연동

## 목표

노드 단위 진행과 Concept 단위 진행을 일관되게 저장하고, 추천과 노드 상세가 기존 Concept 설명을 재사용한다.

## 관련 명세

- 14장 추천 로직 변경
- 15장 `user_concept_progress`
- 16.2·13.3 상세·보강

## 구현 작업

### 1. `user_concept_progress` 동기화

- `PATCH` 노드 진행 시 같은 `concept_id`가 있으면 concept 진행도 갱신하거나, 별도 동기화 작업으로 합친다.
- 다른 트리에서 `known`이면 현재 트리 추론 상태에 반영(명세 14장 pseudo).

### 2. 추천 함수 확장

- Phase 1 추천 함수에 `conceptProgress` 맵 주입.
- prerequisite 미학습 우선, 이후 partial, core 준비 등 순서 유지.

### 3. 노드 상세 API

- concept에 `explanation`이 있으면 LLM 호출 없이 응답 가능한 경로 추가하거나, 캐시 우선 후 보강 호출.
- 보강 시 13.3 스키마 결과를 저장할지(별도 JSON 필드) 정책 결정.

### 4. Phase 1 API 확장 경계

- 이 태스크는 신규 Concept REST API(06)가 아니라, 기존 Phase 1 사용자 플로우 API에 Concept 정보를 얹는 작업이다.
- `PATCH` 노드 진행 API: node status 저장 후 `concept_id`가 있으면 `user_concept_progress`를 동기화한다.
- `GET /api/trees/:treeId` 복원: Phase 1 저장 조회에 `concept_id`, concept 기반 inferred status, 필요 시 `is_reused_concept`를 포함한다.
- 추천 API/함수: 기존 노드 상태와 concept 상태가 충돌할 때 우선순위(명시적 현재 트리 상태 > concept inferred 상태)를 고정한다.

## 주의

- 사용자 식별이 없는 MVP라면 progress 테이블의 `user_id` 스키마를 Phase 1과 동일하게 유지한다.
