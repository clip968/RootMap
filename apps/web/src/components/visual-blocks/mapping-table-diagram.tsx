import type { MappingTableVisualBlock } from "@/lib/visualization/visual-block-schema";

interface MappingTableDiagramProps {
  block: MappingTableVisualBlock;
}

export function MappingTableDiagram({ block }: MappingTableDiagramProps) {
  if (
    block.columns.length === 0 ||
    block.rows.length === 0 ||
    block.rows.some((row) => row.length !== block.columns.length)
  ) {
    return null;
  }

  return (
    <div className="visual-block-diagram mapping-table-diagram">
      <table className="mapping-table">
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`${row.join("-")}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
