# RootMap Phase 3 구현 계획

이 폴더는 `docs/spec/rootmap_phase_3_spec.md`를 기준으로 PDF·텍스트 문서 기반 개념 추출과 문서 기반 학습 트리 생성 플로우를 작업 단위별로 쪼갠 실행 계획을 담는다.

## Phase 3 핵심 목표

RootMap을 단순 주제 입력 기반 서비스에서 문서 기반 학습 서비스로 확장한다. 사용자가 PDF, TXT, MD 문서를 업로드하면 문서 내용을 분석하고, 그 문서를 이해하는 데 필요한 개념 구조와 선수지식 트리를 생성한다.

핵심 판단 기준:

> RootMap이 업로드된 문서를 단순 요약하는 것이 아니라, 학습 가능한 선수지식 트리로 변환할 수 있는가?

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 1 | [01-document-schema-and-storage.md](./01-document-schema-and-storage.md) | `documents`, `document_pages`, `document_chunks`, `document_concepts`, `document_learning_trees` DDL·저장소 기반 | P0 |
| 2 | [02-document-upload-and-validation-api.md](./02-document-upload-and-validation-api.md) | 문서 업로드 API, 파일 형식·크기·권한·보안 검증 | P0 |
| 3 | [03-text-extraction-and-chunking.md](./03-text-extraction-and-chunking.md) | PDF/TXT/MD 텍스트 추출, 페이지 저장, 청크 분할 | P0 |
| 4 | [04-document-llm-schemas-and-prompts.md](./04-document-llm-schemas-and-prompts.md) | 청크별 추출·문서 통합·문서 트리·노드 설명 LLM 스키마/프롬프트 | P0 |
| 5 | [05-document-processing-pipeline.md](./05-document-processing-pipeline.md) | `POST /api/documents/:documentId/process`, 상태 전이, 실패 처리, 트리 생성 orchestration | P0 |
| 6 | [06-document-concept-resolution-and-persistence.md](./06-document-concept-resolution-and-persistence.md) | Concept Store 매칭, 신규 Concept 생성, `document_concepts` 출처 저장 | P1 |
| 7 | [07-document-apis-and-query-contracts.md](./07-document-apis-and-query-contracts.md) | 문서 조회, 개념 목록, 문서 트리, evidence 조회 API | P1 |
| 8 | [08-document-upload-and-result-ui.md](./08-document-upload-and-result-ui.md) | 문서 업로드 화면, 처리 상태 UI, 문서 분석 결과 화면 | P1 |
| 9 | [09-document-tree-and-node-detail-ui.md](./09-document-tree-and-node-detail-ui.md) | 문서 기반 트리 표시, source type/evidence/snippet, 노드 상세 확장 | P1 |
| 10 | [10-document-recommendations-quality-and-tests.md](./10-document-recommendations-quality-and-tests.md) | 문서 기반 추천, 오류·품질 기준, 테스트 케이스, 완료 조건 검증 | P2 |
| 11 | [11-progressive-tree-generation.md](./11-progressive-tree-generation.md) | 점진적 트리 생성: 구조/상세 분할, 노드 상세 지연 생성, lazy detail UI | P2 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 01. [01-document-schema-and-storage.md](./01-document-schema-and-storage.md) - `documents`, `document_pages`, `document_chunks`, `document_concepts`, `document_learning_trees` DDL·저장소 기반
- [x] 02. [02-document-upload-and-validation-api.md](./02-document-upload-and-validation-api.md) - 문서 업로드 API, 파일 형식·크기·권한·보안 검증
- [x] 03. [03-text-extraction-and-chunking.md](./03-text-extraction-and-chunking.md) - PDF/TXT/MD 텍스트 추출, 페이지 저장, 청크 분할
- [x] 04. [04-document-llm-schemas-and-prompts.md](./04-document-llm-schemas-and-prompts.md) - 청크별 추출·문서 통합·문서 트리·노드 설명 LLM 스키마/프롬프트
- [x] 05. [05-document-processing-pipeline.md](./05-document-processing-pipeline.md) - `POST /api/documents/:documentId/process`, 상태 전이, 실패 처리, 트리 생성 orchestration
- [x] 06. [06-document-concept-resolution-and-persistence.md](./06-document-concept-resolution-and-persistence.md) - Concept Store 매칭, 신규 Concept 생성, `document_concepts` 출처 저장
- [x] 07. [07-document-apis-and-query-contracts.md](./07-document-apis-and-query-contracts.md) - 문서 조회, 개념 목록, 문서 트리, evidence 조회 API
- [x] 08. [08-document-upload-and-result-ui.md](./08-document-upload-and-result-ui.md) - 문서 업로드 화면, 처리 상태 UI, 문서 분석 결과 화면
- [x] 09. [09-document-tree-and-node-detail-ui.md](./09-document-tree-and-node-detail-ui.md) - 문서 기반 트리 표시, source type/evidence/snippet, 노드 상세 확장
- [x] 10. [10-document-recommendations-quality-and-tests.md](./10-document-recommendations-quality-and-tests.md) - 문서 기반 추천, 오류·품질 기준, 테스트 케이스, 완료 조건 검증
- [x] 11. [11-progressive-tree-generation.md](./11-progressive-tree-generation.md) - 점진적 트리 생성: 구조/상세 분할, 노드 상세 지연 생성, lazy detail UI
- [x] 12. [12-async-document-processing.md](./12-async-document-processing.md) - 비동기 문서 처리 job 전환 및 상태 polling 안정화
- [ ] 13. [13-node-detail-generation-quality.md](./13-node-detail-generation-quality.md) - 노드 상세 생성 품질 기준과 실패 처리 보강
- [x] 14. [14-llm-provider-settings.md](./14-llm-provider-settings.md) - LLM provider 설정 저장/조회/삭제, 암호화, 연결 테스트, 설정 UI


## Phase 3 범위 요약

### 포함

- PDF, TXT, MD 문서 업로드
- 파일 검증과 사용자별 문서 접근 권한 확인
- PDF 내장 텍스트 중심 추출 및 페이지별 저장
- 섹션·페이지·문단·토큰 기준 청크 분할
- 청크별 개념 후보 추출과 문서 전체 개념 통합
- 문서 이해에 필요한 선수지식 추론
- Phase 2 Concept Store와 매칭 및 새 Concept 저장
- 문서와 Concept 사이 evidence/source type 저장
- 문서 기반 학습 트리 생성·저장·조회
- 문서 기반 트리/노드 상세 UI와 출처 표시
- 최소 3개 테스트 문서에서 품질 검증

### 제외

- 유튜브 자막 입력
- 웹사이트 URL 크롤링
- 다중 문서 비교
- 논문 전체 자동 번역
- 이미지·수식·표의 정밀 OCR 분석
- 완전한 citation-based RAG 챗봇
- 문서 전체 자유 질의응답 고도화
- 사용자 간 문서 공유
- 문서 기반 자동 시험 생성 고도화
- 장기 개인화 복습 알고리즘

## 완료 조건

`rootmap_phase_3_spec.md` 22장 Phase 3 완료 조건 12항목을 만족한다. 특히 문서에 직접 등장한 개념과 AI가 추론한 선수지식을 구분하고, 핵심 개념에는 실제 문서 위치 기반 출처가 연결되어야 한다.
