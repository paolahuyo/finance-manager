import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePaymentPlan, PlanInput } from './paymentPlan';

// Invented data only.
const base = (): PlanInput => ({
  today: '2026-03-10',
  cash_now: 2_000_000,
  reserve_one_installment: 800_000,
  strategy: 'fewer',
  extra_incomes: [{ description: 'Venta equipo', amount: 1_000_000, date: '2026-03-20', target: { account_id: 1, description: 'LAPTOP' } }],
  recurring: [
    { type: 'income', description: 'Sueldo', amount: 5_000_000, day_of_month: 25 },
    { type: 'expense', description: 'Arriendo', amount: 1_500_000, day_of_month: 25 }
  ],
  accounts: [
    { id: 1, name: 'Tarjeta A', allows_directed_payments: true, cutoff_day: 30, due_date: '2026-03-30', minimum_pending: 600_000 },
    { id: 2, name: 'Tarjeta B', allows_directed_payments: false, cutoff_day: 28, due_date: '2026-03-15', minimum_pending: 200_000 },
    { id: 3, name: 'Tarjeta C', allows_directed_payments: true, cutoff_day: 15, due_date: '2026-04-05', minimum_pending: 300_000 }
  ],
  purchases: [
    { account_id: 1, description: 'LAPTOP', purchase_date: '2025-12-01', balance: 1_200_000, rate: 29.0 },
    { account_id: 1, description: 'TIENDA X', purchase_date: '2026-01-05', balance: 300_000, rate: 29.5 },
    { account_id: 1, description: 'SUPER Y', purchase_date: '2026-02-01', balance: 100_000, rate: 0 },
    { account_id: 2, description: 'diferido', purchase_date: '2025-11-01', balance: 900_000, rate: 29.8 },
    { account_id: 3, description: 'VIAJE', purchase_date: '2025-10-01', balance: 2_000_000, rate: 28.0 }
  ]
});

const checkInvariant = (plan: ReturnType<typeof generatePaymentPlan>): void => {
  const t = plan.totals;
  assert.equal(Math.round(t.inflows * 100), Math.round((t.minimums + t.fixed + t.reserve + t.extra + t.free) * 100));
};

test('acceptance example', () => {
  const plan = generatePaymentPlan(base());
  const rows = plan.steps.map(s => [s.order, s.date, s.kind, s.account_name ?? '', s.purchase?.description ?? '', s.amount, s.source]);
  assert.deepEqual(rows, [
    [1, '2026-03-10', 'minimum', 'Tarjeta B', '', 200_000, 'Dinero de hoy'],
    [2, '2026-03-10', 'extra_capital', 'Tarjeta B', '', 900_000, 'Dinero de hoy'],
    [3, '2026-03-10', 'directed', 'Tarjeta A', 'TIENDA X', 300_000, 'Dinero de hoy'],
    [4, '2026-03-10', 'directed', 'Tarjeta A', 'LAPTOP', 200_000, 'Dinero de hoy'],
    [5, '2026-03-10', 'directed', 'Tarjeta C', 'VIAJE', 400_000, 'Dinero de hoy'],
    [6, '2026-03-20', 'directed', 'Tarjeta A', 'LAPTOP', 1_000_000, 'Venta equipo'],
    [7, '2026-03-25', 'fixed', '', '', 1_500_000, 'Sueldo 25 mar'],
    [8, '2026-03-25', 'minimum', 'Tarjeta A', '', 600_000, 'Sueldo 25 mar'],
    [9, '2026-03-25', 'minimum', 'Tarjeta C', '', 300_000, 'Sueldo 25 mar'],
    [10, '2026-03-25', 'reserve', '', '', 800_000, 'Sueldo 25 mar'],
    [11, '2026-03-25', 'directed', 'Tarjeta C', 'VIAJE', 1_600_000, 'Sueldo 25 mar'],
    [12, '2026-03-25', 'free', '', '', 200_000, 'Sueldo 25 mar']
  ]);
  assert.equal(plan.steps[2].finishes_purchase, true);
  assert.equal(plan.steps[5].finishes_purchase, true);
  assert.equal(plan.steps[10].finishes_purchase, true);
  assert.deepEqual(
    { ...plan.totals, monthly_saving: 0 },
    { inflows: 8_000_000, minimums: 1_100_000, fixed: 1_500_000, reserve: 800_000, extra: 4_400_000, free: 200_000, monthly_saving: 0 }
  );
  assert.ok(plan.totals.monthly_saving > 0);
  assert.equal(plan.steps.some(s => s.purchase?.description === 'SUPER Y'), false);
  assert.deepEqual(plan.warnings, []);
  checkInvariant(plan);
});

