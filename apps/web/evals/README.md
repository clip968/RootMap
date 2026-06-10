# Tree Eval Fixtures (Phase 12)

이 디렉터리는 학습 트리 품질을 **LLM 호출 없이 결정적으로** 채점하기 위한 골든 픽스처와
관련 자료를 담는다. 자세한 정책은 `docs/llm-evaluation.md`의 "Tree Eval (Phase 12)"를 참고한다.

## 구성

```text
evals/
  fixtures/
    topics/        # 골든 주제 픽스처(TreeEvalFixture) + index.ts 로더
    trees/         # (선택) 저장된 생성 트리 스냅샷 <slug>.json — 있으면 채점 대상으로 우선 사용
```

- 채점기: `src/lib/evaluation/tree-eval.ts`의 `evaluateLearningTree(tree, fixture)`.
- 실행기: `scripts/eval-tree.ts` → `npm run eval:tree`.

## 픽스처 형식 (`TreeEvalFixture`)

```ts
{
  topic: string;
  expected_concepts: string[];                                  // 트리에 반드시 있어야 하는 핵심 개념
  required_edges: Array<{ from; to; reason }>;                  // from이 to의 선수(prerequisite)
  forbidden_edges: Array<{ from; to; reason }>;                 // 절대 나오면 안 되는 선수관계
  beginner_misconceptions: string[];
  required_examples: string[];
}
```

- 각 픽스처는 `required_edges`와 `forbidden_edges`를 최소 1개씩 가진다.
- `index.ts`는 모든 픽스처를 배열로 export하고, 중복 topic·빈 필드를 로드 시점에 throw로 잡는다.

## 실행

```bash
cd apps/web
npm run eval:tree                 # 기본(무LLM): 주제별 점수표 + 평균
npm run eval:tree:self-check      # 채점 규칙 자체 검증
npm run eval:tree:live -- --user-id <uuid>   # 실제 생성 트리 채점(LLM 비용)
```

기본 모드 입력 소스: `fixtures/trees/<slug>.json`이 있으면 그것을, 없으면 픽스처에서
결정적으로 합성한 트리를 채점한다.

## Baseline (결정적 합성, 무LLM)

`npm run eval:tree` (픽스처 합성 트리 기준):

| topic | coverage | prereq | pedagogy | ordering | detail | err | warn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Transformer | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| Rust lifetime | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 가상 메모리 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| B-tree index | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| TCP congestion control | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| Linux block layer | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 운영체제 스케줄링 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 데이터베이스 트랜잭션 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 컴파일러 파이프라인 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 분산 시스템 consensus | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| **AVERAGE** | **1.00** | **1.00** | **1.00** | **1.00** | **1.00** | **0** | **10** |

주제마다 남는 1개의 warn은 `MISSING_LEARNING_CONTRACT`다(learning_objective/mastery_evidence는
Phase 14에서 추가). 이 합성 baseline은 "픽스처에 충실한 트리"의 상한이자 채점기·픽스처
회귀 가드다. 실제 생성 모델의 baseline은 `npm run eval:tree:live`로 측정해 기록한다.
