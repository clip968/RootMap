# Phase 2 품질 검증 기록

이 문서는 `10-admin-and-phase2-quality-tests.md`의 산출물로, Phase 2 task 01~09 구현 상태를 명세 완료 조건과 테스트 케이스에 맞춰 검증한 기록이다.

## 자동 검증

```bash
cd apps/web
npm run phase2:smoke
npm run check
```

`phase2:smoke`는 LLM/API 호출 없이 fixture와 임시 SQLite DB(`data/phase2-smoke.db`)를 사용한다.

검증 범위:

1. Concept DDL 및 마이그레이션 적용
2. Concept 저장소 resolution(title/alias/domain)과 slug 할당
3. LLM 스키마의 `concept_candidate`, `edges` 호환 fixture 저장
4. 트리 생성 후 Concept/Edge/learning_tree_concepts 영속화
5. `reuse_concepts` 기반 재사용/신규 생성 분기
6. Concept 목록·상세·간선·트리 참조 조회 저장소
7. `user_concept_progress` 저장 및 추천 계층 입력으로 사용 가능한 map 조회
8. 트리 UI API payload의 재사용 표시 필드(`concept_id`, `is_reused_concept`, `concept_tree_count`)
9. Concept 기반 상세 설명 재사용(`from_concept_store`)

## 명세 §18 테스트 케이스 매핑

### 1. Transformer → BERT

자동 fixture 순서:

1. `Transformer` 트리 저장
2. `Softmax` 상세 설명 저장으로 Concept explanation 보강
3. `BERT` 트리 저장

확인 항목:

- 모든 learning node가 `concept_id` 및 `learning_tree_concepts` 행을 가진다.
- `Transformer`, `self-attention`, `embedding`은 BERT 트리에서 `is_reused_concept=true`이다.
- `masked language modeling`은 신규 Concept이다.
- 기존 `Softmax` 설명이 BERT 트리의 상세 패널에서 `from_concept_store=true`로 재사용된다.
- prerequisite/part_of Concept Edge가 저장된다.

### 2. Rust lifetime → Borrow checker

자동 fixture 순서:

1. `Rust lifetime` 트리 저장
2. `Borrow checker` 트리 저장

확인 항목:

- `ownership`, `borrowing`, `reference`, `lifetime`이 Borrow checker 트리에서 재사용된다.
- Rust domain 안에서 title/alias 기반 resolution이 동작한다.

### 3. Softmax 표현 중복 처리

자동 fixture 순서:

1. `Softmax`
2. `소프트맥스`
3. `softmax function`
4. `Transformer attention`

확인 항목:

- Softmax 계열 표현은 하나의 Concept으로 유지된다.
- alias에 `소프트맥스`, `softmax function`이 유지된다.
- Transformer attention 트리의 Softmax는 기존 Concept을 재사용한다.

### 4. 비슷하지만 다른 개념 분리

자동 fixture:

- `Attention`
- `Self-Attention`
- `Multi-Head Attention`
- `Cross Attention`

확인 항목:

- 네 개념은 서로 다른 Concept으로 저장된다.
- 자동 재사용/병합하지 않고 `pending` 병합 후보를 남긴다.
- 관계는 `related` 또는 `part_of` Edge로 저장된다.

## 최소 관리자/개발자 화면

- 경로: `/admin/concepts`
- 접근 통제: `NODE_ENV=development` 또는 `ROOTMAP_ADMIN_ENABLED=true`에서만 활성화
- 제공 기능:
  - Concept 목록
  - title/normalized title/alias 검색
  - domain 필터
  - Concept 상세
  - 연결 Edge 목록
  - 해당 Concept을 사용하는 트리 목록
  - `concept_merge_candidates` 상태별 필터

## Phase 2 완료 조건 대조

| 명세 §20 완료 조건 | 검증 방식 | 상태 |
|---|---|---|
| 1. 학습 트리 노드가 Concept Node로 저장 | `phase2:smoke`의 `assertAllNodesLinked` | 충족 |
| 2. 같은 개념 재사용 | Transformer→BERT, Rust lifetime→Borrow checker, Softmax 중복 fixture | 충족 |
| 3. Concept 간 prerequisite 관계 저장 | `concept_edges` count 및 fixture edge 검증 | 충족 |
| 4. Learning Node와 Concept Node 연결 | `learning_nodes.concept_id`, `learning_tree_concepts` count 검증 | 충족 |
| 5. Concept 단위 이해 상태 저장 | `upsertUserConceptProgress`, `getConceptProgressMapForUser` 검증 | 충족 |
| 6. 기존 Concept 설명 재사용 | BERT Softmax 상세 응답 `from_concept_store=true` 검증 | 충족 |
| 7. 4개 테스트 케이스에서 중복/오병합 통제 | 명세 §18 fixture 4종 자동화 | 충족 |
| 8. 학습 트리 중심 UX 유지 | 기존 `/`, `/tree/[treeId]` 유지 + admin은 dev 전용 별도 경로 | 충족 |
