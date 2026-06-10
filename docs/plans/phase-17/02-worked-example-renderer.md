# 02. worked_example 렌더러와 등록

## 목표

worked_example을 안전하게 렌더링하는 React 컴포넌트를 추가하고 `visual-block-renderer.tsx`에 등록한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 7.3

## 관련 파일

- `apps/web/src/components/visual-blocks/worked-example-diagram.tsx` (신규)
- `apps/web/src/components/visual-blocks/visual-block-renderer.tsx`
- `apps/web/src/components/visual-blocks/visual-block-utils.ts`

## 구현 작업

### 1. 렌더러 구현

- `problem` → `steps`(label, explanation, intermediate_value) → `final_answer` → `common_mistake` 순서로 단계별 카드를 렌더링한다.
- step 번호를 표시해 "어떻게 푸는지"를 순서대로 따라가게 한다.
- `intermediate_value`는 강조 표시하고, 없으면 생략한다.

### 2. renderer 등록

- `visual-block-renderer.tsx`의 type 분기에 `worked_example`을 추가한다.
- unknown/invalid block fallback 정책(기존)을 그대로 따른다.

### 3. common_mistake 연결

- `common_mistake`는 "자주 하는 실수" 영역으로 분리 표시하고, Phase 14 오개념 자산과 톤을 맞춘다.

### 4. 접근성·스타일

- 기존 visual block 공통 스타일·annotation 규약을 재사용한다.
- 키보드 접근성과 스크린리더 라벨을 제공한다(Phase 07 기조).

## 완료 기준(DoD)

- worked_example 렌더러가 단계별 풀이를 표시한다.
- renderer 등록 후 decision.skill == "worked_example"일 때 정상 렌더링된다.
- invalid block은 화면을 깨뜨리지 않는다.

## 검증 명령

```bash
cd apps/web
npm run phase7:visual-detail-renderers
npm run build
```
