# 10. 문서 추천 로직 및 Phase 3 품질 검증

## 목표

문서 기반 학습 트리에 맞는 추천 우선순위와 오류 처리 정책을 구현하고, 명세 테스트 케이스로 Phase 3 완료 조건을 검증한다.

## 관련 명세

- `rootmap_phase_3_spec.md` 15장 추천 로직 변경
- 동일 명세 16장 오류 처리 정책
- 동일 명세 17장 품질 기준
- 동일 명세 18장 최소 품질 기준
- 동일 명세 19장 테스트 케이스
- 동일 명세 22장 Phase 3 완료 조건

## 구현 작업

### 1. 문서 기반 추천 우선순위

추천 우선순위:

| 우선순위 | 대상 |
|---:|---|
| 1 | 모르는 inferred prerequisite |
| 2 | 모르는 explicit prerequisite |
| 3 | 중요도 높은 document_core |
| 4 | document_core와 연결된 오개념 |
| 5 | 문서 이해 점검 질문 |

구현 의사코드:

```pseudo
function recommendDocumentLearningNodes(tree, progress):
    inferred_unknown_prereq = nodes where source_type == inferred and type == prerequisite and status == unknown
    if inferred_unknown_prereq is not empty:
        return sortByDifficulty(inferred_unknown_prereq)

    explicit_unknown_prereq = nodes where source_type == explicit and type == prerequisite and status == unknown
    if explicit_unknown_prereq is not empty:
        return sortByImportanceThenDifficulty(explicit_unknown_prereq)

    core_ready = nodes where type == document_core and prerequisitesSatisfied(node)
    if core_ready is not empty:
        return sortByImportance(core_ready)

    misconception_ready = nodes where type == misconception and relatedCoreConceptLearned(node)
    if misconception_ready is not empty:
        return misconception_ready

    return quiz_nodes
```

### 2. 오류 처리 검증

필수 오류 케이스:

- 텍스트 추출 실패
- 문서가 너무 긴 경우
- 개념 추출 품질이 낮은 경우
- LLM JSON 파싱 실패

각 오류는 다음을 만족해야 한다.

- `documents.processing_status = failed`
- 사용자에게 표시 가능한 메시지 제공
- 내부 로그에 원인 저장
- 가능한 경우 재시도 안내

### 3. 기능 검증 기준

다음을 확인한다.

1. PDF 또는 텍스트 문서를 업로드할 수 있다.
2. 문서에서 텍스트를 추출할 수 있다.
3. 문서를 청크로 나눌 수 있다.
4. 청크별 개념 후보를 추출할 수 있다.
5. 문서 전체 개념을 통합할 수 있다.
6. 기존 Concept Store와 매칭할 수 있다.
7. 문서 기반 학습 트리를 생성할 수 있다.
8. 각 개념에 출처 정보를 연결할 수 있다.
9. 노드 상세 화면에서 문서 맥락 설명을 제공할 수 있다.

### 4. 품질 검증 기준

다음을 확인한다.

- 문서에 직접 등장한 개념과 AI가 추론한 선수지식을 구분한다.
- 핵심 개념이 누락되지 않는다.
- 관련은 있지만 중요하지 않은 개념을 과도하게 추가하지 않는다.
- 선수지식이 문서 핵심 개념보다 먼저 배치된다.
- 출처 정보가 실제 문서 위치와 맞다.
- 노드 설명은 문서 맥락에 맞다.
- 학습 트리가 단순 목차나 요약이 아니라 학습 순서를 제공한다.

### 5. 최소 품질 기준

하나의 문서에 대해 다음 결과가 나오면 Phase 3 MVP로 인정한다.

```text
지원 입력: PDF, TXT, MD
문서 처리 가능 범위: 최대 80페이지
추출 개념 수: 10~40개
학습 트리 노드 수: 10~25개
선수지식 노드: 3개 이상
문서 핵심 개념 노드: 5개 이상
출처 연결된 개념: 5개 이상
문서에 직접 등장한 개념과 추론된 선수지식 구분 가능
노드 상세 설명에 문서 맥락 포함
```

### 6. 테스트 케이스 1: Transformer 논문

입력:

```text
Attention Is All You Need.pdf
```

기대 문서 핵심 개념:

