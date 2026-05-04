# RootMap Phase 3 명세서

## 1. Phase 3 목표

Phase 3의 목표는 RootMap을 단순 주제 입력 기반 서비스에서 문서 기반 학습 서비스로 확장하는 것이다.

Phase 1에서는 사용자가 텍스트 주제를 입력하면 AI가 선수지식 트리와 노드별 설명을 생성했다.
Phase 2에서는 생성된 개념을 `Concept Node Store`에 저장하고, 다른 학습 트리에서 재사용할 수 있도록 했다.

Phase 3에서는 사용자가 PDF, 강의자료, 텍스트 문서를 업로드하면 RootMap이 문서 내용을 분석하고, 그 문서를 이해하는 데 필요한 개념 구조를 생성해야 한다.

Phase 3의 핵심 질문은 다음이다.

> 사용자가 업로드한 문서를 AI가 학습 가능한 선수지식 트리로 바꿀 수 있는가?

예를 들어 사용자가 Transformer 논문 PDF를 업로드하면, RootMap은 논문 전체를 요약하는 데 그치지 않고 다음을 수행해야 한다.

1. 문서의 핵심 주제를 파악한다.
2. 문서 안에 등장하는 주요 개념을 추출한다.
3. 문서를 이해하기 위해 필요한 선수지식을 추론한다.
4. 기존 Concept Node Store와 연결한다.
5. 문서 기반 학습 트리를 생성한다.
6. 각 개념이 문서의 어느 위치에서 등장했는지 출처를 연결한다.

즉 Phase 3의 목적은 “문서 요약”이 아니라 “문서 이해 경로 생성”이다.

---

## 2. Phase 3의 위치

RootMap 전체 단계에서 Phase 3는 다음 위치에 있다.

```text
Phase 1: 주제 입력 기반 선수지식 트리 MVP
Phase 2: Concept Node 저장 및 재사용
Phase 3: PDF/문서 기반 개념 추출
Phase 4: 개인화 학습 이력 및 추천 고도화
```

Phase 3는 Phase 2의 Concept Store를 활용한다.

문서에서 추출된 개념은 새 Concept Node로 저장되거나, 기존 Concept Node와 연결된다.

```text
문서 업로드
    ↓
텍스트 추출
    ↓
문서 구조 분석
    ↓
개념 추출
    ↓
기존 Concept Store와 매칭
    ↓
문서 기반 학습 트리 생성
    ↓
출처가 연결된 노드 학습
```

---

## 3. Phase 3 범위

### 포함하는 기능

Phase 3에서 구현할 기능은 다음과 같다.

1. 사용자가 PDF 또는 텍스트 문서를 업로드한다.
2. 문서에서 텍스트를 추출한다.
3. 문서를 섹션, 문단, 청크 단위로 나눈다.
4. 문서의 제목, 핵심 주제, 주요 개념을 추출한다.
5. 문서 이해에 필요한 선수지식을 추론한다.
6. 추출된 개념을 기존 Concept Node Store와 매칭한다.
7. 새 개념은 Concept Node로 저장한다.
8. 문서와 Concept Node 사이의 출처 관계를 저장한다.
9. 문서 기반 학습 트리를 생성한다.
10. 노드 상세 화면에서 해당 개념이 문서 어느 부분에 등장했는지 보여준다.
11. 사용자가 문서 기반 학습 트리를 저장하고 이어서 학습할 수 있다.

### 제외하는 기능

Phase 3에서는 다음 기능을 구현하지 않는다.

1. 유튜브 자막 입력
2. 웹사이트 URL 크롤링
3. 다중 문서 비교
4. 논문 자동 번역 전체 기능
5. 이미지, 수식, 표의 정밀 OCR 분석
6. 완전한 citation-based RAG 챗봇
7. 문서 전체에 대한 자유 질의응답 고도화
8. 사용자 간 문서 공유
9. 문서 기반 자동 시험 생성 고도화
10. 장기 개인화 복습 알고리즘

Phase 3는 문서를 “검색 가능한 데이터”로 만드는 것이 아니라, 문서를 “학습 가능한 개념 트리”로 바꾸는 데 집중한다.

---

## 4. Phase 2와 Phase 3의 차이

| 항목 | Phase 2 | Phase 3 |
|---|---|---|
| 입력 | 텍스트 주제 | PDF, 텍스트 문서 |
| 핵심 목표 | 개념 저장 및 재사용 | 문서 기반 개념 추출 |
| 주요 저장 단위 | concept, concept_edge | document, document_chunk, document_concept |
| 출처 정보 | 없음 또는 제한적 | 문서 위치 기반 출처 저장 |
| 학습 트리 생성 기준 | 주제명 | 문서 내용 + 추론된 선수지식 |
| Concept Store 활용 | 기존 개념 재사용 | 문서 개념과 기존 개념 연결 |

---

## 5. 핵심 사용자 시나리오

### 시나리오 1: 논문 PDF 업로드

사용자가 Transformer 논문 PDF를 업로드한다.

