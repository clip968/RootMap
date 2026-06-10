# 02. Tree Eval 채점 엔진

## 목표

`evaluateLearningTree(tree, fixture): TreeEvalResult`를 구현한다. 5개 점수를 결정적 규칙으로 산출하고, 위반 사항을 `failures`로 누적한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.3·1.4

## 관련 파일

- `apps/web/src/lib/evaluation/tree-eval.ts` (신규)
- `apps/web/src/lib/tree/concept-graph.ts` (`deriveLearningGraphView`)
- `apps/web/src/lib/concepts/normalize.ts`
- `apps/web/src/lib/learning/mastery.ts` (`clampScore`)
- `apps/web/src/lib/evaluation/evidence-grounding.ts` (어휘 겹침 채점 참고)

## 구현 작업

### 1. coverage_score

- `expected_concepts`를 `normalize.ts`로 정규화하고, 노드 title/alias 집합과 매칭한다.
- 점수 = 매칭된 expected 수 / 전체 expected 수.
- 누락된 핵심 개념은 `{ severity: "warn", code: "MISSING_CONCEPT" }`로 기록한다.

### 2. prerequisite_score

- `required_edges`가 트리 edge(또는 prerequisites)에 존재하는 비율을 더한다.
- `forbidden_edges`가 존재하면 감점하고 `{ severity: "error", code: "FORBIDDEN_EDGE" }`로 기록한다.
- 방향 역전(예: `to`가 `from`의 prerequisite)은 `{ severity: "error", code: "REVERSED_PREREQUISITE" }`.

### 3. ordering_score

- `deriveLearningGraphView(nodes)`로 depth를 도출한다.
- `recommended_order`에서 선수 노드가 후행 노드보다 뒤에 오면 위반으로 보고 감점한다.
- 점수 = 1 - (위반 쌍 수 / 검사한 쌍 수).

### 4. pedagogy_score

- 각 노드에 `learning_objective`, `mastery_evidence`(Phase 14), 유효 퀴즈가 있는 비율.
- Phase 14 필드가 없으면 0 처리하지 않고 `{ severity: "warn", code: "MISSING_LEARNING_CONTRACT" }`로 기록한다.

### 5. detail_score

- 상세 설명이 자기완결적인지 휴리스틱으로 판정한다(최소 길이, 필수 섹션 존재, `TODO`/placeholder 부재).
- 외부 참조 없이 이해 가능한 비율을 점수로 환산한다.

### 6. 공통 규칙

- 모든 점수는 `clampScore`로 0~1 보정한다.
- 함수는 순수 함수로 작성하고 LLM을 호출하지 않는다.
- 노드가 0개면 점수 0과 `error` failure를 반환한다.

## 완료 기준(DoD)

- `evaluateLearningTree`가 5개 점수를 0~1로 반환한다.
- `forbidden_edges` 위반이 `error`로, 개념 누락이 `warn`으로 기록된다.
- 같은 입력에 대해 항상 같은 결과를 낸다(결정적).
- 단위 smoke가 최소 1개 픽스처로 점수를 검증한다.

## 검증 명령

```bash
cd apps/web
npx tsx scripts/eval-tree.ts --self-check
```
