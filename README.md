# RootMap

RootMap은 사용자가 배우고 싶은 주제를 입력하면 해당 주제를 이해하기 위해 필요한 선수지식, 핵심 개념, 부가 지식, 오개념, 이해 점검 항목을 학습 트리 형태로 정리해 주는 AI 기반 학습 서비스입니다. 현재 웹 애플리케이션은 `apps/web`에 구현되어 있으며, Vercel 배포 환경과 로컬 개발 환경에서 실행할 수 있습니다.

## 실행 방법

### 1. Vercel 배포본 사용

Vercel에 배포된 RootMap은 별도 설치 없이 브라우저에서 바로 사용할 수 있습니다.
다만 Vercel은 Next.js 앱을 실행할 뿐, cold start 시점에 Supabase DB 테이블이나 `rootmap-documents` Storage bucket을 자동으로 만들지 않습니다. 배포본을 정상적으로 쓰려면 Vercel 환경 변수, Supabase Postgres, Supabase Storage, LLM provider 설정이 먼저 준비되어 있어야 합니다.

#### 1-1. 접속

아래 형태의 배포 URL에 접속합니다.

```text
https://<배포된-rootmap-url>.vercel.app
```

프로덕션 배포 URL을 공유할 때는 Vercel dashboard의 `Project` > `Deployments` 또는 `Project` > `Settings` > `Domains`에서 현재 Production alias를 확인합니다. Preview deployment URL도 동작할 수 있지만, 환경 변수가 Preview 환경에 등록되어 있지 않으면 DB 연결, 문서 업로드, LLM 호출이 실패할 수 있습니다.

#### 1-2. 일반 주제 학습 트리 생성

1. 시작 화면의 주제 입력 영역에 배우고 싶은 주제를 입력합니다.
   - 예시: `Transformer`, `Rust lifetime`, `가상 메모리`, `Linux block layer`
2. `트리 생성` 버튼을 누릅니다.
3. 앱은 `/api/trees/generate` 서버 라우트에서 LLM을 호출하고, 생성된 학습 트리와 노드 정보를 Supabase Postgres에 저장합니다.
4. 생성이 끝나면 `/tree/<tree-id>` 페이지로 이동합니다.
5. 트리에서 노드를 클릭하면 상세 학습 모달이 열립니다.
6. 상세 모달에서 쉬운 설명, 예시, 오개념, 이해 점검 질문을 확인합니다.
7. 노드별 이해 상태를 `안다`, `조금 안다`, `모른다`로 바꾸면 추천 학습 흐름과 복습 우선순위가 갱신됩니다.

일반 주제 입력 방식은 PDF 업로드 없이도 동작합니다. 이 경우 필요한 것은 DB 연결과 LLM 호출 환경 변수입니다.

#### 1-3. PDF 문서 기반 학습 트리 생성 흐름

PDF 문서 기반 트리는 두 단계로 나뉩니다.

1. Vercel 배포본에서 PDF를 업로드해 `document_id`를 만듭니다.
2. GitHub Actions 또는 로컬 CLI runner에서 해당 `document_id`를 처리해 학습 트리를 생성합니다.

Vercel 배포본의 업로드 API는 파일을 Supabase Storage bucket에 저장하고 DB에 문서 행을 만드는 역할을 합니다. 긴 PDF 분석, chunk별 개념 추출, 문서 기반 트리 생성은 별도 runner에서 수행합니다. 따라서 PDF를 업로드했다고 해서 Vercel만으로 즉시 학습 트리가 완성되는 것은 아닙니다.

배포본에서 PDF를 업로드할 때는 화면의 문서 업로드 영역을 사용하거나 아래 API를 직접 호출할 수 있습니다.

```bash
curl -sS -X POST "https://<배포된-rootmap-url>.vercel.app/api/documents/upload" \
  -F "file=@/absolute/path/to/document.pdf;type=application/pdf"
```

응답에서 `document_id`를 확인합니다.

```json
{
  "document_id": "<document-id>",
  "filename": "document.pdf",
  "processing_status": "uploaded"
}
```

이 `document_id`는 GitHub Actions 수동 실행이나 로컬 CLI 처리에 그대로 사용합니다.

#### 1-4. Vercel에서 자주 확인해야 하는 상태

