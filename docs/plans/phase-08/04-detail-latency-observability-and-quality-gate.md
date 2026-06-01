# 04. Detail Latency 관측과 품질 Gate

## 목표

상세 모달 지연을 이후에도 추측으로 판단하지 않도록 서버 단계별 duration 로그와 최종 검증 기준을 고정한다.

## 관련 파일

- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/app/api/nodes/[nodeId]/detail/extras/route.ts`
- `apps/web/src/lib/llm/generate-node-detail.ts`
- `apps/web/src/lib/llm/generate-document-node-detail.ts`
- `apps/web/scripts/smoke-node-detail-generation.ts`
- `apps/web/package.json`

## 구현 작업

### 1. 서버 단계별 로그 추가

- `getOrCreateNodeDetail` 또는 작은 내부 helper에서 아래 duration을 기록한다.
  - `cache_hit`
  - `concept_fast_path`
  - `document_llm_generation`
  - `generic_llm_generation`
  - `save_detail`
  - `panel_graph`
  - `cache_check`
  - `document_context`
  - `tree_load`
  - `detail_total`
  - `detail_extras_total`
- 로그 prefix는 기존 문서 detail 로그와 구분되게 `[node-detail-service]`로 둔다.
- 로그에는 `treeId`, `nodeId`, `nodeKey`, `conceptId`, `durationMs`, `source` 정도만 남긴다.
- learner-facing 텍스트 전문이나 문서 evidence 전문은 로그에 남기지 않는다.

### 2. LLM duration과 연결

- 문서 기반 LLM은 이미 `completionDurationMs`와 `parseValidationDurationMs`를 남긴다.
- 일반 노드 LLM에도 최소한 attempt duration 로그를 추가할지 검토한다.
- 단, Phase 08에서는 provider 교체나 retry 정책 변경은 하지 않는다.

### 3. smoke와 build gate 고정

- `node-detail:generation-smoke`는 fast path, generation path, cache hit 본문 우선 응답, extras route 계약을 모두 검증한다.
- `phase7:visual-detail-smoke`는 visual block renderer 계약이 깨지지 않았는지 확인한다.
- `lint`와 `build`로 Next.js/TypeScript 회귀를 확인한다.

### 4. Phase 08 README 체크

- 각 task 구현·검증이 끝난 항목만 `README.md`에서 `[x]`로 바꾼다.
- 일부만 구현했거나 검증이 끝나지 않은 항목은 체크하지 않는다.

## 완료 기준(DoD)

- detail 응답 source별 duration이 서버 로그에서 구분된다.
- smoke script가 fast path와 LLM generation path를 모두 검증한다.
- Phase 08 README 체크리스트가 실제 완료 상태와 일치한다.
- 최종 검증 명령: `npm run node-detail:generation-smoke && npm run phase7:visual-detail-smoke && npm run lint && npm run build` (`apps/web`에서 실행)
