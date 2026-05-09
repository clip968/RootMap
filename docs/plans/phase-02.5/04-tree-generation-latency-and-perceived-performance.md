# 04. Tree 생성 지연 계측 및 체감 성능 개선

## 목표

새 Tree 생성이 오래 걸리는 원인을 구간별로 계측하고, 사용자가 생성 중 멈춘 것으로 느끼지 않도록 대기 UX를 개선한다.

Phase 2.5의 기존 목표가 “Tree View를 실제 학습 경로처럼 체감하게 만드는 것”이라면, 이 작업은 Tree가 화면에 나타나기 전의 생성 대기 경험까지 포함해 전체 체감 품질을 높이는 것을 목표로 한다.

## 배경

현재 Tree 생성은 `/api/trees/generate` 단일 요청 안에서 다음 작업을 모두 동기적으로 수행한다.

- Topic 검증
- 기존 Concept 검색 및 prompt context 구성
- LLM Tree JSON 생성
- JSON parse 및 schema validation
- 실패 시 LLM 재시도
- Tree/Node/Progress 저장
- Concept 재사용/신규 Concept 저장
- Concept edge 저장
- 저장된 Tree 재조회
- API 응답 변환

이 구조에서는 LLM 응답 지연, 재시도, Concept Store 검색/저장 비용, 저장 후 재조회 비용이 모두 사용자 대기 시간에 포함된다.

## 구현 작업

### 1. 생성 경로 구간별 계측

- `/api/trees/generate` 전체 소요 시간을 기록한다.
- Concept prompt context 검색 시간을 기록한다.
- LLM attempt별 호출 시간을 기록한다.
- JSON parse/validation 시간을 기록한다.
- Tree/Node/Progress 저장 시간을 기록한다.
- Concept persistence 시간을 기록한다.
- 저장 후 `getLearningTree` 재조회 및 응답 변환 시간을 기록한다.
- 단일 request correlation id로 로그를 묶는다.

Rationale: 실제 병목이 LLM인지, Concept 재사용인지, DB 저장인지 분리해야 안전하게 개선할 수 있다.

### 2. LLM 재시도 로그 구체화

- attempt 번호를 기록한다.
- 실패 유형을 parse / validation / transport로 구분한다.
- transport 오류의 HTTP status를 기록한다.
- raw 응답 길이를 기록한다.
- 최종 성공/실패 여부를 기록한다.

Rationale: 재시도가 발생하면 체감 시간이 2~3배 늘어날 수 있으므로, 재시도 여부를 명확히 확인해야 한다.

### 3. `reuse_concepts` 비교 검증 절차 추가

- 같은 topic을 `reuse_concepts: true`와 `false`로 각각 생성한다.
- 총 생성 시간, LLM 시간, Concept persistence 시간을 비교한다.
- Concept Store 누적 개수에 따라 차이가 커지는지 확인한다.

Rationale: Concept Store 누적이 생성 지연의 핵심 원인인지 빠르게 판별할 수 있다.

### 4. 홈 생성 대기 UI 보강

- 생성 시작 후 경과 시간을 표시한다.
- “주제 분석 중”, “학습 경로 생성 중”, “Concept 연결 중”, “Tree 저장 중” 같은 단계형 안내 문구를 표시한다.
- Concept 재사용이 켜져 있으면 기존 Concept과 비교하느라 더 걸릴 수 있음을 안내한다.
- 실패 시 재시도 가능한 안내를 표시한다.

Rationale: 실제 시간이 즉시 줄지 않더라도 사용자가 멈춤으로 오해하지 않도록 체감 성능을 개선한다.

### 5. Tree 재생성 대기 UI 보강

- `/tree/[treeId]` 화면의 “다시 생성” 동작에도 홈 생성과 동일한 경과 시간/단계 안내를 적용한다.
- 실패 시 조용히 무시하지 않고 재시도 가능한 안내를 표시한다.

Rationale: 재생성도 동일한 생성 API를 사용하므로 같은 지연 문제가 발생한다.

### 6. POST 응답과 이동 후 GET 중복 비용 검토

- 생성 API는 전체 Tree 응답을 만들지만, 홈 화면은 `tree_id`만 사용한다.
- 이동 후 Tree 상세 화면에서 다시 `/api/trees/[treeId]`를 호출한다.
- 기존 public API contract를 유지하면서 생성 직후 응답을 임시로 활용하거나 최소 응답 옵션을 둘 수 있는지 검토한다.

Rationale: LLM보다 작은 비용이라도 불필요한 재조회와 응답 변환을 줄일 수 있다.

### 7. LLM 출력량 축소 옵션 설계

