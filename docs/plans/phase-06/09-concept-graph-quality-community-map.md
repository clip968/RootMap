# 09. Concept Graph 품질과 Community Map

## 목표

Concept Store를 graph-first learning map의 기반으로 강화하고, 큰 주제를 community view와 learning path view로 탐색할 수 있게 한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.8 Concept graph 품질 문제
- 동일 6.7 Concept Store와 graph 품질 개선
- 기존 `docs/plans/phase-05/community-concept-map-plan.md`

## 구현 작업

### 1. Duplicate detection signal 확장

- normalized title만 보지 않고 다음 신호를 결합한다.
  - embedding similarity
  - alias overlap
  - domain
  - prerequisite neighborhood
- 후보 score와 reason을 `concept_merge_candidates`에 남긴다.

### 2. Admin merge workflow

- merge candidate를 approve/reject할 수 있게 한다.
- approve 시 canonical concept과 alias, edge, tree membership 이동 정책을 명확히 한다.
- reject 시 같은 후보가 반복 추천되지 않도록 상태를 저장한다.

### 3. Prerequisite DAG 검증

- prerequisite edge만 학습 경로 계산에 사용한다.
- prerequisite cycle이 생기면 edge를 reject하거나 related edge로 downgrade한다.
- related edge는 community map에는 쓸 수 있지만 learning path depth 계산에는 쓰지 않는다.

### 4. Community map와 learning path 연결

- learning path를 기본 view로 유지한다.
- community map은 큰 주제를 군집 단위로 훑어보는 탐색 view로 둔다.
- community에서 특정 concept을 선택하면 deep dive generation을 시작할 수 있게 한다.

### 5. Graph quality tests

- duplicate candidate 생성이 deterministic한지 검증한다.
- prerequisite cycle detection이 동작하는지 검증한다.
- related edge가 learning path depth를 깨뜨리지 않는지 검증한다.
- community view에서 학습 경로 시작점이 존재하는지 검증한다.

## 완료 기준(DoD)

- concept graph의 prerequisite cycle이 탐지된다.
- merge candidate approve/reject 흐름이 있다.
- prerequisite edge와 related edge가 분리되어 계산된다.
- community view에서 learning path 또는 deep dive를 시작할 수 있다.
- 검증 명령: `npm run phase6:graph-quality-smoke` (`apps/web`에서 실행)
