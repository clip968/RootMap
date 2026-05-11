# RootMap 프로젝트 구조 가이드

이 문서는 `apps/web/` 디렉토리의 파일 구조를 처음 보는 사람도 이해할 수 있게 설명한다.

---

## 전체 폴더 한눈에

```
RootMap/
├── apps/
│   └── web/                    ← 🌟 실제 서비스 코드가 있는 곳
│
├── docs/
│   ├── specs/                  ← 요구사항 명세서 (개발자가 볼 문서)
│   ├── plans/                  ← 구현 계획 (무슨 순서로 만들지)
│   └── project-structure.md    ← 이 파일 (구조 설명)
│
└── AGENTS.MD                   ← AI 에이전트 작업 규칙
```

**진짜 핵심**은 `apps/web/` 안에 전부 들어있다.

---

## apps/web/ 건물 내부 구조

```
apps/web/
│
├── src/                        ← 👑 모든 TypeScript 소스코드
│   ├── app/                    ← Next.js 웹서버 (API + 페이지)
│   ├── components/             ← 화면 UI 조각
│   ├── db/                     ← 데이터베이스 연결 + 테이블 정의
│   ├── lib/                    ← 🎯 진짜 비즈니스 로직
│   └── types/                  ← 데이터 타입 정의
│
├── scripts/                    ← 테스트 스크립트
├── drizzle/                    ← DB 변경 내역 (마이그레이션)
├── data/                       ← 실제 저장된 파일들 (PDF, SQLite DB)
├── package.json                ← 프로젝트 설정 (스크립트, 패키지)
└── tsconfig.json               ← TypeScript 설정
```

---

## 1. `src/app/` — 손님(브라우저)이 직접 만나는 곳

Next.js App Router. 웹사이트 주소와 연결된 창구 역할을 한다.

```
src/app/
├── page.tsx                    ← 메인 페이지 (localhost:3000/)
│                                 "주제를 입력하세요" 화면
│
├── layout.tsx                  ← 모든 페이지의 공통 레이아웃
│
├── tree/
│   └── [treeId]/
│       └── page.tsx            ← 학습 트리 보는 페이지
│
├── admin/
│   └── concepts/
│       └── page.tsx            ← 관리자용 개념 목록 페이지
│
└── api/                        ← 📡 API 창구 (브라우저가 데이터 요청)
    │
    ├── concepts/               ← 개념 CRUD API
    │   ├── route.ts            ←   GET /api/concepts (목록 조회)
    │   │                         POST /api/concepts (새 개념 생성)
    │   └── [conceptId]/
    │       ├── route.ts        ←   GET /api/concepts/:id
    │       ├── edges/route.ts  ←   POST /api/concepts/:id/edges
    │       └── trees/route.ts  ←   GET /api/concepts/:id/trees
    │
    ├── trees/                  ← 학습 트리 API
    │   ├── route.ts            ←   GET /api/trees (트리 목록)
    │   ├── generate/route.ts   ← 🌟 POST /api/trees/generate (트리 생성!)
    │   └── [treeId]/
    │       ├── route.ts        ←   GET /api/trees/:id
    │       └── recommendations/route.ts ← 추천 노드 조회
    │
    ├── nodes/
    │   └── [nodeId]/
    │       ├── detail/route.ts ←   POST /api/nodes/:id/detail
    │       └── progress/route.ts ← PATCH /api/nodes/:id/progress
    │
    └── documents/              ← 📄 문서 API (Phase 3)
        ├── upload/route.ts     ← 🌟 POST /api/documents/upload
        └── [documentId]/
            └── process/route.ts ← 🌟 POST /api/documents/:id/process
```

**쉽게 말하면**: 브라우저가 특정 주소로 요청하면, 이 폴더의 파일이 받아서 처리한다.

---

## 2. `src/components/` — 화면 UI 조각

```
src/components/
├── app-shell.tsx              ← 전체 화면 레이아웃 (로고, 메뉴 등)
├── start-topic-form.tsx       ← 메인 페이지의 "주제 입력창"
└── tree-page-client.tsx       ← 학습 트리 화면의 실제 동작
```

---

## 3. `src/db/` — 데이터베이스 연결

```
src/db/
├── client.ts                  ← DB 연결 설정 (SQLite 파일 위치)
├── constants.ts               ← DEFAULT_USER_ID 같은 상수
├── schema.ts                  ← 📋 모든 테이블 정의 (405줄)
│                                documents, concepts, learning_trees 등
└── index.ts                   ← 간편하게 export
```

`schema.ts`가 가장 중요하다. 여기에 DB 테이블 구조가 다 정의되어 있다.

---

## 4. `src/lib/` — 🧠 핵심 비즈니스 로직

### 4-1. `lib/llm/` — 🤖 LLM(인공지능) 관련

```
src/lib/llm/
├── index.ts               ← 다른 파일에서 import 쉽게 해주는 정리 파일
├── chat.ts                ← 🌟 OpenRouter API 실제 호출 (LLM과 통신)
├── errors.ts              ← LLM 관련 에러 클래스 모음
├── prompts.ts             ← LLM에게 보낼 지시문(프롬프트) 모음
├── schemas.ts             ← LLM 응답 검증하는 Zod 스키마 모음
├── parse.ts               ← LLM 응답(JSON)을 파싱하는 함수 모음
│
├── generate-tree.ts       ← Phase 2: 학습 트리 생성
├── generate-node-detail.ts← Phase 2: 노드 상세 설명 생성
│
├── generate-document-chunk-concepts.ts  ← 🆕 청크 개념 추출
├── generate-document-consolidation.ts   ← 🆕 개념 통합
├── generate-document-tree.ts            ← 🆕 문서 기반 트리 생성
└── generate-document-node-detail.ts     ← 🆕 문서 노드 설명
```