```text
입력: Attention Is All You Need.pdf
```

시스템은 PDF에서 텍스트를 추출하고, 문서의 주요 구조를 분석한다.

예상 결과:

```text
문서 제목: Attention Is All You Need
핵심 주제: Transformer architecture
주요 섹션:
- Introduction
- Background
- Model Architecture
- Attention
- Experiments
- Conclusion
```

그 다음 문서를 이해하기 위한 학습 트리를 생성한다.

```text
Attention Is All You Need 이해하기
├─ 선수지식
│  ├─ 벡터와 행렬
│  ├─ 내적
│  ├─ softmax
│  ├─ sequence modeling
│  └─ neural network basics
├─ 문서 핵심 개념
│  ├─ scaled dot-product attention
│  ├─ multi-head attention
│  ├─ positional encoding
│  ├─ encoder-decoder architecture
│  └─ feed-forward network
├─ 문서 이해 보조 개념
│  ├─ RNN의 한계
│  ├─ 병렬화
│  └─ machine translation
├─ 오개념
│  ├─ attention은 단순 검색이 아니다
│  └─ positional encoding은 단순한 인덱스 번호가 아니다
└─ 이해 점검
   ├─ attention score 계산 설명하기
   └─ multi-head attention의 필요성 설명하기
```

---

### 시나리오 2: 강의자료 업로드

사용자가 운영체제 강의자료 PDF를 업로드한다.

```text
입력: virtual_memory_lecture.pdf
```

RootMap은 문서에서 다음 개념을 추출한다.

```text
virtual address
physical address
page table
TLB
page fault
demand paging
swap
```

그 다음 기존 Concept Store에 이미 있는 `process`, `address`, `memory`, `page` 개념과 연결한다.

생성되는 학습 트리 예시:

```text
가상 메모리 강의자료 이해하기
├─ 선수지식
│  ├─ process
│  ├─ address
│  ├─ memory
│  └─ page
├─ 문서 핵심 개념
│  ├─ virtual address
│  ├─ physical address
│  ├─ page table
│  ├─ TLB
│  └─ page fault
└─ 이해 점검
   ├─ virtual address와 physical address 차이 설명하기
   └─ page fault가 발생하는 상황 설명하기
```

---

### 시나리오 3: 문서 속 특정 개념 학습

사용자가 문서 기반 트리에서 `scaled dot-product attention` 노드를 클릭한다.

노드 상세 화면은 다음 정보를 보여준다.

1. 개념 설명
2. 이 문서에서 왜 중요한지
3. 문서에서 등장한 위치
4. 관련 문단 요약
5. 이해에 필요한 선수지식
6. 예시 계산
7. 오개념
8. 다음 학습 노드

예시:

```text
Scaled Dot-Product Attention

이 문서에서의 역할:
Transformer의 attention 계산을 정의하는 핵심 메커니즘이다.

문서 위치:
- Section 3.2.1 Scaled Dot-Product Attention

먼저 알아야 할 개념:
- vector
- dot product
- softmax
- matrix multiplication
```

---

## 6. 문서 처리 흐름

### 6.1 전체 파이프라인

```text
파일 업로드
    ↓
파일 검증
    ↓
텍스트 추출
    ↓
문서 메타데이터 추출
    ↓
청크 분할
    ↓
섹션 구조 분석
    ↓
개념 후보 추출
    ↓
선수지식 추론
    ↓
Concept Store 매칭
    ↓
Document-Concept 관계 저장
    ↓
문서 기반 학습 트리 생성
```

---

### 6.2 파일 검증

지원 파일 형식:

```text
.pdf
.txt
.md
```

Phase 3의 우선순위는 PDF다.

파일 제한:

```text
최대 파일 크기: 20MB
최대 페이지 수: 80페이지
최대 추출 텍스트 길이: 120,000자
```

제한을 두는 이유는 다음과 같다.

1. LLM 입력 비용을 통제하기 위해서
2. 긴 문서에서 트리 품질이 떨어지는 것을 막기 위해서
3. MVP 단계에서 처리 실패 가능성을 줄이기 위해서

---

### 6.3 텍스트 추출

PDF 텍스트 추출은 가능한 한 OCR 없이 수행한다.

우선순위:

```text
1. PDF 내장 텍스트 추출
2. 페이지별 텍스트 추출
3. 실패 시 사용자에게 텍스트 추출 불가 안내
```

Phase 3에서는 스캔본 PDF OCR을 필수 기능으로 넣지 않는다.

텍스트 추출 결과는 페이지 번호와 함께 저장한다.

```json
{
  "page_number": 5,
  "text": "The Transformer allows for significantly more parallelization..."
}
```

---

### 6.4 청크 분할

긴 문서는 LLM이 한 번에 안정적으로 처리하기 어렵다.
따라서 문서를 청크 단위로 분할한다.

청크 기준:

```text
1. 섹션 제목 기준 분할
2. 페이지 기준 분할
3. 문단 기준 분할
4. 최대 토큰 수 기준 분할
```

