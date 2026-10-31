import { strict as assert } from 'node:assert';
import { ChildProcess, spawn } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import mysql from 'mysql2/promise';

/**
 * API tests: start the real backend against its OWN database and call it over HTTP.
 * They never touch the real data: the database is dropped and recreated, and the name is checked first.
 * Run with `npm run test:api` (needs the MySQL container up: `docker compose up -d db`).
 */
const TEST_DB = 'finance_manager_test';
const PORT = 5099;
const BASE = `http://localhost:${PORT}/api`;

let server: ChildProcess | undefined;

async function resetDatabase(): Promise<void> {
  assert.ok(TEST_DB.endsWith('_test'), 'refusing to reset a database that is not a test database');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root'
  });
  await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await connection.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
  await connection.end();
}

async function waitUntilReady(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${BASE}/categories`);
      if (response.ok) return;
    } catch {
      // server still starting
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('The test server did not start');
}

const api = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};

const today = (): string => new Date().toISOString().slice(0, 10);
const thisMonth = (): string => today().slice(0, 7);

before(async () => {
  await resetDatabase();
  server = spawn('node', ['--require', 'ts-node/register', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PORT), DB_NAME: TEST_DB, DB_HOST: process.env.DB_HOST || 'localhost' },
    stdio: 'ignore'
  });
  await waitUntilReady();
});

after(() => {
  server?.kill();
});

describe('cards and movements', () => {
  test('an expense raises the balance and a payment lowers it', async () => {
    const created = await api('POST', '/accounts', { name: 'Tarjeta de prueba', kind: 'credit_card', opening_balance: 0 });
    assert.equal(created.status, 201);
    const id = created.data.id;

    assert.equal((await api('POST', '/transactions', { type: 'expense', description: 'Compra', amount: 100000, date: today(), account_id: id })).status, 201);
    assert.equal((await api('POST', '/transactions', { type: 'payment', description: 'Abono', amount: 40000, date: today(), account_id: id })).status, 201);

    const accounts = await api('GET', `/accounts?month=${thisMonth()}`);
    const card = accounts.data.find((a: any) => a.id === id);
    assert.equal(card.balance, 60000);
  });

  test('a payment without a card is rejected', async () => {
    const result = await api('POST', '/transactions', { type: 'payment', description: 'Abono suelto', amount: 1000, date: today() });
    assert.equal(result.status, 400);
  });

  test('a payment is not counted as an expense in the month summary', async () => {
    const summary = await api('GET', `/summary?month=${thisMonth()}`);
    assert.equal(summary.data.expense, 100000);
    assert.equal(summary.data.payments, 40000);
  });
});

describe('fixed monthly items', () => {
  test('are created once in the current month, never twice, and never in months before they existed', async () => {
    const created = await api('POST', '/recurring', { type: 'expense', description: 'Gasto fijo de prueba', amount: 50000, day_of_month: 1 });
    assert.equal(created.status, 201);

    const past = await api('POST', `/recurring/apply?month=2020-01&today=${today()}`);
    assert.equal(past.data.created, 0, 'must not create movements for a month before the item existed');

    const first = await api('POST', `/recurring/apply?month=${thisMonth()}&today=${today()}`);
    assert.equal(first.data.created, 1);
    const again = await api('POST', `/recurring/apply?month=${thisMonth()}&today=${today()}`);
    assert.equal(again.data.created, 0, 'applying twice must not duplicate');
  });
});

describe('editing fixed monthly items', () => {
  test('an item can be edited, and editing one that does not exist is a 404', async () => {
    const created = await api('POST', '/recurring', { type: 'expense', description: 'Fijo editable', amount: 20000, day_of_month: 5 });
    const id = created.data.id;
    const edited = await api('PUT', `/recurring/${id}`, { type: 'expense', description: 'Fijo editado', amount: 25000, day_of_month: 5 });
    assert.equal(edited.status, 200);
    const list = (await api('GET', '/recurring')).data;
    assert.equal(list.find((r: any) => r.id === id).amount_cop, 25000);

    assert.equal((await api('PUT', '/recurring/999999', { type: 'expense', description: 'Nada', amount: 1000, day_of_month: 5 })).status, 404);
  });
});

describe('month tags', () => {
  test('a month can be marked as a trip and unmarked', async () => {
    assert.equal((await api('PUT', '/month-tags/2026-07', { tag: 'viaje' })).status, 200);
    assert.deepEqual((await api('GET', '/month-tags')).data, [{ month: '2026-07', tag: 'viaje' }]);
    assert.equal((await api('DELETE', '/month-tags/2026-07')).status, 204);
    assert.deepEqual((await api('GET', '/month-tags')).data, []);
  });

  test('an invalid month is rejected', async () => {
    assert.equal((await api('PUT', '/month-tags/2026-13', { tag: 'viaje' })).status, 400);
  });
});

describe('monthly history', () => {
  test('returns the requested number of months, oldest first, ending in the current month', async () => {
    const history = (await api('GET', '/summary/history?months=4')).data;
    assert.equal(history.length, 4);
    assert.equal(history[3].month, thisMonth());
    assert.deepEqual(history.map((p: any) => p.month), [...history.map((p: any) => p.month)].sort());
  });
});

describe('subscriptions', () => {
  test('a hand-written subscription is listed, can be marked to cancel and removed', async () => {
    const added = await api('POST', '/subscriptions/manual', { name: 'Servicio de prueba', amount: 10000 });
    assert.equal(added.status, 201);

    let list = (await api('GET', '/subscriptions')).data;
    const sub = list.subscriptions.find((s: any) => s.name === 'Servicio de prueba');
    assert.equal(sub.annual_cost, 120000);
    assert.equal(list.totals.cancel_yearly, 0);

    await api('PUT', `/subscriptions/${encodeURIComponent(sub.key)}`, { status: 'cancel' });
    list = (await api('GET', '/subscriptions')).data;
    assert.equal(list.totals.cancel_yearly, 120000);

    assert.equal((await api('DELETE', `/subscriptions/manual/${sub.manual_id}`)).status, 204);
    list = (await api('GET', '/subscriptions')).data;
    assert.equal(list.subscriptions.some((s: any) => s.name === 'Servicio de prueba'), false);
    assert.equal(list.totals.cancel_yearly, 0, 'the decision about a removed subscription is cleaned up too');
  });

  test('deleting a manual subscription that does not exist or has a bad id fails clearly', async () => {
    assert.equal((await api('DELETE', '/subscriptions/manual/999999')).status, 404);
    assert.equal((await api('DELETE', '/subscriptions/manual/abc')).status, 400);
  });

  test('a subscription without a name or amount is rejected', async () => {
    assert.equal((await api('POST', '/subscriptions/manual', { name: '', amount: 5000 })).status, 400);
    assert.equal((await api('POST', '/subscriptions/manual', { name: 'Sin monto', amount: 0 })).status, 400);
  });

  test('the same merchant charged in two months is detected on its own', async () => {
    const card = (await api('POST', '/accounts', { name: 'Tarjeta suscripciones', kind: 'credit_card', opening_balance: 0 })).data.id;
    for (const date of ['2026-08-05', '2026-09-05']) {
      await api('POST', '/transactions', { type: 'expense', description: 'STREAMLY*AB12CD', amount: 30000, date, account_id: card });
    }
    const detected = (await api('GET', '/subscriptions')).data.subscriptions.find((s: any) => s.key === 'STREAMLY');
    assert.ok(detected, 'STREAMLY should be detected');
    assert.equal(detected.typical_amount, 30000);
    assert.equal(detected.months.length, 2);
  });
});

describe('loans', () => {
  test('a loan keeps its balance and the account list tells loans apart from cards', async () => {
    const created = await api('POST', '/accounts', { name: 'Préstamo de prueba', kind: 'loan', opening_balance: 5000000, annual_rate: 15 });
    assert.equal(created.status, 201);
    const accounts = (await api('GET', `/accounts?month=${thisMonth()}`)).data;
    const loan = accounts.find((a: any) => a.name === 'Préstamo de prueba');
    assert.equal(loan.kind, 'loan');
    assert.equal(loan.balance, 5000000);
  });
});

describe('directed payments', () => {
  const seedPurchase = async (accountId: number): Promise<void> => {
    const db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: TEST_DB
    });
    await db.query(
      `INSERT INTO statement_installments
        (account_id, cutoff, purchase_date, description, original_value, installment_no, installments_total, balance_before, capital_paid, balance_after, rate)
       VALUES (?, '2026-09-30', '2026-08-04', 'SHOP ALPHA', 700000, 1, 36, 700000, 0, 700000, 29.6)`,
      [accountId]
    );
    await db.end();
  };
  const firstRow = async (accountId: number): Promise<any> =>
    (await api('GET', '/accounts/installments')).data.find((c: any) => c.account_id === accountId).rows[0];

  test('a payment to a purchase lowers the balance the card shows, and keeps the statement balance', async () => {
    const id = (await api('POST', '/accounts', { name: 'Tarjeta con cuotas', kind: 'credit_card', opening_balance: 0 })).data.id;
    await seedPurchase(id);
    await api('POST', '/transactions', { type: 'payment', description: 'PAGO COMPRA ESPECIF. — SHOP ALPHA (4-ago)', amount: 200000, date: '2026-10-30', account_id: id });

    const row = await firstRow(id);
    assert.equal(row.statement_balance, 700000);
    assert.equal(row.paid_since, 200000);
    assert.equal(row.balance_after, 500000);
  });

  test('paying the whole purchase leaves it at zero', async () => {
    const id = (await api('POST', '/accounts', { name: 'Tarjeta pagada', kind: 'credit_card', opening_balance: 0 })).data.id;
    await seedPurchase(id);
    await api('POST', '/transactions', { type: 'payment', description: 'PAGO COMPRA ESPECIF. — SHOP ALPHA', amount: 700000, date: '2026-10-30', account_id: id });
    assert.equal((await firstRow(id)).balance_after, 0);
  });

  test('an ordinary payment is not tied to any purchase', async () => {
    const id = (await api('POST', '/accounts', { name: 'Tarjeta pago normal', kind: 'credit_card', opening_balance: 0 })).data.id;
    await seedPurchase(id);
    await api('POST', '/transactions', { type: 'payment', description: 'Pago mínimo', amount: 100000, date: '2026-10-30', account_id: id });
    assert.equal((await firstRow(id)).balance_after, 700000);
  });
});
