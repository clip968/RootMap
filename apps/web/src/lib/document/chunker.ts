import { splitTextIntoUnits, type TextUnit } from "./extract-text";

export interface ChunkInput {
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  sectionTitle: string | null;
  text: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

const MAX_CHUNK_TOKENS = 1500;
const OVERLAP_TOKENS = 150;

function estimateTokens(text: string): number {
  // Rough approximation for mixed Korean/English content
  const koreanChars = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars * 1.5 + otherChars * 0.3);
}

function getOverlapUnits(
  units: TextUnit[],
  overlapTokenBudget: number,
): TextUnit[] {
  const overlap: TextUnit[] = [];
  let tokens = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const unitTokens = estimateTokens(units[i].text);
    if (tokens + unitTokens <= overlapTokenBudget) {
      overlap.unshift(units[i]);
      tokens += unitTokens;
    } else {
      break;
    }
  }
  return overlap;
}

function buildChunk(units: TextUnit[], chunkIndex: number): ChunkInput {
  const text = units.map((u) => u.text).join("\n\n");
  const pageNumbers = units.map((u) => u.pageNumber);
  const pageStart = pageNumbers.length > 0 ? Math.min(...pageNumbers) : null;
  const pageEnd = pageNumbers.length > 0 ? Math.max(...pageNumbers) : null;

  // Use the most common non-null section title
  const titleCounts = new Map<string, number>();
  for (const u of units) {
    if (u.sectionTitle) {
      titleCounts.set(u.sectionTitle, (titleCounts.get(u.sectionTitle) || 0) + 1);
    }
  }
  let sectionTitle: string | null = null;
  let maxCount = 0;
  for (const [title, count] of titleCounts) {
    if (count > maxCount) {
      maxCount = count;
      sectionTitle = title;
    }
  }

  return {
    chunkIndex,
    pageStart,
    pageEnd,
    sectionTitle,
    text,
    tokenCount: estimateTokens(text),
    metadata: { unitCount: units.length },
  };
}

export function chunkUnits(units: TextUnit[]): ChunkInput[] {
  if (units.length === 0) return [];

  const chunks: ChunkInput[] = [];
  let current: TextUnit[] = [];
  let currentTokens = 0;

  for (const unit of units) {
    const unitTokens = estimateTokens(unit.text);

    if (currentTokens + unitTokens > MAX_CHUNK_TOKENS && current.length > 0) {
      // Finalize current chunk
      chunks.push(buildChunk(current, chunks.length));

      // Compute overlap for next chunk
      const overlap = getOverlapUnits(current, OVERLAP_TOKENS);
      current = [...overlap, unit];
      currentTokens = overlap.reduce((s, u) => s + estimateTokens(u.text), 0) + unitTokens;
    } else {
      current.push(unit);
      currentTokens += unitTokens;
    }
  }

  if (current.length > 0) {
    chunks.push(buildChunk(current, chunks.length));
  }

  // Renumber chunk indices to be sequential after overlap duplication
  return chunks.map((c, idx) => ({ ...c, chunkIndex: idx }));
}

export function chunkFromPdfPages(
  pages: Array<{ pageNumber: number; text: string }>,
): ChunkInput[] {
  // Flatten PDF pages into units (paragraphs per page)
  const units: TextUnit[] = [];
  for (const page of pages) {
    const paragraphs = page.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const para of paragraphs) {
      units.push({ text: para, pageNumber: page.pageNumber, sectionTitle: null });
    }
  }
  return chunkUnits(units);
}

export function chunkFromText(
  text: string,
  fileType: string,
  basePageNumber = 1,
): ChunkInput[] {
  const units = splitTextIntoUnits(text, fileType, basePageNumber);
  return chunkUnits(units);
}
