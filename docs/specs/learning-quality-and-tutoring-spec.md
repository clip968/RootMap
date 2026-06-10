# Learning Quality and Tutoring System Specification

## Overview

RootMap을 "AI가 학습 트리를 생성해 주는 프로젝트"에서 "생성된 학습 그래프를 평가하고, 사용자의 이해 상태에 따라 다음 학습 행동을 정하는 튜터 시스템"으로 끌어올리기 위한 spec이다.

현재 RootMap은 주제·문서를 입력받아 선수지식 기반 학습 트리를 생성하고(`generateLearningTree`), 노드별 상세 설명·시각화 블록을 만들고(`lib/services/node-detail.ts`, `lib/visualization`), 자기 평가/퀴즈 기록으로 추천·복습을 계산한다(`lib/recommendation`, `lib/learning`). 기능 골격은 갖춰져 있으나, "결과물이 조금 아쉽다"는 느낌의 원인을 측정 가능한 형태로 분리하지 못한다. 그 결과 개선이 프롬프트 감각 튜닝에 머문다.

이 spec의 핵심 주장은 다음과 같다.

> 품질을 측정할 수 없으면 품질을 개선할 수 없다. 따라서 가장 먼저 평가 레이어를 붙이고, 그 위에서 그래프 의미·노드 학습 계약·학습 세션·문서 근거성을 차례로 강화한다.

이 문서는 권위 있는 출처(authoritative source)이며, 구체 구현 단계는 `docs/plans/` 하위 Phase README로 분해해 진행한다.

---

## Problem Statement

RootMap 결과물이 아쉽게 느껴지는 원인은 대부분 아래 네 가지 중 하나다. 현재는 이 네 가지를 자동으로 구분할 수 없다.

| 문제 | 증상 | 평가 항목 |
| --- | --- | --- |
| 개념 누락 | 중요한 개념이 트리에 없음 | coverage |
| 잘못된 선수관계 | 어려운 개념이 먼저 나오거나 원인·결과가 뒤집힘 | prerequisite |
| 학습 행동 부재 | 읽을 수는 있는데 무엇을 하면 되는지 모름 | pedagogy |
| 얕은 퀴즈 | 정의 암기만 묻고 실제 이해를 점검하지 못함 | assessment |

추가로 공부 흐름 자체가 "트리를 보고 사용자가 알아서 읽는" 수동 구조라 학습 효과가 회상(retrieval) 기반으로 이어지지 못한다. 문서 기반 모드는 업로드와 처리가 분리되어 있어 근거성(어떤 설명이 문서 어디에서 왔는가)을 보장하지 못한다.

---

## Current Baseline (코드 기준)

이 spec은 새 시스템을 처음부터 만드는 것이 아니라 아래 기존 자산 위에 평가·계약·세션 레이어를 얹는다.

- 트리 도출: `apps/web/src/lib/tree/concept-graph.ts`의 `deriveLearningGraphView`가 `prerequisites`로 depth·children·community·`recommended_order`를 도출한다. cycle은 `deriveDepths`에서 throw하고, `graph-quality.ts`의 `detectPrerequisiteCycles`가 사이클을 배열로 반환한다.
- 품질 가드: `apps/web/src/lib/llm/schemas.ts`의 `learningTreeQualityWarnings`는 노드 수·타입 분포·`recommended_order` 정합성을 검사하지만 `string[]` 경고만 반환하고 **점수가 없다**. `nodeDetailQualityWarnings`도 동일하게 경고 문자열만 만든다.
- 관계 타입: `apps/web/src/types/learning.ts`의 `ConceptRelationType`은 `prerequisite | part_of | related | misconception_of | example_of | application_of`를 이미 정의한다. `LlmConceptEdge`는 `{ from, to, relation_type, reason? }` 구조다.
- 노드 상세: `NodeDetailResponse`는 `why_it_matters`, `easy_explanation`, `analogy`, `example`, `common_misconceptions`, `check_questions`, `next_nodes`, `visual_decision`, `visual_blocks`를 가진다. **`learning_objective`와 `mastery_evidence`는 아직 없다.**
- 숙련도: `apps/web/src/lib/learning/mastery.ts`의 `convertScoreToStatus`가 `>=0.75 known`, `>=0.4 partial`, 그 외 `unknown`을 적용한다.
- 복습 스케줄: `apps/web/src/lib/learning/fsrs-lite.ts`의 `scheduleFsrsLiteReview`가 `again|hard|good|easy` grade를 `memory_stability`, `memory_difficulty`, `review_due_at`로 변환한다(`scheduler_version: "rule_v1"`).
- 복습 우선순위: `apps/web/src/lib/recommendation/review-priority.ts`의 `calculateReviewPriorityScore`가 confidence(0.4)·recency(0.2)·quizError(0.2)·prerequisiteImportance(0.15)·overdue(0.15)·retrievability(0.1) 가중합을 사용한다.
- 시각화: `apps/web/src/lib/visualization/visual-block-schema.ts`가 `linear_space, mapping_table, flow_pipeline, timeline, layer_stack, tree_graph, state_machine, compare_matrix` 8종을 zod로 정의하고 내부 참조 무결성을 `superRefine`으로 검증한다. **`worked_example`은 아직 없다.**
- 근거 평가: `apps/web/src/lib/evaluation/evidence-grounding.ts`의 `evaluateEvidenceGrounding`가 claim/evidence 어휘 겹침 기반 `groundedness_score`와 `unsupported_rate_by_source_type`을 계산한다(LLM judge 아님).
- 테스트: 정식 러너(Vitest/Playwright)는 없고 `scripts/phase6-test-harness.ts`가 `unit|integration|e2e|llm-eval|quality` 버킷을 커스텀 하니스로 실행한다. `package.json`에 `test:unit`, `test:integration`, `test:e2e`, `test:llm-eval` 스크립트가 이미 있다.

