import type { StatementPages } from './types';

// pdfjs-dist is ESM-only and this package compiles to CommonJS, so load it with a real dynamic import.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;

interface TextItem {
  str: string;
  width: number;
  transform: number[];
}

/** Bank PDFs are sometimes saved with extra leading bytes; start at the real %PDF- header. */
export function stripPdfWrapper(buffer: Buffer): Uint8Array {
  const offset = buffer.indexOf('%PDF-');
  if (offset < 0) throw new Error('El archivo no es un PDF');
  return new Uint8Array(buffer.subarray(offset));
}

/** Rebuilds visual lines from positioned text items: same y = same line, ordered left to right. */
export function itemsToLines(items: TextItem[]): string[] {
  const rows: { y: number; cells: { x: number; w: number; str: string }[] }[] = [];
  for (const item of items) {
    if (typeof item.str !== 'string' || item.str.trim() === '') continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) <= 2);
    if (!row) rows.push((row = { y, cells: [] }));
    row.cells.push({ x, w: item.width, str: item.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(row => {
    row.cells.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | null = null;
    for (const cell of row.cells) {
      if (prevEnd !== null) line += cell.x - prevEnd > 6 ? '   ' : ' ';
      line += cell.str;
      prevEnd = cell.x + cell.w;
    }
    return line.trimEnd();
  });
}

export async function extractPages(buffer: Buffer): Promise<StatementPages> {
  const { getDocument } = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: stripPdfWrapper(buffer), useSystemFonts: true, verbosity: 0 }).promise;
  const pages: StatementPages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    pages.push(itemsToLines(content.items as TextItem[]));
  }
  return pages;
}
