# 02. 상세 모달 학습 카드 레이아웃

## 목표

상세 모달을 문서형 설명 페이지가 아니라 한 번에 학습 흐름을 따라갈 수 있는 카드형 구조로 재배치한다.

## 관련 명세

- `visual-learning-detail-spec.md` G1. 상세 모달을 학습 카드화한다
- `visual-learning-detail-spec.md` UX-3. 상세 모달 기본 구조
- `visual-learning-detail-spec.md` Frontend Components

## 구현 작업

### 1. 상세 모달 기본 순서 재배치

- `apps/web/src/components/tree-page-client.tsx`의 상세 모달 main 영역을 다음 순서로 정리한다.
  1. 한 줄 요약
  2. 개념 위치: 선수 개념 -> 현재 개념 -> 다음 개념
  3. visual block renderer
  4. 핵심 3개
  5. 예시 1개
  6. 오해/주의 1개
  7. 확인 질문 1~2개
  8. 다음 행동
- 기존 `이게 뭔가요?`, `왜 중요한가`, `예시`, `자주 하는 오해` 섹션의 중복 노출을 줄인다.
- `DetailLearningBlocks`는 한 줄 요약, 위치, 핵심 요약을 보조하는 학습 카드 컴포넌트로 유지한다.

### 2. 더보기 영역 도입

- 다음 정보는 기본 노출에서 제외하고 접힌 영역으로 이동한다.
  - 문서 근거 전체
  - 관련 개념
  - 다른 Tree
  - 전체 질문 목록
  - 전체 설명
  - Concept 상태와 점수 상세
- 접힌 영역 제목은 `자세히 보기`로 통일한다.
- 기본 화면의 학습 행동을 방해하지 않도록 `자세히 보기`는 modal side 또는 main 하단에 배치한다.

### 3. 다음 행동 영역 정리

- 상세 모달 하단에 다음 행동 버튼을 제공한다.
  - `이해했음`
  - `애매함`
  - `더 쪼개기`
  - `다음 개념 보기`
- `이해했음`, `애매함`은 기존 `onProgressChange`를 사용한다.
- `더 쪼개기`는 기존 `onDeepDive`를 사용한다.
- `다음 개념 보기`는 relations 또는 `detail.next_nodes`에서 첫 번째 다음 노드를 찾아 `openNode`를 호출한다.

### 4. 문서 기반 detail 호환

- `document_context_summary`, `why_it_matters_for_document`, evidence snippet은 기본 카드의 핵심 흐름을 방해하지 않게 더보기로 이동한다.
- 문서 직접 등장/추론 배지는 헤더 상태 배지 중 하나로 유지한다.

## 완료 기준(DoD)

- 상세 모달 기본 화면이 한 줄 요약, 위치, 시각화, 핵심, 예시, 주의, 확인, 다음 행동 순서로 보인다.
- 문서 근거, 관련 개념, 다른 Tree, Concept 상태는 기본 노출되지 않는다.
- 다음 행동 버튼이 기존 progress/deep-dive 흐름과 연결된다.
- 검증 명령: `npm run lint` (`apps/web`에서 실행)
