# RootMap Phase 4 명세서

## 1. Phase 4 목표

Phase 4의 목표는 RootMap을 단순한 학습 트리 생성 서비스에서 개인화 학습 코치로 확장하는 것이다.

Phase 1에서는 사용자가 주제를 입력하면 선수지식 트리를 생성했다.
Phase 2에서는 생성된 개념을 Concept Node Store에 저장하고 재사용했다.
Phase 3에서는 PDF, TXT, MD 같은 문서를 업로드하면 문서 기반 개념 추출과 학습 트리 생성을 수행했다.

Phase 4에서는 사용자의 학습 이력을 누적하고, 개념별 이해 상태를 분석하여 개인별 학습 경로를 추천한다.

Phase 4의 핵심 질문은 다음이다.

> 같은 주제나 문서를 학습하더라도, 사용자마다 다른 이해 상태를 반영해 다른 학습 경로를 추천할 수 있는가?

예를 들어 두 사용자가 모두 `Transformer`를 공부한다고 해도 상황은 다를 수 있다.

```text
사용자 A:
- 벡터와 행렬: 안다
- 내적: 안다
- softmax: 조금 안다
- self-attention: 모른다

추천:
1. softmax 짧게 복습
2. self-attention 학습
3. multi-head attention 학습
```

```text
사용자 B:
- 벡터와 행렬: 모른다
- 내적: 모른다
- softmax: 모른다
- self-attention: 모른다

추천:
1. 벡터와 행렬
2. 내적
3. softmax
4. self-attention
```

Phase 4의 핵심은 학습 트리를 생성하는 것 자체가 아니라, 사용자 상태에 맞게 트리를 조정하고 다음 학습 행동을 제안하는 것이다.

---

## 2. Phase 4의 위치

RootMap 전체 단계에서 Phase 4는 마지막 확장 단계다.

```text
Phase 1: 주제 입력 기반 선수지식 트리 MVP
Phase 2: Concept Node 저장 및 재사용
Phase 3: PDF/문서 기반 개념 추출
Phase 4: 개인화 학습 이력 및 추천 고도화
```

Phase 4는 이전 단계의 결과를 모두 활용한다.

```text
Phase 1의 학습 트리
        ↓
Phase 2의 Concept Store
        ↓
Phase 3의 문서 기반 Concept Evidence
        ↓
Phase 4의 개인화 추천 및 학습 리포트
```

Phase 4에서 새로 추가되는 것은 다음이다.

1. 학습 세션 기록
2. Concept 단위 이해도 점수
3. 퀴즈 결과 반영
4. 복습 추천
5. 약점 분석
6. 학습 리포트 생성
7. 추천 이유 설명
8. 개인화된 학습 트리 조정

---

## 3. Phase 4 범위

### 포함하는 기능

Phase 4에서 구현할 기능은 다음과 같다.

1. 사용자의 학습 세션을 기록한다.
2. 사용자가 어떤 학습 트리를 열었는지 기록한다.
3. 사용자가 어떤 Concept Node를 학습했는지 기록한다.
4. 노드별 자기 평가 상태를 Concept 단위 이해도에 반영한다.
5. 퀴즈 시도와 결과를 저장한다.
6. 퀴즈 결과를 Concept confidence score에 반영한다.
7. 오래전에 학습했거나 confidence가 낮은 개념을 복습 대상으로 추천한다.
8. 사용자의 약점 개념을 분석한다.
9. 같은 학습 트리라도 사용자별 추천 순서를 다르게 계산한다.
10. 추천된 노드에 대해 추천 이유를 설명한다.
11. 학습 세션 요약 리포트를 생성한다.
12. 주간 또는 누적 학습 리포트를 생성한다.
13. 개인 상태를 반영해 학습 트리를 압축하거나 확장한다.

### 제외하는 기능

Phase 4에서는 다음 기능을 구현하지 않는다.

1. 완전한 적응형 교육 알고리즘
2. 정교한 spaced repetition 알고리즘 전체 구현
3. 사용자 간 랭킹 또는 경쟁 기능
4. 커뮤니티 기반 추천
5. 실시간 튜터 음성 대화
6. 시험 대비 자동 커리큘럼 전체 생성
7. 장기 성취도 예측 모델
8. 머신러닝 기반 추천 모델 학습
9. 외부 LMS 연동
10. 교사용 대시보드

Phase 4에서는 복잡한 ML 추천 모델보다 규칙 기반 + 점수 기반 추천을 우선한다.

---

## 4. Phase 3와 Phase 4의 차이

| 항목 | Phase 3 | Phase 4 |
|---|---|---|
| 핵심 목표 | 문서를 학습 트리로 변환 | 사용자별 학습 경로 개인화 |
| 주요 입력 | PDF, TXT, MD | 학습 이력, 자기 평가, 퀴즈 결과 |
| 주요 출력 | 문서 기반 학습 트리 | 개인화 추천, 복습 목록, 학습 리포트 |
| 추천 기준 | 선수지식, 문서 중요도 | 선수지식, 이해도, 오답, 시간 경과, 문서 중요도 |
| 저장 단위 | document, document_chunk, document_concept | learning_session, review_event, quiz_attempt, concept_state |
| 차별점 | 문서 이해 경로 생성 | 개인별 약점 기반 학습 경로 조정 |

