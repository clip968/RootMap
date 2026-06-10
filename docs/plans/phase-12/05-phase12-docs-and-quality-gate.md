# 05. Phase 12 문서와 품질 Gate

## 목표

Phase 12 결과를 문서화하고 baseline 점수를 기록한 뒤, 최종 lint/build/eval 품질 gate를 통과시킨다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.6 (Acceptance Criteria)

## 관련 파일

- `docs/llm-evaluation.md` (eval 정책 업데이트)
- `apps/web/evals/fixtures/topics/` (baseline 점수 주석/스냅샷)
- `docs/plans/phase-12/README.md` (체크리스트)

## 구현 작업

### 1. baseline 점수 기록

- 현재 프롬프트/모델 상태에서 `npm run eval:tree` 결과를 baseline으로 기록한다.
- 이후 Phase 13~18에서 점수 변화를 비교할 수 있도록 주제별 baseline을 docs에 남긴다.

### 2. 문서 업데이트

- `docs/llm-evaluation.md`에 tree eval(coverage/prerequisite/pedagogy/ordering/detail)을 Small CI Eval 항목으로 추가한다.
- `npm run eval:tree` 사용법과 종료 코드 정책을 적는다.

### 3. 체크리스트 정리

- Phase 12 README의 진행 체크리스트를 실제 완료 상태로 갱신한다.
- 각 task 완료 단위로 커밋·push한다(`AGENTS.md` 운영 지침).

## 완료 기준(DoD)

- baseline 점수가 문서에 기록된다.
- `docs/llm-evaluation.md`에 tree eval 정책이 추가된다.
- `npm run eval:tree`와 `npm run check`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run eval:tree
npm run check
```
