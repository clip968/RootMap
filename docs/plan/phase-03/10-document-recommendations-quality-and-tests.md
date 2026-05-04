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

## 완료 조건

- 문서 기반 추천 로직이 source type과 중요도를 고려한다.
- 명세 16장의 오류 케이스가 재현 가능하고 사용자 메시지가 준비되어 있다.
- 3개 테스트 문서에 대한 자동 또는 수동 테스트 절차가 정리되어 있다.
- Phase 3 최소 품질 기준과 완료 조건을 대조할 수 있다.
