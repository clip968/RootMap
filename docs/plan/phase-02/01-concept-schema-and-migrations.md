# 01. Concept 스키마 및 마이그레이션

## 목표

Phase 2에서 정의된 테이블을 DB에 추가하고, Phase 1 `learning_nodes`와의 외래키 관계를 맞춘다.

## 관련 명세

- `rootmap_phase_2_spec.md` 7장 데이터 모델
- 동일 명세 8장 기존 Phase 1 테이블 변경
- 동일 명세 15장 `user_concept_progress`

## 구현 작업

### 1. `concepts` 테이블

명세 스키마대로 필드 추가. 특히 다음을 준수한다.

- `slug` UNIQUE NOT NULL
- `normalized_title` NOT NULL — 중복 비교 기준 1순위
- `aliases` JSONB 기본 빈 배열

### 2. `concept_edges` 테이블

- `(from_concept_id, to_concept_id, relation_type)` UNIQUE
- `prerequisite`: `from`이 먼저 배워야 할 개념

### 3. `learning_tree_concepts`

- `(tree_id, learning_node_id, concept_id)` UNIQUE
- `role_in_tree`: `prerequisite`, `core`, `supplementary`, `misconception`, `quiz`

### 4. `concept_merge_candidates`

- Phase 2 초기에는 자동 병합 최소화; 후보 적재만 해도 충분
- `status`: `pending`, `approved`, `rejected`, `merged`
- 우선순위 경계: DDL과 타입 정의는 01에서 만들어 두되, 후보 자동 적재·승인/거절 UI·병합 처리 고도화는 04·10의 P2 범위로 둔다.

### 5. `user_concept_progress`

- `(user_id, concept_id)` UNIQUE
- Phase 1과 동일한 사용자 식별 전략(세션 또는 임시 ID) 유지

### 6. `learning_nodes` 확장

```sql
ALTER TABLE learning_nodes
ADD COLUMN concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL;
```

## 마무리 체크

- 마이그레이션은 기존 Phase 1 데이터를 깨뜨리지 않는 순서로 적용한다(먼저 `concepts`, 이후 FK).
- 인덱스: `normalized_title`, `domain`, GIN aliases(플랫폼에 맞게) 검토.
