import assert from 'node:assert/strict';
import { test } from 'node:test';
import { occurrenceDate } from './Recurring';

test('monthly day falls back to the last day of short months', () => {
  assert.equal(occurrenceDate('2026-10', 24), '2026-10-24');
  assert.equal(occurrenceDate('2026-02', 31), '2026-02-28');
  assert.equal(occurrenceDate('2028-02', 30), '2028-02-29');
});