**공통 패턴**: 모든 `generate-*.ts` 파일은 아래 4단계를 거친다.

```
1. prompts.ts → 프롬프트(지시문) 생성
2. chat.ts → LLM API 호출
3. parse.ts → 응답 JSON 파싱
4. schemas.ts → Zod로 검증
```

### 4-2. `lib/document/` — 📄 문서 처리 (Phase 3)

```
src/lib/document/
├── processor.ts           ← 🌟 문서 처리 전체 진행 관리 (8단계 파이프라인)
├── extract-pdf.ts         ← PDF에서 텍스트 추출 (pdfjs-dist 사용)
├── extract-text.ts        ← TXT/MD에서 텍스트 추출
└── chunker.ts             ← 긴 텍스트를 작은 조각(청크)으로 자르기
```

### 4-3. `lib/repository/` — 🗃️ DB 읽고 쓰기

```
src/lib/repository/
├── concept-repository.ts  ← 개념(concept) 테이블 CRUD
├── learning-repository.ts ← 학습 트리/노드 테이블 CRUD
└── document-repository.ts ← 문서(document) 테이블 CRUD
```

### 4-4. `lib/services/` — 🎯 여러 기능을 연결하는 오케스트레이터

```
src/lib/services/
├── learning-tree-generate.ts ← "주제 입력 → LLM 호출 → DB 저장" 한방에 처리
├── concept-persistence.ts    ← 개념 저장 + 관계 저장
├── node-detail.ts            ← 노드 상세 설명 조회/생성
└── node-detail-context.ts    ← 노드 설명에 필요한 컨텍스트 준비
```

### 4-5. 기타

```
src/lib/
├── api-errors.ts              ← API 에러 응답 생성 함수
├── concepts/normalize.ts      ← 개념 이름 정규화 (대소문자 통일)
├── constants/limits.ts        ← 입력 제한값 (최대 글자수 등)
├── recommendation/recommend-next.ts ← "다음에 뭐 공부할까?" 추천
└── tree/bundle-to-api.ts      ← DB 결과를 API 응답 모양으로 변환
```

---

## 5. `src/types/` — 데이터 타입 정의

```
src/types/
└── learning.ts                ← 모든 데이터 타입 정의
                                 - LearningTreeNode: 트리의 한 노드
                                 - ApiTreePayload: API 응답 모양
                                 - ChunkConceptCandidate: 문서 개념 후보
                                 - DocumentTreeResponse: 문서 트리 응답
                                 등 120+줄
```

---

## 6. `scripts/` — 🧪 테스트 스크립트

```
scripts/
├── smoke-document-upload.ts   ← 문서 업로드 테스트
├── smoke-document-extract.ts  ← 텍스트 추출/청킹 테스트
├── smoke-document-llm.ts      ← 🆕 문서 LLM 스키마 테스트 (58개 테스트)
├── smoke-llm-parse.ts         ← Phase 2 LLM 파싱 테스트
├── smoke-learning-repo.ts     ← DB 저장소 테스트
├── smoke-phase1-mvp.ts        ← Phase 1 전체 테스트
└── smoke-phase2-concepts.ts   ← Phase 2 개념 저장 테스트
```

---

## 7. `drizzle/` — DB 변경 내역

```
drizzle/
├── 0000_amusing_wiccan.sql    ← 첫 번째 테이블 생성
├── 0001_overrated_sebastian_shaw.sql  ← 두 번째 변경
├── 0002_mushy_reptil.sql              ← 세 번째 변경
└── meta/
```

DB 구조가 바뀔 때마다 SQL 파일이 하나씩 추가된다.

---

## 📊 전체 의존 관계도

```
브라우저 화면 (HTML/JS)
    │
    ▼
API Route (src/app/api/)
    │  ← POST /api/documents/upload
    │  ← POST /api/documents/:id/process
    │  ← POST /api/trees/generate
    ▼
Service Layer (src/lib/services/)
    │  "LLM 호출 + DB 저장" 전체 흐름 관리
    │
    ├──▶ LLM Layer (src/lib/llm/)
    │      prompts.ts → chat.ts → parse.ts → schemas.ts
    │      (프롬프트 작성 → LLM 호출 → 파싱 → 검증)
    │
    └──▶ Repository Layer (src/lib/repository/)
           document-repository.ts
           concept-repository.ts
           learning-repository.ts
                   │
                   ▼
              SQLite DB (src/db/schema.ts에 정의된 테이블)
```

**역할 요약**:

| 계층 | 역할 | 비유 |
|---|---|---|
| `app/api/` | 요청 접수 | 접수창구 |
| `lib/services/` | 전체 흐름 관리 | 현장 감독 |
| `lib/llm/` | AI 호출 및 검증 | 외주 업체 관리 |
| `lib/repository/` | DB 저장/조회 | 창고 관리자 |
| `db/schema.ts` | 테이블 구조 정의 | 창고 설계도 |
| `types/learning.ts` | 데이터 형식 약속 | 서류 양식 |
| `scripts/` | 테스트 | 품질 검사 |
