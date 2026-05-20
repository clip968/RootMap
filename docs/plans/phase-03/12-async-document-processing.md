# Supabase Queue 기반 비동기 문서 처리 계획

## 목표

외부 LLM API 호출이 오래 걸려도 Vercel 함수 `maxDuration`에 문서 처리 전체가 묶이지 않도록, 문서 처리 요청을 Supabase Queue에 저장하고 worker route가 안전하게 소비하는 구조로 바꾼다. 긴 PDF는 청크별 LLM 결과를 `document_chunks.metadata`에 checkpoint하여 worker가 중간에 끊겨도 이미 처리한 청크를 반복하지 않게 한다.

## 범위

- 포함: Supabase `pgmq` queue 생성 migration, queue enqueue/read/delete helper, `POST /api/documents/:documentId/process`의 queue enqueue 전환, worker route, 청크별 LLM checkpoint, 스모크 테스트.
- 제외: Redis/BullMQ 같은 외부 큐, 별도 장기 실행 서버 배포, 전체 노드 상세 선생성, 사용자별 인증/RLS 재설계.

## 설계

1. 업로드 직후 클라이언트는 처리 시작 API를 호출한다.
2. 처리 시작 API는 문서 소유권과 완료 상태만 확인하고, Supabase Queue에 `{ documentId, userId }` 메시지를 넣은 뒤 즉시 `202 Accepted`를 반환한다.
3. Vercel worker route는 queue에서 메시지를 읽고 visibility timeout 안에서 문서 처리를 진행한다.
4. worker가 성공하면 queue 메시지를 삭제하고, 실패하면 메시지를 남겨 visibility timeout 이후 재시도되게 한다.
5. PDF 텍스트 추출과 청크 저장은 기존 `documents.processing_status` 단계로 checkpoint한다.
6. 청크별 LLM 추출 결과는 각 `document_chunks.metadata.document_concept_extraction`에 저장한다.
7. worker는 아직 추출되지 않은 청크만 처리하고, 처리 budget을 넘기면 같은 문서를 다시 queue에 넣은 뒤 현재 메시지를 삭제한다.
8. 모든 청크 후보가 준비되면 개념 통합, Concept Store 저장, 트리 구조 생성, 트리 저장을 수행한다.
9. 클라이언트는 기존처럼 `/api/documents/:documentId`를 2초 간격으로 polling하고, 상태가 `tree_generated`면 결과를 불러온다.
10. 노드 상세 설명은 기존처럼 노드 클릭 시 `generate-detail` API에서 노드 단위로 생성하고 DB에 캐시한다.

## 구현 항목

- [x] `apps/web/drizzle/0003_document_processing_queue.sql`를 추가해 `pgmq` 확장과 `document_processing` queue를 준비한다.
- [x] `apps/web/src/db/client.ts`에서 raw Postgres client를 안전하게 재사용할 수 있게 export한다.
- [x] `apps/web/src/lib/document/processing-queue.ts`를 추가해 enqueue/read/delete/requeue를 한 곳에 캡슐화한다.
- [x] `apps/web/src/lib/repository/document-repository.ts`에 청크 metadata 업데이트 helper를 추가한다.
- [x] `apps/web/src/lib/document/processor.ts`를 청크별 LLM checkpoint와 재개 가능한 처리 결과로 바꾼다.
- [x] `apps/web/src/app/api/documents/[documentId]/process/route.ts`에서 `after()` 직접 실행을 제거하고 queue enqueue만 수행한다.
- [x] `apps/web/src/app/api/workers/document-processing/route.ts`를 추가해 queue 메시지를 소비하고 `processDocument`를 실행한다.
- [x] `apps/web/vercel.json`에 worker route Cron 호출을 추가한다.
- [x] `apps/web/scripts/smoke-document-processing-jobs.ts`를 queue enqueue/worker 재시도 모델에 맞게 갱신한다.
- [x] 검증 명령: `npm run document:processing-jobs-smoke && npm run build && npm run lint`

## 위험과 후속 작업

- Vercel Cron route는 public URL이다. 별도 secret 기반 보호는 auth/env 설계가 필요하므로 이번 범위에서는 추가하지 않는다.
- worker route도 Vercel 함수 `maxDuration` 제한을 받는다. 그래서 한 번의 worker 호출에서 모든 청크를 끝내려고 하지 않고, 청크 checkpoint와 requeue로 진행을 누적한다.
- Supabase Queue migration은 실제 Supabase 프로젝트에서 `pgmq` 확장 권한이 있어야 적용된다. 배포 전 migration 적용 결과를 확인해야 한다.
- 청크 metadata에 저장되는 LLM 후보 JSON이 커질 수 있다. 문서당 120,000자 제한과 청크 단위 후보 수 제한을 유지한다.
