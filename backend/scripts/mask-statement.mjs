#!/usr/bin/env node
/**
 * Extracts the text of bank-statement PDFs LOCALLY and masks personal data, so the
 * result can be reviewed (and shared) safely.
 *
 *   node scripts/mask-statement.mjs <file.pdf> [more.pdf ...] [--redact "WORD,WORD"] [--redact-file path] [--out dir]
 *
 * Personal words (your name, city...) can be listed one per line in uploads/redact-words.txt
 * (git-ignored, loaded automatically) so they never have to be typed or shared.
 *
 * - Handles PDFs wrapped in extra leading bytes (finds the real %PDF- header).
 * - Writes <out>/<name>.masked.txt (default: <repo>/uploads/masked). Nothing is printed
 *   from the document itself, only counts, so running it never exposes its content.
 * - ALWAYS review the output before sharing it: masking is best-effort.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

// ---------- CLI ----------
const args = process.argv.slice(2);
const files = [];
let redactWords = [];
let outDir = resolve(here, '../../uploads/masked');
let redactFile = resolve(here, '../../uploads/redact-words.txt');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--redact') redactWords = (args[++i] ?? '').split(',').map(w => w.trim()).filter(Boolean);
  else if (args[i] === '--redact-file') redactFile = resolve(args[++i]);
  else if (args[i] === '--out') outDir = resolve(args[++i]);
  else files.push(resolve(args[i]));
}
if (existsSync(redactFile)) {
  const fromFile = readFileSync(redactFile, 'utf8').split(/[\n,]/).map(w => w.trim()).filter(w => w && !w.startsWith('#'));
  redactWords = [...redactWords, ...fromFile];
}
if (files.length === 0) {
  console.error('Usage: node scripts/mask-statement.mjs <file.pdf> [...] [--redact "WORD,WORD"] [--redact-file path] [--out dir]');
  process.exit(1);
}

// ---------- masking ----------
const accentClass = { a: 'aáàäâ', e: 'eéèëê', i: 'iíìïî', o: 'oóòöô', u: 'uúùüû', n: 'nñ' };
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const accentInsensitive = word =>
  [...word.toLowerCase()]
    .map(ch => (accentClass[ch] ? `[${accentClass[ch]}]` : escapeRe(ch)))
    .join('');

const wordRules = redactWords.map(w => ({
  re: new RegExp(`(?<![\\p{L}])${accentInsensitive(w)}(?![\\p{L}])`, 'giu'),
  tag: '[NOMBRE]'
}));

const ID_LABELS =
  'c\\.?\\s?c\\.?|c[eé]dula|nit|identificaci[oó]n|documento|n[uú]mero de (?:tarjeta|cuenta|documento|identificaci[oó]n)' +
  '|tarjeta\\s*n[oº°]\\.?|cuenta\\s*n[oº°]\\.?|cta\\.?|tel(?:[eé]fono)?|cel(?:ular)?|celular|fax';

const RULES = [
  { name: 'correo', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, tag: '[CORREO]' },
  { name: 'tarjeta', re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, tag: '[TARJETA]' },
  { name: 'tarjeta', re: /\b\d{4}[ -]?[*xX•]{4}[ -]?[*xX•]{4}[ -]?\d{4}\b|\*{4,}[ -]?\d{4}/g, tag: '[TARJETA]' },
  {
    name: 'identificación',
    re: new RegExp(`((?:${ID_LABELS})\\s*[:#.\\-]?\\s*)[\\d.\\-\\s*xX]{5,}`, 'gi'),
    tag: '$1[ID]'
  },
  { name: 'teléfono', re: /\b(?:\+?57[ -]?)?3\d{2}[ -]?\d{3}[ -]?\d{4}\b/g, tag: '[TEL]' },
  { name: 'número largo', re: /\b\d{9,}\b/g, tag: '[NUM]' },
  // Colombian street addresses: "CRA 12 # 34-56", "CALLE 80 No. 10-20 APTO 301"
  {
    name: 'dirección',
    re: /\b(?:calle|carrera|cra?\.?|cll?\.?|kr|cl|av(?:enida)?\.?|avda\.?|diagonal|dg\.?|transversal|tv\.?|circular|autopista|autop\.?)\s*\d[^\n]*/giu,
    tag: '[DIRECCIÓN]'
  },
  { name: 'dirección', re: /\b(?:apto\.?|apartamento|torre|conjunto|edificio|bloque|interior|casa)\s*#?\s*\w+[^\n]*/giu, tag: '[DIRECCIÓN]' },
  {
    name: 'dato personal',
    re: /^(.*?\b(?:nombre|titular|se[ñn]or(?:a)?|sr\.?|sra\.?|direcci[oó]n|barrio|municipio|correspondencia)\b[^:\n]{0,25}[:\-]?)\s*(\S.*)$/gimu,
    tag: '$1 [REDACTADO]'
  }
];