---

## 5. 핵심 사용자 시나리오

### 시나리오 1: 개인별 다음 학습 노드 추천

사용자가 `Transformer` 학습 트리를 열었다.

시스템은 해당 트리의 각 노드와 사용자의 Concept 상태를 비교한다.

```text
사용자 상태:
Vector: known, confidence 0.9
Matrix: known, confidence 0.8
Dot Product: partial, confidence 0.5
Softmax: unknown, confidence 0.2
Self-Attention: unknown, confidence 0.1
```

시스템은 다음 노드를 추천한다.

```text
다음 추천: Softmax

추천 이유:
- Self-Attention을 이해하기 전에 softmax가 필요합니다.
- 현재 softmax 이해도가 낮습니다.
- Dot Product는 조금 알고 있으므로 softmax를 먼저 학습하면 다음 단계로 넘어갈 수 있습니다.
```

---

### 시나리오 2: 퀴즈 결과 기반 이해도 업데이트

사용자가 `softmax` 노드의 이해 점검 문제를 푼다.

```text
문제: softmax는 입력 벡터의 각 값을 어떤 형태로 변환하는가?
사용자 답변: 가장 큰 값 하나만 선택한다.
기대 답변: 각 값을 전체 합이 1이 되는 확률분포 형태로 변환한다.
```

시스템은 답변을 오답으로 판단하고, 관련 오개념을 기록한다.

```text
결과:
- softmax confidence_score 감소
- 오개념: softmax는 argmax와 같다는 오해 감지
- 추천: softmax 개념 설명 다시 보기
```

---

### 시나리오 3: 복습 추천

사용자가 14일 전에 `borrowing`을 학습했고, confidence score가 0.55다.

이후 `lifetime` 트리를 열면 시스템은 `borrowing`을 복습 대상으로 추천한다.

```text
추천: Borrowing 복습

추천 이유:
- Lifetime을 이해하려면 borrowing 개념이 필요합니다.
- Borrowing을 마지막으로 학습한 지 14일이 지났습니다.
- 이전 confidence score가 0.55로 낮습니다.
```

---

### 시나리오 4: 학습 세션 리포트

사용자가 30분 동안 `Transformer` 트리를 학습한 뒤 세션을 종료한다.

시스템은 세션 요약을 생성한다.

```text
오늘 학습한 내용:
- Dot Product 복습
- Softmax 학습
- Self-Attention 입문

잘 이해한 개념:
- Dot Product

아직 부족한 개념:
- Softmax
- Self-Attention

다음 추천:
1. Softmax 예제 문제 다시 풀기
2. Self-Attention 계산 흐름 보기
3. Multi-Head Attention으로 이동
```

---

### 시나리오 5: 개인화된 트리 압축

사용자가 이미 `vector`, `matrix`, `dot product`, `softmax`를 충분히 알고 있다.

일반 트리:

```text
Transformer
├─ Vector
├─ Matrix
├─ Dot Product
├─ Softmax
├─ Self-Attention
└─ Multi-Head Attention
```

개인화 트리:

```text
Transformer
├─ 이미 아는 선수지식
│  ├─ Vector
│  ├─ Matrix
│  ├─ Dot Product
│  └─ Softmax
├─ 우선 학습
│  ├─ Self-Attention
│  └─ Multi-Head Attention
└─ 이해 점검
   └─ Attention 계산 문제
```

사용자는 이미 아는 개념을 접어두고, 필요한 개념부터 볼 수 있다.

---

## 6. 개인화 상태 모델

Phase 4에서는 단순한 `known / partial / unknown` 상태만으로는 부족하다.

따라서 Concept마다 다음 정보를 관리한다.

```text
status: known / partial / unknown
confidence_score: 0.0 ~ 1.0
last_studied_at
last_quiz_score
review_count
wrong_count
needs_review
```

### 6.1 상태 값

| status | 의미 |
|---|---|
| known | 사용자가 충분히 이해하는 상태 |
| partial | 어느 정도 알지만 복습이 필요한 상태 |
| unknown | 거의 모르거나 처음 보는 상태 |

### 6.2 confidence_score

`confidence_score`는 개념 이해도를 0.0~1.0 사이의 숫자로 표현한다.

권장 초기값:

| 사용자 선택 | status | confidence_score |
|---|---|---|
| 안다 | known | 0.8 |
| 조금 안다 | partial | 0.5 |
| 모른다 | unknown | 0.1 |

### 6.3 confidence_score 업데이트 기준

| 이벤트 | 변화 |
|---|---|
| 사용자가 안다 선택 | +0.15 |
| 사용자가 조금 안다 선택 | 0.5 근처로 보정 |
| 사용자가 모른다 선택 | -0.2 |
| 퀴즈 정답 | +0.1 ~ +0.2 |
| 퀴즈 오답 | -0.1 ~ -0.25 |
| 장기간 미복습 | 시간에 따라 감소 |
| 같은 개념 여러 번 학습 | 소폭 증가 |