- 설명 길이 제한을 더 명확히 한다.
- edge 수를 핵심 관계 위주로 제한한다.
- Concept candidate의 short description 길이를 제한한다.
- 8~20개 노드 범위는 유지하되, Tree View 품질에 필요한 최소 정보 중심으로 prompt를 다듬는다.

Rationale: 긴 JSON 출력은 LLM 생성 시간의 핵심 병목 후보이므로 출력 토큰을 줄이는 것이 직접적인 개선이 될 수 있다.

### 8. Concept 재사용 최적화 후보 정리

- alias JSON scan 비용을 측정한다.
- domain별 full scan 비용을 측정한다.
- updatedAt 정렬 recent query 비용을 측정한다.
- 노드별 N+1 Concept 조회를 batch 조회로 줄일 수 있는지 검토한다.
- 인덱스 또는 alias 정규화 테이블이 필요한 경우 Phase 2.5 후속 승인 항목으로 분리한다.

Rationale: Concept Store가 커질수록 생성 시간이 증가할 수 있으므로, 데이터 증가에 따른 병목을 확인해야 한다.

### 9. LLM timeout 및 실패 복구 정책 점검

- 외부 LLM 호출에 명시적 timeout을 둘지 검토한다.
- 401 같은 인증 오류는 즉시 중단한다.
- validation 실패 재시도는 유지하되 로그로 확인 가능하게 한다.
- 사용자에게 재시도 가능한 에러 메시지를 표시한다.

Rationale: 외부 요청이 무한정 길어지는 상황을 줄이고 실패를 빠르게 복구해야 한다.

### 10. 비동기 생성 전환 여부 판단

- 계측 결과 LLM 대기가 구조적 병목이면 “생성 요청 등록 → 상태 조회 → 완료 후 Tree 이동” 구조를 후속 작업으로 승격한다.
- 이 전환은 route/API contract 또는 저장 모델 변경이 필요할 수 있으므로 별도 승인 항목으로 분리한다.

Rationale: 단일 동기 요청 구조는 근본적으로 긴 대기 UX를 만들기 때문이다.

## 검증 기준

- [ ] 동일 topic에 대해 전체 생성 시간과 구간별 시간이 분리되어 확인된다.
- [ ] LLM 재시도 발생 여부와 실패 유형이 로그에서 확인된다.
- [ ] `reuse_concepts: true`와 `reuse_concepts: false`의 생성 시간 차이가 확인된다.
- [ ] 생성 중 UI가 멈춘 것처럼 보이지 않고 경과 시간 또는 단계형 안내를 보여 준다.
- [ ] Tree 재생성 실패 시 사용자에게 안내가 표시된다.
- [ ] 기존 Tree View, 섹션 보기, 노드 상세 모달, 추천, 진행 상태 변경이 깨지지 않는다.
- [ ] public API, DB schema, route 변경이 필요한 개선은 별도 승인 항목으로 분리된다.

## 잠재 리스크와 완화 전략

1. **LLM 자체가 대부분의 병목일 가능성**
   - Mitigation: 계측 후 출력량 축소, timeout, 모델 선택, 비동기 생성 전환을 우선순위화한다.

2. **Concept Store 최적화가 DB schema 변경을 요구할 가능성**
   - Mitigation: Phase 2.5에서는 먼저 계측과 batch 개선 후보를 확정하고, schema 변경은 별도 승인 후 진행한다.

3. **대기 UI만 개선하면 실제 생성 시간은 줄지 않을 가능성**
   - Mitigation: UI 개선은 perceived performance로 한정하고, 실제 시간 단축은 계측 결과 기반으로 LLM/Concept/응답 중복 개선을 적용한다.

4. **Prompt 축소가 Tree 품질을 낮출 가능성**
   - Mitigation: 대표 topic으로 Tree View 구조, children 관계, Concept badge 품질을 비교 검증한다.

5. **비동기 생성 전환이 API contract 변경을 수반할 가능성**
   - Mitigation: 기본안은 기존 API를 유지한 계측·UX 개선으로 두고, 비동기 전환은 후속 승인 항목으로 둔다.

## 대안

1. **최소 변경안**
   - 계측, 대기 UI, reuse 비교 검증만 반영한다.
   - 장점: 위험이 낮고 빠르게 원인을 확인할 수 있다.
   - 단점: LLM 대기 자체는 줄지 않는다.

2. **성능 개선 포함안**
   - 계측과 함께 prompt 출력량 축소, response 재사용, Concept batch 개선까지 포함한다.
   - 장점: 실제 시간 단축 가능성이 높다.
   - 단점: Tree 품질 회귀 검증이 필요하다.

3. **비동기 생성 전환안**
   - 생성 job/status API를 도입해 사용자가 진행 상태를 보게 한다.
   - 장점: 긴 LLM 대기에도 UX가 가장 안정적이다.
   - 단점: route/API contract와 저장 모델 변경 검토가 필요하다.
