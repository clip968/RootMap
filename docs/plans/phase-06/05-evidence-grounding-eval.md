# 05. Evidence-grounded LLM Evaluation

## 목표

문서 기반 node 설명이 실제 evidence snippet에 의해 지지되는지 claim 단위로 평가하고, unsupported claim을 추적한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.6 문서 기반 생성의 신뢰성 문제
- 동일 6.5 Evidence-grounded LLM evaluation
- 동일 8장 claim-evidence mapping 완료 조건

## 구현 작업

### 1. Claim-evidence schema

- node 설명을 claim 단위로 나눈다.
- 각 claim은 `evidence_document_id`, `evidence_page`, `evidence_snippet`을 가진다.
- evidence가 없는 claim은 `unsupported_claims`에 저장한다.
- node 또는 evaluation result에 `groundedness_score`를 남긴다.

### 2. Regression dataset

- Phase 3 테스트 케이스를 작은 regression set으로 고정한다.
  - Transformer 논문
  - OS 강의자료
  - Rust lifetime 노트
- 각 dataset에는 expected evidence anchor를 둔다.
- full eval은 수동 또는 scheduled로 돌리고, small eval은 CI 후보로 둔다.

### 3. Eval runner

- LLM 응답 JSON schema 준수율을 측정한다.
- claim-evidence 연결 누락을 측정한다.
- `generated`, `inferred`, `explicit` source type별 unsupported claim rate를 분리한다.
- 실패 결과는 어떤 node와 claim이 문제인지 사람이 읽을 수 있게 출력한다.

### 4. Product integration

- 문서 기반 node detail 또는 debug view에서 groundedness 결과를 확인할 수 있게 한다.
- production UI에는 처음부터 점수를 과하게 노출하지 않고, 내부 품질 지표로 먼저 사용한다.

## 완료 기준(DoD)

- 문서 기반 node 설명에 claim-evidence mapping이 생성된다.
- unsupported claim과 groundedness score가 평가 결과로 남는다.
- small regression dataset으로 eval runner를 실행할 수 있다.
- 검증 명령: `npm run test:llm-eval -- evidence-grounding` (`apps/web`에서 실행)