confidence_score는 항상 0.0~1.0 사이로 clamp한다.

```pseudo
function clampScore(score):
    if score < 0: return 0
    if score > 1: return 1
    return score
```

---

## 7. 복습 필요도 모델

Phase 4에서는 복습 대상 판단이 필요하다.

복습 필요도는 다음 요인을 반영한다.

1. confidence_score가 낮은가?
2. 마지막 학습일이 오래되었는가?
3. 퀴즈 오답이 많았는가?
4. 현재 학습하려는 개념의 prerequisite인가?
5. 문서에서 중요도가 높은 개념인가?

### 7.1 review_priority_score

```pseudo
review_priority_score =
    (1 - confidence_score) * 0.4
  + recency_decay_score * 0.2
  + quiz_error_score * 0.2
  + prerequisite_importance_score * 0.15
  + document_importance_score * 0.05
```

점수 범위는 0.0~1.0으로 둔다.

| 점수 | 의미 |
|---|---|
| 0.0~0.3 | 복습 우선순위 낮음 |
| 0.3~0.6 | 필요 시 복습 |
| 0.6~0.8 | 복습 권장 |
| 0.8~1.0 | 강한 복습 추천 |

---

## 8. 개인화 추천 로직

Phase 4의 추천은 다음 요소를 종합한다.

1. 현재 학습 트리의 prerequisite 관계
2. 사용자의 Concept confidence_score
3. 사용자의 퀴즈 오답 이력
4. 마지막 학습일
5. 문서 기반 트리라면 document importance
6. 현재 학습 목표와의 거리
7. 이미 아는 개념인지 여부

### 8.1 추천 점수 계산

```pseudo
function calculateNodeRecommendationScore(user, node, tree):
    conceptState = getUserConceptState(user, node.concept_id)
    prerequisiteGap = calculatePrerequisiteGap(user, node)
    lowConfidence = 1 - conceptState.confidence_score
    quizError = getQuizErrorScore(user, node.concept_id)
    recencyDecay = getRecencyDecayScore(conceptState.last_studied_at)
    importance = node.importance or 0.5

    score =
        prerequisiteGap * 0.35
      + lowConfidence * 0.25
      + quizError * 0.15
      + recencyDecay * 0.15
      + importance * 0.10

    return clampScore(score)
```

### 8.2 추천 순서

```pseudo
function recommendPersonalizedNodes(user, tree):
    candidates = []

    for node in tree.nodes:
        if isAlreadyMastered(user, node):
            continue

        if hasUnsatisfiedPrerequisites(user, node):
            prerequisiteNodes = getUnsatisfiedPrerequisites(user, node)
            candidates.add(prerequisiteNodes)
        else:
            candidates.add(node)

    scored = candidates.map(node => {
        return {
            node: node,
            score: calculateNodeRecommendationScore(user, node, tree),
            reason: generateRecommendationReason(user, node, tree)
        }
    })

    return sortByScoreDescending(scored)
```

---

## 9. 추천 이유 설명

Phase 4의 중요한 차별점은 “무엇을 추천하는지”뿐만 아니라 “왜 추천하는지”를 설명하는 것이다.

추천 이유는 사용자가 납득할 수 있어야 한다.

### 9.1 추천 이유 구성 요소

추천 이유에는 다음이 포함될 수 있다.

1. 현재 목표와의 관련성
2. 선수지식 관계
3. 낮은 이해도
4. 최근 오답 여부
5. 마지막 학습 시점
6. 문서에서의 중요도
7. 다음 핵심 개념으로 넘어가기 위한 필요성

### 9.2 추천 이유 예시

```text
다음 추천: Softmax

추천 이유:
- Self-Attention을 이해하려면 softmax가 필요합니다.
- 이전에 softmax를 '조금 안다'로 표시했습니다.
- 최근 퀴즈에서 softmax와 argmax를 혼동했습니다.
- Transformer 문서에서 attention score를 이해하는 데 직접 필요합니다.
```

### 9.3 추천 이유 생성 방식

처음에는 템플릿 기반으로 구현한다.

```pseudo
function generateRecommendationReason(user, node, tree):
    reasons = []

    if node is prerequisite of important core concept:
        reasons.add("이 개념은 다음 핵심 개념을 이해하기 위한 선수지식입니다.")

    if confidence_score < 0.5:
        reasons.add("현재 이해도가 낮게 기록되어 있습니다.")

    if recent_quiz_wrong:
        reasons.add("최근 이해 점검에서 관련 문제를 틀렸습니다.")

    if last_studied_at is old:
        reasons.add("마지막 학습 이후 시간이 지나 복습이 필요합니다.")

    if document_importance is high:
        reasons.add("업로드한 문서에서 중요한 개념으로 등장합니다.")

    return reasons
```

LLM 기반 자연어 생성은 선택 기능으로 둔다.

---

## 10. 퀴즈 및 이해 점검 반영

Phase 4에서는 퀴즈가 단순 부가 기능이 아니라 이해도 업데이트의 핵심 입력이다.