1. 주제 트리 생성이 실패하면 Vercel `Runtime Logs`에서 `/api/trees/generate` 오류를 확인합니다.
2. PDF 업로드가 실패하면 `SUPABASE_DOCUMENT_BUCKET` 값과 Supabase Storage bucket 존재 여부를 확인합니다.
3. 상세 설명 생성이 실패하면 OpenRouter API key, 모델명, LLM provider 설정, 서버 로그의 `INVALID_LLM_RESPONSE` 또는 `LLM_GENERATION_FAILED`를 확인합니다.
4. `/tree/<tree-id>`가 열리지 않으면 해당 `tree_id`가 DB에 저장되어 있는지, 배포본이 같은 `DATABASE_URL`을 보고 있는지 확인합니다.
5. Preview 배포에서는 Production과 다른 환경 변수 범위를 사용할 수 있으므로, 먼저 Production 배포 URL에서 재현 여부를 확인합니다.

### 2. 로컬 환경에서 실행

로컬에서 실행하려면 Node.js와 npm이 필요합니다. Node.js는 20 이상 버전을 권장합니다.

```bash
cd apps/web
npm install
```

`apps/web/.env.local` 파일을 만들고 실행에 필요한 환경 변수를 설정합니다. 실제 키와 연결 문자열은 개인 환경에 맞게 입력해야 합니다.
문서 업로드 기능까지 확인하려면 Supabase Storage에 private bucket `rootmap-documents`를 미리 생성해야 합니다.

```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2.5-flash
LLM_SETTINGS_SECRET=change-this-long-random-secret
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_DOCUMENT_BUCKET=rootmap-documents
```

DB 테이블을 준비한 뒤 개발 서버를 실행합니다.

```bash
npm run db:push
npm run dev
```

브라우저에서 아래 주소에 접속합니다.

```text
http://localhost:3000
```

운영 빌드와 동일한 방식으로 확인하려면 다음 명령을 사용할 수 있습니다.

```bash
npm run build
npm run start
```

### 3. 실제 PDF를 로컬 CLI로 학습 트리화하기

Vercel 배포 환경에서는 PDF 처리 worker를 자동으로 실행하지 않고, 실제 PDF 분석은 로컬 CLI runner에서 수행합니다. 현재 CLI runner는 PDF 파일 경로를 직접 받는 형태가 아니라, 먼저 업로드 API로 `document_id`를 만든 뒤 그 `document_id`를 로컬에서 처리하는 방식입니다.

먼저 로컬 worker env 파일을 준비합니다.

```bash
cd apps/web
cp .env.local .env.local-worker
```

`apps/web/.env.local-worker`에는 최소한 아래 값이 필요합니다. 이 파일은 git에 commit하지 않습니다.

```bash
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_DOCUMENT_BUCKET=rootmap-documents
LLM_SETTINGS_SECRET=change-this-long-random-secret
```

DB에 저장된 LLM provider 설정이 없다면 fallback 호출을 위해 아래 값도 추가합니다.

```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2.5-flash
```

PDF를 업로드해서 `document_id`를 생성합니다. 배포본을 사용할 경우:

```bash
curl -sS -X POST "https://<배포된-rootmap-url>.vercel.app/api/documents/upload" \
  -F "file=@/absolute/path/to/document.pdf;type=application/pdf"
```

로컬 서버를 사용할 경우에는 별도 터미널에서 `npm run dev`를 실행한 뒤 다음처럼 요청합니다.

```bash
curl -sS -X POST "http://localhost:3000/api/documents/upload" \
  -F "file=@/absolute/path/to/document.pdf;type=application/pdf"
```

응답에서 `document_id`를 확인합니다.

```json
{
  "document_id": "<document-id>",
  "filename": "document.pdf",
  "processing_status": "uploaded"
}
```

그 다음 로컬 CLI runner로 dry-run을 먼저 실행합니다.

```bash
npm run document:process-local -- --document-id <document-id> --dry-run
```

`can_process`가 `true`이면 실제 처리를 실행합니다.

```bash
npm run document:process-local -- --document-id <document-id> --resume --chunk-batch-size 1
```

문서가 여러 chunk로 나뉘면 한 번에 끝나지 않을 수 있습니다. 출력에서 `processing_status_after`가 `tree_generated`가 될 때까지 같은 명령을 반복합니다. 완료되면 출력의 `tree_id`로 결과를 확인합니다.

