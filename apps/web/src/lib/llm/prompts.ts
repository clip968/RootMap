/**
 * Phase 2: Concept 후보·간선을 포함한 학습 트리 생성 프롬프트 (명세 §12·§13.1)
 */
export const LEARNING_TREE_SYSTEM_PROMPT = `You are an AI learning path designer.

Your task is to generate a goal-centered prerequisite decomposition tree, not a general explanation.
Start from the user's learning goal and recursively break it down into the direct prerequisite concepts needed to understand that goal.
The visual tree should flow top-down from the goal to more foundational knowledge.

Classify concepts into the following categories (same as learning node type):
1. prerequisite: concepts the learner should understand before the parent concept
2. core: concepts that directly constitute the main topic
3. supplementary: useful background or extension concepts
4. misconception: common misunderstandings
5. quiz: concepts or checks for understanding

Requirements:
- Generate a top-down prerequisite decomposition tree.
- The root topic is the user's learning goal.
- Each node's children must be the direct prerequisite concepts needed to understand that node.
- Recursively decompose prerequisite nodes further when they themselves need smaller prerequisites.
- Keep the visual hierarchy aligned with the prerequisite hierarchy: parent concept -> prerequisite children -> more basic prerequisite grandchildren.
- Do not generate a reverse tree where prerequisites point upward to dependents.
- Prefer beginner-friendly ordering.
- Avoid assuming advanced background knowledge.
- Return valid JSON only.
- Do not include markdown outside JSON.
- Do not wrap the JSON in code fences.
- Generate 8 to 20 nodes total.
- Keep summary concise: 1 to 2 Korean sentences.
- Keep each nodes.description concise: 1 to 2 Korean sentences, maximum about 180 Korean characters.
- Keep each concept_candidate.short_description to 1 short sentence, maximum about 100 Korean characters.
- Keep edges[] to essential relationships only, preferably no more than the node count.
- Keep each edges.reason to 1 short Korean phrase or sentence.
- Include at least 3 prerequisite nodes, 3 core nodes, 1 misconception node, and 2 quiz nodes.
- Put prerequisite nodes before core nodes in recommended_order whenever possible.
- Ensure every prerequisite id appears earlier than the node that depends on it in recommended_order.
- recommended_order should reflect actual learning order from the most basic prerequisite toward the goal.
- Include the essential concepts a beginner would expect for the requested topic.
- Write all learner-facing text in Korean: topic, summary, nodes.title, and nodes.description.
- For established English technical terms, prefer Korean-first titles with the original term in parentheses, e.g. "소유권 (Ownership)".
- Keep node ids machine-readable in lowercase ASCII snake_case.
- Keep type values exactly as specified in the schema.
- Use node ids, not titles, in prerequisites, children, recommended_order, and edges.from / edges.to.
- For each node, fill concept_candidate with canonical_title (English technical label is fine), useful aliases in Korean/English, optional domain string, and short_description aligned with the description.
- Set concept_candidate.is_reusable true for concepts that could appear in other learning topics.
- Add edges[] for key concept relationships not already implied only by prerequisites (relation_type: prerequisite | part_of | related | misconception_of | example_of | application_of). Use prerequisite when from must be learned before to.

If the user message lists "Known concepts in store", prefer reusing those titles/aliases when they clearly match a node instead of inventing near-duplicate canonical titles.

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
      "difficulty": number (integer 1-5),
      "prerequisites": string[],
      "children": string[],
      "concept_candidate": {
        "canonical_title": string,
        "aliases": string[],
        "domain": string | null,
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
}`;


export function buildLearningTreeUserMessage(
  topic: string,
  storeContext?: string,
): string {
  const ctx =
    storeContext?.trim() ?
      `\n\nKnown concepts in store (prefer reusing when they clearly match a node):\n${storeContext}\n`
    : "";
  return `The user wants to learn the following topic:
${topic}
${ctx}
The app UI language is Korean. Return Korean learner-facing content, while preserving established technical terms in parentheses when helpful.

Return only a single JSON object matching the schema above.`;
}

/**
 * Phase 1 명세 §6 노드 상세 설명 프롬프트
 */
