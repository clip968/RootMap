# 04. 문서 LLM 스키마 및 프롬프트

## 목표

문서 기반 개념 추출과 학습 트리 생성을 위한 LLM 출력 스키마·프롬프트·파서·검증 로직을 정의한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 7장 문서 기반 개념 추출
- 동일 명세 11장 LLM 출력 스키마
- 동일 명세 12장 프롬프트 설계
- 동일 명세 16.4 LLM JSON 파싱 실패
- 동일 명세 17장 품질 기준

## 구현 작업

### 1. 청크별 개념 추출 스키마

입력:

- 문서 제목
- 청크 메타데이터
- 청크 텍스트

출력 최상위 필드:

- `document_id`
- `chunk_id`
- `section_title`
- `concept_candidates`

각 후보 필드:

- `canonical_title`
- `aliases`
- `type`
- `short_description`
- `importance`
- `difficulty`
- `source_type`
- `evidence_snippet`

주의:

- 청크별 추출에서는 chunk에 명시적으로 등장한 개념만 뽑는다.
- `source_type`은 기본적으로 `explicit`이어야 한다.
- evidence snippet은 짧게 유지한다.

### 2. 문서 전체 개념 통합 스키마

역할:

- 중복 후보 병합
- 문서의 중심 주제 식별
- 문서 핵심 개념과 선수지식 분리
- 필요한 선수지식만 제한적으로 추론

출력 필드:

- `document_title`
- `main_topic`
- `summary`
- `concepts`

중요 정책:

- 문서에 직접 등장한 개념은 `source_type = explicit`
- 문서 이해를 위해 추론한 선수지식은 `source_type = inferred`
- inferred concept에는 문서 직접 출처가 없는 경우 evidence를 비워 둔다.

### 3. 문서 기반 학습 트리 스키마

출력 필드:

- `topic`
- `document_id`
- `summary`
- `nodes`
- `edges`
- `recommended_order`

노드 필수 필드:

- `id`
- `title`
- `type`
- `description`
- `difficulty`
- `prerequisites`
- `children`
- `source_type`
- `evidence`
- `concept_candidate`

가드레일:

- 노드 수는 10~25개
- inferred prerequisite을 document_core보다 먼저 배치
- explicit document concept과 inferred prerequisite을 명확히 구분
- 출처 evidence는 문서에 등장한 개념에만 사용

### 4. 문서 기반 노드 설명 스키마

문서 기반 노드 상세 화면을 위한 응답을 정의한다.

필드:

- `node_id`
- `title`
- `source_type`
- `why_it_matters_for_document`
- `document_context_summary`
- `easy_explanation`
- `example`
- `common_misconceptions`
- `check_questions`
- `next_nodes`

### 5. 파서와 validator

- 각 LLM 응답별 JSON schema 또는 런타임 validator를 만든다.
- `importance`, `difficulty`는 1~5 범위로 제한한다.
- `concept_type`과 `source_type` enum을 검증한다.
- evidence의 page range와 chunk id 형태를 검증한다.
- JSON만 반환하는 프롬프트 규약을 유지한다.

### 6. JSON 파싱 실패 처리

처리 순서:

1. LLM 응답 재요청
2. JSON repair 시도
3. 그래도 실패하면 사용자에게 실패 안내
4. 실패 로그 저장

## 완료 조건

- 청크별 개념 추출, 문서 통합, 문서 트리, 노드 설명 응답 스키마가 코드로 검증된다.
- explicit/inferred/generated source type이 프롬프트와 validator 양쪽에서 유지된다.
- inferred prerequisite이 evidence를 가진 explicit concept처럼 표시되지 않는다.
- LLM JSON 파싱 실패에 대한 재시도·repair·실패 처리 경로가 정의된다.
