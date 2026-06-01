# 01. 클라이언트 Detail 요청 단일화

## 목표

노드 클릭 시 클라이언트가 `generate-detail`과 `detail`을 순차 호출하지 않고, `detail` API 하나만 호출하도록 바꾼다. 동시에 클릭 직후 로딩 상태를 먼저 보여준다.

## 관련 파일

- `apps/web/src/components/tree-page-client.tsx`

## 구현 작업

### 1. `loadDetail` 책임 유지

- `loadDetail(nodeId)`가 계속 아래 일을 담당한다.
  - `setDetailLoading(true)`
  - `setDetailError(null)`
  - `setDetail(null)`
  - `/api/nodes/${nodeId}/detail` POST 호출
  - 성공 시 `detail` 저장과 `has_detail` 갱신
  - 실패 시 `detailError` 표시
- 기존 retry 버튼은 그대로 `loadDetail(selectedNode.id)`를 호출한다.

### 2. `openNode`에서 선행 `generate-detail` 제거

- `openNode(nodeId)`는 아래 순서로 단순화한다.
  1. `setSelectedId(nodeId)`
  2. `setModalOpen(true)`
  3. `recordPhase4NodeEvent(..., "node_opened")` fire-and-forget
  4. `void loadDetail(nodeId)`
- `isDocumentTree` 기반 분기와 `/api/trees/${treeId}/nodes/${nodeId}/generate-detail` 호출을 제거한다.
- 제거 후 `isDocumentTree` 변수가 더 이상 쓰이지 않으면 함께 제거한다.

### 3. 오래된 detail 노출 방지 확인

- 새 노드를 열면 이전 노드의 `detail`이 남아 보이지 않아야 한다.
- `loadDetail` 초반의 `setDetail(null)`이 이 역할을 하므로 유지한다.
- 필요하면 `openNode`에서 `setDetail(null)`을 선행 호출하지 않고 `loadDetail` 한 곳에서 상태 전환을 관리한다.

## 테스트 전략

- `tree-page-client.tsx`에서 `generate-detail` 문자열이 더 이상 호출 경로에 남지 않았는지 정적 확인한다.
- UI regression은 기존 `npm run phase7:visual-detail-smoke`와 `npm run build`로 확인한다.

## 완료 기준(DoD)

- 노드 클릭당 클라이언트 detail fetch는 `/api/nodes/:nodeId/detail` 하나만 남는다.
- 문서 기반 노드에서도 선행 `generate-detail` 호출이 없다.
- 모달은 클릭 즉시 열리고 loading copy가 표시된다.
- 검증 명령: `npm run lint`, `npm run build` (`apps/web`에서 실행)