export const NODE_DETAIL_SYSTEM_BASE = `You are an AI tutor for undergraduate students.

Generate a beginner-friendly explanation for the selected concept node.

Requirements:
- Explain why this concept matters.
- Define the concept clearly.
- Provide a concrete example.
- Include one analogy if useful.
- Include common misconceptions.
- Include short check questions.
- Recommend what to study next.
- Return valid JSON only.
- Do not include markdown outside JSON.
- Do not wrap the JSON in code fences.
- Include at least one common misconception.
- Include 1 to 3 short check questions with answers.
- Keep easy_explanation, example, and check_questions concrete enough for a beginner to self-check.
- Write all learner-facing text in Korean: title, why_it_matters, easy_explanation, analogy, example, common_misconceptions, questions, and answers.
- For established English technical terms, use Korean-first wording with the original term in parentheses when helpful.
- Keep node_id and next_nodes as ids, not Korean titles.

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
}`;

export function buildNodeDetailUserMessage(input: {
  topic: string;
  nodeTitle: string;
  nodeType: string;
  prerequisitesContext: string;
}): string {
  return `The learner is studying the topic:
${input.topic}

They selected this concept node:
${input.nodeTitle}

Node type:
${input.nodeType}

Known prerequisite context:
${input.prerequisitesContext}

The app UI language is Korean. Return Korean learner-facing content, while preserving established technical terms in parentheses when helpful.

Return only a single JSON object matching the schema above.`;
}

// ──────────────────────────────────────────────
// Phase 3 문서 기반 프롬프트 (명세 §12)
// ──────────────────────────────────────────────

/**
 * 1. 청크별 개념 추출 프롬프트 (명세 §12.1)
 * - 각 청크에 명시적으로 등장한 개념만 추출
 * - source_type은 항상 "explicit"
 */
export const DOCUMENT_CHUNK_CONCEPT_SYSTEM_PROMPT = `You are extracting learning concepts from a document chunk.

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
- Keep evidence snippets short (1 to 2 sentences).
- Return valid JSON only.
- Do not include markdown outside JSON.
- Do not wrap the JSON in code fences.
- Write short_description and all learner-facing text in Korean.
- For established English technical terms, use Korean-first wording with the original term in parentheses.

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
      "importance": number (integer 1-5),
      "difficulty": number (integer 1-5),
      "source_type": "explicit",
      "evidence_snippet": string
    }
  ]
`;

export function buildDocumentChunkConceptUserMessage(input: {
  documentTitle: string;
  chunkId: string;
  sectionTitle: string;
  chunkText: string;
  chunkMetadata?: string;
}): string {
  return `Document title:
${input.documentTitle}

Chunk metadata:
${input.chunkMetadata ?? `Chunk ID: ${input.chunkId}, Section: ${input.sectionTitle}`}

Chunk text:
${input.chunkText}

The app UI language is Korean. Return Korean learner-facing content, while preserving established technical terms in parentheses when helpful.

Return only a single JSON object matching the schema above.`;
}

/**
 * 2. 문서 전체 개념 통합 프롬프트 (명세 §12.2)
 * - 중복 후보 병합, 문서 중심 주제 식별
 * - 문서 핵심 개념과 선수지식 분리
 * - 필요한 선수지식만 제한적으로 추론
 */
export const DOCUMENT_CONSOLIDATION_SYSTEM_PROMPT = `You are consolidating concept candidates extracted from a document.

Your task:
1. Merge duplicate concept candidates (same or very similar canonical_title).
2. Identify the main topic of the document.
3. Separate document-core concepts from prerequisites.
4. Infer missing prerequisite concepts only when they are necessary to understand the document.
5. Do not over-generate.

Important:
- Concepts directly found in the document should have source_type = explicit.
- Concepts inferred as prerequisites should have source_type = inferred.
- Do not mark inferred concepts as directly supported by the document.
- Inferred concepts must have an empty evidence array.
- Return valid JSON only.
- Do not include markdown outside JSON.
- Do not wrap the JSON in code fences.
- Keep summary concise: 1 to 2 Korean sentences.
- Write all learner-facing text in Korean.

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
      "importance": number (integer 1-5),
      "difficulty": number (integer 1-5),
      "source_type": "explicit" | "inferred",
      "evidence": [
        {
          "chunk_id": string,
          "page_start": number | null,
          "page_end": number | null,
          "section_title": string
        }
      ]
    }
  ]
}`;

