# 00. 노드 계약·퀴즈 범위 고정

## 목표

Phase 14에서 추가할 노드 학습 계약과 퀴즈 계약을 먼저 고정하고, 하위 호환 경계와 DB 변경 여부를 명확히 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 3, Section 6

## 현재 문제

`apps/web/src/types/learning.ts`의 `NodeDetailResponse`는 `why_it_matters`, `easy_explanation`, `analogy`, `example`, `common_misconceptions`, `check_questions`, `next_nodes`를 가진다. 그러나 "읽은 다음 무엇을 할 수 있어야 하는가"(`learning_objective`)와 "그 증거"(`mastery_evidence`)가 없고, `check_questions`는 정의 암기에 머무를 수 있다.

## 관련 파일

- `apps/web/src/types/learning.ts` (`NodeDetailResponse`, `DocumentNodeDetailResponse`)
- `apps/web/src/lib/llm/schemas.ts` (`nodeDetailQualityWarnings`)
- `apps/web/src/lib/learning/quiz.ts`
- `apps/web/src/db/schema.ts` (`learningNodes`, `quizAttempts`, `misconceptionEvents`)

## 구현 작업

### 1. 노드 계약 고정

```ts
type NodeLearningContract = {
  learning_objective: string;   // define|explain|apply|compare|debug 로 시작
  mastery_evidence: string[];   // 1개 이상
};
```

### 2. 퀴즈 계약 고정

```ts
type ConceptQuestion = {
  id: string;
  node_id: string;
  type: "recall" | "apply" | "compare" | "trace" | "debug";
  prompt: string;
  expected_answer: string;
  rubric: string[];
  misconception_target?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
};
```

### 3. 하위 호환·DB 경계 명시

- `NodeDetailResponse`의 신규 필드는 optional로 추가한다.
- 저장은 기존 `detailJson`(노드 상세 JSON) 안에 넣어 DB 컬럼 추가를 최소화한다. 별도 컬럼/테이블이 필요하면 migration·plan 승인 후 진행한다.
- 동사 체계와 `ConceptQuestion.type`의 정렬 규칙을 고정한다.

### 4. 책임 경계 명시

- 문항 시도 기록·세션은 Phase 15.
- 문서 노드 근거성은 Phase 16.

## 완료 기준(DoD)

- `NodeLearningContract`, `ConceptQuestion` 계약이 문서·타입 초안으로 고정된다.
- 하위 호환 전략과 DB 변경 여부가 명시된다.
- 동사-문항유형 정렬 규칙이 적혀 있다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-14
```
