# RootMap Phase 1 명세서

## 1. Phase 1 목표

Phase 1의 목표는 RootMap의 핵심 가설을 검증하는 것이다.

RootMap은 단순히 사용자의 질문에 답하는 AI 챗봇이 아니라, 사용자가 배우고 싶은 주제를 입력하면 해당 주제를 이해하기 위해 필요한 선수지식과 핵심 개념을 트리 구조로 재구성해 주는 학습 서비스다.

따라서 Phase 1에서는 Karpathy식 LLM Wiki나 장기 지식베이스 구현보다, 먼저 다음 질문에 답할 수 있어야 한다.

> 사용자가 주제를 입력했을 때, AI가 실제로 유용한 선수지식 트리와 노드별 학습 설명을 생성할 수 있는가?

Phase 1의 결과물은 완성형 학습 플랫폼이 아니라, RootMap의 핵심 사용자 경험을 검증할 수 있는 MVP다.

---

## 2. Phase 1 범위

### 포함하는 기능

Phase 1에서 구현할 기능은 다음과 같다.

1. 사용자가 학습 주제를 입력한다.
2. AI가 해당 주제를 분석한다.
3. AI가 선수지식, 핵심 개념, 부가 지식, 오개념, 이해 점검 항목을 분류한다.
4. 분류된 개념을 트리 구조로 출력한다.
5. 사용자가 각 노드를 클릭해 설명을 확인한다.
6. 노드별로 쉬운 설명, 예시, 비유, 간단한 이해 점검 질문을 제공한다.
7. 사용자는 각 노드에 대해 `안다 / 조금 안다 / 모른다` 상태를 체크할 수 있다.
8. 사용자의 체크 상태를 바탕으로 우선 학습할 노드를 추천한다.
9. 생성된 학습 트리와 사용자의 진행 상태를 저장한다.

### 제외하는 기능

Phase 1에서는 다음 기능을 구현하지 않는다.

1. PDF 업로드 및 문서 기반 개념 추출
2. Karpathy식 LLM Wiki 전체 구현
3. 영구적인 개인 지식베이스 자동 확장
4. 복잡한 그래프 시각화
5. 유튜브 자막 입력
6. 다중 문서 비교
7. 장기 학습 이력 기반 고도화 추천
8. 개념 자동 병합 및 중복 제거
9. RAG 기반 출처 추적 답변
10. 사용자 간 학습 트리 공유

Phase 1에서는 입력을 `텍스트 주제`로 제한한다.

예시는 다음과 같다.

```text
Transformer
Rust lifetime
가상 메모리
운영체제 스케줄링
데이터베이스 인덱스
self-attention
```

---

## 3. 핵심 사용자 시나리오

### 시나리오 1: 주제 입력

사용자가 시작 화면에서 배우고 싶은 주제를 입력한다.

```text
사용자 입력: Rust lifetime을 배우고 싶어
```

시스템은 입력을 학습 목표로 해석한다.

```text
학습 목표: Rust lifetime 이해
```

---

### 시나리오 2: 학습 트리 생성

AI는 입력 주제를 기반으로 다음과 같은 구조의 학습 트리를 생성한다.

```text
Rust lifetime
├─ 선수지식
│  ├─ ownership
│  ├─ reference
│  ├─ borrowing
│  └─ scope
├─ 핵심 개념
│  ├─ lifetime annotation
│  ├─ lifetime elision
│  └─ borrow checker와 lifetime의 관계
├─ 부가 지식
│  ├─ dangling reference
│  └─ memory safety
├─ 오개념
│  ├─ lifetime은 객체의 실제 수명을 늘리는 기능이 아니다
│  └─ lifetime annotation은 메모리 해제를 직접 제어하지 않는다
└─ 이해 점검
   ├─ 참조가 유효한 범위 판단하기
   └─ lifetime annotation이 필요한 함수 구분하기
```

---

### 시나리오 3: 수준 체크

사용자는 각 노드에 대해 자신의 이해 상태를 표시한다.

```text
ownership: 안다
reference: 조금 안다
borrowing: 모른다
scope: 조금 안다
lifetime annotation: 모른다
```

