import type { TreeGraphVisualBlock } from "@/lib/visualization/visual-block-schema";

interface TreeGraphDiagramProps {
  block: TreeGraphVisualBlock;
}

export function TreeGraphDiagram({ block }: TreeGraphDiagramProps) {
  const nodeIds = new Set(block.nodes.map((node) => node.id));
  if (block.nodes.length === 0 || block.edges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))) {
    return null;
  }

  if (block.nodes.length > 12) {
    return (
      <div className="visual-block-diagram tree-graph-diagram">
        <p className="visual-block-sr-summary">{treeGraphSummary(block)}</p>
        <div className="tree-graph-compact-list">
          {block.nodes.map((node) => (
            <span key={node.id}>{node.label}</span>
          ))}
        </div>
        <EdgeList block={block} />
      </div>
    );
  }

  return (
    <div className="visual-block-diagram tree-graph-diagram">
      <p className="visual-block-sr-summary">{treeGraphSummary(block)}</p>
      <div className="tree-graph-levels">
        {treeGraphLevels(block).map((level, index) => (
          <div className="tree-graph-level" key={`level-${index}`}>
            {level.map((node) => (
              <span className="tree-graph-node" key={node.id}>
                {node.label}
              </span>
            ))}
          </div>
        ))}
      </div>
      <EdgeList block={block} />
    </div>
  );
}

function treeGraphSummary(block: TreeGraphVisualBlock): string {
  return `${block.title}: 노드 ${block.nodes.length}개와 연결 ${block.edges.length}개로 구성된 그래프입니다.`;
}

function EdgeList({ block }: { block: TreeGraphVisualBlock }) {
  const labelById = new Map(block.nodes.map((node) => [node.id, node.label]));

  if (block.edges.length === 0) {
    return <p className="tree-graph-empty-edge">연결 없이 개별 노드로 구성됩니다.</p>;
  }

  return (
    <ul className="tree-graph-edges">
      {block.edges.map((edge, index) => (
        <li key={`${edge.from}-${edge.to}-${index}`}>
          <span>{labelById.get(edge.from) ?? edge.from}</span>
          <strong>→</strong>
          <span>{labelById.get(edge.to) ?? edge.to}</span>
          {edge.label ? <em>{edge.label}</em> : null}
        </li>
      ))}
    </ul>
  );
}

function treeGraphLevels(block: TreeGraphVisualBlock): TreeGraphVisualBlock["nodes"][] {
  const childrenById = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const edge of block.edges) {
    childrenById.set(edge.from, [...(childrenById.get(edge.from) ?? []), edge.to]);
    incoming.add(edge.to);
  }

  const nodeById = new Map(block.nodes.map((node) => [node.id, node]));
  const roots = block.nodes.filter((node) => !incoming.has(node.id));
  const queue = roots.length ? roots.map((node) => ({ id: node.id, level: 0 })) : [{ id: block.nodes[0].id, level: 0 }];
  const visited = new Set<string>();
  const levels: TreeGraphVisualBlock["nodes"][] = [];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (!current || visited.has(current.id)) continue;
    const node = nodeById.get(current.id);
    if (!node) continue;
    visited.add(current.id);
    levels[current.level] = [...(levels[current.level] ?? []), node];
    for (const childId of childrenById.get(current.id) ?? []) {
      queue.push({ id: childId, level: current.level + 1 });
    }
  }

  const unvisited = block.nodes.filter((node) => !visited.has(node.id));
  return unvisited.length ? [...levels.filter(Boolean), unvisited] : levels.filter(Boolean);
}
