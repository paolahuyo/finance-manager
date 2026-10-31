import express, { Router, Request, Response, NextFunction } from 'express';
import { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { getPool } from '../db/init';
import { isValidMonth } from '../utils/month';

const router: Router = express.Router();

const tagSchema = z.object({ tag: z.enum(['viaje']).default('viaje') });

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>('SELECT month, tag FROM month_tags ORDER BY month');
    res.json(rows.map(r => ({ month: r.month as string, tag: r.tag as string })));
  } catch (error) {
    next(error);
  }
});

router.put('/:month', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = tagSchema.safeParse(req.body ?? {});
    if (!isValidMonth(req.params.month) || !parsed.success) {
      res.status(400).json({ error: 'month must be YYYY-MM and tag must be "viaje"' });
      return;
    }
    await getPool().query(
      'INSERT INTO month_tags (month, tag) VALUES (?, ?) ON DUPLICATE KEY UPDATE tag = VALUES(tag)',
      [req.params.month, parsed.data.tag]
    );
    res.json({ month: req.params.month, tag: parsed.data.tag });
  } catch (error) {
    next(error);
  }
});

router.delete('/:month', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidMonth(req.params.month)) {
      res.status(400).json({ error: 'month must be YYYY-MM' });
      return;
    }
    await getPool().query('DELETE FROM month_tags WHERE month = ?', [req.params.month]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
