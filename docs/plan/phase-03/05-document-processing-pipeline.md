# 05. 문서 처리 파이프라인

## 목표

업로드된 문서에 대해 텍스트 추출, 청크 분할, 개념 추출, Concept Store 매칭, 문서 기반 학습 트리 생성을 하나의 처리 플로우로 실행한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 6.1 전체 파이프라인
- 동일 명세 13장 `POST /api/documents/:documentId/process`
- 동일 명세 16장 오류 처리 정책
- 동일 명세 20장 구현 우선순위
- 동일 명세 22장 Phase 3 완료 조건

## 구현 작업

### 1. 처리 엔드포인트

`POST /api/documents/:documentId/process`

Request:

```json
{
  "generate_tree": true
}
```

Response:

```json
{
  "document_id": "uuid",
  "processing_status": "tree_generated",
  "tree_id": "uuid"
}
```

### 2. 권한과 상태 검증

- 현재 사용자가 해당 문서에 접근 가능한지 확인한다.
- `uploaded`, `text_extracted`, `chunked`, `concepts_extracted` 등 재시작 가능한 상태를 정의한다.
- 이미 `tree_generated`인 문서는 재처리 정책을 정한다.

### 3. 전체 처리 단계

```text
파일 업로드 완료 문서 조회
    ↓
파일 검증 재확인
    ↓
텍스트 추출
    ↓
document_pages 저장
    ↓
문서 메타데이터 갱신
    ↓
청크 분할
    ↓
document_chunks 저장
    ↓
청크별 개념 후보 추출
    ↓
문서 전체 개념 통합
    ↓
Concept Store 매칭 및 document_concepts 저장
    ↓
문서 기반 학습 트리 생성
    ↓
learning_trees / learning_nodes / document_learning_trees 저장
```

### 4. 상태 전이

상태는 긴 처리 중 사용자에게 진행 상황을 보여줄 수 있도록 단계별로 저장한다.

```text
uploaded
text_extracted
chunked
concepts_extracted
tree_generated
failed
```

각 단계 실패 시:

- `processing_status = failed`
- `processing_error`에 사용자 표시 가능 메시지 또는 내부 코드 저장
- 필요하면 내부 로그에는 상세 원인을 저장

### 5. LLM 호출 orchestration

- 청크별 개념 추출은 청크 수에 따라 순차 또는 제한된 병렬로 실행한다.
- LLM 비용과 실패 가능성을 고려해 긴 문서는 제한에 걸러낸다.
- 청크별 후보를 모은 뒤 문서 전체 통합 LLM을 호출한다.
- 통합 결과와 Concept Store 매칭 결과를 문서 트리 생성 프롬프트에 넣는다.

### 6. 낮은 품질 처리

문서에서 의미 있는 개념을 충분히 추출하지 못하면 다음 메시지를 사용할 수 있게 한다.

```text
이 문서에서 충분한 학습 개념을 추출하지 못했습니다.
문서 품질을 확인하거나 다른 자료를 업로드해 주세요.
```

품질 최소 기준 예:

- 추출 개념 수가 너무 적음
- document_core가 거의 없음
- evidence가 있는 explicit concept이 거의 없음

### 7. 멱등성·재시도 정책

- 같은 단계 재실행 시 기존 page/chunk/concept 데이터를 어떻게 정리할지 정한다.
- 실패 후 재시도 가능한 상태와 불가능한 상태를 구분한다.
- 중복 tree 생성 방지를 위해 `document_learning_trees` UNIQUE 제약을 활용한다.

## 완료 조건

- `POST /api/documents/:documentId/process`가 문서 처리 전체 흐름을 실행한다.
- 처리 상태가 단계별로 갱신된다.
- 텍스트 추출 실패, 긴 문서, LLM 실패, 낮은 품질 실패가 구분된다.
- 성공 시 `document_concepts`, `learning_trees`, `document_learning_trees`가 저장된다.
- 반환 응답에 `document_id`, 최종 `processing_status`, `tree_id`가 포함된다.
