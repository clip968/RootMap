# RootMap Phase 2 명세서

## 1. Phase 2 목표

Phase 2의 목표는 Phase 1에서 생성한 일회성 학습 트리를 재사용 가능한 내부 개념 저장소로 확장하는 것이다.

Phase 1에서는 사용자가 주제를 입력하면 AI가 선수지식 트리와 노드별 설명을 생성했다. 하지만 이 구조만으로는 같은 개념이 여러 학습 트리에서 반복 생성되고, 사용자가 과거에 배운 개념을 다른 주제에서 다시 활용하기 어렵다.

Phase 2에서는 RootMap 내부에 `Concept Node Store`를 도입한다. 이는 Karpathy식 LLM Wiki 전체 구현이 아니라, RootMap에 필요한 범위로 제한한 개념 저장 계층이다.

Phase 2의 핵심 질문은 다음이다.

> 한 번 생성된 개념을 저장하고, 다른 학습 주제에서 다시 사용할 수 있는가?

예를 들어 사용자가 `Transformer`를 공부할 때 생성된 `softmax`, `vector`, `dot product` 개념은 이후 `BERT`, `Attention`, `classification`, `cross entropy` 같은 주제를 공부할 때 다시 활용될 수 있어야 한다.

---

## 2. Phase 2의 위치

RootMap 전체 단계에서 Phase 2는 다음 역할을 한다.

```text
Phase 1: 주제 입력 기반 선수지식 트리 MVP
Phase 2: Concept Node 저장 및 재사용
Phase 3: PDF/문서 기반 개념 추출
Phase 4: 개인화 학습 이력 및 추천 고도화
```

Phase 2는 Phase 3의 기반이 된다. PDF나 문서를 업로드했을 때 추출된 개념을 저장하려면 먼저 개념을 저장하고 연결하는 내부 구조가 필요하기 때문이다.

따라서 Phase 2에서는 문서 업로드 기능을 만들지 않는다. 대신 향후 문서 기반 개념 추출이 들어올 수 있도록 데이터 구조와 API를 준비한다.

---

## 3. Phase 2 범위

### 포함하는 기능

Phase 2에서 구현할 기능은 다음과 같다.

1. Phase 1에서 생성된 학습 트리 노드를 Concept Node로 저장한다.
2. 동일하거나 유사한 개념이 이미 존재하는지 확인한다.
3. 기존 개념이 있으면 새로 만들지 않고 기존 Concept Node와 연결한다.
4. 개념 간 관계를 저장한다.
5. Concept Node를 기반으로 학습 트리를 다시 생성하거나 보강한다.
6. 특정 개념의 상세 설명, 예시, 오개념, 관련 개념을 저장한다.
7. 사용자가 이전에 학습한 개념을 다른 트리에서 다시 볼 수 있게 한다.
8. 관리자 또는 개발자가 Concept Node 목록과 관계를 확인할 수 있는 최소한의 조회 기능을 제공한다.

### 제외하는 기능

Phase 2에서는 다음 기능을 구현하지 않는다.

1. PDF 업로드
2. 유튜브 자막 입력
3. 문서 원문 기반 RAG
4. 자동 출처 인용
5. 완전한 wiki 페이지 편집기
6. 마크다운 파일 기반 knowledge base
7. 복잡한 그래프 시각화
8. 사용자 간 개념 공유
9. 장기 개인화 추천 알고리즘
10. LLM이 기존 개념을 자동으로 대규모 수정하는 기능

Phase 2의 핵심은 개념 저장과 재사용이지, 외부 자료 기반 지식베이스 구축이 아니다.

---

## 4. Phase 1과 Phase 2의 차이

| 항목 | Phase 1 | Phase 2 |
|---|---|---|
| 핵심 목표 | 학습 트리 생성 UX 검증 | 개념 저장 및 재사용 |
| 입력 | 텍스트 주제 | 텍스트 주제, 기존 Concept Node |
| 출력 | 학습 트리 | 학습 트리 + Concept Node 연결 |
| 저장 단위 | learning_tree, learning_node | concept, concept_edge, tree-concept mapping |
| 개념 재사용 | 없음 또는 제한적 | 있음 |
| 중복 개념 처리 | 없음 | 기본 중복 감지 |
| LLM Wiki 성격 | 없음 | 내부 Concept Wiki Layer 도입 |

