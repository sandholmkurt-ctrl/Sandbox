import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

/**
 * Dashboard endpoint — returns a summary of all vehicles and their statuses.
 */
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    // Get all vehicles with status counts
    const vehicles = db.prepare(`
      SELECT 
        v.id, v.year, v.make, v.model, v.vin, v.current_mileage, v.engine, v.drive_type,
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'overdue') as overdue_count,
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'upcoming') as upcoming_count,
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'ok') as ok_count
      FROM vehicles v
      WHERE v.user_id = ?
      ORDER BY 
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'overdue') DESC,
        v.created_at DESC
    `).all(req.userId) as any[];

    // Get upcoming/overdue services across all vehicles
    const actionItems = db.prepare(`
      SELECT 
        vs.id, vs.status, vs.next_due_mileage, vs.next_due_date,
        sd.name as service_name, sd.category,
        v.id as vehicle_id, v.year, v.make, v.model, v.current_mileage
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      JOIN vehicles v ON v.id = vs.vehicle_id
      WHERE v.user_id = ? AND vs.status IN ('overdue', 'upcoming')
      ORDER BY 
        CASE vs.status WHEN 'overdue' THEN 0 ELSE 1 END,
        vs.next_due_mileage ASC
      LIMIT 20
    `).all(req.userId);

    // Recent service history across all vehicles
    const recentServices = db.prepare(`
      SELECT 
        sh.id, sh.completed_date, sh.mileage_at_service, sh.cost,
        sd.name as service_name, sd.category,
        v.year, v.make, v.model
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      JOIN vehicles v ON v.id = sh.vehicle_id
      WHERE v.user_id = ?
      ORDER BY sh.completed_date DESC
      LIMIT 10
    `).all(req.userId);

    // Summary stats
    const totalOverdue = vehicles.reduce((sum: number, v: any) => sum + v.overdue_count, 0);
    const totalUpcoming = vehicles.reduce((sum: number, v: any) => sum + v.upcoming_count, 0);
    const totalOk = vehicles.reduce((sum: number, v: any) => sum + v.ok_count, 0);

    // Cost summary this year
    const yearStart = new Date().getFullYear() + '-01-01';
    const costResult = db.prepare(`
      SELECT COALESCE(SUM(sh.cost), 0) as total_cost, COUNT(*) as services_count
      FROM service_history sh
      JOIN vehicles v ON v.id = sh.vehicle_id
      WHERE v.user_id = ? AND sh.completed_date >= ?
    `).get(req.userId, yearStart) as { total_cost: number; services_count: number };

    res.json({
      vehicles,
      actionItems,
      recentServices,
      summary: {
        totalVehicles: vehicles.length,
        overdueServices: totalOverdue,
        upcomingServices: totalUpcoming,
        okServices: totalOk,
        yearCost: costResult.total_cost,
        yearServicesCount: costResult.services_count,
      },
    });
  } catch (err: any) {
    console.error('Dashboard error:', err);
    res.status(500).json({
      error: 'Internal server error',
      detail: err?.message || String(err),
      stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
    });
  }
});

export default router;
