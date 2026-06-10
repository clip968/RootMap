# 06. Phase 14 문서와 품질 Gate

## 목표

노드 학습 계약과 개념 퀴즈 도입 결과를 문서화하고, 점진 마이그레이션 방침을 정리한 뒤 최종 품질 gate를 통과시킨다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 3.5, Section 6.6 (Acceptance Criteria)

## 관련 파일

- `docs/plans/phase-14/README.md` (체크리스트)
- `docs/learning-science-rationale.md`
- `apps/web/scripts/smoke-node-detail-generation.ts`

## 구현 작업

### 1. 문서 업데이트

- 동사 체계(`define/explain/apply/compare/debug`)와 `ConceptQuestion` 유형, mastery evidence 연결 방식을 문서화한다.
- 오개념 distractor 재사용 방식을 적는다.

### 2. 점진 마이그레이션 방침

- 기존(필드 없는) 노드 상세를 어떻게 다룰지 명시한다(재생성 시 채움, 화면은 숨김 처리).

### 3. 점수·체크리스트 정리

- baseline 대비 `pedagogy_score` 변화를 기록한다.
- README 체크리스트를 완료 상태로 갱신하고 task 단위로 커밋·push한다.

## 완료 기준(DoD)

- 동사 체계·퀴즈 유형·오개념 재사용이 문서화된다.
- 점진 마이그레이션 방침이 적힌다.
- `npm run node-detail:generation-smoke`, `npm run eval:tree`, `npm run check`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run node-detail:generation-smoke
npm run eval:tree
npm run check
```