---

## 5. 핵심 개념

### 5.1 Concept Node

Concept Node는 RootMap 내부에서 재사용 가능한 개념 단위다.

예시:

```json
{
  "id": "concept_softmax",
  "title": "Softmax",
  "aliases": ["소프트맥스", "softmax function"],
  "short_description": "여러 점수를 확률분포처럼 변환하는 함수",
  "difficulty": 3,
  "domain": "machine_learning",
  "explanation": "Softmax는 입력 벡터의 각 값을 지수 함수로 변환한 뒤 전체 합으로 나누어 확률처럼 해석할 수 있게 만드는 함수다.",
  "examples": [
    "분류 모델의 마지막 출력층에서 각 클래스의 확률을 계산할 때 사용된다."
  ],
  "common_misconceptions": [
    "Softmax는 단순히 가장 큰 값을 고르는 함수가 아니다."
  ]
}
```

Concept Node는 특정 학습 트리에 종속되지 않는다. 여러 학습 트리에서 같은 개념을 참조할 수 있다.

---

### 5.2 Concept Edge

Concept Edge는 개념 사이의 관계다.

RootMap에서는 단순 관련 관계보다 학습 순서를 표현하는 관계가 중요하다.

필수 관계 타입은 다음과 같다.

| relation_type | 의미 | 예시 |
|---|---|---|
| prerequisite | A를 이해해야 B를 이해하기 쉽다 | vector → dot product |
| part_of | A는 B의 구성 요소다 | self-attention → Transformer |
| related | A와 B가 관련 있다 | softmax ↔ cross entropy |
| misconception_of | A는 B에 대한 오개념이다 | “lifetime은 객체 수명을 늘린다” → lifetime |
| example_of | A는 B의 예시다 | attention score 계산 → self-attention |
| application_of | A는 B의 응용이다 | machine translation → Transformer |

가장 중요한 관계는 `prerequisite`이다. RootMap의 차별점은 학습 순서 설계에 있기 때문이다.

---

### 5.3 Learning Tree와 Concept Node의 관계

Learning Tree는 사용자에게 보여주는 학습 경로다. Concept Node는 내부 저장소의 개념 단위다.

하나의 Learning Node는 하나의 Concept Node를 참조할 수 있다.

```text
Learning Tree: Transformer 학습 트리

[Transformer]
├─ 벡터와 행렬       → concept_vector_matrix
├─ 내적             → concept_dot_product
├─ softmax          → concept_softmax
├─ Query / Key / Value → concept_qkv
└─ self-attention   → concept_self_attention
```

Learning Node는 특정 트리에서의 위치, 추천 순서, 사용자 상태를 가진다.
Concept Node는 여러 트리에서 재사용 가능한 설명과 관계를 가진다.

---

## 6. 핵심 사용자 시나리오

### 시나리오 1: 새 주제에서 기존 개념 재사용

사용자가 먼저 `Transformer`를 학습한다.

이때 시스템은 다음 Concept Node를 생성한다.

```text
vector
matrix
dot product
softmax
self-attention
multi-head attention
positional encoding
```

이후 사용자가 `BERT`를 입력한다.

AI가 새 학습 트리를 생성할 때 `Transformer`, `self-attention`, `positional encoding`, `embedding` 같은 기존 Concept Node를 검색한다.

기존 개념이 있으면 새 노드를 만들지 않고 연결한다.

```text
BERT
├─ 선수지식
│  ├─ Transformer       → 기존 concept_transformer 재사용
│  ├─ self-attention    → 기존 concept_self_attention 재사용
│  └─ embedding         → 기존 concept_embedding 재사용 또는 신규 생성
├─ 핵심 개념
│  ├─ bidirectional encoder
│  ├─ masked language modeling
│  └─ next sentence prediction
```

---

### 시나리오 2: 같은 개념의 중복 생성 방지

