# 06. Async Smoke와 Quality Gate

## 목표

Phase 10의 핵심 계약을 자동 검증하는 smoke를 추가하고, 최종 gate를 고정한다.

## 관련 파일

- `apps/web/scripts/smoke-node-detail-async.ts`
- `apps/web/scripts/smoke-node-detail-generation.ts`
- `apps/web/scripts/smoke-phase7-visual-detail-prompts.ts`
- `apps/web/package.json`
- `docs/plans/phase-10/README.md`

## 구현 작업

### 1. Async smoke script 추가

`apps/web/scripts/smoke-node-detail-async.ts`를 추가한다.

검증 항목:

- async flag on에서 cache hit은 `ready`.
- cache miss는 LLM 호출 없이 job enqueue.
- 같은 `(tree_id, node_id, detail_version)` enqueue는 같은 job을 재사용.
- worker `--once` 경로가 queued job 하나를 ready로 만든다.
- ready job polling 응답에 detail이 포함된다.
- failed job polling 응답에 safe error message가 포함된다.
- stale running job recovery가 queued 또는 failed로 상태를 바꾼다.
- public detail route source가 `generateNodeDetail`을 직접 호출하지 않는다.

### 2. npm script 추가

`apps/web/package.json`에 아래 script를 추가한다.

```json
"node-detail:async-smoke": "tsx scripts/smoke-node-detail-async.ts"
```

### 3. 기존 smoke 유지

`node-detail:generation-smoke`는 기존 sync generation, cache hit, extras split, visual prompt contract를 계속 검증한다.

Phase 10에서 이 smoke를 삭제하거나 약화하지 않는다.

### 4. Final gate 고정

Phase 10 final gate:

```bash
npm run node-detail:generation-smoke
npm run node-detail:async-smoke
npm run phase7:visual-detail-smoke
npm run lint
npm run build
```

DB migration 검증이 별도 명령으로 정착되면 `node-detail:async-smoke` 앞에 추가한다.

### 5. README 체크 규칙

- 각 task 구현과 검증이 끝난 뒤에만 Phase 10 README 체크리스트를 `[x]`로 바꾼다.
- 문서만 만든 현재 상태에서는 모든 task를 unchecked로 유지한다.
- task 완료 시 AGENTS 지침에 따라 커밋하고 push한다.

## 완료 기준(DoD)

- `npm run node-detail:async-smoke`가 추가된다.
- async smoke가 enqueue, dedupe, worker completion, polling, stale recovery를 검증한다.
- final gate가 README와 실제 package script에 일치한다.
- Phase 10 README 체크리스트가 실제 완료 상태와 일치한다.
