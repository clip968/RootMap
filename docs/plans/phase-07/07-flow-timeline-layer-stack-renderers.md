# 07. Flow, Timeline, Layer Stack Renderer

## 목표

흐름, 시간 순서, 계층 구조가 중요한 개념을 각각 `flow_pipeline`, `timeline`, `layer_stack` visual block으로 렌더링한다.

## 관련 명세

- `visual-learning-detail-spec.md` Visual Block Types 3. `flow_pipeline`
- `visual-learning-detail-spec.md` Visual Block Types 4. `timeline`
- `visual-learning-detail-spec.md` Visual Block Types 5. `layer_stack`

## 구현 작업

### 1. FlowPipelineDiagram 구현

- `apps/web/src/components/visual-blocks/flow-pipeline-diagram.tsx`를 추가한다.
- 입력은 `FlowPipelineVisualBlock`이다.
- 표시 항목:
  - 단계 label
  - 단계 description
  - optional layer
  - 단계 간 방향성 connector
  - annotation
- `steps.length`가 1개 미만이면 렌더링하지 않는다.
- 6단계 이상이면 compact vertical layout으로 전환한다.

### 2. TimelineDiagram 구현

- `apps/web/src/components/visual-blocks/timeline-diagram.tsx`를 추가한다.
- 입력은 `TimelineVisualBlock`이다.
- 표시 항목:
  - time label
  - optional lane
  - event label
  - optional description
  - annotation
- lanes가 있으면 lane별로 event를 그룹화한다.
- lanes가 없으면 단일 수직 timeline으로 렌더링한다.
- 같은 time label event가 여러 개이면 원래 순서를 유지한다.

### 3. LayerStackDiagram 구현

- `apps/web/src/components/visual-blocks/layer-stack-diagram.tsx`를 추가한다.
- 입력은 `LayerStackVisualBlock`이다.
- 표시 항목:
  - layer label
  - layer description
  - 위/아래 계층 방향 표시
  - annotation
- layer는 입력 순서를 유지한다.
- `VFS -> file system -> block layer -> device driver` 같은 시스템 stack이 한눈에 보이도록 세로 stack으로 표현한다.

### 4. renderer shell 연결

- `visual-block-renderer.tsx`에서 `flow_pipeline`, `timeline`, `layer_stack`을 분기한다.
- 세 renderer 모두 annotation과 empty guard를 공유한다.

### 5. fixture smoke 추가

- 다음 fixture를 추가한다.
  - syscall -> `flow_pipeline`
  - block I/O path -> `flow_pipeline`
  - CPU scheduling -> `timeline`
  - race condition -> `timeline`
  - VFS/file system/block layer/device driver -> `layer_stack`
  - TCP/IP stack -> `layer_stack`

## 완료 기준(DoD)

- syscall fixture가 단계별 pipeline으로 렌더링된다.
- CPU scheduling fixture가 시간 순서로 렌더링된다.
- VFS stack fixture가 계층 구조로 렌더링된다.
- 검증 명령: `npx tsx scripts/smoke-phase7-visual-detail-renderers.ts --skill flow_pipeline,timeline,layer_stack` (`apps/web`에서 실행)