사용자가 `softmax`, `소프트맥스`, `softmax function`이 포함된 주제를 여러 번 입력할 수 있다.

시스템은 다음 기준으로 기존 개념과 유사한지 확인한다.

1. title 정규화 결과가 같은가?
2. alias에 포함되어 있는가?
3. domain이 유사한가?
4. LLM 또는 embedding 기반 유사도 점수가 높은가?
5. 설명의 의미가 같은가?

중복 가능성이 높으면 기존 concept에 연결한다.

```text
입력 개념: 소프트맥스 함수
기존 개념: Softmax
판정: 동일 개념
처리: 새 concept 생성하지 않고 기존 concept_softmax에 alias 추가
```

---

### 시나리오 3: 기존 Concept Node 기반 상세 설명 재사용

사용자가 이전에 `softmax` 노드의 상세 설명을 생성했다면, 다음 트리에서 같은 개념을 클릭했을 때 기존 설명을 우선 보여준다.

필요하면 현재 주제에 맞게 설명을 보강한다.

예시:

```text
기존 설명: Softmax는 여러 점수를 확률분포처럼 변환하는 함수다.
현재 주제: Transformer
보강 설명: Transformer에서는 attention score를 확률적 가중치처럼 바꾸기 위해 softmax를 사용한다.
```

---

## 7. 데이터 모델

Phase 2에서는 Phase 1의 테이블에 Concept 관련 테이블을 추가한다.

### 7.1 concepts

```sql
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  aliases JSONB DEFAULT '[]'::jsonb,
  domain TEXT,
  short_description TEXT,
  explanation TEXT,
  difficulty INT,
  examples JSONB DEFAULT '[]'::jsonb,
  common_misconceptions JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

필드 설명:

| 필드 | 설명 |
|---|---|
| slug | URL 또는 내부 참조에 사용할 안정적인 문자열 ID |
| title | 사용자에게 표시할 개념명 |
| normalized_title | 중복 비교용 정규화 이름 |
| aliases | 같은 개념을 가리키는 다른 이름 |
| domain | 컴퓨터공학, 머신러닝, 운영체제 등 영역 |
| short_description | 한 줄 설명 |
| explanation | 상세 설명 |
| difficulty | 난이도, 1~5 |
| examples | 예시 목록 |
| common_misconceptions | 오개념 목록 |
| metadata | 확장 필드 |

---

### 7.2 concept_edges

```sql
CREATE TABLE concept_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  to_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  strength FLOAT DEFAULT 1.0,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (from_concept_id, to_concept_id, relation_type)
);
```

관계 방향 예시:

```text
vector --prerequisite--> dot_product
softmax --prerequisite--> self_attention
self_attention --part_of--> transformer
```

`prerequisite` 관계에서는 `from_concept_id`가 먼저 배워야 할 개념이고, `to_concept_id`가 이후에 배울 개념이다.

---

### 7.3 learning_tree_concepts

```sql
CREATE TABLE learning_tree_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID REFERENCES learning_trees(id) ON DELETE CASCADE,
  learning_node_id UUID REFERENCES learning_nodes(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  role_in_tree TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tree_id, learning_node_id, concept_id)
);
```

`role_in_tree` 값은 다음 중 하나다.

```text
prerequisite
core
supplementary
misconception
quiz
```

이 테이블은 특정 학습 트리의 노드와 내부 Concept Node를 연결한다.

---

### 7.4 concept_merge_candidates

중복 가능성이 있는 개념을 바로 병합하지 않고 후보로 저장하기 위한 테이블이다.

```sql
CREATE TABLE concept_merge_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (source_concept_id, target_concept_id)
);
```

`status` 값:

```text
pending
approved
rejected
merged
```

Phase 2에서는 자동 병합을 최소화하고, 명확한 경우에만 병합한다. 애매한 경우에는 후보로 남긴다.

---

## 8. 기존 Phase 1 테이블 변경

Phase 1의 `learning_nodes`에 `concept_id`를 추가한다.

```sql
ALTER TABLE learning_nodes
ADD COLUMN concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL;
```

이렇게 하면 각 learning node가 내부 concept과 직접 연결될 수 있다.

---

## 9. Concept 생성 흐름

### 9.1 전체 흐름

```text
사용자 주제 입력
        ↓