권장 청크 크기:

```text
청크 크기: 800~1,500 tokens
overlap: 100~200 tokens
```

각 청크는 다음 정보를 가진다.

```json
{
  "chunk_id": "uuid",
  "document_id": "uuid",
  "page_start": 3,
  "page_end": 4,
  "section_title": "Model Architecture",
  "text": "..."
}
```

---

## 7. 문서 기반 개념 추출

### 7.1 개념 추출 대상

문서에서 추출할 개념은 다음으로 나눈다.

| 유형 | 의미 | 예시 |
|---|---|---|
| document_topic | 문서 전체의 중심 주제 | Transformer |
| prerequisite | 문서 이해에 필요한 선수지식 | softmax, dot product |
| document_core | 문서에서 직접 설명하는 핵심 개념 | multi-head attention |
| method | 문서에서 제안하는 방법 | scaled dot-product attention |
| background | 이해를 돕는 배경 개념 | RNN, sequence modeling |
| misconception | 자주 오해할 수 있는 내용 | attention은 단순 검색이 아니다 |
| evaluation | 실험, 지표, 평가 개념 | BLEU score |

Phase 3에서는 `document_topic`, `prerequisite`, `document_core`, `background`, `misconception`을 우선 구현한다.

---

### 7.2 개념 추출 방식

문서 전체를 한 번에 LLM에 넣지 않는다.

권장 방식:

```text
1. 각 청크에서 개념 후보 추출
2. 개념 후보를 통합
3. 중복 후보 제거
4. 문서 전체 기준으로 중요도 평가
5. 선수지식과 문서 핵심 개념으로 분류
6. Concept Store와 매칭
```

---

### 7.3 개념 후보 스키마

```json
{
  "canonical_title": "Multi-Head Attention",
  "aliases": ["multi-head self-attention"],
  "type": "document_core",
  "short_description": "여러 attention head를 병렬로 사용해 서로 다른 표현 공간에서 정보를 보는 방식",
  "importance": 5,
  "difficulty": 4,
  "evidence": [
    {
      "chunk_id": "uuid",
      "page_start": 4,
      "page_end": 5,
      "section_title": "Multi-Head Attention",
      "quote": "Multi-head attention allows the model to jointly attend to information..."
    }
  ]
}
```

`importance`는 문서에서의 중요도를 나타내며 1~5 범위로 둔다.
`difficulty`는 학습 난이도를 나타내며 1~5 범위로 둔다.

---

## 8. Concept Store와의 연결

Phase 3는 Phase 2에서 만든 Concept Store를 적극적으로 사용한다.

### 8.1 연결 흐름

```text
문서 개념 후보
    ↓
normalized_title 검색
    ↓
alias 검색
    ↓
domain 기반 유사 검색
    ↓
기존 Concept 재사용 또는 새 Concept 생성
    ↓
document_concepts에 출처 연결 저장
```

---

### 8.2 새 Concept 생성 기준

다음 경우 새 Concept을 생성한다.

1. 기존 Concept과 title, alias가 일치하지 않는다.
2. 같은 이름의 개념이 있어도 domain이나 의미가 다르다.
3. 문서에서 중요한 개념인데 기존 Store에 없다.
4. 기존 Concept과 관련은 있지만 동일 개념은 아니다.

예시:

```text
기존 Concept: Attention
문서 추출 개념: Multi-Head Attention
처리: 새 Concept 생성 후 part_of 또는 related 관계로 연결
```

---

### 8.3 기존 Concept 재사용 기준

다음 경우 기존 Concept을 재사용한다.

1. normalized_title이 같다.
2. alias가 일치한다.
3. 같은 domain에서 의미가 동일하다.
4. LLM 동일성 판정 결과 `same_concept`이고 confidence가 충분히 높다.

예시:

```text
문서 개념: 소프트맥스
기존 Concept: Softmax
처리: 기존 Concept 재사용, alias에 소프트맥스 추가
```

---

## 9. 출처 연결 정책

Phase 3부터는 각 Concept이 문서의 어느 부분에서 등장했는지 저장해야 한다.

출처 연결의 목적은 다음이다.

1. 사용자가 설명을 신뢰할 수 있게 한다.
2. 개념이 문서에 실제로 등장했는지 확인할 수 있게 한다.
3. 노드 상세 화면에서 관련 문단을 보여줄 수 있게 한다.
4. 이후 RAG 기반 질의응답으로 확장할 수 있게 한다.

---

### 9.1 출처 정보 단위

출처는 최소한 다음 정보를 포함한다.

```text
document_id
chunk_id
page_start
page_end
section_title
snippet
```

예시:

```json
{
  "document_id": "uuid",
  "chunk_id": "uuid",
  "page_start": 4,
  "page_end": 5,
  "section_title": "Scaled Dot-Product Attention",
  "snippet": "We call our particular attention 'Scaled Dot-Product Attention'..."
}
```

---

