# 02. 문서 업로드 및 검증 API

## 목표

사용자가 PDF, TXT, MD 문서를 업로드할 수 있게 하고, Phase 3 제한·보안 정책에 맞게 파일을 검증한 뒤 `documents` 레코드를 생성한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 6.2 파일 검증
- 동일 명세 13장 `POST /api/documents/upload`
- 동일 명세 14.1 문서 업로드 화면
- 동일 명세 16장 오류 처리 정책
- 동일 명세 21장 보안 및 개인정보 고려

## 구현 작업

### 1. 업로드 엔드포인트

`POST /api/documents/upload`

Request:

```text
multipart/form-data
file: PDF, TXT, MD
```

Response:

```json
{
  "document_id": "uuid",
  "filename": "attention_is_all_you_need.pdf",
  "processing_status": "uploaded"
}
```

### 2. 지원 파일 형식 검증

허용 확장자:

```text
.pdf
.txt
.md
```

검증 기준:

- 확장자 allowlist
- MIME type 가능한 범위 내 확인
- 실행 가능한 파일 차단
- 빈 파일 차단

### 3. 파일 크기 제한

Phase 3 제한:

```text
최대 파일 크기: 20MB
```

초과 시 사용자에게 명확한 오류를 반환한다.

### 4. 파일명과 저장 정책

- 사용자가 업로드한 `original_filename`은 메타데이터로만 보관한다.
- 서버 내부 저장명은 UUID 기반으로 만든다.
- 파일 경로 또는 storage key는 사용자 입력 문자열을 직접 신뢰하지 않는다.
- 필요 시 `documents.metadata`에 storage 정보를 저장한다.

### 5. 사용자 권한 연결

- `documents.user_id`를 현재 사용자 또는 세션 식별자와 연결한다.
- 이후 조회·처리 API에서 동일 사용자만 접근할 수 있도록 repository 조회 함수를 사용한다.

### 6. 업로드 후 상태

업로드 성공 시:

- `documents.processing_status = uploaded`
- `file_type`, `file_size_bytes`, `original_filename` 저장
- 아직 텍스트 추출·청크·개념 추출은 실행하지 않는다.

### 7. 오류 응답

최소 오류 케이스:

- 지원하지 않는 파일 형식
- 파일 크기 초과
- 파일이 비어 있음
- 파일 저장 실패
- 인증/세션 식별 실패

오류 메시지는 UI에서 바로 표시할 수 있을 정도로 구체적으로 둔다.

## 완료 조건

- PDF, TXT, MD 파일을 업로드할 수 있다.
- 허용되지 않은 확장자와 20MB 초과 파일이 거부된다.
- 업로드 성공 시 `documents` 레코드가 `uploaded` 상태로 생성된다.
- 서버 내부 파일명은 사용자 입력 파일명을 그대로 사용하지 않는다.
- 다른 사용자의 문서에 접근할 수 없도록 이후 API에서 사용할 권한 검증 기반이 마련된다.
