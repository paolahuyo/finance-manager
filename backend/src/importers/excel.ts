import ExcelJS from 'exceljs';
import type { DraftItem, ParsedStatement } from './types';

// BBVA online-banking export: one sheet with the header "Descripción | Monto | Estado | Fecha".
// Amounts are text like "$ 1.234,56" and are positive for purchases AND payments.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const normalize = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const toNumber = (s: string): number => Number(s.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.'));
const clean = (s: string): string => s.replace(/\s{2,}/g, ' ').trim();
const dayNumber = (iso: string): number => Math.round(Date.parse(iso) / 86_400_000);
const merchantKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);

export function isXlsx(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

type Kind = DraftItem['kind'];
function classify(description: string): { kind: Kind; note?: string } {
  const special = description.match(/^PAGO COMPRA ESPECIF\.?\s+(\d{6})/i);
  if (special) return { kind: 'payment', note: `Abono a compra especial n.º ${special[1]}` };
  if (/^PAGO\b/i.test(description)) return { kind: 'payment' };
  if (/^ABONO\b/i.test(description)) return { kind: 'credit', note: 'Abono o ajuste del banco: revísalo antes de importar.' };
  return { kind: 'purchase' };
}

export async function parseBbvaExcel(buffer: Buffer): Promise<ParsedStatement | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  for (const sheet of workbook.worksheets) {
    let headerSeen = false;
    const items: DraftItem[] = [];
    sheet.eachRow(row => {
      const cells = (row.values as unknown[]).slice(1).map(v => (v === null || v === undefined ? '' : String(v)));
      if (!headerSeen) {
        headerSeen = ['descripcion', 'monto', 'estado', 'fecha'].every((h, i) => normalize(cells[i] ?? '') === h);
        return;
      }
      const date = (cells[3] ?? '').trim();
      if (!DATE_RE.test(date)) return; // blank rows and the legal footer
      const description = clean(cells[0] ?? '');
      const amount = toNumber(cells[1] ?? '');
      if (!description || !(amount > 0)) return;
      const { kind, note } = classify(description);
      items.push({
        date,
        description,
        amount_cop: amount,
        kind,
        note,
        selected: kind !== 'credit'
      });
    });
    if (!headerSeen) continue;

    // The export has no sign, so a refund looks like a purchase. Flag the later row of a pair with the
    // same merchant and amount within a week as a possible refund; the user decides in the review screen.
    const purchases = items.filter(i => i.kind === 'purchase').sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < purchases.length; i++) {
      const later = purchases[i];
      const earlier = purchases
        .slice(0, i)
        .find(p => Math.abs(p.amount_cop - later.amount_cop) < 0.02 && merchantKey(p.description) === merchantKey(later.description) &&
          dayNumber(later.date) - dayNumber(p.date) <= 7 && p.kind === 'purchase');
      if (earlier) {
        later.kind = 'credit';
        later.selected = false;
        later.note = `Posible devolución: mismo comercio y monto que una compra del ${earlier.date}.`;
      }
    }

    items.sort((a, b) => b.date.localeCompare(a.date));
    const dates = items.map(i => i.date).sort();
    return {
      format: 'excel',
      bank: 'BBVA',
      period_start: dates[0] ?? null,
      period_end: dates.at(-1) ?? null,
      items,
      skipped_installments: 0,
      warnings: [
        'Este Excel no distingue compras de devoluciones por el signo: revisa los movimientos marcados como "Devolución".',
        'Lo que ya cargaste desde el extracto PDF se marca como "Ya registrado" y no se duplica.'
      ],
      account_hint: { credit_limit: null, balance: null, annual_rate: null }
    };
  }
  return null;
}
