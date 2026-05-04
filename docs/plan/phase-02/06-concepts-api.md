# 06. Concepts REST API

## 목표

Concept 목록·상세·관계를 조회하고, 필요한 최소 수정·간선 생성을 지원한다(개발자/관리자 중심).

## 관련 명세

- 11장 `GET /api/concepts`, `GET/PATCH /api/concepts/:id`
- `GET .../edges`, `POST .../edges`
- `GET .../trees`

## 구현 작업

### 1. `GET /api/concepts`

- 쿼리: `q`, `domain`(명세에서는 `Domain` 표기였으니 실제 파라미터 이름은 코드베이스 관례에 맞춤), `limit`
- 필요 시 커서/오프셋은 Phase 2 범위 밖이면 생략 가능하나 명세 응답 형태 준수

### 2. `GET /api/concepts/:conceptId`

- `edges` 묶음: 명세처럼 `prerequisites`, `used_by`, `related` 등으로 분류해 내려주거나 평평한 배열 후 프론트 그룹핑 중 하나 선택 후 일관 유지.

### 3. `PATCH /api/concepts/:conceptId`

- aliases, short_description, difficulty 등 허용 필드 화이트리스트
- Phase 2는 운영/관리용으로 가벼운 인증 또는 내부 플래그 고려

### 4. `GET/POST .../edges`

- POST 바디: `to_concept_id`, `relation_type`, `reason`
- self-loop·중복 간선 처리

### 5. `GET .../trees`

- 어떤 `learning_trees`에서 이 concept가 쓰였는지, `role_in_tree` 포함

## 주의

- Phase 3 PDF 파이프라인을 위해 “개념 ID 안정성” 유지 Concept는 삭제 최소 원칙.