---

## Goals / Non-Goals

### Goals

1. 트리·노드·문서 결과물에 대해 **자동 측정 가능한 품질 점수**를 만든다.
2. edge를 단순 위상 관계가 아니라 **설명·확신도·blocking 여부를 가진 학습 관계**로 강화한다.
3. 각 노드에 **학습 목표(learning_objective)와 숙달 증거(mastery_evidence)** 를 부여한다.
4. "읽기" 중심 흐름을 **diagnose → learn → retrieve → feedback → review 학습 세션**으로 바꾼다.
5. 문서 기반 노드에 **source span 근거성**과 **RAG 평가 지표**를 붙인다.
6. 퀴즈를 노드 타입이 아니라 **mastery evidence 검증 도구**로 재정의한다.
7. 커스텀 smoke를 **정식 eval/CI 구조**로 확장한다.

### Non-Goals

- 딥러닝 기반 knowledge tracing(DKT) 도입. 본 spec은 설명 가능한 rule-based 모델만 다룬다.
- 전체 Bloom taxonomy 구현. 초기에는 `define, explain, apply, compare, debug` 수준의 단순 동사 체계만 사용한다.
- 스캔본 PDF용 OCR 파이프라인. 단기적으로는 "스캔본 감지 → 안내 → 텍스트 PDF/TXT/MD 재요청"으로 처리한다.
- 공개 API·DB 스키마·라우트·인증·환경 변수의 임의 변경. 스키마 확장이 필요하면 migration과 plan 문서 승인 후 진행한다(`AGENTS.md` 운영 지침).

---

## Section 1. 품질 평가 시스템 (최우선)

### 1.1 목적

결과가 아쉬울 때 원인이 프롬프트인지, 모델인지, 그래프 정렬인지, 문서 추출인지 분리한다. eval 레이어가 없으면 모든 개선이 감으로 흐른다. 이 시스템이 붙으면 "감으로 좋아졌다"가 아니라 "Transformer fixture에서 prerequisite score가 0.62 → 0.81로 올랐다"처럼 말할 수 있다.

### 1.2 골든 픽스처

`apps/web/evals/fixtures/topics/` 아래에 사람이 만든 골든 주제를 둔다. 초기 목표는 CS 주제 10개, 확장 목표는 20개다.

권장 초기 주제:

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

각 주제는 다음 픽스처 타입을 따른다.

```ts
type TreeEvalFixture = {
  topic: string;
  expected_concepts: string[];
  required_edges: Array<{ from: string; to: string; reason: string }>;
  forbidden_edges: Array<{ from: string; to: string; reason: string }>;
  beginner_misconceptions: string[];
  required_examples: string[];
};
```

### 1.3 평가 결과 스키마

생성 결과에 대해 다음 점수를 낸다. 모든 점수는 0~1로 정규화한다(`clampScore` 규약과 일치).

```ts
type TreeEvalResult = {
  coverage_score: number;        // 핵심 개념이 빠지지 않았는가
  prerequisite_score: number;    // 선수관계 방향이 맞는가
  pedagogy_score: number;        // 학습 목표·예시·오개념·퀴즈가 유효한가
  ordering_score: number;        // recommended_order가 위상정렬 관점에서 자연스러운가
  detail_score: number;          // 노드 상세 설명이 자기완결적인가
  failures: Array<{
    severity: "error" | "warn";
    code: string;
    node_id?: string;
    message: string;
  }>;
};
```

### 1.4 채점 규칙 (rule-based, LLM judge 아님)

초기 채점은 비용 없이 CI에서 돌 수 있도록 결정적 규칙으로 구현한다. `evaluateEvidenceGrounding`의 어휘 겹침 방식과 동일한 철학이다.

