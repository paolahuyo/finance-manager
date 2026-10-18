#!/usr/bin/env node
/**
 * Dumps Excel sheets to text with personal data masked (same rules as mask-statement),
 * so they can be reviewed before anyone reads them. Prints only counts.
 *   node scripts/mask-excel.mjs <file.xlsx> [...] [--redact "WORD,WORD"] [--out dir]
 * Words from uploads/redact-words.txt (git-ignored) are hidden automatically.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { createMasker, readWordsFile } from './lib/mask.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const files = [];
let words = readWordsFile(resolve(here, '../../uploads/redact-words.txt'));
let outDir = resolve(here, '../../uploads/masked');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--redact') words = [...words, ...(args[++i] ?? '').split(',').map(w => w.trim()).filter(Boolean)];
  else if (args[i] === '--out') outDir = resolve(args[++i]);
  else files.push(resolve(args[i]));
}
if (files.length === 0) {
  console.error('Usage: node scripts/mask-excel.mjs <file.xlsx> [...] [--redact "WORD,WORD"] [--out dir]');
  process.exit(1);
}
const maskText = createMasker(words);
const cellText = v => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map(r => r.text).join('') ?? '');
  return String(v);
};
// Long boilerplate (email legal footers) is dropped: it is noise, not data.
const isBoilerplate = cells => cells.some(c => c.length > 120);

mkdirSync(outDir, { recursive: true });
for (const file of files) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const counts = {};
  let kept = 0;
  let dropped = 0;
  const parts = [];
  for (const ws of wb.worksheets) {
    const lines = [];
    ws.eachRow({ includeEmpty: false }, row => {
      const cells = row.values.slice(1).map(cellText);
      if (isBoilerplate(cells)) {
        dropped++;
        return;
      }
      if (cells.every(c => c.trim() === '')) return;
      kept++;
      lines.push(maskText(cells.join('   |   '), counts));
    });
    parts.push(`===== Hoja ${ws.name} =====\n${lines.join('\n')}`);
  }
  const outFile = join(outDir, `${basename(file, extname(file))}.masked.txt`);
  writeFileSync(outFile, `# ARCHIVO ENMASCARADO (best-effort). Revísalo antes de compartirlo.\n# Origen: ${basename(file)}\n\n${parts.join('\n\n')}\n`);
  console.log(`\n${basename(file)}`);
  console.log(`  filas de datos: ${kept} | filas de texto legal omitidas: ${dropped}`);
  console.log(`  datos ocultados: ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguno'}`);
  console.log(`  salida: ${outFile}`);
}
