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

## 확정된 계약 결정 (Phase 14 시작 시점 고정)

아래 결정을 Phase 14 전체의 단일 기준으로 고정한다. Task 01~06은 이 표를 그대로 따른다.

### 1. 저장·DB 경계 (DB 마이그레이션 없음)

- `learning_objective`, `mastery_evidence`, `ConceptQuestion[]`는 모두 노드 상세 JSON(`learningNodes.detailJson`) 안에 저장한다.
- Phase 14에서는 **새 컬럼·새 테이블·migration을 추가하지 않는다.** `detailJson`은 이미 임의 구조 JSON이므로 신규 필드는 하위 호환된다.
- 문항 시도 기록(`QuestionAttempt`)용 스키마 확장은 Phase 14 범위가 아니라 **Phase 15**에서 다룬다(거기서 migration·plan 승인 후 진행).

### 2. 하위 호환

- `NodeDetailResponse`·`DocumentNodeDetailResponse`의 신규 필드는 전부 **optional**로 추가한다.
- 필드가 없는 기존 상세(`detailJson`)는 화면에서 해당 블록을 숨기고 깨지지 않는다.
- 기존 `check_questions`(`{question, answer}`)는 제거하지 않고 유지한다. `ConceptQuestion[]`는 별도 필드(`concept_questions`)로 **보강**한다.

### 3. 동사 체계 (5개)

```text
define, explain, apply, compare, debug
```

`learning_objective`는 위 동사 중 하나로 시작해야 한다(영어 동사 접두로 고정해 검증을 단순화).

### 4. 동사 ↔ 문항 유형 정렬 규칙 (고정)

| learning_objective 동사 | 우선 ConceptQuestion.type | 허용 보조 type |
| --- | --- | --- |
| define | recall | compare |
| explain | recall | compare, trace |
| apply | apply | trace |
| compare | compare | recall |
| debug | debug | trace |

- 한 노드의 퀴즈가 `recall` 한 종류로만 채워지지 않도록, 가능하면 보조 type을 1개 이상 섞는다(`QUIZ_TYPE_IMBALANCE` 경고 대상).
- 각 노드의 퀴즈는 그 노드 `mastery_evidence` 항목을 최소 1개 검증해야 한다(`QUIZ_EVIDENCE_GAP` 경고 대상).

### 5. 오개념 자산 재사용

- `ConceptQuestion.misconception_target`은 새로 만들지 않고, 기존 `misconception` 노드 타입과 노드 상세의 `common_misconceptions`에서 가져와 채운다.

## 완료 기준(DoD)

- `NodeLearningContract`, `ConceptQuestion` 계약이 문서·타입 초안으로 고정된다.
- 하위 호환 전략과 DB 변경 여부가 명시된다.
- 동사-문항유형 정렬 규칙이 적혀 있다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-14
```