### 10.1 퀴즈 유형

Phase 4에서 지원할 퀴즈 유형은 다음과 같다.

| 유형 | 설명 | 예시 |
|---|---|---|
| short_answer | 짧은 서술형 | softmax의 역할은 무엇인가? |
| multiple_choice | 객관식 | lifetime annotation의 역할로 맞는 것은? |
| explain_back | 사용자가 직접 설명 | self-attention을 본인 말로 설명해 보세요 |
| misconception_check | 오개념 확인 | lifetime은 객체 수명을 늘리는 기능인가? |

MVP에서는 `short_answer`, `misconception_check`를 우선 구현한다.

---

### 10.2 퀴즈 평가 방식

퀴즈 평가는 LLM을 사용할 수 있다.

입력:

```json
{
  "concept": "Softmax",
  "question": "softmax는 입력 값을 어떤 형태로 변환하는가?",
  "expected_answer": "전체 합이 1이 되는 확률분포 형태로 변환한다.",
  "user_answer": "가장 큰 값을 선택한다."
}
```

출력:

```json
{
  "is_correct": false,
  "score": 0.2,
  "feedback": "softmax는 가장 큰 값 하나를 선택하는 argmax와 다릅니다. 각 값을 확률처럼 변환합니다.",
  "detected_misconceptions": [
    "softmax를 argmax로 오해함"
  ]
}
```

---

### 10.3 퀴즈 결과 반영

```pseudo
function updateConceptAfterQuiz(user, concept, quizResult):
    state = getUserConceptState(user, concept)

    if quizResult.is_correct:
        state.confidence_score += 0.15 * quizResult.score
    else:
        state.confidence_score -= 0.2 * (1 - quizResult.score)
        state.wrong_count += 1
        saveMisconceptions(quizResult.detected_misconceptions)

    state.last_quiz_score = quizResult.score
    state.status = convertScoreToStatus(state.confidence_score)
    save(state)
```

---

## 11. 데이터 모델

Phase 4에서는 학습 이력, 퀴즈, 추천, 리포트 관련 테이블을 추가한다.

### 11.1 learning_sessions

학습 세션을 저장한다.

```sql
CREATE TABLE learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tree_id UUID REFERENCES learning_trees(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INT,
  summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 11.2 learning_events

사용자의 세부 학습 행동을 저장한다.

```sql
CREATE TABLE learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES learning_sessions(id) ON DELETE CASCADE,
  tree_id UUID REFERENCES learning_trees(id) ON DELETE SET NULL,
  node_id UUID REFERENCES learning_nodes(id) ON DELETE SET NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
```

`event_type` 값:

```text
tree_opened
node_opened
node_completed
self_assessment_updated
quiz_started
quiz_submitted
recommendation_clicked
session_ended
```

---

### 11.3 user_concept_mastery

Phase 2의 `user_concept_progress`를 확장하거나 대체할 수 있는 테이블이다.

```sql
CREATE TABLE user_concept_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown',
  confidence_score FLOAT DEFAULT 0.1,
  last_studied_at TIMESTAMP,
  last_quiz_score FLOAT,
  review_count INT DEFAULT 0,
  wrong_count INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  needs_review BOOLEAN DEFAULT true,
  mastery_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, concept_id)
);
```

---

### 11.4 quiz_attempts

퀴즈 시도 기록을 저장한다.

```sql
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
  tree_id UUID REFERENCES learning_trees(id) ON DELETE SET NULL,
  node_id UUID REFERENCES learning_nodes(id) ON DELETE SET NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  quiz_type TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_answer TEXT,
  user_answer TEXT,
  is_correct BOOLEAN,
  score FLOAT,
  feedback TEXT,
  detected_misconceptions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 11.5 misconception_events

사용자의 오개념 감지 기록을 저장한다.

```sql
CREATE TABLE misconception_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  quiz_attempt_id UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  misconception_text TEXT NOT NULL,
  evidence TEXT,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

---

### 11.6 recommendation_logs

추천 결과와 사용자의 반응을 저장한다.

```sql
CREATE TABLE recommendation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tree_id UUID REFERENCES learning_trees(id) ON DELETE SET NULL,
  node_id UUID REFERENCES learning_nodes(id) ON DELETE SET NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  score FLOAT NOT NULL,
  reasons JSONB DEFAULT '[]'::jsonb,
  clicked BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 11.7 learning_reports

세션 요약 또는 기간별 리포트를 저장한다.

```sql
CREATE TABLE learning_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  report_type TEXT NOT NULL,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  title TEXT,
  summary TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  report_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
```

`report_type` 값:

```text
session
weekly
topic
cumulative
```

---

## 12. API 명세

### POST /api/sessions/start

학습 세션을 시작한다.

Request:

```json
{
  "tree_id": "uuid",
  "document_id": "uuid"
}
```

Response:

```json
{
  "session_id": "uuid",
  "started_at": "2026-05-04T00:00:00Z"
}
```

---

### POST /api/sessions/:sessionId/end

학습 세션을 종료하고 요약을 생성한다.

Request:

```json
{
  "generate_report": true
}
```

Response:

```json
{
  "session_id": "uuid",
  "ended_at": "2026-05-04T00:30:00Z",
  "duration_seconds": 1800,
  "report_id": "uuid"
}
```

---

### POST /api/events

학습 이벤트를 기록한다.

Request:

```json
{
  "session_id": "uuid",
  "tree_id": "uuid",
  "node_id": "uuid",
  "concept_id": "uuid",
  "event_type": "node_opened",
  "event_payload": {}
}
```

Response:

```json
{
  "event_id": "uuid",
  "created": true
}
```

---

### PATCH /api/concepts/:conceptId/mastery

사용자의 Concept 이해 상태를 업데이트한다.

Request:

```json
{
  "status": "partial",
  "confidence_score": 0.5,
  "source": "self_assessment"
}
```

Response:

```json
{
  "concept_id": "uuid",
  "status": "partial",
  "confidence_score": 0.5
}
```

---

### GET /api/concepts/:conceptId/mastery

특정 Concept에 대한 사용자 이해 상태를 조회한다.

Response:

```json
{
  "concept_id": "uuid",
  "title": "Softmax",
  "status": "partial",
  "confidence_score": 0.52,
  "last_studied_at": "2026-04-20T00:00:00Z",
  "last_quiz_score": 0.4,
  "review_count": 2,
  "wrong_count": 1,
  "needs_review": true
}
```

---

### GET /api/trees/:treeId/personalized

사용자 상태를 반영한 개인화 트리를 조회한다.

Response:

```json
{
  "tree_id": "uuid",
  "topic": "Transformer",
  "personalized_nodes": [
    {
      "node_id": "uuid",
      "concept_id": "uuid",
      "title": "Softmax",
      "status": "partial",
      "confidence_score": 0.52,
      "recommendation_score": 0.78,
      "is_recommended": true,
      "reasons": [
        "Self-Attention을 이해하기 위한 선수지식입니다.",
        "이전 퀴즈에서 관련 오답이 있었습니다."
      ]
    }
  ]
}
```

---

### GET /api/trees/:treeId/recommendations/personalized

개인화된 다음 학습 노드를 추천한다.

Response:

```json
{
  "tree_id": "uuid",
  "recommended_nodes": [
    {
      "node_id": "uuid",
      "concept_id": "uuid",
      "title": "Softmax",
      "score": 0.78,
      "reasons": [
        "Self-Attention을 이해하려면 softmax가 필요합니다.",
        "현재 이해도가 낮게 기록되어 있습니다.",
        "최근 퀴즈에서 softmax와 argmax를 혼동했습니다."
      ]
    }
  ]
}
```

---

### POST /api/quizzes/attempts

퀴즈 답변을 제출하고 평가한다.

Request:

```json
{
  "session_id": "uuid",
  "tree_id": "uuid",
  "node_id": "uuid",
  "concept_id": "uuid",
  "quiz_type": "short_answer",
  "question": "softmax는 입력 값을 어떤 형태로 변환하는가?",
  "expected_answer": "전체 합이 1이 되는 확률분포 형태로 변환한다.",
  "user_answer": "가장 큰 값 하나를 선택한다."
}
```

Response:

```json
{
  "attempt_id": "uuid",
  "is_correct": false,
  "score": 0.2,
  "feedback": "softmax는 가장 큰 값 하나를 선택하는 argmax와 다릅니다.",
  "detected_misconceptions": [
    "softmax를 argmax로 오해함"
  ],
  "updated_mastery": {
    "concept_id": "uuid",
    "status": "unknown",
    "confidence_score": 0.32
  }
}
```

---

### GET /api/reviews/due

복습이 필요한 개념 목록을 조회한다.

Response:

```json
{
  "review_items": [
    {
      "concept_id": "uuid",
      "title": "Borrowing",
      "review_priority_score": 0.82,
      "reasons": [
        "마지막 학습 이후 14일이 지났습니다.",
        "Lifetime을 이해하기 위한 선수지식입니다.",
        "confidence score가 낮습니다."
      ]
    }
  ]
}
```

---

### POST /api/reports/generate

학습 리포트를 생성한다.

Request:

```json
{
  "report_type": "session",
  "session_id": "uuid"
}
```

Response:

```json
{
  "report_id": "uuid",
  "title": "Transformer 학습 세션 요약",
  "summary": "오늘은 softmax와 self-attention을 중심으로 학습했습니다.",
  "strengths": ["Dot Product"],
  "weaknesses": ["Softmax", "Self-Attention"],
  "recommendations": [
    "Softmax 예제 문제를 다시 풀어보세요.",
    "Self-Attention 계산 흐름을 복습하세요."
  ]
}
```

---

## 13. LLM 프롬프트 설계

### 13.1 퀴즈 평가 프롬프트

```text
You are evaluating a student's answer to a learning check question.

Concept:
{{concept_title}}

Question:
{{question}}

Expected answer:
{{expected_answer}}

Student answer:
{{user_answer}}

Evaluate whether the student's answer demonstrates correct understanding.

Requirements:
- Be strict but fair.
- Identify partial understanding.
- Detect misconceptions if present.
- Provide concise feedback.
- Return valid JSON only.

JSON schema:
{
  "is_correct": boolean,
  "score": number,
  "feedback": string,
  "detected_misconceptions": string[]
}
```