```text
http://localhost:3000/tree/<tree-id>
```

이미 `concepts_extracted` 상태까지 끝났고 tree 저장만 다시 시도해야 한다면 아래 명령을 사용합니다.

```bash
npm run document:process-local -- --document-id <document-id> --tree-only
```

주의할 점:

1. 스캔본 PDF처럼 텍스트가 추출되지 않는 PDF는 실패합니다.
2. 업로드 가능한 파일은 PDF, TXT, MD이고 최대 20MB입니다.
3. 문서 처리 단계에서는 LLM을 호출하므로 provider API key 또는 DB에 저장된 provider 설정이 필요합니다.
4. `SUPABASE_SERVICE_ROLE_KEY`는 서버/로컬 worker 전용 값이므로 브라우저 코드나 공개 문서에 노출하면 안 됩니다.

### 4. GitHub Actions로 PDF 처리 실행하기

제출/시연 환경에서는 로컬 PC 대신 GitHub Actions runner에서 같은 CLI를 실행할 수 있습니다. 이 방식은 RootMap 웹에서 PDF를 업로드한 직후 자동으로 처리되는 제품 기능은 아니며, GitHub Actions 화면의 `Run workflow` 버튼을 눌러 `document_id`를 입력하는 수동 실행 방식입니다.

이 방법을 쓰면 Vercel 배포본은 문서 업로드와 결과 확인 화면을 담당하고, GitHub Actions runner가 문서 분석 작업을 담당합니다. 즉 사용 흐름은 `Vercel에서 업로드` → `Actions에서 document_id 처리` → `Vercel의 /tree/<tree-id>에서 결과 확인`입니다.

먼저 GitHub repository의 `Settings` > `Secrets and variables` > `Actions`에 아래 repository secrets를 등록합니다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LLM_SETTINGS_SECRET
OPENROUTER_API_KEY
OPENROUTER_MODEL
```

그 다음 아래 순서로 실행합니다.

1. RootMap 웹에서 PDF를 업로드합니다.
2. 업로드 결과에서 `document_id`를 확인합니다.
3. GitHub repository의 `Actions` 탭으로 이동합니다.
4. `Process RootMap Document` workflow를 선택합니다.
5. `Run workflow` 버튼을 누르고 `document_id`를 입력합니다.
6. 기본값 그대로 `chunk_batch_size`는 `3`, `max_attempts`는 `20`으로 실행합니다.
7. Actions 로그에서 `processing_status_after`가 `tree_generated`가 되었는지 확인합니다.
8. 같은 로그의 `tree_id` 값을 사용해 결과 페이지에 접속합니다.

```text
https://<배포된-rootmap-url>.vercel.app/tree/<tree-id>
```

workflow 내부에서는 아래 명령을 반복 실행합니다. 문서 chunk가 많아서 한 번에 끝나지 않으면 저장된 checkpoint를 기준으로 이어서 처리합니다.

```bash
npm run document:process-local -- --document-id <document-id> --resume --chunk-batch-size 3
```

`chunk_batch_size`는 한 번의 CLI 실행에서 처리할 pending chunk 수입니다. workflow는 `DOCUMENT_CHUNK_CONCURRENCY=1`로 실행되므로 기본값 `3`은 chunk 3개를 동시에 처리한다는 뜻이 아니라, 한 attempt 안에서 최대 3개 chunk를 순차 처리한다는 뜻입니다. 이미 처리되어 metadata에 checkpoint된 chunk는 다음 attempt에서 다시 LLM 호출하지 않습니다.

실행 중 확인할 로그 포인트:

1. `processing_status_before`
   - 현재 문서가 `uploaded`, `text_extracted`, `chunked`, `concepts_extracted` 중 어디서 시작하는지 확인합니다.
2. `pendingChunkCount`
   - 남은 chunk 수입니다. 반복 실행할수록 줄어야 합니다.
3. `processing_status_after`
   - 최종적으로 `tree_generated`가 되어야 합니다.
4. `tree_id`
   - 결과 페이지 URL에 사용할 값입니다.

실패했을 때의 처리:

1. workflow가 60분 제한에 걸리거나 `MAX_ATTEMPTS` 안에 끝나지 않으면 같은 `document_id`로 다시 `Run workflow`를 실행합니다.
2. OpenRouter rate limit이나 일시적 LLM 오류가 의심되면 잠시 기다린 뒤 같은 `document_id`로 다시 실행합니다.
3. 로그에 `processing_status_after`가 `concepts_extracted`로 남아 있고 tree 생성만 실패했다면 로컬에서는 `--tree-only`를 사용할 수 있습니다. GitHub Actions workflow는 기본적으로 `--resume` 경로를 반복하므로, 같은 workflow를 다시 실행해도 저장된 개념 추출 결과를 재사용해 tree 생성을 재시도합니다.
4. 스캔본 PDF처럼 텍스트 추출이 거의 없는 파일은 반복 실행해도 실패할 수 있습니다. 이 경우 텍스트가 포함된 PDF, TXT, MD 파일로 다시 업로드해야 합니다.

### 5. 새 배포 환경 준비 시 주의사항

새 Vercel 프로젝트나 새 Supabase 프로젝트에 배포하는 경우에는 앱 실행 전에 아래 항목을 먼저 준비해야 합니다.

#### 5-1. Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. Postgres 연결 문자열을 확인합니다.
3. 필요한 DB 테이블을 migration 또는 `npm run db:push`로 생성합니다.
4. Supabase Storage에 private bucket `rootmap-documents`를 생성합니다.
5. Storage bucket 이름을 바꾸고 싶다면 Vercel과 GitHub Actions의 `SUPABASE_DOCUMENT_BUCKET` 값을 같은 이름으로 맞춥니다.

`rootmap-documents` bucket은 앱이 자동 생성하지 않습니다. bucket이 없으면 PDF 업로드 단계에서 실패합니다.

#### 5-2. Vercel 환경 변수

Vercel dashboard에서 `Project` > `Settings` > `Environment Variables`로 이동해 아래 값을 등록합니다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DOCUMENT_BUCKET
LLM_SETTINGS_SECRET
OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_TIMEOUT_MS
OPENROUTER_MAX_ATTEMPTS
```

