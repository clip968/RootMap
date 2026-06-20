# Visual Learning Detail Specification

## Overview

RootMap의 노드 상세 화면을 “긴 설명 페이지”에서 “시각 중심 학습 카드”로 개선한다.

현재 RootMap은 사용자가 입력한 주제에 대해 선수지식 기반 학습 트리를 생성하고, 각 노드에 대해 상세 설명, 예시, 오해, 이해 점검, 다음 학습 노드를 제공한다. 기능적으로는 학습에 필요한 항목을 갖추고 있으나, 실제 화면에서는 텍스트와 부가 정보가 과하게 노출되어 처음 보는 사용자가 개념 구조를 직관적으로 파악하기 어렵다.

이 spec의 목표는 다음 두 가지다.

첫째, 전체 UI의 정보 밀도를 낮춘다. 노드 카드, 좌측 패널, 상세 모달에서 반복되거나 개발자 지향적인 정보를 줄이고, 사용자가 바로 판단할 수 있는 정보만 기본 노출한다.

둘째, 개념별로 적절한 시각화 블록을 자동 생성한다. LBA, page table, syscall, scheduling처럼 구조·흐름·매핑·시간 관계가 중요한 개념은 텍스트 설명만으로 충분하지 않다. LLM이 직접 SVG/HTML을 생성하는 방식이 아니라, 시각화 타입과 렌더링 데이터를 JSON으로 생성하고 React 컴포넌트가 안전하게 렌더링한다.

---

## Problem Statement

현재 RootMap의 상세 페이지 생성 형식은 학습 앱 관점에서 반쯤 맞다. `이게 뭔가요?`, `왜 중요한가`, `예시`, `자주 하는 오해`, `이해 점검`, `선수 개념`, `관련 개념`, `다음에 볼 것` 같은 학습 항목은 존재한다.

그러나 화면 구조가 “학습 카드”보다 “문서형 설명 페이지”에 가깝다. 사용자가 RootMap에서 기대하는 것은 긴 설명을 읽는 것이 아니라, 다음 질문에 즉시 답을 얻는 것이다.

```text
내가 지금 어디에 있는가?
이 개념은 왜 필요한가?
이 개념은 어떤 구조로 이해해야 하는가?
다음에 무엇을 보면 되는가?
내가 이해했는지 어떻게 확인하는가?
```

현재 UI의 주요 문제는 다음이다.

1. 노드 카드가 무겁다. 종류, 추천 상태, 커뮤니티, 제목, 설명, confidence_score, recommendation_score, 이해도 select가 한 카드에 들어간다.
2. 좌측 패널이 복잡하다. 주제 요약, 검색, 재생성, 개인화 코치, 추천 노드, 복습 큐, 학습 경로가 같은 중요도로 노출된다.
3. 상세 모달의 정보가 많고 반복된다. 기본 설명, 중요성, 학습 블록, 문서 역할, 예시, 오해, 이해 점검, 연결 관계, Concept 상태, 선수/관련/다음 노드가 한 번에 노출된다.
4. 시각화가 일반적이다. 현재 개념 스케치는 “선수 조건 → 현재 초점 → 연결 방향 → 주의 분기”를 보여주지만, LBA space, page table mapping, syscall flow 같은 개념 내부 구조를 보여주지는 못한다.

---

## Goals

### G1. 상세 모달을 학습 카드화한다

상세 모달은 기본적으로 다음 구조를 따른다.

```text
한 줄 요약
→ 개념 위치 시각화
→ 개념별 시각화 블록
→ 핵심 3개
→ 예시 1개
→ 오해/주의 1개
→ 이해 점검 1~2개
→ 다음 행동
```

상세 정보, 문서 근거, 관련 개념, 다른 Tree 재사용 정보, 전체 질문 목록은 기본 노출하지 않고 접힌 영역으로 이동한다.

### G2. 노드 카드의 정보량을 줄인다

