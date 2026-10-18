import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchSpecialPayments, Snapshot } from './linkPayments';

// Invented data.
const sep: Snapshot = {
  cutoff: '2026-09-15',
  rows: [
    { purchase_date: '2026-08-01', description: 'SHOP A', original_value: 300000, balance_after: 120000 },
    { purchase_date: '2026-08-05', description: 'SHOP B', original_value: 90000, balance_after: 60000 },
    { purchase_date: '2026-08-07', description: 'SHOP C', original_value: 50000, balance_after: 45000 },
    { purchase_date: '2026-08-09', description: 'SHOP D', original_value: 70000, balance_after: 45000 }
  ]
};
const oct: Snapshot = {
  cutoff: '2026-10-15',
  rows: [{ purchase_date: '2026-08-05', description: 'SHOP B', original_value: 90000, balance_after: 55000 }]
};

test('links a payment to the purchase whose balance it settled and that then disappeared', () => {
  const links = matchSpecialPayments([{ id: 1, date: '2026-10-09', amount: 120000 }], [sep, oct]);
  assert.deepEqual(links.map(l => [l.paymentId, l.purchase.description]), [[1, 'SHOP A']]);
});

test('does not link to a purchase that is still in the next statement', () => {
  assert.equal(matchSpecialPayments([{ id: 2, date: '2026-10-09', amount: 60000 }], [sep, oct]).length, 0);
});

test('does not guess when two purchases have the same balance', () => {
  assert.equal(matchSpecialPayments([{ id: 3, date: '2026-10-09', amount: 45000 }], [sep, oct]).length, 0);
});

test('needs a statement before the payment', () => {
  assert.equal(matchSpecialPayments([{ id: 4, date: '2026-09-01', amount: 120000 }], [sep, oct]).length, 0);
});

test('one purchase is never linked to two payments', () => {
  const links = matchSpecialPayments(
    [{ id: 5, date: '2026-10-09', amount: 120000 }, { id: 6, date: '2026-10-10', amount: 120000 }],
    [sep, oct]
  );
  assert.equal(links.length, 1);
});
