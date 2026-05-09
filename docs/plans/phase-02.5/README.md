# RootMap Phase 2.5 구현 계획

이 폴더는 Phase 2까지 구축한 학습 트리·Concept Store 데이터를 바탕으로, 사용자가 기대한 “진짜 tree/mindmap형 학습 경로”를 먼저 체감할 수 있게 만드는 UI/UX 보강 계획을 담는다.


주제 루트를 중심으로 선수관계와 children 관계가 실제 시각적 트리로 내려오게 하여, RootMap이 표/카드 목록이 아니라 학습 지도를 만든다는 인상을 강화한다.

핵심 판단 기준:

> 사용자가 “Rust lifetime을 배우려면 어떤 개념에서 시작해서 어디로 내려가야 하는지”를 한눈에 볼 수 있는가?

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 1 | [01-tree-view-layout.md](./01-tree-view-layout.md) | 기존 섹션형 결과 화면을 보완하는 실제 Tree View 구현 | P0 |
| 2 | [02-tree-view-polish-and-quality.md](./02-tree-view-polish-and-quality.md) | 트리 UX 품질, fallback, 반응형/접근성/검증 보강 | P1 |
| 3 | ChatGPT형 Home/History Shell | 중앙 주제 입력 화면과 접이식 Tree 히스토리 사이드바 | P1 |
| 4 | [04-tree-generation-latency-and-perceived-performance.md](./04-tree-generation-latency-and-perceived-performance.md) | Tree 생성 지연 계측 및 생성 대기 UX 개선 | P0 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 01. [01-tree-view-layout.md](./01-tree-view-layout.md) - 루트 주제 중심 실제 Tree View 구현
- [x] 02. [02-tree-view-polish-and-quality.md](./02-tree-view-polish-and-quality.md) - Tree View 품질 보강 및 검증
- [x] 03. ChatGPT형 Home/History Shell - 중앙 주제 입력 화면과 접이식 Tree 히스토리 사이드바
- [ ] 04. [04-tree-generation-latency-and-perceived-performance.md](./04-tree-generation-latency-and-perceived-performance.md) - Tree 생성 지연 계측 및 생성 대기 UX 개선

## Phase 2.5 범위 요약

### 포함

- `/tree/[treeId]` 결과 화면의 기본 보기를 Tree View로 전환
- `children`은 부모 개념을 이해하기 위해 먼저 알아야 하는 직접 선수지식만 가리키며, `prerequisites`를 뒤집어 시각 간선으로 쓰지 않는다.
- 루트 주제에서 시작하는 top-down prerequisite decomposition tree
- 기존 섹션형 보기 유지 및 토글 제공
- Concept 재사용 badge, 추천 강조, 이해 상태 변경, 상세 모달 연동 유지
- 순환/공유 참조, 고아 노드 fallback 처리
- 노드 상세는 오른쪽 패널이 아닌 노트형 modal/dialog로 표시
- Tree 생성 대기 시간 계측, 재시도 가시화, 생성/재생성 대기 UX 개선

### 제외

- 자유 배치 가능한 캔버스/드래그 편집기
- 복잡한 force-directed graph 엔진
- Concept Graph 전체 탐색 UI
- 문서 업로드/출처 표시 UI(Phase 3 범위)

## 완료 조건

- 새 트리 결과 화면에서 기본값으로 Tree View가 보인다.
- 루트 주제가 가장 위에 있고, 학습 노드가 목표 지식 → 직접 선수지식 → 더 기초 선수지식 방향으로 아래에 연결된다.
- Rust lifetime 같은 주제에서 표처럼만 보이지 않고 실제 학습 경로 구조가 드러난다.
- 기존 섹션 보기, 노드 상세, 추천, 진행 상태, Concept 표시 기능이 깨지지 않는다.
- Tree 상세는 오른쪽 사이드 패널이 아니라 노트형 모달에서 열린다.
- Tree 생성 지연 원인이 구간별로 계측되고, 생성/재생성 중 경과 시간 또는 단계형 안내가 표시된다.

