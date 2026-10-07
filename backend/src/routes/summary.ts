import express, { Router, Request, Response, NextFunction } from 'express';
import { Transaction } from '../models/Transaction';
import { currentMonth, isValidMonth } from '../utils/month';

const router: Router = express.Router();

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
      balance: totals.income - totals.expense,
      expenseByCategory,
      incomeByCategory
    });
  } catch (error) {
    next(error);
  }
});

export default router;
