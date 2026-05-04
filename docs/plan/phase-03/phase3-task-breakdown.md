# RootMap Phase 3 Task Breakdown

## 목적

`docs/spec/rootmap_phase_3_spec.md`를 실행 가능한 개발 태스크로 변환한 문서다. 각 태스크는 `docs/plan/phase-03/01-*` ~ `10-*` 문서에 상세 계획이 있다.

## Milestone A: 문서 저장소와 업로드 기반

### A1. 문서 스키마와 저장소

- `documents` 테이블
- `document_pages` 테이블
- `document_chunks` 테이블
- `document_concepts` 테이블
- `document_learning_trees` 테이블
- 문서 상태 enum/타입과 repository 함수

상세: [01-document-schema-and-storage.md](./01-document-schema-and-storage.md)

### A2. 문서 업로드와 검증 API

- `POST /api/documents/upload`
- multipart/form-data 처리
- `.pdf`, `.txt`, `.md` 허용
- 20MB 파일 크기 제한
- 사용자별 문서 접근 권한과 안전한 파일명 저장

상세: [02-document-upload-and-validation-api.md](./02-document-upload-and-validation-api.md)

## Milestone B: 텍스트 처리와 LLM 분석

### B1. 텍스트 추출과 청크 분할

- PDF 내장 텍스트 추출
- TXT/MD 텍스트 로딩
- 페이지별 텍스트 저장
- 섹션·페이지·문단·토큰 기반 청크 분할
- 최대 80페이지, 120,000자 제한 처리

상세: [03-text-extraction-and-chunking.md](./03-text-extraction-and-chunking.md)

### B2. 문서 LLM 스키마와 프롬프트

- 청크별 개념 후보 추출 응답 스키마
- 문서 전체 개념 통합 응답 스키마
- 문서 기반 학습 트리 응답 스키마
- 문서 기반 노드 설명 응답 스키마
- explicit/inferred/generated source type 구분

상세: [04-document-llm-schemas-and-prompts.md](./04-document-llm-schemas-and-prompts.md)

### B3. 문서 처리 파이프라인

- `POST /api/documents/:documentId/process`
- 상태 전이: `uploaded` → `text_extracted` → `chunked` → `concepts_extracted` → `tree_generated`
- 텍스트 추출, 청킹, LLM 호출, Concept 매칭, 트리 생성 orchestration
- 실패 상태와 `processing_error` 저장

상세: [05-document-processing-pipeline.md](./05-document-processing-pipeline.md)

## Milestone C: Concept Store 연결과 조회 API

### C1. 문서 개념 해석과 영속화

- 문서 개념 후보를 기존 Concept Store와 매칭
- normalized title, alias, domain 기반 재사용
- 새 Concept 생성
- `document_concepts.evidence` 저장
- `source_type`과 `concept_type` 품질 보존

상세: [06-document-concept-resolution-and-persistence.md](./06-document-concept-resolution-and-persistence.md)

### C2. 문서 조회 API 계약

- `GET /api/documents/:documentId`
- `GET /api/documents/:documentId/concepts`
- `GET /api/documents/:documentId/tree`
- `GET /api/document-concepts/:documentConceptId/evidence`
- 사용자 권한 검증과 응답 DTO 정리

상세: [07-document-apis-and-query-contracts.md](./07-document-apis-and-query-contracts.md)

## Milestone D: 문서 기반 UI

### D1. 문서 업로드와 분석 결과 UI

- 문서 업로드 화면
- 지원 형식과 제한 안내
- 처리 시작 버튼
- 처리 상태 표시
- 문서 제목·요약·핵심 개념·선수지식 결과 화면

상세: [08-document-upload-and-result-ui.md](./08-document-upload-and-result-ui.md)

### D2. 문서 트리와 노드 상세 UI

- 기존 트리 화면에 문서 기반 source type 표시
- explicit/inferred/generated 배지
- 출처 페이지·섹션·snippet 표시
- 문서 기반 노드 상세 설명
- 원문 보기 버튼 또는 snippet 패널

