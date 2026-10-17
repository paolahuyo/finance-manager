import express, { Router, Request, Response } from 'express';
import { getTrmForDate, getUsdCopRate } from '../services/exchangeRate';

const router: Router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/exchange-rate?date=YYYY-MM-DD -> official TRM for that day.
 * GET /api/exchange-rate               -> current market reference rate.
 */
router.get('/', async (req: Request, res: Response) => {
  const { date } = req.query;
  try {
    if (date !== undefined) {
      if (typeof date !== 'string' || !DATE_RE.test(date)) {
        res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        return;
      }
      const trm = await getTrmForDate(date);
      res.json({ usd_cop: trm.rate, source: 'TRM', valid_from: trm.valid_from, exact: trm.exact });
      return;
    }
    const { rate, updated_at } = await getUsdCopRate();
    res.json({ usd_cop: rate, source: 'market', updated_at });
  } catch (error) {
    console.error('Exchange rate unavailable:', error);
    res.status(503).json({ error: 'Exchange rate unavailable, enter it manually' });
  }
});

export default router;
