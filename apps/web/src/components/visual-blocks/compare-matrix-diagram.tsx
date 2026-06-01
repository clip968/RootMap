import type { CompareMatrixVisualBlock } from "@/lib/visualization/visual-block-schema";

interface CompareMatrixDiagramProps {
  block: CompareMatrixVisualBlock;
}

export function CompareMatrixDiagram({ block }: CompareMatrixDiagramProps) {
  if (
    block.columns.length === 0 ||
    block.rows.length === 0 ||
    block.rows.some((row) => row.values.length !== block.columns.length)
  ) {
    return null;
  }

  return (
    <div className="visual-block-diagram compare-matrix-diagram">
      <table className="compare-matrix-table">
        <thead>
          <tr>
            <th>기준</th>
            {block.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.criterion}>
              <th scope="row">{row.criterion}</th>
              {row.values.map((value, index) => (
                <td data-label={block.columns[index]} key={`${row.criterion}-${index}`}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
