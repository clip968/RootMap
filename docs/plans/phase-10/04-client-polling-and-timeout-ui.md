# 04. Client Polling과 Timeout UI

## 목표

TreePageClient가 ready/queued 응답을 구분하고, queued 상태에서는 polling으로 full detail을 기다리게 한다. fallback을 보여주지 않되, 무한 대기 UI도 만들지 않는다.

## 관련 파일

- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/scripts/smoke-node-detail-async.ts`

## 구현 작업

### 1. Detail response union 반영

client는 `POST /detail` 응답을 아래 union으로 해석한다.

- `{ status: "ready", detail }`
- `{ status: "queued", job_id }`

기존 `ApiNodeDetailResponse` 단일 응답 가정은 async flag가 켜진 상태에서만 바꾼다.

### 2. Polling state 추가

필수 state/ref:

- current job id
- polling interval id
- polling abort controller
- polling started timestamp
- request sequence

이미 있는 `detailRequestSeqRef`, `detailAbortControllerRef`, `detailExtrasAbortControllerRef`와 충돌하지 않게 polling 전용 cleanup helper를 둔다.

### 3. Polling loop 구현

- queued 응답을 받으면 1초 간격으로 `GET /api/node-detail-jobs/[jobId]`를 호출한다.
- ready가 오면 `detail`을 채우고 extras 요청을 시작한다.
- failed가 오면 error UI를 보여준다.
- 다른 노드를 클릭하면 이전 polling은 즉시 중단한다.
- modal close/unmount에서도 interval과 abort controller를 정리한다.

### 4. Timeout UI 추가

fallback은 보여주지 않는다.

대신 90초 이상 ready가 오지 않으면 다음 상태를 보여준다.

```text
상세 설명 생성이 예상보다 오래 걸리고 있습니다.
잠시 후 다시 열면 이어서 확인할 수 있습니다.
```

동작:

- polling은 멈추거나 저빈도 polling으로 낮춘다.
- `[다시 확인]` 버튼은 즉시 한 번 polling한다.
- 사용자가 다른 노드를 탐색할 수 있게 modal close는 계속 가능해야 한다.

### 5. 중복 요청 방지 유지

- 같은 노드에 대한 in-flight detail request는 기존 dedupe를 유지한다.
- queued 상태에서 같은 node를 다시 열면 기존 job status를 재사용한다.
- stale response가 새 선택 노드의 detail을 덮어쓰지 않게 request sequence check를 유지한다.

## 완료 기준(DoD)

- ready 응답은 기존처럼 즉시 detail을 표시한다.
- queued 응답은 loading 상태를 유지하고 polling을 시작한다.
- ready polling 응답은 추가 detail fetch 없이 detail을 표시한다.
- modal close, node switch, unmount에서 polling interval이 남지 않는다.
- 90초 timeout UI가 fallback 없이 표시된다.