- `coverage_score`: `expected_concepts` 중 생성 노드 title/alias에 매칭된 비율. 매칭은 `lib/concepts/normalize.ts`의 정규화를 재사용한다.
- `prerequisite_score`: `required_edges`가 존재하고 `forbidden_edges`가 없을수록 높다. 방향이 뒤집힌 edge는 `error` failure로 기록한다.
- `ordering_score`: `recommended_order`가 `deriveLearningGraphView`의 depth 위상 순서를 위반하지 않는 비율. 선수 노드가 후행 노드보다 뒤에 오면 감점한다.
- `pedagogy_score`: 각 노드에 `learning_objective`/`mastery_evidence`/유효 퀴즈가 있는 비율(Section 3·6 의존).
- `detail_score`: 상세 설명이 외부 참조 없이 자기완결적인지에 대한 휴리스틱(길이·필수 섹션 존재·미해결 placeholder 부재).

### 1.5 기존 코드와의 연결

- `learningTreeQualityWarnings`(`schemas.ts`)를 폐기하지 않고, 그 경고를 `TreeEvalResult.failures`의 `warn` 항목으로 흡수한다. 즉 경고 → 구조화된 실패 목록으로 승격한다.
- 신규 모듈 위치 제안: `apps/web/src/lib/evaluation/tree-eval.ts` (`evaluateLearningTree(tree, fixture): TreeEvalResult`).
- 실행 스크립트: `npm run eval:tree`(신규) → `scripts/eval-tree.ts`가 픽스처를 순회하며 점수표를 출력한다.

### 1.6 Acceptance Criteria

- [ ] `apps/web/evals/fixtures/topics/`에 최소 10개 주제 픽스처가 존재한다.
- [ ] `evaluateLearningTree`가 `TreeEvalResult`를 반환하고 5개 점수가 모두 0~1이다.
- [ ] `learningTreeQualityWarnings`의 모든 경고가 `failures`로 흡수된다(중복 경로 제거).
- [ ] `npm run eval:tree`가 픽스처별 점수표와 전체 평균을 출력한다.
- [ ] 점수 산출은 LLM 호출 없이 결정적으로 동작한다(CI 무비용).

---

## Section 2. 트리를 "계층도"에서 "학습 그래프"로

### 2.1 목적

개념 지도(concept map)는 단순 계층도가 아니라 개념 사이 관계를 박스·화살표·연결 문구로 표현한다. RootMap은 이미 `ConceptRelationType`(prerequisite, part_of, related, misconception_of, example_of, application_of)을 가진다. 개선 방향은 "트리를 더 화려하게"가 아니라 **edge의 의미를 더 똑똑하게** 만드는 것이다.

현재 `deriveLearningGraphView`는 `prerequisites` 배열만으로 depth·children을 계산한다. 이 구조는 안정적이지만, 한 개념이 여러 개념의 전제이거나 서로 다른 community를 가로지르는 cross-link를 표현하지 못한다.

### 2.2 edge 품질 필드

`LlmConceptEdge`(현재 `{ from, to, relation_type, reason? }`)를 확장한 학습 edge 품질 타입을 도입한다.

```ts
type LearningEdgeQuality = {
  from: string;
  to: string;
  relation_type: "prerequisite" | "part_of" | "related" | "misconception_of";
  explanation: string;          // 왜 이 관계인가
  confidence: number;           // LLM 또는 evaluator의 확신도 (0~1)
  is_blocking: boolean;         // 이걸 모르면 다음 개념 이해가 막히는가
};
```

- `explanation`은 기존 `reason`을 필수화·구체화한 것이다.
- `is_blocking=true`인 prerequisite는 Section 4 학습 세션에서 다음 노드 unlock 게이트로 사용한다.
- `confidence`는 Section 1의 `prerequisite_score` 채점과 Section 2.4 edge repair의 입력이 된다.

### 2.3 UI 동작

edge에 마우스를 올리면 관계 근거를 보여준다.

```text
"페이지 테이블" → "가상 주소 변환"
이유: 가상 주소를 물리 주소로 바꾸려면 page number를 page table에서 조회하는 과정을 알아야 함.
```

이로써 사용자는 노드 목록이 아니라 "왜 이 순서로 공부해야 하는지"를 이해한다.

### 2.4 그래프 품질 보강 (edge repair)

`graph-quality.ts`에 다음을 추가한다.

- transitive reduction: 중복 prerequisite(A→B, B→C, A→C에서 A→C)를 약화/제거해 시각 복잡도를 낮춘다.
- cross-community link 식별: community를 가로지르는 `related`/`application_of` edge를 별도 표시한다.
- cycle repair 제안: `detectPrerequisiteCycles` 결과에 대해 `confidence`가 가장 낮은 edge를 끊는 후보를 제시한다(자동 적용은 하지 않고 failure로 보고).

### 2.5 Acceptance Criteria

