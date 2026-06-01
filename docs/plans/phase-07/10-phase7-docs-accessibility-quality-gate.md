# 10. Phase 07 문서, 접근성, 품질 Gate

## 목표

Visual Learning Detail 작업을 사용자 문구, 접근성, 반응형 레이아웃, 문서, 최종 검증 기준까지 마무리한다.

## 관련 명세

- `visual-learning-detail-spec.md` UI Copy Changes
- `visual-learning-detail-spec.md` Acceptance Criteria
- `visual-learning-detail-spec.md` Risks
- `visual-learning-detail-spec.md` Summary

## 구현 작업

### 1. 사용자 문구 정리

- 화면에 남은 개발자용 표현을 학습자용 표현으로 바꾼다.
  - `confidence_score` -> `이해도` 또는 숨김
  - `recommendation_score` -> `추천도` 또는 숨김
  - `Concept 상태` -> `내 학습 상태`
  - `개인화 추천` -> `지금 볼 것`
  - `Learning Path` -> `학습 순서 보기`
  - `Community Map` -> `개념 묶음 보기`
  - `Focus` -> `보기 범위`
- Korean copy는 debug-style 설명 대신 사용자가 바로 행동할 수 있는 문장으로 작성한다.

### 2. 접근성 점검

- modal close, progress action, next-node action에 접근 가능한 label이 있는지 확인한다.
- visual block은 diagram만 보고 이해해야 하는 구조가 되지 않도록 title과 annotation을 함께 제공한다.
- table renderer는 semantic table을 유지한다.
- state/graph renderer는 screen reader가 읽을 수 있는 text summary를 포함한다.
- color만으로 상태를 구분하지 않는다.

### 3. 반응형 레이아웃 점검

- desktop과 mobile에서 다음 영역을 확인한다.
  - ReactFlow 노드 카드
  - 좌측 패널 기본 영역
  - 좌측 패널 접기 영역
  - 상세 모달 main/side
  - 8개 visual block renderer
- 긴 title, 긴 annotation, 긴 table cell이 parent 밖으로 넘치지 않아야 한다.
- mobile에서 visual diagram은 세로 배치 또는 가로 스크롤로 읽을 수 있어야 한다.

### 4. 문서 업데이트

- `docs/specs/visual-learning-detail-spec.md`는 구현 결과와 달라진 결정이 있으면 decision note를 추가한다.
- `docs/plans/phase-07/README.md`의 완료 체크리스트를 실제 완료 항목만 `[x]`로 바꾼다.
- `apps/web/README.md` 또는 관련 runbook에 phase7 smoke command를 추가한다.

### 5. 최종 품질 gate

- `apps/web`에서 다음 명령을 실행한다.
  - `npm run phase7:visual-detail-smoke`
  - `npm run lint`
  - `npm run build`
- 실패하면 추측성 logic fix를 이어가지 않고 실패 원인과 다음 task를 보고한다.
- 통과 후 Phase 07 README의 완료 조건과 실제 구현 결과가 맞는지 다시 확인한다.

## 완료 기준(DoD)

- 개발자용 내부 필드명이 기본 화면에 노출되지 않는다.
- 8개 visual block이 keyboard/screen-reader 관점에서 최소한의 텍스트 대체 정보를 가진다.
- desktop/mobile에서 주요 화면이 겹치거나 넘치지 않는다.
- Phase 07 문서와 실제 구현 상태가 일치한다.
- 검증 명령: `npm run phase7:visual-detail-smoke && npm run lint && npm run build` (`apps/web`에서 실행)
