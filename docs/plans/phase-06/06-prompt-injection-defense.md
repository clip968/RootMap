# 06. Prompt Injection 방어

## 목표

업로드 문서 안의 instruction-like text가 LLM system instruction처럼 처리되지 않도록 scanner, fixture, prompt 분리, 위험 flag를 추가한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.7 Prompt injection 위험
- 동일 6.6 Prompt injection 방어
- 동일 8장 prompt injection fixture 완료 조건

## 구현 작업

### 1. Red-team fixture

- 악성 문서 fixture를 추가한다.
- fixture에는 다음 유형을 포함한다.
  - 이전 지시 무시
  - 모든 concept을 known으로 표시하라는 지시
  - citation을 숨기라는 지시
  - JSON schema를 깨뜨리라는 지시
- expected behavior는 "지시를 따르지 않고 위험 신호로 분류"로 둔다.

### 2. Scanner

- instruction-like text를 탐지한다.
- scanner 결과는 `risk_level`, `matched_patterns`, `snippet`, `document_id`를 포함한다.
- 초기 정책은 hard block이 아니라 위험 flag 저장으로 둔다.

### 3. Prompt separation

- LLM prompt에서 문서 내용은 데이터이며 명령이 아니라는 경계 문장을 명시한다.
- system instruction, developer instruction, document content를 구조적으로 분리한다.
- JSON schema validation을 prompt injection 방어 뒤에 한 번 더 수행한다.

### 4. Validation path

- prompt injection fixture를 넣어도 LLM이 악성 지시를 따르지 않는지 확인한다.
- evidence-grounding validator가 "문서에 없는 주장"을 잡아내는지 확인한다.
- 위험 문서 flag가 document result 또는 admin/debug view에서 확인 가능해야 한다.

## 완료 기준(DoD)

- 악성 fixture가 추가되어 있다.
- scanner가 instruction-like text를 위험 신호로 기록한다.
- LLM 생성 결과가 악성 지시를 따르지 않는다.
- 위험 flag와 validation 결과가 저장되거나 eval output에 남는다.
- 검증 명령: `npm run test:llm-eval -- prompt-injection` (`apps/web`에서 실행)