ReactFlow 노드 카드는 “맵을 읽기 위한 최소 단위”가 되어야 한다. 기본 카드에는 다음 정도만 표시한다.

```text
[타입] [상태 배지]
개념명
학습 상태
```

설명문, confidence_score, recommendation_score, select box는 기본 카드에서 제거하거나 선택 패널/상세 모달로 이동한다.

### G3. 좌측 패널을 학습 내비게이션으로 정리한다

좌측 패널의 기본 역할은 “다음에 무엇을 볼지”와 “전체 학습 경로가 어떻게 되는지”를 알려주는 것이다.

기본 노출:

```text
주제명
짧은 요약 1줄
오늘의 다음 단계
학습 경로
```

접기 영역:

```text
개인화 코치
복습 큐
재생성 옵션
고급 필터
```

### G4. 시각화 skill 시스템을 도입한다

개념별 skill이 아니라 시각 패턴별 skill을 만든다.

잘못된 방향:

```text
LBA skill
Page Table skill
Syscall skill
Scheduler skill
```

권장 방향:

```text
linear_space
mapping_table
flow_pipeline
timeline
layer_stack
tree_graph
state_machine
compare_matrix
worked_example
```

LLM은 “그림”을 직접 만들지 않는다. LLM은 `visual_blocks` JSON만 생성하고, 프론트엔드가 타입별 React 컴포넌트로 렌더링한다.

---

## Non-goals

이 spec은 다음을 목표로 하지 않는다.

1. 모든 개념을 반드시 시각화하지 않는다.
2. LLM이 SVG, HTML, CSS, Mermaid를 직접 생성하지 않는다.
3. 복잡한 좌표 기반 다이어그램 에디터를 만들지 않는다.
4. 외부 이미지 생성 모델을 사용하지 않는다.
5. 기존 `ApiNodeDetailResponse`를 전면 폐기하지 않는다.
6. Concept Store, 추천 시스템, 개인화 시스템의 핵심 로직을 재설계하지 않는다.

---

## User Experience Requirements

### UX-1. 노드 카드

현재 노드 카드의 권장 변경 전/후는 다음과 같다.

현재:

```text
카테고리
커뮤니티
제목
설명 1~3줄
confidence_score
recommendation_score
이해 정도 select
```

권장:

```text
[선수지식] [지금 볼 것]
CPU 이용률
처음 봄
```

내부 지표명은 사용자 언어로 바꾼다.

| 현재 | 권장 |
|---|---|
| `confidence_score` | `이해도` 또는 숨김 |
| `recommendation_score` | `추천도` 또는 숨김 |
| `개인화 추천` | `지금 볼 것` |
| `known` | `안다` |
| `partial` | `애매하다` |
| `unknown` | `처음 본다` |

### UX-2. 좌측 패널

좌측 패널은 다음 순서를 따른다.

```text
[주제]
운영체제 블록 계층
블록 I/O가 파일 시스템에서 장치까지 내려가는 흐름을 학습합니다.

[오늘의 다음 단계]
1. LBA
2. bio 구조체
3. request queue

[학습 경로]
1. 저장장치 주소화
2. 블록 요청 구조
3. 큐와 스케줄링
4. 장치 드라이버 전달

[접기]
개인화 코치
복습 큐
재생성
```

### UX-3. 상세 모달 기본 구조

상세 모달은 다음 구조를 따른다.

```text
[헤더]
개념명
한 줄 설명
상태 배지: 선수지식 / 처음 봄 / 지금 볼 것 / 문서에 직접 등장

[1. 위치]
선수 개념 → 현재 개념 → 다음 개념

[2. 시각 설명]
개념에 맞는 visual block 렌더링

[3. 핵심만 보면]
- 무엇인가
- 왜 필요한가
- 어디에 쓰이는가

[4. 예시]
짧은 상황, 코드, 수식, 계산 또는 시스템 시나리오 1개

[5. 주의]
흔한 오해 1개와 올바른 이해

[6. 확인]
질문 1~2개
답 보기

[7. 다음 행동]
이해했음
애매함
더 쪼개기
다음 개념 보기

[접힌 영역]
문서 근거
관련 개념
다른 Tree
전체 질문
전체 설명
Concept 상태
```

