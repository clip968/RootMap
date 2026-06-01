# RootMap

RootMap은 사용자가 배우고 싶은 주제를 입력하면 해당 주제를 이해하기 위해 필요한 선수지식, 핵심 개념, 부가 지식, 오개념, 이해 점검 항목을 학습 트리 형태로 정리해 주는 AI 기반 학습 서비스입니다. 현재 웹 애플리케이션은 `apps/web`에 구현되어 있으며, Vercel 배포 환경과 로컬 개발 환경에서 실행할 수 있습니다.

## 실행 방법

### 1. Vercel 배포본 실행

배포된 결과물은 별도 설치 없이 브라우저에서 바로 실행할 수 있습니다.
단, 이 절차는 이미 Vercel 환경 변수, Supabase Postgres, Supabase Storage bucket이 준비된 배포본을 실행하는 방법입니다. Vercel cold start 시점에 DB 테이블이나 `rootmap-documents` Storage bucket을 자동 생성하지는 않습니다.

1. 아래 Vercel 배포 URL에 접속합니다.

   ```text
   https://<배포된-rootmap-url>.vercel.app
   ```

2. 시작 화면에서 학습하고 싶은 주제를 입력합니다.
   - 예시: `Transformer`, `Rust lifetime`, `가상 메모리`

3. 생성 버튼을 눌러 학습 트리를 생성합니다.

4. 생성된 트리에서 노드를 클릭해 상세 설명, 예시, 오개념, 이해 점검 내용을 확인합니다.

5. 노드별 이해 상태를 `안다`, `조금 안다`, `모른다` 중 하나로 변경하면 추천 학습 흐름을 확인할 수 있습니다.

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
6. 기본값 그대로 `chunk_batch_size`는 `1`, `max_attempts`는 `20`으로 실행합니다.
7. Actions 로그에서 `processing_status_after`가 `tree_generated`가 되었는지 확인합니다.
8. 같은 로그의 `tree_id` 값을 사용해 결과 페이지에 접속합니다.

```text
https://<배포된-rootmap-url>.vercel.app/tree/<tree-id>
```

workflow 내부에서는 아래 명령을 반복 실행합니다. 문서 chunk가 많아서 한 번에 끝나지 않으면 저장된 checkpoint를 기준으로 이어서 처리합니다.

```bash
npm run document:process-local -- --document-id <document-id> --resume --chunk-batch-size 1
```

### 5. 새 배포 환경 준비 시 주의사항

새 Vercel 프로젝트나 새 Supabase 프로젝트에 배포하는 경우에는 앱 실행 전에 아래 항목을 먼저 준비해야 합니다.

1. Supabase Postgres 연결 문자열을 `DATABASE_URL`로 등록합니다.
2. 필요한 DB 테이블을 migration 또는 `npm run db:push`로 생성합니다.
3. Supabase Storage에 private bucket `rootmap-documents`를 생성합니다.
4. Vercel 환경 변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DOCUMENT_BUCKET`을 등록합니다.
5. LLM 호출을 위해 `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `LLM_SETTINGS_SECRET`을 등록합니다.

## 실행 확인 시나리오

1. 메인 화면에서 `Transformer` 같은 학습 주제를 입력합니다.
2. 학습 트리가 생성되는지 확인합니다.
3. 트리에 `선수지식`, `핵심 개념`, `부가 지식`, `오개념`, `이해 점검` 유형의 노드가 표시되는지 확인합니다.
4. 특정 노드를 클릭해 상세 학습 내용이 표시되는지 확인합니다.
5. 이해 상태를 변경한 뒤 추천 노드가 갱신되는지 확인합니다.
6. 새로고침 후 이전에 생성한 트리와 진행 상태가 유지되는지 확인합니다.
