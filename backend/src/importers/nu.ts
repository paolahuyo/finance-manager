import type { DraftItem, ParsedStatement, StatementPages, StatementReader } from './types';

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DIC: 12
};

// DD MON [YYYY]  description  $total  N de M  $installment  rate%  $interest  $due  $remaining
const PURCHASE_RE =
  /^(\d{2}) ([A-ZÁÉ]{3,4})(?: (\d{4}))?\s+(.+?)\s+\$([\d.]+,\d{2})\s+(\d+) de (\d+)\s+\$[\d.]+,\d{2}\s+(\d+(?:\.\d+)?)%\s+\$[\d.]+,\d{2}\s+\$[\d.]+,\d{2}\s+\$[\d.]+,\d{2}\s*$/;
const PAYMENT_RE = /^(\d{2}) ([A-ZÁÉ]{3,4})(?: (\d{4}))?\s+Pago\s+\$([\d.]+,\d{2})/;
const FEE_RE = /↪\s*Comisión por cambio de moneda\s+\$([\d.]+,\d{2})/i;
const PERIOD_RE = /(\d{2}) ([A-ZÁÉ]{3,4}) (\d{4}) - (\d{2}) ([A-ZÁÉ]{3,4}) (\d{4})/;
const SUMMARY_RE = (label: string): RegExp => new RegExp(`^${label}\\s+\\+\\s*\\$([\\d.]+,\\d{2})`, 'i');

const toNumber = (s: string): number => Number(s.replace(/\./g, '').replace(',', '.'));
const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
const monthOf = (abbr: string): number | undefined => MONTHS[abbr.replace('Á', 'A').replace('É', 'E')];
const round2 = (n: number): number => Math.round(n * 100) / 100;
const cleanDescription = (s: string): string => s.replace(/\s{2,}/g, ' ').trim();

