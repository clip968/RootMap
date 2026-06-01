# 03. 상세 패널 Graph 조회 최적화

## 목표

상세 응답의 오른쪽 패널에 필요한 선수 개념, 관련 개념, 다른 Tree 정보를 만들 때 DB 왕복을 줄이고, cache hit 본문 응답이 이 보강 조회를 기다리지 않게 한다.

## 관련 파일

- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/app/api/nodes/[nodeId]/detail/extras/route.ts`
- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/lib/repository/concept-repository.ts`

## 구현 작업

### 1. 현재 병목 지점 정리

- `buildPanelGraph(conceptId, treeId)`는 edge 목록을 가져온 뒤 각 edge마다 `getConceptById`를 순차 호출한다.
- concept edge가 많으면 cache hit detail도 불필요하게 느려질 수 있다.

### 2. batch 조회 helper 추가

- `concept-repository.ts`에 여러 Concept id를 한 번에 조회하는 helper를 추가한다.
- 함수 예시:
  - `getConceptsByIds(db, ids): Promise<Map<string, ConceptRow>>`
- 빈 배열이 들어오면 즉시 빈 Map을 반환한다.
- 중복 id는 제거한 뒤 조회한다.

### 3. `buildPanelGraph` 재구성

- edge를 먼저 순회해 필요한 concept id 목록과 prerequisite/related 분류를 만든다.
- concept row는 batch helper로 한 번에 가져온다.
- `listTreesUsingConcept`는 기존처럼 한 번만 호출한다.
- 출력 순서는 기존 edge 순서를 최대한 유지한다.

### 4. 본문 응답과 extras 응답 분리

- `/api/nodes/:nodeId/detail`은 `detailJson` 또는 Concept fast path 본문을 먼저 반환한다.
- `/api/nodes/:nodeId/detail/extras?tree_id=...`는 `prerequisite_concepts`, `related_concepts`, `used_in_other_trees`만 별도로 보강한다.
- 클라이언트는 본문 detail을 먼저 렌더링한 뒤 extras 응답을 현재 노드 detail에 병합한다.

### 5. 회귀 확인

- 기존 detail smoke에서 prerequisite/related concept이 계속 채워지는지 확인한다.
- `from_concept_store` 본문 응답은 graph 보강을 기다리지 않는지 확인한다.
- extras 응답에서는 graph 보강 필드가 유지되는지 확인한다.

## 완료 기준(DoD)

- `buildPanelGraph`가 edge마다 순차 `getConceptById`를 호출하지 않는다.
- 동일한 concept id가 여러 edge에 있어도 중복 조회하지 않는다.
- 본문 detail API는 panel graph를 기다리지 않는다.
- extras API 응답의 필드 이름과 배열 형태가 기존 패널 렌더링 계약과 호환된다.
- 검증 명령: `npm run node-detail:generation-smoke`, `npm run phase7:visual-detail-smoke` (`apps/web`에서 실행)
