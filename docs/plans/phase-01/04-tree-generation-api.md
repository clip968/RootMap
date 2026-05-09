# 04. 학습 트리 생성 API 구현

## 목표

사용자가 입력한 텍스트 주제를 받아 LLM으로 학습 트리를 생성하고, DB에 저장한 뒤 클라이언트가 렌더링할 수 있는 응답을 반환한다.

## 관련 명세

- 2. Phase 1 범위
- 5. AI 출력 스키마
- 7. 데이터 모델
- 9. API 명세
- 13. 구현 우선순위

## API

```http
POST /api/trees/generate
```

Request:

```json
{
  "topic": "Rust lifetime"
}
```

Response:

```json
{
  "tree_id": "uuid",
  "topic": "Rust lifetime",
  "summary": "Rust lifetime을 이해하기 위한 학습 트리입니다.",
  "nodes": []
}
```

## 구현 작업

### 1. 요청 검증

- `topic`이 문자열인지 확인한다.
- 빈 문자열이면 에러를 반환한다.
- 너무 긴 입력은 제한한다.
- Phase 1에서는 파일, URL, PDF 입력을 받지 않는다.

### 2. LLM 호출

- 학습 트리 생성 프롬프트에 `topic`을 주입한다.
- LLM 응답을 JSON으로 파싱한다.
- 스키마를 검증한다.
- 실패 시 제한 횟수 내에서 재시도한다.

### 3. DB 저장

순서:

1. `learning_trees` 생성
2. `learning_nodes` 일괄 생성
3. `user_node_progress` 초기값 생성

### 4. API 응답 변환

클라이언트에 필요한 값:

- `tree_id`
- `topic`
- `summary`
- `nodes`
- `recommended_order`
- 초기 `progress`

### 5. 에러 처리

주요 에러:

- `INVALID_TOPIC`
- `LLM_GENERATION_FAILED`
- `INVALID_LLM_RESPONSE`
- `TREE_SAVE_FAILED`

## 산출물

- `POST /api/trees/generate`
- 요청/응답 타입
- LLM 생성과 DB 저장을 연결하는 service 함수
- API 스모크 테스트

## 검증 기준

- 사용자가 주제를 입력하면 트리가 생성된다.
- 생성 결과가 DB에 저장된다.
- 모든 노드에 진행 상태 초기값이 생긴다.
- LLM 실패 시 사용자에게 재시도 가능한 에러가 표시된다.