- [ ] LLM 트리 출력 edge가 `explanation`(필수)·`confidence`·`is_blocking`을 포함한다.
- [ ] `deriveLearningGraphView`가 prerequisite 외 관계도 보존해 뷰에 전달한다(기존 depth 계산은 prerequisite만 사용해 하위 호환 유지).
- [ ] edge hover 시 관계 근거가 노출된다.
- [ ] transitive reduction과 cross-community link 식별이 `graph-quality.ts`에 구현되고 smoke로 검증된다.
- [ ] 사이클이 있으면 `TreeEvalResult.failures`에 `error`로 기록되고 끊을 edge 후보가 제시된다.

---

## Section 3. 노드 "학습 목표"와 "숙달 증거"

### 3.1 목적

현재 노드 상세(`NodeDetailResponse`)는 왜 중요한지·쉬운 설명·예시·오개념·이해 점검·다음 학습을 생성한다. 구조는 좋지만 "읽은 다음 무엇을 할 수 있어야 하는가"가 빠져 공부 과정이 애매하다.

### 3.2 노드 학습 계약 필드

각 노드에 다음을 추가한다.

```ts
type NodeLearningContract = {
  learning_objective: string;
  mastery_evidence: string[];
};
```

예시:

```json
{
  "node_id": "page_table",
  "learning_objective": "가상 주소가 페이지 번호와 오프셋으로 나뉘고, 페이지 테이블을 통해 물리 주소로 변환되는 과정을 설명할 수 있다.",
  "mastery_evidence": [
    "주어진 가상 주소를 page number와 offset으로 나눌 수 있다.",
    "TLB miss가 발생했을 때 page table lookup이 왜 필요한지 설명할 수 있다.",
    "page fault와 TLB miss를 구분할 수 있다."
  ]
}
```

### 3.3 동사 체계

처음부터 전체 Bloom taxonomy를 구현하지 않는다. `learning_objective`는 다음 동사 중 하나로 시작하도록 프롬프트를 제약한다.

```text
define, explain, apply, compare, debug
```

이 동사는 Section 6 퀴즈 타입(`recall | apply | compare | trace | debug`)과 정렬되어, 목표와 검증 도구가 1:1로 대응한다.

### 3.4 통합 지점

- 타입: `NodeDetailResponse`(`types/learning.ts`)와 LLM 스키마(`lib/llm/schemas.ts`)에 `learning_objective`, `mastery_evidence`를 추가한다.
- 프롬프트: `lib/llm/prompts.ts`의 노드 상세 프롬프트를 "설명 생성" 중심에서 "학습 목표 + 검증 가능한 숙달 증거 생성" 중심으로 바꾼다.
- 생성 서비스: `lib/services/node-detail.ts`가 새 필드를 채우고 저장한다.
- 가드: `nodeDetailQualityWarnings`에 "learning_objective가 허용 동사로 시작" / "mastery_evidence가 1개 이상" 검사를 추가하고, Section 1의 `pedagogy_score`/`detail_score`가 이를 반영한다.

이 단계가 끝나면 RootMap은 "읽을거리 생성기"에서 "공부 단위 생성기"로 바뀐다.

### 3.5 Acceptance Criteria

- [ ] `NodeDetailResponse`와 문서 노드 상세 타입에 `learning_objective`, `mastery_evidence`가 추가된다.
- [ ] LLM 스키마가 두 필드를 검증하고, `learning_objective`가 허용 동사로 시작한다.
- [ ] 노드 상세 프롬프트가 학습 목표·숙달 증거를 생성하도록 갱신된다.
- [ ] `nodeDetailQualityWarnings`가 두 필드 누락을 경고로 잡는다.
- [ ] 기존에 생성된(필드 없는) 노드 상세도 화면이 깨지지 않는다(optional 처리·점진 마이그레이션).

---

## Section 4. 공부 흐름을 "읽기"에서 "회상 연습"으로

### 4.1 목적

공부가 애매한 가장 큰 이유는 사용자가 트리를 본 뒤 알아서 공부해야 하기 때문이다. retrieval practice(testing effect)는 단순 재읽기보다 장기 보존에 유리하고, spaced repetition은 어려운 항목을 더 자주 보여 준다. RootMap은 다음 루프를 강제해야 한다.

```text
진단 질문
  ↓
오늘의 추천 노드 선택
  ↓
짧은 설명
  ↓
회상 질문
  ↓
답변/피드백
  ↓
복습 예약
  ↓
다음 노드 unlock
```

### 4.2 기존 자산 재사용

새 시스템을 크게 만들 필요는 없다. 다음이 이미 존재한다.

- mastery 상태(`known/partial/unknown`)와 confidence, `convertScoreToStatus`(≥0.75/≥0.4).
- FSRS-lite(`scheduleFsrsLiteReview`): `again|hard|good|easy` → stability/difficulty/due.
- 복습 우선순위(`calculateReviewPriorityScore`): confidence·recency·quizError·prerequisiteImportance·overdue·retrievability 가중합.
- 세션/이벤트 저장소(`learning-session-repository.ts`, `api/sessions`, `api/events`).