### 9.2 출처 신뢰도

LLM이 추론한 선수지식은 문서에 직접 등장하지 않을 수 있다.

따라서 출처 유형을 분리한다.

| source_type | 의미 | 예시 |
|---|---|---|
| explicit | 문서에 직접 등장 | softmax |
| inferred | 문서 이해를 위해 필요하다고 추론 | vector, dot product |
| generated | AI가 설명이나 예시로 생성 | 비유, 퀴즈 |

사용자에게도 이 차이를 구분해서 보여주는 것이 좋다.

예시:

```text
Softmax: 문서에 직접 등장한 개념
Vector: 문서 이해를 위해 필요한 선수지식
```

---

## 10. 데이터 모델

Phase 3에서는 문서 관련 테이블을 추가한다.

### 10.1 documents

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  page_count INT,
  extracted_text_length INT,
  processing_status TEXT NOT NULL DEFAULT 'uploaded',
  processing_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

`processing_status` 값:

```text
uploaded
text_extracted
chunked
concepts_extracted
tree_generated
failed
```

---

### 10.2 document_pages

```sql
CREATE TABLE document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (document_id, page_number)
);
```

---

### 10.3 document_chunks

```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_start INT,
  page_end INT,
  section_title TEXT,
  text TEXT NOT NULL,
  token_count INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);
```

---

### 10.4 document_concepts

```sql
CREATE TABLE document_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  concept_title TEXT NOT NULL,
  concept_type TEXT NOT NULL,
  importance INT,
  difficulty INT,
  source_type TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (document_id, concept_id, concept_type)
);
```

`concept_type` 값:

```text
document_topic
prerequisite
document_core
method
background
misconception
evaluation
```

`source_type` 값:

```text
explicit
inferred
generated
```

---

### 10.5 document_learning_trees

문서와 생성된 학습 트리를 연결한다.

```sql
CREATE TABLE document_learning_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  tree_id UUID REFERENCES learning_trees(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (document_id, tree_id)
);
```

---

## 11. LLM 출력 스키마

### 11.1 청크별 개념 추출 응답

```json
{
  "document_id": "uuid",
  "chunk_id": "uuid",
  "section_title": "Model Architecture",
  "concept_candidates": [
    {
      "canonical_title": "Multi-Head Attention",
      "aliases": ["multi-head self-attention"],
      "type": "document_core",
      "short_description": "여러 attention head를 병렬로 사용해 서로 다른 표현 공간에서 정보를 보는 방식",
      "importance": 5,
      "difficulty": 4,
      "source_type": "explicit",
      "evidence_snippet": "Multi-head attention allows the model to jointly attend to information..."
    }
  ]
}
```

---

### 11.2 문서 전체 개념 통합 응답

```json
{
  "document_title": "Attention Is All You Need",
  "main_topic": "Transformer",
  "summary": "이 문서는 RNN이나 CNN 없이 attention mechanism만으로 sequence transduction을 수행하는 Transformer 구조를 제안합니다.",
  "concepts": [
    {
      "canonical_title": "Self-Attention",
      "aliases": ["intra-attention"],
      "type": "document_core",
      "importance": 5,
      "difficulty": 4,
      "source_type": "explicit",
      "evidence": [
        {
          "chunk_id": "uuid",
          "page_start": 4,
          "page_end": 5,
          "section_title": "Attention"
        }
      ]
    },
    {
      "canonical_title": "Dot Product",
      "aliases": ["inner product"],
      "type": "prerequisite",
      "importance": 4,
      "difficulty": 2,
      "source_type": "inferred",
      "evidence": []
    }
  ]
}
```

---

### 11.3 문서 기반 학습 트리 응답

```json
{
  "topic": "Attention Is All You Need 이해하기",
  "document_id": "uuid",
  "summary": "Transformer 논문을 이해하기 위한 문서 기반 선수지식 트리입니다.",
  "nodes": [
    {
      "id": "dot_product",
      "title": "Dot Product",
      "type": "prerequisite",
      "description": "두 벡터의 대응 원소를 곱한 뒤 더해 유사도나 투영 정도를 계산하는 연산입니다.",
      "difficulty": 2,
      "prerequisites": ["vector"],
      "children": ["scaled_dot_product_attention"],
      "source_type": "inferred",
      "concept_candidate": {
        "canonical_title": "Dot Product",
        "aliases": ["inner product"],
        "domain": "linear_algebra",
        "short_description": "두 벡터 사이의 유사도를 계산하는 기본 연산",
        "is_reusable": true
      }
    },
    {
      "id": "scaled_dot_product_attention",
      "title": "Scaled Dot-Product Attention",
      "type": "document_core",
      "description": "Query와 Key의 내적을 scaling한 뒤 softmax를 적용하고 Value에 가중합을 수행하는 attention 방식입니다.",
      "difficulty": 4,
      "prerequisites": ["dot_product", "softmax", "matrix_multiplication"],
      "children": ["multi_head_attention"],
      "source_type": "explicit",
      "evidence": [
        {
          "page_start": 4,
          "page_end": 5,
          "section_title": "Scaled Dot-Product Attention"
        }
      ],
      "concept_candidate": {
        "canonical_title": "Scaled Dot-Product Attention",
        "aliases": [],
        "domain": "machine_learning",
        "short_description": "Transformer에서 사용하는 attention 계산 방식",
        "is_reusable": true
      }
    }
  ],
  "edges": [
    {
      "from": "softmax",
      "to": "scaled_dot_product_attention",
      "relation_type": "prerequisite",
      "reason": "scaled dot-product attention은 attention score를 softmax로 정규화하기 때문입니다."
    }
  ],
  "recommended_order": [
    "vector",
    "dot_product",
    "softmax",
    "scaled_dot_product_attention",
    "multi_head_attention"
  ]
}
```

