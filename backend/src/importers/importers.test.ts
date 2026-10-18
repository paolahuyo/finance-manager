import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatement } from './index';
import { suggestCategoryName } from './categorize';
import type { StatementPages } from './types';

// All data below is invented; it only mimics the structure of real statements.

const bbva: StatementPages = [
  [
    'Extracto',
    '22,000,000.00   1,300.00   30-09-2026   1,000.00   15-10-2026',
    'MOVIMIENTOS ANTERIORES',
    '01012026   000000   OLD STORE   24.33   02 DE 12   1,200.00   600.00   100.00   500.00',
    '02012026   000000   OTHER SHOP   .00   03 DE 06   1,800.00   1,200.00   200.00   1,000.00',
    'MOVIMIENTOS DE ESTE MES',
    '05092026   000000   TEST SHOP   29.21   00 DE 36   320,000.00   320,000.00   00.00   320,000.00',
    '05092026   000000   TEST SHOP   USD   *****   *****   100.00   *****   *****   *****',
    '06092026   000000   LOCAL STORE   29.21   00 DE 06   50,000.00   50,000.00   00.00   50,000.00',
    '06092026   000000   LOCAL STORE   COP   *****   *****   50,000.00   *****   *****   *****',
    '15092026   000000   PAGO X PSE.   123456   - 700,000.00',
    '16092026   000000   SOME REFUND   - 20,000.00'
  ]
];

const nu: StatementPages = [
  [
    'Fecha límite de pago   Fecha de corte   Periodo facturado',
    '03 NOV 2026   12 OCT 2026   11 SEP 2026 - 11 OCT 2026',
    'Resumen de tu extracto',
    'Intereses   + $1.000,00',
    'Comisiones de avances   + $0,00',
    'Cargos por conversión   + $150,00'
  ],
  [
    '09 OCT   Shop One   $12.000,00   1 de 1   $12.000,00   2.09%   $0,00   $12.000,00   $0,00',
    '2026',
    '03 OCT   Pago   $30.000,00   $0,00   $0,00',
    '↪ A capital $0,00',
    '2026',
    '↪ A intereses $29.000,00',
    '↪ A cargos y comisiones $1.000,00',
    '24 SEP   Foreign Shop   $32.000,00   1 de 1   $32.000,00   2.12%   $0,00   $32.000,00   $0,00',
    '2026   ↪ Comisión por cambio de moneda   $150,00',
    '15 JUN   Old Purchase   $144.000,00   4 de 6   $24.000,00   0.00%   $0,00   $24.000,00   $48.000,00',
    '2026'
  ]
];

const bogota: StatementPages = [
  [
    'Extracto período',
    'Del 31/JUL/2026 al 31/AGO/2026',
    'Cupo total   Cupo disponible compras o avances   Pago total',
    'Periodo de facturación   Del 31/JUL/2026 al 31/AGO/2026   Saldo anterior   0,00',
    'Paga antes de   15/SEP/2026   Consumo al mes   104.200,00',
    'Pago mínimo   40.000,00   Intereses corrientes   500,00',
    'Otros cargos   4.200,00',
    'Cuota de manejo   0,00',
    '26/08/09   0000   TEST ONE   100.000,00   4.166,67   95.833,33   23/24   29,63%',
    '26/08/22   0000   TEST TWO   6.000,00   6.000,00   0/1   29,63%',
    '26/08/31   6606   SEGURO DE VIDA DEUDOR   4.200,00   4.200,00   0,00%',
    '26/06/10   0000   OLD ONE   50.000,00   2.000,00   40.000,00   12/24   29,63%'
  ]
];

const sum = (items: { amount_cop: number }[]): number => items.reduce((t, i) => t + i.amount_cop, 0);
const ofKind = <T extends { kind: string }>(items: T[], kind: string): T[] => items.filter(i => i.kind === kind);

