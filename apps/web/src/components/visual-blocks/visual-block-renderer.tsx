import type { VisualBlock } from "@/lib/visualization/visual-block-schema";
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
  return (
    <article className="visual-block-card">
      <div className="visual-block-title">
        <span>{VISUAL_BLOCK_LABEL[block.type]}</span>
        <h3>{block.title}</h3>
      </div>
      <VisualBlockDiagram block={block} />
      <VisualBlockAnnotations annotations={block.annotations} />
    </article>
  );
}

function VisualBlockDiagram({ block }: { block: VisualBlock }) {
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
