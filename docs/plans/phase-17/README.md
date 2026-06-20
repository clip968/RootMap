# RootMap Phase 17 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 7 (시각화: "종류 추가"보다 "개념별 worked example")** 를 작업 단위로 쪼갠 실행 계획을 담는다.

Phase 17의 핵심은 visual type을 무작정 늘리는 것이 아니라, CS 개념에 특화된 단계별 풀이(worked example)를 추가하는 것이다. 현재 `visual-block-schema.ts`의 8종(`linear_space, mapping_table, flow_pipeline, timeline, layer_stack, tree_graph, state_machine, compare_matrix`)은 잘 잡혀 있고 `superRefine` 내부 참조 검증도 있다. 여기에 `worked_example` 하나를 기존 8종과 동일한 계약·렌더러 패턴으로 추가한다.

## Phase 17 핵심 목표

1. `worked_example`을 `VISUAL_BLOCK_TYPES`·`visualDecisionSchema.skill` enum·Zod 스키마에 추가한다.
2. worked_example 렌더러를 추가하고 `visual-block-renderer.tsx`에 등록한다.
3. `hasRequiredNodeDetailVisual`의 decision-skill 일치 규칙을 worked_example에도 적용한다.
4. 개념별 시각화 매핑 가이드를 프롬프트에 반영한다(예: B-tree → tree_graph + worked_example).
5. `phase7:visual-block-schema` 계열 smoke가 새 타입을 커버한다.
6. 기존 8종 동작과 backward compatibility를 유지한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-worked-example-contract-and-scope.md](./00-worked-example-contract-and-scope.md) | worked_example 계약과 backward compatibility 고정 | P0 |
| 1 | [01-worked-example-schema.md](./01-worked-example-schema.md) | 타입·Zod 스키마·skill enum·superRefine 추가 | P0 |
| 2 | [02-worked-example-renderer.md](./02-worked-example-renderer.md) | 렌더러 구현과 renderer 등록 | P1 |
| 3 | [03-concept-visual-mapping-prompts.md](./03-concept-visual-mapping-prompts.md) | 개념-시각화 매핑 프롬프트 가이드 | P1 |
| 4 | [04-worked-example-smoke-and-quality-gate.md](./04-worked-example-smoke-and-quality-gate.md) | smoke fixture, 문서, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-worked-example-contract-and-scope.md](./00-worked-example-contract-and-scope.md) - worked_example 계약과 범위 고정
- [ ] 01. [01-worked-example-schema.md](./01-worked-example-schema.md) - worked_example 타입·스키마·skill enum 추가
- [ ] 02. [02-worked-example-renderer.md](./02-worked-example-renderer.md) - worked_example 렌더러와 등록
- [ ] 03. [03-concept-visual-mapping-prompts.md](./03-concept-visual-mapping-prompts.md) - 개념-시각화 매핑 프롬프트 가이드
- [ ] 04. [04-worked-example-smoke-and-quality-gate.md](./04-worked-example-smoke-and-quality-gate.md) - smoke와 최종 품질 gate

## 범위 요약

### 포함

- `worked_example` 타입(`problem`, `steps[]`, `final_answer`, `common_mistake?`)
- `VISUAL_BLOCK_TYPES`·skill enum·Zod 스키마·superRefine 확장
- worked_example 렌더러와 `visual-block-renderer.tsx` 등록
- 개념별 시각화 매핑 프롬프트 가이드
- 새 타입 smoke fixture와 fallback 검증

### 제외

- 기존 8종 visual block의 구조 변경
- LLM이 SVG/HTML/Mermaid를 직접 생성하는 방식(JSON props만 사용)
- 외부 이미지 생성 모델
- 새 visual type의 추가 확장(worked_example 하나만)
- 노드 상세 first-pass 지연 정책 변경(Phase 07 기조 유지)

## 의사결정 포인트

- worked_example은 기존 8종과 동일한 계약·렌더러·fallback 패턴을 따른다.
- decision.skill과 block.type 일치 규칙(`hasRequiredNodeDetailVisual`)을 그대로 적용한다.
- `common_mistake`는 Phase 14의 오개념 자산과 연결한다.
- 숫자 계산이 필요한 step의 `intermediate_value`는 가능하면 frontend에서 재검증한다(Phase 07 기조).
- LLM은 그림이 아니라 `visual_blocks` JSON만 생성한다.

## 완료 조건

Phase 17이 끝나면 `worked_example`이 9번째 visual skill로 schema·renderer·smoke에서 모두 지원되며, 사용자는 설명을 읽는 데서 끝나지 않고 "문제가 주어졌을 때 어떻게 푸는지"를 단계별로 본다. 기존 8종 동작과 첫 응답 지연 정책은 회귀 없이 유지된다.

최종 검증은 `apps/web`에서 `npm run phase7:visual-detail-smoke`, `npm run lint`, `npm run build`가 통과하는 것으로 고정한다.
