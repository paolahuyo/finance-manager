// Payment plan generator. Pure: no database access (the route gathers the data and calls this).

export type Strategy = 'fewer' | 'finish';

export interface PlanAccount {
  id: number;
  name: string;
  /** Whether the bank lets you pay a specific purchase. */
  allows_directed_payments: boolean;
  /** Day of the month the statement is cut; null when unknown. */
  cutoff_day: number | null;
  due_date: string | null;
  /** Minimum payment still owed (already net of what was paid since the cut-off). */
  minimum_pending: number;
}

export interface PlanPurchase {
  account_id: number;
  description: string;
  purchase_date: string;
  balance: number;
  /** Monthly-compounding input: effective annual rate in percent. 0 = no interest. */
  rate: number;
}

export interface PlanRecurring {
  type: 'income' | 'expense';
  description: string;
  amount: number;
  day_of_month: number;
}

export interface PlanExtraIncome {
  description: string;
  amount: number;
  date: string;
  target?: { account_id: number; description: string };
}

export interface PlanInput {
  today: string;
  cash_now: number;
  reserve_one_installment: number;
  extra_incomes: PlanExtraIncome[];
  strategy: Strategy;
  accounts: PlanAccount[];
  purchases: PlanPurchase[];
  recurring: PlanRecurring[];
}

export interface PlanStep {
  order: number;
  date: string;
  due_by?: string;
  kind: 'minimum' | 'fixed' | 'reserve' | 'directed' | 'extra_capital' | 'free';
  account_id?: number;
  account_name?: string;
  purchase?: { description: string; purchase_date: string; balance: number; rate: number };
  amount: number;
  source: string;
  monthly_saving?: number;
  finishes_purchase?: boolean;
  after_cutoff?: boolean;
  note?: string;
}

export interface PaymentPlan {
  steps: PlanStep[];
  totals: {
    inflows: number;
    minimums: number;
    fixed: number;
    reserve: number;
    extra: number;
    free: number;
    monthly_saving: number;
  };
  warnings: string[];
}

// ---- helpers -------------------------------------------------------------------------------

const round2 = (n: number): number => Math.round(n * 100) / 100;

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const cop = (n: number): string => copFormatter.format(n);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number): string => String(n).padStart(2, '0');
const shortDate = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Date of a monthly item; day 31 becomes the last day of shorter months. */
function occurrence(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}

