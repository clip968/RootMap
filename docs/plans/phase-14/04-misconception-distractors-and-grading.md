# 04. 오개념 Distractor와 Rubric 채점

## 목표

기존 오개념 자산(`misconception` 노드, `common_misconceptions`)을 객관식 distractor·피드백에 재사용하고, `rubric` 기반 채점을 `quiz.ts`에 연결한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 6.4·6.5

## 관련 파일

- `apps/web/src/lib/learning/quiz.ts`
- `apps/web/src/db/schema.ts` (`misconceptionEvents`, `quizAttempts`)
- `apps/web/src/app/api/quizzes/attempts/route.ts`
- `apps/web/src/lib/llm/prompts.ts`

## 구현 작업

### 1. 오개념 distractor 생성

- `misconception_target`이 있는 `ConceptQuestion`은 해당 오개념을 객관식 오답(distractor)으로 사용한다.
- distractor 출처를 기존 `misconception` 노드/`common_misconceptions`에서 가져온다(새로 만들지 않음).

### 2. rubric 채점

- `quiz.ts`가 `rubric` 항목 충족 여부로 부분 점수를 계산한다.
- 오답이 특정 오개념과 일치하면 `misconceptionEvents`에 기록해 피드백·복습에 활용한다.

### 3. 피드백 생성

- 오답 시 어떤 오개념에 빠졌는지 설명하는 피드백을 제공한다.
- 이 피드백은 Phase 15 학습 세션의 `feedback` 스텝에서 재사용된다.

## 완료 기준(DoD)

- `misconception_target` 문항이 기존 오개념 자산으로 distractor를 만든다.
- `rubric` 기반 부분 점수 채점이 동작한다.
- 오개념 일치 오답이 `misconceptionEvents`에 기록된다.

## 검증 명령

```bash
cd apps/web
npm run phase4:quiz-smoke
npm run check
```
