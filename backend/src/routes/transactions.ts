import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Category } from '../models/Category';
import { Transaction, TransactionInput } from '../models/Transaction';
import { getUsdCopRate } from '../services/exchangeRate';
import { currentMonth, isValidMonth } from '../utils/month';

const router: Router = express.Router();

const transactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  description: z.string().trim().min(1, 'Required').max(255),
  amount: z.coerce.number().positive('Must be greater than 0'),
  currency: z.enum(['COP', 'USD']).default('COP'),
  exchange_rate: z.coerce.number().positive().optional(),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
});

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Validates the body and converts it to a COP-denominated row. Sends a 400 and returns null on failure. */
async function parseBody(req: Request, res: Response): Promise<TransactionInput | null> {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid data',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    });
    return null;
  }
  const body = parsed.data;

  let rate = 1;
  if (body.currency === 'USD') {
    try {
      rate = body.exchange_rate ?? (await getUsdCopRate()).rate;
    } catch {
      res.status(400).json({ error: 'Exchange rate unavailable, send exchange_rate' });
      return null;
    }
  }

  const categoryId = body.category_id ?? null;
  if (categoryId !== null) {
    const category = await Category.findById(categoryId);
    if (!category || category.type !== body.type) {
      res.status(400).json({ error: 'Category does not exist or does not match the type' });
      return null;
    }
  }

  return {
    type: body.type,
    description: body.description,
    amount_cop: round2(body.amount * rate),
    original_amount: body.amount,
    original_currency: body.currency,
    exchange_rate: rate,
    category_id: categoryId,
    date: body.date
  };
}

function parseId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return id;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = req.query.month ?? currentMonth();
    if (!isValidMonth(month)) {
      res.status(400).json({ error: 'month must be YYYY-MM' });
      return;
    }
    res.json(await Transaction.findByMonth(month));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await parseBody(req, res);
    if (!data) return;
    res.status(201).json(await Transaction.create(data));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const data = await parseBody(req, res);
    if (!data) return;
    const updated = await Transaction.update(id, data);
    if (!updated) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    if (!(await Transaction.delete(id))) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