/** Occurrences (>= from) of a monthly day, for the next `months` months. */
function occurrencesFrom(from: string, day: number, months: number): string[] {
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const dates: string[] = [];
  for (let i = 0; i < months; i++) {
    const date = occurrence(year, month, day);
    if (date >= from) dates.push(date);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return dates;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Interest avoided in a month by paying `amount` of capital at `rate` % annual effective. */
export const monthlySaving = (amount: number, rate: number): number =>
  round2(amount * (Math.pow(1 + rate / 100, 1 / 12) - 1));

interface Pool {
  label: string;
  date: string;
  remaining: number;
  /** Recurring income (as opposed to cash on hand or an extra income). */
  recurringIncome: boolean;
}

/** Takes `amount` from the pools in the given order; returns what each gave and what is still missing. */
function take(candidates: Pool[], amount: number): { taken: { pool: Pool; amount: number }[]; short: number } {
  const taken: { pool: Pool; amount: number }[] = [];
  let need = round2(amount);
  for (const pool of candidates) {
    if (need <= 0) break;
    const part = Math.min(pool.remaining, need);
    if (part <= 0) continue;
    pool.remaining = round2(pool.remaining - part);
    need = round2(need - part);
    taken.push({ pool, amount: part });
  }
  return { taken, short: need };
}

const byDate = (a: Pool, b: Pool): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

const KIND_RANK: Record<PlanStep['kind'], number> = { fixed: 0, minimum: 1, reserve: 2, directed: 3, extra_capital: 3, free: 4 };

interface Destination {
  account: PlanAccount;
  purchase: PlanPurchase | null; // null = whole account (no directed payments)
  balance: number;
  rate: number;
  cutoff: string | null;
  priority: boolean;
}

// ---- generator -----------------------------------------------------------------------------

export function generatePaymentPlan(input: PlanInput): PaymentPlan {
  const { today, strategy } = input;
  const warnings: string[] = [];
  const steps: PlanStep[] = [];
  const accountById = new Map(input.accounts.map(a => [a.id, a]));

  // Working copy of the interest-bearing purchases.
  const purchases = input.purchases
    .filter(p => p.balance > 0 && accountById.has(p.account_id))
    .map(p => ({ ...p, priority: false }));

  const nextCutoff = (account: PlanAccount): string | null =>
    account.cutoff_day === null ? null : occurrencesFrom(today, account.cutoff_day, 3)[0] ?? null;

  // Horizon: from today up to (not including) the second recurring income date.
  const incomes = input.recurring.filter(r => r.type === 'income');
  const incomeOccurrences = incomes
    .flatMap(r => occurrencesFrom(today, r.day_of_month, 3).map(date => ({ date, item: r })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const distinctIncomeDates = [...new Set(incomeOccurrences.map(o => o.date))];
  const horizonEnd = distinctIncomeDates[1] ?? addDays(today, 31);

  // Money sources.
  const cash: Pool = { label: 'Dinero de hoy', date: today, remaining: round2(input.cash_now), recurringIncome: false };
  const incomePools: Pool[] = incomeOccurrences
    .filter(o => o.date < horizonEnd)
    .map(o => ({
      label: `${o.item.description} ${shortDate(o.date)}`,
      date: o.date,
      remaining: round2(o.item.amount),
      recurringIncome: true
    }));

  // Extra incomes: those aimed at a purchase are applied first (step 4); invalid targets become general money.
  interface TargetedExtra { pool: Pool; purchase: (typeof purchases)[number]; account: PlanAccount }
  const targeted: TargetedExtra[] = [];
  const extraPools: Pool[] = [];
  for (const extra of input.extra_incomes) {
    const pool: Pool = {
      label: extra.description,
      date: extra.date < today ? today : extra.date,
      remaining: round2(extra.amount),
      recurringIncome: false
    };
    if (extra.target) {
      const account = accountById.get(extra.target.account_id);
      const purchase = purchases.find(
        p => p.account_id === extra.target!.account_id && p.description === extra.target!.description && p.rate > 0
      );
      if (!account || !purchase) {
        warnings.push(`"${extra.description}": la compra destino ya no tiene saldo con interés; el dinero se reparte como abono extra.`);
      } else if (!account.allows_directed_payments) {
        warnings.push(`"${extra.description}": ${account.name} no permite abonos dirigidos; el dinero se reparte como abono extra.`);
      } else {
        targeted.push({ pool, purchase, account });
        continue;
      }
    }
    extraPools.push(pool);
  }

  const inflows = round2(
    cash.remaining + [...incomePools, ...extraPools, ...targeted.map(t => t.pool)].reduce((s, p) => s + p.remaining, 0)
  );

  // General money for minimums, fixed expenses and the reserve (targeted extras are earmarked).
  const general = [cash, ...incomePools, ...extraPools].sort(byDate);

  // 1. Minimums, ordered by due date. They are paid with the latest money that arrives before the due
  //    date, so earlier money is free to attack the most expensive debt sooner.
  const minimums = input.accounts
    .filter(a => a.due_date !== null && a.minimum_pending > 0 && a.due_date < horizonEnd)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  for (const account of minimums) {
    const limit = account.due_date! < today ? today : account.due_date!;
    const candidates = general.filter(p => p.date <= limit).reverse();
    const { taken, short } = take(candidates, account.minimum_pending);
    for (const { pool, amount } of taken) {
      steps.push({
        order: 0, date: pool.date, due_by: account.due_date!, kind: 'minimum',
        account_id: account.id, account_name: account.name, amount, source: pool.label
      });
    }
    if (short > 0) {
      warnings.push(`No alcanza para el mínimo de ${account.name} (vence ${shortDate(account.due_date!)}): faltan ${cop(short)}.`);
    }
  }

  // 2. Fixed expenses, from the income of their day (or the earliest money available by then).
  const fixedOccurrences = input.recurring
    .filter(r => r.type === 'expense')
    .flatMap(r => occurrencesFrom(today, r.day_of_month, 3).map(date => ({ date, item: r })))
    .filter(o => o.date < horizonEnd)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const { date, item } of fixedOccurrences) {
    const sameDay = general.filter(p => p.recurringIncome && p.date === date);
    const others = general.filter(p => p.date <= date && !sameDay.includes(p));
    const { taken, short } = take([...sameDay, ...others], item.amount);
    for (const { pool, amount } of taken) {
      steps.push({ order: 0, date, kind: 'fixed', amount, source: pool.label, note: item.description });
    }
    if (short > 0) warnings.push(`No alcanza para ${item.description} (${shortDate(date)}): faltan ${cop(short)}.`);
  }

  // 3. Reserve for the 1-installment purchases, set aside from the first recurring income.
  if (input.reserve_one_installment > 0) {
    const firstIncome = general.filter(p => p.recurringIncome).slice(0, 1);
    const others = general.filter(p => !firstIncome.includes(p));
    const { taken, short } = take([...firstIncome, ...others], input.reserve_one_installment);
    for (const { pool, amount } of taken) {
      steps.push({
        order: 0, date: pool.date, kind: 'reserve', amount, source: pool.label,
        note: 'Reservar para pagar completas las compras a 1 cuota cuando venzan.'
      });
    }
    if (short > 0) warnings.push(`No alcanza para la reserva de compras a 1 cuota: faltan ${cop(short)}.`);
  }

  // 4. Extra incomes aimed at a purchase.
  for (const { pool, purchase, account } of targeted.sort((a, b) => byDate(a.pool, b.pool))) {
    const amount = Math.min(pool.remaining, purchase.balance);
    const cutoff = nextCutoff(account);
    const afterCutoff = cutoff !== null && pool.date > cutoff;
    if (afterCutoff) {
      warnings.push(`"${pool.label}" llega después del corte de ${account.name} (${shortDate(cutoff!)}): el interés de ese extracto se cobra igual.`);
    }
    steps.push({
      order: 0, date: pool.date, due_by: cutoff ?? undefined, kind: 'directed',
      account_id: account.id, account_name: account.name,
      purchase: { description: purchase.description, purchase_date: purchase.purchase_date, balance: purchase.balance, rate: purchase.rate },
      amount, source: pool.label, monthly_saving: monthlySaving(amount, purchase.rate),
      after_cutoff: afterCutoff || undefined
    });
    pool.remaining = round2(pool.remaining - amount);
    purchase.balance = round2(purchase.balance - amount);
    if (purchase.balance > 0) purchase.priority = true; // finish it before others of the same rate
  }

  // 5. Extra payments on interest-bearing debt, most expensive first.
  const destinations: Destination[] = [];
  const open = purchases.filter(p => p.rate > 0 && p.balance > 0);
  for (const account of input.accounts) {
    const mine = open.filter(p => p.account_id === account.id);
    if (mine.length === 0) continue;
    const cutoff = nextCutoff(account);
    if (account.allows_directed_payments) {
      for (const p of mine) destinations.push({ account, purchase: p, balance: p.balance, rate: p.rate, cutoff, priority: p.priority });
    } else {
      destinations.push({
        account, purchase: null, cutoff, priority: false,
        balance: round2(mine.reduce((s, p) => s + p.balance, 0)),
        rate: Math.max(...mine.map(p => p.rate))
      });
    }
  }
  const tenth = (rate: number): number => Math.round(rate * 10);
  destinations.sort((a, b) => {
    if (tenth(a.rate) !== tenth(b.rate)) return tenth(b.rate) - tenth(a.rate);
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (a.cutoff !== b.cutoff) return a.cutoff === null ? 1 : b.cutoff === null ? -1 : a.cutoff < b.cutoff ? -1 : 1;
    return strategy === 'fewer' ? b.balance - a.balance : a.balance - b.balance;
  });

  const remainingPools = [cash, ...incomePools, ...extraPools, ...targeted.map(t => t.pool)].sort(byDate);
  for (const pool of remainingPools) {
    for (const dest of destinations) {
      if (pool.remaining <= 0) break;
      if (dest.balance <= 0) continue;
      const amount = Math.min(pool.remaining, dest.balance);
      const balanceBefore = dest.balance;
      pool.remaining = round2(pool.remaining - amount);
      dest.balance = round2(dest.balance - amount);
      const afterCutoff = dest.cutoff !== null && pool.date > dest.cutoff;
      steps.push({
        order: 0, date: pool.date, due_by: dest.cutoff ?? undefined,
        kind: dest.purchase ? 'directed' : 'extra_capital',
        account_id: dest.account.id, account_name: dest.account.name,
        purchase: dest.purchase
          ? { description: dest.purchase.description, purchase_date: dest.purchase.purchase_date, balance: balanceBefore, rate: dest.rate }
          : undefined,
        amount, source: pool.label, monthly_saving: monthlySaving(amount, dest.rate),
        after_cutoff: afterCutoff || undefined,
        note: dest.purchase ? undefined : `${dest.account.name} no permite abonos dirigidos: pide que el excedente vaya a capital.`
      });
    }
  }

  // 6. Whatever has no destination stays free.
  for (const pool of remainingPools) {
    if (pool.remaining <= 0) continue;
    steps.push({
      order: 0, date: pool.date, kind: 'free', amount: pool.remaining, source: pool.label,
      note: 'No quedan compras con interés por pagar.'
    });
    pool.remaining = 0;
  }

  steps.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : KIND_RANK[a.kind] - KIND_RANK[b.kind]));
  steps.forEach((s, i) => (s.order = i + 1));

  // A directed purchase is finished by the last step that pays it, whichever money pays the rest.
  for (const p of input.purchases) {
    const mine = steps.filter(s => s.kind === 'directed' && s.account_id === p.account_id && s.purchase?.description === p.description);
    mine.forEach(s => (s.finishes_purchase = undefined));
    const paid = round2(mine.reduce((t, s) => t + s.amount, 0));
    if (mine.length > 0 && paid >= p.balance) mine[mine.length - 1].finishes_purchase = true;
  }

  const sum = (kinds: PlanStep['kind'][]): number =>
    round2(steps.filter(s => kinds.includes(s.kind)).reduce((t, s) => t + s.amount, 0));
  return {
    steps,
    totals: {
      inflows,
      minimums: sum(['minimum']),
      fixed: sum(['fixed']),
      reserve: sum(['reserve']),
      extra: sum(['directed', 'extra_capital']),
      free: sum(['free']),
      monthly_saving: round2(steps.reduce((t, s) => t + (s.monthly_saving ?? 0), 0))
    },
    warnings
  };
}
