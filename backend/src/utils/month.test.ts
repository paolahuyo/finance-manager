import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { appliesInMonth, shiftMonth } from './month';

test('a fixed monthly item is not applied to months before it was created', () => {
  assert.equal(appliesInMonth('2026-10', '2026-09'), false);
  assert.equal(appliesInMonth('2026-10', '2026-08'), false);
});

test('a fixed monthly item applies in its creation month and every later month', () => {
  assert.equal(appliesInMonth('2026-10', '2026-10'), true);
  assert.equal(appliesInMonth('2026-10', '2026-11'), true);
  assert.equal(appliesInMonth('2026-10', '2027-01'), true);
});

test('shiftMonth moves across year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-10', -5), '2026-05');
});
