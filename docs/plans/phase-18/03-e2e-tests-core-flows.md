# 03. 핵심 흐름 E2E 테스트

## 목표

`tests/e2e`에 핵심 사용자 흐름(주제 트리 생성, 문서 업로드)을 e2e 시나리오로 둔다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 8.2

## 관련 파일

- `apps/web/src/app/tree/[treeId]/page.tsx`
- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/components/start-topic-form.tsx`
- `apps/web/src/app/api/documents/upload/route.ts`
- `apps/web/tests/e2e/` (신규)

## 구현 작업

### 1. create-topic-tree.spec.ts

- 메인 화면에서 주제 입력 → 트리 생성 → `/tree/<id>` 이동 → 노드 클릭 → 상세 표시 흐름을 검증한다.
- LLM 호출은 mock 또는 stub 서버로 대체해 결정성을 확보한다.

### 2. upload-document.spec.ts

- 문서 업로드 → `document_id` 생성 → 결과 확인 흐름을 검증한다(처리 runner는 mocked/stub).
- 스캔본 감지(Phase 16) 안내 경로를 함께 검증한다.

### 3. 환경·격리

- e2e는 별도 job으로 실행하고 기존 `process-rootmap-document.yml`과 충돌하지 않게 한다.
- 인증 흐름(Phase 11)을 고려해 로그인 상태를 stub한다.

## 완료 기준(DoD)

- 두 e2e 시나리오가 stub/mock으로 결정적으로 통과한다.
- LLM·외부 처리 의존이 격리된다.
- `npm run test:e2e`로 실행된다.

## 검증 명령

```bash
cd apps/web
npm run test:e2e
```
