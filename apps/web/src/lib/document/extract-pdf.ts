import fs from "node:fs/promises";

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export async function extractPdfPages(buffer: Buffer): Promise<PdfPage[]> {
  // Dynamic import avoids static bundling issues in Next.js
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: PdfPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ pageNumber: i, text });
  }

  return pages;
}

export async function readPdfFile(filePath: string): Promise<PdfPage[]> {
  const buffer = await fs.readFile(filePath);
  return extractPdfPages(buffer);
}
