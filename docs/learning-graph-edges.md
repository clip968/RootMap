# 학습 그래프 edge 품질 (Phase 13)

이 문서는 RootMap 학습 트리의 **edge(개념 간 관계)** 를 단순 위상 관계에서 "근거·확신도·blocking
여부를 가진 학습 관계"로 끌어올린 Phase 13 작업을 설명한다. 명세 출처는
`docs/specs/learning-quality-and-tutoring-spec.md` Section 2다.

## 한 줄 요약

트리를 더 화려하게 만든 게 아니라, **edge가 "왜 이 순서로 공부해야 하는가"를 스스로 설명**하게 했다.

## edge 품질 필드

`LlmConceptEdge`(`apps/web/src/types/learning.ts`)에 세 필드를 추가했다. 모두 optional이며, 없으면
파서·뷰·API가 기본값으로 보정하므로 **옛 트리에서도 화면이 깨지지 않는다(하위 호환)**.

| 필드 | 의미 | 기본값(보정) |
| --- | --- | --- |
| `explanation` | 왜 이 관계인가(한 문장 근거). 기존 `reason`을 필수화·구체화한 것. | `reason` → 빈 문자열 |
| `confidence` | 관계 확신도 0~1. cycle repair·`prerequisite_score`의 입력. | `0.5` |
| `is_blocking` | 이걸 모르면 다음 개념 이해가 막히는가. **prerequisite에서만 의미**. Phase 15 unlock 게이트의 입력. | `false` |

보정이 끝나 "항상 채워진" 형태는 `LearningEdgeQuality` 타입이다. 명세는 relation_type을 4종으로
좁히지만, RootMap은 cross-community link 식별에 `application_of`/`example_of`가 필요해 6종
`ConceptRelationType`을 그대로 유지한다.

## 하위 호환 경계 (건드리지 않은 것)

- **depth·`recommended_order`는 여전히 `prerequisite` 관계만으로 계산한다.** 비-prerequisite 관계
  (`related`, `application_of` 등)는 위상 계산에 전혀 들어가지 않고 뷰의 추가 정보로만 전달된다.
  → `deriveLearningGraphView(nodes, edges)`의 `edges` 인자는 depth/순서를 바꾸지 않는다(smoke로 고정).
- edge 품질 필드가 없는 기존 트리도 그대로 동작한다.
- 자동 edge 삭제/수정은 하지 않는다. transitive reduction·cycle repair는 **제안만** 한다.

## 그래프 품질 보강 (`apps/web/src/lib/tree/graph-quality.ts`)

1. **transitive reduction** (`computeTransitiveReduction`)
   - A→B, B→C, A→C가 모두 있으면 A→C는 우회 경로로 이미 함의되므로 `redundant`로 분류한다.
   - 원본은 절대 삭제하지 않고 `reduced`/`redundant`로 "분류"만 해 시각 복잡도를 낮추도록 돕는다.
   - prerequisite 관계만 대상. 비-prerequisite는 항상 `reduced`에 남는다.

2. **cross-community link 식별** (`identifyCrossCommunityLinks`)
   - 서로 다른 community를 잇는 `related`/`application_of` edge를 식별해 UI에서 별도 스타일로 표시한다.
   - "다른 묶음의 개념이 사실 연결돼 있다"는 통찰을 준다.

3. **cycle repair 후보** (`proposePrerequisiteCycleRepairs`)
   - `detectPrerequisiteCycles`가 찾은 사이클마다 **confidence가 가장 낮은 간선**을 "끊을 후보"로 제시한다.
   - 자동 적용하지 않는다. `evaluateLearningTree`는 사이클을
     `{ severity: "error", code: "PREREQUISITE_CYCLE" }` failure로 보고하고, 메시지 끝에
     `끊을 후보: c→a(confidence 0.20)` 형태로 후보를 덧붙인다.

## UI 동작 (`tree-page-client.tsx`)

- edge 중앙의 칩에 마우스를 올리거나(hover) **키보드로 포커스**하면 관계 근거 카드가 뜬다(접근성 유지).
- 카드: `"{from}" → "{to}"`, 관계 타입 라벨, 근거(explanation), 확신도.
- `is_blocking=true`인 prerequisite은 칩에 강조 표시와 "이걸 모르면 막힘" 배지를 보여준다.
- 비-prerequisite 관계는 점선 + 관계 타입별 색으로 그려 계층선과 구분한다.
- cross-community 연결은 더 굵은 점선(분홍)으로 강조한다.
- **근거가 비어 있으면 관계 타입만 표시**하고 카드는 "아직 관계 근거가 없습니다."로 떨어진다(깨지지 않음).

## eval 점수 비교 (Phase 12 baseline 대비)

`npm run eval:tree` (결정적 합성 baseline, LLM 무호출) 기준.

| 항목 | Phase 12 | Phase 13 | 비고 |
| --- | --- | --- | --- |
| coverage / prerequisite / pedagogy / ordering / detail (평균) | 1.00 | 1.00 | 회귀 없음 |
| error failures | 0 | 0 | 유지 |
| warn failures | 10 | 10 | 유지 |

- 합성 baseline 트리는 edge에 `reason`(=explanation 소스)을 채우므로 새 경고
  `EDGE_MISSING_EXPLANATION`이 발생하지 않는다.
- `EDGE_MISSING_EXPLANATION`(warn)은 **실제 LLM 트리에서 edge에 근거가 비었을 때만** 뜬다. 즉, edge
  근거 강제는 점수를 깎지 않고 "보정이 일어났다"는 신호만 남긴다.
- depth·`recommended_order`가 prerequisite-only로 유지되므로 `ordering_score`는 회귀하지 않는다.

## 검증

```bash
cd apps/web
npm run phase6:graph-quality-smoke   # transitive reduction·cross-community·cycle repair·depth 하위호환
npm run eval:tree                    # 점수 회귀 없음, error 0
npm run check                        # lint + build
```
