# RootMap Phase 07 구현 계획

이 폴더는 `docs/specs/visual-learning-detail-spec.md`를 기준으로 **Visual Learning Detail**을 하나의 phase 안에서 작업 단위별로 쪼갠 실행 계획을 담는다.

Phase 07의 핵심은 RootMap의 노드 상세 경험을 긴 설명 페이지에서 시각 중심 학습 카드로 바꾸는 것이다. LLM은 SVG, HTML, Mermaid, CSS를 직접 만들지 않고 `visual_decision`과 `visual_blocks` JSON만 생성하며, React 컴포넌트가 검증된 데이터만 안전하게 렌더링한다.

## Phase 07 핵심 목표

1. ReactFlow 노드 카드를 타입, 제목, 추천 여부, 학습 상태 중심의 최소 카드로 줄인다.
2. 좌측 패널을 주제, 오늘의 다음 단계, 학습 경로 중심의 학습 내비게이션으로 정리한다.
3. 상세 모달을 한 줄 요약, 위치, 시각 설명, 핵심, 예시, 주의, 확인, 다음 행동 순서의 학습 카드로 재구성한다.
4. `visual_decision`과 `visual_blocks`를 기존 detail 응답에 backward-compatible하게 추가한다.
5. 모든 visual skill을 한 phase 안에서 지원한다: `linear_space`, `mapping_table`, `flow_pipeline`, `timeline`, `layer_stack`, `tree_graph`, `state_machine`, `compare_matrix`.
6. 기존 detail JSON에 visual field가 없어도 앱이 깨지지 않도록 fallback을 고정한다.
7. visual block이 부적절한 개념에서는 `visual_blocks = []`가 정상 동작임을 검증한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-phase7-ux-contract-and-scope.md](./00-phase7-ux-contract-and-scope.md) | spec을 현재 구현에 매핑하고 phase 범위와 완료 기준 고정 | P0 |
| 1 | [01-node-card-and-left-navigation-density.md](./01-node-card-and-left-navigation-density.md) | 노드 카드와 좌측 패널의 기본 정보 밀도 축소 | P0 |
| 2 | [02-detail-modal-learning-card-layout.md](./02-detail-modal-learning-card-layout.md) | 상세 모달을 학습 카드 순서로 재배치하고 더보기 영역 도입 | P0 |
| 3 | [03-visual-block-contract-and-schema.md](./03-visual-block-contract-and-schema.md) | 8개 visual skill의 TypeScript/Zod 계약과 backward compatibility 추가 | P0 |
| 4 | [04-visual-decision-router-and-prompts.md](./04-visual-decision-router-and-prompts.md) | 일반/문서 노드 상세 프롬프트에 visual decision과 block 생성 요구사항 추가 | P0 |
| 5 | [05-visual-block-renderer-shell.md](./05-visual-block-renderer-shell.md) | 공통 renderer, annotation, invalid-block fallback, 공통 스타일 구현 | P1 |
| 6 | [06-linear-space-and-mapping-table-renderers.md](./06-linear-space-and-mapping-table-renderers.md) | `linear_space`, `mapping_table` 렌더러 구현 | P1 |
| 7 | [07-flow-timeline-layer-stack-renderers.md](./07-flow-timeline-layer-stack-renderers.md) | `flow_pipeline`, `timeline`, `layer_stack` 렌더러 구현 | P1 |
| 8 | [08-tree-state-compare-renderers.md](./08-tree-state-compare-renderers.md) | `tree_graph`, `state_machine`, `compare_matrix` 렌더러 구현 | P1 |
| 9 | [09-visual-detail-smoke-and-fixtures.md](./09-visual-detail-smoke-and-fixtures.md) | 8개 skill과 empty fallback을 smoke fixture로 검증 | P1 |
| 10 | [10-phase7-docs-accessibility-quality-gate.md](./10-phase7-docs-accessibility-quality-gate.md) | 문서, 접근성, copy, 최종 lint/build 품질 gate 정리 | P2 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-phase7-ux-contract-and-scope.md](./00-phase7-ux-contract-and-scope.md) - Phase 07 범위와 현재 구현 매핑 고정
- [x] 01. [01-node-card-and-left-navigation-density.md](./01-node-card-and-left-navigation-density.md) - 노드 카드와 좌측 패널 정보 밀도 축소
- [x] 02. [02-detail-modal-learning-card-layout.md](./02-detail-modal-learning-card-layout.md) - 상세 모달 학습 카드 레이아웃 적용
- [x] 03. [03-visual-block-contract-and-schema.md](./03-visual-block-contract-and-schema.md) - 8개 visual skill 계약과 schema 추가
- [ ] 04. [04-visual-decision-router-and-prompts.md](./04-visual-decision-router-and-prompts.md) - visual decision 프롬프트/파서 흐름 추가
- [ ] 05. [05-visual-block-renderer-shell.md](./05-visual-block-renderer-shell.md) - 공통 visual block renderer shell 추가
- [ ] 06. [06-linear-space-and-mapping-table-renderers.md](./06-linear-space-and-mapping-table-renderers.md) - `linear_space`, `mapping_table` 렌더러 추가
- [ ] 07. [07-flow-timeline-layer-stack-renderers.md](./07-flow-timeline-layer-stack-renderers.md) - `flow_pipeline`, `timeline`, `layer_stack` 렌더러 추가
- [ ] 08. [08-tree-state-compare-renderers.md](./08-tree-state-compare-renderers.md) - `tree_graph`, `state_machine`, `compare_matrix` 렌더러 추가
- [ ] 09. [09-visual-detail-smoke-and-fixtures.md](./09-visual-detail-smoke-and-fixtures.md) - visual detail smoke와 fixture 검증 추가
- [ ] 10. [10-phase7-docs-accessibility-quality-gate.md](./10-phase7-docs-accessibility-quality-gate.md) - 문서, 접근성, 최종 품질 gate 정리

