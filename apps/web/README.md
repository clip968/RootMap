# RootMap Web

Phase 1 MVP 웹 앱입니다. 사용자가 학습 주제를 입력하면 OpenRouter Chat Completions API로 선수지식 기반 학습 트리를 생성하고, 노드별 상세 설명·이해 상태·다음 학습 추천을 확인할 수 있습니다.

## 수동 테스트 방법

```bash
cd apps/web
npm install
cp .env.example .env.local
```

`.env.local`에 OpenRouter 키를 설정합니다.

```bash
OPENROUTER_API_KEY=sk-or-...
# 선택: 비워두면 OpenRouter 계정 기본 모델 사용
OPENROUTER_MODEL=google/gemini-2.5-flash
DATABASE_URL=file:./data/rootmap.db
```

DB 테이블을 준비하고 개발 서버를 실행합니다.

```bash
npm run db:push
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열고 아래 Phase 1 테스트 주제를 입력해 확인합니다.

- `Rust lifetime`
- `Transformer`
- `가상 메모리`

확인할 흐름:

1. 시작 화면에서 주제 입력 후 트리 생성
2. 다섯 타입 섹션 확인: 선수지식 / 핵심 개념 / 부가 지식 / 오개념 / 이해 점검
3. 추천 노드 영역 확인
4. 노드 클릭 후 상세 설명 생성 확인
5. 이해 상태를 `안다 / 조금 안다 / 모른다`로 변경
6. 추천 결과 갱신 확인
7. 새로고침 후 저장된 트리와 진행 상태 복원 확인

## 자동 검증

```bash
cd apps/web
npm run check
```

`check`는 lint, DB smoke, LLM 파싱 smoke, Phase 1 MVP fixture smoke, production build/type check를 순서대로 실행합니다.
