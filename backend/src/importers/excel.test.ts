import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { isXlsx, parseBbvaExcel } from './excel';

// Invented data that only mimics the structure of the BBVA export.
async function workbook(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Movimientos');
  ws.addRow([null, null, null, null]);
  ws.addRow(['Estimado(a) cliente:']);
  ws.addRow(['Descripción', 'Monto', 'Estado', 'Fecha']);
  rows.forEach(r => ws.addRow(r));
  ws.addRow(['Cordial saludo,', 'Cordial saludo,', 'Cordial saludo,', 'Cordial saludo,']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('classifies purchases, special payments, card payments and adjustments', async () => {
  const buffer = await workbook([
    ['PAGO COMPRA ESPECIF. 123456', '$ 70.000,50', null, '2026-10-09'],
    ['PAGO X PSE.       98765', '$ 500.000,00', null, '2026-09-15'],
    ['PAGO TARJETA DE CRED', '$ 100.000,00', null, '2026-09-30'],
    ['ABONO AJ EXTRACO', '$ 6.889,00', null, '2026-09-30'],
    ['TEST SHOP', '$ 1.234.567,89', null, '2026-09-20']
  ]);
  assert.ok(isXlsx(buffer));
  const r = (await parseBbvaExcel(buffer))!;
  assert.equal(r.format, 'excel');
  assert.equal(r.items.length, 5);
  const by = (d: string) => r.items.find(i => i.description.startsWith(d))!;
  assert.equal(by('PAGO COMPRA').kind, 'payment');
  assert.match(by('PAGO COMPRA').note ?? '', /123456/);
  assert.equal(by('PAGO COMPRA').amount_cop, 70000.5);
  assert.equal(by('PAGO X PSE').kind, 'payment');
  assert.equal(by('PAGO TARJETA').kind, 'payment');
  assert.equal(by('ABONO').kind, 'credit');
  assert.equal(by('ABONO').selected, false);
  assert.equal(by('TEST SHOP').kind, 'purchase');
  assert.equal(by('TEST SHOP').amount_cop, 1234567.89);
  assert.equal(r.period_start, '2026-09-15');
  assert.equal(r.period_end, '2026-10-09');
});

test('flags the later row of a same-merchant, same-amount pair as a possible refund', async () => {
  const buffer = await workbook([
    ['SOME STORE*AB12', '$ 239.797,13', null, '2026-09-26'],
    ['SOME STORE*CD34', '$ 239.797,13', null, '2026-09-28'],
    ['OTHER PLACE', '$ 239.797,13', null, '2026-09-29'],
    ['SOME STORE*EF56', '$ 239.797,13', null, '2026-10-20']
  ]);
  const r = (await parseBbvaExcel(buffer))!;
  const byDate = (d: string) => r.items.find(i => i.date === d)!;
  assert.equal(byDate('2026-09-26').kind, 'purchase');
  assert.equal(byDate('2026-09-28').kind, 'credit');
  assert.equal(byDate('2026-09-28').selected, false);
  assert.equal(byDate('2026-09-29').kind, 'purchase', 'different merchant is a normal purchase');
  assert.equal(byDate('2026-10-20').kind, 'purchase', 'more than a week later is a new purchase');
});

test('ignores the legal footer and unrelated workbooks', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Otra').addRow(['a', 'b']);
  assert.equal(await parseBbvaExcel(Buffer.from(await wb.xlsx.writeBuffer())), null);
  assert.equal(isXlsx(Buffer.from('%PDF-1.4 ...')), false);
});