---

## 12. 프롬프트 설계

### 12.1 청크별 개념 추출 프롬프트

```text
You are extracting learning concepts from a document chunk.

Document title:
{{document_title}}

Chunk metadata:
{{chunk_metadata}}

Chunk text:
{{chunk_text}}

Your task is to extract concepts that are useful for building a prerequisite-aware learning tree.

Classify each concept into one of:
- document_topic
- prerequisite
- document_core
- method
- background
- misconception
- evaluation

Important:
- Extract concepts that are explicitly present in the chunk.
- Do not invent concepts that are not supported by this chunk.
- Keep evidence snippets short.
- Return valid JSON only.

JSON schema:
{
  "document_id": string,
  "chunk_id": string,
  "section_title": string,
  "concept_candidates": [
    {
      "canonical_title": string,
      "aliases": string[],
      "type": "document_topic" | "prerequisite" | "document_core" | "method" | "background" | "misconception" | "evaluation",
      "short_description": string,
      "importance": number,
      "difficulty": number,
      "source_type": "explicit",
      "evidence_snippet": string
    }
  ]
}
```

---

### 12.2 문서 전체 개념 통합 프롬프트

```text
You are consolidating concept candidates extracted from a document.

Document title:
{{document_title}}

Extracted concept candidates:
{{concept_candidates}}

Your task:
1. Merge duplicate concept candidates.
2. Identify the main topic of the document.
3. Separate document-core concepts from prerequisites.
4. Infer missing prerequisite concepts only when they are necessary to understand the document.
5. Do not over-generate.

Important:
- Concepts directly found in the document should have source_type = explicit.
- Concepts inferred as prerequisites should have source_type = inferred.
- Do not mark inferred concepts as directly supported by the document.
- Return valid JSON only.

JSON schema:
{
  "document_title": string,
  "main_topic": string,
  "summary": string,
  "concepts": [
    {
      "canonical_title": string,
      "aliases": string[],
      "type": "document_topic" | "prerequisite" | "document_core" | "method" | "background" | "misconception" | "evaluation",
      "importance": number,
      "difficulty": number,
      "source_type": "explicit" | "inferred",
      "evidence": [
        {
          "chunk_id": string,
          "page_start": number,
          "page_end": number,
          "section_title": string
        }
      ]
    }
  ]
}
```

---

### 12.3 문서 기반 학습 트리 생성 프롬프트

```text
You are an AI learning path designer.

The learner uploaded a document and wants to understand it.

Document title:
{{document_title}}

Document summary:
{{document_summary}}

Consolidated document concepts:
{{concepts}}

Existing matched concepts:
{{matched_concepts}}

Your task is to generate a prerequisite-aware learning tree for understanding this document.

Requirements:
- The tree should help the learner understand the document, not merely summarize it.
- Put inferred prerequisites before document-core concepts.
- Clearly distinguish explicit document concepts from inferred prerequisites.
- Use source evidence only for concepts that appeared in the document.
- Keep node count between 10 and 25.
- Return valid JSON only.

JSON schema:
{
  "topic": string,
  "document_id": string,
  "summary": string,
  "nodes": [
    {
      "id": string,
      "title": string,
      "type": "prerequisite" | "document_core" | "supplementary" | "misconception" | "quiz",
      "description": string,
      "difficulty": number,
      "prerequisites": string[],
      "children": string[],
      "source_type": "explicit" | "inferred" | "generated",
      "evidence": [
        {
          "page_start": number,
          "page_end": number,
          "section_title": string
        }
      ],
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

### 12.4 문서 기반 노드 설명 프롬프트

```text
You are an AI tutor helping a student understand a document.

Document title:
{{document_title}}

Selected concept:
{{concept_title}}

Concept source type:
{{source_type}}

Relevant document evidence:
{{evidence_text}}

Known prerequisites:
{{prerequisites}}

Generate a beginner-friendly explanation of this concept in the context of the document.

Requirements:
- Explain why this concept matters for understanding the document.
- If evidence exists, summarize the relevant document part.
- If the concept is inferred, clearly state that it is a prerequisite needed to understand the document.
- Provide a concrete example.
- Include common misconceptions.
- Include short check questions.
- Recommend next nodes.
- Return valid JSON only.