AI 학습 트리 생성
        ↓
각 노드에 대해 Concept 후보 생성
        ↓
기존 Concept 검색
        ↓
동일 개념이면 기존 Concept 연결
        ↓
없으면 새 Concept 생성
        ↓
Concept Edge 저장
        ↓
Learning Tree와 Concept 연결
```

---

### 9.2 Concept 후보 생성

LLM이 학습 트리를 생성할 때 각 노드에 대해 concept 후보 정보를 함께 만든다.

```json
{
  "node_id": "softmax",
  "title": "Softmax",
  "type": "prerequisite",
  "concept_candidate": {
    "canonical_title": "Softmax",
    "aliases": ["소프트맥스", "softmax function"],
    "domain": "machine_learning",
    "short_description": "여러 점수를 확률분포처럼 변환하는 함수"
  }
}
```

---

### 9.3 기존 Concept 검색

검색 기준:

1. `normalized_title` 정확 일치
2. `aliases` 일치
3. 같은 domain 내 title 유사도
4. embedding 유사도
5. LLM 기반 동일 개념 판정

Phase 2에서는 최소 구현으로 1~3번을 우선 사용한다.

embedding 기반 유사도는 선택 기능으로 둔다.

---

### 9.4 Concept 생성

기존 개념이 없으면 새 Concept을 생성한다.

```json
{
  "title": "Softmax",
  "normalized_title": "softmax",
  "aliases": ["소프트맥스", "softmax function"],
  "domain": "machine_learning",
  "short_description": "여러 점수를 확률분포처럼 변환하는 함수",
  "difficulty": 3
}
```

---

### 9.5 Concept 연결

학습 트리의 prerequisite 관계를 기반으로 Concept Edge를 생성한다.

예시:

```text
vector → dot product
exponential function → softmax
softmax → self-attention
self-attention → Transformer
```

저장 예시:

```json
{
  "from": "concept_softmax",
  "to": "concept_self_attention",
  "relation_type": "prerequisite",
  "reason": "self-attention에서 attention score를 확률적 가중치로 바꾸기 위해 softmax를 사용하기 때문"
}
```

---

## 10. 중복 처리 정책

Phase 2에서 중복 처리는 과하게 자동화하지 않는다.

### 자동 연결 가능한 경우

다음 경우에는 자동으로 기존 Concept에 연결한다.

1. normalized_title이 완전히 같은 경우
2. alias가 정확히 일치하는 경우
3. 같은 domain에서 제목이 거의 같은 경우

예시:

```text
Softmax
softmax
소프트맥스
softmax function
```

위 표현은 같은 개념으로 처리할 수 있다.

---

### 자동 병합하지 않는 경우

다음 경우에는 자동 병합하지 않는다.

1. 이름은 비슷하지만 의미가 다른 경우
2. domain이 다른 경우
3. 같은 단어가 여러 분야에서 다르게 쓰이는 경우
4. 개념 범위가 다른 경우

예시:

```text
Attention
Self-Attention
Multi-Head Attention
Cross Attention
```

이들은 관련은 있지만 완전히 같은 개념이 아니다. 따라서 별도 Concept으로 두고 관계를 연결한다.

---

### 병합 후보로 남기는 경우

동일 개념일 가능성은 있으나 확신이 낮은 경우 `concept_merge_candidates`에 저장한다.

예시:

```text
Virtual Memory
가상 메모리
Virtual Address Space
```

`Virtual Memory`와 `가상 메모리`는 같은 개념일 가능성이 높다.
하지만 `Virtual Address Space`는 관련 개념이지만 같은 개념은 아닐 수 있다.

---

## 11. API 명세

### POST /api/trees/generate

Phase 1의 트리 생성 API를 확장한다.

Request:

```json
{
  "topic": "Transformer",
  "reuse_concepts": true
}
```

Response:

```json
{
  "tree_id": "uuid",
  "topic": "Transformer",
  "summary": "Transformer를 이해하기 위한 학습 트리입니다.",
  "nodes": [
    {
      "node_id": "uuid",
      "concept_id": "uuid",
      "title": "Softmax",
      "type": "prerequisite",
      "is_reused_concept": true
    }
  ]
}
```

---

### GET /api/concepts

Concept 목록을 조회한다.

Query parameters:

```text
q: 검색어
Domain: 영역 필터
limit: 반환 개수
```

예시:

```text
GET /api/concepts?q=softmax&domain=machine_learning
```

Response:

```json
{
  "concepts": [
    {
      "id": "uuid",
      "title": "Softmax",
      "aliases": ["소프트맥스", "softmax function"],
      "domain": "machine_learning",
      "short_description": "여러 점수를 확률분포처럼 변환하는 함수"
    }
  ]
}
```

---

### GET /api/concepts/:conceptId

특정 Concept Node를 조회한다.

Response:

```json
{
  "id": "uuid",
  "title": "Softmax",
  "aliases": ["소프트맥스", "softmax function"],
  "domain": "machine_learning",
  "short_description": "여러 점수를 확률분포처럼 변환하는 함수",
  "explanation": "...",
  "examples": [],
  "common_misconceptions": [],
  "edges": {
    "prerequisites": [],
    "used_by": [],
    "related": []
  }
}
```

---

### PATCH /api/concepts/:conceptId

Concept 정보를 수정한다.

Request:

```json
{
  "aliases": ["소프트맥스", "softmax function"],
  "short_description": "입력 점수를 확률분포처럼 변환하는 함수",
  "difficulty": 3
}
```

Response:

```json
{
  "id": "uuid",
  "updated": true
}
```

Phase 2에서는 사용자용 편집 기능보다는 개발자/관리자용 수정 기능으로 둔다.

---

### GET /api/concepts/:conceptId/edges

특정 개념과 연결된 관계를 조회한다.

Response:

```json
{
  "concept_id": "uuid",
  "title": "Softmax",
  "edges": [
    {
      "relation_type": "prerequisite",
      "direction": "outgoing",
      "target_concept_id": "uuid",
      "target_title": "Self-Attention",
      "reason": "Self-Attention에서 attention score를 확률적 가중치로 변환하기 위해 softmax가 사용됩니다."
    }
  ]
}
```

---

### POST /api/concepts/:conceptId/edges

Concept 사이의 관계를 생성한다.

Request:

```json
{
  "to_concept_id": "uuid",
  "relation_type": "prerequisite",
  "reason": "self-attention을 이해하려면 softmax가 필요합니다."
}
```

Response:

```json
{
  "edge_id": "uuid",
  "created": true
}
```

---

### GET /api/concepts/:conceptId/trees

특정 개념이 사용된 학습 트리를 조회한다.

Response:

```json
{
  "concept_id": "uuid",
  "title": "Softmax",
  "trees": [
    {
      "tree_id": "uuid",
      "topic": "Transformer",
      "role_in_tree": "prerequisite"
    },
    {
      "tree_id": "uuid",
      "topic": "Classification",
      "role_in_tree": "core"
    }
  ]
}
```

---

## 12. LLM 출력 스키마 변경

Phase 2에서는 학습 트리 생성 응답에 Concept 후보 정보를 추가한다.

### Phase 2 학습 트리 생성 응답 스키마

```json
{
  "topic": "Transformer",
  "summary": "Transformer를 이해하기 위한 선수지식 중심 학습 트리입니다.",
  "nodes": [
    {
      "id": "softmax",
      "title": "Softmax",
      "type": "prerequisite",
      "description": "여러 점수를 확률분포처럼 변환하는 함수입니다.",
      "difficulty": 3,
      "prerequisites": ["vector", "exponential_function"],
      "children": ["self_attention"],
      "concept_candidate": {
        "canonical_title": "Softmax",
        "aliases": ["소프트맥스", "softmax function"],
        "domain": "machine_learning",
        "short_description": "여러 점수를 확률분포처럼 변환하는 함수",
        "is_reusable": true
      }
    }
  ],
  "edges": [
    {
      "from": "softmax",
      "to": "self_attention",
      "relation_type": "prerequisite",
      "reason": "self-attention은 attention score를 softmax로 정규화합니다."
    }
  ],
  "recommended_order": [
    "vector",
    "dot_product",
    "softmax",
    "self_attention",
    "multi_head_attention"
  ]
}
```

---

## 13. 프롬프트 설계

### 13.1 Concept-aware 학습 트리 생성 프롬프트

```text
You are an AI learning path designer.

