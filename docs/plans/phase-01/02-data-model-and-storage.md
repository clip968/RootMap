# 02. 데이터 모델 및 저장소 구현

## 목표

Phase 1에서 생성된 학습 트리, 노드, 사용자별 이해 상태를 저장하고 조회할 수 있는 데이터 모델을 구현한다.

## 관련 명세

- 7. 데이터 모델
- 9. API 명세
- 14. Phase 1 완료 조건

## 구현 작업

### 1. 테이블 구현

명세 기준 테이블:

- `learning_trees`
- `learning_nodes`
- `user_node_progress`

### 2. `learning_trees`

저장 내용:

- 트리 ID
- 사용자 ID
- 주제
- 요약
- 원본 LLM 트리 JSON
- 생성/수정 시각

주의사항:

- Phase 1에서는 완전한 개인 지식베이스가 아니라 생성된 트리 단위 저장만 한다.
- `tree_json`에는 LLM 원본 구조를 보존한다.

### 3. `learning_nodes`

저장 내용:

- 노드 ID
- 소속 트리 ID
- LLM 노드 키
- 제목
- 타입
- 설명
- 난이도
- prerequisites
- children
- 상세 설명 JSON

주의사항:

- `node_key`는 LLM 응답의 `id`를 저장한다.
- API path의 `nodeId`는 DB UUID를 사용한다.
- LLM의 `prerequisites`와 `children`은 우선 JSON 배열로 저장한다.

### 4. `user_node_progress`

저장 내용:

- 사용자 ID
- 트리 ID
- 노드 ID
- 상태 `known / partial / unknown`
- 수정 시각

초기값:

- 트리 생성 시 모든 노드의 기본 상태를 `unknown`으로 생성한다.
- 인증이 없는 MVP라면 임시 사용자 ID 또는 세션 기반 사용자 ID를 사용한다.

### 5. 저장소 함수 구현

필수 함수:

- `createLearningTree(topic, summary, treeJson)`
- `createLearningNodes(treeId, nodes)`
- `initializeNodeProgress(userId, treeId, nodes)`
- `getLearningTree(treeId, userId)`
- `getNodeById(nodeId)`
- `saveNodeDetail(nodeId, detailJson)`
- `updateNodeProgress(userId, nodeId, status)`
- `getProgressByTree(userId, treeId)`

## 산출물

- DB 마이그레이션
- 저장소/repository 계층
- 기본 CRUD 테스트 또는 스모크 테스트

## 검증 기준

- 학습 트리 생성 결과를 트리와 노드로 저장할 수 있다.
- 노드별 진행 상태가 저장된다.
- 저장된 트리를 진행 상태와 함께 다시 조회할 수 있다.
- 노드 상세 설명 JSON을 캐시/저장할 수 있다.
