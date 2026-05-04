# 09. 저장된 트리 조회 및 상태 복원

## 목표

이미 생성된 학습 트리를 다시 조회하고, 사용자별 진행 상태와 함께 화면에 복원할 수 있게 한다.

## 관련 명세

- 7. 데이터 모델
- 9. API 명세: GET /api/trees/:treeId
- 14. Phase 1 완료 조건

## API

```http
GET /api/trees/:treeId
```

Response:

```json
{
  "tree_id": "uuid",
  "topic": "Rust lifetime",
  "summary": "...",
  "nodes": [],
  "progress": []
}
```

## 구현 작업

### 1. 트리 조회 API 구현

조회 대상:

- `learning_trees`
- `learning_nodes`
- `user_node_progress`

반환 값:

- 트리 기본 정보
- 노드 목록
- 진행 상태 목록
- 상세 설명 생성 여부

### 2. 권한/사용자 처리

Phase 1 선택지:

- 인증이 있다면 `user_id` 기준으로 조회 권한 확인
- 인증이 없다면 세션/임시 사용자 ID 사용

최소 처리:

- 존재하지 않는 treeId는 404 반환
- 다른 사용자의 트리를 조회할 수 있는지 정책 결정

### 3. 결과 화면 상태 복원

- URL 또는 라우트 파라미터에서 `treeId` 획득
- `GET /api/trees/:treeId` 호출
- 노드 그룹핑
- 진행 상태 매핑
- 추천 API 호출 또는 클라이언트 추천 재계산

### 4. 상세 설명 재사용

- 노드에 `detail_json`이 있으면 상세 패널에서 즉시 표시할 수 있다.
- 없으면 상세 API를 호출한다.

## 산출물

- `GET /api/trees/:treeId`
- 트리 조회 repository/service
- 결과 화면의 저장 상태 복원 로직
- 404/권한 에러 UI

## 검증 기준

- 생성된 트리를 새로고침 후 다시 볼 수 있다.
- 노드별 이해 상태가 유지된다.
- 이미 생성된 노드 상세 설명이 유지된다.
- 존재하지 않는 트리 ID에 대해 적절한 에러가 표시된다.
