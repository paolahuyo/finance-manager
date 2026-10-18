import express, { Router, Request, Response, NextFunction } from 'express';
import { Account } from '../models/Account';
import { Loan, LoanScheduleRow } from '../models/Loan';
import { parseDaviviendaPlan } from '../importers/loanPlan';
import { extractPages } from '../importers/pdfText';

const router: Router = express.Router();

const addMonths = (iso: string, months: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

/**
 * POST /api/loans/plan?account_id=&first_deduction=YYYY-MM-DD  (raw PDF body)
 * Stores the payment plan of a payroll loan. Installment 1 is applied on `first_deduction`
 * (the payroll date it was discounted) and each next one a month later.
 */
router.post('/plan', express.raw({ type: () => true, limit: '15mb' }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountId = Number(req.query.account_id);
    const first = String(req.query.first_deduction ?? '');
    const account = Number.isInteger(accountId) && accountId > 0 ? await Account.findById(accountId) : undefined;
    if (!account || account.kind !== 'loan' || !/^\d{4}-\d{2}-\d{2}$/.test(first)) {
      res.status(400).json({ error: 'account_id of a loan and first_deduction (YYYY-MM-DD) are required' });
      return;
    }
    const plan = parseDaviviendaPlan(await extractPages(req.body));
    if (!plan || plan.rows.length === 0) {
      res.status(422).json({ error: 'No reconozco este plan de pagos' });
      return;
    }
    const rows: LoanScheduleRow[] = plan.rows.map(r => ({ ...r, due_date: addMonths(first, r.n - 1) }));
    await Loan.replaceSchedule(accountId, rows);
    const applied = await Loan.applyDue(new Date().toISOString().slice(0, 10));
    res.status(201).json({ installments: rows.length, applied, plan: { ...plan, rows: undefined } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Loan.schedule(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
