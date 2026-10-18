import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDaviviendaPlan } from './loanPlan';

// Invented numbers with the structure of a Davivienda payment plan.
const page = [
  'PLAN DE PAGOS CRÉDITO NO.',
  'Monto   $   1.000.000,00',
  'Tasa E.A   20,50%',
  'Plazo (meses)*   3',
  'Fecha de Desembolso   24/08/2026',
  'Fecha Próximo Pago   2/10/2026',
  'Número de Cuotas a Facturar   Intereses corrientes   Seguros   Cuota fija mensual',
  '0 $   1.000.000,00',
  '1 $   670.000,00   $   330.000,00   $   15.000,00   $   1.000,00   $   346.000,00',
  '2 $   337.000,00   $   333.000,00   $   12.000,00   $   1.000,00   $   346.000,00'
];
const page2 = [
  'PLAN DE PAGOS CRÉDITO NO.',
  'Cuota fija mensual',
  '2 $   337.000,00   $   333.000,00   $   12.000,00   $   1.000,00   $   346.000,00',
  '3 $   -   $   337.000,00   $   6.000,00   $   1.000,00   $   344.000,00'
];

test('reads conditions and every installment once, including the final "$ -" row', () => {
  const plan = parseDaviviendaPlan([page, page2])!;
  assert.equal(plan.amount, 1_000_000);
  assert.equal(plan.annual_rate, 20.5);
  assert.equal(plan.term_months, 3);
  assert.equal(plan.disbursed_on, '2026-08-24');
  assert.equal(plan.first_due, '2026-10-02');
  assert.deepEqual(plan.rows.map(r => r.n), [1, 2, 3]);
  assert.equal(plan.rows[2].balance_after, 0);
  // capital paid adds up to the amount lent
  assert.equal(plan.rows.reduce((t, r) => t + r.capital, 0), 1_000_000);
});

test('ignores documents that are not a payment plan', () => {
  assert.equal(parseDaviviendaPlan([['Extracto tarjeta', 'Cupo total']]), null);
});
