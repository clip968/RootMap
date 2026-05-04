# 03. 텍스트 추출 및 청크 분할

## 목표

업로드된 문서에서 텍스트를 추출하고, LLM이 안정적으로 분석할 수 있는 청크 단위로 분할해 `document_pages`와 `document_chunks`에 저장한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 6.3 텍스트 추출
- 동일 명세 6.4 청크 분할
- 동일 명세 16.1 텍스트 추출 실패
- 동일 명세 16.2 문서가 너무 긴 경우
- 동일 명세 18장 최소 품질 기준

## 구현 작업

### 1. PDF 텍스트 추출

Phase 3에서는 OCR 없는 PDF 내장 텍스트 추출을 우선한다.

우선순위:

```text
1. PDF 내장 텍스트 추출
2. 페이지별 텍스트 추출
3. 실패 시 사용자에게 텍스트 추출 불가 안내
```

요구사항:

- 페이지 번호와 함께 텍스트를 저장한다.
- 페이지 수를 `documents.page_count`에 저장한다.
- 추출 텍스트 길이를 `documents.extracted_text_length`에 저장한다.

### 2. TXT/MD 텍스트 로딩

- UTF-8 텍스트 파일을 기본으로 처리한다.
- TXT/MD는 1페이지 또는 논리적 페이지로 `document_pages`에 저장한다.
- 마크다운 헤딩은 청크의 `section_title` 후보로 활용한다.

### 3. 문서 길이 제한

Phase 3 제한:

```text
최대 페이지 수: 80페이지
최대 추출 텍스트 길이: 120,000자
```

초과 시 처리:

```text
문서가 너무 깁니다.
Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다.
중요한 챕터나 섹션만 분리해서 업로드해 주세요.
```

### 4. 청크 분할 기준

가능한 순서대로 적용한다.

```text
1. 섹션 제목 기준 분할
2. 페이지 기준 분할
3. 문단 기준 분할
4. 최대 토큰 수 기준 분할
```

권장 크기:

```text
청크 크기: 800~1,500 tokens
overlap: 100~200 tokens
```

### 5. 청크 메타데이터

각 청크는 다음 정보를 가져야 한다.

- `chunk_index`
- `document_id`
- `page_start`
- `page_end`
- `section_title`
- `text`
- `token_count`
- `metadata`

### 6. 상태 전이

- 텍스트 추출 성공 후 `documents.processing_status = text_extracted`
- 청크 저장 성공 후 `documents.processing_status = chunked`
- 실패 시 `failed`와 `processing_error` 저장

### 7. 텍스트 추출 실패 처리

스캔본 PDF 등으로 텍스트가 없거나 매우 적으면 다음 메시지를 사용할 수 있게 한다.

```text
이 PDF에서는 텍스트를 추출할 수 없습니다.
텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.
```

## 완료 조건

- PDF에서 페이지별 텍스트를 추출해 저장할 수 있다.
- TXT/MD 텍스트를 로딩해 저장할 수 있다.
- 80페이지 또는 120,000자 초과 문서가 거부된다.
- 문서가 800~1,500 token 권장 범위의 청크로 분할된다.
- 각 청크에 page range와 section title이 가능한 범위에서 기록된다.
- 텍스트 추출 실패와 긴 문서 오류가 명확히 구분된다.
