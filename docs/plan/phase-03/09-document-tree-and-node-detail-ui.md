# 09. 문서 트리 및 노드 상세 UI

## 목표

기존 학습 트리 화면과 노드 상세 화면을 문서 기반 학습에 맞게 확장해, 각 개념이 문서에 직접 등장했는지·추론된 선수지식인지·어느 위치에서 등장했는지 보여준다.

## 관련 명세

- `rootmap_phase_3_spec.md` 14.3 문서 기반 트리 화면
- 동일 명세 14.4 노드 상세 화면
- 동일 명세 9장 출처 연결 정책
- 동일 명세 12.4 문서 기반 노드 설명 프롬프트
- 동일 명세 15장 추천 로직 변경

## 구현 작업

### 1. 문서 기반 트리 조회 연동

- `GET /api/documents/:documentId/tree` 응답을 기존 트리 화면에 연결한다.
- Phase 1·2 트리 노드 렌더링을 최대한 재사용한다.
- 문서 기반 노드에 추가된 `source_type`, `evidence`, `concept_id`를 표시한다.

### 2. source type 배지

노드별로 다음 상태를 구분해 표시한다.

| source_type | UI 의미 |
|---|---|
| explicit | 문서에 직접 등장 |
| inferred | 문서 이해를 위해 추론됨 |
| generated | AI가 생성한 설명/점검 |

표시 예:

```text
Scaled Dot-Product Attention
- 문서 핵심 개념
- 출처: Section 3.2.1, p.4

Dot Product
- 선수지식
- 문서 이해를 위해 추론됨
```

### 3. evidence 표시

explicit concept에는 가능한 경우 다음을 표시한다.

- 페이지 범위
- 섹션 제목
- 짧은 snippet
- 문서 원문 보기 버튼 또는 snippet 확장 패널

주의:

- snippet은 너무 길게 표시하지 않는다.
- evidence가 없는 inferred prerequisite에는 “문서 이해를 위해 추론됨”을 표시한다.

### 4. 문서 기반 노드 상세 화면

필수 요소:

1. 개념 설명
2. 이 문서에서의 역할
3. 관련 문서 문단 요약
4. 출처 페이지 및 섹션
5. 선수지식
6. 예시
7. 오개념
8. 이해 점검 질문
9. 다음 추천 노드

### 5. 노드 상세 설명 생성/조회

- 기존 Phase 1 노드 상세 API/UI를 재사용하되 문서 컨텍스트를 추가한다.
- explicit concept이면 evidence text를 프롬프트에 포함한다.
- inferred concept이면 문서 이해를 위한 선수지식임을 설명에 명시한다.
- 생성 결과를 캐시해 같은 노드 클릭 시 재사용한다.

### 6. 추천 노드 강조

문서 기반 추천 로직 결과를 트리 화면에서 강조한다.

우선순위는 10번 태스크와 맞춘다.

- 모르는 inferred prerequisite
- 모르는 explicit prerequisite
- 중요도 높은 document_core
- document_core와 연결된 오개념
- 문서 이해 점검 질문

## 완료 조건

- 문서 기반 학습 트리가 기존 트리 화면에서 표시된다.
- 각 노드가 explicit/inferred/generated 중 무엇인지 알 수 있다.
- explicit concept에는 페이지·섹션·snippet 등 출처가 표시된다.
- inferred prerequisite은 출처가 있는 개념처럼 오해되지 않는다.
- 노드 상세 화면에서 문서 맥락 설명과 이해 점검 질문을 확인할 수 있다.
