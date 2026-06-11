# Learning Science Rationale

RootMap personalization is currently a rule-based MVP.

## Current Model

- Mastery state: `known`, `partial`, `unknown`.
- Confidence score, quiz counts, last studied time, and review need.
- Personalized recommendation score combines prerequisite gap, confidence, quiz error, recency, due date, retrievability, and importance.

## FSRS-lite Rule v1

FSRS-lite is not a full FSRS implementation. It is a deterministic due-date scheduler that stores:

- `review_due_at`
- `memory_stability`
- `memory_difficulty`
- `retrievability`
- `last_review_grade`
- `review_interval_days`
- `scheduler_version`

Positive recall increases stability and lowers difficulty. Failed recall lowers stability, raises difficulty, and schedules review sooner.

## Long-term Direction

Future versions can learn personalized memory parameters from quiz and event history. The long-term goal is mastery prediction, not just fixed rule scoring.

## Phase 14: 노드 학습 계약과 개념 퀴즈 (Section 3·6)

Phase 14는 RootMap을 "읽을거리 생성기"에서 "공부 단위 생성기"로 바꾼다. 각 노드 상세에
"읽은 다음 무엇을 할 수 있어야 하는가"(`learning_objective`)와 "그 증거"(`mastery_evidence`),
그리고 그 증거를 검증하는 개념 문항(`concept_questions`)을 더한다.

### 동사 체계 (5종)

`learning_objective`는 전체 Bloom taxonomy 대신 다음 5개 영문 동사 중 하나로 시작한다.

```text
define, explain, apply, compare, debug
```

표기 규칙은 `"<verb> — <한국어 문장>"`이다. 영문 동사 접두는 (1) 기계가 허용 여부를 검증할 수 있고
(2) UI가 skill 라벨로 쓸 수 있게 한다. 예:

```text
explain — 가상 주소가 페이지 번호와 오프셋으로 나뉘고, 페이지 테이블을 통해 물리 주소로 변환되는 과정을 설명할 수 있다.
```

### ConceptQuestion 유형과 동사 정렬

퀴즈는 노드 타입이 아니라 "각 개념의 `mastery_evidence`를 검증하는 도구"다. 유형은 5종이며
동사 체계와 정렬된다.

| learning_objective 동사 | 우선 ConceptQuestion.type | 허용 보조 type |
| --- | --- | --- |
| define | recall | compare |
| explain | recall | compare, trace |
| apply | apply | trace |
| compare | compare | recall |
| debug | debug | trace |

각 노드 퀴즈는 그 노드의 `mastery_evidence`를 최소 1개 검증해야 한다. `recall`만으로 채워지면
`QUIZ_TYPE_IMBALANCE` 경고가 뜬다.

### 오개념 distractor 재사용

`ConceptQuestion.misconception_target`은 새 오개념을 만들지 않고 기존 자산
(`misconception` 노드 타입, 노드 상세의 `common_misconceptions`)에서 가져온다.
`buildMisconceptionDistractors`(`lib/learning/quiz.ts`)가 이를 객관식 오답으로 구성하고,
`gradeAnswerWithRubric`이 LLM 없이 rubric 어휘 겹침으로 부분 점수와 오개념 일치를 판정한다.
이 결정적 채점은 Phase 15 학습 세션의 feedback 스텝에서 재사용된다.

### 품질 경고와 pedagogy_score

`nodeDetailQualityWarnings`는 다음 code를 추가한다.

- `MISSING_OR_INVALID_OBJECTIVE`: learning_objective 누락/비허용 동사
- `MISSING_MASTERY_EVIDENCE`: mastery_evidence 0개
- `QUIZ_EVIDENCE_GAP`: concept_questions가 mastery_evidence를 검증하지 않음
- `QUIZ_TYPE_IMBALANCE`: recall 편중

Phase 12 `evaluateLearningTree`의 `pedagogy_score`는 노드에 학습 계약 필드가 있으면 그 충족
비율을 점수에 포함하고, 없으면 0으로 깎지 않고 `MISSING_LEARNING_CONTRACT` warn만 남긴 뒤
사용 가능한 신호(quiz/misconception 노드 존재)로 계산한다.

### 저장·하위 호환·점진 마이그레이션

- 신규 필드(`learning_objective`, `mastery_evidence`, `concept_questions`)는 모두 노드 상세
  JSON(`learningNodes.detailJson`) 안에 저장한다. **Phase 14는 DB 컬럼/테이블/migration을 추가하지 않는다.**
- 모든 신규 필드는 optional이다. 필드가 없는 기존 노드 상세는 화면에서 해당 블록
  ("이 노드를 이해했다는 증거")을 숨기고 깨지지 않는다.
- 점진 마이그레이션: 기존 상세는 일괄 변환하지 않는다. 노드 상세를 **재생성**할 때 새 프롬프트가
  자연히 새 필드를 채운다. 그 전까지는 숨김 처리로 하위 호환을 유지한다.
- 기존 `check_questions`(`{question, answer}`)는 제거하지 않고 `concept_questions`와 병존한다.

### baseline 대비 점수

골든 픽스처(`evals/fixtures/topics/`)는 트리 수준 산출물이라 노드 상세의 Phase 14 필드를
담지 않는다. 따라서 `npm run eval:tree`의 `pedag` 평균은 Phase 14 전후로 1.00을 유지한다(회귀 없음).
노드 상세에 학습 계약이 실린 실제 생성물에서는 `pedagogy_score`가 그 충족 비율을 반영한다.