학습 세션은 이 위에 얇게 얹는다.

### 4.3 세션 스텝 모델

```ts
type StudySessionStep =
  | { type: "diagnostic"; node_id: string; question_id: string }
  | { type: "explain"; node_id: string }
  | { type: "retrieval"; node_id: string; question_id: string }
  | { type: "feedback"; node_id: string; result: "correct" | "wrong" | "partial" }
  | { type: "schedule_review"; node_id: string };
```

- `feedback`의 `result`는 `gradeForQuizResult`/`gradeForSelfAssessment`를 통해 FSRS-lite grade로 매핑한다.
- `schedule_review`는 `scheduleFsrsLiteReview` 결과를 mastery row에 반영한다.
- 다음 노드 unlock 게이트는 Section 2의 `is_blocking` prerequisite이 충족됐는지로 판정한다.

### 4.4 문항 시도 기록

추천 품질을 높이기 위해 실제 문항 시도를 더 풍부하게 기록한다.

```ts
type QuestionAttempt = {
  node_id: string;
  question_id: string;
  is_correct: boolean;
  self_confidence: number;   // 0~1
  response_time_ms: number;
  hint_used: boolean;
  created_at: string;
};
```

기존 `quiz_attempts` 테이블을 확장하거나 인접 테이블을 추가한다(스키마 변경이므로 migration·plan 승인 필요). `calculateReviewPriorityScore`의 입력에 이 기록을 더 반영한다.

### 4.5 추천 모델 방침

딥러닝 기반 knowledge tracing은 성능은 좋을 수 있으나 해석 가능성이 떨어진다. 프로젝트 규모상 BKT 전체 구현보다 **"정답률 + confidence + 최근성 + prerequisite gap"의 설명 가능한 rule-based 모델**이 적절하다. 이는 현재 `review-priority.ts`/`personalized.ts` 철학과 일치한다.

### 4.6 UI: "오늘의 15분 학습"

트리 전체 보기와 별개로 집중 학습 모드를 만든다.

```text
1. 먼저 풀어볼 진단 질문 2개
2. 추천 노드 1개
3. 짧은 설명
4. 회상 질문
5. 결과에 따른 복습 예약
```

### 4.7 Acceptance Criteria

- [ ] `StudySessionStep` 흐름을 구동하는 세션 서비스가 추가된다.
- [ ] `feedback` 결과가 FSRS-lite grade로 매핑되어 `review_due_at`를 갱신한다.
- [ ] `is_blocking` prerequisite 미충족 노드는 unlock되지 않는다.
- [ ] 문항 시도 기록이 저장되고 복습 우선순위 계산에 반영된다.
- [ ] "오늘의 15분 학습" 진입점이 트리 보기와 분리되어 제공된다.

---

## Section 5. 문서 기반 모드의 "근거성" 강화

### 5.1 목적

PDF 기반 트리는 업로드(Vercel)와 처리(별도 runner)가 분리되어 있다. 문서 모드 완성도는 "근거성"으로 결정된다. 즉 "이 설명은 문서 어디에서 왔는가?"에 답할 수 있어야 한다.

### 5.2 source span 부착

모든 문서 기반 노드에 source span을 붙인다. 현재 `ApiLearningNode.document_context.evidence`(`page_start`, `page_end`, `section_title`, `snippet`)가 있으나, 노드 단위 근거를 명시적 타입으로 강화한다.

```ts
type DocumentGrounding = {
  node_id: string;
  source_spans: Array<{
    document_id: string;
    chunk_id: string;
    page_start?: number;
    page_end?: number;
    quote: string;
    support_type: "direct" | "inferred";
  }>;
};
```

`support_type`은 기존 `DocumentSourceType`(`explicit | inferred | generated`)과 정합되게 매핑한다.

### 5.3 근거 있는 주장 vs 보강 설명 분리

상세 설명과 퀴즈를 두 종류로 분리해 표시한다.

```text
문서에 직접 등장:   페이지 교체 알고리즘의 목적
RootMap이 보강한 설명: LRU와 Clock 알고리즘의 직관적 차이
```

UI는 "문서 근거" 배지와 "AI 보강" 배지를 구분한다. citation이 달렸다고 모델이 실제로 그 근거를 사용했다는 보장은 없으므로 citation correctness와 citation faithfulness를 분리해서 본다.

### 5.4 RAG 평가 지표

`evaluateEvidenceGrounding`(현재 어휘 겹침 기반)을 확장해 문서 트리 전용 평가를 추가한다.