test('BBVA: new purchases only, USD pairs, payment, refund flagged, derived interest', () => {
  const r = parseStatement(bbva)!;
  assert.equal(r.bank, 'BBVA');
  assert.equal(r.skipped_installments, 2);

  const purchases = ofKind(r.items, 'purchase');
  assert.equal(purchases.length, 2);
  assert.equal(sum(purchases), 370_000);
  assert.equal(purchases[0].original_currency, 'USD');
  assert.equal(purchases[0].original_amount, 100);
  assert.equal(purchases[0].exchange_rate, 3200);
  assert.equal(purchases[1].original_currency, undefined);

  assert.equal(sum(ofKind(r.items, 'payment')), 700_000);
  const credit = ofKind(r.items, 'credit');
  assert.equal(credit.length, 1);
  assert.equal(credit[0].selected, false, 'refunds must not be pre-selected');

  const interest = ofKind(r.items, 'interest');
  assert.equal(interest.length, 1);
  assert.equal(interest[0].amount_cop, 1000);
  assert.equal(interest[0].date, '2026-09-30');
});

test('BBVA: warns instead of inventing interest when it cannot be derived', () => {
  const pages: StatementPages = [[...bbva[0].filter(l => !l.includes('1,300.00') && !l.includes('1,000.00   15-10'))]];
  const r = parseStatement(pages)!;
  assert.equal(ofKind(r.items, 'interest').length, 0);
  assert.ok(r.warnings.some(w => w.includes('interés')));
});

test('Nu: period filter, year on next line, payment split, FX fee, summary interest', () => {
  const r = parseStatement(nu)!;
  assert.equal(r.bank, 'Nu');
  assert.equal(r.period_start, '2026-09-11');
  assert.equal(r.period_end, '2026-10-11');
  assert.equal(r.skipped_installments, 1);

  const purchases = ofKind(r.items, 'purchase');
  assert.deepEqual(purchases.map(p => [p.date, p.amount_cop]), [['2026-10-09', 12000], ['2026-09-24', 32000]]);

  const fee = ofKind(r.items, 'fee');
  assert.equal(fee.length, 1);
  assert.equal(fee[0].amount_cop, 150);
  assert.equal(fee[0].date, '2026-09-24');

  const payment = ofKind(r.items, 'payment');
  assert.equal(payment.length, 1);
  assert.equal(payment[0].amount_cop, 30000);
  assert.match(payment[0].note ?? '', /intereses \$29\.000,00/);

  assert.equal(ofKind(r.items, 'interest')[0].amount_cop, 1000);
  assert.deepEqual(r.warnings, [], 'fees match the summary, so no warnings');
});

test('Banco de Bogotá: purchases match the summary, insurance becomes a fee, old installments skipped', () => {
  const r = parseStatement(bogota)!;
  assert.equal(r.bank, 'Banco de Bogotá');
  assert.equal(r.period_end, '2026-08-31');
  assert.equal(r.skipped_installments, 1);

  const purchases = ofKind(r.items, 'purchase');
  assert.equal(sum(purchases), 106_000);
  assert.equal(purchases[0].date, '2026-08-09');

  const fee = ofKind(r.items, 'fee');
  assert.equal(fee.length, 1);
  assert.equal(fee[0].amount_cop, 4200);
  assert.equal(ofKind(r.items, 'interest')[0].amount_cop, 500);
  assert.deepEqual(r.warnings, []);
});

test('unknown layouts are not guessed', () => {
  assert.equal(parseStatement([['Hola', 'esto no es un extracto']]), null);
});

test('category suggestions', () => {
  assert.equal(suggestCategoryName('UBER *TRIP'), 'Transporte');
  assert.equal(suggestCategoryName('UBER *EATS HELP.UBER.COM'), 'Alimentación');
  assert.equal(suggestCategoryName('APPLE.COM/BILL'), 'Entretenimiento');
  assert.equal(suggestCategoryName('WALGREENS ?0194'), 'Salud');
  assert.equal(suggestCategoryName('MERCADO PAGO*ZONAFIT'), null);
});