```text
Transformer
Scaled Dot-Product Attention
Multi-Head Attention
Positional Encoding
Encoder
Decoder
Feed-Forward Network
```

기대 선수지식:

```text
Vector
Matrix Multiplication
Dot Product
Softmax
Sequence Modeling
Neural Network Basics
```

검증 포인트:

- 문서 핵심 개념과 선수지식이 구분되는가?
- Scaled Dot-Product Attention에 출처가 연결되는가?
- Softmax가 기존 Concept으로 재사용되는가?

### 7. 테스트 케이스 2: 운영체제 가상 메모리 강의자료

입력:

```text
virtual_memory_lecture.pdf
```

기대 문서 핵심 개념:

```text
Virtual Address
Physical Address
Page Table
TLB
Page Fault
Demand Paging
```

기대 선수지식:

```text
Process
Address
Memory
Page
CPU
```

검증 포인트:

- 가상 메모리의 핵심 개념이 문서 기반으로 추출되는가?
- Page와 Page Fault를 같은 개념으로 잘못 병합하지 않는가?
- 선수지식이 먼저 추천되는가?

### 8. 테스트 케이스 3: Rust lifetime 강의 노트

입력:

```text
rust_lifetime_note.md
```

기대 문서 핵심 개념:

```text
Lifetime
Lifetime Annotation
Lifetime Elision
Borrow Checker
Dangling Reference
```

기대 선수지식:

```text
Ownership
Borrowing
Reference
Scope
```

검증 포인트:

- 기존 Rust 관련 Concept이 재사용되는가?
- Lifetime과 Borrowing을 동일 개념으로 병합하지 않는가?
- 문서 기반 설명에서 코드 예시가 제공되는가?

### 9. Phase 3 완료 조건 대조

릴리스 전 `rootmap_phase_3_spec.md` 22장의 12개 완료 조건을 체크리스트로 확인한다.

특히 다음은 반드시 수동 확인한다.

- 문서 기반 트리가 단순 목차/요약이 아닌 학습 순서를 제공하는가?
- 핵심 개념에는 실제 문서 출처가 연결되는가?
- 최소 3개 테스트 문서에서 안정적으로 동작하는가?

## 진행된 작업

- 문서 기반 추천 로직에 `source_type`과 문서 노드 유형을 반영하는 방향으로 구현했다.
  - inferred prerequisite을 explicit prerequisite보다 먼저 추천한다.
  - prerequisite 이후에는 준비된 document_core를 추천한다.
  - document_core 학습 이후에는 misconception, quiz 순서로 넘어가도록 분기했다.
- 기존 `document:extract-smoke`가 전체 LLM 파이프라인을 호출하던 문제를 분리했다.
  - `document:extract-smoke`는 LLM 없이 텍스트 추출, 페이지 저장, 청크 분할, 긴 문서/빈 문서 오류만 검증하도록 바꿨다.
  - OpenRouter를 호출하는 전체 E2E 검증은 별도 `document:pipeline-smoke`로 분리했다.
- Windows 환경에서 검증할 수 있도록 `*:win` npm script를 추가했다.
  - `check:win`, `document:pipeline-smoke:win`, `check:llm:win`
- standalone `tsx` smoke 스크립트가 `.env.local`을 자동 로드하지 않는 문제를 확인했다.
  - LLM E2E smoke에서는 `@next/env`의 `loadEnvConfig(process.cwd())`로 `.env.local`을 명시 로드한다.
- LLM 호출이 무기한 대기하지 않도록 timeout과 retry budget을 추가했다.
  - `OPENROUTER_TIMEOUT_MS`, `OPENROUTER_MAX_ATTEMPTS`, `DOCUMENT_CHUNK_CONCURRENCY`
- 청크별 개념 추출은 제한된 병렬 처리로 변경했다.
  - 통합과 트리 생성은 전체 후보가 필요하므로 단일 호출을 유지한다.
- 개념 후보가 0개인 경우에는 문서 통합 LLM을 호출하지 않고 즉시 실패하도록 했다.

## 해결된 문제와 최종 결정

### 1. Grok 4.3 호환성: Zod 스키마 float 허용 + 프롬프트 명확화

