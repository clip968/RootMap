import type { FlowPipelineVisualBlock } from "@/lib/visualization/visual-block-schema";

interface FlowPipelineDiagramProps {
  block: FlowPipelineVisualBlock;
}

export function FlowPipelineDiagram({ block }: FlowPipelineDiagramProps) {
  if (block.steps.length === 0) return null;

  return (
    <div
      className={[
        "visual-block-diagram",
        "flow-pipeline-diagram",
        block.steps.length >= 6 ? "is-compact" : "",
      ].join(" ")}
    >
      <ol className="flow-pipeline-steps">
        {block.steps.map((step, index) => (
          <li className="flow-pipeline-step" key={`${step.label}-${index}`}>
            <span className="flow-pipeline-index">{index + 1}</span>
            <div>
              {step.layer ? <span className="flow-pipeline-layer">{step.layer}</span> : null}
              <strong>{step.label}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
