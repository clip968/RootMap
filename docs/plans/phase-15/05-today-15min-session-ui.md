# 05. "오늘의 15분 학습" UI

## 목표

트리 전체 보기와 별개로 집중 학습 모드 진입점을 만든다. 진단 → 추천 노드 → 짧은 설명 → 회상 질문 → 복습 예약을 한 흐름으로 제공한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4.6

## 관련 파일

- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/src/components/app-shell.tsx`
- 신규 세션 컴포넌트(`apps/web/src/components/study-session-*.tsx`)
- Task 01 세션 API

## 구현 작업

### 1. 진입점

- 트리 페이지/앱 셸에 "오늘의 15분 학습" 진입 버튼을 둔다.
- 클릭 시 세션 API에서 첫 스텝을 받아 모드로 진입한다.

### 2. 세션 화면 흐름

```text
1. 먼저 풀어볼 진단 질문 2개
2. 추천 노드 1개
3. 짧은 설명
4. 회상 질문
5. 결과에 따른 복습 예약
```

- 각 스텝은 한 화면에 하나만 보여 집중도를 높인다.
- 회상 질문은 "다시 읽기"가 아니라 기억에서 꺼내는 형식으로 제시한다.

### 3. 피드백·복습 표시

- 정답/오답/부분 피드백과 함께 다음 복습 예정일을 보여준다.
- blocking prerequisite 미충족 시 먼저 학습할 노드를 안내한다.

### 4. 접근성

- 키보드 진행, 명확한 포커스 순서, 스크린리더 라벨을 제공한다(Phase 07 기조 유지).

## 완료 기준(DoD)

- 트리 보기와 분리된 "오늘의 15분 학습" 진입점이 있다.
- 5스텝 흐름이 한 번에 진행된다.
- 결과에 따라 복습 예정일이 표시된다.

## 검증 명령

```bash
cd apps/web
npm run lint
npm run build
```
