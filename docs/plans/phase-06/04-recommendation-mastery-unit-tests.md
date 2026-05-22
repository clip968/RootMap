# 04. 추천·Mastery·Review Priority Unit Test

## 목표

추천 점수, mastery 갱신, review priority 계산처럼 제품 품질에 직접 영향을 주는 순수 함수를 unit test로 고정한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 6.3 Unit test 대상
- `rootmap_phase_5_spec.md` 6.8 설명 가능한 개인화 UI
- Phase 4 `05-personalized-recommendations-and-tree-api.md`
- Phase 4 `07-review-due-and-priority.md`

## 구현 작업

### 1. Recommendation score tests

- confidence가 낮을수록 추천 점수가 올라가는지 검증한다.
- wrong count가 증가하면 quiz error score가 올라가는지 검증한다.
- mastered prerequisite은 다시 추천되지 않는지 검증한다.
- unmet prerequisite이 있으면 core node보다 prerequisite이 먼저 추천되는지 검증한다.
- 같은 score면 title 또는 stable id 기준으로 deterministic 정렬되는지 검증한다.

### 2. Mastery update tests

- 정답은 confidence와 correct count를 올린다.
- 오답은 confidence를 낮추고 wrong count를 올린다.
- 자기평가 `known`, `partial`, `unknown`이 confidence range와 일관되게 반영되는지 검증한다.
- mastery update가 다른 user의 row에 영향을 주지 않는지 service-level test와 연결한다.

### 3. Review priority tests

- 낮은 confidence는 review priority를 올린다.
- 오래된 `last_studied_at` 또는 overdue 상태는 review priority를 올린다.
- `review_due_at`이 지난 concept은 due date가 남은 concept보다 먼저 온다.
- retrievability가 낮을수록 review priority가 올라간다.

### 4. Reason generation tests

- 실제 점수에 기여한 항목만 추천 이유에 표시한다.
- confidence, quiz error, due date, prerequisite reason이 각각 독립적으로 생성되는지 검증한다.
- 이유가 없는 fallback 문장만 반복되지 않게 한다.

## 완료 기준(DoD)

- 추천·mastery·review priority 핵심 순수 함수에 unit test가 있다.
- 모든 test case가 deterministic하게 통과한다.
- 추천 이유가 점수 구성 요소와 일치한다.
- 검증 명령: `npm run test:unit -- recommendation mastery review-priority` (`apps/web`에서 실행)
