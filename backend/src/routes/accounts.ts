import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Account, AccountInput } from '../models/Account';
import { Installment } from '../models/Installment';
import { Loan } from '../models/Loan';
import { Transaction } from '../models/Transaction';
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

// Optional fields: absent (undefined) keeps the stored value on update; '' or null clears it.
const optionalDate = z.preprocess(v => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional());
const optionalAmount = z.preprocess(v => (v === '' ? null : v), z.coerce.number().min(0).nullable().optional());

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(100),
  bank: optionalText,
  kind: z.enum(['credit_card', 'loan', 'personal']).default('credit_card'),
  annual_rate: optionalNumber,
  credit_limit: optionalNumber,
  opening_balance: z.coerce.number().min(0).default(0),
  balance_as_of: optionalDate,
  due_date: optionalDate,
  minimum_payment: optionalAmount,
  total_payment: optionalAmount,
  due_cutoff: optionalDate,
  allows_directed_payments: z.boolean().optional(),
  notes: optionalText
});

function parseBody(req: Request, res: Response, current?: AccountInput): AccountInput | null {
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
    balance_as_of: d.balance_as_of === undefined ? current?.balance_as_of ?? null : d.balance_as_of,
    due_date: d.due_date === undefined ? current?.due_date ?? null : d.due_date,
    minimum_payment: d.minimum_payment === undefined ? current?.minimum_payment ?? null : d.minimum_payment,
    total_payment: d.total_payment === undefined ? current?.total_payment ?? null : d.total_payment,
    due_cutoff: d.due_cutoff === undefined ? current?.due_cutoff ?? null : d.due_cutoff,
    allows_directed_payments: d.allows_directed_payments ?? current?.allows_directed_payments ?? false,
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

router.get('/installments', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Installment.latestForAll());
  } catch (error) {
    next(error);
  }
});

router.get('/upcoming', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Account.upcomingPayments());
  } catch (error) {
    next(error);
  }
});

// Everything about one card: stats, installment table of the latest statement, movements and
// which purchase each directed payment ("PAGO COMPRA ESPECIF.") paid.
router.get('/:id/detail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const month = req.query.month ?? currentMonth();
    if (!Number.isInteger(id) || id <= 0 || !isValidMonth(month)) {
      res.status(400).json({ error: 'Invalid id or month' });
      return;
    }
    const account = (await Account.findAllWithStats(month)).find(a => a.id === id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const [installments, movements, loanSchedule] = await Promise.all([
      Installment.latest(id),
      Transaction.findByAccount(id),
      Loan.schedule(id)
    ]);
    const directed = movements.filter(m => m.type === 'payment' && /^PAGO COMPRA ESPEC/i.test(m.description));
    res.json({
      account,
      installments,
      directed_payments: {
        total: directed.length,
        linked: directed.filter(d => d.linked_purchase).length,
        items: directed
      },
      movements,
      loan_schedule: loanSchedule
    });
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
    const current = await Account.findById(id);
    if (!current) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const data = parseBody(req, res, current);
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