---

## Visual Skill System

### Skill Router

LLM은 노드 상세를 생성할 때 해당 개념에 시각화가 필요한지 판단한다.

출력은 다음 형태를 따른다.

```ts
type VisualDecision = {
  should_visualize: boolean;
  skill:
    | "linear_space"
    | "mapping_table"
    | "flow_pipeline"
    | "timeline"
    | "layer_stack"
    | "tree_graph"
    | "state_machine"
    | "compare_matrix"
    | "none";
  confidence: number;
  reason: string;
};
```

`confidence`가 낮거나 적절한 skill이 없으면 `visual_blocks`는 빈 배열이 될 수 있다. 시각화가 없는 것은 실패가 아니다. 좋은 텍스트 요약과 예시가 fallback이 된다.

---

## Visual Block Types

### 1. `linear_space`

주소 공간, 블록 공간, 페이지 공간, offset처럼 선형 단위 배열로 이해해야 하는 개념에 사용한다.

예시 개념:

```text
LBA
file offset
virtual address
physical address
page number
block number
sector
extent
```

Schema:

```ts
type LinearSpaceVisualBlock = {
  type: "linear_space";
  title: string;
  unit: "block" | "byte" | "page" | "sector" | "slot";
  block_size_bytes?: number;
  total_units_hint?: number;
  highlighted_ranges: Array<{
    label: string;
    start: number;
    length: number;
    note?: string;
  }>;
  annotations: string[];
};
```

LBA 예시:

```json
{
  "type": "linear_space",
  "title": "LBA Space",
  "unit": "block",
  "block_size_bytes": 4096,
  "highlighted_ranges": [
    {
      "label": "read request",
      "start": 100,
      "length": 3,
      "note": "LBA 100부터 3개 블록을 읽는다."
    }
  ],
  "annotations": [
    "LBA는 byte 주소가 아니라 block 번호다.",
    "byte offset은 LBA × block size로 계산된다.",
    "실제 물리 위치는 저장장치 내부 매핑에 의해 달라질 수 있다."
  ]
}
```

렌더링 예:

```text
LBA Space, block size = 4 KiB

LBA 번호
  0      1      2      3      4              100      101      102
┌────┬────┬────┬────┬────┬── ... ──┬──────┬──────┬──────┐
│    │    │    │    │    │         │ DATA │ DATA │ DATA │
└────┴────┴────┴────┴────┴── ... ──┴──────┴──────┴──────┘

byte offset
  0    4096   8192  12288 16384           409600 413696 417792
```

### 2. `mapping_table`

A가 B로 변환되거나 매핑되는 개념에 사용한다.

예시 개념:

```text
page table
virtual address → physical address
inode → data block
file offset → disk block
LBA → physical block
```

Schema:

```ts
type MappingTableVisualBlock = {
  type: "mapping_table";
  title: string;
  columns: string[];
  rows: string[][];
  annotations: string[];
};
```

### 3. `flow_pipeline`

요청이나 제어 흐름이 여러 단계/계층을 통과하는 개념에 사용한다.

예시 개념:

```text
syscall
read/write path
block I/O path
interrupt handling
network packet processing
```

Schema:

```ts
type FlowPipelineVisualBlock = {
  type: "flow_pipeline";
  title: string;
  steps: Array<{
    label: string;
    description: string;
    layer?: string;
  }>;
  annotations: string[];
};
```

### 4. `timeline`

시간 순서, 실행 순서, 경쟁 상태가 중요한 개념에 사용한다.

예시 개념:

