# 10. 보안·품질·테스트

## 목표

학습 데이터가 사용자별로 격리되고, 로그·LLM 전송이 최소화되며, Vercel/Supabase live 환경에서 명세 품질·테스트·완료 조건을 검증한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 21장 보안 및 개인정보
- 동일 17·18·19·22장 품질·MVP·테스트·완료 조건

## 구현 작업

### 0. Live 인프라 선행 게이트

- [00-live-infra-auth-and-deployment-preflight.md](./00-live-infra-auth-and-deployment-preflight.md)의 확인 결과를 Phase 4 시작 조건으로 사용한다.
- Vercel production live smoke는 `GET /`, `GET /api/trees`, `GET /api/settings/llm-provider`, `POST /api/documents/upload-url`을 최소 기준으로 둔다.
- Vercel 환경변수는 dashboard 또는 CLI로 key와 target을 감사한다. 현재 세션에서는 env 목록을 직접 조회하지 못했으므로 Phase 4 착수 전 별도 확인이 필요하다.
- Supabase advisor의 `RLS Enabled No Policy` 경고를 허용할지 해결할지 결정한다.
- Vercel Cron/queue를 쓰는 기능은 Supabase `pgmq` extension과 queue migration 적용 이후에만 production 경로로 연결한다.

### 1. 접근 통제

- 모든 세션·이벤트·mastery·퀴즈·리포트·복습 API에서 `user_id` 검증
- `DEFAULT_USER_ID` 기반 MVP 흐름을 실제 사용자 식별로 교체하거나, Phase 4 MVP에서 단일 사용자만 지원한다는 제한을 명시
- Supabase Auth를 채택하면 `auth.uid()`와 맞도록 `user_id` 타입과 RLS policy를 설계
- 서버 Postgres 연결만 유지하면 API route 단위의 소유권 검증 테스트를 추가
- 관리자 우회가 있다면 명시적 역할 검사

### 2. 로깅·LLM

- 퀴즈 원문·오개노트가 앱 로그에 과다 남지 않도록
- LLM 페이로드 필드 최소화(§21.5~21.6)
- Vercel function log에 사용자 답변 원문, provider API key, signed URL이 남지 않도록 테스트한다.

### 3. 추천 품질

- §17 품질 검증: known 반복 추천 금지, 선수지식 건너뛰기 금지, 오답·오래된 낮은 confidence 복습 상승, 이유 구체성
- 추천 노출(`recommendation_logs`)과 클릭(`recommendation_clicked`, `clicked`)이 사용자별로 혼입되지 않는지 검증
- 약점 분석이 prerequisite gap과 core concept gap을 구분하고, 반복 오개념을 다음 행동으로 연결하는지 검증

### 4. 자동화 테스트

- §19 테스트 1~5 및 사용 시나리오
- “같은 트리에서 추천 순서가 사용자마다 다름” 회귀 테스트
- 세션 리포트에 강점·약점·다음 추천이 포함되고, 약점 분석 산출물이 재현 가능한지 테스트
- Supabase Postgres 또는 Supabase branch/test DB 기준 smoke를 추가하고, `DATABASE_URL=file:` 기반 smoke는 Phase 4 완료 기준에서 제외한다.
- Supabase advisor 결과와 `pg_policies` policy 수를 검증 로그에 남긴다.
- Vercel production/preview smoke에서 Phase 4 API가 환경변수 누락 없이 동작하는지 확인한다.

### 5. 완료 체크리스트

- §22 12항·§18 MVP 문장과 대조하는 체크리스트 문서 또는 CI 스크립트

## 완료 기준(DoD)

- 타 사용자 데이터 혼입 불가능성이 코드 리뷰·테스트로 뒷받침된다.
- Phase 4 완료 조건(§22)을 프로덕트/QA가 재현 가능한 시나리오로 확인할 수 있다.
- Vercel 환경변수 target 감사, Supabase RLS policy 결정, `pgmq` queue 적용 여부가 문서화되어 있다.
- 완료 체크리스트: [phase4-completion-checklist.md](./phase4-completion-checklist.md)
- 검증 명령: `npm run phase4:quality-smoke` (`apps/web`에서 실행)
