# RootMap Phase 1 구현 계획

이 폴더는 `docs/spec/rootmap_phase_1_spec.md`를 기준으로 Phase 1 MVP를 작업 단위별로 쪼갠 실행 계획을 담는다.

## Phase 1 핵심 목표

사용자가 배우고 싶은 주제를 입력했을 때, AI가 유용한 선수지식 트리와 노드별 학습 설명을 생성하고, 사용자의 이해 상태에 따라 다음 학습 노드를 추천할 수 있는 MVP를 만든다.

핵심 판단 기준:

> 사용자가 “이 주제를 공부하려면 무엇부터 봐야 하는지 알겠다”고 느끼는가?

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 1 | [01-project-foundation.md](./01-project-foundation.md) | 프로젝트 기본 구조, 환경, 공통 타입 준비 | P0 |
| 2 | [02-data-model-and-storage.md](./02-data-model-and-storage.md) | 학습 트리/노드/진행 상태 저장 모델 구현 | P0 |
| 3 | [03-llm-prompts-and-schema.md](./03-llm-prompts-and-schema.md) | LLM 프롬프트, JSON 스키마, 파싱/검증 구현 | P0 |
| 4 | [04-tree-generation-api.md](./04-tree-generation-api.md) | 학습 트리 생성 API 구현 | P0 |
| 5 | [05-start-screen.md](./05-start-screen.md) | 주제 입력 시작 화면 구현 | P0 |
| 6 | [06-tree-result-screen.md](./06-tree-result-screen.md) | 트리 결과 화면과 노드 클릭 UX 구현 | P0 |
| 7 | [07-node-detail-flow.md](./07-node-detail-flow.md) | 노드 상세 설명 생성 API/UI 구현 | P0 |
| 8 | [08-progress-and-recommendations.md](./08-progress-and-recommendations.md) | 이해 상태 저장과 규칙 기반 추천 구현 | P1 |
| 9 | [09-saved-tree-retrieval.md](./09-saved-tree-retrieval.md) | 저장된 트리 조회와 상태 복원 구현 | P1 |
| 10 | [10-quality-tests-and-polish.md](./10-quality-tests-and-polish.md) | 테스트 주제 검증, 품질 개선, MVP 완료 체크 | P2 |

## MVP 범위

### 포함

- 텍스트 주제 입력
- AI 기반 학습 트리 생성
- `prerequisite / core / supplementary / misconception / quiz` 노드 분류
- 트리 결과 화면
- 노드 클릭 후 상세 설명 생성
- 노드별 이해 상태 `known / partial / unknown` 저장
- 규칙 기반 다음 학습 노드 추천
- 생성된 학습 트리와 진행 상태 저장/조회

### 제외

- PDF 업로드
- Karpathy식 LLM Wiki 전체 구현
- 장기 개인 지식베이스 자동 확장
- 복잡한 그래프 시각화
- 유튜브 자막 입력
- 다중 문서 비교
- RAG 기반 출처 추적 답변
- 사용자 간 공유

## 완료 조건

- 사용자가 텍스트 주제를 입력할 수 있다.
- AI가 구조화된 학습 트리를 생성한다.
- 트리가 선수지식, 핵심 개념, 부가 지식, 오개념, 이해 점검으로 구분된다.
- 사용자가 노드를 클릭해 설명을 확인할 수 있다.
- 사용자가 노드별 이해 상태를 저장할 수 있다.
- 시스템이 다음에 볼 노드를 추천한다.
- 최소 3개 테스트 주제에서 안정적으로 동작한다.