```text
CPU scheduling
context switch
race condition
lock acquire/release
I/O latency
```

Schema:

```ts
type TimelineVisualBlock = {
  type: "timeline";
  title: string;
  lanes?: string[];
  events: Array<{
    time_label: string;
    lane?: string;
    label: string;
    description?: string;
  }>;
  annotations: string[];
};
```

### 5. `layer_stack`

계층 구조가 중요한 개념에 사용한다.

예시 개념:

```text
user mode / kernel mode
VFS / file system / block layer / device driver
TCP/IP stack
cache hierarchy
```

Schema:

```ts
type LayerStackVisualBlock = {
  type: "layer_stack";
  title: string;
  layers: Array<{
    label: string;
    description: string;
  }>;
  annotations: string[];
};
```

### 6. `tree_graph`

트리, 그래프, 의존성 구조가 중요한 개념에 사용한다.

예시 개념:

```text
B-tree
dependency graph
wait-for graph
process tree
filesystem directory tree
```

Schema:

```ts
type TreeGraphVisualBlock = {
  type: "tree_graph";
  title: string;
  nodes: Array<{
    id: string;
    label: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
  annotations: string[];
};
```

### 7. `state_machine`

상태 전이가 중요한 개념에 사용한다.

예시 개념:

```text
process state
TCP state
page lifecycle
I/O request lifecycle
```

Schema:

```ts
type StateMachineVisualBlock = {
  type: "state_machine";
  title: string;
  states: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  transitions: Array<{
    from: string;
    to: string;
    label: string;
  }>;
  annotations: string[];
};
```

### 8. `compare_matrix`

두 개념 또는 여러 개념의 차이를 빠르게 보여줄 때 사용한다.

예시 개념:

```text
polling vs interrupt
buffer vs cache
process vs thread
block device vs character device
```

Schema:

```ts
type CompareMatrixVisualBlock = {
  type: "compare_matrix";
  title: string;
  columns: string[];
  rows: Array<{
    criterion: string;
    values: string[];
  }>;
  annotations: string[];
};
```

---

## Data Model Changes

기존 `NodeDetailResponse`에 `visual_blocks`를 추가한다.

```ts
type VisualBlock =
  | LinearSpaceVisualBlock
  | MappingTableVisualBlock
  | FlowPipelineVisualBlock
  | TimelineVisualBlock
  | LayerStackVisualBlock
  | TreeGraphVisualBlock
  | StateMachineVisualBlock
  | CompareMatrixVisualBlock;

interface NodeDetailResponse {
  node_id: string;
  title: string;
  type: string;
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: {
    question: string;
    answer: string;
  }[];
  next_nodes: string[];

  visual_decision?: VisualDecision;
  visual_blocks: VisualBlock[];
}
```

기존 저장 데이터와의 호환성을 위해 `visual_blocks`가 없으면 빈 배열로 처리한다.

```ts
const visualBlocks = detail.visual_blocks ?? [];
```

---

## Prompt Requirements

초기 노드 상세 클릭 응답의 지연을 줄이기 위해 현재 `NODE_DETAIL_SYSTEM_BASE`와 `DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT`는 first-pass에서 visual field를 요구하지 않는다. 아래 요구사항은 별도 visual 생성 단계나 visual fixture 계약에서 사용할 수 있는 정책으로 유지한다.

```text
Generate visual_blocks when the selected concept can be better understood visually.

Allowed visual block types:
1. linear_space: address spaces, offsets, blocks, pages, sectors, LBAs
2. mapping_table: mappings or translations from one identifier/address to another
3. flow_pipeline: request paths, syscall paths, protocol flows, layered processing
4. timeline: scheduling, concurrency, locking, event ordering
5. layer_stack: layered architecture or hierarchy
6. tree_graph: tree/graph/dependency structures
7. state_machine: state transitions and lifecycle
8. compare_matrix: comparison between similar concepts

Do not generate SVG, HTML, CSS, Mermaid, or markdown diagrams.
Return only structured JSON props for the selected visual block type.
If visual explanation is not useful, return visual_decision.skill = "none" and visual_blocks = [].
Prefer one high-quality visual block over many weak visual blocks.
Keep annotations short and beginner-friendly.
```

