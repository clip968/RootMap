# 02. Route·파이프라인 통합 테스트

## 목표

`tests/integration`에 generate-tree route와 document-pipeline 통합 테스트를 둔다. LLM은 mocked, DB는 로컬/in-memory를 사용한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 8.2

## 관련 파일

- `apps/web/src/app/api/trees/generate/route.ts`
- `apps/web/src/lib/services/learning-tree-generate.ts`
- `apps/web/src/lib/document/processor.ts`
- `apps/web/scripts/smoke-document-pipeline.ts` (참고·이전 대상)
- `apps/web/tests/integration/` (신규)

## 구현 작업

### 1. generate-tree-route.test.ts

- mocked LLM 응답으로 트리 생성 route가 노드/edge/`recommended_order`를 저장하는지 검증한다.
- 인증 경계(Phase 11)와 잘못된 입력 처리(`INVALID_LLM_RESPONSE` 등)를 검증한다.

### 2. document-pipeline.test.ts

- 업로드 → 추출 → chunk → 개념 추출 → 트리 생성 단계 전이를 mocked LLM으로 검증한다.
- 기존 `smoke-document-pipeline.ts` 시나리오를 정식 테스트로 옮긴다.

### 3. LLM/DB 격리

- LLM provider 호출은 mock으로 대체한다(비용 0, 결정적).
- DB는 로컬/in-memory를 사용하고 기존 smoke의 `DATABASE_URL=file:` 패턴을 참고한다.

## 완료 기준(DoD)

- 두 통합 테스트가 mocked LLM으로 결정적으로 통과한다.
- 기존 pipeline smoke 시나리오가 정식 테스트로 재현된다.
- `npm run test:integration`로 실행된다.

## 검증 명령

```bash
cd apps/web
npm run test:integration
```