test('a minimum that cannot be covered pays what exists and warns', () => {
  const input = base();
  input.cash_now = 50_000;
  input.extra_incomes = [];
  input.recurring = [{ type: 'income', description: 'Sueldo', amount: 100_000, day_of_month: 25 }];
  const plan = generatePaymentPlan(input);
  const b = plan.steps.filter(s => s.kind === 'minimum' && s.account_id === 2);
  assert.equal(b.reduce((t, s) => t + s.amount, 0), 50_000);
  assert.ok(plan.warnings.some(w => w.includes('Tarjeta B')));
  checkInvariant(plan);
});

test('account without directed payments gets a single destination at its highest rate', () => {
  const input = base();
  input.extra_incomes = [];
  input.purchases = [
    { account_id: 2, description: 'a', purchase_date: '2026-01-01', balance: 400_000, rate: 25 },
    { account_id: 2, description: 'b', purchase_date: '2026-01-02', balance: 600_000, rate: 29.8 }
  ];
  const plan = generatePaymentPlan(input);
  const extras = plan.steps.filter(s => s.kind === 'extra_capital');
  assert.equal(extras.length, 1);
  assert.equal(extras[0].amount, 1_000_000);
  assert.equal(extras[0].purchase, undefined);
  assert.match(extras[0].note ?? '', /capital/);
  checkInvariant(plan);
});

test('a payment dated after the cut-off is flagged', () => {
  const input = base();
  input.extra_incomes = [];
  input.cash_now = 0;
  input.accounts = [input.accounts[2]]; // Tarjeta C cuts on day 15
  input.purchases = [input.purchases[4]];
  const plan = generatePaymentPlan(input);
  const viaje = plan.steps.find(s => s.purchase?.description === 'VIAJE')!;
  assert.equal(viaje.date, '2026-03-25');
  assert.equal(viaje.due_by, '2026-03-15');
  assert.equal(viaje.after_cutoff, true);
  checkInvariant(plan);
});

test('extra income larger than its purchase returns the surplus to the pool', () => {
  const input = base();
  input.extra_incomes = [{ description: 'Bono', amount: 500_000, date: '2026-03-12', target: { account_id: 1, description: 'TIENDA X' } }];
  const plan = generatePaymentPlan(input);
  const targetStep = plan.steps.find(s => s.source === 'Bono' && s.purchase?.description === 'TIENDA X')!;
  assert.equal(targetStep.amount, 300_000);
  assert.equal(targetStep.finishes_purchase, true);
  const surplus = plan.steps.filter(s => s.source === 'Bono' && s !== targetStep).reduce((t, s) => t + s.amount, 0);
  assert.equal(surplus, 200_000);
  checkInvariant(plan);
});

test('finish strategy pays small balances first among equal rates', () => {
  const input = base();
  input.extra_incomes = [];
  input.cash_now = 500_000;
  input.reserve_one_installment = 0;
  input.accounts = [{ id: 1, name: 'Tarjeta A', allows_directed_payments: true, cutoff_day: 30, due_date: null, minimum_pending: 0 }];
  input.purchases = [
    { account_id: 1, description: 'GRANDE', purchase_date: '2026-01-01', balance: 900_000, rate: 29 },
    { account_id: 1, description: 'CHICA', purchase_date: '2026-01-02', balance: 200_000, rate: 29 }
  ];
  const first = (strategy: 'fewer' | 'finish'): string =>
    generatePaymentPlan({ ...input, strategy }).steps.find(s => s.kind === 'directed')!.purchase!.description;
  assert.equal(first('fewer'), 'GRANDE');
  assert.equal(first('finish'), 'CHICA');
});