추가 schema requirement:

```json
{
  "visual_decision": {
    "should_visualize": true,
    "skill": "linear_space",
    "confidence": 0.0,
    "reason": "string"
  },
  "visual_blocks": []
}
```

---

## Frontend Components

추가할 컴포넌트 구조:

```text
apps/web/src/components/visual-blocks/
├── visual-block-renderer.tsx
├── linear-space-diagram.tsx
├── mapping-table-diagram.tsx
├── flow-pipeline-diagram.tsx
├── timeline-diagram.tsx
├── layer-stack-diagram.tsx
├── tree-graph-diagram.tsx
├── state-machine-diagram.tsx
└── compare-matrix-diagram.tsx
```

Renderer 예시:

```tsx
function VisualBlockRenderer({ blocks }: { blocks: VisualBlock[] }) {
  if (!blocks.length) return null;

  return (
    <div className="visual-block-list">
      {blocks.map((block, index) => {
        if (block.type === "linear_space") {
          return <LinearSpaceDiagram key={index} block={block} />;
        }

        if (block.type === "mapping_table") {
          return <MappingTableDiagram key={index} block={block} />;
        }

        if (block.type === "flow_pipeline") {
          return <FlowPipelineDiagram key={index} block={block} />;
        }

        if (block.type === "timeline") {
          return <TimelineDiagram key={index} block={block} />;
        }

        return null;
      })}
    </div>
  );
}
```

상세 모달에서는 `DetailLearningBlocks`보다 먼저 시각화 블록을 보여준다.

```tsx
<VisualBlockRenderer blocks={detail?.visual_blocks ?? []} />

<DetailLearningBlocks
  node={selectedNode}
  detail={detail}
  sectionLabel={SECTION_LABEL}
/>
```

이유는 사용자가 먼저 구조를 보고, 그 다음 설명을 읽는 편이 이해가 빠르기 때문이다.

---

## UI Copy Changes

전문가/개발자용 표현을 학습자용 표현으로 바꾼다.

| 현재 | 변경 |
|---|---|
| `Learning Path` | `학습 순서 보기` |
| `Community Map` | `개념 묶음 보기` |
| `Focus` | `보기 범위` |
| `cards` | `개념` |
| `links` | `연결` |
| `confidence_score` | `이해도` 또는 숨김 |
| `recommendation_score` | `추천도` 또는 숨김 |
| `Concept 상태` | `내 학습 상태` |
| `개인화 추천` | `지금 볼 것` |

---

## Implementation Plan

### Phase 1. UI 정보 밀도 축소

1. `RootMapFlowNode`에서 설명문 기본 노출을 제거한다.
2. `confidence_score`, `recommendation_score`를 기본 카드에서 제거한다.
3. 이해도 select는 노드 카드에서 제거하고 상세 모달 또는 사이드 패널로 이동한다.
4. 노드 카드는 타입, 제목, 상태 배지만 표시한다.
5. 좌측 패널에서 개인화 코치, 복습 큐, 재생성 옵션을 접기 영역으로 이동한다.

### Phase 2. 상세 모달 학습 카드화

1. 상세 모달의 기본 섹션 순서를 변경한다.
2. `DetailLearningBlocks`를 핵심 학습 카드로 승격한다.
3. `이게 뭔가요?`, `왜 중요한가`, `예시`, `자주 하는 오해`의 중복 표시를 줄인다.
4. “더보기” 영역을 추가한다.
5. 문서 근거, 관련 개념, 다른 Tree, 전체 질문, Concept 상태는 더보기로 이동한다.

