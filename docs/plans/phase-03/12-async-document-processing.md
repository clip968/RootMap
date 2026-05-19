# 비동기 문서 처리와 점진적 생성 계획

## 목표

외부 LLM API 호출이 오래 걸려도 브라우저 요청이 timeout으로 실패하지 않게, 문서 처리 API를 "즉시 접수 + 상태 polling" 구조로 바꾼다. 트리 구조는 먼저 만들고, 노드 상세는 기존 lazy generation 흐름을 유지한다.

## 범위

- 포함: `POST /api/documents/:documentId/process`의 202 응답화, 서버 백그라운드 실행 예약, 중복 실행 방지, 클라이언트 polling 완료 대기, 스모크 테스트.
- 제외: Redis/BullMQ 같은 외부 큐, DB job 테이블, 다중 서버 간 분산 락, 전체 노드 상세 선생성.

## 설계

1. 업로드 직후 클라이언트는 처리 시작 API를 호출한다.
2. 처리 시작 API는 문서 소유권만 확인하고, 이미 처리 중인 같은 문서가 있으면 새 작업을 만들지 않는다.
3. 새 작업이면 Next.js `after()` callback에 `processDocument(documentId, userId)`를 예약하고 즉시 `202 Accepted`를 반환한다.
4. 클라이언트는 `/api/documents/:documentId`를 2초 간격으로 조회한다.
5. 상태가 `tree_generated`면 `/tree`와 `/concepts` 결과를 불러오고, `failed`면 `processing_error`를 표시한다.
6. 노드 상세 설명은 기존처럼 노드 클릭 시 `generate-detail` API에서 노드 단위로 생성하고 DB에 캐시한다.

## 구현 항목

- [x] `apps/web/src/lib/document/processing-jobs.ts`를 추가해 in-memory job dedupe와 scheduler 주입 함수를 만든다.
- [x] `apps/web/scripts/smoke-document-processing-jobs.ts`를 추가해 중복 enqueue, 완료 후 재enqueue, 실패 흡수 동작을 검증한다.
- [x] `apps/web/src/app/api/documents/[documentId]/process/route.ts`를 202 접수형 API로 바꾸고 `after()`로 백그라운드 실행을 예약한다.
- [x] `apps/web/src/components/start-topic-form.tsx`의 문서 처리 흐름을 “process 요청 대기”가 아니라 “완료 상태 polling”으로 바꾼다.
- [x] `apps/web/package.json`에 스모크 스크립트를 추가한다.
- [x] `npm run document:processing-jobs-smoke`, `npm run build`, `npm run lint`로 검증한다.

## 위험과 후속 작업

- in-memory dedupe는 단일 Next.js 프로세스 안에서만 동작한다. 배포 환경이 여러 서버 인스턴스면 DB job 테이블이나 외부 큐가 필요하다.
- `after()` 작업도 플랫폼의 route `maxDuration` 영향을 받는다. 대용량 문서와 많은 LLM 호출을 안정적으로 처리하려면 별도 worker process가 필요하다.
- 현재 단계는 사용자 체감 timeout을 없애는 MVP다. 운영 수준의 재시도, job 재개, 실패 복구는 다음 계획에서 DB-backed queue로 확장한다.
