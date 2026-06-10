# 02. 문서 근거 vs AI 보강 분리 표시

## 목표

상세 설명과 퀴즈를 "문서에 직접 등장한 근거 있는 주장"과 "RootMap(LLM)이 보강한 설명"으로 분리해 표시한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 5.3

## 관련 파일

- `apps/web/src/lib/llm/generate-document-node-detail.ts`
- `apps/web/src/components/detail-learning-blocks.tsx`
- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/types/learning.ts`

## 구현 작업

### 1. 데이터 분리

- 각 주장에 `support_type`(`direct/inferred`) 또는 "AI 보강" 플래그를 부여한다.
- 예시:

```text
문서에 직접 등장:   페이지 교체 알고리즘의 목적
RootMap이 보강한 설명: LRU와 Clock 알고리즘의 직관적 차이
```

### 2. UI 배지

- "문서 근거" 배지와 "AI 보강" 배지를 시각적으로 구분한다.
- 문서 근거 항목은 클릭 시 source span(페이지/인용)을 보여준다.

### 3. citation correctness vs faithfulness

- citation이 달렸다고 모델이 그 근거를 실제 사용했다고 보지 않는다.
- UI/데이터에서 "인용 존재"와 "인용이 주장을 실제 지지"를 구분할 수 있게 한다(평가는 Task 03).

## 완료 기준(DoD)

- 상세/퀴즈가 근거 있는 주장과 AI 보강 설명으로 구분 표시된다.
- 문서 근거 항목에서 source span을 확인할 수 있다.
- 근거가 없으면 "AI 보강"으로 명확히 표시된다.

## 검증 명령

```bash
cd apps/web
npm run lint
npm run build
```
