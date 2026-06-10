# 04. worked_example Smoke와 품질 Gate

## 목표

worked_example을 smoke fixture로 검증하고 문서를 갱신한 뒤 최종 품질 gate를 통과시킨다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 7.4 (Acceptance Criteria)

## 관련 파일

- `apps/web/scripts/smoke-phase7-visual-block-schema.ts`
- `apps/web/scripts/smoke-phase7-visual-detail-renderers.ts`
- `apps/web/scripts/fixtures/phase7-visual-detail-fixtures.ts`
- `docs/specs/visual-learning-detail-spec.md`
- `docs/plans/phase-17/README.md` (체크리스트)

## 구현 작업

### 1. fixture 추가

- `phase7-visual-detail-fixtures.ts`에 worked_example fixture를 추가한다(B-tree 삽입, 주소 변환 등 계산형 예시).
- decision.skill == "worked_example"와 block.type 일치를 검증한다.

### 2. smoke 확장

- `phase7:visual-block-schema` smoke가 9종(기존 8 + worked_example)을 커버한다.
- `phase7:visual-detail-renderers` smoke가 worked_example 렌더링과 invalid fallback을 검증한다.

### 3. 문서 업데이트

- `visual-learning-detail-spec.md`의 skill 목록에 worked_example을 추가하거나 본 spec을 참조하도록 보강한다.
- README 체크리스트를 완료 상태로 갱신하고 task 단위로 커밋·push한다.

## 완료 기준(DoD)

- worked_example fixture와 smoke가 통과한다.
- 9종 visual skill이 schema·renderer smoke로 검증된다.
- `npm run phase7:visual-detail-smoke`, `npm run lint`, `npm run build`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run phase7:visual-detail-smoke
npm run lint
npm run build
```
