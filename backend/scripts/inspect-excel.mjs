#!/usr/bin/env node
/**
 * Describes the STRUCTURE of Excel files (sheets, headers, column types and value "shapes")
 * without printing cell contents: letters become A/a and digits become 9, except a short list
 * of finance words so headers stay readable.
 *   node scripts/inspect-excel.mjs <file.xlsx> [...]
 */
import { basename, resolve } from 'node:path';
import ExcelJS from 'exceljs';

const KEEP = new Set(`fecha descripcion descripción valor monto movimiento movimientos tipo concepto saldo cuota cuotas interes interés intereses
capital abono abonos pago pagos compra compras avance avances comision comisión cargo cargos credito crédito debito débito moneda
referencia autorizacion autorización tarjeta cuenta estado categoria categoría ciudad pais país comercio establecimiento total
numero número operacion operación hora transaccion transacción tasa plazo disponible cupo usd cop`.split(/\s+/));

const strip = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const shape = value => {
  let s = String(value ?? '');
  s = s.replace(/[\p{L}]+/gu, w => (KEEP.has(w.toLowerCase()) || KEEP.has(strip(w)) ? w.toLowerCase() : (w === w.toUpperCase() ? 'A' : 'a').repeat(Math.min(w.length, 6))));
  return s.replace(/\d/g, '9').slice(0, 40);
};
const kind = v => (v instanceof Date ? 'fecha' : typeof v === 'number' ? 'número' : typeof v === 'object' && v ? 'objeto' : v === null || v === undefined || v === '' ? 'vacío' : 'texto');

for (const file of process.argv.slice(2).map(f => resolve(f))) {
  console.log(`\n===== ${basename(file)}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  for (const ws of wb.worksheets) {
    console.log(`\nHoja "${shape(ws.name)}": ${ws.rowCount} filas × ${ws.columnCount} columnas`);
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => rows.push({ n, values: row.values.slice(1) }));
    console.log('Primeras filas (forma):');
    for (const r of rows.slice(0, 8)) console.log(`  fila ${String(r.n).padStart(2)}: ${r.values.map(shape).join(' | ')}`);
    // columnas: tipos observados en las filas de datos (todas menos las 8 primeras si hay muchas)
    const body = rows.length > 10 ? rows.slice(8) : rows.slice(1);
    const width = Math.max(...rows.map(r => r.values.length), 0);
    console.log(`Tipos por columna (en ${body.length} filas de datos):`);
    for (let c = 0; c < width; c++) {
      const counts = {};
      for (const r of body) counts[kind(r.values[c])] = (counts[kind(r.values[c])] ?? 0) + 1;
      console.log(`  col ${c + 1}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
  }
}
