import fs from "node:fs/promises";

export interface TextFilePage {
  pageNumber: number;
  text: string;
  sectionTitle?: string | null;
}

export interface TextUnit {
  text: string;
  pageNumber: number;
  sectionTitle: string | null;
}

function parseMarkdownHeadings(text: string): Array<{ level: number; title: string; index: number }> {
  const headings: Array<{ level: number; title: string; index: number }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        index: i,
      });
    }
  }
  return headings;
}

export function splitTextIntoUnits(
  text: string,
  fileType: string,
  basePageNumber = 1,
): TextUnit[] {
  const units: TextUnit[] = [];

  if (fileType === "md") {
    const headings = parseMarkdownHeadings(text);
    const lines = text.split("\n");

    if (headings.length === 0) {
      // No headings: treat as single-page text split by paragraphs
      const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      for (const para of paragraphs) {
        units.push({ text: para, pageNumber: basePageNumber, sectionTitle: null });
      }
      return units;
    }

    // Split by headings
    for (let h = 0; h < headings.length; h++) {
      const start = headings[h].index;
      const end = h + 1 < headings.length ? headings[h + 1].index : lines.length;
      const sectionLines = lines.slice(start, end);
      const sectionText = sectionLines.join("\n").trim();
      if (!sectionText) continue;

      const sectionTitle = headings[h].title;
      const paragraphs = sectionText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      for (const para of paragraphs) {
        units.push({ text: para, pageNumber: basePageNumber, sectionTitle });
      }
    }
    return units;
  }

  // TXT or fallback
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (const para of paragraphs) {
    units.push({ text: para, pageNumber: basePageNumber, sectionTitle: null });
  }
  return units;
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}