```ts
type DocumentEvalResult = {
  context_precision: number;   // 가져온 chunk가 정말 관련 있는가
  context_recall: number;      // 필요한 근거를 빠뜨리지 않았는가
  faithfulness: number;        // 생성 설명이 source span에 의해 지지되는가
  unsupported_claims: string[];
  source_span_errors: string[];
};
```

- `faithfulness`는 기존 `groundedness_score`를 일반화한다.
- 실행 스크립트: `npm run eval:document`(신규) → `scripts/eval-document.ts`. 비용 문제로 LLM judge는 수동/nightly로만 돌린다(`docs/llm-evaluation.md`의 Small CI Eval vs Full Eval 정책과 일치).

### 5.5 스캔본·표·그림 처리

스캔본 PDF나 표·그림이 많은 문서는 일반 텍스트 추출만으로 품질이 떨어진다. 단기적으로 OCR을 바로 붙이지 않고 다음으로 처리한다.

```text
스캔본 감지 → 텍스트 추출 불가 안내 → TXT/MD 또는 검색 가능한 PDF 요청
```

이는 README의 "스캔본 PDF는 실패" 안내와 일치하며, `extract-pdf.ts`/`extract-text.ts` 단계에서 추출 텍스트량이 임계 이하이면 명시적 사용자 안내로 종료한다.

### 5.6 Acceptance Criteria

- [ ] 문서 기반 노드가 `DocumentGrounding`(source span + support_type)을 가진다.
- [ ] UI가 "문서 근거"와 "AI 보강 설명"을 시각적으로 구분한다.
- [ ] `DocumentEvalResult`를 산출하는 평가가 추가되고 `npm run eval:document`로 실행된다.
- [ ] 텍스트 추출량이 임계 이하인 문서는 명확한 안내와 함께 실패 처리된다.
- [ ] citation correctness와 faithfulness를 분리해 보고한다.

---

## Section 6. 퀴즈를 "이해 점검"답게 강화

### 6.1 목적

현재 RootMap은 `quiz` 노드 타입과 `check_questions`를 만들지만, LLM 생성 퀴즈는 정의 확인에 머무를 위험이 크다. 퀴즈를 **노드 타입이 아니라 각 개념의 mastery evidence를 검증하는 도구**로 본다.

### 6.2 좋은 CS 문항 유형

| 유형 | 예시 |
| --- | --- |
| 구분 | "TLB miss와 page fault의 차이는?" |
| 적용 | "가상 주소 0x1234, page size 4KB일 때 page number와 offset은?" |
| 추적 | "이 코드에서 borrow checker가 에러를 내는 지점은?" |
| 반례 | "왜 이 설명은 race condition을 deadlock과 혼동하는가?" |
| 디버깅 | "이 SQL 트랜잭션에서 lost update가 생기는 이유는?" |

### 6.3 문항 스키마

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

- `type`은 Section 3의 동사 체계(`define→recall`, `explain→recall/compare`, `apply→apply`, `compare→compare`, `debug→debug/trace`)와 정렬한다.
- `misconception_target`은 기존 `misconception` 노드 타입과 `common_misconceptions`를 재사용해 채운다.

### 6.4 오개념 기반 문항

오개념 기반 distractor가 핵심이다. RootMap은 이미 `misconception` 노드 타입과 노드 상세의 `common_misconceptions`를 가지므로, 이를 객관식 distractor나 피드백 생성에 재사용한다. 이렇게 하면 결과물이 단순 설명이 아니라 학습 도구처럼 느껴진다.

### 6.5 통합 지점

- 타입/스키마: `ConceptQuestion`을 LLM 스키마에 추가하고 `check_questions`를 점진적으로 대체/보강한다.
- 채점: `lib/learning/quiz.ts`가 `rubric` 기반 채점과 `QuestionAttempt`(Section 4.4) 기록을 연결한다.
- eval: `npm run eval:quiz`(신규) → distractor 품질·유형 분포·mastery_evidence 커버리지를 점검한다.

### 6.6 Acceptance Criteria

- [ ] `ConceptQuestion` 스키마가 도입되고 5개 유형을 검증한다.
- [ ] 각 노드 퀴즈가 해당 노드의 `mastery_evidence`를 최소 1개 이상 검증한다.
- [ ] `misconception_target`이 기존 오개념 자산과 연결된다.
- [ ] `npm run eval:quiz`가 유형 분포와 정의-암기 편중을 보고한다.

---

## Section 7. 시각화: "종류 추가"보다 "개념별 worked example"

### 7.1 목적

현재 visual block 8종(`linear_space, mapping_table, flow_pipeline, timeline, layer_stack, tree_graph, state_machine, compare_matrix`)은 잘 잡혀 있고 내부 참조 검증(`visual-block-schema.ts`의 `superRefine`)도 있다. 다음 단계는 타입을 무작정 늘리는 것이 아니라 **CS 개념에 특화된 worked example**을 추가하는 것이다.

