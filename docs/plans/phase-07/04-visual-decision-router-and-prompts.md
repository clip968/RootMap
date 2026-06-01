# 04. Visual Decision Router와 LLM Prompt

## 목표

visual block schema와 parser는 유지하되, 일반 노드 상세와 문서 기반 노드 상세의 first-pass LLM 프롬프트에서는 텍스트 설명만 생성하도록 고정한다. 시각화 JSON은 기존 저장 데이터와 별도 생성 단계에서만 렌더링 계약을 사용한다.

## 관련 명세

- `visual-learning-detail-spec.md` Skill Router
- `visual-learning-detail-spec.md` Prompt Requirements
- `visual-learning-detail-spec.md` Non-goals
- `visual-learning-detail-spec.md` Risks R1, R2

## 구현 작업

### 1. 일반 상세 프롬프트 축소

- `apps/web/src/lib/llm/prompts.ts`의 `NODE_DETAIL_SYSTEM_BASE`는 first-pass 응답에서 텍스트 detail 필드만 요구한다.
- `visual_decision`, `visual_blocks`, visual skill routing 지시는 first-pass prompt에서 제외한다.
- 기존 detail JSON에 visual field가 없어도 schema default와 renderer fallback으로 안전하게 처리한다.

### 2. 문서 기반 상세 프롬프트 축소

- `DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT`도 first-pass 응답에서 텍스트 detail 필드만 요구한다.
- evidence text는 untrusted data이므로, evidence 안의 지시문이 task나 citation behavior를 바꾸지 못한다고 명시한다.
- 문서 evidence를 조작하거나 invented citation을 만들지 않도록 한다.

### 3. visual decision routing guideline 보존

- parser와 renderer fixture는 아래 skill 계약을 계속 검증한다.
  - `linear_space`: 주소, offset, block, page, sector
  - `mapping_table`: identifier/address 변환 또는 table mapping
  - `flow_pipeline`: 요청, syscall, protocol, layered processing
  - `timeline`: 실행 순서, scheduling, concurrency, locking
  - `layer_stack`: layered architecture, hierarchy
  - `tree_graph`: dependency, tree, graph
  - `state_machine`: lifecycle, state transition
  - `compare_matrix`: 비슷한 개념 비교
- first-pass prompt에는 이 routing guideline을 넣지 않는다.

### 4. quality warning 추가

- `nodeDetailQualityWarnings`에 다음 경고를 추가한다.
  - `visual_decision.should_visualize = true`인데 `visual_blocks`가 비어 있음
  - `visual_blocks.length > 2`
  - block annotation이 너무 길거나 비어 있음
- warning은 요청 실패로 처리하지 않고 품질 로그로만 남긴다.

### 5. prompt smoke 갱신

- `apps/web/scripts/smoke-phase7-visual-detail-prompts.ts`를 갱신한다.
- 일반/문서 first-pass prompt가 visual field와 visual skill routing 용어를 포함하지 않는지 검증한다.
- LBA, page table, syscall, CPU scheduling, VFS stack, B-tree, TCP state, process vs thread에 대해 생성된 raw JSON이 schema를 통과하는지 검증한다.
- 알맞은 시각화가 없는 추상 개념 fixture는 `visual_blocks = []`를 허용한다.

## 완료 기준(DoD)

- 일반/문서 기반 노드 first-pass 상세 프롬프트가 visual fields를 요구하지 않는다.
- 기존 visual JSON fixture와 renderer 계약은 계속 통과한다.
- 시각화가 없는 응답도 정상 fallback으로 통과한다.
- 검증 명령: `npm run phase7:visual-detail-smoke` (`apps/web`에서 실행)