---

### 13.2 학습 세션 리포트 생성 프롬프트

```text
You are generating a learning session report for a student.

Session topic:
{{topic}}

Learning events:
{{learning_events}}

Concept mastery changes:
{{mastery_changes}}

Quiz attempts:
{{quiz_attempts}}

Generate a concise learning report.

Requirements:
- Summarize what the student learned.
- Identify strengths.
- Identify weak concepts.
- Recommend next actions.
- Do not overstate mastery.
- Return valid JSON only.

JSON schema:
{
  "title": string,
  "summary": string,
  "learned_concepts": string[],
  "strengths": string[],
  "weaknesses": string[],
  "next_recommendations": string[]
}
```

---

### 13.3 약점 분석 프롬프트

```text
You are analyzing a student's learning history.

Concept mastery records:
{{concept_mastery_records}}

Quiz attempts:
{{quiz_attempts}}

Misconception events:
{{misconception_events}}

Learning tree context:
{{tree_context}}

Identify the student's weak concepts and likely reasons.

Requirements:
- Focus on actionable weaknesses.
- Distinguish prerequisite gaps from core concept gaps.
- Mention repeated misconceptions.
- Recommend what to review first.
- Return valid JSON only.

JSON schema:
{
  "weak_concepts": [
    {
      "concept_id": string,
      "title": string,
      "reason": string,
      "priority": number,
      "recommended_action": string
    }
  ],
  "summary": string
}
```

---

### 13.4 개인화 트리 요약 프롬프트

```text
You are adapting a learning tree for a specific student.

Original learning tree:
{{learning_tree}}

Student concept mastery:
{{concept_mastery}}

Current learning goal:
{{learning_goal}}

Generate a personalized summary of how the student should navigate this tree.

Requirements:
- Identify concepts the student can skip or skim.
- Identify concepts the student should study carefully.
- Identify prerequisite gaps.
- Explain the recommended path.
- Return valid JSON only.

JSON schema:
{
  "skim_nodes": string[],
  "study_nodes": string[],
  "review_nodes": string[],
  "recommended_path": string[],
  "summary": string
}
```

---

## 14. UI 요구사항

### 14.1 개인화 트리 화면

기존 트리 화면에 사용자 상태를 반영한다.

필수 표시 요소:

1. 노드별 이해 상태
2. confidence_score 또는 단순화된 상태 표시
3. 추천 노드 강조
4. 복습 필요 노드 표시
5. 이미 아는 노드 접기 기능
6. 추천 이유 표시

예시:

```text
Transformer
├─ 이미 아는 선수지식
│  ├─ Vector [안다]
│  ├─ Matrix [안다]
│  └─ Dot Product [안다]
├─ 복습 추천
│  └─ Softmax [조금 안다, 복습 필요]
└─ 우선 학습
   ├─ Self-Attention [모른다, 추천]
   └─ Multi-Head Attention [잠김: Self-Attention 필요]
```

---

### 14.2 추천 패널

트리 옆 또는 상단에 다음 학습 추천을 표시한다.

필수 요소:

1. 추천 노드 제목
2. 추천 우선순위
3. 추천 이유
4. 바로 학습 버튼
5. 복습으로 표시 버튼
6. 이미 안다고 표시 버튼

예시:

```text
다음 추천: Softmax

추천 이유:
- Self-Attention을 이해하기 위한 선수지식입니다.
- 최근 퀴즈에서 관련 오답이 있었습니다.
- 현재 이해도가 낮게 기록되어 있습니다.

[학습 시작] [복습 완료로 표시] [이미 알아요]
```

---

### 14.3 Concept 상태 패널

노드 상세 화면에 개인 상태 정보를 추가한다.

필수 요소:

1. 현재 상태: 안다 / 조금 안다 / 모른다
2. confidence_score 시각화
3. 마지막 학습일
4. 퀴즈 결과
5. 오개념 기록
6. 복습 필요 여부

---

### 14.4 학습 리포트 화면

세션 종료 후 학습 리포트를 보여준다.

필수 요소:

1. 학습 시간
2. 학습한 개념 목록
3. 이해도가 오른 개념
4. 아직 부족한 개념
5. 감지된 오개념
6. 다음 추천 행동

---

### 14.5 복습 화면

복습이 필요한 개념만 모아 보여준다.

필수 요소:

1. 복습 우선순위
2. 개념명
3. 왜 복습해야 하는지
4. 관련 학습 트리
5. 바로 복습 버튼
6. 퀴즈 다시 풀기 버튼

---

## 15. 추천 및 상태 업데이트 정책

### 15.1 자기 평가 반영

사용자가 노드 상태를 직접 선택하면 즉시 Concept mastery에 반영한다.

