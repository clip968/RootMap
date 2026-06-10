# 04. Edge 근거 Hover UI

## 목표

학습 그래프 edge에 마우스를 올리면 관계 근거(`explanation`)와 관계 타입을 보여준다. 사용자가 노드 목록이 아니라 "왜 이 순서로 공부해야 하는지"를 이해하게 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 2.3

## 관련 파일

- `apps/web/src/components/tree-page-client.tsx` (ReactFlow edge 렌더링)
- `apps/web/src/types/learning.ts` (`ApiTreePayload` 관계 필드)

## 구현 작업

### 1. edge 데이터 바인딩

- Task 02에서 payload로 전달된 관계 근거를 ReactFlow edge의 메타데이터로 매핑한다.
- prerequisite/related/application_of 등 관계 타입별로 edge 스타일(색·점선)을 구분한다.

### 2. hover 카드

- edge hover 또는 클릭 시 다음 형식의 근거 카드를 보여준다.

```text
"페이지 테이블" → "가상 주소 변환"
이유: 가상 주소를 물리 주소로 바꾸려면 page number를 page table에서 조회하는 과정을 알아야 함.
```

- `is_blocking=true`인 prerequisite은 "이걸 모르면 다음이 막힘" 배지를 표시한다.

### 3. fallback

- `explanation`이 비어 있으면 관계 타입만 표시하고 화면이 깨지지 않게 한다.
- cross-community link는 별도 스타일로 표시한다(Task 03 식별 결과 사용).

### 4. 접근성

- hover 외에 키보드 포커스/클릭으로도 근거를 볼 수 있게 한다(Phase 07 접근성 기조 유지).

## 완료 기준(DoD)

- edge hover/포커스 시 관계 근거가 노출된다.
- 관계 타입별 스타일과 `is_blocking` 배지가 표시된다.
- 근거가 없어도 화면이 깨지지 않는다.

## 검증 명령

```bash
cd apps/web
npm run lint
npm run build
```
