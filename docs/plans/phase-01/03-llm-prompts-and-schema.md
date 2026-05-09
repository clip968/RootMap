# 03. LLM 프롬프트 및 JSON 스키마 구현

## 목표

LLM이 Phase 1 명세에 맞는 구조화된 JSON만 반환하도록 프롬프트와 스키마 검증 로직을 구현한다.

## 관련 명세

- 5. AI 출력 스키마
- 6. 프롬프트 설계
- 11. 검증 기준
- 12. 테스트 케이스

## 구현 작업

### 1. 학습 트리 생성 프롬프트 구현

입력:

- `topic`

출력 요구:

- JSON only
- `topic`
- `summary`
- `nodes`
- `recommended_order`

노드 타입:

- `prerequisite`
- `core`
- `supplementary`
- `misconception`
- `quiz`

프롬프트 핵심 요구:

- 주제를 바로 설명하지 않는다.
- 선수지식 중심 학습 트리로 분해한다.
- 초보자 친화적 순서를 우선한다.
- prerequisite 관계를 명시한다.
- 마크다운 없이 유효한 JSON만 반환한다.

### 2. 노드 상세 설명 프롬프트 구현

입력:

- 전체 학습 주제
- 선택된 노드 제목
- 노드 타입
- 선수지식 컨텍스트

출력 요구:

- `why_it_matters`
- `easy_explanation`
- `analogy`
- `example`
- `common_misconceptions`
- `check_questions`
- `next_nodes`

### 3. JSON 스키마 검증

검증 항목:

- 필수 필드 존재 여부
- 노드 타입 enum 유효성
- 난이도 숫자 여부
- prerequisites/children 배열 여부
- recommended_order가 노드 ID를 참조하는지 여부
- 노드 ID 중복 여부

### 4. LLM 응답 후처리

- JSON 파싱 실패 시 재시도
- 마크다운 코드블록이 섞인 경우 제거 시도
- 스키마 불일치 시 명확한 에러 반환
- 노드 수가 너무 많거나 적으면 품질 경고 처리

### 5. 품질 가드레일

최소 품질 기준:

- 전체 노드 수: 8~20개
- 선수지식 노드: 3개 이상
- 핵심 개념 노드: 3개 이상
- 오개념 노드: 1개 이상
- 이해 점검 노드: 2개 이상

## 산출물

- 트리 생성 프롬프트 템플릿
- 노드 상세 프롬프트 템플릿
- LLM 클라이언트 래퍼
- JSON 스키마 검증 함수
- LLM 응답 파싱/재시도 로직

## 검증 기준

- Rust lifetime, Transformer, 가상 메모리 입력에 대해 유효한 JSON이 생성된다.
- 모든 노드가 허용된 타입 중 하나를 가진다.
- 추천 순서가 실제 노드 ID만 참조한다.
- JSON 파싱 실패가 사용자에게 그대로 노출되지 않는다.
