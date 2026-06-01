# RootMap Phase 08 구현 계획

이 폴더는 노드 상세 모달의 첫 생성 지연을 줄이고, 이미 생성된 상세 설명은 더 빠르게 열리도록 만드는 **Detail Generation Latency** 작업 계획을 담는다.

Phase 08의 핵심은 상세 모달 UX를 다시 크게 바꾸는 것이 아니다. 사용자가 노드를 눌렀을 때 불필요한 API 왕복과 LLM 호출을 줄이고, 필요한 생성 작업은 즉시 로딩 상태로 드러나게 하며, 실제 병목을 측정 가능한 로그와 smoke test로 고정하는 단계다.

## Phase 08 핵심 목표

1. 상세 모달 클릭 시 문서 기반 노드도 detail API 한 번으로 조회·생성·응답하도록 클라이언트 흐름을 단순화한다.
2. 클릭 직후 이전 detail을 지우고 로딩 상태를 켜서 사용자가 멈춘 화면처럼 느끼지 않게 한다.
3. `detailJson` 또는 Concept Store 설명이 충분한 경우 LLM 호출 전에 빠르게 응답하는 fast path를 고정한다.
4. 오른쪽 패널용 concept graph 보강 조회에서 순차 DB 왕복을 줄인다.
5. LLM, DB 저장, graph 보강 시간을 나눠 기록해 이후 성능 문제를 추측이 아니라 수치로 판단한다.
6. 기존 visual detail UI와 Phase 4 개인화 이벤트 흐름을 깨뜨리지 않는다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-detail-latency-contract-and-scope.md](./00-detail-latency-contract-and-scope.md) | 현상, 원인, API 계약, 완료 기준을 Phase 08 범위로 고정 | P0 |
| 1 | [01-client-single-detail-request.md](./01-client-single-detail-request.md) | `openNode`에서 선행 `generate-detail` 호출을 제거하고 즉시 로딩 상태를 표시 | P0 |
| 2 | [02-server-cache-and-concept-fast-path.md](./02-server-cache-and-concept-fast-path.md) | `detailJson`·Concept Store 설명을 LLM보다 먼저 사용하는 서버 fast path 추가 | P0 |
| 3 | [03-panel-graph-query-optimization.md](./03-panel-graph-query-optimization.md) | 상세 패널 graph 보강 조회를 batch 또는 parallel 조회로 줄임 | P1 |
| 4 | [04-detail-latency-observability-and-quality-gate.md](./04-detail-latency-observability-and-quality-gate.md) | 단계별 duration 로그와 smoke/build 검증 기준 추가 | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-detail-latency-contract-and-scope.md](./00-detail-latency-contract-and-scope.md) - 상세 지연 원인과 Phase 08 계약 고정
- [ ] 01. [01-client-single-detail-request.md](./01-client-single-detail-request.md) - 클라이언트 detail 요청 단일화와 즉시 로딩 상태 적용
- [ ] 02. [02-server-cache-and-concept-fast-path.md](./02-server-cache-and-concept-fast-path.md) - 서버 cache/Concept fast path 추가
- [ ] 03. [03-panel-graph-query-optimization.md](./03-panel-graph-query-optimization.md) - concept graph 보강 조회 최적화
- [ ] 04. [04-detail-latency-observability-and-quality-gate.md](./04-detail-latency-observability-and-quality-gate.md) - duration 로그와 최종 품질 gate 적용

## 범위 요약

### 포함

- `TreePageClient`의 상세 모달 열기 흐름 정리
- `/api/nodes/[nodeId]/detail` 중심의 단일 detail 조회·생성 경로
- 기존 `/api/trees/[treeId]/nodes/[nodeId]/generate-detail` 경로의 역할 축소 또는 호환 유지 결정
- `getOrCreateNodeDetail`의 cache hit, Concept Store fast path, LLM generation 순서 정리
- `buildPanelGraph` 관련 concept 조회 최적화
- detail generation duration 로그
- smoke script와 lint/build 검증

### 제외

- 상세 모달 레이아웃 재설계
- visual block schema 또는 renderer 추가
- LLM provider 교체, 모델 비교, pricing 변경
- 전체 문서 처리 pipeline 재설계
- Phase 4 mastery, quiz, recommendation 알고리즘 변경
- Supabase schema migration

## 의사결정 포인트

- 사용자가 노드를 클릭했을 때 클라이언트는 detail API를 한 번만 호출한다.
- 첫 생성이 필요하면 서버가 동기 생성하되, 화면은 즉시 loading 상태를 보여준다.
- Concept Store 설명은 예시·질문이 없는 축약 설명일 수 있으므로 fast path 기준을 명확히 둔다.
- fast path가 반환하는 응답에는 `from_concept_store: true`와 빈 visual block fallback을 명시해 UI가 기존 detail과 같은 계약으로 렌더링하게 한다.
- `generate-detail` route는 기존 호출자가 있을 수 있으므로 바로 삭제하지 않고, detail API와 중복 생성하지 않는 방향으로 정리한다.
- 성능 개선 판단은 체감 설명이 아니라 duration 로그와 smoke test 결과를 기준으로 한다.

## 완료 조건

Phase 08이 끝나면 문서 기반 노드도 클릭당 detail API 한 번만 사용하고, cache 또는 Concept Store 설명이 있는 노드는 LLM 호출 없이 응답해야 한다. LLM이 필요한 최초 생성은 여전히 시간이 걸릴 수 있지만, 사용자는 즉시 로딩 상태를 보고, 서버 로그에서는 LLM·저장·graph 보강 시간이 분리되어 확인되어야 한다. 최종 검증은 `apps/web`에서 `npm run node-detail:generation-smoke`, `npm run phase7:visual-detail-smoke`, `npm run lint`, `npm run build`가 통과하는 것으로 고정한다.