상세: [09-document-tree-and-node-detail-ui.md](./09-document-tree-and-node-detail-ui.md)

## Milestone E: 추천·오류·품질 검증

### E1. 추천 로직과 Phase 3 품질 검증

- 문서 기반 추천 우선순위 구현
- 텍스트 추출 실패, 긴 문서, 낮은 개념 추출 품질, LLM JSON 실패 처리
- Transformer 논문, 가상 메모리 강의자료, Rust lifetime 노트 테스트
- Phase 3 완료 조건 대조

상세: [10-document-recommendations-quality-and-tests.md](./10-document-recommendations-quality-and-tests.md)

## 권장 구현 순서

1. A1 문서 스키마와 저장소
2. A2 문서 업로드와 검증 API
3. B1 텍스트 추출과 청크 분할
4. B2 문서 LLM 스키마와 프롬프트
5. B3 문서 처리 파이프라인
6. C1 문서 개념 해석과 영속화
7. C2 문서 조회 API 계약
8. D1 문서 업로드와 분석 결과 UI
9. D2 문서 트리와 노드 상세 UI
10. E1 추천 로직과 Phase 3 품질 검증

## Phase 3에서 하지 않을 것

- 유튜브 자막 입력·웹사이트 URL 크롤링
- 다중 문서 비교·사용자 간 문서 공유
- 이미지·수식·표 정밀 OCR 분석
- 완전한 citation-based RAG 챗봇 또는 자유 질의응답 고도화
- 문서 기반 자동 시험 생성 고도화
- 장기 개인화 복습 알고리즘(Phase 4)

---

## 명세 대조 검증(요약)

아래 표는 `rootmap_phase_3_spec.md`의 절 번호와 계획 태스크를 대응시킨 것이다. 한 절이 여러 태스크에 걸치는 경우는 의도적인 분할이다.

| 명세 절 | 주요 내용 | 커버하는 태스크 | 비고 |
|---:|---|---|---|
| 3 | 포함·제외 범위 | README, 본 문서 마지막 절 | |
| 6.1~6.4 | 처리 파이프라인, 파일 검증, 텍스트 추출, 청크 분할 | **02**, **03**, **05** | 파일 검증은 02, 추출/청킹은 03, orchestration은 05 |
| 7 | 문서 기반 개념 추출 | **04**, **05** | 스키마·프롬프트는 04, 실행 파이프라인은 05 |
| 8 | Concept Store 연결 | **06** | Phase 2 repository 재사용 전제 |
| 9 | 출처 연결 정책 | **01**, **06**, **09** | 저장 구조는 01·06, 표시 UI는 09 |
| 10 | 데이터 모델 | **01** | |
| 11·12 | LLM 출력 스키마와 프롬프트 | **04** | |
| 13 | API 명세 | **02**, **05**, **07** | upload/process/query 분리 |
| 14 | UI 요구사항 | **08**, **09** | |
| 15 | 추천 로직 변경 | **10** | |
| 16 | 오류 처리 정책 | **02**, **03**, **05**, **10** | |
| 17·18·19·22 | 품질 기준, MVP 기준, 테스트 케이스, 완료 조건 | **10** 및 전 태스크 DoD | |
| 20 | 구현 우선순위 | README P0/P1/P2 표와 정렬 | |
| 21 | 보안 및 개인정보 | **02**, **07** | upload와 조회 권한 검증 중심 |

### 검증 결과: 적절한 분할 여부

- **적절함**: 스키마(01) → 업로드(02) → 추출/청킹(03) → LLM 계약(04) → 처리 파이프라인(05) → Concept 연결(06) → 조회 API(07) → UI(08~09) → 추천·품질(10) 순은 명세 6.1 전체 파이프라인과 20장 구현 우선순위에 맞다.
- **의도적 분리**: `document_concepts` 테이블 정의는 **01**, 문서 개념 후보를 실제 Concept과 연결하고 evidence를 채우는 동작은 **06**으로 나눈다.
- **경계 명시**: OCR, RAG 챗봇, 자유 질의응답, 다중 문서 비교는 Phase 3 태스크에서 제외한다.
