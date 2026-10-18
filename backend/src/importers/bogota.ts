import type { DraftItem, InstallmentRow, ParsedStatement, StatementPages, StatementReader } from './types';

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DIC: 12
};

// YY/MM/DD  receipt  DESCRIPTION  amounts...  [paid/total]  rate%
const MOVEMENT_RE =
  /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{4})\s+(.+?)\s+((?:[\d.]+,\d{2}\s+)+)(?:(\d+\/\d+)\s+)?(\d+,\d{2})%\s*$/;
const PERIOD_RE = /Del (\d{2})\/([A-ZÁÉ]{3,4})\/(\d{4}) al (\d{2})\/([A-ZÁÉ]{3,4})\/(\d{4})/;
const AMOUNT = '([\\d.]+,\\d{2})';

const toNumber = (s: string): number => Number(s.replace(/\./g, '').replace(',', '.'));
const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
const monthOf = (abbr: string): number | undefined => MONTHS[abbr.replace('Á', 'A').replace('É', 'E')];
const round2 = (n: number): number => Math.round(n * 100) / 100;
const cleanDescription = (s: string): string => s.replace(/\s{2,}/g, ' ').trim();

const isFee = (description: string): boolean => /SEGURO|CUOTA DE MANEJO|COMISI[OÓ]N|IVA\b/i.test(description);
const isPayment = (description: string): boolean => /^(PAGO|ABONO)\b/i.test(description);

function parse(pages: StatementPages): ParsedStatement {
  const flat = pages.flat();
  const text = flat.join('\n');
  const warnings: string[] = [];
  const items: DraftItem[] = [];
  let skipped = 0;
  let feeLinesTotal = 0;
  let rate: number | null = null;
  const installments: InstallmentRow[] = [];

  const periodMatch = text.match(PERIOD_RE);
  const periodStart = periodMatch ? iso(Number(periodMatch[3]), monthOf(periodMatch[2]) ?? 1, Number(periodMatch[1])) : null;
  const periodEnd = periodMatch ? iso(Number(periodMatch[6]), monthOf(periodMatch[5]) ?? 1, Number(periodMatch[4])) : null;
  if (!periodStart || !periodEnd) warnings.push('No se pudo leer el periodo de facturación.');

  const labelled = (label: string): number | null => {
    const m = text.match(new RegExp(`${label}\\s+${AMOUNT}`, 'i'));
    return m ? toNumber(m[1]) : null;
  };

  for (const line of flat) {
    const m = line.match(MOVEMENT_RE);
    if (!m) continue;
    const date = iso(2000 + Number(m[1]), Number(m[2]), Number(m[3]));
    const description = cleanDescription(m[5]);
    const amount = toNumber(m[6].trim().split(/\s+/)[0]);
    const lineRate = toNumber(m[8]);
    if (lineRate > 0) rate = lineRate;
    // Installment table: "pending/total" installments; 3 amounts = original, installment, remaining.
    if (m[7] && !isFee(description) && !isPayment(description)) {
      const [pendingCount, totalCount] = m[7].split('/').map(Number);
      const amounts = m[6].trim().split(/\s+/).map(toNumber);
      const installmentValue = amounts[1] ?? amounts[0];
      const remaining = amounts.length >= 3 ? amounts[2] : 0;
      installments.push({
        purchase_date: date,
        description,
        original_value: amounts[0],
        installment_no: Math.max(totalCount - pendingCount, 0),
        installments_total: totalCount,
        balance_before: round2(remaining + installmentValue),
        capital_paid: installmentValue,
        balance_after: remaining,
        rate: lineRate
      });
    }
    const inPeriod = !!periodStart && !!periodEnd && date >= periodStart && date <= periodEnd;
    if (!inPeriod) {
      skipped++;
      continue;
    }
    if (isPayment(description)) {
      items.push({ date, description, amount_cop: amount, kind: 'payment', selected: true });
    } else if (isFee(description)) {
      feeLinesTotal += amount;
      items.push({ date, description, amount_cop: amount, kind: 'fee', selected: true });
    } else {
      items.push({ date, description, amount_cop: amount, kind: 'purchase', selected: true });
    }
  }

  const fallbackDate = periodEnd ?? new Date().toISOString().slice(0, 10);

  const interest = labelled('Intereses corrientes');
  if (interest === null) warnings.push('No se encontró "Intereses corrientes" en el resumen.');
  else if (interest > 0) {
    items.push({ date: fallbackDate, description: 'Intereses corrientes (extracto Banco de Bogotá)', amount_cop: interest, kind: 'interest', selected: true });
  }
  const lateInterest = labelled('Intereses mora');
  if (lateInterest && lateInterest > 0) {
    items.push({ date: fallbackDate, description: 'Intereses de mora (extracto Banco de Bogotá)', amount_cop: lateInterest, kind: 'interest', selected: true });
  }
  const managementFee = labelled('Cuota de manejo');
  if (managementFee && managementFee > 0) {
    items.push({ date: fallbackDate, description: 'Cuota de manejo (Banco de Bogotá)', amount_cop: managementFee, kind: 'fee', selected: true });
  }

  const otherCharges = labelled('Otros cargos');
  if (otherCharges && Math.abs(otherCharges - round2(feeLinesTotal)) > 1) {
    warnings.push(`"Otros cargos" del resumen es ${otherCharges} pero las líneas de cargos suman ${round2(feeLinesTotal)}. Revisa antes de importar.`);
  }
  const payments = labelled('Pagos y créditos');
  const paymentItems = items.filter(i => i.kind === 'payment');
  if (payments && payments > 0 && paymentItems.length === 0) {
    warnings.push(`El resumen indica pagos y créditos por ${payments}, pero no se encontró la línea del pago. Regístralo a mano.`);
  }

  // The values line under "Cupo total   Cupo disponible ...   Pago total" holds: limit, available, total due.
  const labelIndex = flat.findIndex(l => /Cupo total/i.test(l) && /Pago total/i.test(l));
  const limitMatch = labelIndex >= 0 ? flat[labelIndex + 1]?.match(/\$\s?([\d.]+)(?!,)/) : null;
  const totalDue = labelled('Pago total');
  const payBy = text.match(/Paga antes de\s+(\d{2})\/([A-ZÁÉ]{3,4})\/(\d{4})/i);

  return {
    bank: 'Banco de Bogotá',
    period_start: periodStart,
    period_end: periodEnd,
    items,
    skipped_installments: skipped,
    warnings,
    account_hint: {
      credit_limit: limitMatch ? Number(limitMatch[1].replace(/\./g, '')) : null,
      balance: totalDue,
      annual_rate: rate,
      due_date: payBy ? iso(Number(payBy[3]), monthOf(payBy[2].toUpperCase()) ?? 1, Number(payBy[1])) : null,
      minimum_payment: labelled('Pago mínimo'),
      total_payment: totalDue
    },
    installments
  };
}

export const bogotaReader: StatementReader = {
  bank: 'Banco de Bogotá',
  detect: pages => {
    const text = pages.flat().join('\n');
    return /Consumo al mes/i.test(text) && /Intereses corrientes/i.test(text) && /Cupo disponible compras/i.test(text);
  },
  parse
};