```pseudo
function updateBySelfAssessment(user, concept, selectedStatus):
    state = getOrCreateMastery(user, concept)

    if selectedStatus == known:
        state.confidence_score = max(state.confidence_score, 0.75)
        state.status = known
    else if selectedStatus == partial:
        state.confidence_score = max(min(state.confidence_score, 0.6), 0.4)
        state.status = partial
    else if selectedStatus == unknown:
        state.confidence_score = min(state.confidence_score, 0.25)
        state.status = unknown

    state.last_studied_at = now()
    save(state)
```

---

### 15.2 퀴즈 결과 반영

퀴즈 결과는 자기 평가보다 더 강한 신호로 본다.

```pseudo
function updateByQuiz(user, concept, quizScore):
    state = getOrCreateMastery(user, concept)

    if quizScore >= 0.8:
        state.confidence_score += 0.15
        state.correct_count += 1
    else if quizScore >= 0.5:
        state.confidence_score += 0.03
    else:
        state.confidence_score -= 0.2
        state.wrong_count += 1

    state.confidence_score = clampScore(state.confidence_score)
    state.status = convertScoreToStatus(state.confidence_score)
    state.last_quiz_score = quizScore
    save(state)
```

---

### 15.3 score를 status로 변환

```pseudo
function convertScoreToStatus(score):
    if score >= 0.75:
        return known
    if score >= 0.4:
        return partial
    return unknown
```

---

## 16. 리포트 생성 정책

### 16.1 세션 리포트

세션 종료 시 생성한다.

포함 내용:

1. 이번 세션에서 본 개념
2. 완료한 노드
3. 퀴즈 결과
4. 이해도가 상승한 개념
5. 오답 또는 오개념이 발생한 개념
6. 다음 추천 노드

---

### 16.2 주간 리포트

선택 기능이다.

포함 내용:

1. 이번 주 학습한 주제
2. 많이 본 개념
3. 이해도가 오른 개념
4. 반복해서 틀린 개념
5. 다음 주 추천 학습 방향

---

### 16.3 주제별 리포트

특정 학습 트리나 문서에 대한 진행 상황을 요약한다.

예시:

```text
Transformer 학습 진행률:
- 선수지식: 80% 완료
- 핵심 개념: 40% 완료
- 오개념 체크: 20% 완료

부족한 개념:
1. Softmax
2. Self-Attention
3. Multi-Head Attention
```

---

## 17. 품질 기준

Phase 4의 성공 여부는 개인화 추천이 실제로 학습에 도움이 되는지로 판단한다.

### 기능 검증 기준

1. 사용자의 학습 세션을 기록할 수 있다.
2. 노드 열람, 완료, 자기 평가 이벤트를 저장할 수 있다.
3. 퀴즈 답변과 평가 결과를 저장할 수 있다.
4. 퀴즈 결과가 Concept 이해도에 반영된다.
5. Concept별 confidence_score가 관리된다.
6. 복습이 필요한 개념을 추천할 수 있다.
7. 같은 트리라도 사용자 상태에 따라 추천 순서가 달라진다.
8. 추천 이유를 설명할 수 있다.
9. 세션 리포트를 생성할 수 있다.
10. 약점 개념을 분석할 수 있다.

### 품질 검증 기준

1. 이미 충분히 아는 개념을 계속 추천하지 않아야 한다.
2. 모르는 선수지식을 건너뛰고 핵심 개념을 추천하지 않아야 한다.
3. 오답이 반복되는 개념은 복습 대상으로 올라와야 한다.
4. 오래전에 학습한 낮은 confidence 개념은 복습 추천되어야 한다.
5. 추천 이유가 사용자가 이해할 수 있을 만큼 구체적이어야 한다.
6. 리포트가 단순 활동 로그가 아니라 다음 행동을 제안해야 한다.

---

## 18. 최소 품질 기준

Phase 4 MVP는 다음 조건을 만족하면 인정한다.

```text
학습 세션 저장 가능
Concept별 confidence_score 저장 가능
자기 평가가 confidence_score에 반영됨
퀴즈 결과가 confidence_score에 반영됨
개인화 추천 노드 3개 이상 제공
추천 이유 2개 이상 제공
복습 대상 개념 조회 가능
세션 리포트 생성 가능
같은 트리에서 사용자 상태에 따라 추천 순서가 달라짐
```

---

## 19. 테스트 케이스

### 테스트 케이스 1: 사용자별 추천 차이

입력:

```text
학습 트리: Transformer
```

사용자 A 상태:

```text
Vector: known
Dot Product: known
Softmax: partial
Self-Attention: unknown
```

사용자 B 상태:

```text
Vector: unknown
Dot Product: unknown
Softmax: unknown
Self-Attention: unknown
```

기대 결과:

```text
사용자 A 추천: Softmax → Self-Attention
사용자 B 추천: Vector → Dot Product → Softmax
```

---

### 테스트 케이스 2: 퀴즈 오답 반영

상황:

```text
개념: Softmax
사용자 답변: 가장 큰 값을 선택하는 함수
```

기대 결과:

```text
is_correct: false
confidence_score 감소
오개념 기록: softmax를 argmax로 오해
Softmax 복습 추천
```

---

### 테스트 케이스 3: 복습 추천

상황:

