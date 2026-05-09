# 01. 프로젝트 기반 구성

## 목표

Phase 1 MVP 구현을 시작하기 위한 최소 프로젝트 기반을 마련한다. 이후 API, UI, 저장소, LLM 연동 작업이 일관된 타입과 구조 위에서 진행되도록 한다.

## 관련 명세

- Phase 1 목표
- Phase 1 범위
- 화면 구성
- AI 출력 스키마
- 데이터 모델
- API 명세

## 구현 작업

### 1. 앱 구조 확인 및 기본 폴더 설계

- 프론트엔드 화면 영역
  - 시작 화면
  - 트리 결과 화면
  - 노드 상세 화면
  - 수준 체크/추천 화면
- 백엔드/API 영역
  - 트리 생성
  - 트리 조회
  - 노드 상세 생성
  - 진행 상태 업데이트
  - 추천 조회
- 공통 영역
  - 타입 정의
  - 스키마 검증
  - 추천 로직
  - LLM 클라이언트

### 2. 공통 타입 정의

필수 타입:

```ts
type NodeType = 'prerequisite' | 'core' | 'supplementary' | 'misconception' | 'quiz';
type ProgressStatus = 'known' | 'partial' | 'unknown';
```

학습 트리 타입:

```ts
interface LearningTreeNode {
  id: string;
  title: string;
  type: NodeType;
  description: string;
  difficulty: number;
  prerequisites: string[];
  children: string[];
}

interface LearningTreeResponse {
  topic: string;
  summary: string;
  nodes: LearningTreeNode[];
  recommended_order: string[];
}
```

노드 상세 타입:

```ts
interface NodeDetailResponse {
  node_id: string;
  title: string;
  type: NodeType;
  why_it_matters: string;
  easy_explanation: string;
  analogy: string;
  example: string;
  common_misconceptions: string[];
  check_questions: Array<{
    question: string;
    answer: string;
  }>;
  next_nodes: string[];
}
```

### 3. 환경 변수 정리

- LLM API Key
- 데이터베이스 연결 정보
- 개발/운영 환경 구분

### 4. 에러 응답 규격 정의

공통 API 에러 형태:

```json
{
  "error": {
    "code": "INVALID_TOPIC",
    "message": "학습 주제를 입력해 주세요."
  }
}
```

## 산출물

- 공통 타입 파일
- 공통 에러 응답 규격
- API/UI/LLM/DB 작업을 위한 기본 폴더 구조
- 환경 변수 문서 또는 예시 파일

## 검증 기준

- 모든 Phase 1 노드 유형을 타입으로 표현할 수 있다.
- 모든 진행 상태 값을 타입으로 표현할 수 있다.
- 이후 작업 문서에서 참조할 공통 타입이 준비되어 있다.
