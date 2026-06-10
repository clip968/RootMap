# 04. eval:tree CLI Runner

## 목표

`npm run eval:tree`를 추가해 모든 골든 픽스처를 순회하며 `TreeEvalResult` 점수표와 전체 평균을 출력한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 1.5

## 관련 파일

- `apps/web/scripts/eval-tree.ts` (신규)
- `apps/web/evals/fixtures/topics/index.ts` (Task 01)
- `apps/web/src/lib/evaluation/tree-eval.ts` (Task 02)
- `apps/web/package.json` (scripts)

## 구현 작업

### 1. 트리 입력 소스

- 기본: 픽스처에 대응하는 저장된 트리 생성 결과 fixture(LLM 무호출)를 읽어 채점한다.
- 옵션 `--live`: 실제 `generateLearningTree`를 호출해 채점한다(비용 발생, 기본 비활성).
- 옵션 `--self-check`: 합성 트리로 채점 로직만 검증한다.

### 2. 점수표 출력

각 주제에 대해 5개 점수와 `failures` 요약을 표로 출력하고, 마지막에 전체 평균을 출력한다.

```text
topic                coverage  prereq  pedagogy  ordering  detail   errors
Transformer          0.83      0.81    0.60      0.92      0.75     0
가상 메모리           0.90      0.88    0.55      1.00     0.80     0
...
AVERAGE              0.86      0.79    0.58      0.95      0.77     1
```

### 3. 종료 코드 정책

- `error` severity failure가 있으면 비정상 종료(CI에서 실패).
- `warn`만 있으면 정상 종료.
- 임계값은 옵션(`--min-coverage` 등)으로 조정 가능하게 둔다.

### 4. package.json 스크립트

```json
"eval:tree": "tsx scripts/eval-tree.ts",
"eval:tree:live": "tsx scripts/eval-tree.ts --live"
```

## 완료 기준(DoD)

- `npm run eval:tree`가 LLM 호출 없이 점수표와 평균을 출력한다.
- `error` failure가 있으면 비정상 종료한다.
- `--live`, `--self-check` 옵션이 동작한다.

## 검증 명령

```bash
cd apps/web
npm run eval:tree
```
