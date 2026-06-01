import type { LayerStackVisualBlock } from "@/lib/visualization/visual-block-schema";

interface LayerStackDiagramProps {
  block: LayerStackVisualBlock;
}

export function LayerStackDiagram({ block }: LayerStackDiagramProps) {
  if (block.layers.length === 0) return null;

  return (
    <div className="visual-block-diagram layer-stack-diagram">
      <div className="layer-stack-list" role="list">
        {block.layers.map((layer, index) => (
          <div className="layer-stack-item-wrap" key={`${layer.label}-${index}`}>
            <div className="layer-stack-item" role="listitem">
              <span>{index + 1}</span>
              <div>
                <strong>{layer.label}</strong>
                <p>{layer.description}</p>
              </div>
            </div>
            {index < block.layers.length - 1 ? (
              <div className="layer-stack-arrow" aria-hidden="true">
                아래 계층으로
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