### 7.2 개념-시각화 매핑 가이드

```text
가상 메모리            → linear_space + mapping_table
Rust lifetime          → timeline + state_machine
Transformer attention  → flow_pipeline + mapping_table
B-tree index           → tree_graph + worked_example(trace table)
TCP congestion control → timeline + state_machine
```

### 7.3 worked_example 블록 추가

추가할 블록은 하나다.

```ts
type WorkedExampleBlock = {
  type: "worked_example";
  title: string;
  problem: string;
  steps: Array<{
    label: string;
    explanation: string;
    intermediate_value?: string;
  }>;
  final_answer: string;
  common_mistake?: string;
};
```

- `VISUAL_BLOCK_TYPES`와 `visualDecisionSchema.skill` enum에 `worked_example`을 추가하고, 기존 8종처럼 zod 스키마와 `superRefine` 무결성 검사를 둔다.
- 렌더러: `components/visual-blocks/worked-example-diagram.tsx`를 추가하고 `visual-block-renderer.tsx`에 등록한다.
- `hasRequiredNodeDetailVisual`의 decision-skill 일치 규칙을 그대로 따른다.

이 블록은 학습 효과가 크다. 사용자가 설명을 읽는 데서 끝나지 않고 "문제가 주어졌을 때 어떻게 푸는지"를 단계별로 본다. `common_mistake`는 Section 6의 오개념 자산과 연결한다.

### 7.4 Acceptance Criteria

- [ ] `worked_example`이 `VISUAL_BLOCK_TYPES`·decision skill enum·zod 스키마에 추가된다.
- [ ] worked_example 렌더러가 추가되고 renderer에 등록된다.
- [ ] decision.skill과 block.type 일치 규칙이 worked_example에도 적용된다.
- [ ] `phase7:visual-block-schema` 계열 smoke가 새 타입을 커버한다.

---

## Section 8. 테스트: smoke에서 formal eval/CI로

### 8.1 현재 상태

`package.json`에는 문서 처리, LLM 파싱, phase별 smoke, graph-quality, visual-detail smoke 등 많은 스크립트가 있고 `scripts/phase6-test-harness.ts`가 `unit|integration|e2e|llm-eval|quality` 버킷을 제공한다. 다만 Vitest/Playwright 같은 정식 러너는 없고 custom harness 중심이다.

### 8.2 목표 디렉터리 구조

```text
tests/
  unit/
    concept-graph.test.ts
    mastery.test.ts
    fsrs-lite.test.ts
    recommendation.test.ts
  integration/
    generate-tree-route.test.ts
    document-pipeline.test.ts
  e2e/
    create-topic-tree.spec.ts
    upload-document.spec.ts
  evals/
    tree-quality.eval.ts
    document-grounding.eval.ts
    quiz-quality.eval.ts
```

기존 `phase6-test-harness.ts` 버킷을 유지하면서, 순수 로직(`concept-graph`, `mastery`, `fsrs-lite`, `review-priority`)부터 정식 단위 테스트로 옮긴다. 러너 도입(예: Vitest)은 별도 plan에서 결정한다.

### 8.3 CI 분리

```yaml
lint-build:
  npm run check

unit:
  npm run test:unit

integration:
  npm run test:integration

llm-eval-mocked:
  npm run test:llm-eval

e2e:
  npm run test:e2e
```

LLM live eval은 비용·변동성이 있으므로 PR마다 돌리지 않고 수동 또는 nightly workflow로 둔다. 이는 현재 `.github/workflows/process-rootmap-document.yml`의 수동 실행 방식과 같은 철학이다.

### 8.4 Acceptance Criteria

- [ ] `tests/unit`에 `concept-graph`, `mastery`, `fsrs-lite`, `recommendation` 테스트가 존재한다.
- [ ] `npm run test:unit|test:integration|test:e2e|test:llm-eval`이 위 구조를 실행한다.
- [ ] LLM live eval은 nightly/수동 workflow로 분리된다.
- [ ] CI가 lint-build / unit / integration / llm-eval-mocked / e2e로 나뉜다.

---

## Section 9. "이 프로젝트로 공부한다" 관점의 학습 순서

RootMap을 개선하면서 함께 학습하기 좋은 순서다.

1. 그래프 알고리즘: prerequisite DAG, cycle detection, topological sort, transitive reduction, community grouping. 이미 `deriveLearningGraphView`에 cycle detection과 depth 계산이 있으므로, 여기에 품질 평가와 edge repair(Section 2)를 붙이면 좋은 소재다.
2. LLM structured generation과 evaluation: RootMap은 JSON schema 기반 생성 앱이므로 "valid JSON"과 "좋은 JSON"이 다르다는 점을 배운다. 구조화 출력 성공률은 모델·프롬프트·스키마 복잡도에 따라 변동이 크다.
3. RAG와 근거성 평가: PDF 기반 트리는 단순 요약보다 어렵다. chunk에서 개념 추출 → 통합 → 트리 → 상세 설명을 거치며 context precision/recall/faithfulness(Section 5)를 붙이면 LLM 앱 개발 경험이 된다.
4. 학습 과학과 adaptive tutoring: 사용자 응답 기록으로 mastery를 업데이트하고 복습 시점을 조정하면 intelligent tutoring system에 가까워진다(Section 4).

