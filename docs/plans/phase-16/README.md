# RootMap Phase 16 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 5 (문서 기반 모드의 "근거성" 강화)** 를 작업 단위로 쪼갠 실행 계획을 담는다.

Phase 16의 핵심은 문서 기반 트리의 완성도를 "근거성"으로 끌어올리는 것이다. 즉 "이 설명은 문서 어디에서 왔는가?"에 답할 수 있어야 한다. RootMap은 이미 `evaluateEvidenceGrounding`(어휘 겹침 기반 `groundedness_score`)와 `DocumentSourceType`(explicit/inferred/generated), `ApiLearningNode.document_context.evidence`를 가진다. 여기에 노드 단위 source span, 근거/보강 분리 표시, RAG 평가 지표, 스캔본 감지를 더한다.

## Phase 16 핵심 목표

1. 모든 문서 기반 노드에 `DocumentGrounding`(source span + `support_type`)을 붙인다.
2. 상세 설명·퀴즈를 "문서 근거"와 "AI 보강 설명"으로 분리 표시한다.
3. `DocumentEvalResult`(context precision/recall/faithfulness)를 산출한다.
4. citation correctness와 citation faithfulness를 분리해 본다.
5. 스캔본·표·그림 위주 문서를 감지해 안내한다(OCR 미도입).
6. `npm run eval:document`로 문서 근거성을 평가한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-document-grounding-contract-and-scope.md](./00-document-grounding-contract-and-scope.md) | 근거성 계약과 기존 자산 재사용 경계 | P0 |
| 1 | [01-node-source-span-grounding.md](./01-node-source-span-grounding.md) | `DocumentGrounding` source span 부착 | P0 |
| 2 | [02-evidence-vs-augmentation-display.md](./02-evidence-vs-augmentation-display.md) | 문서 근거 vs AI 보강 분리 표시 | P0 |
| 3 | [03-document-eval-result-metrics.md](./03-document-eval-result-metrics.md) | `DocumentEvalResult` RAG 지표 산출 | P1 |
| 4 | [04-scanned-pdf-detection.md](./04-scanned-pdf-detection.md) | 스캔본 감지와 안내 처리 | P1 |
| 5 | [05-eval-document-and-quality-gate.md](./05-eval-document-and-quality-gate.md) | `eval:document` runner, 문서, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-document-grounding-contract-and-scope.md](./00-document-grounding-contract-and-scope.md) - 근거성 계약과 범위 고정
- [ ] 01. [01-node-source-span-grounding.md](./01-node-source-span-grounding.md) - 노드 source span 부착
- [ ] 02. [02-evidence-vs-augmentation-display.md](./02-evidence-vs-augmentation-display.md) - 근거 vs 보강 분리 표시
- [ ] 03. [03-document-eval-result-metrics.md](./03-document-eval-result-metrics.md) - `DocumentEvalResult` 지표 산출
- [ ] 04. [04-scanned-pdf-detection.md](./04-scanned-pdf-detection.md) - 스캔본 감지와 안내
- [ ] 05. [05-eval-document-and-quality-gate.md](./05-eval-document-and-quality-gate.md) - `eval:document`와 최종 품질 gate

## 범위 요약

### 포함

- `DocumentGrounding`(document_id, chunk_id, page, quote, support_type) 노드 부착
- 문서 근거 vs AI 보강 분리 표시(데이터 + UI)
- `DocumentEvalResult`(context precision/recall/faithfulness, unsupported_claims, source_span_errors)
- `evaluateEvidenceGrounding` 확장(faithfulness 일반화)
- 스캔본 감지 → 안내 → 텍스트 PDF/TXT/MD 재요청
- `npm run eval:document` runner

### 제외

- 스캔본 OCR 파이프라인(단기 비도입)
- 표/그림 구조화 추출
- RAG chat 인터페이스
- LLM judge 기반 평가의 PR 단위 상시 실행(수동/nightly로 제한)
- 문서 처리 파이프라인의 chunking 전략 재설계

## 의사결정 포인트

- `support_type`(`direct | inferred`)은 기존 `DocumentSourceType`(`explicit/inferred/generated`)과 정합되게 매핑한다.
- citation이 달렸다고 모델이 그 근거를 실제 사용했다고 보장하지 않으므로 correctness와 faithfulness를 분리한다.
- 기본 평가는 `evaluateEvidenceGrounding`처럼 LLM 무호출 어휘 기반으로 두고, LLM judge는 수동/nightly로만 실행한다(`docs/llm-evaluation.md`).
- 스캔본은 OCR을 붙이지 않고 "추출 텍스트량 임계 이하 → 명시적 안내 후 실패"로 처리한다.

## 완료 조건

Phase 16이 끝나면 문서 기반 노드가 source span 근거를 가지며, UI에서 "문서 근거"와 "AI 보강 설명"이 구분된다. `npm run eval:document`가 context precision/recall/faithfulness와 unsupported claims를 보고하고, 스캔본 PDF는 명확한 안내와 함께 실패 처리된다.

최종 검증은 `apps/web`에서 `npm run eval:document`, `npm run document:detail-smoke`, `npm run check`가 통과하는 것으로 고정한다.
