/**
 * Dev tool: runs the statement readers on real PDFs and prints ONLY aggregates
 * (counts and totals per kind), never descriptions or personal data.
 *   npx ts-node scripts/check-statement.ts <file.pdf> [...]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseStatement } from '../src/importers';
import { extractPages } from '../src/importers/pdfText';

(async () => {
  for (const file of process.argv.slice(2)) {
    console.log(`\n${basename(file)}`);
    try {
      const pages = await extractPages(readFileSync(file));
      const parsed = parseStatement(pages);
      if (!parsed) {
        console.log('  formato NO reconocido por ningún lector');
        continue;
      }
      const byKind = new Map<string, { n: number; total: number }>();
      for (const item of parsed.items) {
        const acc = byKind.get(item.kind) ?? { n: 0, total: 0 };
        acc.n++;
        acc.total += item.amount_cop;
        byKind.set(item.kind, acc);
      }
      console.log(`  banco: ${parsed.bank} | periodo: ${parsed.period_start ?? '?'} → ${parsed.period_end ?? '?'}`);
      for (const [kind, { n, total }] of byKind) console.log(`  ${kind.padEnd(9)} ${String(n).padStart(3)} líneas | total ${total.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`);
      const usd = parsed.items.filter(i => i.original_currency === 'USD').length;
      console.log(`  en USD: ${usd} | cuotas antiguas omitidas: ${parsed.skipped_installments}`);
      for (const w of parsed.warnings) console.log(`  ⚠ ${w}`);
    } catch (error) {
      console.log(`  ERROR ${error instanceof Error ? error.message : error}`);
    }
  }
})();
