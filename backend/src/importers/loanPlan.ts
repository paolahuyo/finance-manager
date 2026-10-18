import type { StatementPages } from './types';

/** One row of a loan payment plan. */
export interface LoanPlanRow {
  n: number;
  balance_after: number;
  capital: number;
  interest: number;
  insurance: number;
  payment: number;
}

export interface LoanPlan {
  bank: 'Davivienda';
  amount: number;
  annual_rate: number;
  term_months: number;
  disbursed_on: string | null;
  first_due: string | null;
  rows: LoanPlanRow[];
}

const toNumber = (s: string): number => Number(s.replace(/\./g, '').replace(',', '.'));
const pad = (n: number): string => String(n).padStart(2, '0');
const isoFromSlash = (s: string): string | null => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}` : null;
};
const MONEY = '\\$\\s+([\\d.]+,\\d{2})';
// "12 $ 8.795.088,02 $ 297.076,39 $ 149.960,61 $ 12.963,00 $ 460.000,00" (last row prints "$ -" as balance)
const ROW_RE = new RegExp(`^(\\d{1,3})\\s+\\$\\s+(-|[\\d.]+,\\d{2})\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s*$`);

/** Davivienda "Plan de pagos" (payroll loan) projection. */
export function parseDaviviendaPlan(pages: StatementPages): LoanPlan | null {
  const lines = pages.flat();
  const text = lines.join('\n');
  if (!/PLAN DE PAGOS CR[EÉ]DITO/i.test(text) || !/Cuota fija mensual/i.test(text)) return null;

  const field = (label: RegExp): string | undefined => text.match(label)?.[1];
  const rows: LoanPlanRow[] = [];
  const seen = new Set<number>();
  for (const line of lines) {
    const m = line.match(ROW_RE);
    if (!m || seen.has(Number(m[1]))) continue; // page headers repeat
    seen.add(Number(m[1]));
    rows.push({
      n: Number(m[1]),
      balance_after: m[2] === '-' ? 0 : toNumber(m[2]),
      capital: toNumber(m[3]),
      interest: toNumber(m[4]),
      insurance: toNumber(m[5]),
      payment: toNumber(m[6])
    });
  }
  return {
    bank: 'Davivienda',
    amount: toNumber(field(/Monto\s+\$\s+([\d.]+,\d{2})/) ?? '0'),
    annual_rate: Number((field(/Tasa E\.A\s+([\d,]+)%/) ?? '0').replace(',', '.')),
    term_months: Number(field(/Plazo \(meses\)\*?\s+(\d+)/) ?? rows.length),
    disbursed_on: isoFromSlash(field(/Fecha de Desembolso\s+(\S+)/) ?? ''),
    first_due: isoFromSlash(field(/Fecha Pr[oó]ximo Pago\s+(\S+)/) ?? ''),
    rows: rows.sort((a, b) => a.n - b.n)
  };
}
