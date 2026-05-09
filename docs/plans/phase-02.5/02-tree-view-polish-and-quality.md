# 02. Tree View 품질 보강 및 검증

Phase 2.5 Tree View가 단순히 동작하는 수준을 넘어, 실제 학습 경로로 읽히도록 UX 품질과 검증 절차를 보강한다.


### 1. 레이아웃 품질

- 모바일/좁은 화면에서 가로 스크롤이 자연스러운지 확인한다.
- 노드가 많을 때 카드 간격과 connector가 지나치게 복잡해지지 않게 조정한다.
- 타입별 색상은 보조 정보로만 사용하고, 텍스트 badge를 함께 유지한다.

### 2. 관계 품질 확인

- Rust lifetime 같은 테스트 주제로 다음 구조가 드러나는지 확인한다.
  - 루트 주제 → 직접 선수지식 → 더 기초 선수지식
  - ownership/borrow/reference/borrow checker/lifetime annotation 등 주요 개념 연결
- LLM의 `children` 품질이 낮을 경우 prompt 보강 필요 여부를 기록한다.

### 3. 접근성/상호작용

- 모든 노드 카드가 keyboard focus와 button semantics를 유지한다.
- 진행 상태 select 조작이 노드 선택 클릭과 충돌하지 않는지 확인한다.
- 상세는 오른쪽 패널이 아니라 노트형 modal/dialog에서 열린다.
- 색상만으로 상태를 전달하지 않고 badge 텍스트를 유지한다.

### 4. 테스트/검증

- `npm run lint`
- 가능하면 `npm run build`
- 수동 검증:
  - Tree 보기 기본 표시
  - 섹션 보기 전환
  - 노드 클릭 후 노트형 모달 상세 표시
  - 진행 상태 변경 후 추천 갱신
  - 재생성 시 새 Tree View 표시

## 검증 결과

- Tree View에 20%~100% zoom slider를 추가했다.
- 기본 배율은 55%, `한눈에` 배율은 35%로 설정해 큰 트리도 더 끝까지 축소해 볼 수 있게 했다.
- `한눈에` 버튼은 35%, `원본` 버튼은 100%로 즉시 전환하며, `중앙` 버튼으로 트리 중앙에 다시 맞출 수 있다.
- 축소 상태에서도 노드 클릭, 노트형 상세 모달, 진행 상태 select, 추천/Concept badge가 유지된다.
- Tree View viewport에서 빈 공간을 마우스/터치로 좌클릭 드래그해 상하좌우 이동할 수 있게 했다.
- 마우스 휠은 Tree View DOM이 렌더링된 뒤 native wheel listener(`passive: false`, `capture: true`)에서 차단해 포인터가 Tree View 안에 있을 때 페이지 스크롤 대신 Tree View 확대·축소로만 동작하게 했다.
- Tree View viewport에는 `overscroll-contain`을 적용해 트리 영역 조작이 페이지 스크롤로 전파되지 않게 보강하고, 기본 스크롤바는 숨겼다.
- 축소된 트리가 잘려 보이지 않도록 viewport 높이, scale 보정 min-height, 내부 padding, 중앙 정렬 버튼을 추가했다.
- 확대 상태에서도 트리의 좌측 끝이 스크롤 가능 영역 안에 남도록 Tree View wrapper와 가지 목록은 `justify-start`로 정렬하고, scale 기준은 `top left`로 고정했다.
- Tree View는 `children`을 부모 목표/개념 → 직접 선수지식 방향으로만 렌더링하고, `prerequisites`를 뒤집은 선수지식 → 의존 개념 간선은 Tree View 보강에 사용하지 않는다.
- Tree View는 목표 지식 중심 top-down prerequisite decomposition 구조를 사용하고, 노드 클릭 시 노트형 모달에서 상세를 보여 준다.
- 검증 명령:
  - `cd apps/web && npm run lint -- src/components/tree-page-client.tsx src/lib/llm/prompts.ts`
  - `cd apps/web && npm run build`


## 완료 조건

- 대표 주제 1개 이상에서 Tree View가 학습 경로로 읽힌다.
- 기존 Phase 2 기능이 Tree View 전환 후에도 깨지지 않는다.
- 검증 결과와 남은 UX 개선점이 문서 또는 작업 요약에 기록된다.