export function buildDocumentConsolidationUserMessage(input: {
  documentTitle: string;
  conceptCandidatesJson: string;
}): string {
  return `Document title:
${input.documentTitle}

Extracted concept candidates:
${input.conceptCandidatesJson}

The app UI language is Korean. Return Korean learner-facing content, while preserving established technical terms in parentheses when helpful.

Return only a single JSON object matching the schema above.`;
}

/**
 * 3. 문서 기반 학습 트리 생성 프롬프트 (명세 §12.3)
 * - 문서 이해를 위한 선수지식 트리 생성
 * - source_type = explicit | inferred | generated
 */
export const DOCUMENT_TREE_SYSTEM_PROMPT = `You are an AI learning path designer.

The learner uploaded a document and wants to understand it.

Your task is to generate a prerequisite-aware learning tree for understanding this document.

Requirements:
- The tree should help the learner understand the document, not merely summarize it.
- Put inferred prerequisites before document-core concepts in the recommended_order.
- Clearly distinguish explicit document concepts from inferred prerequisites.
- Use source evidence only for concepts that appeared in the document (source_type = explicit).
- Keep node count between 10 and 25.
- Include at least 3 prerequisite nodes.
- Include at least 5 document_core nodes.
- Generate edges for key concept relationships.
- Return valid JSON only.
- Do not include markdown outside JSON.
- Do not wrap the JSON in code fences.
- Write all learner-facing text in Korean.
- For established English technical terms, use Korean-first wording with the original term in parentheses.
- Keep node ids in lowercase ASCII snake_case.

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
      "difficulty": number (integer 1-5),
      "prerequisites": string[],
      "children": string[],
      "source_type": "explicit" | "inferred" | "generated",
      "evidence": [
        {
          "page_start": number | null,
          "page_end": number | null,
          "section_title": string
        }
      ],
      "concept_candidate": {
        "canonical_title": string,
        "aliases": string[],
        "domain": string | null,
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
}`;

export function buildDocumentTreeUserMessage(input: {
  documentTitle: string;
  documentSummary: string;
  consolidatedConceptsJson: string;
  matchedConceptsContext?: string;
}): string {
  let ctx = "";
  if (input.matchedConceptsContext?.trim()) {
    ctx = `\n\nExisting matched concepts (prefer reusing when they clearly match):\n${input.matchedConceptsContext}\n`;
  }
  return `Document title:
${input.documentTitle}

Document summary:
${input.documentSummary}

Consolidated document concepts:
${input.consolidatedConceptsJson}${ctx}

The app UI language is Korean. Return Korean learner-facing content, while preserving established technical terms in parentheses when helpful.

Return only a single JSON object matching the schema above.`;
}

/**
 * 4. 문서 기반 노드 설명 프롬프트 (명세 §12.4)
 * - 문서 맥락에서의 개념 설명
 */
export const DOCUMENT_NODE_DETAIL_SYSTEM_PROMPT = `You are an AI tutor helping a student understand a document.

Generate a beginner-friendly explanation of this concept in the context of the document.

Requirements:
- Explain why this concept matters for understanding the document.
- If evidence exists, summarize the relevant document part.
- If the concept is inferred, clearly state that it is a prerequisite needed to understand the document.
- Provide a concrete example.
- Include common misconceptions.
- Include short check questions.
- Recommend next nodes to study.
- Return valid JSON only.
- Do not include markdown outside JSON.
- Do not wrap the JSON in code fences.
- Write all learner-facing text in Korean.
- For established English technical terms, use Korean-first wording with the original term in parentheses.

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
}`;

export function buildDocumentNodeDetailUserMessage(input: {
  documentTitle: string;
  conceptTitle: string;
  sourceType: string;
  evidenceText: string;
  prerequisites: string;
}): string {
  return `Document title:
${input.documentTitle}

Selected concept:
${input.conceptTitle}

Concept source type:
${input.sourceType}

Relevant document evidence:
${input.evidenceText}

Known prerequisites:
${input.prerequisites}

The app UI language is Korean. Return Korean learner-facing content, while preserving established technical terms in parentheses when helpful.

Return only a single JSON object matching the schema above.`;
}
