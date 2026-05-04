# RootMap Phase 2 Task Breakdown

## 목적

`docs/spec/rootmap_phase_2_spec.md`를 실행 가능한 개발 태스크로 변환한 문서다. 각 태스크는 `docs/plan/phase-02/01-*` ~ `10-*` 문서에 상세 계획이 있다.

## Milestone A: Concept 저장소 기반

### A1. 스키마와 마이그레이션

- `concepts`, `concept_edges`, `learning_tree_concepts`
- `concept_merge_candidates`(병합 후보)
- `user_concept_progress`
- `learning_nodes.concept_id` 추가

상세: [01-concept-schema-and-migrations.md](./01-concept-schema-and-migrations.md)

### A2. 저장소·해석 레이어

- 정규화 제목·alias·domain 기반 검색
- 새 Concept 생성·기존 Concept 연결
- slug 규약

상세: [02-concept-repository-and-resolution.md](./02-concept-repository-and-resolution.md)

## Milestone B: LLM 출력과 생성 파이프라인

### B1. Phase 2 LLM 스키마·프롬프트

- 노드별 `concept_candidate`
- 간선 배열 및 `relation_type`
- 선택: 동일 개념 판정·주제 맥락 보강 프롬프트

상세: [03-phase2-llm-schema-and-prompts.md](./03-phase2-llm-schema-and-prompts.md)

### B2. 생성 후 Concept 영속 파이프라인

- 노드 순회 후 기존 Concept 매칭 → 없으면 생성
- `concept_edges` 반영(LLM 간선을 concept id로 매핑)
- `learning_tree_concepts`·`learning_nodes.concept_id` 채움
- 애매한 중복은 `concept_merge_candidates`에 적재

상세: [04-post-generation-concept-persistence.md](./04-post-generation-concept-persistence.md)

## Milestone C: API

### C1. 트리 생성 API 확장

- `reuse_concepts` 요청 플래그
- 응답에 `concept_id`, `is_reused_concept`

상세: [05-tree-generate-api-extension.md](./05-tree-generate-api-extension.md)

### C2. Concept REST API

- `GET /api/concepts`, `GET/PATCH /api/concepts/:id`
- 간선 생성·조회, 개념이 쓰인 트리 목록

상세: [06-concepts-api.md](./06-concepts-api.md)

### C3. 진행·추천·상세와 Concept 연동

- `user_concept_progress` 읽기/쓰기
- 추천 로직에 concept 단위 상태 반영
- 노드 상세 시 기존 explanation 우선·보강 경로

상세: [07-progress-recommendations-concept-layer.md](./07-progress-recommendations-concept-layer.md)

## Milestone D: 사용자 UI

### D1. 트리 화면 표시

- 새 개념 vs 이전에 본 개념
- Concept 기반 이해 상태 표시(가능 시 다중 트리 사용 힌트)

상세: [08-tree-ui-concept-indicators.md](./08-tree-ui-concept-indicators.md)

### D2. Concept 상세 패널

- 명세 16.2 필수 요소(맥락·기존 설명·관련·선수지식·다른 트리)

상세: [09-node-detail-topic-context-ui.md](./09-node-detail-topic-context-ui.md)

## Milestone E: 관리·품질

### E1. 관리자·테스트·마무리

- 최소 Concept 목록·검색·domain 필터·edge·병합 후보
- 명세 18장 테스트 케이스 정리

상세: [10-admin-and-phase2-quality-tests.md](./10-admin-and-phase2-quality-tests.md)

## 권장 구현 순서

1. A1 스키마와 마이그레이션
2. A2 저장소·해석 레이어
3. B1 Phase 2 LLM 스키마·프롬프트
4. B2 생성 후 Concept 영속 파이프라인
5. C1 트리 생성 API 확장
6. C2 Concept REST API
7. C3 진행·추천·상세와 Concept 연동
8. D1 트리 화면 표시
9. D2 Concept 상세 패널
10. E1 관리자·테스트·마무리

## Phase 2에서 하지 않을 것

- PDF 업로드·유튜브·문서 RAG·자동 출처 인용
- 완전한 wiki 편집기·마크다운 KB
- 사용자 간 공유·고도 개인화 추천 알고리즘(Phase 4)
- LLM에 의한 대규모 자동 개념 수정

(명세 3장·21장과 정렬)

---

## 명세 대조 검증(요약)

아래 표는 `rootmap_phase_2_spec.md`의 절 번호와 계획 태스크를 대응시킨 것이다. **한 절이 여러 태스크에 걸치는 경우는 의도적인 분할**이다(예: DB는 01·동작은 04·표면 API는 05).

| 명세 절 | 주요 내용 | 커버하는 태스크 | 비고 |
|---:|---|---|---|
| 3 | 포함·제외 범위 | README, 본 문서 마지막 절 | |
| 5 | Concept·Edge·학습트리 관계 | 01~04 | 개념 정의 자체는 전 태스크 전제 |
| 7·8 | 테이블·`learning_nodes` 변경 | **01** | |
| 9 | 생성 흐름 | **03**(LLM 단계)·**04**(저장)·**05**(외부 계약) | |
| 10 | 중복 정책 | **02**, **04** | |
| 11 | REST API 목록 | **05**, **06** | |
| 12 | LLM 출력 스키마 | **03** | |
| 13 | 프롬프트 | **03** | 13.2·13.3은 선택 기능으로 명세와 동일 |
| 14 | 추천 로직 | **07** | |
| 15 | `user_concept_progress` | **01**, **07** | |
| 16.1·16.2 | 트리·상세 UI | **08**, **09** | |
| 16.3 | 관리자 최소 화면 | **10** | |
| 17·18·20 | 품질·테스트·완료 조건 | **10** 및 전 태스크 DoD | |
| 19 | 구현 우선순위 | README P0/P1/P2 표와 대체로 일치 | embedding·LLM 동일성은 후순위로 03·02·10에 분산 |

### 검증 결과: 적절한 분할 여부

- **적절함**: 스키마(01) → 검색·해석(02) → LLM 입출력(03) → 영속 파이프라인(04) → 생성 API(05) → Concept API(06) → 진행·추천·상세(07) → UI(08~09) → 관리·회귀(10) 순은 명세 9.1 흐름·19장 우선순위와 충돌하지 않는다.
- **의도적 중복**: `concept_edges`·`learning_tree_concepts` 정의는 **01**, 채우는 로직은 **04**로 나뉨(Phase 1의 02+04 패턴과 동일한 층위).
- **보완 반영 완료(경계 명시)**:
  1. **§3 항목 5(컨셉 기반 트리 보강·재생성)** 은 별도 엔드포인트를 기본으로 두지 않고, `reuse_concepts: true` 단일 생성 호출에서 기존 Concept 검색 결과를 03 프롬프트 컨텍스트로 주입하는 방식으로 우선 충족한다. 세부 결정은 **05**에 명시했다.
  2. **Phase 1 API 확장**(`GET/PATCH 트리·노드·추천`)은 신규 Concept REST API(**06**)와 분리해, 사용자 플로우에 Concept 진행 상태를 얹는 **07**의 범위로 명시했다.
  3. **`reuse_concepts` UX**는 **08**에서 생성 직전 토글/기본값을 다루고, 서버 계약·기본값은 **05**와 반드시 동일하게 맞춘다.
  4. **`concept_merge_candidates` 우선순위**는 DDL은 **01**에서 만들되, 자동 적재·승인/거절 UI·병합 처리 고도화는 **04·10의 P2 범위**로 제한한다.