시스템은 이 정보를 바탕으로 우선 학습 노드를 추천한다.

```text
추천 학습 순서:
1. borrowing
2. scope
3. reference 복습
4. lifetime annotation
```

---

### 시나리오 4: 노드 학습

사용자가 `borrowing` 노드를 클릭하면 다음 정보를 보여준다.

1. 쉬운 설명
2. 왜 필요한 개념인지
3. 간단한 예시 코드
4. 자주 하는 오해
5. 이해 점검 질문
6. 다음에 볼 노드

예시:

```text
borrowing은 Rust에서 값을 직접 소유하지 않고 잠시 빌려 쓰는 방식이다.
값의 소유권을 넘기지 않으면서도 데이터를 읽거나 수정할 수 있게 해 준다.

예시:
let s = String::from("hello");
let r = &s;
println!("{}", r);

여기서 r은 s의 값을 소유하지 않는다. r은 s를 참조할 뿐이다.
```

---

## 4. 화면 구성

### 화면 1: 시작 화면

사용자가 학습 주제를 입력하는 화면이다.

필수 요소:

- 서비스명: RootMap
- 설명 문구: “배우고 싶은 주제를 입력하면 선수지식 트리를 생성합니다.”
- 주제 입력창
- 예시 주제 버튼
- 생성 버튼

예시 주제:

```text
Transformer
Rust lifetime
가상 메모리
데이터베이스 인덱스
운영체제 스케줄링
```

---

### 화면 2: 트리 생성 결과 화면

AI가 생성한 학습 트리를 보여주는 화면이다.

필수 요소:

- 루트 주제
- 선수지식 섹션
- 핵심 개념 섹션
- 부가 지식 섹션
- 오개념 섹션
- 이해 점검 섹션
- 각 노드 클릭 기능
- 재생성 버튼
- 저장 버튼

트리 예시:

```text
[Transformer]
├─ 선수지식
│  ├─ 벡터와 행렬
│  ├─ 내적
│  ├─ 확률분포와 softmax
│  └─ sequence 개념
├─ 핵심 개념
│  ├─ Query / Key / Value
│  ├─ self-attention
│  ├─ multi-head attention
│  └─ positional encoding
├─ 부가 지식
│  ├─ RNN의 한계
│  ├─ 병렬화의 장점
│  └─ LLM으로의 확장
├─ 오개념
│  ├─ attention은 단순 검색이 아니다
│  └─ positional encoding은 단순 인덱스 번호가 아니다
└─ 이해 점검
   ├─ attention 계산 예제
   └─ softmax 역할 설명하기
```

---

### 화면 3: 노드 상세 화면

사용자가 특정 노드를 클릭했을 때 표시되는 화면이다.

필수 요소:

- 노드 제목
- 노드 유형
- 쉬운 설명
- 왜 필요한지
- 예시
- 비유
- 관련 개념
- 자주 하는 오해
- 이해 점검 질문
- 다음 추천 노드

노드 유형은 다음 중 하나다.

```text
prerequisite
core
supplementary
misconception
quiz
```

---

### 화면 4: 수준 체크 및 추천 화면

사용자가 각 노드의 이해 상태를 표시하고, 시스템이 다음 학습 노드를 추천하는 화면이다.

상태 값:

```text
known
partial
unknown
```

사용자에게 보이는 표현:

```text
안다
조금 안다
모른다
```

추천 기준:

1. `unknown` 상태인 선수지식 노드를 가장 먼저 추천한다.
2. 선수지식이 `partial`이면 핵심 개념보다 먼저 복습 대상으로 추천한다.
3. 선수지식이 충분히 체크된 뒤 핵심 개념 노드를 추천한다.
4. 오개념 노드는 관련 핵심 개념을 학습한 뒤 추천한다.
5. 이해 점검 노드는 해당 개념 학습 후 추천한다.

---

## 5. AI 출력 스키마

Phase 1에서는 LLM 출력이 반드시 구조화된 JSON 형태여야 한다.

### 학습 트리 생성 응답 스키마

