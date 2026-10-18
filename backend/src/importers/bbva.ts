import type { DraftItem, ParsedStatement, StatementPages, StatementReader } from './types';

// Purchase / installment line:
// DDMMYYYY  ref  DESCRIPTION  rate  CC DE TT  original  balance-before  capital-paid  balance-after
const PURCHASE_RE =
  /^(\d{8})\s+(\d{6})\s+(.+?)\s+(\d*\.\d+)\s+(\d{2}) DE (\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;
// Line right after a purchase with its original currency: "... USD ***** ***** 33.89 *****"
const CURRENCY_RE = /^(\d{8})\s+(\d{6})\s+(.+?)\s+(USD|COP)\s+\*+\s+\*+\s+([\d,]+\.\d{2})\s+\*+/;
// Credits end with " - 123,456.78": card payments and refunds
const CREDIT_RE = /^(\d{8})\s+(?:(\d{6})\s+)?(.+?)\s+-\s*([\d,]+\.\d{2})\s*$/;
const MONEY_RE = /(?<![\d,.])\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g;
const DATE_DASH_RE = /\b(\d{2})-(\d{2})-(\d{4})\b/;

const toNumber = (s: string): number => Number(s.replace(/,/g, ''));
const isoFromCompact = (s: string): string => `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const cleanDescription = (s: string): string => s.replace(/\s{2,}/g, ' ').trim();

/**
 * The summary block of a BBVA statement has no text labels, so interest is derived:
 * minimum payment = capital paid this month + interest. We look for a figure X on page 1 such that
 * (X - sum of capital paid) is also a figure on page 1; that difference is the interest.
 */
export function deriveInterest(firstPage: string[], capitalPaid: number): number | null {
  // Only the summary block counts: figures from movement rows would create false matches.
  const summaryLines = firstPage.filter(l => !PURCHASE_RE.test(l) && !CURRENCY_RE.test(l) && !CREDIT_RE.test(l));
  const figures = new Set<number>();
  for (const line of summaryLines) for (const m of line.match(MONEY_RE) ?? []) figures.add(toNumber(m));
  const list = [...figures];
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.02;

  const candidates = new Set<number>();
  for (const x of list) {
    const diff = round2(x - capitalPaid);
    if (diff > 0.01 && list.some(y => near(y, diff))) candidates.add(diff);
  }
  if (candidates.size === 1) return [...candidates][0];
  if (candidates.size > 1) return null; // ambiguous: better to ask the user than to guess

  // No interest this cycle: the minimum payment equals the capital paid.
  if (list.some(x => near(x, capitalPaid))) return 0;
  return null;
}

function parse(pages: StatementPages): ParsedStatement {
  const warnings: string[] = [];
  const items: DraftItem[] = [];
  let skipped = 0;
  let capitalPaid = 0;
  let section: 'previous' | 'current' = 'previous';
  let sawCurrentSection = false;
  let installmentRows = 0;
  let balanceAfter = 0;
  const currentRates: number[] = [];
  const allRates: number[] = [];

  const flat = pages.flat();
  const periodEndMatch = (pages[0] ?? []).join('\n').match(DATE_DASH_RE);
  const periodEnd = periodEndMatch ? `${periodEndMatch[3]}-${periodEndMatch[2]}-${periodEndMatch[1]}` : null;

  for (let i = 0; i < flat.length; i++) {
    const line = flat[i];
    if (/MOVIMIENTOS ANTERIORES/.test(line)) section = 'previous';
    if (/MOVIMIENTOS DE ESTE MES/.test(line)) {
      section = 'current';
      sawCurrentSection = true;
    }

    const purchase = line.match(PURCHASE_RE);
    if (purchase) {
      installmentRows++;
      capitalPaid += toNumber(purchase[9]);
      balanceAfter += toNumber(purchase[10]);
      if (Number(purchase[4]) > 0) {
        allRates.push(Number(purchase[4]));
        if (section === 'current') currentRates.push(Number(purchase[4]));
      }
      if (section !== 'current') {
        skipped++;
        continue;
      }
      const item: DraftItem = {
        date: isoFromCompact(purchase[1]),
        description: cleanDescription(purchase[3]),
        amount_cop: toNumber(purchase[7]),
        kind: 'purchase',
        selected: true
      };
      const next = flat[i + 1]?.match(CURRENCY_RE);
      if (next && next[1] === purchase[1] && next[4] === 'USD') {
        const usd = toNumber(next[5]);
        item.original_amount = usd;
        item.original_currency = 'USD';
        item.exchange_rate = usd > 0 ? round2(item.amount_cop / usd) : undefined;
      }
      items.push(item);
      continue;
    }

    if (CURRENCY_RE.test(line)) continue;

    const credit = line.match(CREDIT_RE);
    if (credit) {
      const description = cleanDescription(credit[3]);
      const isPayment = /^PAGO\b/i.test(description);
      items.push({
        date: isoFromCompact(credit[1]),
        description,
        amount_cop: toNumber(credit[4]),
        kind: isPayment ? 'payment' : 'credit',
        note: isPayment ? undefined : 'Parece una devolución o un crédito: revísalo antes de importar.',
        selected: isPayment
      });
    }
  }

  if (installmentRows > 0 && !sawCurrentSection) {
    warnings.push('No se encontró la sección "Movimientos de este mes": no se importó ninguna compra.');
  }

  const interest = deriveInterest(pages[0] ?? [], round2(capitalPaid));
  if (interest === null) {
    warnings.push('No se pudo determinar el interés de este extracto. Regístralo a mano como "Intereses y comisiones".');
  } else if (interest > 0) {
    items.push({
      date: periodEnd ?? items[0]?.date ?? new Date().toISOString().slice(0, 10),
      description: 'Intereses corrientes (extracto BBVA)',
      amount_cop: interest,
      kind: 'interest',
      note: 'Calculado: pago del mes menos abonos a capital.',
      selected: true
    });
  }

  // Debt at cut-off = remaining capital of every purchase + what is due this cycle (capital + interest).
  const balance = interest === null ? null : round2(balanceAfter + capitalPaid + interest);
  let creditLimit: number | null = null;
  if (balance !== null) {
    const figures = new Set<number>();
    for (const line of pages[0] ?? []) {
      if (PURCHASE_RE.test(line) || CURRENCY_RE.test(line) || CREDIT_RE.test(line)) continue;
      for (const m of line.match(MONEY_RE) ?? []) figures.add(toNumber(m));
    }
    const list = [...figures];
    const match = list.find(c => list.some(d => Math.abs(c - d - balance) < 0.02));
    creditLimit = match ?? null;
  }
  const rates = currentRates.length ? currentRates : allRates;
  const annualRate = rates.length ? rates[rates.length - 1] : null;

  return {
    bank: 'BBVA',
    period_start: null,
    period_end: periodEnd,
    items,
    skipped_installments: skipped,
    warnings,
    account_hint: { credit_limit: creditLimit, balance, annual_rate: annualRate }
  };
}

export const bbvaReader: StatementReader = {
  bank: 'BBVA',
  detect: pages => {
    const text = pages.flat();
    return text.some(l => /MOVIMIENTOS (ANTERIORES|DE ESTE MES)/.test(l)) && text.some(l => PURCHASE_RE.test(l));
  },
  parse
};
