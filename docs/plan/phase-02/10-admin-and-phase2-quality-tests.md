# 10. 관리자 최소 도구 및 Phase 2 품질 검증

## 목표

개발 중 데이터 품질을 확인하기 위한 가벼운 관리 화면(또는 내부 라우트)과, 명세 기반 회귀 절차를 정리한다.

## 관련 명세

- 16.3 최소 관리자/개발자 화면
- 17·18·20장 품질 기준 및 테스트 케이스

## 구현 작업

### 1. 관리자 기능 체크리스트

- Concept 목록 + 검색 + domain 필터
- Concept 상세(06 API 활용 또는 전용 페이지)
- 연결 Edge 목록
- `concept_merge_candidates` 목록(상태별 필터)

### 2. 접근 통제

- 로컬 dev 전용 라우트, 환경 변수 플래그, 또는 간단 패스워드 등 Phase 2에 맞는 최소 장치.

### 3. 자동 테스트(가능하면)

- Resolution 로직 단위 테스트: softmax/소프트맥스/alias
- 통합 테스트: Transformer → BERT 시나리오 스텁(LLM mocking)

### 4. 수동 테스트 스크립트

명세 18장 4케이스를 문서 또는 체크리스트로 복사해 완료 시 체크.

### 5. 완료 조건 대조

- 명세 20장 8항목을 PR/릴리스 노트 형태로 맵핑해 모두 녹색인지 확인.

## 주의

- 이 태스크는 “예쁜 제품 기능”보다 디버깅 가속이 목표다.


## 완료 기록

- 최소 관리자/개발자 화면: `apps/web/src/app/admin/concepts/page.tsx`
  - Concept 목록, 검색, domain 필터
  - Concept 상세, Edge, 사용 트리 확인
  - `concept_merge_candidates` 상태별 필터
  - 접근 통제: `NODE_ENV=development` 또는 `ROOTMAP_ADMIN_ENABLED=true`
- 자동 검증: `apps/web/scripts/smoke-phase2-concepts.ts`, `npm run phase2:smoke`
- 전체 회귀: `npm run check`
- 세부 검증 기록: [`phase2-quality-verification.md`](./phase2-quality-verification.md)
