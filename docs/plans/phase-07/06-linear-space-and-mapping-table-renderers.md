# 06. Linear Space와 Mapping Table Renderer

## 목표

주소/블록 공간과 매핑 관계를 초보자가 바로 읽을 수 있게 `linear_space`와 `mapping_table` visual block renderer를 구현한다.

## 관련 명세

- `visual-learning-detail-spec.md` Visual Block Types 1. `linear_space`
- `visual-learning-detail-spec.md` Visual Block Types 2. `mapping_table`
- `visual-learning-detail-spec.md` Example: LBA Detail Target Output

## 구현 작업

### 1. LinearSpaceDiagram 구현

- `apps/web/src/components/visual-blocks/linear-space-diagram.tsx`를 추가한다.
- 입력은 `LinearSpaceVisualBlock`이다.
- 표시 항목:
  - title
  - unit label
  - block size 또는 unit metadata
  - 선형 cell strip
  - highlighted range label과 note
  - annotation
- `block_size_bytes`가 있으면 highlighted range의 byte offset을 frontend에서 계산한다.
- 계산식은 사용자에게 보이는 보조 텍스트로 표시한다.
  - `byte offset = start * block_size_bytes`
  - `byte end = (start + length) * block_size_bytes - 1`

### 2. LinearSpace edge case 처리

- `highlighted_ranges`가 여러 개면 색상은 class token으로 순환한다.
- `start` 또는 `length`가 음수이면 해당 block을 렌더링하지 않는다.
- `total_units_hint`가 너무 크면 실제 cell 전체를 만들지 않고 앞부분, gap, highlighted range를 요약 표시한다.
- mobile에서는 cell strip이 가로 스크롤된다.

### 3. MappingTableDiagram 구현

- `apps/web/src/components/visual-blocks/mapping-table-diagram.tsx`를 추가한다.
- 입력은 `MappingTableVisualBlock`이다.
- 표시 항목:
  - title
  - columns
  - rows
  - annotation
- row length가 column length와 다르면 renderer 이전 schema에서 reject되며, renderer는 defensive guard도 둔다.
- 긴 cell text는 줄바꿈되며 table width가 modal을 넘기면 가로 스크롤한다.

### 4. renderer shell 연결

- `visual-block-renderer.tsx`에서 `linear_space`와 `mapping_table`을 분기한다.
- 두 renderer 모두 `VisualBlockAnnotations`를 재사용한다.

### 5. fixture smoke 추가

- `smoke-phase7-visual-detail-renderers.ts` 또는 별도 fixture에 다음 케이스를 추가한다.
  - LBA -> `linear_space`
  - virtual address -> `linear_space`
  - page table -> `mapping_table`
  - inode -> data block -> `mapping_table`

## 완료 기준(DoD)

- LBA fixture가 선형 block과 byte offset을 보여준다.
- page table fixture가 mapping table로 렌더링된다.
- 잘못된 range나 row shape가 화면을 깨뜨리지 않는다.
- 검증 명령: `npx tsx scripts/smoke-phase7-visual-detail-renderers.ts --skill linear_space,mapping_table` (`apps/web`에서 실행)
