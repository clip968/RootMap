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

### 3. 새 배포 환경 준비 시 주의사항

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
