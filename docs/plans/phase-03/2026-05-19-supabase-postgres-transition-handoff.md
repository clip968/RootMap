# Supabase Postgres 전환 작업 정리

작성일: 2026-05-19

## 현재 상태

- `main` 브랜치에 Supabase Postgres 전환 작업이 병합되어 원격 `origin/main`까지 반영되었다.
- 최종 반영 커밋은 `6695443 Phase 3 migrate web database to Supabase Postgres`이다.
- 작업용 브랜치와 원격 feature 브랜치는 정리되어 현재 `main` / `origin/main`만 남아 있다.
- Next 개발 서버는 Supabase DB 연결 smoke 이후 종료/재시작 검증까지 수행했다.

## 완료한 작업

### LLM Provider 설정

- `/settings/llm-provider` 설정 화면을 추가했다.
- `/api/settings/llm-provider`에서 저장, 조회, 삭제를 처리한다.
- `/api/settings/llm-provider/test`에서 provider 연결 테스트를 처리한다.
- API key는 해싱하지 않고 AES-GCM으로 암호화해 저장한다.
- 서버가 LLM 요청에 원문 API key를 다시 사용해야 하므로, 단방향 해시 저장은 적용하지 않았다.
- `LLM_SETTINGS_SECRET`이 없으면 저장 API가 실패하도록 해 암호화 키 누락을 명확히 드러낸다.

### SQLite에서 Supabase Postgres로 전환

- `better-sqlite3` 기반 동기 DB 클라이언트를 제거하고 `postgres` + `drizzle-orm/postgres-js`로 교체했다.
- `apps/web/src/db/schema.ts`를 `sqliteTable` 기반에서 `pgTable` 기반으로 전환했다.
- JSON 필드는 Postgres `jsonb`, boolean 필드는 실제 `boolean` 타입으로 전환했다.
- 기존 SQLite migration과 drizzle meta snapshot을 제거하고 Postgres 초기 migration을 추가했다.
- Supabase advisor에서 지적한 외래키 보조 인덱스 누락을 보완하는 migration을 추가했다.
- repository와 API route의 DB 호출을 Postgres 비동기 흐름에 맞춰 `async/await` 기반으로 전환했다.

### Supabase 원격 DB

- Supabase project: `RootMap`
- Project ref: `hyazwtatymdsuuclggar`
- Region: `ap-northeast-1`
- Postgres: `17.6.1.121`
- 적용한 원격 migration:
  - `rootmap_postgres_initial_schema`
  - `rootmap_postgres_fk_indexes`
- 생성된 public table:
  - `learning_trees`
  - `llm_provider_settings`
  - `concepts`
  - `learning_nodes`
  - `user_node_progress`
  - `concept_edges`
  - `learning_tree_concepts`
  - `concept_merge_candidates`
  - `documents`
  - `document_pages`
  - `document_chunks`
  - `document_concepts`
  - `document_learning_trees`
  - `user_concept_progress`
- public table은 모두 RLS enabled 상태로 만들었다.
- 현재 앱은 browser client가 아니라 서버의 Postgres 연결로 DB에 접근한다.

## 검증 결과

- `npm run check` 통과
  - lint 통과
  - production build/type check 통과
- Supabase MCP로 실제 DB insert/select/delete smoke 통과
- 앱 API로 Supabase 연결 smoke 통과
  - `GET /api/trees` -> `200`
  - `GET /api/concepts` -> `200`
  - `GET /api/settings/llm-provider` -> `200`
  - dummy LLM provider 저장 -> `200`
  - Supabase SQL로 저장 row 확인
  - dummy LLM provider 삭제 -> `200`
  - active provider row `0` 확인

## 환경 설정 주의점

### DATABASE_URL

Supabase direct DB host는 이 환경에서 IPv6 only로 해석되어 WSL에서 `ENETUNREACH`가 발생했다.

작동 확인된 연결은 Supabase Pooler의 `aws-1` host이다.

```bash
DATABASE_URL=postgresql://postgres.hyazwtatymdsuuclggar:<db-password>@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
```

`aws-0-ap-northeast-1.pooler.supabase.com`은 이 프로젝트에서 `tenant/user not found`가 발생했다.

### LLM_SETTINGS_SECRET

LLM provider 설정 저장 기능을 사용하려면 서버 환경에 아래 값이 필요하다.

```bash
LLM_SETTINGS_SECRET=<32바이트 이상 랜덤 문자열 권장>
```

이 값은 저장된 API key 복호화에 필요하므로, 배포 후 변경하면 기존에 저장된 key를 복호화할 수 없다.

## 남은 리스크

- 현재는 단일 사용자 전제다. 여러 사용자가 각자 LLM key를 저장하려면 `llm_provider_settings`에 `user_id`를 추가하고 인증 사용자 기준으로 조회/저장을 제한해야 한다.
- Supabase public schema에 RLS는 켰지만 정책은 아직 없다. 현재 서버 Postgres 연결 방식에서는 문제 없이 동작하지만, Supabase Data API를 직접 노출할 계획이면 역할별 policy 설계가 필요하다.
- 문서 업로드 파일은 아직 로컬 파일시스템 저장 흐름이다. Vercel 배포에서 문서 업로드까지 지원하려면 Supabase Storage 또는 별도 object storage로 교체해야 한다.
- 기존 smoke script 일부는 SQLite 전제였기 때문에 `check`에서 제외했다. Postgres/Supabase 기준의 새 smoke script로 재작성하는 것이 좋다.
- `.env.local`은 git 추적 대상이 아니므로 Vercel 배포 환경 변수는 별도로 등록해야 한다.

## 다음 작업 제안

1. Vercel 배포 환경 변수 등록
   - `DATABASE_URL`
   - `LLM_SETTINGS_SECRET`
   - 기존 `OPENROUTER_*` fallback 환경 변수

2. Vercel preview 배포 smoke
   - `/api/trees`
   - `/api/concepts`
   - `/api/settings/llm-provider`
   - `/settings/llm-provider`

3. Supabase RLS 정책 설계
   - 지금처럼 서버 Postgres만 사용할지, Supabase Auth/Data API까지 쓸지 먼저 결정한다.
   - 다중 사용자 전환 시 `user_id` 기반 정책을 추가한다.

4. 문서 업로드 storage 전환 여부 결정
   - Vercel 배포에서 파일 업로드 기능이 필요하면 Supabase Storage로 교체한다.
   - 필요 없다면 현재 로컬 저장 제한을 README에 명확히 둔다.

5. Postgres용 smoke script 정리
   - SQLite 전제 script를 제거하거나 Supabase Postgres 기준으로 다시 작성한다.
   - 최소 smoke는 learning tree 저장/조회, concept 저장/조회, LLM provider 저장/삭제를 포함한다.

6. DB migration 운영 방식 확정
   - 현재는 repo의 `apps/web/drizzle/*.sql`과 Supabase MCP migration 적용을 함께 사용했다.
   - 이후에는 Supabase CLI, Drizzle push/generate, MCP migration 중 하나를 팀 표준으로 정한다.