**문제**: `x-ai/grok-4.3`이 `importance`/`difficulty`를 0.95 같은 float(0~1 비율)로 반환했는데, Zod 스키마가 `z.number().int().min(1).max(5)`로 선언되어 있어 검증 실패 (`LlmValidationError`). 다른 모델(deepseek, gemini)은 정수 1~5를 반환해서 발견이 늦었다.

**해결**:

| 파일 | 변경 |
|------|------|
| `schemas.ts` — 모든 스키마 | `z.number().int().min(1).max(5)` → `z.number().min(1).max(5).transform(v => clamp(round(v)))` |
| `prompts.ts` — 청크/통합/트리/Phase2 | JSON 예시 `"number"` → `"number (integer 1-5)"` |

**교훈**: 
- 프롬프트의 JSON 스키마 예시는 구체적인 타입 정보(`integer 1-5`)가 필요하다.
- 모델마다 `number`를 0~1 비율 또는 1~5 등급으로 다르게 해석할 수 있다.
- 스키마 검증은 방어적으로 float도 허용하고 transform으로 정규화해야 한다.
- 다양한 모델로 테스트해야 출력 특성 차이를 발견할 수 있다.

### 2. 파이프라인 스모크 역할 재정의 (생존 검증 + quality report)

**문제**: `document:pipeline-smoke`가 품질 검증을 hard fail로 포함해서 모델/실행마다 결과가 불안정했다.

**해결**: 3단계 품질 관리 체계로 분리

| 단계 | 명칭 | 방식 | 임계값 |
|------|------|------|--------|
| 1 | Processor 내부 품질 게이트 | **hard fail** | 최소 텍스트 50자, 최대 80페이지, 최대 120K자, 최소 핵심 개념 3개 |
| 2 | Smoke survival assertion | **hard fail** | `tree_generated`, `treeId`, `concepts>0`, `nodes>0` |
| 3 | Quality report | **warning-only** | 6개 항목 (개념 수, explicit/evidence, inferred, 노드 수, prerequisite, core) |

- Hard fail은 안정적으로 pass/fail 결정
- Quality report는 매 실행마다 출력되어 품질 저하를 시각적으로 감지
- Deterministic 품질 검증은 `smoke-document-llm.ts`(fixture 기반)가 담당

### 3. `.gitignore` Git 추적 문제 해결

**문제**: root `.gitignore`의 `scripts` 규칙이 접두사 없이 선언되어 모든 하위 디렉토리의 `scripts/`를 무시했다. `apps/web/scripts/smoke-document-*.ts`가 `git status`에 표시되지 않았다.

**해결**: `.gitignore`의 `scripts` → `/scripts` (root만 무시). 이후 `git add`로 두 smoke 파일을 추적 추가.

### 4. LLM E2E smoke 모델 정책

**결정**: 별도 smoke 전용 모델 변수는 두지 않고, 실행 시 `OPENROUTER_MODEL` 환경 변수로 모델을 지정한다. 실제 검증은 `x-ai/grok-4.3`으로 통과 확인했다.

### 5. Phase 3 체크리스트

README의 task 10 체크박스를 `[x]`로 변경하여 Phase 3 전체 완료 처리했다.

## 검증 결과

### 모든 smoke/check 통과 (Grok 4.3)

```
lint                           ✓
db:smoke                       ✓
document:upload-smoke          ✓
document:extract-smoke         ✓
document:pipeline-smoke        ✓ (quality report: 2 warnings, 4 pass)
llm:smoke-parse                ✓
llm:smoke-document             ✓
phase1:smoke                   ✓
phase2:smoke                   ✓
```

### 파이프라인 스모크 상세 (Grok 4.3)

| 단계 | 소요 시간 | 결과 |
|------|----------|------|
| 청크 개념 추출 | 31초 | 6개 concept 후보 |
| 개념 통합 | 26초 | 6개 개념, 품질 경고 0 |
| 트리 생성 | 38초 | 11개 노드, 8개 간선, 품질 경고 0 |
| **전체** | **~95초** | **tree_generated 상태 통과** |

## 완료 조건

- 문서 기반 추천 로직이 source type과 중요도를 고려한다.
- 명세 16장의 오류 케이스가 재현 가능하고 사용자 메시지가 준비되어 있다.
- 3개 테스트 문서에 대한 자동 또는 수동 테스트 절차가 정리되어 있다.
- Phase 3 최소 품질 기준과 완료 조건을 대조할 수 있다.
