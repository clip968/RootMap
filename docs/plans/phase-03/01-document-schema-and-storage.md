# 01. 문서 스키마 및 저장소

## 목표

Phase 3에서 문서 업로드·텍스트 추출·청크·문서 개념·문서 기반 학습 트리 연결을 저장할 DB 스키마와 repository 기반을 만든다.

## 관련 명세

- `rootmap_phase_3_spec.md` 10장 데이터 모델
- 동일 명세 9장 출처 연결 정책
- 동일 명세 13장 API 명세의 문서 조회 응답 전제
- 동일 명세 21장 보안 및 개인정보 고려

## 구현 작업

### 1. `documents` 테이블

문서 메타데이터와 처리 상태를 저장한다.

필수 필드:

- `id`
- `user_id`
- `title`
- `original_filename`
- `file_type`
- `file_size_bytes`
- `page_count`
- `extracted_text_length`
- `processing_status`
- `processing_error`
- `metadata`
- `created_at`, `updated_at`

`processing_status` 값:

```text
uploaded
text_extracted
chunked
concepts_extracted
tree_generated
failed
```

### 2. `document_pages` 테이블

PDF 페이지별 추출 텍스트를 저장한다.

- `document_id` FK는 `documents(id)`를 참조하고 문서 삭제 시 함께 삭제한다.
- `(document_id, page_number)`는 UNIQUE로 둔다.
- TXT/MD는 1페이지 또는 가상 페이지로 저장할 수 있도록 정책을 문서화한다.

### 3. `document_chunks` 테이블

LLM 분석 단위가 되는 청크를 저장한다.

- `chunk_index`는 문서 내 순서를 보장한다.
- `page_start`, `page_end`, `section_title`, `text`, `token_count`, `metadata`를 저장한다.
- `(document_id, chunk_index)`는 UNIQUE로 둔다.

### 4. `document_concepts` 테이블

문서에서 추출·추론된 개념과 Concept Store 연결, evidence를 저장한다.

필수 정책:

- `concept_id`는 기존 Concept과 매칭되지 않은 상태를 고려해 nullable 가능하다.
- `concept_title`은 항상 저장한다.
- `concept_type`은 명세 enum을 따른다.
- `source_type`은 `explicit`, `inferred`, `generated`를 구분한다.
- `evidence`는 chunk/page/section/snippet 배열을 JSONB로 저장한다.

`concept_type` 값:

```text
document_topic
prerequisite
document_core
method
background
misconception
evaluation
```

### 5. `document_learning_trees` 테이블

문서와 생성된 학습 트리를 연결한다.

- `document_id` FK
- `tree_id` FK
- `(document_id, tree_id)` UNIQUE

### 6. 타입과 repository 함수

최소 repository 함수:

- 문서 생성
- 문서 메타데이터 조회
- 문서 상태 업데이트
- 문서 페이지 bulk insert
- 문서 청크 bulk insert
- 문서 개념 bulk upsert/insert
- 문서와 학습 트리 연결 생성
- 사용자별 문서 접근 권한 확인용 조회

## 완료 조건

- Phase 3 문서 관련 테이블이 마이그레이션으로 생성된다.
- 기존 Phase 1·2 테이블과 충돌하지 않는다.
- 문서 삭제 시 page/chunk/link 데이터가 일관되게 정리된다.
- `source_type`과 `concept_type`을 코드 타입 또는 enum으로 검증할 수 있다.
- 이후 02~07 태스크에서 사용할 repository 함수가 준비된다.
