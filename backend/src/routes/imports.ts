import { createHash } from 'node:crypto';
import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Account, INTEREST_CATEGORY } from '../models/Account';
import { Category } from '../models/Category';
import { Transaction, TransactionInput } from '../models/Transaction';
import { SUPPORTED_BANKS, parseStatement } from '../importers';
import { suggestCategoryName } from '../importers/categorize';
import { extractPages } from '../importers/pdfText';
import type { DraftItem } from '../importers';

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
      if (accountId === null || !(await Account.findById(accountId))) {
        res.status(400).json({ error: 'Elige la tarjeta a la que pertenece el extracto' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'No llegó ningún archivo' });
        return;
      }

      let parsed;
      try {
        parsed = parseStatement(await extractPages(req.body));
      } catch {
        res.status(422).json({ error: 'No se pudo leer el archivo. ¿Es un PDF digital (no una foto)?' });
        return;
      }
      if (!parsed) {
        res.status(422).json({ error: `No reconozco el formato de este extracto. Bancos soportados: ${SUPPORTED_BANKS.join(', ')}.` });
        return;
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
      const items = withHash.map(i => {
        const duplicate = existing.has(i.import_hash);
        return { ...i, duplicate, selected: i.selected && !duplicate };
      });

      res.json({
        bank: parsed.bank,
        period_start: parsed.period_start,
        period_end: parsed.period_end,
        skipped_installments: parsed.skipped_installments,
        warnings: parsed.warnings,
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
    res.status(201).json({ inserted, skipped_duplicates: duplicates });
  } catch (error) {
    next(error);
  }
});

export default router;
