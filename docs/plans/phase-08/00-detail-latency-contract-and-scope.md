# 00. 상세 지연 계약과 범위 고정

## 목표

노드 상세 모달이 느린 원인을 Phase 08의 구현 범위와 API 계약으로 고정한다.

## 현재 원인 요약

1. 첫 클릭에서 `detailJson`이 없으면 LLM이 상세 설명을 새로 생성한다.
2. 문서 기반 노드에서 `description`이 비어 있으면 클라이언트가 `generate-detail`을 먼저 기다린 뒤 다시 `detail` API를 호출한다.
3. 가장 오래 걸리는 생성 작업 전에 로딩 상태가 늦게 켜질 수 있다.
4. LLM 응답 파싱·검증 실패 시 최대 3회 재시도한다.
5. cache hit 이후에도 오른쪽 패널 정보를 만들기 위해 concept graph DB 조회가 붙는다.

## 관련 파일

- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/app/api/nodes/[nodeId]/detail/route.ts`
- `apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail/route.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/lib/repository/concept-repository.ts`
- `apps/web/scripts/smoke-node-detail-generation.ts`
- `apps/web/package.json`

## 구현 작업

### 1. 단일 클라이언트 계약 고정

- 상세 모달을 여는 기본 경로는 `/api/nodes/:nodeId/detail` 하나로 고정한다.
- 클라이언트는 문서 기반 여부와 `description` 유무로 별도 생성 API를 먼저 호출하지 않는다.
- `recordPhase4NodeEvent`는 fire-and-forget 흐름을 유지한다.

### 2. 서버 detail 응답 계약 고정

- detail API는 아래 순서로 응답한다.
  1. `detailJson` cache hit
  2. 충분한 Concept Store 설명 fast path
  3. LLM generation
  4. LLM 실패 시 기존 Concept fallback
- 모든 응답은 `ApiNodeDetailResponse` 형태를 유지한다.
- Concept fast path는 `from_concept_store: true`, `visual_decision.skill = "none"`, `visual_blocks = []`를 반환한다.

### 3. 검증 범위 고정

- 클라이언트 흐름은 정적 smoke 또는 focused assertion으로 `generate-detail` 선행 호출이 사라졌는지 확인한다.
- 서버 흐름은 LLM generator stub이 호출되지 않는 Concept fast path 테스트를 추가한다.
- visual detail renderer smoke를 함께 돌려 Phase 07 UI 계약이 깨지지 않았는지 확인한다.

## 완료 기준(DoD)

- Phase 08 README와 세부 task가 실제 수정 순서를 설명한다.
- 구현 전에 어떤 파일을 바꿀지와 어떤 검증을 할지 명확하다.
- 검증 명령: 문서 작업만 수행하는 이 task는 별도 실행 명령 없음.
