# 06. Phase 15 문서와 품질 Gate

## 목표

학습 세션 도입 결과를 문서화하고, 스키마 마이그레이션과 추천 변화 영향을 정리한 뒤 최종 품질 gate를 통과시킨다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4.7 (Acceptance Criteria)

## 관련 파일

- `docs/learning-science-rationale.md`
- `docs/plans/phase-15/README.md` (체크리스트)
- `apps/web/scripts/smoke-phase4-session-events-api.ts`, `smoke-phase4-review-due.ts`

## 구현 작업

### 1. 문서 업데이트

- `docs/learning-science-rationale.md`에 retrieval practice 루프와 세션 스텝, FSRS-lite 연동을 추가한다.
- rule-based 추천 유지 결정을 명시한다(딥러닝 KT 미도입 사유 포함).

### 2. 마이그레이션 정리

- `quizAttempts` 확장 컬럼과 기본값/하위 호환을 문서화한다.

### 3. 체크리스트 정리

- README 체크리스트를 완료 상태로 갱신하고 task 단위로 커밋·push한다.

## 완료 기준(DoD)

- 세션 루프와 FSRS-lite 연동이 문서화된다.
- 스키마 마이그레이션이 정리된다.
- `npm run phase4:session-events-smoke`, `npm run phase4:review-smoke`, `npm run check`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run phase4:session-events-smoke
npm run phase4:review-smoke
npm run check
```
