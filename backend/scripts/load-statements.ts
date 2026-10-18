/**
 * Dev tool: creates a card from each statement (limit, rate, opening balance) and imports its
 * movements through the same API the Importar screen uses. Prints only aggregates.
 *
 *   npx ts-node scripts/load-statements.ts "<file.pdf>=<Card name>" [...] [--api http://localhost:5001/api]
 *
 * Opening balance is chosen so that the card's balance equals the debt printed on the statement.
 * It is only set for cards created in this run, so re-running never moves an existing balance.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseStatement } from '../src/importers';
import { extractPages } from '../src/importers/pdfText';

interface Account { id: number; name: string; balance?: number }
interface PreviewItem { kind: string; amount_cop: number; selected: boolean; duplicate: boolean }

const args = process.argv.slice(2);
const apiIndex = args.indexOf('--api');
const API = apiIndex >= 0 ? args.splice(apiIndex, 2)[1] : 'http://localhost:5001/api';
const fmt = (n: number): string => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
const round2 = (n: number): number => Math.round(n * 100) / 100;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

(async () => {
  for (const arg of args) {
    const [file, ...nameParts] = arg.split('=');
    const cardName = nameParts.join('=').trim();
    console.log(`\n${basename(file)} → "${cardName}"`);
    try {
      const buffer = readFileSync(file);
      const parsed = parseStatement(await extractPages(buffer));
      if (!parsed) throw new Error('formato no reconocido');
      const hint = parsed.account_hint;

      const existing = (await call<Account[]>('/accounts')).find(a => a.name === cardName);
      const isNew = !existing;
      const account =
        existing ??
        (await call<Account>('/accounts', json('POST', {
          name: cardName,
          bank: parsed.bank,
          kind: 'credit_card',
          annual_rate: hint.annual_rate,
          credit_limit: hint.credit_limit,
          opening_balance: 0
        })));

      const preview = await call<{ items: PreviewItem[]; warnings: string[] }>(
        `/imports/preview?account_id=${account.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: buffer }
      );
      const chosen = preview.items.filter(i => i.selected);
      const added = chosen.filter(i => i.kind !== 'payment' && i.kind !== 'credit').reduce((t, i) => t + i.amount_cop, 0);
      const paid = chosen.filter(i => i.kind === 'payment' || i.kind === 'credit').reduce((t, i) => t + i.amount_cop, 0);

      if (isNew && hint.balance !== null) {
        let opening = round2(hint.balance - (added - paid));
        if (opening < 0) {
          console.log(`  ⚠ saldo inicial negativo (${fmt(opening)}); se deja en 0`);
          opening = 0;
        }
        await call(`/accounts/${account.id}`, json('PUT', {
          name: cardName, bank: parsed.bank, kind: 'credit_card',
          annual_rate: hint.annual_rate, credit_limit: hint.credit_limit, opening_balance: opening, notes: null,
          balance_as_of: parsed.period_end, due_date: hint.due_date ?? null, minimum_payment: hint.minimum_payment ?? null,
          total_payment: hint.total_payment ?? null, due_cutoff: parsed.period_end
        }));
        console.log(`  tarjeta creada (id ${account.id}) | cupo ${fmt(hint.credit_limit ?? 0)} | tasa ${hint.annual_rate ?? '?'}% | saldo inicial ${fmt(opening)}`);
      } else if (isNew) {
        console.log(`  tarjeta creada (id ${account.id}) sin saldo inicial: el extracto no permitió calcular la deuda`);
      } else {
        console.log(`  la tarjeta ya existía (id ${account.id}); no se toca su saldo inicial`);
      }

      if (chosen.length === 0) {
        console.log('  nada nuevo que importar');
      } else {
        const full = await call<{ items: unknown[] }>(`/imports/preview?account_id=${account.id}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: buffer });
        const res = await call<{ inserted: number; skipped_duplicates: number }>('/imports/commit', json('POST', {
          account_id: account.id,
          items: (full.items as (PreviewItem & Record<string, unknown>)[]).filter(i => i.selected)
        }));
        console.log(`  importados: ${res.inserted} | ya existían: ${res.skipped_duplicates}`);
      }

      const now = (await call<Account[]>('/accounts')).find(a => a.id === account.id);
      if (hint.balance !== null && now?.balance !== undefined) {
        const ok = Math.abs(now.balance - hint.balance) < 0.05;
        console.log(`  deuda en la app: ${fmt(now.balance)} | deuda del extracto: ${fmt(hint.balance)} ${ok ? '✓' : '✗ NO COINCIDE'}`);
      }
      for (const w of preview.warnings) console.log(`  ⚠ ${w}`);
    } catch (error) {
      console.log(`  ERROR ${error instanceof Error ? error.message : error}`);
    }
  }
})();