```json
{
  "topic": "Rust lifetime",
  "summary": "Rust lifetime을 이해하기 위한 선수지식과 핵심 개념 트리입니다.",
  "nodes": [
    {
      "id": "ownership",
      "title": "Ownership",
      "type": "prerequisite",
      "description": "Rust에서 값의 소유자를 추적하는 규칙입니다.",
      "difficulty": 2,
      "prerequisites": [],
      "children": ["borrowing", "reference"]
    },
    {
      "id": "borrowing",
      "title": "Borrowing",
      "type": "prerequisite",
      "description": "값의 소유권을 넘기지 않고 참조를 통해 빌려 쓰는 방식입니다.",
      "difficulty": 3,
      "prerequisites": ["ownership"],
      "children": ["lifetime_annotation"]
    }
  ],
  "recommended_order": [
    "ownership",
    "reference",
    "borrowing",
    "scope",
    "lifetime_annotation"
  ]
}
```

### 노드 상세 설명 응답 스키마

```json
{
  "node_id": "borrowing",
  "title": "Borrowing",
  "type": "prerequisite",
  "why_it_matters": "lifetime은 참조가 얼마나 오래 유효한지를 다루므로 borrowing을 먼저 이해해야 합니다.",
  "easy_explanation": "borrowing은 값을 직접 가져오지 않고 잠시 빌려 쓰는 방식입니다.",
  "analogy": "책을 소유하는 것이 아니라 도서관에서 잠시 빌려 읽는 것과 비슷합니다.",
  "example": "let s = String::from(\"hello\");\nlet r = &s;\nprintln!(\"{}\", r);",
  "common_misconceptions": [
    "borrowing은 값을 복사하는 것이 아니다.",
    "참조를 만들었다고 해서 소유권이 이동하는 것은 아니다."
  ],
  "check_questions": [
    {
      "question": "&s는 s의 소유권을 가져오는가?",
      "answer": "아니다. &s는 s를 참조할 뿐이다."
    }
  ],
  "next_nodes": ["scope", "lifetime_annotation"]
}
```

---

## 6. 프롬프트 설계

### 학습 트리 생성 프롬프트

```text
You are an AI learning path designer.

The user wants to learn the following topic:
{{topic}}

Your task is not to directly explain the topic first.
Instead, decompose the topic into a prerequisite-aware learning tree.

Classify concepts into the following categories:
1. prerequisite: concepts the learner should understand before the main topic
2. core: concepts that directly constitute the main topic
3. supplementary: useful background or extension concepts
4. misconception: common misunderstandings
5. quiz: concepts or checks for understanding

Requirements:
- Generate a tree-like structure.
- Make prerequisite relationships explicit.
- Prefer beginner-friendly ordering.
- Avoid assuming advanced background knowledge.
- Return valid JSON only.
- Do not include markdown outside JSON.

JSON schema:
{
  "topic": string,
  "summary": string,
  "nodes": [
    {
      "id": string,
      "title": string,
      "type": "prerequisite" | "core" | "supplementary" | "misconception" | "quiz",
      "description": string,
      "difficulty": number,
      "prerequisites": string[],
      "children": string[]
    }
  ],
  "recommended_order": string[]
}
```

### 노드 상세 설명 프롬프트

```text
You are an AI tutor for undergraduate students.

The learner is studying the topic:
{{topic}}

They selected this concept node:
{{node_title}}

Node type:
{{node_type}}

Known prerequisite context:
{{prerequisites}}

Generate a beginner-friendly explanation for this node.

Requirements:
- Explain why this concept matters.
- Define the concept clearly.
- Provide a concrete example.
- Include one analogy if useful.
- Include common misconceptions.
- Include short check questions.
- Recommend what to study next.
- Return valid JSON only.

JSON schema:
{
  "node_id": string,
  "title": string,
  "type": string,
  "why_it_matters": string,
  "easy_explanation": string,
  "analogy": string,
  "example": string,
  "common_misconceptions": string[],
  "check_questions": [
    {
      "question": string,
      "answer": string
    }
  ],
  "next_nodes": string[]
}
```

---

## 7. 데이터 모델

Phase 1에서는 완전한 LLM Wiki를 만들지 않고, 생성된 학습 트리와 사용자 진행 상태만 저장한다.

### learning_trees

