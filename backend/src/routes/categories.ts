import express, { Router, Request, Response, NextFunction } from 'express';
import { Category } from '../models/Category';

const router: Router = express.Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Category.findAll());
  } catch (error) {
    next(error);
  }
});

export default router;