The user wants to learn the following topic:
{{topic}}

Your task is to generate a prerequisite-aware learning tree.
In addition, identify reusable concept candidates for each node.

Classify nodes into:
1. prerequisite
2. core
3. supplementary
4. misconception
5. quiz

For each node, include a concept_candidate object.
The concept_candidate should represent a reusable knowledge unit that can appear in other learning trees.

Requirements:
- Make prerequisite relationships explicit.
- Avoid treating merely related concepts as prerequisites.
- Prefer beginner-friendly ordering.
- Keep node count between 8 and 20.
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
      "children": string[],
      "concept_candidate": {
        "canonical_title": string,
        "aliases": string[],
        "domain": string,
        "short_description": string,
        "is_reusable": boolean
      }
    }
  ],
  "edges": [
    {
      "from": string,
      "to": string,
      "relation_type": "prerequisite" | "part_of" | "related" | "misconception_of" | "example_of" | "application_of",
      "reason": string
    }
  ],
  "recommended_order": string[]
}
```

---

### 13.2 Concept 동일성 판정 프롬프트

Phase 2에서 LLM 기반 동일성 판정은 선택 기능이다. title/alias/domain 비교로 충분하지 않은 경우에만 사용한다.

```text
You are checking whether two learning concepts represent the same concept.

