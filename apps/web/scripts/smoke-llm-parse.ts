/**
 * LLM 파싱·Zod 검증 스모크(API 호출 없음)
 */
import {
  parseLearningTreeResponse,
  stripLlmFences,
} from "../src/lib/llm/parse";
import { learningTreeQualityWarnings } from "../src/lib/llm/schemas";

const fixture = `
Here you go:
\`\`\`json
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
      "children": ["borrowing"]
    },
    {
      "id": "borrowing",
      "title": "Borrowing",
      "type": "prerequisite",
      "description": "값의 소유권을 넘기지 않고 참조를 통해 빌려 쓰는 방식입니다.",
      "difficulty": 3,
      "prerequisites": ["ownership"],
      "children": []
    },
    {
      "id": "core1",
      "title": "Core 1",
      "type": "core",
      "description": "c",
      "difficulty": 2,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "core2",
      "title": "Core 2",
      "type": "core",
      "description": "c",
      "difficulty": 2,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "core3",
      "title": "Core 3",
      "type": "core",
      "description": "c",
      "difficulty": 2,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "pre2",
      "title": "Pre 2",
      "type": "prerequisite",
      "description": "p",
      "difficulty": 1,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "pre3",
      "title": "Pre 3",
      "type": "prerequisite",
      "description": "p",
      "difficulty": 1,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "sup1",
      "title": "Sup",
      "type": "supplementary",
      "description": "s",
      "difficulty": 1,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "mis1",
      "title": "Mis",
      "type": "misconception",
      "description": "m",
      "difficulty": 1,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "quiz1",
      "title": "Quiz 1",
      "type": "quiz",
      "description": "q",
      "difficulty": 1,
      "prerequisites": [],
      "children": []
    },
    {
      "id": "quiz2",
      "title": "Quiz 2",
      "type": "quiz",
      "description": "q",
      "difficulty": 1,
      "prerequisites": [],
      "children": []
    }
  ],
  "recommended_order": [
    "ownership", "pre2", "pre3", "borrowing", "core1", "core2", "core3",
    "sup1", "mis1", "quiz1", "quiz2"
  ]
}
\`\`\`
`;

const stripped = stripLlmFences(fixture);
if (!stripped.includes('"topic"')) throw new Error("stripLlmFences");

const tree = parseLearningTreeResponse(fixture);
const warnings = learningTreeQualityWarnings(tree, "Rust lifetime");
if (warnings.length > 0) {
  console.error(warnings);
  throw new Error("unexpected quality warnings");
}

console.log("llm:smoke-parse OK");
