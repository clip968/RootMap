# 00. Live 인프라·인증 선행 점검

## 목표

Phase 4 기능 구현 전에 현재 Vercel/Supabase 운영 전제를 고정한다. Phase 4는 사용자별 학습 이력, 추천, 퀴즈, 리포트를 저장하므로 인증·권한·RLS·배포 환경이 먼저 결정되어야 한다.

## Live 확인 결과

확인일: 2026-05-21

### Vercel

- Team: `clip968-6712's projects`
- Project: `root-map`
- Framework: Next.js
- Node.js: `24.x`
- 최신 production deployment: `READY`
- 최신 production commit: `70a607949a532984b2367a941db2c6f344cba453` (`Fix Vercel cron schedule for Hobby plan`)
- Production domains:
  - `root-map.vercel.app`
  - `root-map-clip968-6712s-projects.vercel.app`
  - `root-map-git-main-clip968-6712s-projects.vercel.app`

Live endpoint 확인:

- `GET /` -> `200`
- `GET /api/trees` -> `200`, Supabase Postgres row 조회 성공
- `GET /api/settings/llm-provider` -> `200`, database provider 설정 조회 성공
- `POST /api/documents/upload-url` -> `200`, `rootmap-documents` signed upload URL 생성 성공

제한 사항:

- 로컬에 `.vercel/project.json`이 없다.
- 현재 세션에는 `vercel` CLI와 `VERCEL_TOKEN`이 없어 Vercel 환경변수 key/target 목록을 직접 조회하지 못했다.
- 위 live endpoint 결과로 `DATABASE_URL`과 Supabase Storage 관련 환경변수가 production에서 동작하는 것은 확인했지만, 환경변수별 target(`production`/`preview`/`development`) 등록 상태는 Vercel dashboard 또는 CLI로 별도 감사해야 한다.

### Supabase

- Project: `RootMap`
- Project ref: `hyazwtatymdsuuclggar`
- Region: `ap-northeast-1`
- Status: `ACTIVE_HEALTHY`
- Postgres: `17.6.1.121`
- Edge Functions: 없음
- Supabase Auth 사용자 수: `0`

DB 상태:

- `public` schema에 기존 테이블 16개가 있다.
- 기존 public 테이블은 모두 RLS enabled 상태다.
- `pg_policies` 기준 public/storage policy는 `0`개다.
- Supabase security advisor도 기존 public 테이블 전체에 `RLS Enabled No Policy`를 보고한다.
- Phase 4 테이블은 아직 없다:
  - `learning_sessions`
  - `learning_events`
  - `user_concept_mastery`
  - `quiz_attempts`
  - `misconception_events`
  - `recommendation_logs`
  - `learning_reports`

Storage 상태:

- Bucket: `rootmap-documents`
- Public: `false`
- File size limit: `20 MiB`
- 허용 MIME type: PDF, plain text, markdown, octet-stream

Queue/Cron 상태:

- Vercel Cron route는 코드와 Vercel 설정에 있다.
- Supabase `pgmq` extension은 아직 없다.
- `pgmq.q_document_processing` queue table도 아직 없다.
- `apps/web/drizzle/0003_document_processing_queue.sql`은 로컬에 있지만 Supabase migration history에는 보이지 않는다.

## Phase 4 계획 변경 사항

1. 인증·사용자 식별을 Phase 4 선행 게이트로 올린다.
   - 현재 API는 `DEFAULT_USER_ID`를 사용한다.
   - Phase 4의 "사용자별 추천" 검증 전에 실제 user identity source를 정해야 한다.
   - Supabase Auth를 쓸지, 별도 auth/session을 쓸지 먼저 결정한다.

2. `user_id` 타입을 확정한다.
   - 현재 앱 schema는 `text("user_id")`를 사용한다.
   - Phase 4 명세 DDL은 `UUID`를 전제한다.
   - Supabase Auth `auth.uid()` 기반 RLS를 사용할 계획이면 UUID 정렬이 우선이다.

3. RLS policy 전략을 먼저 정한다.
   - 현재 RLS는 켜져 있지만 policy는 없다.
   - 서버 Postgres 연결만 유지한다면 API 레벨 권한 검증이 핵심이다.
   - Supabase Data API/browser client를 열 계획이면 public/storage policy를 Phase 4 schema와 함께 설계해야 한다.

