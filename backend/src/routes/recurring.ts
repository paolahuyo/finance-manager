import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Category } from '../models/Category';
import { Loan } from '../models/Loan';
import { Recurring, RecurringInput } from '../models/Recurring';
import { isValidMonth } from '../utils/month';

const router: Router = express.Router();

const schema = z.object({
  type: z.enum(['income', 'expense']),
  description: z.string().trim().min(1, 'Required').max(255),
  amount: z.coerce.number().positive('Must be greater than 0'),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  day_of_month: z.coerce.number().int().min(1).max(31)
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Recurring.findAll());
  } catch (error) {
    next(error);
  }
});

/** Validates the body and checks the category; sends a 400 and returns null on failure. */
async function parseBody(req: Request, res: Response): Promise<RecurringInput | null> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid data', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    return null;
  }
  const d = parsed.data;
  const categoryId = d.category_id ?? null;
  if (categoryId !== null && (await Category.findById(categoryId))?.type !== d.type) {
    res.status(400).json({ error: 'Category does not exist or does not match the type' });
    return null;
  }
  return { type: d.type, description: d.description, amount_cop: d.amount, category_id: categoryId, day_of_month: d.day_of_month };
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await parseBody(req, res);
    if (!data) return;
    res.status(201).json({ id: await Recurring.create(data) });
  } catch (error) {
    next(error);
  }
});

// Editing keeps the id, so months already generated stay as they were and future ones use the new values.
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const data = await parseBody(req, res);
    if (!data) return;
    if (!(await Recurring.update(id, data))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !(await Recurring.deactivate(id))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Turns this month's fixed items whose day already arrived into movements (idempotent).
router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { month, today } = req.query;
    if (!isValidMonth(month) || typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      res.status(400).json({ error: 'month (YYYY-MM) and today (YYYY-MM-DD) required' });
      return;
    }
    const created = await Recurring.apply(month, today);
    const loanInstallments = await Loan.applyDue(today);
    res.json({ created, loan_installments: loanInstallments });
  } catch (error) {
    next(error);
  }
});

export default router;
