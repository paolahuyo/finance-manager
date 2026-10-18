import { createHash } from 'node:crypto';
import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Account, INTEREST_CATEGORY } from '../models/Account';
import { Category } from '../models/Category';
import { Installment } from '../models/Installment';
import { linkAccountPayments } from '../services/paymentLinker';
import { Transaction, TransactionInput } from '../models/Transaction';
import { SUPPORTED_BANKS, parseStatement } from '../importers';
import { suggestCategoryName } from '../importers/categorize';
import { isXlsx, parseBbvaExcel } from '../importers/excel';
import { extractPages } from '../importers/pdfText';
import type { DraftItem, ParsedStatement } from '../importers';

const router: Router = express.Router();

/** Stable id for a draft row. `occurrence` separates identical rows inside one statement. */
const hashItem = (accountId: number, item: DraftItem, occurrence: number): string =>
  createHash('sha256')
    .update([accountId, item.date, item.kind, item.amount_cop, item.description, occurrence].join('|'))
    .digest('hex');

const accountIdFrom = (req: Request): number | null => {
  const id = Number(req.query.account_id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// The PDF is analysed in memory and never stored.
router.post(
  '/preview',
  express.raw({ type: () => true, limit: '15mb' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = accountIdFrom(req);
      const account = accountId === null ? undefined : await Account.findById(accountId);
      if (accountId === null || !account) {
        res.status(400).json({ error: 'Elige la tarjeta a la que pertenece el extracto' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'No llegó ningún archivo' });
        return;
      }

      let parsed: ParsedStatement | null;
      try {
        parsed = isXlsx(req.body) ? await parseBbvaExcel(req.body) : parseStatement(await extractPages(req.body));
      } catch {
        res.status(422).json({ error: 'No se pudo leer el archivo. Sube un PDF digital (no una foto) o un Excel de movimientos.' });
        return;
      }
      if (!parsed) {
        res.status(422).json({ error: `No reconozco el formato de este archivo. PDF de: ${SUPPORTED_BANKS.join(', ')}. Excel: movimientos de BBVA.` });
        return;
      }

      // Keep the statement's installment table (not movements) so payments can be linked to purchases,
      // even when every movement of this statement is already inside the card balance.
      let linked = 0;
      if (parsed.installments?.length && parsed.period_end) {
        await Installment.replaceSnapshot(accountId, parsed.period_end, parsed.installments);
        linked = await linkAccountPayments(accountId);
      }

      const categories = await Category.findAll();
      const idByName = new Map(categories.filter(c => c.type === 'expense').map(c => [c.name, c.id]));

      const seen = new Map<string, number>();
      const withHash = parsed.items.map(item => {
        const base = [item.date, item.kind, item.amount_cop, item.description].join('|');
        const occurrence = seen.get(base) ?? 0;
        seen.set(base, occurrence + 1);
        const categoryName =
          item.kind === 'interest' || item.kind === 'fee'
            ? INTEREST_CATEGORY
            : item.kind === 'purchase'
              ? suggestCategoryName(item.description)
              : null;
        return {
          ...item,
          import_hash: hashItem(accountId, item, occurrence),
          category_id: categoryName ? idByName.get(categoryName) ?? null : null
        };
      });

      const existing = await Transaction.existingImportHashes(withHash.map(i => i.import_hash));

      // The same movement can arrive from a PDF and from an Excel with slightly different text, so also
      // compare by type + date + amount against what the card already has (as a multiset: two equal
      // purchases on one day need two existing rows to both count as duplicates).
      const dates = withHash.map(i => i.date).sort();
      const known = new Map<string, number>();
      if (dates.length) {
        for (const row of await Transaction.brief(accountId, dates[0], dates[dates.length - 1])) {
          const key = `${row.type}|${row.date}|${row.amount_cop.toFixed(2)}`;
          known.set(key, (known.get(key) ?? 0) + 1);
        }
      }
      const items = withHash.map(i => {
        let duplicate = existing.has(i.import_hash);
        let note = i.note;
        if (!duplicate && (i.kind === 'purchase' || i.kind === 'payment' || i.kind === 'credit')) {
          const key = `${i.kind === 'purchase' ? 'expense' : 'payment'}|${i.date}|${i.amount_cop.toFixed(2)}`;
          const left = known.get(key) ?? 0;
          if (left > 0) {
            known.set(key, left - 1);
            duplicate = true;
            note = 'Ya registrado: misma fecha y monto que un movimiento de esta tarjeta.';
          }
        }
        // Movements before the date the opening balance was taken are already inside that balance.
        if (!duplicate && account.balance_as_of && i.date < account.balance_as_of) {
          duplicate = true;
          note = `Anterior al corte del ${account.balance_as_of}: ya está incluido en el saldo de la tarjeta.`;
        }
        return { ...i, note, duplicate, selected: i.selected && !duplicate };
      });

      res.json({
        format: parsed.format ?? 'pdf',
        bank: parsed.bank,
        period_start: parsed.period_start,
        period_end: parsed.period_end,
        skipped_installments: parsed.skipped_installments,
        warnings: parsed.warnings,
        linked_payments: linked,
        items
      });
    } catch (error) {
      next(error);
    }
  }
);

const commitSchema = z.object({
  account_id: z.coerce.number().int().positive(),
  items: z
    .array(
      z.object({
        import_hash: z.string().length(64),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().trim().min(1).max(255),
        amount_cop: z.coerce.number().positive(),
        kind: z.enum(['purchase', 'interest', 'fee', 'payment', 'credit']),
        category_id: z.coerce.number().int().positive().nullable().optional(),
        original_amount: z.coerce.number().positive().optional(),
        original_currency: z.enum(['COP', 'USD']).optional(),
        exchange_rate: z.coerce.number().positive().optional()
      })
    )
    .min(1)
    .max(500)
});

router.post('/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = commitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid data',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
      });
      return;
    }
    const { account_id: accountId, items } = parsed.data;
    if (!(await Account.findById(accountId))) {
      res.status(400).json({ error: 'La tarjeta no existe' });
      return;
    }

    const categories = new Map((await Category.findAll()).map(c => [c.id, c]));
    let inserted = 0;
    let duplicates = 0;
    for (const item of items) {
      const isCredit = item.kind === 'payment' || item.kind === 'credit';
      const categoryId = isCredit ? null : item.category_id ?? null;
      if (categoryId !== null && categories.get(categoryId)?.type !== 'expense') {
        res.status(400).json({ error: `Categoría inválida en "${item.description}"` });
        return;
      }
      const row: TransactionInput = {
        type: isCredit ? 'payment' : 'expense',
        description: item.description,
        amount_cop: item.amount_cop,
        original_amount: item.original_amount ?? item.amount_cop,
        original_currency: item.original_currency ?? 'COP',
        exchange_rate: item.exchange_rate ?? 1,
        category_id: categoryId,
        account_id: accountId,
        date: item.date
      };
      if (await Transaction.createImported(row, item.import_hash)) inserted++;
      else duplicates++;
    }
    const linked = await linkAccountPayments(accountId);
    res.status(201).json({ inserted, skipped_duplicates: duplicates, linked_payments: linked });
  } catch (error) {
    next(error);
  }
});

export default router;
