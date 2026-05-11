# AGENTS.md

## Default Operating Mode

- Prefer small, reviewable diffs.
- Do not create new files unless the task explicitly requires it.
- Do not change public APIs, database schemas, routes, auth logic, or environment variables without explicit approval.
- Before editing, identify target files and intended changes.
- Run only the verification command specified by the active task.
- If verification fails, stop and report. Do not perform speculative logic fixes.

## Senior / Worker Split

Use ForgeCode project skills only when explicitly triggered:

- `@senior` -> use the `senior-worker-senior` skill.
- `@worker` -> use the `senior-worker-worker` skill.

Do not read long specs, `.agent/*`, or Senior/Worker skills during greetings, ordinary chat, or unrelated coding tasks.

## RootMap 작업 체크리스트 운영 지침

이 저장소에서 작업을 진행하는 에이전트는 각 Phase README의 진행 체크리스트를 기준으로 완료 상태를 관리한다.

### 체크리스트 위치
- Phase 1: `docs/plan/phase-01/README.md`
- Phase 2: `docs/plan/phase-02/README.md`
- Phase 3: `docs/plan/phase-03/README.md`
- Phase 4: `docs/plan/phase-04/README.md`

### 작업 완료 후 체크 규칙
- 작업을 시작하기 전에 관련 Phase README의 진행 체크리스트에서 대상 항목을 확인한다.
- 각 계획 문서의 구현·테스트·문서 반영이 끝나면 해당 항목을 `- [ ]`에서 `- [x]`로 변경한다.
- 여러 항목을 한 번에 완료했다면 완료한 항목만 각각 체크한다.
- 일부만 구현했거나 검증이 끝나지 않은 항목은 체크하지 않는다.
- 체크 전에는 가능하면 관련 테스트, 타입 검사, 린트 또는 수동 검증 결과를 확인한다.
- 체크한 뒤 커밋/작업 요약에 어떤 Phase의 어떤 항목을 완료했는지 남긴다.
- 각 task(체크리스트 항목 단위)를 완료할 때마다 변경 사항을 `git commit`한다. 커밋 메시지에는 완료한 Phase·항목과 요약을 담는다.
- 커밋 직후 원격에 반영하기 위해 `git push`한다. (원격 브랜치 정책이 있다면 해당 브랜치로 푸시한다.)

### 체크 예시
```markdown
- [x] 01. [01-project-foundation.md](./01-project-foundation.md) - 프로젝트 기본 구조, 환경, 공통 타입 준비
- [ ] 02. [02-data-model-and-storage.md](./02-data-model-and-storage.md) - 학습 트리/노드/진행 상태 저장 모델 구현
```

### 주의
체크리스트는 진행 상황을 추적하기 위한 단일 기준이다. 작업 내용이 계획 문서와 달라졌다면 먼저 해당 계획 문서를 업데이트한 뒤 README 체크리스트도 필요한 경우 함께 갱신한다.

모든 코드에는 사용자가 이해할 수 있게 세부적인 주석을 달아야한다.