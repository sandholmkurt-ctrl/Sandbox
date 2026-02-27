import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { CompleteServiceSchema, Vehicle, VehicleSchedule } from '../types';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { updateVehicleStatuses } from '../services/scheduleEngine';

const router = Router();
router.use(authMiddleware);

// ─── Get Service History ────────────────────────────────
router.get('/:vehicleId/services', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const history = db.prepare(`
      SELECT sh.*, sd.name as service_name, sd.description as service_description, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.vehicle_id = ?
      ORDER BY sh.completed_date DESC
    `).all(vehicle.id);

    res.json(history);
  } catch (err) {
    console.error('Get service history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Complete a Service ─────────────────────────────────
router.post('/:vehicleId/services', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const parsed = CompleteServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { serviceDefinitionId, vehicleScheduleId, completedDate, mileageAtService, cost, notes, shopName } = parsed.data;
    const id = uuidv4();

    // Insert service history record
    db.prepare(`
      INSERT INTO service_history (id, vehicle_id, vehicle_schedule_id, service_definition_id, completed_date, mileage_at_service, cost, notes, shop_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, vehicle.id, vehicleScheduleId || null, serviceDefinitionId, completedDate, mileageAtService, cost || null, notes || null, shopName || null);

    // Update the vehicle schedule's next due date/mileage
    if (vehicleScheduleId) {
      const schedule = db.prepare(
        'SELECT * FROM vehicle_schedules WHERE id = ? AND vehicle_id = ?'
      ).get(vehicleScheduleId, vehicle.id) as VehicleSchedule | undefined;

      if (schedule) {
        const nextDueMileage = schedule.mileage_interval
          ? mileageAtService + schedule.mileage_interval
          : null;

        let nextDueDate: string | null = null;
        if (schedule.month_interval) {
          const date = new Date(completedDate);
          date.setMonth(date.getMonth() + schedule.month_interval);
          nextDueDate = date.toISOString().split('T')[0];
        }

        db.prepare(`
          UPDATE vehicle_schedules 
          SET next_due_mileage = ?, next_due_date = ?, status = 'ok', updated_at = datetime('now')
          WHERE id = ?
        `).run(nextDueMileage, nextDueDate, schedule.id);
      }
    }

    // Update vehicle mileage if service mileage is higher
    if (mileageAtService > vehicle.current_mileage) {
      db.prepare("UPDATE vehicles SET current_mileage = ?, updated_at = datetime('now') WHERE id = ?")
        .run(mileageAtService, vehicle.id);
    }

    // Log mileage entry
    db.prepare(`
      INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), vehicle.id, mileageAtService, `Service completed: ${serviceDefinitionId}`);

    // Re-evaluate all statuses
    updateVehicleStatuses(vehicle.id);

    const record = db.prepare(`
      SELECT sh.*, sd.name as service_name, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.id = ?
    `).get(id);

    res.status(201).json(record);
  } catch (err) {
    console.error('Complete service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Service History Entry ───────────────────────
router.delete('/:vehicleId/services/:serviceId', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const service = db.prepare(
      'SELECT * FROM service_history WHERE id = ? AND vehicle_id = ?'
    ).get(req.params.serviceId, vehicle.id);

    if (!service) {
      res.status(404).json({ error: 'Service record not found' });
      return;
    }

    db.prepare('DELETE FROM service_history WHERE id = ?').run(req.params.serviceId);
    res.json({ message: 'Service record deleted' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get Vehicle Schedule ───────────────────────────────
router.get('/:vehicleId/schedule', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const schedules = db.prepare(`
      SELECT vs.*, sd.name as service_name, sd.description as service_description, sd.category
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      WHERE vs.vehicle_id = ?
      ORDER BY 
        CASE vs.status 
          WHEN 'overdue' THEN 0 
          WHEN 'upcoming' THEN 1 
          ELSE 2 
        END,
        vs.next_due_mileage ASC NULLS LAST
    `).all(vehicle.id);

    res.json(schedules);
  } catch (err) {
    console.error('Get schedule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
