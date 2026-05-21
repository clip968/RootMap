# 05. 개인화 추천·트리 API

## 목표

선수지식·이해도·퀴즈·최근성 등을 종합한 노드 추천 점수를 계산하고, 개인화 트리 뷰와 추천 목록 API를 제공한다. 추천 이유는 템플릿 기반으로 생성한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 8장 추천 로직, 8.1~8.2 의사코드
- 동일 9장 추천 이유(템플릿)
- 동일 12장 `GET /api/trees/:treeId/personalized`, `GET /api/trees/:treeId/recommendations/personalized`
- 문서 기반 트리 시 `document_importance`(Phase 3) 입력 가능 여부

## 구현 작업

### 1. 점수·후보 선정

- `calculateNodeRecommendationScore`: prerequisite gap, 낮은 confidence, 퀴즈 오류, recency, importance 가중치
- `recommendPersonalizedNodes`: 이미 숙달한 노드 스킵, 미충족 선수지식 시 prerequisite 후보 포함
- `generateRecommendationReason`: §9.3 조건 분기(템플릿 문장 목록)

### 2. API 응답

- `personalized_nodes`: 노드별 `status`, `confidence_score`, `recommendation_score`, `is_recommended`, `reasons` 배열
- `recommended_nodes`: 정렬된 추천 리스트, 최소 MVP는 추천 3개 이상·이유 2개 이상(§18)

### 3. `recommendation_logs`(선택 시점)

- 추천 목록을 반환할 때 노출 결과를 `recommendation_logs`에 저장
- 응답에 `recommendation_log_id`를 포함하거나, `(user_id, tree_id, node_id, created_at)` 기반 매칭 정책을 정해 클릭 추적 가능하게 설계
- UI에서 `recommendation_clicked` 이벤트가 들어오면 해당 로그의 `clicked`를 갱신(태스크 03·09·10과 연동)

## 완료 기준(DoD)

- 명세 §19 테스트 1·4 유형(사용자별 순서 차이, known 제외)을 단위·통합 중 한 가지 이상으로 검증한다.
- 추천 이유가 추상 문장만 반복하지 않도록 템플릿 조건을 점검한다.
- 추천 노출과 클릭 추적 흐름이 `recommendation_logs`와 `learning_events` 양쪽에서 재현 가능하다.
- 검증 명령: `npm run phase4:personalized-smoke` (`apps/web`에서 실행)
