# 06. 문서 개념 해석 및 영속화

## 목표

문서에서 추출·통합된 개념을 Phase 2 Concept Store와 연결하고, 새 개념은 Concept으로 저장하며, 문서와 개념 사이의 출처 관계를 `document_concepts`에 보존한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 8장 Concept Store와의 연결
- 동일 명세 9장 출처 연결 정책
- 동일 명세 10.4 `document_concepts`
- 동일 명세 17장 품질 기준

## 구현 작업

### 1. 문서 개념 후보 입력 정규화

문서 전체 개념 통합 LLM 결과를 받아 다음 필드를 정규화한다.

- `canonical_title`
- `aliases`
- `type`
- `importance`
- `difficulty`
- `source_type`
- `evidence`

정책:

- title은 Phase 2의 `normalized_title` 규칙과 맞춘다.
- 빈 alias는 빈 배열로 저장한다.
- `importance`, `difficulty`는 1~5 범위로 clamp 또는 validation error 처리한다.

### 2. 기존 Concept Store 매칭

매칭 순서:

```text
문서 개념 후보
    ↓
normalized_title 검색
    ↓
alias 검색
    ↓
domain 기반 유사 검색
    ↓
기존 Concept 재사용 또는 새 Concept 생성
    ↓
document_concepts에 출처 연결 저장
```

재사용 기준:

- `normalized_title`이 같다.
- alias가 일치한다.
- 같은 domain에서 의미가 동일하다.
- 선택 LLM 동일성 판정 결과 `same_concept`이고 confidence가 충분하다.

### 3. 새 Concept 생성

다음 경우 새 Concept을 생성한다.

- 기존 Concept과 title/alias가 일치하지 않는다.
- 같은 이름이 있어도 domain이나 의미가 다르다.
- 문서에서 중요한 개념인데 Store에 없다.
- 기존 Concept과 관련은 있지만 동일 개념은 아니다.

생성 시 고려:

- `concept_candidate.short_description`을 활용한다.
- Phase 2 Concept slug/normalized title 규칙을 따른다.
- 문서 기반 concept이라도 이후 재사용 가능한 Concept으로 저장한다.

### 4. `document_concepts` 저장

저장 필드:

- `document_id`
- `concept_id`
- `concept_title`
- `concept_type`
- `importance`
- `difficulty`
- `source_type`
- `evidence`

출처 evidence 최소 필드:

- `document_id`
- `chunk_id`
- `page_start`
- `page_end`
- `section_title`
- `snippet`

### 5. source type 보존

`source_type` 의미:

| source_type | 의미 |
|---|---|
| explicit | 문서에 직접 등장 |
| inferred | 문서 이해를 위해 필요하다고 추론 |
| generated | AI가 설명이나 예시로 생성 |

중요 정책:

- `inferred` concept은 문서에 직접 등장한 것처럼 evidence를 꾸며 넣지 않는다.
- `explicit` concept은 가능하면 하나 이상의 evidence를 가져야 한다.
- UI가 source type을 그대로 표시할 수 있도록 값이 손실되지 않아야 한다.

### 6. 관계 edge 반영

문서 기반 학습 트리 생성 결과의 edge를 Concept edge로 연결할 수 있는 경우 Phase 2 `concept_edges`를 재사용한다.

- prerequisite 관계는 명확할 때만 저장한다.
- 문서에 한정된 임시 관계인지 전역 Concept 관계인지 구분이 필요하면 metadata에 근거를 남긴다.
- 불확실한 관계는 무리하게 전역 Concept edge로 승격하지 않는다.

## 완료 조건

- 문서 개념이 기존 Concept과 재사용 또는 신규 생성으로 해석된다.
- `document_concepts`에 concept type, source type, importance, difficulty, evidence가 저장된다.
- explicit concept과 inferred prerequisite이 저장 단계에서 섞이지 않는다.
- Softmax/소프트맥스 같은 alias 기반 재사용 케이스가 동작한다.
- Page와 Page Fault처럼 관련 있지만 다른 개념을 잘못 병합하지 않는다.
