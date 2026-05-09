# 05. 학습 트리 생성 API Phase 2 확장

## 목표

`POST /api/trees/generate`가 Phase 2 요청·응답 계약을 지원하고, 노드별 Concept 재사용 여부를 노출한다.

## 관련 명세

- 11장 `POST /api/trees/generate` 예시

## 구현 작업

### 1. Request

```json
{ "topic": "...", "reuse_concepts": true }
```

- 기본값: 기존 Phase 1 클라이언트 호환되도록 명시적 기본(예: `true` 또는 `false`)을 정하고 변경 시 클라이언트 동시 수정.

### 2. Response

각 노드에 최소 포함:

- `concept_id`(UUID 또는 null 허용 정책)
- `is_reused_concept`(boolean)

### 3. 파이프라인 연결

- 04 태스크에서 완료된 후 Concept ID가 채워진 상태로 응답을 만든다.
- Phase 1 필드(topic, summary, nodes 구조 등)는 깨지지 않도록 유지.

### 4. 에러 처리

Concept 저장 실패 시 사용자에게 무엇을 보여줄지(전체 트리 실패 vs 개념 없이 트리만) 단일 정책으로 고정한다.

### 5. `reuse_concepts` 서버 정책

- `reuse_concepts: true`: 02의 검색·해석 결과를 사용해 기존 Concept을 우선 연결하고, 가능한 경우 기존 Concept의 요약/설명/edge를 03 프롬프트 컨텍스트로 주입한다.
- `reuse_concepts: false`: 기존 Concept 자동 연결은 하지 않는다. 단, 생성된 노드는 새 Concept으로 저장해 이후 재사용 대상이 되게 한다.
- 기본값은 Phase 1 호환성과 Phase 2 핵심 목표 중 무엇을 우선할지 결정해 Request 섹션과 08 UI 토글 기본값에 동일하게 반영한다.

### 6. 명세 §3 항목 5와의 관계

- “컨셉 기반으로 트리를 다시 생성·보강”은 Phase 2에서 **별도 엔드포인트 필수 여부보다**, `reuse_concepts: true`일 때 **단일 생성 호출 안에서** 충족하는 것을 기본안으로 한다.
- 구현 방식은 03과 맞춰, 기존 Concept 검색 결과를 LLM 컨텍스트로 넣거나 concept-aware 프롬프트를 선택하는 방식으로 고정한다.
- 단일 호출로 품질이 부족할 때만 2단계 호출 또는 추가 API를 별도 후속 태스크로 정의한다.