권장값:

```text
SUPABASE_DOCUMENT_BUCKET=rootmap-documents
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_TIMEOUT_MS=90000
OPENROUTER_MAX_ATTEMPTS=2
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 secret입니다. 클라이언트 코드, README 예시의 실제 값, 브라우저 console, 공개 issue에 노출하면 안 됩니다.

#### 5-3. GitHub Actions secrets

PDF 처리를 GitHub Actions로 실행하려면 repository의 `Settings` > `Secrets and variables` > `Actions`에 아래 secrets도 등록합니다. Vercel 환경 변수와 값이 같은 항목은 동일한 값을 사용합니다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LLM_SETTINGS_SECRET
OPENROUTER_API_KEY
OPENROUTER_MODEL
```

Actions workflow는 `SUPABASE_DOCUMENT_BUCKET`을 `rootmap-documents`로 고정해 실행합니다. bucket 이름을 바꾼 경우 workflow 파일의 env 값도 같이 바꿔야 합니다.

#### 5-4. 배포 후 확인 순서

1. Vercel Production 배포가 성공했는지 확인합니다.
2. 배포 URL에 접속해 메인 화면이 열리는지 확인합니다.
3. 짧은 주제 예시로 일반 학습 트리를 생성합니다.
4. 생성된 `/tree/<tree-id>` 페이지가 새로고침 후에도 열리는지 확인합니다.
5. 작은 TXT 또는 PDF 파일을 업로드해 `document_id`가 생성되는지 확인합니다.
6. GitHub Actions의 `Process RootMap Document` workflow를 수동 실행합니다.
7. Actions 로그에서 `tree_generated`와 `tree_id`를 확인합니다.
8. Vercel 배포 URL의 `/tree/<tree-id>`로 접속해 문서 기반 트리가 표시되는지 확인합니다.

## 실행 확인 시나리오

1. 메인 화면에서 `Transformer` 같은 학습 주제를 입력합니다.
2. 학습 트리가 생성되는지 확인합니다.
3. 트리에 `선수지식`, `핵심 개념`, `부가 지식`, `오개념`, `이해 점검` 유형의 노드가 표시되는지 확인합니다.
4. 특정 노드를 클릭해 상세 학습 내용이 표시되는지 확인합니다.
5. 이해 상태를 변경한 뒤 추천 노드가 갱신되는지 확인합니다.
6. 새로고침 후 이전에 생성한 트리와 진행 상태가 유지되는지 확인합니다.
