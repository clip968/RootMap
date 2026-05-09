# 10. 품질 검증, 테스트, 마무리 개선

## 목표

Phase 1 MVP가 명세의 완료 조건과 품질 기준을 만족하는지 검증하고, 사용자 경험을 해치지 않는 범위에서 UI와 설명 품질을 개선한다.

## 관련 명세

- 11. 검증 기준
- 12. 테스트 케이스
- 13. 구현 우선순위: 3순위
- 14. Phase 1 완료 조건
- 15. Phase 1의 핵심 판단 기준

## 테스트 주제

### 1. Rust lifetime

기대 선수지식:

- ownership
- reference
- borrowing
- scope

기대 핵심 개념:

- lifetime annotation
- lifetime elision
- borrow checker

### 2. Transformer

기대 선수지식:

- vector
- matrix
- dot product
- softmax
- sequence

기대 핵심 개념:

- Query
- Key
- Value
- self-attention
- multi-head attention
- positional encoding

### 3. 가상 메모리

기대 선수지식:

- process
- address
- memory
- page

기대 핵심 개념:

- virtual address
- physical address
- page table
- TLB
- page fault

## 기능 검증 체크리스트

- [x] 사용자가 주제를 입력하면 학습 트리가 생성된다.
- [x] 생성 결과가 다섯 타입으로 나뉜다.
- [x] 각 노드를 클릭하면 상세 설명을 볼 수 있다.
- [x] 사용자가 노드별 이해 상태를 저장할 수 있다.
- [x] 시스템이 다음 학습 노드를 추천할 수 있다.
- [x] 저장된 트리를 다시 조회할 수 있다.

## 품질 검증 체크리스트

- [x] 선수지식이 핵심 개념보다 먼저 배치된다.
- [x] 노드 수가 8~20개 범위에 있다.
- [x] 선수지식 노드가 3개 이상이다.
- [x] 핵심 개념 노드가 3개 이상이다.
- [x] 오개념 노드가 1개 이상이다.
- [x] 이해 점검 노드가 2개 이상이다.
- [x] 노드별 설명에 쉬운 설명, 예시, 질문이 포함된다.
- [x] 설명이 초보자 친화적이다.
- [x] 학습 순서가 단순 나열이 아니라 prerequisite 기반이다.

## 구현 작업

### 1. 수동 E2E 시나리오 테스트

각 테스트 주제마다 다음 흐름을 확인한다.

1. 시작 화면에서 주제 입력
2. 트리 생성
3. 타입별 섹션 확인
4. 추천 노드 확인
5. 노드 상세 열기
6. 상태를 `known / partial / unknown`으로 변경
7. 추천 결과 갱신 확인
8. 새로고침 후 저장 상태 확인

### 2. LLM 출력 품질 로그 정리

각 테스트 주제에 대해 기록:

- 생성된 노드 수
- 타입별 노드 수
- 누락된 기대 개념
- 이상한 prerequisite 관계
- 설명 품질 문제

### 3. UI 마무리 개선

우선순위 낮은 개선:

- 예시 주제 버튼 개선
- 트리 재생성 UX 정리
- 추천 노드 강조 스타일 개선
- 퀴즈 UI 개선
- 빈 상태/에러 상태 문구 개선

### 4. 완료 조건 최종 점검

Phase 1 완료 조건:

- 텍스트 주제 입력 가능
- 구조화된 학습 트리 생성
- 다섯 분류 표시
- 노드 상세 설명 확인
- 노드별 이해 상태 저장
- 다음 노드 추천
- 최소 3개 테스트 주제 안정 동작
- PDF/LLM Wiki/장기 지식베이스 없이 핵심 가치 전달

## 산출물

- 테스트 결과 기록
- 발견된 버그 목록
- 품질 개선 사항 반영
- Phase 1 완료 체크리스트


## 검증 결과 기록

검증일: 2026-05-04

자동 검증 명령:

```bash
cd apps/web && npm run check
```

검증 결과:

- `npm run lint`: 성공
- `npm run db:smoke`: 성공 - 트리/노드/진행 상태/상세 설명 저장·조회 확인
- `npm run llm:smoke-parse`: 성공 - LLM JSON fence 제거, 파싱, 스키마 및 품질 경고 확인
- `npm run phase1:smoke`: 성공 - `Rust lifetime`, `Transformer`, `가상 메모리` 대표 출력 fixture로 Phase 1 MVP 흐름 검증
- `npm run build`: 성공 - Next.js 프로덕션 빌드 및 타입 검사 통과

### 테스트 주제별 품질 로그

| 주제 | 노드 수 | 타입별 노드 수 | 기대 개념 누락 | prerequisite 관계 | 설명 품질 |
|---|---:|---|---|---|---|
| Rust lifetime | 11 | prerequisite 4 / core 3 / supplementary 1 / misconception 1 / quiz 2 | 없음 | 모든 prerequisite가 의존 노드보다 먼저 배치됨 | 쉬운 설명·예시·질문 fixture 통과 |
| Transformer | 13 | prerequisite 5 / core 4 / supplementary 1 / misconception 1 / quiz 2 | 없음 | 모든 prerequisite가 의존 노드보다 먼저 배치됨 | 쉬운 설명·예시·질문 fixture 통과 |
| 가상 메모리 | 13 | prerequisite 4 / core 5 / supplementary 1 / misconception 1 / quiz 2 | 없음 | 모든 prerequisite가 의존 노드보다 먼저 배치됨 | 쉬운 설명·예시·질문 fixture 통과 |

### 발견된 버그 및 개선 사항

- Next.js 빌드 중 DB 경로 계산의 동적 `process.cwd()` 사용으로 Turbopack NFT 추적 경고가 발생했다.
  - 조치: SQLite 상대 경로 결합부에 `/* turbopackIgnore: true */` 주석을 추가해 빌드 경고를 제거했다.
- LLM 트리 생성 품질을 안정화하기 위해 프롬프트에 최소 노드 수, 타입별 최소 개수, prerequisite 우선 정렬 조건을 명시했다.
- 노드 상세 설명 품질을 안정화하기 위해 프롬프트에 오개념 최소 1개, 점검 질문 1~3개, 초보자용 구체성 조건을 명시했다.
- Phase 1 회귀 검증용 `phase1:smoke` 스크립트와 통합 `check` 스크립트를 추가했다.

## 검증 기준

- 세 테스트 주제에서 MVP 흐름이 끝까지 동작한다.
- 사용자가 다음에 무엇을 공부해야 할지 알 수 있다.
- 명세의 최소 품질 기준을 만족한다.
