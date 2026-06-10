# 01. StudySessionStep 세션 서비스

## 목표

`StudySessionStep` 흐름(diagnose → learn → retrieve → feedback → review)을 조율하는 세션 서비스와 API를 추가한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4.1·4.3

## 관련 파일

- `apps/web/src/lib/learning/` (신규 `study-session.ts`)
- `apps/web/src/lib/repository/learning-session-repository.ts`
- `apps/web/src/app/api/sessions/**`
- `apps/web/src/lib/recommendation/review-priority.ts`

## 구현 작업

### 1. 세션 서비스

- 세션 시작 시 진단 문항 → 추천 노드 → 설명 → 회상 문항 → 피드백 → 복습 예약 스텝을 순서대로 생성한다.
- 추천 노드는 기존 추천/복습 우선순위(`calculateReviewPriorityScore`)로 고른다.
- 각 스텝 전이는 순수 함수로 결정하고, 부수효과(저장)는 repository 경계에서 처리한다.

### 2. API

- 기존 `api/sessions/start`를 확장하거나 세션 진행 엔드포인트를 추가해 다음 스텝을 반환한다.
- 인증·소유권은 기존 `requireSupabaseAuthUserId` 경계를 따른다(Phase 11 격리 유지).

### 3. 이벤트 기록

- 각 스텝 진행을 `learningEvents`에 기록해 추후 분석/추천에 사용한다.

## 완료 기준(DoD)

- 세션 서비스가 5종 스텝 흐름을 생성·전이한다.
- API가 인증 경계 안에서 다음 스텝을 반환한다.
- 스텝 진행이 `learningEvents`에 기록된다.

## 검증 명령

```bash
cd apps/web
npm run phase4:session-events-smoke
npm run check
```