JSON schema:
{
  "node_id": string,
  "title": string,
  "source_type": "explicit" | "inferred" | "generated",
  "why_it_matters_for_document": string,
  "document_context_summary": string,
  "easy_explanation": string,
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

## 13. API 명세

### POST /api/documents/upload

문서를 업로드한다.

Request:

```text
multipart/form-data
file: PDF, TXT, MD
```

Response:

```json
{
  "document_id": "uuid",
  "filename": "attention_is_all_you_need.pdf",
  "processing_status": "uploaded"
}
```

---

### POST /api/documents/:documentId/process

문서 텍스트 추출, 청크 분할, 개념 추출을 실행한다.

Request:

```json
{
  "generate_tree": true
}
```

Response:

```json
{
  "document_id": "uuid",
  "processing_status": "tree_generated",
  "tree_id": "uuid"
}
```

---

### GET /api/documents/:documentId

문서 정보를 조회한다.

Response:

```json
{
  "document_id": "uuid",
  "title": "Attention Is All You Need",
  "original_filename": "attention.pdf",
  "file_type": "pdf",
  "page_count": 15,
  "processing_status": "tree_generated",
  "created_at": "2026-05-04T00:00:00Z"
}
```

---

### GET /api/documents/:documentId/concepts

문서에서 추출된 개념 목록을 조회한다.

Response:

```json
{
  "document_id": "uuid",
  "concepts": [
    {
      "concept_id": "uuid",
      "concept_title": "Multi-Head Attention",
      "concept_type": "document_core",
      "importance": 5,
      "difficulty": 4,
      "source_type": "explicit",
      "evidence_count": 2
    }
  ]
}
```

---

### GET /api/documents/:documentId/tree

문서 기반 학습 트리를 조회한다.

Response:

```json
{
  "document_id": "uuid",
  "tree_id": "uuid",
  "topic": "Attention Is All You Need 이해하기",
  "nodes": []
}
```

---

### GET /api/document-concepts/:documentConceptId/evidence

특정 문서 개념의 출처 정보를 조회한다.

Response:

```json
{
  "document_concept_id": "uuid",
  "concept_title": "Scaled Dot-Product Attention",
  "evidence": [
    {
      "page_start": 4,
      "page_end": 5,
      "section_title": "Scaled Dot-Product Attention",
      "snippet": "We call our particular attention 'Scaled Dot-Product Attention'..."
    }
  ]
}
```

---

## 14. UI 요구사항

### 14.1 문서 업로드 화면

필수 요소:

1. 파일 업로드 영역
2. 지원 형식 안내
3. 파일 크기 제한 안내
4. 처리 시작 버튼
5. 처리 상태 표시

상태 표시 예시:

```text
파일 업로드 완료
텍스트 추출 중
문서 구조 분석 중
개념 추출 중
학습 트리 생성 중
완료
```

---

### 14.2 문서 분석 결과 화면

문서 처리 완료 후 다음 정보를 보여준다.

1. 문서 제목
2. 문서 요약
3. 추출된 핵심 개념 목록
4. 추론된 선수지식 목록
5. 생성된 학습 트리로 이동 버튼

예시:

```text
문서 제목: Attention Is All You Need
핵심 주제: Transformer

문서 핵심 개념:
- Scaled Dot-Product Attention
- Multi-Head Attention
- Positional Encoding
- Encoder-Decoder Architecture

필요한 선수지식:
- Vector
- Matrix Multiplication
- Dot Product
- Softmax
```

---

### 14.3 문서 기반 트리 화면

기존 트리 화면에 다음 정보가 추가된다.

1. 노드가 문서에 직접 등장했는지 여부
2. 노드가 AI가 추론한 선수지식인지 여부
3. 관련 문서 위치
4. 문서 원문 보기 버튼

표시 예시:

```text
Scaled Dot-Product Attention
- 문서 핵심 개념
- 출처: Section 3.2.1, p.4

Softmax
- 선수지식
- 문서에 직접 등장

Dot Product
- 선수지식
- 문서 이해를 위해 추론됨
```

---

### 14.4 노드 상세 화면

문서 기반 노드 상세 화면에는 다음이 포함되어야 한다.

1. 개념 설명
2. 이 문서에서의 역할
3. 관련 문서 문단 요약
4. 출처 페이지 및 섹션
5. 선수지식
6. 예시
7. 오개념
8. 이해 점검 질문
9. 다음 추천 노드

---

## 15. 추천 로직 변경

Phase 3에서는 문서 기반 정보가 추천 로직에 추가된다.

추천 우선순위:

| 우선순위 | 대상 |
|---|---|
| 1 | 모르는 inferred prerequisite |
| 2 | 모르는 explicit prerequisite |
| 3 | 중요도 높은 document_core |
| 4 | document_core와 연결된 오개념 |
| 5 | 문서 이해 점검 질문 |

문서 기반 추천에서는 `importance`를 함께 고려한다.

```pseudo
function recommendDocumentLearningNodes(tree, progress):
    inferred_unknown_prereq = nodes where source_type == inferred and type == prerequisite and status == unknown
    if inferred_unknown_prereq is not empty:
        return sortByDifficulty(inferred_unknown_prereq)

    explicit_unknown_prereq = nodes where source_type == explicit and type == prerequisite and status == unknown
    if explicit_unknown_prereq is not empty:
        return sortByImportanceThenDifficulty(explicit_unknown_prereq)

    core_ready = nodes where type == document_core and prerequisitesSatisfied(node)
    if core_ready is not empty:
        return sortByImportance(core_ready)

    misconception_ready = nodes where type == misconception and relatedCoreConceptLearned(node)
    if misconception_ready is not empty:
        return misconception_ready

    return quiz_nodes
```

---

## 16. 오류 처리 정책

### 16.1 텍스트 추출 실패

상황:

```text
스캔본 PDF이거나 텍스트 추출이 불가능한 경우
```

처리:

```text
이 PDF에서는 텍스트를 추출할 수 없습니다.
텍스트가 포함된 PDF, TXT, MD 파일을 업로드해 주세요.
```

Phase 3에서는 OCR을 필수로 구현하지 않는다.

---

### 16.2 문서가 너무 긴 경우

상황:

```text
페이지 수 또는 텍스트 길이가 제한을 초과한 경우
```

처리:

```text
문서가 너무 깁니다.
Phase 3에서는 최대 80페이지 또는 120,000자까지 지원합니다.
중요한 챕터나 섹션만 분리해서 업로드해 주세요.
```

---

### 16.3 개념 추출 품질이 낮은 경우

상황:

```text
문서에서 의미 있는 개념을 충분히 추출하지 못한 경우
```

처리:

```text
이 문서에서 충분한 학습 개념을 추출하지 못했습니다.
문서 품질을 확인하거나 다른 자료를 업로드해 주세요.
```

---

### 16.4 LLM JSON 파싱 실패

처리:

1. LLM 응답 재요청
2. JSON repair 시도
3. 그래도 실패하면 사용자에게 실패 안내
4. 실패 로그 저장

---

## 17. 품질 기준

Phase 3의 성공 여부는 문서가 단순 요약되는지가 아니라, 실제 학습 경로로 변환되는지로 판단한다.

### 기능 검증 기준

1. PDF 또는 텍스트 문서를 업로드할 수 있다.
2. 문서에서 텍스트를 추출할 수 있다.
3. 문서를 청크로 나눌 수 있다.
4. 청크별 개념 후보를 추출할 수 있다.
5. 문서 전체 개념을 통합할 수 있다.
6. 기존 Concept Store와 매칭할 수 있다.
7. 문서 기반 학습 트리를 생성할 수 있다.
8. 각 개념에 출처 정보를 연결할 수 있다.
9. 노드 상세 화면에서 문서 맥락 설명을 제공할 수 있다.

### 품질 검증 기준

1. 문서에 직접 등장한 개념과 AI가 추론한 선수지식을 구분해야 한다.
2. 핵심 개념이 누락되지 않아야 한다.
3. 관련은 있지만 중요하지 않은 개념을 과도하게 추가하지 않아야 한다.
4. 선수지식이 문서 핵심 개념보다 먼저 배치되어야 한다.
5. 출처 정보가 실제 문서 위치와 맞아야 한다.
6. 노드 설명은 문서 맥락에 맞아야 한다.
7. 학습 트리가 단순 목차나 요약이 아니라 학습 순서를 제공해야 한다.

---

## 18. 최소 품질 기준

하나의 문서에 대해 다음 결과가 나오면 Phase 3 MVP로 인정한다.

```text
지원 입력: PDF, TXT, MD
문서 처리 가능 범위: 최대 80페이지
추출 개념 수: 10~40개
학습 트리 노드 수: 10~25개
선수지식 노드: 3개 이상
문서 핵심 개념 노드: 5개 이상
출처 연결된 개념: 5개 이상
문서에 직접 등장한 개념과 추론된 선수지식 구분 가능
노드 상세 설명에 문서 맥락 포함
```

---

## 19. 테스트 케이스

### 테스트 케이스 1: Transformer 논문

입력:

```text
Attention Is All You Need.pdf
```

기대 문서 핵심 개념:

```text
Transformer
Scaled Dot-Product Attention
Multi-Head Attention
Positional Encoding
Encoder
Decoder
Feed-Forward Network
```

기대 선수지식:

```text
Vector
Matrix Multiplication
Dot Product
Softmax
Sequence Modeling
Neural Network Basics
```

검증 포인트:

```text
문서 핵심 개념과 선수지식이 구분되는가?
Scaled Dot-Product Attention에 출처가 연결되는가?
Softmax가 기존 Concept으로 재사용되는가?
```

---

### 테스트 케이스 2: 운영체제 가상 메모리 강의자료

입력:

```text
virtual_memory_lecture.pdf
```

기대 문서 핵심 개념:

```text
Virtual Address
Physical Address
Page Table
TLB
Page Fault
Demand Paging
```

기대 선수지식:

```text
Process
Address
Memory
Page
CPU
```

검증 포인트:

```text
가상 메모리의 핵심 개념이 문서 기반으로 추출되는가?
Page와 Page Fault를 같은 개념으로 잘못 병합하지 않는가?
선수지식이 먼저 추천되는가?
```

---

### 테스트 케이스 3: Rust lifetime 강의 노트

입력:

```text
rust_lifetime_note.md
```

기대 문서 핵심 개념:

```text
Lifetime
Lifetime Annotation
Lifetime Elision
Borrow Checker
Dangling Reference
```

기대 선수지식:

```text
Ownership
Borrowing
Reference
Scope
```

검증 포인트:

```text
기존 Rust 관련 Concept이 재사용되는가?
Lifetime과 Borrowing을 동일 개념으로 병합하지 않는가?
문서 기반 설명에서 코드 예시가 제공되는가?
```

---

## 20. 구현 우선순위

### 1순위

1. 문서 업로드 API
2. PDF 텍스트 추출
3. document, document_pages, document_chunks 테이블 생성
4. 청크 분할 로직
5. 청크별 개념 추출 LLM 호출
6. 문서 전체 개념 통합

### 2순위

1. Concept Store 매칭
2. document_concepts 저장
3. 문서 기반 학습 트리 생성
4. document_learning_trees 연결
5. 문서 기반 트리 조회 화면
6. 출처 표시

### 3순위

1. 문서 기반 노드 상세 설명
2. 문서 원문 snippet 표시
3. 처리 상태 UI
4. 오류 처리 개선
5. 개념 추출 품질 개선
6. 긴 문서 처리 최적화

---

## 21. 보안 및 개인정보 고려

Phase 3부터 사용자가 직접 파일을 업로드하므로 최소한의 보안 처리가 필요하다.

필수 처리:

1. 허용된 파일 확장자만 업로드 가능하게 한다.
2. 파일 크기 제한을 둔다.
3. 실행 가능한 파일 업로드를 막는다.
4. 파일명은 그대로 저장하지 않고 서버 내부 파일명은 UUID 기반으로 저장한다.
5. 사용자별 문서 접근 권한을 확인한다.
6. 업로드된 문서는 해당 사용자만 접근할 수 있어야 한다.
7. LLM API로 전송되는 텍스트 범위를 명확히 제한한다.

주의사항:

```text
사용자가 업로드한 문서에는 강의자료, 논문, 개인 노트가 포함될 수 있다.
따라서 문서 접근 권한과 저장 정책을 명확히 해야 한다.
```

---

## 22. Phase 3 완료 조건

Phase 3는 다음 조건을 만족하면 완료로 본다.

1. 사용자가 PDF, TXT, MD 문서를 업로드할 수 있다.
2. PDF에서 텍스트를 추출할 수 있다.
3. 문서를 청크 단위로 나눌 수 있다.
4. 문서에서 주요 개념을 추출할 수 있다.
5. 문서 이해에 필요한 선수지식을 추론할 수 있다.
6. 추출된 개념을 기존 Concept Store와 연결할 수 있다.
7. 새 개념은 Concept Node로 저장된다.
8. 문서 기반 학습 트리가 생성된다.
9. 문서에 직접 등장한 개념과 추론된 선수지식을 구분할 수 있다.
10. 핵심 개념에는 문서 출처가 연결된다.
11. 사용자는 문서 기반 트리를 따라 학습할 수 있다.
12. 최소 3개 테스트 문서에서 안정적으로 동작한다.

---

## 23. Phase 3의 핵심 판단 기준

Phase 3에서 검증해야 할 핵심은 다음이다.

> RootMap이 업로드된 문서를 단순 요약하는 것이 아니라, 학습 가능한 선수지식 트리로 변환할 수 있는가?

성공적인 결과는 다음과 같아야 한다.

```text
이 문서가 무엇을 말하는지 알 수 있다.
이 문서를 이해하려면 무엇을 먼저 알아야 하는지 알 수 있다.
문서 핵심 개념과 배경 개념이 구분된다.
각 개념이 문서 어디에 등장하는지 확인할 수 있다.
기존에 배운 개념이 새 문서 이해에 어떻게 연결되는지 알 수 있다.
```

반대로 다음과 같은 결과가 나오면 Phase 3는 실패다.

```text
문서 목차만 그대로 보여준다.
문서 요약만 제공한다.
관련 개념을 무작위로 많이 나열한다.
선수지식과 문서 핵심 개념을 구분하지 못한다.
출처 없는 설명만 생성한다.
기존 Concept Store와 연결되지 않는다.
```

RootMap의 차별점은 문서 기반 RAG 챗봇이 되는 것이 아니라, 문서를 학습 순서가 있는 개념 구조로 재구성하는 데 있다.

