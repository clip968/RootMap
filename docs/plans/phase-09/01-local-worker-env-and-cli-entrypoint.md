# 01. Local Worker Env와 CLI Entrypoint

## 목표

`apps/web`에서 로컬 문서 처리 runner를 실행할 수 있도록 env 파일 로딩, npm script, CLI 옵션 parsing의 기본 골격을 만든다.

## 관련 명세

- `local-document-processing-runner-spec.md` Required Local Environment
- `local-document-processing-runner-spec.md` Command Interface
- `local-document-processing-runner-spec.md` Implementation Targets

## 관련 파일

- `apps/web/scripts/process-document-local.ts`
- `apps/web/package.json`
- `apps/web/.gitignore`
- `.gitignore`
- `apps/web/src/db/constants.ts`

## 구현 작업

### 1. CLI script 파일 생성

- `apps/web/scripts/process-document-local.ts`를 추가한다.
- script는 Next.js runtime이 아니므로 직접 env 파일을 읽어 `process.env`에 주입한다.
- env 로딩과 CLI option parsing처럼 운영 실수로 이어질 수 있는 분기에는 한국어 주석을 남긴다.
- 기본 env 파일은 `.env.local-worker`로 둔다.
- `--env-file <path>`가 있으면 `apps/web` 기준 상대 경로나 절대 경로를 모두 지원한다.
- env 파일 값은 `KEY=value`, 작은따옴표, 큰따옴표 형태를 지원한다.

### 2. 필수 env 검증

- 실행 전에 다음 값을 확인한다.
  - `DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_DOCUMENT_BUCKET`
  - `LLM_SETTINGS_SECRET`
- 누락된 값이 있으면 DB나 LLM 호출 전에 중단한다.
- 오류 메시지는 누락 key 목록과 사용한 env 파일 경로를 함께 출력한다.

### 3. CLI 옵션 parsing

- 필수 옵션은 `--document-id <uuid>` 하나다.
- 지원 옵션은 다음으로 제한한다.
  - `--env-file <path>`
  - `--resume`
  - `--dry-run`
  - `--tree-only`
  - `--chunk-batch-size <number>`
  - `--stop-after-concepts`
- `--chunk-batch-size`는 양의 정수만 허용한다.
- 알 수 없는 옵션, 중복 값, document id 누락은 실행 전에 usage와 함께 실패시킨다.

### 4. npm script 추가

- `apps/web/package.json`에 아래 script를 추가한다.

```json
"document:process-local": "tsx scripts/process-document-local.ts"
```

### 5. env 파일 commit 방지 확인

- `.gitignore`와 `apps/web/.gitignore`의 `.env*` 규칙이 `.env.local-worker`를 포함하는지 확인한다.
- 예외 규칙을 추가해야 한다면 `.env.example` 같은 non-secret 파일에만 적용한다.

## 완료 기준(DoD)

- `cd apps/web && npm run document:process-local -- --document-id <uuid> --dry-run` 형태로 runner가 호출된다.
- env 누락 시 DB 연결 전에 실패한다.
- `--document-id` 누락과 잘못된 `--chunk-batch-size`가 명확한 CLI 오류로 처리된다.
- `.env.local-worker`가 git 추적 대상이 되지 않는다.
- 검증 명령: `npm run document:process-local -- --document-id 00000000-0000-0000-0000-000000000000 --dry-run`
