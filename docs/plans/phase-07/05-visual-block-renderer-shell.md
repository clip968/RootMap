# 05. Visual Block Renderer Shell

## 목표

8개 renderer가 공유할 안전한 렌더링 shell, fallback 정책, annotation UI, 공통 스타일을 먼저 만든다.

## 관련 명세

- `visual-learning-detail-spec.md` Frontend Components
- `visual-learning-detail-spec.md` Risks R1, R3
- `visual-learning-detail-spec.md` Summary

## 구현 작업

### 1. component 디렉토리 추가

- `apps/web/src/components/visual-blocks/`를 추가한다.
- 다음 파일을 만든다.
  - `visual-block-renderer.tsx`
  - `visual-block-annotations.tsx`
  - `visual-block-empty-state.tsx`
  - `visual-block-utils.ts`
- renderer 파일은 `VisualBlock[]`를 받아 type별 컴포넌트로 분기한다.

### 2. 안전 fallback 정책 구현

- `blocks`가 없거나 빈 배열이면 아무것도 렌더링하지 않는다.
- unknown block type은 렌더링하지 않는다.
- block별 필수 표시 데이터가 비어 있으면 해당 block만 숨긴다.
- 숨겨진 block 때문에 상세 모달 전체가 깨지지 않도록 try/catch가 아니라 사전 검증 helper를 사용한다.

### 3. 공통 UI 규칙 추가

- 모든 visual block은 다음 구조를 따른다.
  - 제목
  - 본문 diagram
  - annotation 최대 3개
- annotation은 `VisualBlockAnnotations`에서 공통 렌더링한다.
- 모바일 폭에서는 diagram이 가로 스크롤되거나 세로 배치로 전환된다.
- 텍스트가 카드 밖으로 넘치지 않도록 `min-width: 0`, `overflow-wrap`, `line-clamp`를 적용한다.

### 4. 상세 모달 연결

- `tree-page-client.tsx`에서 `DetailLearningBlocks`보다 먼저 `<VisualBlockRenderer blocks={detail?.visual_blocks ?? []} />`를 렌더링한다.
- detail이 loading/error 상태일 때 renderer는 보이지 않는다.
- 기존 detail에 visual field가 없어도 modal이 동일하게 열린다.

### 5. 공통 style 추가

- 기존 CSS 위치에 `visual-block-list`, `visual-block-card`, `visual-block-title`, `visual-block-annotations` class를 추가한다.
- cards inside cards처럼 보이지 않게 상세 모달 내부의 반복 block만 카드로 처리한다.
- 기존 `detail-learning-card`와 시각적으로 충돌하지 않도록 spacing과 border tone을 조정한다.

## 완료 기준(DoD)

- `VisualBlockRenderer`가 빈 배열과 unknown block을 안전하게 무시한다.
- 상세 모달에서 visual block이 `DetailLearningBlocks`보다 먼저 렌더링된다.
- 공통 annotation UI가 8개 renderer에서 재사용 가능하다.
- 검증 명령: `npm run lint` (`apps/web`에서 실행)
