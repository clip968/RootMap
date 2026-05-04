# 03. Phase 2 LLM 스키마 및 프롬프트

## 목표

학습 트리 생성 출력에 Concept 후보·간선 정보를 포함시키고, 파싱·검증·버전 플래그를 Phase 2에 맞게 확장한다.

## 관련 명세

- 12장 LLM 출력 스키마 변경
- 13.1 Concept-aware 학습 트리 생성 프롬프트
- 13.2 동일성 판정 — 선택 기능
- 13.3 주제 맥락 설명 보강 — 선택(노드 상세 단계와 연결)

## 구현 작업

### 1. 응답 스키마 확장

각 노드에 `concept_candidate` 객체:

- `canonical_title`, `aliases`, `domain`, `short_description`, `is_reusable`(boolean)

추가로 최상위 `edges` 배열:

- LLM 노드 `id`(temp key) 간 `from`, `to`, `relation_type`, `reason`

### 2. 프롬프트 교체 또는 분기

- Phase 2 전용 프롬프트(명세 블록)로 교체하거나 Feature flag로 점진 전환.
- “JSON만 반환” 규약 유지.

### 3. 파서·validator

- 기존 Phase 1 validator를 확장하거나 Phase 2용 별도 validator.
- 누락 필드 시 기본값 정책(예: `is_reusable` 기본 true) 명시.

### 4. 선택: 동일성 판정

- 검색 단계에서 애매할 때만 호출; 응답 `same_concept | related_but_different | different` 처리.

### 5. 선택: 설명 보강

- 기존 `explanation` + 현재 주제를 입력으로 topic-specific 블록 생성(추후 07·09 태스크에서 소비).

## 주의

- 노드 개수·타입 규칙은 Phase 1과 호환되는지 확인한다(`prerequisite/core/...`).