4. Vercel 환경변수 target 감사를 Phase 4 시작 조건에 넣는다.
   - `DATABASE_URL`
   - `LLM_SETTINGS_SECRET`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
   - `SUPABASE_URL` 또는 `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DOCUMENT_BUCKET`

5. Queue/Cron 실사용 전에 Supabase queue migration을 정리한다.
   - Phase 4 리포트·퀴즈 평가·복습 계산이 오래 걸리면 Vercel 함수 안에서 동기 처리하지 않는다.
   - 기존 문서 처리 worker 패턴을 재사용하려면 `pgmq` migration 적용과 smoke가 먼저 필요하다.

6. Smoke test 기준을 SQLite에서 Supabase/Postgres 기준으로 바꾼다.
   - 현재 일부 npm smoke script는 `DATABASE_URL=file:`을 사용한다.
   - Phase 4 완료 검증은 production-like Postgres 또는 격리된 Supabase branch/test DB를 기준으로 한다.

## 2026-05-21 확정 결정

Phase 4는 처음부터 다중 사용자 데이터를 안전하게 분리할 수 있는 서버·DB 구조로 작성한다. 다만 로그인과 계정 관리 UI는 Phase 4 개인화 기능을 검증하는 데 필요한 최소 범위로 제한한다.

1. 사용자 식별 source
   - 공식 방향은 Supabase Auth다.
   - Phase 4 신규 테이블의 `user_id`는 Supabase Auth의 `auth.users.id`와 맞는 UUID 기준으로 설계한다.
   - 기존 `DEFAULT_USER_ID` 기반 API는 Phase 4 신규 API의 기준으로 삼지 않는다.

2. 로그인 UI 범위
   - Phase 4에서 필요한 것은 "사용자를 식별해 학습 데이터를 분리할 수 있음"이다.
   - 회원가입 온보딩, 프로필 관리, 소셜 로그인 다듬기, 계정 설정, 조직/팀 기능은 Phase 4 범위에서 제외한다.
   - 로그인 화면은 최소 MVP로 두고, 개인화 학습 데이터 모델과 API 격리를 우선한다.

3. RLS와 접근 제어
   - 신규 Phase 4 테이블은 Supabase Auth 기반 RLS policy를 적용할 수 있는 형태로 작성한다.
   - 서버 API route에서도 `user_id` 소유권 검증을 수행한다.
   - Supabase browser/Data API를 직접 열더라도 다른 사용자의 학습 세션, 이벤트, 퀴즈, 리포트가 섞이지 않도록 policy를 설계한다.

4. 기존 데이터와 `DEFAULT_USER_ID`
   - 기존 Phase 1~3 데이터는 별도 이행 작업 전까지 유지한다.
   - 기존 단일 사용자 데이터는 마이그레이션 시점에 실제 Auth 사용자로 귀속하거나, 개발용 seed 데이터로 분리한다.
   - Phase 4 신규 기능은 `DEFAULT_USER_ID` 의존을 새로 늘리지 않는다.

5. 배포 전 남은 게이트
   - Vercel 환경변수 target 감사는 현재 세션 권한으로 직접 확인하지 못했으므로 Phase 4 production 배포 전 게이트로 남긴다.
   - Supabase advisor의 기존 `RLS Enabled No Policy` 경고는 Phase 4 신규 테이블 policy와 별도로 정리한다.
   - `pgmq` queue는 세션 리포트나 장기 작업을 production 비동기로 연결하기 전 적용한다.

## 완료 기준(DoD)

- 실제 사용자 식별 source와 `user_id` 타입이 문서화되어 있다.
- `DEFAULT_USER_ID` 유지/제거 범위가 API별로 정리되어 있다.
- public/storage RLS policy 전략이 "server-only" 또는 "Supabase Auth/Data API" 중 하나로 확정되어 있다.
- Vercel 환경변수 key와 target이 dashboard 또는 CLI로 감사되어 있다.
- Supabase advisor의 `RLS Enabled No Policy`를 Phase 4에서 허용할지, 해결할지 결정되어 있다.
- Phase 4 테이블 migration 방식이 Drizzle/Supabase migration history 중 하나로 일관된다.
- Vercel Cron/queue를 사용할 경우 `pgmq`와 `document_processing` queue가 live DB에 적용되어 있다.
