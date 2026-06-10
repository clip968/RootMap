# 03. 개념-시각화 매핑 프롬프트 가이드

## 목표

LLM이 개념에 맞는 시각화 조합(특히 worked_example)을 선택하도록 프롬프트에 개념-시각화 매핑 가이드를 반영한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 7.2

## 관련 파일

- `apps/web/src/lib/llm/prompts.ts`
- `apps/web/src/lib/llm/generate-node-detail-visual.ts`
- `apps/web/src/lib/visualization/visual-block-schema.ts` (`visualDecisionSchema`)

## 구현 작업

### 1. 매핑 가이드 추가

프롬프트에 개념 유형별 권장 시각화 조합을 예시로 제공한다.

```text
가상 메모리            → linear_space + mapping_table
Rust lifetime          → timeline + state_machine
Transformer attention  → flow_pipeline + mapping_table
B-tree index           → tree_graph + worked_example(trace table)
TCP congestion control → timeline + state_machine
```

### 2. worked_example 선택 기준

- 계산·추적이 필요한 개념(주소 변환, B-tree 삽입, congestion window 변화 등)에서 worked_example을 우선 고려하도록 지시한다.
- worked_example은 "문제 → 단계 → 최종 답"이 성립하는 개념에만 쓰도록 가이드한다.

### 3. 과생성 방지

- 모든 개념에 worked_example을 강제하지 않는다(부적절하면 `should_visualize=false` 또는 다른 skill).
- decision.skill과 block.type 일치 규칙을 지키도록 프롬프트에 명시한다.

## 완료 기준(DoD)

- 프롬프트에 개념-시각화 매핑 가이드가 포함된다.
- 계산/추적 개념에서 worked_example이 선택될 수 있다.
- 부적절한 개념에 worked_example이 강제되지 않는다.

## 검증 명령

```bash
cd apps/web
npm run phase7:visual-detail-prompts
npm run check
```
