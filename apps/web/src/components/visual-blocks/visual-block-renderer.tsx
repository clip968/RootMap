import type { VisualBlock } from "@/lib/visualization/visual-block-schema";
import { CompareMatrixDiagram } from "@/components/visual-blocks/compare-matrix-diagram";
import { FlowPipelineDiagram } from "@/components/visual-blocks/flow-pipeline-diagram";
import { LayerStackDiagram } from "@/components/visual-blocks/layer-stack-diagram";
import { LinearSpaceDiagram } from "@/components/visual-blocks/linear-space-diagram";
import { MappingTableDiagram } from "@/components/visual-blocks/mapping-table-diagram";
import { StateMachineDiagram } from "@/components/visual-blocks/state-machine-diagram";
import { TimelineDiagram } from "@/components/visual-blocks/timeline-diagram";
import { TreeGraphDiagram } from "@/components/visual-blocks/tree-graph-diagram";
import { WorkedExampleDiagram } from "@/components/visual-blocks/worked-example-diagram";
import { VisualBlockAnnotations } from "@/components/visual-blocks/visual-block-annotations";
import { VisualBlockEmptyState } from "@/components/visual-blocks/visual-block-empty-state";
import {
  validateVisualBlockForRender,
  VISUAL_BLOCK_LABEL,
  visualBlockSummaryItems,
} from "@/components/visual-blocks/visual-block-utils";

interface VisualBlockRendererProps {
  blocks?: readonly unknown[] | null;
}

export function VisualBlockRenderer({ blocks }: VisualBlockRendererProps) {
  const renderableBlocks = (blocks ?? [])
    .map(validateVisualBlockForRender)
    .filter((block): block is VisualBlock => block !== null);

  if (renderableBlocks.length === 0) {
    return <VisualBlockEmptyState />;
  }

  return (
    <section className="visual-block-list" aria-label="개념 시각 설명">
      {renderableBlocks.map((block, index) => (
        <VisualBlockCard block={block} key={`${block.type}-${block.title}-${index}`} />
      ))}
    </section>
  );
}

function VisualBlockCard({ block }: { block: VisualBlock }) {
  const diagram = renderVisualBlockDiagram(block);
  if (!diagram) return null;

  return (
    <article className="visual-block-card">
      <div className="visual-block-title">
        <span>{VISUAL_BLOCK_LABEL[block.type]}</span>
        <h3>{block.title}</h3>
      </div>
      {diagram}
      <VisualBlockAnnotations annotations={block.annotations} />
    </article>
  );
}

function renderVisualBlockDiagram(block: VisualBlock) {
  if (block.type === "linear_space") return <LinearSpaceDiagram block={block} />;
  if (block.type === "mapping_table") return <MappingTableDiagram block={block} />;
  if (block.type === "flow_pipeline") return <FlowPipelineDiagram block={block} />;
  if (block.type === "timeline") return <TimelineDiagram block={block} />;
  if (block.type === "layer_stack") return <LayerStackDiagram block={block} />;
  if (block.type === "tree_graph") return <TreeGraphDiagram block={block} />;
  if (block.type === "state_machine") return <StateMachineDiagram block={block} />;
  if (block.type === "compare_matrix") return <CompareMatrixDiagram block={block} />;
  if (block.type === "worked_example") return <WorkedExampleDiagram block={block} />;
  return <VisualBlockShellDiagram block={block} />;
}

function VisualBlockShellDiagram({ block }: { block: VisualBlock }) {
  const items = visualBlockSummaryItems(block).slice(0, 6);

  return (
    <div className="visual-block-diagram" data-visual-type={block.type}>
      <div className="visual-block-strip">
        {items.map((item) => (
          <span className="visual-block-chip" key={item}>
            {item}
          </span>
        ))}
      </div>
      <p className="visual-block-meta">{VISUAL_BLOCK_LABEL[block.type]} renderer 준비됨</p>
    </div>
  );
}