function parse(pages: StatementPages): ParsedStatement {
  const flat = pages.flat();
  const warnings: string[] = [];
  const items: DraftItem[] = [];
  let skipped = 0;

  const periodLine = flat.map(l => l.match(PERIOD_RE)).find(Boolean);
  const periodStart = periodLine ? iso(Number(periodLine[3]), monthOf(periodLine[2]) ?? 1, Number(periodLine[1])) : null;
  const periodEnd = periodLine ? iso(Number(periodLine[6]), monthOf(periodLine[5]) ?? 1, Number(periodLine[4])) : null;
  if (!periodStart || !periodEnd) warnings.push('No se pudo leer el periodo facturado; no se puede distinguir compras nuevas de cuotas antiguas.');

  /** Year printed inline, on the next lines, or inferred from the period. */
  const resolveDate = (index: number, day: string, mon: string, inlineYear?: string): string | null => {
    const month = monthOf(mon);
    if (!month) return null;
    let year = inlineYear ? Number(inlineYear) : undefined;
    for (let k = 1; year === undefined && k <= 2; k++) {
      const y = flat[index + k]?.match(/^(\d{4})\b/);
      if (y) year = Number(y[1]);
    }
    if (year === undefined && periodEnd) {
      const endYear = Number(periodEnd.slice(0, 4));
      year = month > Number(periodEnd.slice(5, 7)) ? endYear - 1 : endYear;
    }
    return year === undefined ? null : iso(year, month, Number(day));
  };
  const inPeriod = (date: string): boolean =>
    !!periodStart && !!periodEnd && date >= periodStart && date <= periodEnd;

  let lastPurchaseIsNew = false;
  let monthlyRate: number | null = null;
  let lastPurchaseDesc = '';
  let feesSum = 0;

  for (let i = 0; i < flat.length; i++) {
    const line = flat[i];

    const purchase = line.match(PURCHASE_RE);
    if (purchase) {
      const date = resolveDate(i, purchase[1], purchase[2], purchase[3]);
      lastPurchaseDesc = cleanDescription(purchase[4]);
      if (monthlyRate === null && Number(purchase[8]) > 0) monthlyRate = Number(purchase[8]);
      lastPurchaseIsNew = !!date && inPeriod(date);
      if (!date || !lastPurchaseIsNew) {
        skipped++;
        continue;
      }
      items.push({
        date,
        description: lastPurchaseDesc,
        amount_cop: toNumber(purchase[5]),
        kind: 'purchase',
        selected: true
      });
      continue;
    }

    const fee = line.match(FEE_RE);
    if (fee) {
      if (lastPurchaseIsNew) {
        const parent = items[items.length - 1];
        const amount = toNumber(fee[1]);
        feesSum += amount;
        items.push({
          date: parent.date,
          description: `Comisión por cambio de moneda · ${lastPurchaseDesc}`,
          amount_cop: amount,
          kind: 'fee',
          selected: true
        });
      }
      continue;
    }

    const payment = line.match(PAYMENT_RE);
    if (payment) {
      const date = resolveDate(i, payment[1], payment[2], payment[3]);
      if (!date) continue;
      const tail = flat.slice(i + 1, i + 7).join('\n');
      const part = (label: string): string | undefined => tail.match(new RegExp(`A ${label}\\s+\\$([\\d.]+,\\d{2})`))?.[1];
      const [capital, interest, charges] = [part('capital'), part('intereses'), part('cargos y comisiones')];
      items.push({
        date,
        description: 'Pago de la tarjeta Nu',
        amount_cop: toNumber(payment[4]),
        kind: 'payment',
        note: capital || interest || charges
          ? `Este pago cubrió: capital $${capital ?? '0,00'}, intereses $${interest ?? '0,00'}, cargos $${charges ?? '0,00'}.`
          : undefined,
        selected: true
      });
    }
  }

  // Interest and fees charged in this cycle come from the labelled summary block.
  const summary = (label: string): number | null => {
    for (const line of flat) {
      const m = line.match(SUMMARY_RE(label));
      if (m) return toNumber(m[1]);
    }
    return null;
  };
  const interest = summary('Intereses');
  if (interest === null) warnings.push('No se encontró el interés del extracto en el resumen.');
  else if (interest > 0) {
    items.push({
      date: periodEnd ?? new Date().toISOString().slice(0, 10),
      description: 'Intereses del extracto Nu',
      amount_cop: interest,
      kind: 'interest',
      selected: true
    });
  }
  for (const label of ['Comisiones de avances', 'Comisiones por servicio']) {
    const amount = summary(label);
    if (amount && amount > 0) {
      items.push({
        date: periodEnd ?? new Date().toISOString().slice(0, 10),
        description: `${label} (Nu)`,
        amount_cop: amount,
        kind: 'fee',
        selected: true
      });
    }
  }
  const conversionTotal = summary('Cargos por conversión');
  if (conversionTotal !== null && Math.abs(conversionTotal - round2(feesSum)) > 1) {
    warnings.push(
      `Las comisiones por cambio de moneda de las compras suman ${round2(feesSum)} pero el resumen dice ${conversionTotal}. Revisa antes de importar.`
    );
  }

  const text = flat.join('\n');
  const cap = text.match(/Tu cupo definido\s+\$([\d.]+,\d{2})/i);
  const debt = text.match(/DEUDA TOTAL HASTA EL[^$\n]*\$([\d.]+,\d{2})/i);
  return {
    bank: 'Nu',
    period_start: periodStart,
    period_end: periodEnd,
    items,
    skipped_installments: skipped,
    warnings,
    account_hint: {
      credit_limit: cap ? toNumber(cap[1]) : null,
      balance: debt ? toNumber(debt[1]) : null,
      // Nu prints the monthly rate (M.V.); convert it to effective annual.
      annual_rate: monthlyRate === null ? null : round2((Math.pow(1 + monthlyRate / 100, 12) - 1) * 100)
    }
  };
}

export const nuReader: StatementReader = {
  bank: 'Nu',
  detect: pages => {
    const text = pages.flat();
    return text.some(l => /Periodo facturado/i.test(l)) && text.some(l => /Resumen de tu extracto/i.test(l));
  },
  parse
};
