# 01. 노드 카드와 좌측 내비게이션 정보 밀도 축소

## 목표

맵을 읽는 데 필요한 최소 정보만 기본 노출하도록 ReactFlow 노드 카드와 좌측 패널을 정리한다.

## 관련 명세

- `visual-learning-detail-spec.md` G2. 노드 카드의 정보량을 줄인다
- `visual-learning-detail-spec.md` G3. 좌측 패널을 학습 내비게이션으로 정리한다
- `visual-learning-detail-spec.md` UX-1, UX-2, UI Copy Changes

## 구현 작업

### 1. 노드 카드 기본 표시 축소

- `apps/web/src/components/tree-page-client.tsx`의 `RootMapFlowNode`를 수정한다.
- 기본 노출은 다음 정보로 제한한다.
  - 노드 타입 배지
  - 추천 상태 배지: `지금 볼 것`
  - 개념명
  - 학습 상태: `안다`, `애매하다`, `처음 본다`
- 기본 카드에서 제거한다.
  - 설명문 `node.description`
  - `confidence_score`
  - `recommendation_score`
  - 이해도 `<select>`
- 진행 상태 변경 UI는 상세 모달의 다음 행동 영역으로 이동한다.

### 2. 학습자용 copy 적용

- `PROGRESS_LABEL`을 다음 문구로 바꾼다.
  - `known`: `안다`
  - `partial`: `애매하다`
  - `unknown`: `처음 본다`
- 추천 배지는 `개인화 추천` 또는 `추천` 대신 `지금 볼 것`을 기본값으로 쓴다.
- 화면 상단의 `View`, `Focus`, `cards`, `links` 문구를 다음처럼 바꾼다.
  - `View` -> `보기`
  - `Learning Path` -> `학습 순서 보기`
  - `Community Map` -> `개념 묶음 보기`
  - `Focus` -> `보기 범위`
  - `cards` -> `개념`
  - `links` -> `연결`

### 3. 좌측 패널 기본/접기 구조 정리

- 좌측 패널의 기본 노출 순서를 다음으로 정리한다.
  - 주제명
  - 짧은 요약 1줄
  - 오늘의 다음 단계
  - 학습 경로
- 다음 영역은 접기 영역으로 이동한다.
  - 검색
  - 재생성
  - 개인화 코치
  - 복습 큐
  - 고급 필터
- `오늘의 다음 단계`는 `effectiveRecommendations.slice(0, 3)`을 우선 사용한다.
- 추천이 없으면 `recommended_order` 기준으로 아직 `known`이 아닌 앞쪽 노드 3개를 보여준다.

### 4. 레이아웃 회귀 방지

- 노드 카드 width/height가 dynamic content에 따라 크게 흔들리지 않도록 CSS class를 정리한다.
- 추천 배지와 긴 제목이 겹치지 않도록 title은 2줄 clamp를 유지한다.
- 모바일 폭에서는 좌측 패널의 접기 영역이 기본 콘텐츠보다 먼저 화면을 밀어내지 않도록 한다.

## 완료 기준(DoD)

- 노드 카드에서 설명문, `confidence_score`, `recommendation_score`, select box가 기본 노출되지 않는다.
- 좌측 패널 기본 화면이 주제, 오늘의 다음 단계, 학습 경로 중심으로 읽힌다.
- 개발자용 필드명이 화면에 그대로 보이지 않는다.
- 검증 명령: `npm run lint` (`apps/web`에서 실행)