Concept A:
{{concept_a}}

Concept B:
{{concept_b}}

Decide whether they are:
1. same_concept
2. related_but_different
3. different

Important:
- Do not merge a broader concept with a narrower concept.
- Do not merge related concepts just because they appear in the same topic.
- Consider domain and meaning, not only surface title similarity.

Return valid JSON only.

JSON schema:
{
  "decision": "same_concept" | "related_but_different" | "different",
  "confidence": number,
  "reason": string
}
```

---

### 13.3 Concept 설명 보강 프롬프트

기존 Concept 설명을 현재 학습 주제에 맞게 보강할 때 사용한다.

```text
You are an AI tutor.

The learner is studying:
{{current_topic}}

The selected concept is:
{{concept_title}}

Existing concept explanation:
{{existing_explanation}}

Generate a topic-aware explanation that reuses the existing explanation but adapts it to the current topic.

Requirements:
- Do not contradict the existing explanation.
- Explain why this concept matters for the current topic.
- Provide a concrete example related to the current topic.
- Return valid JSON only.

JSON schema:
{
  "concept_id": string,
  "title": string,
  "topic_specific_explanation": string,
  "example": string,
  "why_it_matters_here": string,
  "next_nodes": string[]
}
```

---

## 14. 추천 로직 변경

Phase 1에서는 현재 트리 안의 노드 상태만 기준으로 추천했다.

Phase 2에서는 기존 Concept 학습 여부를 함께 고려한다.

### 추가 고려사항

1. 사용자가 과거에 이미 학습한 Concept인지 확인한다.
2. 같은 Concept이 다른 트리에서 `known` 상태였다면 현재 트리에서도 기본값을 `known` 또는 `partial`로 제안한다.
3. 단, 같은 개념이라도 현재 주제에서 더 깊은 이해가 필요하면 `partial`로 둔다.
4. prerequisite 관계를 따라 아직 모르는 개념을 우선 추천한다.

### 추천 로직 예시

```pseudo
function recommendNextNodes(tree, userProgress, conceptProgress):
    for node in tree.nodes:
        if node.concept_id exists in conceptProgress:
            node.inferred_status = conceptProgress[node.concept_id].status
        else:
            node.inferred_status = userProgress[node.id].status

    unknown_prerequisites = nodes where type == prerequisite and inferred_status == unknown
    if unknown_prerequisites is not empty:
        return sortByDifficulty(unknown_prerequisites)

    partial_prerequisites = nodes where type == prerequisite and inferred_status == partial
    if partial_prerequisites is not empty:
        return sortByDifficulty(partial_prerequisites)

    core_ready = nodes where type == core and prerequisitesSatisfied(node)
    if core_ready is not empty:
        return sortByDifficulty(core_ready)

    misconception_ready = nodes where type == misconception and relatedCoreConceptLearned(node)
    if misconception_ready is not empty:
        return misconception_ready

    return quiz_nodes
