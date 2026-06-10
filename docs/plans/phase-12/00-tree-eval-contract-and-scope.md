# 00. Tree Eval 계약과 범위 고정

## 목표

Phase 12의 평가 계약을 먼저 문서와 타입으로 고정한다. 구현 전 RED 상태를 만들어, eval 모듈과 픽스처가 없으면 `npm run eval:tree`가 실패하도록 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1 (품질 평가 시스템)
- `docs/llm-evaluation.md` (Small CI Eval vs Full Eval 정책)

## 현재 문제

현재 트리 품질 점검은 `apps/web/src/lib/llm/schemas.ts`의 `learningTreeQualityWarnings`뿐이며 `string[]` 경고만 반환한다. 점수가 없으므로 "프롬프트 수정 후 좋아졌는가"를 수치로 말할 수 없고, 개선이 감각적 튜닝에 머문다.

## 관련 파일

- `apps/web/src/lib/llm/schemas.ts` (`learningTreeQualityWarnings`)
- `apps/web/src/lib/tree/concept-graph.ts` (`deriveLearningGraphView`)
- `apps/web/src/lib/concepts/normalize.ts`
- `apps/web/src/lib/learning/mastery.ts` (`clampScore`)
- `apps/web/package.json` (scripts)

## 구현 작업

### 1. 타입 계약 고정

신규 모듈 `apps/web/src/lib/evaluation/tree-eval.ts`(이 phase에서 생성)에 다음 타입을 정의한다.

```ts
type TreeEvalFixture = {
  topic: string;
  expected_concepts: string[];
  required_edges: Array<{ from: string; to: string; reason: string }>;
  forbidden_edges: Array<{ from: string; to: string; reason: string }>;
  beginner_misconceptions: string[];
  required_examples: string[];
};

type TreeEvalResult = {
  coverage_score: number;
  prerequisite_score: number;
  pedagogy_score: number;
  ordering_score: number;
  detail_score: number;
  failures: Array<{
    severity: "error" | "warn";
    code: string;
    node_id?: string;
    message: string;
  }>;
};
```

### 2. 점수 정의 고정

- `coverage_score`: `expected_concepts` 중 노드 title/alias 매칭 비율.
- `prerequisite_score`: `required_edges` 충족 - `forbidden_edges` 위반. 방향 역전은 `error`.
- `ordering_score`: `recommended_order`가 depth 위상 순서를 위반하지 않는 비율.
- `pedagogy_score`: 노드의 학습 목표·숙달 증거·유효 퀴즈 존재 비율(Phase 14 의존, 없으면 `warn`).
- `detail_score`: 상세 설명 자기완결성 휴리스틱(길이·필수 섹션·placeholder 부재).

### 3. 실행 계약 고정

- `package.json`에 `eval:tree` 스크립트 자리를 예약한다(구현은 Task 04).
- 채점은 LLM 호출 없이 결정적으로 동작해야 한다.
- 모든 점수는 `clampScore`로 0~1 보정한다.

### 4. 허용 경계 명시

- Phase 12는 점수를 **측정만** 하고 프롬프트/모델을 바꾸지 않는다.
- 문서 기반 트리 평가는 Phase 16으로 미룬다.

## 완료 기준(DoD)

- `TreeEvalFixture`, `TreeEvalResult` 타입 계약이 문서와 일치하게 정의된다.
- 5개 점수의 산출 규칙이 이 문서에 명시된다.
- `npm run eval:tree`가 (아직 미구현이라) 실패하거나 미정의 상태임이 확인된다.
- Phase 12에서 건드리지 않을 영역(프롬프트/모델/문서 eval)이 명확히 적혀 있다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-12
```
