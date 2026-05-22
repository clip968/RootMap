# 08. 설명 가능한 개인화 추천 UI/API

## 목표

추천 결과를 단순 템플릿 문장이 아니라 실제 사용자 상태, 점수 기여 요인, 다음 행동으로 설명한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 6.8 설명 가능한 개인화 UI
- Phase 4 `05-personalized-recommendations-and-tree-api.md`
- Phase 4 `09-phase4-personalized-ui.md`

## 구현 작업

### 1. Reason payload 확장

- 추천 API 응답에 reason code와 display text를 함께 둔다.
- reason code 후보:
  - `prerequisite_gap`
  - `low_confidence`
  - `quiz_error`
  - `review_overdue`
  - `low_retrievability`
  - `document_importance`
  - `community_path`
- 각 reason에는 실제 점수 입력값을 포함한다.

### 2. Next action 제안

- 추천 노드마다 다음 행동을 1~3개 제안한다.
- 행동 유형은 `review`, `example`, `misconception_check`, `deep_dive`로 제한한다.
- 오답 기록이 있으면 misconception check를 우선 제안한다.
- overdue 복습이면 짧은 review를 우선 제안한다.

### 3. UI 표시

- 추천 패널은 다음 정보를 표시한다.
  - 다음 추천 concept title
  - 실제 추천 이유
  - confidence 또는 quiz error 수치
  - due date 또는 마지막 학습 후 경과일
  - 다음 행동
- community map 또는 learning path에서 온 추천인지 표시한다.

### 4. Quality tests

- 점수에 기여하지 않은 reason이 표시되지 않는지 검증한다.
- 같은 입력이면 reason 순서가 deterministic한지 검증한다.
- reason이 모두 fallback 문장으로만 채워지지 않는지 검증한다.

## 완료 기준(DoD)

- 추천 이유에 confidence, quiz error, due date, prerequisite 중 실제 기여 요인이 표시된다.
- 다음 행동이 최소 하나 이상 제공된다.
- 추천 출처가 learning path 또는 community graph 기준으로 구분된다.
- 검증 명령: `npm run test:unit -- explainable-recommendations` (`apps/web`에서 실행)
