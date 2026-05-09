# 04. 생성 후 Concept 영속 파이프라인

## 목표

트리 생성 LLM 호출 성공 후, 각 노드를 Concept로 해석하고 DB에 일관되게 저장한다.

## 관련 명세

- 9.1 전체 흐름
- 9.5 Concept 연결
- 7장 `learning_tree_concepts`, `concept_edges`

## 구현 작업

### 1. 트랜잭션 경계

- 한 트리 생성 단위로 `learning_trees` / `learning_nodes` / Concept 관련 행을 함께 커밋하는 것이 이상적.
- 부분 실패 시 롤백 또는 보상 트랜잭션 정책 결정.

### 2. 노드별 resolution 순서

1. `concept_candidate`에서 검색 키 추출
2. 저장소 레이어로 기존 concept 조회(`reuse_concepts`가 false면 항상 신규 경로 선택 가능)
3. 없으면 `concepts` insert
4. `learning_nodes.concept_id`, `learning_tree_concepts` insert

### 3. 간선 처리

- LLM 간선은 노드 로컬 `id`(Phase 1 `node_key`)로 표현된다.
- DB UUID로 두 번 매핑한 뒤 `concept_edges`에 삽입.
- 중복 간선 UNIQUE 제약에 맞게 upsert/skip 처리.

### 4. prerequisite 해석 검증

- 방향 반대 삽입이 없도록 단위 테스트 또는 개발 로그 검증.

### 5. 플래그 `reuse_concepts`

- 명세 요청바디와 일치하게 서버 플래그 처리; 거짓일 때 신규 concept만 만드는지, 기존 검색까지 막을지 명시적으로 정의한다.

### 6. 병합 후보

자동 규칙에 걸리지 않으나 유사 후보되면 `concept_merge_candidates` 행 적재 후 계속 진행한다.
