import fs from "node:fs/promises";

export interface PdfPage {
  pageNumber: number;
  text: string;
}

class TextExtractionDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
  }

  multiplySelf(): this {
    return this;
  }

  preMultiplySelf(): this {
    return this;
  }

  translate(): this {
    return this;
  }

  scale(): this {
    return this;
  }

  invertSelf(): this {
    return this;
  }
}

function ensurePdfJsTextExtractionPolyfills(): void {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix =
      TextExtractionDOMMatrix as unknown as typeof DOMMatrix;
  }
}

export async function extractPdfPages(buffer: Buffer): Promise<PdfPage[]> {
  ensurePdfJsTextExtractionPolyfills();
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
