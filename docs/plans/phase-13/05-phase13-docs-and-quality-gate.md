# 05. Phase 13 문서와 품질 Gate

## 목표

Phase 13의 edge 품질 강화 결과를 문서화하고, `prerequisite_score` 변화를 baseline과 비교한 뒤 최종 품질 gate를 통과시킨다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 2.5 (Acceptance Criteria)

## 관련 파일

- `docs/plans/phase-13/README.md` (체크리스트)
- `docs/learning-science-rationale.md` 또는 신규 graph 문서
- `apps/web/scripts/phase6-graph-quality-smoke.ts`

## 구현 작업

### 1. 점수 비교

- Phase 12 baseline 대비 `npm run eval:tree`의 `prerequisite_score`/`ordering_score` 변화를 기록한다.
- edge 근거·confidence 도입이 점수에 미친 영향을 문서에 남긴다.

### 2. 문서 업데이트

- edge 관계 타입, `is_blocking` 의미, transitive reduction/cross-community 동작을 문서화한다.
- cycle repair는 "제안만 하고 자동 적용하지 않는다"는 정책을 명시한다.

### 3. 체크리스트 정리

- Phase 13 README 체크리스트를 완료 상태로 갱신하고 task 단위로 커밋·push한다.

## 완료 기준(DoD)

- `prerequisite_score`/`ordering_score` 변화가 문서에 기록된다.
- edge 의미·repair 정책이 문서화된다.
- `npm run phase6:graph-quality-smoke`, `npm run eval:tree`, `npm run check`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run phase6:graph-quality-smoke
npm run eval:tree
npm run check
```
