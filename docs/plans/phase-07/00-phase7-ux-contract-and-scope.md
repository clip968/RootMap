# 00. Phase 07 UX 계약과 범위 고정

## 목표

`visual-learning-detail-spec.md`를 현재 RootMap 구현에 매핑하고, Phase 07에서 바꿀 화면/계약/검증 범위를 먼저 고정한다.

## 관련 명세

- `docs/specs/visual-learning-detail-spec.md` Overview, Goals, Non-goals
- 기존 `docs/plans/phase-05/detail-learning-blocks-minimal-plan.md`
- 기존 `docs/plans/phase-05/community-concept-map-plan.md`

## 구현 작업

### 1. 현재 UI와 spec 요구사항 매핑

- `apps/web/src/components/tree-page-client.tsx`의 다음 영역을 spec 요구사항에 매핑한다.
  - `RootMapFlowNode`: 노드 카드 정보량
  - 좌측 `<aside>`: 주제, 검색, 재생성, 개인화 코치, 추천, 복습 큐, 학습 경로
  - 상세 모달 main/side: 기본 설명, 학습 블록, 문서 근거, Concept 상태, 관계 정보
- `apps/web/src/components/detail-learning-blocks.tsx`가 이미 제공하는 블록과 새 visual block renderer가 담당할 영역을 분리한다.
- `apps/web/src/lib/services/node-detail.ts`, `apps/web/src/types/learning.ts`, `apps/web/src/lib/llm/schemas.ts`, `apps/web/src/lib/llm/prompts.ts`를 Phase 07 계약 변경 대상 파일로 기록한다.

### 2. 작업 경계 결정

- Phase 07은 UI 밀도 축소와 visual detail rendering까지 포함한다.
- Concept Store merge, 추천 점수, mastery 계산, RLS 정책은 Phase 07에서 수정하지 않는다.
- DB migration은 기본적으로 만들지 않는다. 기존 `detailJson`에 visual field가 없어도 동작하도록 API/파서 fallback으로 처리한다.
- 기존 detail 응답을 전면 폐기하지 않고 optional field를 더하는 방식으로 진행한다.

### 3. 완료 기준 문서화

- Phase 07 README의 체크리스트를 실제 완료 추적 기준으로 사용한다.
- 각 task는 완료 후 해당 README 항목만 `[x]`로 바꾼다.
- task 완료 단위마다 커밋하고 원격에 push한다.

## 완료 기준(DoD)

- Phase 07 작업 범위가 README와 이 문서에 일치한다.
- 기존 최소 구현인 `DetailLearningBlocks`와 새 visual block renderer의 책임이 구분되어 있다.
- Phase 07에서 건드리지 않을 영역이 명확히 적혀 있다.
- 검증 명령: 문서 작업만 있으므로 별도 실행 명령 없음. 변경 후 `git diff -- docs/plans/phase-07`로 문서 범위를 확인한다.
