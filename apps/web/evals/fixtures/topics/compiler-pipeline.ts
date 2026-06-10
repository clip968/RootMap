// 골든 주제 픽스처: 컴파일러 파이프라인
import type { TreeEvalFixture } from "@/lib/evaluation/tree-eval";

export const compilerPipelineFixture: TreeEvalFixture = {
  topic: "컴파일러 파이프라인",
  expected_concepts: [
    "lexical analysis",
    "token",
    "parsing",
    "abstract syntax tree",
    "semantic analysis",
    "intermediate representation",
    "code generation",
    "optimization",
    "symbol table",
    "grammar",
  ],
  required_edges: [
    {
      from: "lexical analysis",
      to: "parsing",
      reason: "어휘 분석 결과(토큰)를 받아 구문 분석을 한다",
    },
    {
      from: "token",
      to: "parsing",
      reason: "토큰이 있어야 파싱이 가능하다",
    },
    {
      from: "parsing",
      to: "abstract syntax tree",
      reason: "구문 분석이 추상 구문 트리를 만든다",
    },
    {
      from: "abstract syntax tree",
      to: "semantic analysis",
      reason: "AST 위에서 의미 분석을 수행한다",
    },
    {
      from: "intermediate representation",
      to: "code generation",
      reason: "IR을 입력으로 코드 생성을 한다",
    },
  ],
  forbidden_edges: [
    {
      from: "parsing",
      to: "lexical analysis",
      reason: "어휘 분석이 구문 분석의 선수이지 그 반대가 아니다",
    },
    {
      from: "code generation",
      to: "intermediate representation",
      reason: "IR이 코드 생성의 선수다",
    },
  ],
  beginner_misconceptions: [
    "파싱과 어휘 분석을 같은 단계로 본다",
    "최적화가 항상 코드 생성 전에만 일어난다고 생각한다",
  ],
  required_examples: [
    "소스 문자열을 토큰 스트림으로 분해하는 예",
    "표현식을 AST로 만든 뒤 IR로 낮추는 예",
  ],
};
