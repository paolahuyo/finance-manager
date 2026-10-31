import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { balanceAfterPayments, matchDirectedPayment, PurchaseRow } from './directedPayments';

const row = (description: string, purchase_date: string, balance: number): PurchaseRow => ({
  description,
  purchase_date,
  balance_after: balance,
  statement_balance: balance
});

const rows = [
  row('SHOP ALPHA', '2026-08-04', 700000),
  row('STORE BETA', '2026-08-24', 140000),
  row('STORE BETA', '2026-08-24', 10000),
  row('CAFE GAMMA', '2026-09-20', 130000)
];

test('matches the purchase named in the payment text', () => {
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. - SHOP ALPHA (4-ago)', 700000, rows)?.description, 'SHOP ALPHA');
});

test('a partial payment still matches by name when it is not above the balance', () => {
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. - SHOP ALPHA', 200000, rows)?.balance_after, 700000);
});

test('two purchases with the same name are told apart by the exact balance', () => {
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. - STORE BETA', 140000, rows)?.balance_after, 140000);
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. - STORE BETA', 10000, rows)?.balance_after, 10000);
});

test('with the same name and no exact balance it does not guess', () => {
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. - STORE BETA', 5000, rows), null);
});

test('without a name it matches only when exactly one open balance equals the amount', () => {
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. 123456', 130000, rows)?.description, 'CAFE GAMMA');
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. 123456', 99999, rows), null);
});

test('a payment larger than the purchase balance matches nothing', () => {
  assert.equal(matchDirectedPayment('PAGO COMPRA ESPECIF. - SHOP ALPHA', 800000, rows), null);
});

test('payments linked to a purchase lower its balance, others do not', () => {
  const payments = [
    { amount_cop: 200000, linked: { description: 'SHOP ALPHA', purchase_date: '2026-08-04', balance: 700000 } },
    { amount_cop: 50000, linked: { description: 'STORE BETA', purchase_date: '2026-08-24', balance: 140000 } }
  ];
  assert.deepEqual(balanceAfterPayments(rows[0], payments), { balance_after: 500000, paid_since: 200000 });
  assert.deepEqual(balanceAfterPayments(rows[2], payments), { balance_after: 10000, paid_since: 0 });
});

test('a fully paid purchase ends at zero and never below', () => {
  const payments = [{ amount_cop: 700000.004, linked: { description: 'SHOP ALPHA', purchase_date: '2026-08-04', balance: 700000 } }];
  assert.equal(balanceAfterPayments(rows[0], payments).balance_after, 0);
});