```sql
CREATE TABLE learning_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  topic TEXT NOT NULL,
  summary TEXT,
  tree_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### learning_nodes

```sql
CREATE TABLE learning_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID REFERENCES learning_trees(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  difficulty INT,
  prerequisites JSONB,
  children JSONB,
  detail_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### user_node_progress

```sql
CREATE TABLE user_node_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  tree_id UUID REFERENCES learning_trees(id) ON DELETE CASCADE,
  node_id UUID REFERENCES learning_nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

`status` 값은 다음 중 하나다.

```text
known
partial
unknown
```

---

## 8. 추천 로직

Phase 1의 추천 로직은 복잡한 머신러닝이 아니라 규칙 기반으로 구현한다.

### 기본 규칙

```pseudo
function recommendNextNodes(tree, progress):
    prerequisite_unknown = nodes where type == prerequisite and status == unknown
    if prerequisite_unknown is not empty:
        return sortByDifficulty(prerequisite_unknown)

    prerequisite_partial = nodes where type == prerequisite and status == partial
    if prerequisite_partial is not empty:
        return sortByDifficulty(prerequisite_partial)

    core_unknown = nodes where type == core and status == unknown
    if core_unknown is not empty:
        return sortByPrerequisiteSatisfied(core_unknown)

    misconception_nodes = nodes where type == misconception and status == unknown
    if misconception_nodes is not empty:
        return misconception_nodes

    quiz_nodes = nodes where type == quiz and status == unknown
    return quiz_nodes
```

### 추천 우선순위

| 우선순위 | 대상 |
|---|---|
| 1 | 모르는 선수지식 |
| 2 | 조금 아는 선수지식 |
| 3 | 선수지식이 충족된 핵심 개념 |
| 4 | 관련 오개념 |
| 5 | 이해 점검 |

---

## 9. API 명세

### POST /api/trees/generate

학습 주제를 입력받아 학습 트리를 생성한다.

Request:

```json
{
  "topic": "Rust lifetime"
}
```

Response:

```json
{
  "tree_id": "uuid",
  "topic": "Rust lifetime",
  "summary": "Rust lifetime을 이해하기 위한 학습 트리입니다.",
  "nodes": []
}
```

---

### GET /api/trees/:treeId

저장된 학습 트리를 조회한다.

Response:

```json
{
  "tree_id": "uuid",
  "topic": "Rust lifetime",
  "summary": "...",
  "nodes": [],
  "progress": []
}
```

---

### POST /api/nodes/:nodeId/detail

특정 노드의 상세 설명을 생성한다.

Request:

```json
{
  "tree_id": "uuid"
}
```

Response:

```json
{
  "node_id": "uuid",
  "title": "Borrowing",
  "easy_explanation": "...",
  "example": "...",
  "check_questions": []
}
```

---

### PATCH /api/nodes/:nodeId/progress

사용자의 노드 이해 상태를 업데이트한다.

Request:

```json
{
  "status": "partial"
}
```

Response:

```json
{
  "node_id": "uuid",
  "status": "partial"
}
```

---

### GET /api/trees/:treeId/recommendations

현재 진행 상태를 바탕으로 다음 학습 노드를 추천한다.

Response:

```json
{
  "recommended_nodes": [
    {
      "node_id": "uuid",
      "title": "Borrowing",
      "reason": "lifetime annotation을 이해하기 전에 borrowing을 먼저 알아야 합니다."
    }
  ]
}
```

---

## 10. UI 요구사항

### 트리 UI

트리 UI는 복잡한 그래프보다 명확한 계층 구조를 우선한다.

필수 조건:

1. 루트 주제가 가장 위에 있어야 한다.
2. 선수지식, 핵심 개념, 부가 지식, 오개념, 이해 점검이 구분되어야 한다.
3. 각 노드는 클릭 가능해야 한다.
4. 노드의 이해 상태가 시각적으로 표시되어야 한다.
5. 추천 노드는 강조되어야 한다.

### 노드 상태 표시

| 상태 | 의미 |
|---|---|
| 안다 | 사용자가 충분히 이해한다고 표시 |
| 조금 안다 | 복습이 필요한 상태 |
| 모른다 | 우선 학습 대상 |

---

## 11. 검증 기준

Phase 1이 성공했다고 판단하려면 다음 조건을 만족해야 한다.

### 기능 검증

1. 사용자가 주제를 입력하면 학습 트리가 생성된다.
2. 생성 결과가 선수지식, 핵심 개념, 부가 지식, 오개념, 이해 점검으로 나뉜다.
3. 각 노드를 클릭하면 상세 설명을 볼 수 있다.
4. 사용자가 노드별 이해 상태를 저장할 수 있다.
5. 시스템이 다음 학습 노드를 추천할 수 있다.

### 품질 검증

1. 선수지식이 핵심 개념보다 먼저 배치되어야 한다.
2. 너무 많은 노드를 생성하지 않아야 한다.
3. 초보자가 이해 가능한 표현을 사용해야 한다.
4. 설명에는 최소 1개의 구체적 예시가 포함되어야 한다.
5. 오개념 항목이 실제로 학습에 도움이 되어야 한다.

### 최소 품질 기준

하나의 주제에 대해 다음 수준의 결과가 나오면 Phase 1 MVP로 인정한다.

```text
노드 수: 8~20개
선수지식 노드: 3개 이상
핵심 개념 노드: 3개 이상
오개념 노드: 1개 이상
이해 점검 항목: 2개 이상
노드별 설명: 쉬운 설명 + 예시 + 질문 포함
```

---

## 12. 테스트 케이스

Phase 1에서는 다음 주제로 테스트한다.

### 테스트 주제 1: Rust lifetime

기대 선수지식:

```text
ownership
reference
borrowing
scope
```

기대 핵심 개념:

```text
lifetime annotation
lifetime elision
borrow checker
```

---

### 테스트 주제 2: Transformer

기대 선수지식:

```text
vector
matrix
dot product
softmax
sequence
```

기대 핵심 개념:

```text
Query
Key
Value
self-attention
multi-head attention
positional encoding
```

---

### 테스트 주제 3: 가상 메모리

기대 선수지식:

```text
process
address
memory
page
```

기대 핵심 개념:

```text
virtual address
physical address
page table
TLB
page fault
```

---

## 13. 구현 우선순위

### 1순위

1. 주제 입력 화면
2. 학습 트리 생성 API
3. LLM JSON 응답 파싱
4. 트리 결과 화면
5. 노드 클릭 및 상세 설명 생성

### 2순위

1. 노드 상태 체크
2. 사용자 진행 상태 저장
3. 추천 노드 계산
4. 저장된 트리 조회

### 3순위

1. UI 개선
2. 예시 주제 버튼
3. 트리 재생성
4. 설명 품질 개선
5. 퀴즈 UI 개선

---

## 14. Phase 1 완료 조건

Phase 1은 다음 조건을 만족하면 완료로 본다.

1. 사용자가 텍스트 주제를 입력할 수 있다.
2. AI가 구조화된 학습 트리를 생성한다.
3. 트리가 `선수지식 / 핵심 개념 / 부가 지식 / 오개념 / 이해 점검`으로 구분된다.
4. 사용자가 노드를 클릭해 설명을 확인할 수 있다.
5. 사용자가 노드별 이해 상태를 저장할 수 있다.
6. 시스템이 다음에 볼 노드를 추천한다.
7. 최소 3개 테스트 주제에서 안정적으로 동작한다.
8. PDF, LLM Wiki, 장기 지식베이스 없이도 RootMap의 핵심 가치가 전달된다.

---

## 15. Phase 1의 핵심 판단 기준

Phase 1에서 검증해야 할 것은 기술적으로 화려한 wiki나 graph가 아니다.

가장 중요한 판단 기준은 다음이다.

> 사용자가 “이 주제를 공부하려면 무엇부터 봐야 하는지 알겠다”고 느끼는가?

이 질문에 답할 수 있다면 Phase 1은 성공이다.

반대로 학습 트리가 단순 마인드맵처럼 보이거나, 관련 개념만 나열하고 실제 학습 순서를 제공하지 못한다면 Phase 1은 실패다.

RootMap의 차별점은 AI 설명 자체가 아니라, 학습 순서를 설계해 주는 데 있다.

