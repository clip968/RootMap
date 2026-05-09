# RootMap Phase 1 Task Breakdown

## 목적

`rootmap_phase_1_spec.md`를 실행 가능한 개발 태스크로 변환한 문서다. 각 태스크는 `docs/plan/01-*` ~ `10-*` 문서에 상세 계획이 있다.

## Milestone A: MVP 기반 구축

### A1. 프로젝트 기반 구성

- 공통 타입 정의
- 환경 변수 정리
- API 에러 규격 정의
- 폴더 구조 정리

상세: [01-project-foundation.md](./01-project-foundation.md)

### A2. 데이터 모델 구현

- `learning_trees` 테이블
- `learning_nodes` 테이블
- `user_node_progress` 테이블
- 저장소 함수 구현

상세: [02-data-model-and-storage.md](./02-data-model-and-storage.md)

### A3. LLM 스키마/프롬프트 구현

- 학습 트리 생성 프롬프트
- 노드 상세 프롬프트
- JSON 파싱/검증
- 품질 가드레일

상세: [03-llm-prompts-and-schema.md](./03-llm-prompts-and-schema.md)

## Milestone B: 핵심 생성 플로우

### B1. 학습 트리 생성 API

- `POST /api/trees/generate`
- topic 검증
- LLM 호출
- DB 저장
- 응답 변환

상세: [04-tree-generation-api.md](./04-tree-generation-api.md)

### B2. 시작 화면

- 주제 입력창
- 예시 주제 버튼
- 생성 버튼
- 로딩/에러 UI

상세: [05-start-screen.md](./05-start-screen.md)

### B3. 트리 결과 화면

- 루트 주제 표시
- 다섯 타입 섹션 표시
- 노드 클릭
- 추천 노드 강조
- 저장/재생성 버튼

상세: [06-tree-result-screen.md](./06-tree-result-screen.md)

## Milestone C: 학습 경험 완성

### C1. 노드 상세 플로우

- `POST /api/nodes/:nodeId/detail`
- 상세 LLM 호출
- 상세 JSON 저장
- 상세 화면/패널 표시

상세: [07-node-detail-flow.md](./07-node-detail-flow.md)

### C2. 진행 상태와 추천

- `PATCH /api/nodes/:nodeId/progress`
- `GET /api/trees/:treeId/recommendations`
- 규칙 기반 추천 함수
- 상태 체크 UI

상세: [08-progress-and-recommendations.md](./08-progress-and-recommendations.md)

### C3. 저장된 트리 조회

- `GET /api/trees/:treeId`
- 진행 상태 복원
- 상세 설명 캐시 재사용
- 새로고침 대응

상세: [09-saved-tree-retrieval.md](./09-saved-tree-retrieval.md)

## Milestone D: 검증 및 마무리

### D1. 테스트와 품질 개선

- Rust lifetime 테스트
- Transformer 테스트
- 가상 메모리 테스트
- 최소 품질 기준 확인
- UI polish

상세: [10-quality-tests-and-polish.md](./10-quality-tests-and-polish.md)

## 권장 구현 순서

1. A1 프로젝트 기반 구성
2. A2 데이터 모델 구현
3. A3 LLM 스키마/프롬프트 구현
4. B1 학습 트리 생성 API
5. B2 시작 화면
6. B3 트리 결과 화면
7. C1 노드 상세 플로우
8. C2 진행 상태와 추천
9. C3 저장된 트리 조회
10. D1 테스트와 품질 개선

## Phase 1에서 하지 않을 것

- PDF 업로드
- 문서 기반 개념 추출
- LLM Wiki 전체 구현
- 장기 지식베이스
- 복잡한 그래프 시각화
- RAG 출처 추적 답변
- 사용자 간 공유
