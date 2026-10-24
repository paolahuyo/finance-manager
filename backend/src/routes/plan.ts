import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Account } from '../models/Account';
import { Installment } from '../models/Installment';
import { Recurring } from '../models/Recurring';
import { Transaction } from '../models/Transaction';
import { generatePaymentPlan, PlanAccount, PlanPurchase } from '../services/paymentPlan';
import { currentMonth } from '../utils/month';

const router: Router = express.Router();

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const planSchema = z.object({
  today: date,
  cash_now: z.coerce.number().min(0),
  reserve_one_installment: z.coerce.number().min(0).default(0),
  extra_incomes: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(255),
        amount: z.coerce.number().positive(),
        date,
        target: z.object({ account_id: z.coerce.number().int().positive(), description: z.string().min(1) }).optional()
      })
    )
    .default([]),
  strategy: z.enum(['fewer', 'finish']).default('fewer')
});

/** Previous full month of `today` ('YYYY-MM-DD'). */
function previousMonth(today: string): string {
  const [year, mon] = today.slice(0, 7).split('-').map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
}

// Suggested reserve for 1-installment purchases: card spending of the last full month.
router.get('/suggested-reserve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = typeof req.query.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : `${currentMonth()}-01`;
    res.json({ amount: Math.round(await Transaction.cardPurchases(previousMonth(today))) });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid data', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    const [accounts, upcoming, installments, recurring] = await Promise.all([
      Account.findAll(),
      Account.upcomingPayments(),
      Installment.latestForAll(),
      Recurring.findAll()
    ]);

    const planAccounts: PlanAccount[] = accounts
      .filter(a => a.kind !== 'loan')
      .map(a => {
        const up = upcoming.find(u => u.id === a.id);
        return {
          id: a.id,
          name: a.name,
          allows_directed_payments: a.allows_directed_payments,
          cutoff_day: a.due_cutoff ? Number(a.due_cutoff.slice(8, 10)) : null,
          due_date: up?.due_date ?? null,
          minimum_pending: up ? Math.max((up.minimum_payment ?? 0) - up.paid_since_cutoff, 0) : 0
        };
      });
    const purchases: PlanPurchase[] = installments.flatMap(card =>
      card.rows
        .filter(r => r.balance_after > 0)
        .map(r => ({ account_id: card.account_id, description: r.description, purchase_date: r.purchase_date, balance: r.balance_after, rate: r.rate }))
    );

    res.json(
      generatePaymentPlan({
        ...parsed.data,
        accounts: planAccounts,
        purchases,
        recurring: recurring.map(r => ({ type: r.type, description: r.description, amount: r.amount_cop, day_of_month: r.day_of_month }))
      })
    );
  } catch (error) {
    next(error);
  }
});

export default router;