---

## Section 10. 4주 개선 로드맵

### 1주차 — 품질 평가 기반 만들기 (Section 1)

`evals/fixtures`를 만들고 CS 주제 10개에 expected concepts와 required prerequisite edges를 수동 작성한다. `npm run eval:tree`를 추가한다. 목표는 "좋은 결과를 자동으로 측정할 수 있다". 이게 없으면 이후 개선이 전부 감으로 흐른다.

### 2주차 — 노드 스키마 개선 (Section 3·6)

각 노드에 `learning_objective`, `mastery_evidence`, question bank를 추가한다. 프롬프트를 "설명 생성"에서 "학습 목표와 검증 가능한 숙달 증거 생성"으로 바꾼다. 이 단계가 끝나면 RootMap은 "읽을거리 생성기"에서 "공부 단위 생성기"로 바뀐다.

### 3주차 — 학습 세션 UI 추가 (Section 4)

트리 전체 보기와 별개로 "오늘의 15분 학습" 모드를 만든다(진단 2문항 → 추천 노드 1개 → 짧은 설명 → 회상 질문 → 복습 예약). 기존 mastery, review priority, FSRS-lite를 재사용한다.

### 4주차 — 문서 근거성 강화 (Section 5)

문서 기반 노드와 상세 설명에 source span을 붙이고 document eval을 추가한다. "이 설명은 문서 어디에서 왔는가?"를 보여줄 수 있으면 신뢰도가 크게 오른다. 동시에 근거 없는 설명을 경고하거나 "문서 근거 없음 / AI 보강 설명"으로 분리 표시한다.

---

## Section 11. 최종 우선순위

가장 먼저 할 일은 다음 세 가지다.

1. `learningTreeQualityWarnings`를 단순 경고에서 `TreeEvalResult` 기반 품질 점수로 확장한다. (Section 1)
2. 각 노드에 `learning_objective`, `mastery_evidence`, question bank를 추가한다. (Section 3·6)
3. "트리 보기"와 별개로 diagnose → learn → retrieve → feedback → review 학습 세션을 만든다. (Section 4)

이 세 가지를 하면 RootMap의 성격이 바뀐다. 지금은 "AI가 학습 트리를 생성해 주는 프로젝트"에 가깝다면, 개선 후에는 "생성된 학습 그래프를 평가하고, 사용자의 이해 상태에 따라 다음 학습 행동을 정하는 튜터 시스템"에 가까워진다.

---

## Constraints

- `AGENTS.md` 운영 지침을 따른다: 작은 diff 우선, 불필요한 새 파일 생성 금지, 공개 API·DB 스키마·라우트·인증·환경 변수는 승인 없이 변경하지 않는다. 스키마 확장(예: `QuestionAttempt`, `learning_objective` 컬럼)은 migration과 plan 승인 후 진행한다.
- 모든 점수는 0~1로 정규화하고 기존 `clampScore` 규약을 따른다.
- eval의 기본 채점은 LLM 호출 없는 결정적 규칙으로 구현해 CI 무비용을 유지한다. LLM judge는 수동/nightly로만 실행한다(`docs/llm-evaluation.md` 정책).
- 기존 트리/노드 상세와의 하위 호환을 유지한다. 신규 필드는 optional로 추가하고 점진 마이그레이션한다.
- 모든 신규 코드에는 사용자가 이해할 수 있는 세부 주석을 단다(`AGENTS.md`).
- 본 spec은 권위 있는 출처이며, 구현 단계는 `docs/plans/` 하위 Phase로 분해해 체크리스트로 관리한다.

## Acceptance Criteria (상위 요약)

- [ ] Section 1: 골든 픽스처 + `TreeEvalResult` + `npm run eval:tree`가 동작한다.
- [ ] Section 2: edge가 `explanation/confidence/is_blocking`을 갖고 근거가 UI에 노출된다.
- [ ] Section 3: 노드에 `learning_objective`/`mastery_evidence`가 추가된다.
- [ ] Section 4: diagnose→learn→retrieve→feedback→review 세션이 동작한다.
- [ ] Section 5: 문서 노드 source span + `DocumentEvalResult`가 추가된다.
- [ ] Section 6: `ConceptQuestion`이 mastery evidence를 검증한다.
- [ ] Section 7: `worked_example` visual block이 추가된다.
- [ ] Section 8: unit/integration/e2e/eval CI 분리가 완료된다.
