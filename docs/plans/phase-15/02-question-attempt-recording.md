# 02. QuestionAttempt 기록과 스키마 확장

## 목표

실제 문항 시도 기록을 더 풍부하게 저장해 추천 품질을 높인다. 기존 `quizAttempts`를 우선 확장한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4.4

## 관련 파일

- `apps/web/src/db/schema.ts` (`quizAttempts`)
- `apps/web/src/app/api/quizzes/attempts/route.ts`
- `apps/web/src/lib/learning/quiz.ts`
- `apps/web/src/lib/repository/learning-repository.ts`

## 구현 작업

### 1. 기록 필드

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

### 2. 스키마 전략

- 가능한 한 기존 `quizAttempts` 테이블에 누락 컬럼(`self_confidence`, `response_time_ms`, `hint_used`)을 추가한다.
- 컬럼 추가는 Drizzle migration으로 진행하고 plan 승인 후 적용한다(`AGENTS.md`: 스키마 변경 승인 필요).
- 기존 행은 신규 컬럼을 nullable/기본값으로 처리해 회귀를 막는다.

### 3. 기록 경로

- 학습 세션 `feedback` 스텝과 퀴즈 제출 시 `QuestionAttempt`를 저장한다.
- 인증·소유권 경계(Phase 11)를 유지한다.

## 완료 기준(DoD)

- `QuestionAttempt` 필드가 저장된다(`quizAttempts` 확장).
- migration이 plan 승인 후 적용되고 기존 데이터와 호환된다.
- 세션/퀴즈 경로에서 기록이 남는다.

## 검증 명령

```bash
cd apps/web
npm run phase4:quiz-smoke
npm run check
```