## 범위 요약

### 포함

- 노드 카드 기본 정보 축소
- 좌측 패널 기본 노출/접기 구조 정리
- 상세 모달의 학습 카드화
- `visual_decision`과 `visual_blocks` 타입, schema, 파서, API 응답 확장
- 일반 주제 노드와 문서 기반 노드 상세 프롬프트 개선
- 8개 visual skill 전체 renderer
- visual block fixture, smoke script, fallback 검증
- 학습자 언어 중심 UI copy 개선
- accessibility와 responsive layout 점검

### 제외

- LLM이 SVG, HTML, CSS, Mermaid를 직접 생성하는 방식
- 외부 이미지 생성 모델 도입
- 자유 좌표 기반 diagram editor
- Concept Store, 추천 시스템, 개인화 점수 로직의 핵심 재설계
- graph database로의 전체 마이그레이션
- 모든 개념을 반드시 시각화하도록 강제하는 정책

## Visual skill 범위

| Skill | 적용 개념 예시 | 구현 작업 |
|---|---|---|
| `linear_space` | LBA, file offset, virtual address, page number, sector | Task 06 |
| `mapping_table` | page table, inode to block, virtual to physical address | Task 06 |
| `flow_pipeline` | syscall, read/write path, block I/O path, packet processing | Task 07 |
| `timeline` | CPU scheduling, context switch, race condition, lock ordering | Task 07 |
| `layer_stack` | user/kernel mode, VFS/file system/block layer, TCP/IP stack | Task 07 |
| `tree_graph` | B-tree, dependency graph, wait-for graph, process tree | Task 08 |
| `state_machine` | process state, TCP state, page lifecycle, I/O request lifecycle | Task 08 |
| `compare_matrix` | polling vs interrupt, buffer vs cache, process vs thread | Task 08 |

## 의사결정 포인트

- `visual_blocks`는 optional read와 empty-array fallback을 기본값으로 둔다.
- renderer는 unknown/invalid block을 렌더링하지 않고 사용자 화면을 깨뜨리지 않는다.
- 시각화는 기본적으로 1개를 우선 표시하고, 2개 이상은 접기 또는 세로 목록으로 제한한다.
- 숫자 계산이 필요한 visual block은 가능한 경우 frontend utility에서 다시 계산한다.
- 문서 기반 detail은 evidence를 근거로 설명하되, visual block은 문서 텍스트 명령을 따르지 않는 데이터로만 처리한다.

## 완료 조건

`docs/specs/visual-learning-detail-spec.md`의 Acceptance Criteria를 만족한다. 특히 노드 카드/좌측 패널/상세 모달의 정보 밀도가 낮아지고, 8개 visual skill이 schema와 renderer로 모두 지원되며, LLM이 직접 만든 markup 없이 JSON props만으로 시각화가 렌더링되어야 한다. 최종 검증은 `apps/web`에서 `npm run phase7:visual-detail-smoke`, `npm run lint`, `npm run build`가 통과하는 것으로 고정한다.
