import type { LinearSpaceVisualBlock } from "@/lib/visualization/visual-block-schema";

interface LinearSpaceDiagramProps {
  block: LinearSpaceVisualBlock;
}

export function LinearSpaceDiagram({ block }: LinearSpaceDiagramProps) {
  const ranges = block.highlighted_ranges
    .filter((range) => range.start >= 0 && range.length > 0)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) return null;

  const segments = buildLinearSegments(ranges, block.total_units_hint);

  return (
    <div className="visual-block-diagram linear-space-diagram">
      <div className="linear-space-meta">
        <span>단위: {block.unit}</span>
        {block.block_size_bytes ? <span>block size: {formatBytes(block.block_size_bytes)}</span> : null}
        {block.total_units_hint ? <span>전체 힌트: {block.total_units_hint}</span> : null}
      </div>

      <div className="linear-space-strip" role="list" aria-label={`${block.title} 범위`}>
        {segments.map((segment, index) =>
          segment.kind === "gap" ? (
            <span className="linear-space-gap" key={`${segment.label}-${index}`}>
              {segment.label}
            </span>
          ) : (
            <span
              className={`linear-space-range tone-${segment.tone}`}
              key={`${segment.label}-${segment.start}-${index}`}
              role="listitem"
            >
              <strong>{segment.label}</strong>
              <small>
                {segment.start}..{segment.end}
              </small>
            </span>
          ),
        )}
      </div>

      <div className="linear-space-ranges">
        {ranges.map((range, index) => {
          const startByte = block.block_size_bytes
            ? range.start * block.block_size_bytes
            : null;
          const endByte = block.block_size_bytes
            ? (range.start + range.length) * block.block_size_bytes - 1
            : null;

          return (
            <div className="linear-space-range-detail" key={`${range.label}-${range.start}`}>
              <span className={`linear-space-dot tone-${index % 4}`} aria-hidden="true" />
              <div>
                <strong>{range.label}</strong>
                <p>
                  {range.start}부터 {range.length}개 {block.unit}
                </p>
                {startByte != null && endByte != null ? (
                  <p>
                    byte offset = {range.start} * {block.block_size_bytes} ={" "}
                    {formatNumber(startByte)}, byte end = ({range.start} + {range.length}) *{" "}
                    {block.block_size_bytes} - 1 = {formatNumber(endByte)}
                  </p>
                ) : null}
                {range.note ? <p>{range.note}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type LinearSegment =
  | { kind: "gap"; label: string }
  | { kind: "range"; label: string; start: number; end: number; tone: number };

function buildLinearSegments(
  ranges: LinearSpaceVisualBlock["highlighted_ranges"],
  totalUnitsHint: number | undefined,
): LinearSegment[] {
  const segments: LinearSegment[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      segments.push({ kind: "gap", label: gapLabel(cursor, range.start - 1) });
    }

    const end = range.start + range.length - 1;
    segments.push({
      kind: "range",
      label: range.label,
      start: range.start,
      end,
      tone: index % 4,
    });
    cursor = Math.max(cursor, end + 1);
  });

  if (totalUnitsHint && cursor < totalUnitsHint) {
    segments.push({ kind: "gap", label: gapLabel(cursor, totalUnitsHint - 1) });
  }

  return segments;
}

function gapLabel(start: number, end: number): string {
  if (start === end) return String(start);
  return `${start} ... ${end}`;
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${formatNumber(value / (1024 * 1024))} MiB`;
  if (value >= 1024) return `${formatNumber(value / 1024)} KiB`;
  return `${formatNumber(value)} B`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? new Intl.NumberFormat("ko-KR").format(value)
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}
