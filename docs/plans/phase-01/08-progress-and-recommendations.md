# 08. 진행 상태 저장 및 추천 구현

## 목표

사용자가 각 노드의 이해 상태를 `안다 / 조금 안다 / 모른다`로 표시하고, 시스템이 규칙 기반으로 다음 학습 노드를 추천하도록 한다.

## 관련 명세

- 3. 핵심 사용자 시나리오: 시나리오 3
- 4. 화면 구성: 화면 4
- 7. 데이터 모델: user_node_progress
- 8. 추천 로직
- 9. API 명세
- 10. UI 요구사항: 노드 상태 표시

## 상태 값

내부 값:

- `known`
- `partial`
- `unknown`

사용자 표시:

- `known` → 안다
- `partial` → 조금 안다
- `unknown` → 모른다

## API 1: 진행 상태 업데이트

```http
PATCH /api/nodes/:nodeId/progress
```

Request:

```json
{
  "status": "partial"
}
```

Response:

```json
{
  "node_id": "uuid",
  "status": "partial"
}
```

## API 2: 추천 노드 조회

```http
GET /api/trees/:treeId/recommendations
```

Response:

```json
{
  "recommended_nodes": [
    {
      "node_id": "uuid",
      "title": "Borrowing",
      "reason": "lifetime annotation을 이해하기 전에 borrowing을 먼저 알아야 합니다."
    }
  ]
}
```

## 추천 규칙

우선순위:

1. `unknown` 상태인 선수지식
2. `partial` 상태인 선수지식
3. 선수지식이 충족된 `unknown` 핵심 개념
4. 관련 오개념
5. 이해 점검

## 구현 작업

### 1. 진행 상태 UI 구현

- 각 노드에 상태 선택 UI 표시
- 선택 옵션:
  - 안다
  - 조금 안다
  - 모른다
- 상태 변경 시 API 호출
- 저장 중/저장 완료/저장 실패 표시

### 2. 진행 상태 업데이트 API 구현

- status enum 검증
- 현재 사용자와 nodeId 기준 진행 row 조회
- 없으면 생성, 있으면 업데이트
- 업데이트된 상태 반환

### 3. 추천 로직 함수 구현

입력:

- tree nodes
- progress map

출력:

- 추천 노드 배열
- 추천 이유

정렬 기준:

- prerequisite unknown/partial은 difficulty 오름차순
- core는 prerequisites가 충족된 노드를 우선
- misconception은 관련 core 이후 추천
- quiz는 마지막 추천

### 4. 추천 API 구현

- treeId로 노드 목록 조회
- user progress 조회
- 추천 로직 실행
- 추천 이유 생성

### 5. 추천 UI 구현

- 결과 화면에서 추천 노드 강조
- 별도 추천 영역 표시
- 추천 노드 클릭 시 상세 화면으로 이동

## 산출물

- `PATCH /api/nodes/:nodeId/progress`
- `GET /api/trees/:treeId/recommendations`
- 추천 로직 순수 함수
- 상태 체크 UI
- 추천 노드 강조 UI

## 검증 기준

- 사용자가 노드 상태를 저장할 수 있다.
- `unknown` 선수지식이 가장 먼저 추천된다.
- 선수지식이 충족된 뒤 핵심 개념이 추천된다.
- 상태 변경 후 추천 결과가 갱신된다.