```

---

## 15. 사용자 진행 상태 확장

Phase 1의 `user_node_progress`는 특정 learning node에 대한 상태만 저장했다.

Phase 2에서는 Concept 단위 진행 상태를 추가한다.

### user_concept_progress

```sql
CREATE TABLE user_concept_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown',
  confidence_score FLOAT DEFAULT 0,
  last_seen_tree_id UUID REFERENCES learning_trees(id) ON DELETE SET NULL,
  last_studied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, concept_id)
);
```

`status` 값:

```text
known
partial
unknown
```

`confidence_score`는 Phase 2에서는 단순 값으로 둔다.

예시 정책:

| 상태 | confidence_score |
|---|---|
| known | 0.8 |
| partial | 0.5 |
| unknown | 0.1 |

Phase 4에서 퀴즈 결과, 복습 주기, 오답 이력 등을 반영해 고도화할 수 있다.

---

## 16. UI 요구사항

Phase 2에서는 사용자에게 내부 wiki를 전면적으로 노출하지 않는다.

사용자는 여전히 학습 트리를 중심으로 사용한다.

### 16.1 트리 화면 추가 표시

트리 노드에 다음 정보를 표시할 수 있다.

1. `새 개념` 또는 `이전에 본 개념`
2. 현재 사용자의 이해 상태
3. 이 개념이 다른 학습 트리에서도 사용되었는지 여부

예시:

```text
Softmax
- 선수지식
- 이전에 본 개념
- 상태: 조금 안다
```

---

### 16.2 Concept 상세 패널

노드를 클릭했을 때 기존 Concept 정보가 있으면 함께 보여준다.

필수 요소:

1. 개념명
2. 한 줄 설명
3. 현재 주제에서 왜 필요한지
4. 기존 설명
5. 현재 주제 맞춤 설명
6. 관련 개념
7. 선수지식
8. 이 개념이 사용된 다른 학습 트리

---

### 16.3 최소 관리자/개발자 화면

Phase 2에서는 개발 중 확인을 위해 간단한 Concept 목록 화면을 둘 수 있다.

필수 요소:

1. Concept 목록
2. 검색
3. domain 필터
4. Concept 상세 보기
5. 연결된 Concept Edge 보기
6. 병합 후보 목록 보기

이 화면은 최종 사용자용 고급 기능이 아니라 디버깅과 데이터 품질 확인을 위한 도구다.

---

## 17. 품질 기준

Phase 2의 품질은 단순히 Concept이 저장되는지보다, 중복 없이 재사용되는지를 기준으로 판단한다.

### 기능 검증 기준

1. Phase 1에서 생성된 트리 노드가 Concept Node로 저장된다.
2. 같은 개념이 다시 등장하면 기존 Concept을 재사용한다.
3. Concept 간 prerequisite 관계가 저장된다.
4. Learning Node와 Concept Node가 연결된다.
5. Concept 단위 사용자 진행 상태가 저장된다.
6. 기존 Concept 설명을 현재 주제에 맞게 재사용할 수 있다.

### 품질 검증 기준

1. 같은 개념이 불필요하게 중복 생성되지 않아야 한다.
2. 관련 개념을 같은 개념으로 잘못 병합하지 않아야 한다.
3. prerequisite 관계와 related 관계를 구분해야 한다.
4. Concept 설명은 특정 트리에만 종속되지 않아야 한다.
5. 현재 주제에 필요한 맥락 설명은 별도로 보강되어야 한다.

---

## 18. 테스트 케이스

### 테스트 케이스 1: Transformer → BERT

1. `Transformer` 학습 트리를 생성한다.
2. Concept Node가 저장되는지 확인한다.
3. `BERT` 학습 트리를 생성한다.
4. 기존 `Transformer`, `self-attention`, `embedding` 관련 Concept이 재사용되는지 확인한다.

기대 결과:

```text
self-attention: reused
positional encoding: reused 또는 related
embedding: reused 또는 newly_created
masked language modeling: newly_created
```

---

### 테스트 케이스 2: Rust lifetime → Borrow checker

1. `Rust lifetime` 학습 트리를 생성한다.
2. `ownership`, `borrowing`, `reference`, `scope` Concept을 저장한다.
3. `Borrow checker` 학습 트리를 생성한다.
4. 기존 Rust 관련 Concept이 재사용되는지 확인한다.

기대 결과:

```text
ownership: reused
borrowing: reused
reference: reused
lifetime: reused 또는 related
borrow checker: reused 또는 newly_created
```

---

### 테스트 케이스 3: Softmax 표현 중복 처리

다음 주제를 순서대로 입력한다.

```text
Softmax
소프트맥스
softmax function
Transformer attention
```

기대 결과:

```text
Softmax 관련 Concept은 하나로 유지된다.
aliases에 소프트맥스, softmax function이 추가된다.
Transformer attention 트리에서는 기존 Softmax Concept을 재사용한다.
```

---

### 테스트 케이스 4: 비슷하지만 다른 개념 분리

다음 개념들이 별도 Concept으로 유지되는지 확인한다.

```text
Attention
Self-Attention
Multi-Head Attention
Cross Attention
```

기대 결과:

```text
각 개념은 별도 Concept으로 존재한다.
관계는 related 또는 part_of로 연결된다.
동일 Concept으로 병합되지 않는다.
```

---

## 19. 구현 우선순위

### 1순위

1. concepts 테이블 생성
2. concept_edges 테이블 생성
3. learning_nodes에 concept_id 추가
4. 트리 생성 후 Concept Node 저장
5. title/alias 기반 기존 Concept 검색
6. Learning Node와 Concept 연결

### 2순위

1. Concept Edge 저장
2. Concept 목록 조회 API
3. Concept 상세 조회 API
4. Concept 단위 사용자 진행 상태 저장
5. 기존 Concept 설명 재사용

### 3순위

1. 중복 후보 테이블
2. LLM 기반 동일성 판정
3. Concept 관리자 화면
4. topic-aware 설명 보강
5. embedding 기반 유사도 검색

---

## 20. Phase 2 완료 조건

Phase 2는 다음 조건을 만족하면 완료로 본다.

1. Phase 1에서 생성된 학습 트리 노드가 Concept Node로 저장된다.
2. 같은 개념이 다시 등장하면 기존 Concept을 재사용한다.
3. Concept 간 prerequisite 관계가 저장된다.
4. Learning Node와 Concept Node가 연결된다.
5. 사용자의 이해 상태가 Concept 단위로도 저장된다.
6. 기존 Concept 설명을 현재 트리에서 재사용할 수 있다.
7. 최소 4개 테스트 케이스에서 중복 생성과 잘못된 병합을 통제할 수 있다.
8. 사용자는 여전히 학습 트리 중심으로 서비스를 사용할 수 있다.

---

## 21. Phase 2의 핵심 판단 기준

Phase 2에서 검증해야 할 핵심은 다음이다.

> RootMap이 매번 새로 설명을 만드는 서비스가 아니라, 개념을 축적하고 재사용하는 학습 시스템으로 발전할 수 있는가?

단, 여기서 주의할 점은 LLM Wiki를 전면 기능으로 만들지 않는 것이다.

사용자에게 중요한 것은 wiki가 아니라 다음 질문에 대한 답이다.

```text
내가 전에 배운 개념이 지금 배우는 주제와 어떻게 연결되는가?
이 주제를 배우기 위해 이미 아는 개념과 모르는 개념은 무엇인가?
다음에 무엇을 봐야 하는가?
```

따라서 Phase 2의 성공 기준은 Concept Store 자체가 아니라, Concept Store가 학습 트리를 더 정확하고 재사용 가능하게 만드는지 여부다.

