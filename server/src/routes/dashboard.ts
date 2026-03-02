import { Router, Response } from 'express';
import { queryOne, queryAll } from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ─── Dashboard Summary ──────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    // Get all vehicles with status counts
    const vehicles = await queryAll(`
      SELECT v.*, 
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'overdue') as overdue_count,
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'upcoming') as upcoming_count
      FROM vehicles v 
      WHERE v.user_id = $1
      ORDER BY v.created_at DESC
    `, [req.userId]);

    // Action items (overdue + upcoming schedules across all vehicles)
    const actionItems = await queryAll(`
      SELECT vs.*, sd.name as service_name, sd.category, v.year, v.make, v.model, v.id as vehicle_id
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      JOIN vehicles v ON v.id = vs.vehicle_id
      WHERE v.user_id = $1 AND vs.status IN ('overdue', 'upcoming')
      ORDER BY 
        CASE vs.status WHEN 'overdue' THEN 0 ELSE 1 END,
        vs.next_due_mileage ASC NULLS LAST
      LIMIT 20
    `, [req.userId]);

    // Service cost summary for current year
    const currentYear = new Date().getFullYear();
    const costSummary = await queryOne<{ total_cost: string; service_count: string }>(`
      SELECT 
        COALESCE(SUM(sh.cost), 0) as total_cost,
        COUNT(*) as service_count
      FROM service_history sh
      JOIN vehicles v ON v.id = sh.vehicle_id
      WHERE v.user_id = $1 AND EXTRACT(YEAR FROM sh.completed_date::date) = $2
    `, [req.userId, currentYear]);

    res.json({
      vehicles,
      actionItems,
      costSummary: {
        totalCost: parseFloat(costSummary?.total_cost || '0'),
        serviceCount: parseInt(costSummary?.service_count || '0', 10),
        year: currentYear,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
