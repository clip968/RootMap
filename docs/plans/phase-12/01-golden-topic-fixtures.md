# 01. 골든 주제 픽스처

## 목표

사람이 만든 최소 정답 기준을 가진 골든 주제 픽스처를 `apps/web/evals/fixtures/topics/`에 작성한다. 초기 10개, 확장 목표 20개.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.2 (골든 픽스처)

## 관련 파일

- `apps/web/evals/fixtures/topics/` (신규 디렉터리)
- `apps/web/src/lib/evaluation/tree-eval.ts` (`TreeEvalFixture` 타입)

## 구현 작업

### 1. 초기 10개 주제 작성

각 주제는 `TreeEvalFixture`를 따르는 파일(예: `transformer.ts` 또는 `transformer.json`)로 둔다.

```text
Transformer
Rust lifetime
가상 메모리
B-tree index
TCP congestion control
Linux block layer
운영체제 스케줄링
데이터베이스 트랜잭션
컴파일러 파이프라인
분산 시스템 consensus
```

### 2. 각 픽스처 필수 항목

- `expected_concepts`: 트리에 반드시 있어야 하는 핵심 개념(주제당 5~12개 권장).
- `required_edges`: 반드시 성립해야 하는 선수관계(`from`이 `to`의 prerequisite). `reason` 포함.
- `forbidden_edges`: 절대 나오면 안 되는 역방향/오류 관계. `reason` 포함.
- `beginner_misconceptions`: 초심자가 자주 하는 오개념.
- `required_examples`: 이해를 돕는 핵심 예시.

예시(`가상 메모리`):

```ts
{
  topic: "가상 메모리",
  expected_concepts: ["page", "page table", "TLB", "page fault", "virtual address", "physical address"],
  required_edges: [
    { from: "page table", to: "virtual address translation", reason: "주소 변환은 page table 조회가 전제" },
  ],
  forbidden_edges: [
    { from: "page fault", to: "page", reason: "page fault가 page 개념의 선수일 수 없음" },
  ],
  beginner_misconceptions: ["TLB miss와 page fault를 같은 것으로 본다"],
  required_examples: ["가상 주소를 page number와 offset으로 분리"],
}
```

### 3. 픽스처 로더

`evals/fixtures/topics/index.ts`가 모든 픽스처를 배열로 export하고, 중복 topic·빈 필드를 빌드 타임에 잡는다.

## 완료 기준(DoD)

- 최소 10개 주제 픽스처가 존재하고 `TreeEvalFixture` 타입을 만족한다.
- 각 픽스처에 `required_edges`와 `forbidden_edges`가 1개 이상 있다.
- 로더가 모든 픽스처를 정상적으로 노출한다.

## 검증 명령

```bash
cd apps/web
npx tsx -e "import('./evals/fixtures/topics/index.ts').then(m=>console.log(m.default.length))"
```
