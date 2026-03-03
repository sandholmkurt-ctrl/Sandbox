import { Router, Request, Response } from 'express';
import { queryAll } from '../database';

const router = Router();

// ─── Get distinct makes from OEM schedule rules ─────────
router.get('/makes', async (_req: Request, res: Response) => {
  try {
    const rows = await queryAll(
      `SELECT DISTINCT make FROM schedule_rules WHERE make IS NOT NULL ORDER BY make`
    );
    res.json(rows.map((r: any) => r.make));
  } catch (err) {
    console.error('Get makes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get distinct models for a make ─────────────────────
router.get('/models', async (req: Request, res: Response) => {
  try {
    const { make } = req.query;
    if (!make) {
      res.status(400).json({ error: 'make query param required' });
      return;
    }
    const rows = await queryAll(
      `SELECT DISTINCT model FROM schedule_rules WHERE make = $1 AND model IS NOT NULL ORDER BY model`,
      [make]
    );
    res.json(rows.map((r: any) => r.model));
  } catch (err) {
    console.error('Get models error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get year range for a make+model ────────────────────
router.get('/years', async (req: Request, res: Response) => {
  try {
    const { make, model } = req.query;
    if (!make || !model) {
      res.status(400).json({ error: 'make and model query params required' });
      return;
    }
    const row = await queryAll(
      `SELECT MIN(year_min) as min_year, MAX(year_max) as max_year
       FROM schedule_rules
       WHERE make = $1 AND model = $2 AND year_min IS NOT NULL AND year_max IS NOT NULL`,
      [make, model]
    );
    const r = row[0] as any;
    if (!r || !r.min_year) {
      res.json([]);
      return;
    }
    // Return array of individual years
    const years: number[] = [];
    for (let y = r.max_year; y >= r.min_year; y--) {
      years.push(y);
    }
    res.json(years);
  } catch (err) {
    console.error('Get years error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
