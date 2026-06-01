# RootMap Web

Phase 2 Concept Store 웹 앱입니다. 사용자가 학습 주제를 입력하면 OpenRouter Chat Completions API로 선수지식 기반 학습 트리를 생성하고, 생성된 노드를 재사용 가능한 Concept으로 저장·재사용하며, 노드별 상세 설명·이해 상태·다음 학습 추천을 확인할 수 있습니다.

## 수동 테스트 방법

```bash
cd apps/web
npm install
cp .env.example .env.local
```

`.env.local`에 OpenRouter 키, Supabase Postgres 연결 문자열, 문서 업로드용 Supabase Storage 설정을 지정합니다.

```bash
OPENROUTER_API_KEY=sk-or-...
# 선택: 비워두면 OpenRouter 계정 기본 모델 사용
OPENROUTER_MODEL=google/gemini-2.5-flash
# 설정 화면에서 저장하는 provider API key를 암호화하는 서버 전용 secret
LLM_SETTINGS_SECRET=change-this-long-random-secret
# Supabase Dashboard > Connect > Connection Pooler의 URI를 사용하고 [YOUR-PASSWORD]를 실제 DB password로 바꿉니다.
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
# Supabase Storage signed upload URL 생성과 서버 측 문서 읽기에 사용합니다. service role key는 브라우저에 노출하지 않습니다.
# SUPABASE_URL은 DATABASE_URL에서 project-ref를 추론할 수 없을 때만 명시합니다.
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_DOCUMENT_BUCKET=rootmap-documents
```

LLM provider는 기본적으로 위 `OPENROUTER_*` 환경 변수를 fallback으로 사용합니다.
앱 실행 후 `/settings/llm-provider`에서 OpenRouter, CrofAI, OpenAI-compatible `Base URL`/`API Key`/`Model`/`JSON mode`를 저장하면 DB 설정이 fallback보다 우선됩니다.

## 로컬 문서 처리 Runner

Cloud Tasks/Cloud Run worker를 깨우지 않고 특정 문서 하나만 로컬에서 처리하려면 `apps/web/.env.local-worker`를 준비합니다. 이 파일은 git에 commit하지 않습니다.

필수 값:

```bash
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_DOCUMENT_BUCKET=rootmap-documents
LLM_SETTINGS_SECRET=change-this-long-random-secret
```

direct DB host가 IPv6 문제로 실패하면 Supabase connection pooler의 session mode URL을 사용합니다. `LLM_SETTINGS_SECRET`은 설정 화면에 저장된 LLM provider key를 복호화할 수 있는 값과 같아야 합니다.

```bash
npm run document:process-local -- --document-id <document-id> --dry-run
npm run document:process-local -- --document-id <document-id> --resume --chunk-batch-size 1
npm run document:process-local -- --document-id <document-id> --tree-only
```

`--dry-run`은 DB를 변경하지 않고 문서 상태, chunk/checkpoint/concept 수, 중복 문서 경고를 출력합니다. `--tree-only`는 `concepts_extracted` 상태에서만 사용하며 chunk concept LLM 호출 없이 tree 생성과 저장만 재시도합니다.

DB 테이블을 준비하고 개발 서버를 실행합니다. 마이그레이션 SQL은 `drizzle/`에 있습니다.

```bash
npm run db:push
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열고 아래 Phase 1 테스트 주제를 입력해 확인합니다.

- `Rust lifetime`
- `Transformer`
- `가상 메모리`

확인할 흐름:

1. 시작 화면에서 주제 입력 후 트리 생성
2. 다섯 타입 섹션 확인: 선수지식 / 핵심 개념 / 부가 지식 / 오개념 / 이해 점검
3. 추천 노드 영역 확인
4. 노드 클릭 후 상세 설명 생성 확인
5. 이해 상태를 `안다 / 조금 안다 / 모른다`로 변경
6. 추천 결과 갱신 확인
7. 새로고침 후 저장된 트리와 진행 상태 복원 확인

## 자동 검증

```bash
cd apps/web
npm run check
```

`check`는 lint와 production build/type check를 순서대로 실행합니다. Supabase 실제 DB 검증은 `DATABASE_URL`을 Supabase Postgres URL로 설정한 뒤 API 라우트 또는 Drizzle 쿼리로 수행합니다.

Phase 07 시각 학습 상세 화면의 schema, renderer, empty fallback fixture는 아래 명령으로 확인합니다.

```bash
npm run phase7:visual-detail-smoke
```

## Phase 2 관리자/개발자 화면

```bash
cd apps/web
npm run dev
# production/staging에서 임시 활성화가 필요하면 ROOTMAP_ADMIN_ENABLED=true 설정
```

브라우저에서 [http://localhost:3000/admin/concepts](http://localhost:3000/admin/concepts)를 열면 Concept 목록, 검색/domain 필터, 상세 Edge, 사용 트리, 병합 후보를 확인할 수 있습니다. 이 화면은 로컬 개발 또는 `ROOTMAP_ADMIN_ENABLED=true`에서만 활성화됩니다.