function maskText(text, counts) {
  let out = text;
  for (const rule of [...RULES, ...wordRules]) {
    out = out.replace(rule.re, (...m) => {
      counts[rule.name ?? 'nombre'] = (counts[rule.name ?? 'nombre'] ?? 0) + 1;
      return rule.tag.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');
    });
  }
  return out;
}

// ---------- PDF text extraction ----------
function stripWrapper(buffer) {
  const offset = buffer.indexOf('%PDF-');
  if (offset < 0) throw new Error('No %PDF- header found: not a PDF');
  return { data: new Uint8Array(buffer.subarray(offset)), wrapperBytes: offset };
}

/** Rebuilds visual lines from positioned text items (same y = same line, left to right). */
function itemsToLines(items) {
  const rows = [];
  for (const item of items) {
    if (!('str' in item) || item.str.trim() === '') continue;
    const [, , , , x, y] = item.transform;
    let row = rows.find(r => Math.abs(r.y - y) <= 2);
    if (!row) rows.push((row = { y, cells: [] }));
    row.cells.push({ x, w: item.width, str: item.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(row => {
    row.cells.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd = null;
    for (const c of row.cells) {
      if (prevEnd !== null) line += c.x - prevEnd > 6 ? '   ' : ' ';
      line += c.str;
      prevEnd = c.x + c.w;
    }
    return line.trimEnd();
  });
}

async function extract(file) {
  const { data, wrapperBytes } = stripWrapper(readFileSync(file));
  const pdf = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    pages.push(itemsToLines(content.items));
  }
  return { pages, wrapperBytes };
}

// ---------- main ----------
mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const name = basename(file, extname(file));
  try {
    const { pages, wrapperBytes } = await extract(file);
    const counts = {};
    const body = pages
      .map((lines, i) => `===== Página ${i + 1} =====\n${lines.map(l => maskText(l, counts)).join('\n')}`)
      .join('\n\n');
    const chars = pages.flat().join('').length;
    const outFile = join(outDir, `${name}.masked.txt`);
    writeFileSync(
      outFile,
      `# ARCHIVO ENMASCARADO (best-effort). Revísalo antes de compartirlo.\n# Origen: ${name}.pdf\n\n${body}\n`
    );

    console.log(`\n${basename(file)}`);
    console.log(`  envoltura previa al PDF: ${wrapperBytes} bytes`);
    console.log(`  páginas: ${pages.length} | líneas: ${pages.flat().length} | caracteres: ${chars}`);
    console.log(`  capa de texto: ${chars > 50 ? 'SÍ (PDF digital)' : 'NO (parece imagen escaneada)'}`);
    const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
    console.log(`  datos ocultados: ${summary || 'ninguno'}`);
    console.log(`  salida: ${outFile}`);
  } catch (error) {
    console.error(`\n${basename(file)}: ERROR ${error instanceof Error ? error.message : error}`);
  }
}
