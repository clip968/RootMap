# 05. Quality Warnings와 Pedagogy Score 연동

## 목표

`nodeDetailQualityWarnings`를 확장해 노드 학습 계약·퀴즈 품질을 검사하고, Phase 12의 `pedagogy_score`가 이를 반영하게 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.4(pedagogy), Section 3.4, Section 6.6

## 관련 파일

- `apps/web/src/lib/llm/schemas.ts` (`nodeDetailQualityWarnings`)
- `apps/web/src/lib/evaluation/tree-eval.ts` (Phase 12)
- `apps/web/scripts/eval-tree.ts`

## 구현 작업

### 1. nodeDetailQualityWarnings 확장

다음을 경고/실패 code로 추가한다.

- `learning_objective` 누락/비허용 동사 → `MISSING_OR_INVALID_OBJECTIVE`
- `mastery_evidence` 0개 → `MISSING_MASTERY_EVIDENCE`
- 퀴즈가 evidence를 검증하지 않음 → `QUIZ_EVIDENCE_GAP`
- recall 편중 → `QUIZ_TYPE_IMBALANCE`

### 2. pedagogy_score 연결

- Phase 12 `evaluateLearningTree`의 `pedagogy_score`가 노드별 학습 계약·퀴즈 충족 비율을 사용하도록 한다.
- Phase 14 필드가 없는 노드는 0 처리하지 않고 `warn`으로만 기록한다(점진 마이그레이션 고려).

### 3. eval 회귀 확인

- baseline 대비 `pedagogy_score`가 상승하는지 `npm run eval:tree`로 확인한다.

## 완료 기준(DoD)

- `nodeDetailQualityWarnings`가 학습 계약·퀴즈 품질 경고를 생성한다.
- `pedagogy_score`가 학습 계약·퀴즈 충족을 반영한다.
- baseline 대비 점수 변화가 측정된다.

## 검증 명령

```bash
cd apps/web
npm run eval:tree
npm run check
```
