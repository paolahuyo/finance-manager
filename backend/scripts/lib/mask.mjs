/**
 * Shared masking rules for the local tools that inspect bank documents (PDF and Excel).
 * Masking is best-effort: always review the output before sharing it.
 */
import { existsSync, readFileSync } from 'node:fs';

const accentClass = { a: 'aáàäâ', e: 'eéèëê', i: 'iíìïî', o: 'oóòöô', u: 'uúùüû', n: 'nñ' };
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const accentInsensitive = word =>
  [...word.toLowerCase()]
    .map(ch => (accentClass[ch] ? `[${accentClass[ch]}]` : escapeRe(ch)))
    .join('');

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
  // 8+ digit runs (ids, accounts) but not compact dates like 31122025 / 20261103
  {
    name: 'número largo',
    re: /\b(?!(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])(?:19|20)\d{2}\b)(?!(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\b)\d{8,}\b/g,
    tag: '[NUM]'
  },
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


/** Words listed one per line (or comma-separated) in a file, ignoring # comments. */
export function readWordsFile(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/[\n,]/)
    .map(w => w.trim())
    .filter(w => w && !w.startsWith('#'));
}

/** Returns maskText(text, counts) that also hides the given personal words (name, city...). */
export function createMasker(redactWords = []) {
  const wordRules = redactWords.map(w => ({
    re: new RegExp(`(?<![\\p{L}])${accentInsensitive(w)}(?![\\p{L}])`, 'giu'),
    tag: '[NOMBRE]'
  }));
  return function maskText(text, counts) {
    let out = text;
    for (const rule of [...RULES, ...wordRules]) {
      out = out.replace(rule.re, (...m) => {
        const key = rule.name ?? 'nombre';
        counts[key] = (counts[key] ?? 0) + 1;
        return rule.tag.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');
      });
    }
    return out;
  };
}
