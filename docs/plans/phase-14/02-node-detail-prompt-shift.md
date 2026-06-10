# 02. 노드 상세 프롬프트 학습 목표 전환

## 목표

노드 상세 프롬프트를 "설명 생성" 중심에서 "학습 목표와 검증 가능한 숙달 증거 생성" 중심으로 바꾼다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 3.3·3.4

## 관련 파일

- `apps/web/src/lib/llm/prompts.ts` (노드 상세 프롬프트)
- `apps/web/src/lib/llm/generate-node-detail.ts`
- `apps/web/src/lib/llm/generate-document-node-detail.ts`
- `apps/web/src/lib/services/node-detail.ts`

## 구현 작업

### 1. 프롬프트 지시 추가

- 노드마다 `learning_objective`를 `define|explain|apply|compare|debug` 동사 하나로 시작해 한 문장으로 쓰게 한다.
- `mastery_evidence`를 "주어진 입력에 대해 ~할 수 있다" 형태의 검증 가능한 행동으로 2~4개 생성하게 한다.
- 예시(page_table)를 프롬프트에 포함해 형식을 고정한다.

### 2. 일반·문서 노드 모두 적용

- 일반 주제 노드(`generate-node-detail.ts`)와 문서 노드(`generate-document-node-detail.ts`) 프롬프트 모두 전환한다.
- 문서 노드는 `mastery_evidence`가 문서 근거와 모순되지 않게 한다(상세 근거성은 Phase 16).

### 3. 출력 검증 연결

- 생성 결과가 Task 01 Zod 스키마를 통과하는지 확인하고, 실패 시 재시도/보정 경로를 둔다.

## 완료 기준(DoD)

- 노드 상세 생성이 `learning_objective`·`mastery_evidence`를 채운다.
- `learning_objective`가 허용 동사로 시작한다.
- 일반·문서 노드 프롬프트가 모두 전환된다.

## 검증 명령

```bash
cd apps/web
npm run node-detail:generation-smoke
npm run document:detail-smoke
```