```text
개념: Borrowing
last_studied_at: 14일 전
confidence_score: 0.45
현재 주제: Rust lifetime
```

기대 결과:

```text
Borrowing이 복습 대상으로 추천된다.
추천 이유에 마지막 학습일, 낮은 confidence, prerequisite 관계가 포함된다.
```

---

### 테스트 케이스 4: 이미 아는 개념 제외

상황:

```text
개념: Vector
status: known
confidence_score: 0.92
```

기대 결과:

```text
Vector는 우선 추천 목록에서 제외된다.
단, 이미 아는 선수지식 섹션에는 표시될 수 있다.
```

---

### 테스트 케이스 5: 세션 리포트 생성

상황:

```text
세션 주제: Transformer
학습 노드: Dot Product, Softmax, Self-Attention
퀴즈 결과: Softmax 오답, Dot Product 정답
```

기대 결과:

```text
잘 이해한 개념: Dot Product
부족한 개념: Softmax, Self-Attention
다음 추천: Softmax 복습 후 Self-Attention 재학습
```

---

## 20. 구현 우선순위

### 1순위

1. learning_sessions 테이블 생성
2. learning_events 테이블 생성
3. user_concept_mastery 테이블 생성
4. 자기 평가 기반 confidence_score 업데이트
5. 개인화 추천 API 구현
6. 추천 이유 템플릿 구현

### 2순위

1. quiz_attempts 테이블 생성
2. 퀴즈 평가 LLM 프롬프트 구현
3. 퀴즈 결과 기반 mastery 업데이트
4. misconception_events 저장
5. 복습 대상 조회 API 구현
6. 개인화 트리 화면 구현

### 3순위

1. 세션 리포트 생성
2. 주간 리포트 생성
3. 약점 분석 프롬프트 구현
4. 추천 로그 저장
5. 추천 품질 개선
6. 개인화 트리 압축 UI 구현

---

## 21. 보안 및 개인정보 고려

Phase 4에서는 사용자의 학습 이력이 누적되므로 개인정보성 데이터 관리가 중요하다.

필수 고려사항:

1. 사용자의 학습 이력은 해당 사용자만 조회할 수 있어야 한다.
2. 학습 세션, 퀴즈 답변, 오개념 기록은 민감한 학습 데이터로 취급한다.
3. 리포트 생성 시 다른 사용자의 데이터가 섞이면 안 된다.
4. 사용자 삭제 요청 시 학습 이력도 함께 삭제할 수 있어야 한다.
5. LLM API로 전송되는 학습 이력은 필요한 범위로 제한한다.
6. 퀴즈 답변이나 개인 노트가 외부 로그에 과도하게 남지 않도록 한다.

---

## 22. Phase 4 완료 조건

Phase 4는 다음 조건을 만족하면 완료로 본다.

1. 사용자의 학습 세션을 시작하고 종료할 수 있다.
2. 사용자의 학습 이벤트를 저장할 수 있다.
3. Concept별 개인 이해도 상태를 관리할 수 있다.
4. 자기 평가가 개인 이해도에 반영된다.
5. 퀴즈 결과가 개인 이해도에 반영된다.
6. 낮은 이해도, 오답, 시간 경과를 바탕으로 복습 대상을 추천할 수 있다.
7. 같은 학습 트리라도 사용자별 추천 순서가 달라진다.
8. 추천 이유를 명확히 설명할 수 있다.
9. 세션 단위 학습 리포트를 생성할 수 있다.
10. 약점 개념을 분석할 수 있다.
11. 이미 아는 개념은 우선 추천에서 제외하거나 접어서 보여줄 수 있다.
12. 최소 5개 테스트 케이스에서 의도한 추천 결과가 나온다.

---

## 23. Phase 4의 핵심 판단 기준

Phase 4에서 검증해야 할 핵심은 다음이다.

> RootMap이 모든 사용자에게 같은 트리를 보여주는 서비스가 아니라, 사용자의 실제 이해 상태를 반영해 다음 학습 행동을 제안하는 서비스가 될 수 있는가?

성공적인 결과는 다음과 같아야 한다.

```text
사용자가 무엇을 이미 아는지 반영된다.
사용자가 무엇을 헷갈리는지 반영된다.
오답과 오개념이 다음 추천에 반영된다.
오래전에 배운 개념은 복습 대상으로 제안된다.
추천 이유가 구체적으로 설명된다.
학습 후 무엇이 나아졌고 무엇이 부족한지 알 수 있다.
```

반대로 다음과 같은 결과가 나오면 Phase 4는 실패다.

```text
모든 사용자에게 같은 추천을 한다.
이미 안다고 표시한 개념을 계속 추천한다.
퀴즈를 틀려도 추천이 바뀌지 않는다.
오래전에 배운 개념을 복습 대상으로 올리지 않는다.
추천 이유가 “중요한 개념이기 때문”처럼 추상적이다.
리포트가 단순 활동 기록에 그친다.
```

RootMap의 최종 차별점은 AI가 설명을 잘하는 것이 아니라, 사용자의 개념 이해 상태를 추적하고 다음 학습 경로를 설계하는 데 있다.

