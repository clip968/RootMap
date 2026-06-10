# 03. Quality Warnings를 Failures로 흡수

## 목표

기존 `learningTreeQualityWarnings`(`string[]` 경고)를 `TreeEvalResult.failures`의 구조화된 항목으로 승격한다. 경고를 삭제하지 않고 단일 경로로 통합해 중복을 제거한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.5

## 현재 문제

`apps/web/src/lib/llm/schemas.ts`의 `learningTreeQualityWarnings`는 노드 수·타입 분포·`recommended_order` 정합성을 검사하지만 자유 문자열만 반환한다. 점수 시스템과 분리되어 있어 같은 문제를 두 곳에서 검사할 위험이 있다.

## 관련 파일

- `apps/web/src/lib/llm/schemas.ts` (`learningTreeQualityWarnings`, `nodeDetailQualityWarnings`)
- `apps/web/src/lib/llm/generate-tree.ts` (호출부: line 354 부근)
- `apps/web/src/lib/evaluation/tree-eval.ts` (Task 02)

## 구현 작업

### 1. 경고 → failure code 매핑

`learningTreeQualityWarnings`의 각 경고에 안정적인 `code`를 부여한다.

- 노드 수 범위 위반 → `NODE_COUNT_OUT_OF_RANGE`
- prerequisite/core/misconception/quiz 부족 → `INSUFFICIENT_<TYPE>_NODES`
- `recommended_order` 중복 → `DUPLICATE_ORDER_ID`
- `recommended_order` 누락 → `MISSING_ORDER_ID`
- topic 불일치 → `TOPIC_MISMATCH`

### 2. 단일 경로 통합

- `evaluateLearningTree`가 내부에서 `learningTreeQualityWarnings` 검사 항목을 `failures`(`warn`)로 생성한다.
- `learningTreeQualityWarnings`는 하위 호환을 위해 유지하되, 내부적으로 같은 검사 로직을 공유하거나 `failures`에서 message만 추출하도록 위임한다.
- `generate-tree.ts`의 기존 호출(`qualityWarnings`)은 동작을 유지한다(로그/응답 형식 회귀 없음).

### 3. 회귀 방지

- 기존 경고 메시지 문자열을 바꾸더라도, 트리 생성 응답·로그 계약이 깨지지 않는지 확인한다.
- `nodeDetailQualityWarnings`도 동일 패턴으로 정리할 수 있도록 code 체계를 공유한다(상세 구현은 Phase 14).

## 완료 기준(DoD)

- `learningTreeQualityWarnings`가 만들던 모든 경고가 `TreeEvalResult.failures`에 동등하게 나타난다.
- 같은 문제를 두 곳에서 중복 검사하지 않는다.
- `generate-tree.ts` 동작이 회귀 없이 유지된다.

## 검증 명령

```bash
cd apps/web
npm run eval:tree
npm run check
```
