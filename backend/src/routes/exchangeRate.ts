import express, { Router, Request, Response } from 'express';
import { getUsdCopRate } from '../services/exchangeRate';

const router: Router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rate, updated_at } = await getUsdCopRate();
    res.json({ usd_cop: rate, updated_at });
  } catch (error) {
    console.error('Exchange rate unavailable:', error);
    res.status(503).json({ error: 'Exchange rate unavailable, enter it manually' });
  }
});

export default router;
