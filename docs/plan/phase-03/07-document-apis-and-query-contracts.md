# 07. 문서 API 및 조회 계약

## 목표

문서 메타데이터, 문서에서 추출된 개념, 문서 기반 학습 트리, 개념 evidence를 조회하는 API 계약을 구현한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 13장 API 명세
- 동일 명세 9장 출처 연결 정책
- 동일 명세 14.2 문서 분석 결과 화면
- 동일 명세 21장 보안 및 개인정보 고려

## 구현 작업

### 1. 문서 정보 조회

`GET /api/documents/:documentId`

Response:

```json
{
  "document_id": "uuid",
  "title": "Attention Is All You Need",
  "original_filename": "attention.pdf",
  "file_type": "pdf",
  "page_count": 15,
  "processing_status": "tree_generated",
  "created_at": "2026-05-04T00:00:00Z"
}
```

추가 고려:

- `summary`, `main_topic`을 `metadata`나 별도 필드에서 제공할지 결정한다.
- 실패 상태일 경우 `processing_error`를 사용자 표시 가능 범위에서 포함할 수 있다.

### 2. 문서 개념 목록 조회

`GET /api/documents/:documentId/concepts`

Response:

```json
{
  "document_id": "uuid",
  "concepts": [
    {
      "concept_id": "uuid",
      "concept_title": "Multi-Head Attention",
      "concept_type": "document_core",
      "importance": 5,
      "difficulty": 4,
      "source_type": "explicit",
      "evidence_count": 2
    }
  ]
}
```

정렬 기본값:

1. `concept_type` 우선순위
2. `importance` 내림차순
3. `difficulty` 오름차순
4. title

### 3. 문서 기반 트리 조회

`GET /api/documents/:documentId/tree`

Response:

```json
{
  "document_id": "uuid",
  "tree_id": "uuid",
  "topic": "Attention Is All You Need 이해하기",
  "nodes": []
}
```

요구사항:

- 기존 Phase 1 트리 조회 응답과 호환 가능한 형태를 우선한다.
- 문서 기반 node에는 `source_type`, `evidence`, `concept_id`를 포함할 수 있게 확장한다.
- 트리 미생성 상태면 적절한 404 또는 상태 응답을 정한다.

### 4. 문서 개념 evidence 조회

`GET /api/document-concepts/:documentConceptId/evidence`

Response:

```json
{
  "document_concept_id": "uuid",
  "concept_title": "Scaled Dot-Product Attention",
  "evidence": [
    {
      "page_start": 4,
      "page_end": 5,
      "section_title": "Scaled Dot-Product Attention",
      "snippet": "We call our particular attention 'Scaled Dot-Product Attention'..."
    }
  ]
}
```

### 5. 사용자 권한 검증

모든 문서 관련 조회 API는 다음을 확인한다.

- 현재 사용자가 해당 `document_id`의 소유자인가?
- `documentConceptId`가 가리키는 문서도 현재 사용자 소유인가?
- `tree_id`가 문서와 연결된 트리인가?

### 6. DTO와 에러 계약

공통 오류:

- 문서 없음
- 접근 권한 없음
- 아직 처리 중
- 트리 미생성
- evidence 없음

UI에서 상태별로 분기하기 쉽게 `code`와 `message`를 포함한다.

## 완료 조건

- 문서 메타데이터를 조회할 수 있다.
- 문서 개념 목록을 source type과 evidence count 포함해 조회할 수 있다.
- 문서 기반 학습 트리를 조회할 수 있다.
- 특정 문서 개념의 evidence를 조회할 수 있다.
- 다른 사용자의 문서·개념·트리에는 접근할 수 없다.
