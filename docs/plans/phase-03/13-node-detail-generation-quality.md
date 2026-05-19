# 노드 상세 생성 품질 개선 계획

## 목표

노드 상세 모달이 한 줄짜리 Concept Store 설명에서 멈추지 않게, `detailJson`이 없는 노드는 full detail 생성을 먼저 실행한다. Concept Store의 짧은 설명은 LLM 입력 보조 또는 실패 fallback으로만 사용한다.

## 범위

- 포함: `getOrCreateNodeDetail`의 우선순위 변경, 테스트용 detail generator 주입, 문서 기반 `generate-detail` cache hit 조건 정리, 스모크 테스트.
- 제외: 프롬프트 대규모 재작성, Concept Store 스키마 확장, 전체 노드 선생성, 외부 큐 추가.

## 설계

1. `detailJson`이 있으면 저장된 상세를 그대로 반환한다.
2. `detailJson`이 없고 문서 기반 evidence가 있으면 문서 기반 detail LLM을 생성하고 저장한다.
3. `detailJson`이 없고 일반 트리 노드면 일반 detail LLM을 생성하고 저장한다.
4. Concept Store 설명은 LLM 실패 시에만 fallback으로 반환한다.
5. fallback 응답에는 `quality_warnings`를 붙여 UI/로그에서 “저품질 fallback”임을 추적할 수 있게 한다.
6. 문서 전용 `/api/trees/:treeId/nodes/:nodeId/generate-detail`는 `description`이 아니라 `detailJson` 기준으로 cache hit을 판단한다.

## 구현 항목

- [x] `apps/web/scripts/smoke-node-detail-generation.ts`를 추가해 Concept Store fallback이 full detail 생성을 가로막는 현상을 재현한다.
- [x] `apps/web/src/lib/services/node-detail.ts`에 generator dependency injection을 추가한다.
- [x] `getOrCreateNodeDetail`의 일반 트리 분기를 LLM 생성 우선으로 바꾸고, Concept Store fallback은 catch fallback으로 이동한다.
- [x] `apps/web/src/app/api/trees/[treeId]/nodes/[nodeId]/generate-detail/route.ts`의 cache hit 조건을 `detailJson` 기준으로 바꾼다.
- [x] `apps/web/package.json`에 `node-detail:generation-smoke` 스크립트를 추가한다.
- [x] `npm run node-detail:generation-smoke`, `npm run lint`, `npm run build`로 검증한다.

## 위험과 후속 작업

- LLM API key가 없는 환경에서는 fallback으로 내려가므로, 개발자는 `OPENROUTER_API_KEY` 없이도 앱을 열 수 있다.
- Concept Store에 충분히 긴 explanation이 있더라도 full detail schema가 아니면 모달 섹션이 빈다. 추후 Concept Store에 `detail_json` 캐시를 별도로 둘 수 있다.
- 기존 짧은 응답이 이미 저장된 `description`은 UI 카드 요약으로만 쓰고, 모달 상세 품질 판단에는 사용하지 않는다.
