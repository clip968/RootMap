# 02. Tree View 품질 보강 및 검증

## 목표

Phase 2.5 Tree View가 단순히 동작하는 수준을 넘어, 실제 학습 경로로 읽히도록 UX 품질과 검증 절차를 보강한다.

## 구현 작업

### 1. 레이아웃 품질

- 모바일/좁은 화면에서 가로 스크롤이 자연스러운지 확인한다.
- 노드가 많을 때 카드 간격과 connector가 지나치게 복잡해지지 않게 조정한다.
- 타입별 색상은 보조 정보로만 사용하고, 텍스트 badge를 함께 유지한다.

### 2. 관계 품질 확인

- Rust lifetime 같은 테스트 주제로 다음 구조가 드러나는지 확인한다.
  - 루트 주제 → 선수지식 → 핵심 개념 → 오개념/이해 점검
  - ownership/borrow/reference/borrow checker/lifetime annotation 등 주요 개념 연결
- LLM의 `children` 품질이 낮을 경우 prompt 보강 필요 여부를 기록한다.

### 3. 접근성/상호작용

- 모든 노드 카드가 keyboard focus와 button semantics를 유지한다.
- 진행 상태 select 조작이 노드 선택 클릭과 충돌하지 않는지 확인한다.
- 색상만으로 상태를 전달하지 않고 badge 텍스트를 유지한다.

### 4. 테스트/검증

- `npm run lint`
- 가능하면 `npm run build`
- 수동 검증:
  - Tree 보기 기본 표시
  - 섹션 보기 전환
  - 노드 클릭 후 상세 표시
  - 진행 상태 변경 후 추천 갱신
  - 재생성 시 새 Tree View 표시

## 완료 조건

- 대표 주제 1개 이상에서 Tree View가 학습 경로로 읽힌다.
- 기존 Phase 2 기능이 Tree View 전환 후에도 깨지지 않는다.
- 검증 결과와 남은 UX 개선점이 문서 또는 작업 요약에 기록된다.
