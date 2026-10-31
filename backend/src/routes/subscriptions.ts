import express, { Router, Request, Response, NextFunction } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { getPool } from '../db/init';
import { FEE_CATEGORIES, INTEREST_CATEGORY } from '../models/Account';
import { ChargeRow, detectSubscriptions } from '../services/subscriptions';

const router: Router = express.Router();

const markSchema = z.object({ status: z.enum(['keep', 'cancel']) });
const manualSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(100),
  amount: z.coerce.number().positive('Must be greater than 0')
});

/** GET /api/subscriptions — charges that repeat every month, with the decision made about each one. */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const excluded = [INTEREST_CATEGORY, ...FEE_CATEGORIES];
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT t.description, t.amount_cop, t.date
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type = 'expense'
         AND IFNULL(c.name, '') NOT IN (?)
         AND t.description NOT LIKE 'Pago%' AND t.description NOT LIKE 'Cuota %'
         AND t.description NOT IN (SELECT description FROM recurring_items WHERE active = 1)`,
      [excluded]
    );
    const charges: ChargeRow[] = rows.map(r => ({
      description: String(r.description),
      amount_cop: Number(r.amount_cop),
      date: String(r.date)
    }));
    const [marks] = await getPool().query<RowDataPacket[]>('SELECT merchant_key, status FROM subscription_marks');
    const status = new Map(marks.map(m => [String(m.merchant_key), String(m.status)]));

    const [manualRows] = await getPool().query<RowDataPacket[]>('SELECT id, name, amount_cop FROM manual_subscriptions ORDER BY id');
    const manual = manualRows.map(m => {
      const key = `manual-${m.id}`;
      const amount = Number(m.amount_cop);
      return {
        key, name: String(m.name), typical_amount: amount, months: [] as string[], charges: 0, last_date: '',
        annual_cost: amount * 12, possible_duplicate: false, status: status.get(key) ?? null, manual_id: Number(m.id)
      };
    });
    const subscriptions = [...detectSubscriptions(charges).map(s => ({ ...s, status: status.get(s.key) ?? null })), ...manual].sort(
      (a, b) => b.annual_cost - a.annual_cost
    );
    const monthly = subscriptions.reduce((t, s) => t + s.typical_amount, 0);
    const cancelMonthly = subscriptions.filter(s => s.status === 'cancel').reduce((t, s) => t + s.typical_amount, 0);
    res.json({ subscriptions, totals: { monthly, yearly: monthly * 12, cancel_monthly: cancelMonthly, cancel_yearly: cancelMonthly * 12 } });
  } catch (error) {
    next(error);
  }
});

router.post('/manual', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid data', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    const [result] = await getPool().query<ResultSetHeader>('INSERT INTO manual_subscriptions (name, amount_cop) VALUES (?, ?)', [
      parsed.data.name,
      parsed.data.amount
    ]);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    next(error);
  }
});

router.delete('/manual/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const [result] = await getPool().query<ResultSetHeader>('DELETE FROM manual_subscriptions WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await getPool().query('DELETE FROM subscription_marks WHERE merchant_key = ?', [`manual-${id}`]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.put('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = markSchema.safeParse(req.body);
    const key = String(req.params.key).slice(0, 60);
    if (!parsed.success || !key) {
      res.status(400).json({ error: 'status must be "keep" or "cancel"' });
      return;
    }
    await getPool().query(
      'INSERT INTO subscription_marks (merchant_key, status) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)',
      [key, parsed.data.status]
    );
    res.json({ key, status: parsed.data.status });
  } catch (error) {
    next(error);
  }
});

router.delete('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await getPool().query('DELETE FROM subscription_marks WHERE merchant_key = ?', [String(req.params.key).slice(0, 60)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
