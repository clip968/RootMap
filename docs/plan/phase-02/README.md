# RootMap Phase 2 구현 계획

이 폴더는 `docs/spec/rootmap_phase_2_spec.md`를 기준으로 Concept Node Store와 재사용 플로우를 작업 단위별로 쪼갠 실행 계획을 담는다.

## Phase 2 핵심 목표

Phase 1에서 생성된 학습 트리 노드를 재사용 가능한 내부 개념(`Concept`)으로 저장하고, 동일하거나 유사한 개념을 탐색·연결·재사용해 다른 주제 학습 트리에서 불필요한 중복 생성을 줄인다.

핵심 판단 기준:

> 한 번 생성된 개념을 저장하고, 다른 학습 주제에서 다시 사용할 수 있는가?

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 1 | [01-concept-schema-and-migrations.md](./01-concept-schema-and-migrations.md) | Concept 관련 DDL, Phase 1 `learning_nodes` 확장 마이그레이션 | P0 |
| 2 | [02-concept-repository-and-resolution.md](./02-concept-repository-and-resolution.md) | 저장소·검색(정규화 제목·alias·domain)·슬러그 규약 | P0 |
| 3 | [03-phase2-llm-schema-and-prompts.md](./03-phase2-llm-schema-and-prompts.md) | 트리 LLM 출력에 `concept_candidate`·간선 스키마, 프롬프트 확장 | P0 |
| 4 | [04-post-generation-concept-persistence.md](./04-post-generation-concept-persistence.md) | 생성 후 Concept 해석·연결·edge·`learning_tree_concepts` 영속 파이프라인 | P0 |
| 5 | [05-tree-generate-api-extension.md](./05-tree-generate-api-extension.md) | `POST /api/trees/generate` 확장 (`reuse_concepts`) 및 응답 필드 | P0 |
| 6 | [06-concepts-api.md](./06-concepts-api.md) | Concept CRUD 조회·간선·트리 참조 REST API | P1 |
| 7 | [07-progress-recommendations-concept-layer.md](./07-progress-recommendations-concept-layer.md) | `user_concept_progress`, 추천 로직 확장, 상세 재사용 연동 | P1 |
| 8 | [08-tree-ui-concept-indicators.md](./08-tree-ui-concept-indicators.md) | 트리 화면에 신규/재사용·상태 표시 | P1 |
| 9 | [09-node-detail-topic-context-ui.md](./09-node-detail-topic-context-ui.md) | Concept 기반 상세 패널·주제 맥락 UX | P1 |
| 10 | [10-admin-and-phase2-quality-tests.md](./10-admin-and-phase2-quality-tests.md) | 최소 관리자 조회 화면, 병합 후보, 명세 테스트 케이스 | P2 |

## Phase 2 범위 요약

### 포함

- `concepts`, `concept_edges`, `learning_tree_concepts`, `concept_merge_candidates`(DDL·스키마는 포함; 자동 적재·관리 UI 고도화는 명세 19장 3순위), `user_concept_progress`
- 트리 생성 시 Concept 저장·재사용·연결 및 prerequisite 등 관계 영속화
- title/alias/domain 중심 기존 Concept 검색(embedding·LLM 동일성은 3순위)
- Concept 조회 API와 트리 생성 API 확장
- Concept 진행 상태와 추천 고려
- 트리 중심 UI에 재사용/상태 표시 및 상세 패널 확장

### 제외

- PDF·문서 업로드, RAG, 사용자 간 공유, 왕성한 wiki 편집기, 복잡한 그래프 시각화(명세 3절·5절과 동일)

## 완료 조건

`rootmap_phase_2_spec.md` 20장 Phase 2 완료 조건 8항목을 만족한다. 특히 명세 18장 테스트 케이스 4종을 자동 또는 수동 절차로 반복 검증 가능하게 둔다.