### Phase 3. Visual Block Schema 추가

1. `apps/web/src/lib/visualization/visual-block-schema.ts`를 추가한다.
2. Zod discriminated union으로 `VisualBlock`을 정의한다.
3. `NodeDetailResponse`와 `ApiNodeDetailResponse`에 `visual_blocks`를 추가한다.
4. 기존 detail JSON에 `visual_blocks`가 없어도 동작하도록 fallback 처리한다.

### Phase 4. LLM Prompt 개선

1. 일반 노드 상세 프롬프트에 `visual_decision`, `visual_blocks` 요구사항을 추가한다.
2. 문서 기반 노드 상세 프롬프트에도 동일하게 추가한다.
3. LLM은 SVG, HTML, Mermaid를 생성하지 못하도록 명시한다.
4. 시각화가 부적절하면 `visual_blocks = []`를 허용한다.
5. 시각화는 최대 1~2개만 생성하게 제한한다.

### Phase 5. Renderer 구현

우선 4개만 구현한다.

```text
linear_space
mapping_table
flow_pipeline
timeline
```

나머지는 schema만 정의하거나 후속 작업으로 둔다.

초기 smoke 대상:

```text
LBA → linear_space
page table → mapping_table
syscall → flow_pipeline
CPU scheduling → timeline
```

### Phase 6. 테스트 및 품질 검증

1. `visual-detail:smoke` 스크립트를 추가한다.
2. LBA가 `linear_space`를 생성하는지 검증한다.
3. page table이 `mapping_table`을 생성하는지 검증한다.
4. syscall이 `flow_pipeline`을 생성하는지 검증한다.
5. CPU scheduling이 `timeline`을 생성하는지 검증한다.
6. 잘 모르는 개념은 `visual_blocks = []`로 안전하게 fallback되는지 검증한다.
7. `npm run lint`, `npm run build`를 통과해야 한다.

---

## Acceptance Criteria

- [ ] 노드 카드에서 설명문, confidence_score, recommendation_score가 기본 노출되지 않는다.
- [ ] 노드 카드는 타입, 제목, 학습 상태, 추천 여부만으로 읽을 수 있다.
- [ ] 좌측 패널의 기본 화면은 주제, 다음 단계, 학습 경로 중심으로 정리된다.
- [ ] 개인화 코치, 복습 큐, 재생성 옵션은 접기 영역으로 이동한다.
- [ ] 상세 모달은 한 줄 요약, 위치, 시각화, 핵심 3개, 예시, 오해, 확인 질문, 다음 행동 순서로 구성된다.
- [ ] 상세 모달에서 문서 근거, 관련 개념, 다른 Tree, Concept 상태는 기본 노출되지 않고 더보기 영역에 있다.
- [ ] `visual_blocks`가 `NodeDetailResponse`에 추가된다.
- [ ] 기존 detail JSON에 `visual_blocks`가 없어도 앱이 깨지지 않는다.
- [ ] LLM은 SVG, HTML, CSS, Mermaid를 생성하지 않는다.
- [ ] LLM은 시각화가 적절하지 않은 개념에 대해 빈 `visual_blocks`를 반환할 수 있다.
- [ ] LBA 상세 설명은 `linear_space` 시각화를 포함한다.
- [ ] page table 상세 설명은 `mapping_table` 시각화를 포함한다.
- [ ] syscall 상세 설명은 `flow_pipeline` 시각화를 포함한다.
- [ ] CPU scheduling 상세 설명은 `timeline` 시각화를 포함한다.
- [ ] `npm run lint`가 통과한다.
- [ ] `npm run build`가 통과한다.

---

## Example: LBA Detail Target Output

LBA 노드 상세는 최종적으로 다음과 유사해야 한다.

