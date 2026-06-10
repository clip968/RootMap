# 01. LearningEdgeQuality 스키마와 LLM 출력 확장

## 목표

`LlmConceptEdge`를 `LearningEdgeQuality`로 확장하고, LLM 트리 생성이 관계 근거·확신도·blocking 여부를 출력하게 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 2.2

## 관련 파일

- `apps/web/src/types/learning.ts` (`LlmConceptEdge`, `LearningTreeResponse.edges`)
- `apps/web/src/lib/llm/schemas.ts` (edge zod 스키마)
- `apps/web/src/lib/llm/prompts.ts` (트리 생성 프롬프트)
- `apps/web/src/lib/llm/generate-tree.ts`

## 구현 작업

### 1. 타입/스키마 확장

- `LlmConceptEdge`에 `explanation: string`, `confidence: number`, `is_blocking: boolean`을 추가한다.
- `reason`은 `explanation`으로 통합하되, 기존 데이터 호환을 위해 파서에서 `reason`→`explanation` 매핑 fallback을 둔다.
- zod 스키마에서 `confidence`는 0~1, `explanation`은 최소 길이를 요구한다.

### 2. 프롬프트 갱신

- 트리 생성 프롬프트가 각 edge에 대해 "왜 이 관계인가"를 한 문장으로 쓰고, prerequisite인 경우 `is_blocking`을 판단하도록 지시한다.
- 예시 출력을 프롬프트에 포함해 형식을 고정한다.

### 3. 파서 하위 호환

- `explanation`/`confidence`/`is_blocking`이 없으면 기본값(`reason` 또는 빈 문자열, `confidence=0.5`, `is_blocking=false`)으로 보정한다.
- 보정이 일어나면 `learningTreeQualityWarnings`(Phase 12 `failures`)에 `warn`으로 기록한다.

## 완료 기준(DoD)

- LLM edge 출력이 `explanation`(필수)·`confidence`·`is_blocking`을 포함한다.
- 기존 `reason`만 있는 데이터도 파서에서 정상 보정된다.
- zod 스키마가 `confidence` 범위와 `explanation` 길이를 검증한다.

## 검증 명령

```bash
cd apps/web
npm run llm:smoke-parse
npm run check
```
