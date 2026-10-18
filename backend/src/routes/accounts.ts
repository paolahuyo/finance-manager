import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Account, AccountInput } from '../models/Account';
import { currentMonth, isValidMonth } from '../utils/month';

const router: Router = express.Router();

const optionalNumber = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.coerce.number().min(0).nullable()
);
const optionalText = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(255).nullable().optional()
);

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(100),
  bank: optionalText,
  kind: z.enum(['credit_card', 'loan', 'personal']).default('credit_card'),
  annual_rate: optionalNumber,
  credit_limit: optionalNumber,
  opening_balance: z.coerce.number().min(0).default(0),
  balance_as_of: z.preprocess(v => (v === '' || v === undefined ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  notes: optionalText
});

function parseBody(req: Request, res: Response): AccountInput | null {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid data',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    });
    return null;
  }
  const d = parsed.data;
  return {
    name: d.name,
    bank: d.bank ?? null,
    kind: d.kind,
    annual_rate: d.annual_rate,
    credit_limit: d.credit_limit,
    opening_balance: d.opening_balance,
    balance_as_of: d.balance_as_of,
    notes: d.notes ?? null
  };
}

const isDuplicate = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ER_DUP_ENTRY';

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = req.query.month ?? currentMonth();
    if (!isValidMonth(month)) {
      res.status(400).json({ error: 'month must be YYYY-MM' });
      return;
    }
    res.json(await Account.findAllWithStats(month));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = parseBody(req, res);
    if (!data) return;
    res.status(201).json(await Account.create(data));
  } catch (error) {
    if (isDuplicate(error)) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese nombre' });
      return;
    }
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const data = parseBody(req, res);
    if (!data) return;
    const updated = await Account.update(id, data);
    if (!updated) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    if (isDuplicate(error)) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese nombre' });
      return;
    }
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    if (!(await Account.delete(id))) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
