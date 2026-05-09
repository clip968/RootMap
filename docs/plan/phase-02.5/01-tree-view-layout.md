# 01. 루트 주제 중심 실제 Tree View 구현

## 목표

기존 `/tree/[treeId]` 화면의 타입별 카드 목록을 보조 보기로 유지하되, 기본 화면은 루트 주제에서 시작해 학습 노드가 아래로 이어지는 Tree View로 바꾼다.

## 배경

Phase 1~2의 UI는 `선수지식 / 핵심 개념 / 부가 지식 / 오개념 / 이해 점검` 섹션을 명확히 보여 주는 데는 유용하지만, 사용자가 기대한 “mindmap처럼 주제에서 개념이 뻗어 내려가는 구조”를 충분히 보여 주지 못한다.

## 구현 작업

### 1. 트리 구성 로직

- `ApiLearningNode.node_key`를 기준으로 노드를 찾는다.
- `children` 배열을 부모→직접 선수지식 자식 간선으로만 사용한다.
- `prerequisites`는 학습 순서·검증용 메타데이터로 남기며, Tree View에서 선수지식→의존 개념 방향으로 뒤집어 렌더링하지 않는다.
- LLM 프롬프트도 목표 지식 중심 top-down prerequisite decomposition tree를 만들도록 고정한다.
- incoming edge가 없는 노드를 루트 후보로 삼아 주제 루트 아래에 붙인다.
- 추천 순서(`recommended_order`)를 이용해 같은 depth의 노드 순서를 안정화한다.

### 2. Tree View 렌더링

- 최상단에는 main topic 카드 표시
- 그 아래에 노드 branch들을 top-down으로 연결
- 노드 카드에는 다음 정보를 유지한다.
  - 타입 badge
  - 제목/요약
  - Concept 재사용 badge
  - 추천 badge
  - 이해 상태 select
- 클릭 시 기존 상세 패널 대신 노트형 modal/dialog를 연다.

### 3. 기존 섹션 보기 유지

- `Tree 보기 / 섹션 보기` 토글을 제공한다.
- 기본값은 `Tree 보기`로 둔다.
- 섹션 보기는 기존 Phase 1~2 UI fallback으로 유지한다.

### 4. 안전장치

- 공유 노드나 순환 참조는 무한 렌더링하지 않고 `참조` badge로 표시한다.
- 루트에서 연결되지 않는 고아 노드는 별도 branch로 노출해 누락하지 않는다.
- 트리 폭이 넓어지는 경우 가로 스크롤을 허용한다.

## 산출물

- Tree View 빌더 함수
- 목표 지식 → 직접 선수지식 방향의 Tree View 렌더링 UI
- 보기 방식 토글
- 기존 섹션 보기 fallback

## 검증 기준

- `/tree/[treeId]` 진입 시 Tree View가 기본 표시된다.
- 각 노드 클릭, 상세 모달, 진행 상태 변경이 정상 동작한다.
- 추천/Concept 재사용 badge가 Tree View에서도 보인다.
- 트리 관계가 없는 노드도 화면에서 사라지지 않는다.
