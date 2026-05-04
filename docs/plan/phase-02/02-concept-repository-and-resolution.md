# 02. Concept 저장소 및 해석(resolution)

## 목표

기존 Concept를 찾거나 새 Concept를 만들고, LLM 노드 키·제목 정보와 매핑할 수 있는 저장소 레이어를 만든다.

## 관련 명세

- 9.3 기존 Concept 검색 — Phase 2 최소 구현은 1~3번 우선
- 9.4 Concept 생성
- 10장 중복 처리 정책

## 구현 작업

### 1. 정규화 함수

- `title` → `normalized_title` 규칙(소문자, 공백·특수문자 처리 등) 단일 함수로 고정해 검색 일관성 유지.

### 2. slug 생성

- 충돌 시 접미 처리; 사람이 읽을 수 있는 짧은 slug vs UUID 기반 내부 slug 중 프로젝트 규약 선택 후 문서화.

### 3. 검색 API(내부)

우선 순위 예시:

1. `normalized_title` 정확 일치(+선택적으로 `domain`)
2. `aliases` 에 JSON 배열 포함 여부
3. 같은 domain에서 제목 유사(간단한 contains 또는 편집 거리 등 — 과도하게 병합하지 않도록 보수적으로)

### 4. 신규 Concept 생성 입력

명세 예시 필드 준수: `title`, aliases, domain, short_description, difficulty(있을 때).

### 5. alias 갱신

시나리오 2처럼 기존 concept에 새 별칭만 추가할 수 있어야 한다.

### 6. 선택 후보 적재

자동 연결이 불확실하면 `concept_merge_candidates` 레코드를 만든다(점수·reason 문자열 포함).

## 주의

- Attention / Self-Attention 등 “비슷하지만 다른 개념”은 별도 concept로 두고 edge로 연결(명세 10.2).
