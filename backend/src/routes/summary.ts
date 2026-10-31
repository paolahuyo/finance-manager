import express, { Router, Request, Response, NextFunction } from 'express';
import { FEE_CATEGORIES, INTEREST_CATEGORY } from '../models/Account';
import { Transaction } from '../models/Transaction';
import { currentMonth, isValidMonth, shiftMonth } from '../utils/month';

const router: Router = express.Router();

/** GET /api/summary/history?months=6 — income, expense and interest of the last N months (oldest first). */
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months ?? 6) || 6, 1), 24);
    const list = Array.from({ length: months }, (_, i) => shiftMonth(currentMonth(), i - (months - 1)));
    const points = await Promise.all(
      list.map(async month => {
        const [totals, expenseByCategory] = await Promise.all([
          Transaction.totalsByType(month),
          Transaction.totalsByCategory(month, 'expense')
        ]);
        return {
          month,
          income: totals.income,
          expense: totals.expense,
          interest: expenseByCategory.find(c => c.category_name === INTEREST_CATEGORY)?.total ?? 0
        };
      })
    );
    res.json(points);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = req.query.month ?? currentMonth();
    if (!isValidMonth(month)) {
      res.status(400).json({ error: 'month must be YYYY-MM' });
      return;
    }
    const [totals, expenseByCategory, incomeByCategory] = await Promise.all([
      Transaction.totalsByType(month),
      Transaction.totalsByCategory(month, 'expense'),
      Transaction.totalsByCategory(month, 'income')
    ]);
    res.json({
      month,
      income: totals.income,
      expense: totals.expense,
      payments: totals.payment,
      interest: expenseByCategory.find(c => c.category_name === INTEREST_CATEGORY)?.total ?? 0,
      fees: expenseByCategory
        .filter(c => (FEE_CATEGORIES as readonly string[]).includes(c.category_name))
        .reduce((t, c) => t + c.total, 0),
      balance: totals.income - totals.expense,
      expenseByCategory,
      incomeByCategory
    });
  } catch (error) {
    next(error);
  }
});

export default router;