```text
[한 줄 요약]
LBA는 저장장치를 0번부터 이어지는 논리 블록 배열처럼 다루는 주소 체계다.

[시각화: LBA Space]
block size = 4 KiB

LBA
  0      1      2      3      4            100     101     102
┌────┬────┬────┬────┬────┬── ... ──┬────┬────┬────┐
│    │    │    │    │    │         │■■■■│■■■■│■■■■│
└────┴────┴────┴────┴────┴── ... ──┴────┴────┴────┘

요청: start LBA = 100, length = 3 blocks
읽는 범위: LBA 100 ~ 102
byte offset: 409,600 ~ 421,887

[핵심]
- LBA는 byte 주소가 아니라 block 번호다.
- byte offset은 LBA × block size로 계산된다.
- OS는 LBA를 보지만, SSD 내부 물리 위치는 다를 수 있다.

[주의]
LBA 100이 실제 NAND나 플래터의 100번째 물리 위치라는 뜻은 아니다.

[확인 질문]
block size가 4096 byte일 때 LBA 8의 시작 byte offset은?
답: 8 × 4096 = 32768 byte
```

---

## Risks

### R1. LLM이 부정확한 시각화 데이터를 만들 수 있음

대응:

- schema validation을 강하게 적용한다.
- 숫자 계산은 프론트엔드에서 가능한 경우 다시 계산한다.
- 부정확하거나 필수 필드가 빠진 visual block은 렌더링하지 않는다.

### R2. 모든 개념을 시각화할 수 없음

대응:

- `visual_blocks = []`를 정상 fallback으로 인정한다.
- 미지원 개념 로그를 모아 skill library를 점진적으로 확장한다.

### R3. 시각화가 오히려 복잡해질 수 있음

대응:

- 기본 visual block은 1개만 우선 표시한다.
- annotation은 최대 3개로 제한한다.
- 복잡한 다이어그램은 접기 영역으로 이동한다.

### R4. 기존 detail JSON과 호환성 문제

대응:

- `visual_blocks`는 optional로 읽고 기본값을 빈 배열로 처리한다.
- DB migration 없이도 기존 저장 데이터가 동작하도록 한다.

---

## Implementation Decision Note

Phase 07 구현에서는 명세의 8개 visual skill을 모두 하나의 renderer 체계에 포함했다.

- first-pass detail LLM 응답은 텍스트 detail 필드만 요청한다. `visual_decision`과 `visual_blocks`는 기존 저장 데이터와 별도 visual 생성 단계에서 사용할 수 있도록 schema/parser/renderer 호환을 유지한다.
- 기존 detail JSON은 `visual_decision.skill = "none"`, `visual_blocks = []`로 정규화한다.
- renderer는 schema 검증을 통과하지 못한 block이나 필수 표시 데이터가 없는 block을 렌더링하지 않는다.
- `linear_space`, `mapping_table`, `flow_pipeline`, `timeline`, `layer_stack`, `tree_graph`, `state_machine`, `compare_matrix`는 각각 전용 React renderer를 갖는다.
- Phase 07 회귀 검증은 `apps/web`에서 `npm run phase7:visual-detail-smoke`로 수행한다.

---

## Summary

이 개선은 단순한 UI polish가 아니다. RootMap의 학습 경험을 “긴 설명 읽기”에서 “개념 구조를 보고 이동하기”로 바꾸는 작업이다.

핵심 방향은 다음이다.

```text
노드 카드 = 최소 정보
좌측 패널 = 학습 내비게이션
상세 모달 = 1장짜리 학습 카드
시각화 = 개념별이 아니라 패턴별 skill
LLM = 그림 생성자가 아니라 visual JSON 생성자
React = 안전한 renderer
```

우선 구현 범위는 `linear_space`, `mapping_table`, `flow_pipeline`, `timeline` 4개 skill로 제한한다. 이 네 개만으로도 운영체제, 파일 시스템, 메모리, 네트워크, 알고리즘의 주요 개념 상당수를 커버할 수 있다.
