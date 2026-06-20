import type { WorkedExampleVisualBlock } from "@/lib/visualization/visual-block-schema";

interface WorkedExampleDiagramProps {
  block: WorkedExampleVisualBlock;
}

/**
 * Phase 17: worked_example 렌더러.
 *
 * "문제 → 단계별 풀이 → 최종 답 → 자주 하는 실수" 순서로 학습자가 풀이 과정을
 * 따라갈 수 있게 보여준다. 단계에는 번호를 붙이고, 중간 계산값(intermediate_value)이
 * 있으면 강조 표시하며 없으면 생략한다. common_mistake는 Phase 14 오개념 자산과
 * 톤을 맞춰 "자주 하는 실수" 영역으로 분리한다.
 */
export function WorkedExampleDiagram({ block }: WorkedExampleDiagramProps) {
  // 단계가 하나도 없으면 풀이로서 의미가 없으므로 렌더하지 않는다(상위에서 fallback 처리).
  if (block.steps.length === 0) return null;

  return (
    <div className="visual-block-diagram worked-example-diagram">
      {/* 1. 풀이 대상 문제 */}
      <div className="worked-example-problem">
        <span className="worked-example-tag">문제</span>
        <p>{block.problem}</p>
      </div>

      {/* 2. 단계별 풀이 (번호 + 라벨 + 설명 + 선택적 중간값) */}
      <ol className="worked-example-steps">
        {block.steps.map((step, index) => (
          <li className="worked-example-step" key={`${step.label}-${index}`}>
            <span className="worked-example-index">{index + 1}</span>
            <div className="worked-example-step-body">
              <strong>{step.label}</strong>
              <p>{step.explanation}</p>
              {step.intermediate_value ? (
                <span className="worked-example-value">{step.intermediate_value}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {/* 3. 최종 답 */}
      <div className="worked-example-answer">
        <span className="worked-example-tag is-answer">최종 답</span>
        <p>{block.final_answer}</p>
      </div>

      {/* 4. 자주 하는 실수 (선택) */}
      {block.common_mistake ? (
        <div className="worked-example-mistake">
          <span className="worked-example-tag is-mistake">자주 하는 실수</span>
          <p>{block.common_mistake}</p>
        </div>
      ) : null}
    </div>
  );
}
