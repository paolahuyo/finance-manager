import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { detectSubscriptions, merchantKey } from './subscriptions';

const charge = (description: string, amount_cop: number, date: string) => ({ description, amount_cop, date });

test('merchantKey drops reference codes and payment-processor prefixes', () => {
  assert.equal(merchantKey('STREAMLY*AB12CD'), 'STREAMLY');
  assert.equal(merchantKey('SQ *CAFE CENTRAL LLC'), 'CAFE CENTRAL LLC');
  assert.equal(merchantKey('Tienda Online INC* W0P5XZZA'), 'TIENDA ONLINE INC');
  assert.equal(merchantKey('MARKET PLACE*5R9HL27P2'), 'MARKET PLACE');
});

test('a stable monthly charge in several months is a subscription with its yearly cost', () => {
  const result = detectSubscriptions([
    charge('STREAMLY*AB12CD', 30000, '2026-08-05'),
    charge('STREAMLY*ZZ99XX', 30000, '2026-09-05'),
    charge('STREAMLY*QQ11WW', 31000, '2026-10-05')
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'STREAMLY');
  assert.equal(result[0].typical_amount, 30000);
  assert.equal(result[0].annual_cost, 360000);
  assert.deepEqual(result[0].months, ['2026-08', '2026-09', '2026-10']);
  assert.equal(result[0].last_date, '2026-10-05');
});

test('a merchant seen in one month only is not a subscription', () => {
  assert.equal(detectSubscriptions([charge('GYM CLUB', 90000, '2026-10-01'), charge('GYM CLUB', 90000, '2026-10-20')]).length, 0);
});

test('many charges per month with very different amounts (taxis, groceries) are not subscriptions', () => {
  const rows = [
    charge('TAXI APP TRIP', 8000, '2026-09-01'),
    charge('TAXI APP TRIP', 25000, '2026-09-04'),
    charge('TAXI APP TRIP', 12000, '2026-09-09'),
    charge('TAXI APP TRIP', 40000, '2026-10-02'),
    charge('TAXI APP TRIP', 9000, '2026-10-06'),
    charge('TAXI APP TRIP', 31000, '2026-10-11')
  ];
  assert.equal(detectSubscriptions(rows).length, 0);
});

test('two near-identical charges within a few days are flagged as a possible duplicate', () => {
  const result = detectSubscriptions([
    charge('APP PRAYER INC', 240000, '2026-09-26'),
    charge('APP PRAYER INC', 240000, '2026-09-28'),
    charge('APP PRAYER INC', 236000, '2026-10-06')
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].possible_duplicate, true);
});

test('a regular monthly charge is not flagged as duplicate', () => {
  const result = detectSubscriptions([
    charge('STREAMLY*AB12CD', 30000, '2026-08-05'),
    charge('STREAMLY*ZZ99XX', 30000, '2026-09-05')
  ]);
  assert.equal(result[0].possible_duplicate, false);
});

test('results are sorted by yearly cost, highest first', () => {
  const result = detectSubscriptions([
    charge('SMALL APP', 5000, '2026-09-01'),
    charge('SMALL APP', 5000, '2026-10-01'),
    charge('BIG SERVICE', 80000, '2026-09-10'),
    charge('BIG SERVICE', 80000, '2026-10-10')
  ]);
  assert.deepEqual(result.map(r => r.key), ['BIG SERVICE', 'SMALL APP']);
});
