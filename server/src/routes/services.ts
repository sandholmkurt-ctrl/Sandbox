import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../database';
import { CompleteServiceSchema, UpdateServiceSchema, Vehicle, VehicleSchedule } from '../types';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { updateVehicleStatuses } from '../services/scheduleEngine';

const router = Router();
router.use(authMiddleware);

// ─── Get Service History ────────────────────────────────
router.get('/:vehicleId/services', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const history = await queryAll(`
      SELECT sh.*, sd.name as service_name, sd.description as service_description, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.vehicle_id = $1
      ORDER BY sh.completed_date DESC
    `, [vehicle.id]);

    res.json(history);
  } catch (err) {
    console.error('Get service history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Complete a Service ─────────────────────────────────
router.post('/:vehicleId/services', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

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
    await execute(
      `INSERT INTO service_history (id, vehicle_id, vehicle_schedule_id, service_definition_id, completed_date, mileage_at_service, cost, notes, shop_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, vehicle.id, vehicleScheduleId || null, serviceDefinitionId, completedDate, mileageAtService, cost || null, notes || null, shopName || null]
    );

    // Update the vehicle schedule's next due date/mileage
    if (vehicleScheduleId) {
      const schedule = await queryOne<VehicleSchedule>(
        'SELECT * FROM vehicle_schedules WHERE id = $1 AND vehicle_id = $2',
        [vehicleScheduleId, vehicle.id]
      );

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

        await execute(
          `UPDATE vehicle_schedules 
           SET next_due_mileage = $1, next_due_date = $2, status = 'ok', updated_at = NOW()
           WHERE id = $3`,
          [nextDueMileage, nextDueDate, schedule.id]
        );
      }
    }

    // Update vehicle mileage if service mileage is higher
    if (mileageAtService > vehicle.current_mileage) {
      await execute(
        "UPDATE vehicles SET current_mileage = $1, updated_at = NOW() WHERE id = $2",
        [mileageAtService, vehicle.id]
      );
    }

    // Log mileage entry
    await execute(
      `INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), vehicle.id, mileageAtService, `Service completed: ${serviceDefinitionId}`]
    );

    // Re-evaluate all statuses
    await updateVehicleStatuses(vehicle.id);

    const record = await queryOne(`
      SELECT sh.*, sd.name as service_name, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.id = $1
    `, [id]);

    res.status(201).json(record);
  } catch (err) {
    console.error('Complete service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Edit Service History Entry ─────────────────────────
router.put('/:vehicleId/services/:serviceId', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const existing = await queryOne(
      'SELECT * FROM service_history WHERE id = $1 AND vehicle_id = $2',
      [req.params.serviceId, vehicle.id]
    );

    if (!existing) {
      res.status(404).json({ error: 'Service record not found' });
      return;
    }

    const parsed = UpdateServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const data = parsed.data;

    // Build dynamic UPDATE
    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (data.completedDate !== undefined) {
      fields.push(`completed_date = $${paramIdx++}`);
      values.push(data.completedDate);
    }
    if (data.mileageAtService !== undefined) {
      fields.push(`mileage_at_service = $${paramIdx++}`);
      values.push(data.mileageAtService);
    }
    if (data.cost !== undefined) {
      fields.push(`cost = $${paramIdx++}`);
      values.push(data.cost);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramIdx++}`);
      values.push(data.notes);
    }
    if (data.shopName !== undefined) {
      fields.push(`shop_name = $${paramIdx++}`);
      values.push(data.shopName);
    }
    if (data.serviceDefinitionId !== undefined) {
      fields.push(`service_definition_id = $${paramIdx++}`);
      values.push(data.serviceDefinitionId);
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(req.params.serviceId);
    await execute(
      `UPDATE service_history SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    // Re-evaluate statuses if date or mileage changed
    if (data.completedDate !== undefined || data.mileageAtService !== undefined) {
      await updateVehicleStatuses(vehicle.id);
    }

    const record = await queryOne(`
      SELECT sh.*, sd.name as service_name, sd.description as service_description, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.id = $1
    `, [req.params.serviceId]);

    res.json(record);
  } catch (err) {
    console.error('Update service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Service History Entry ───────────────────────
router.delete('/:vehicleId/services/:serviceId', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const service = await queryOne(
      'SELECT * FROM service_history WHERE id = $1 AND vehicle_id = $2',
      [req.params.serviceId, vehicle.id]
    );

    if (!service) {
      res.status(404).json({ error: 'Service record not found' });
      return;
    }

    await execute('DELETE FROM service_history WHERE id = $1', [req.params.serviceId]);
    res.json({ message: 'Service record deleted' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get Vehicle Schedule ───────────────────────────────
router.get('/:vehicleId/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const schedules = await queryAll(`
      SELECT vs.*, sd.name as service_name, sd.description as service_description, sd.category
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      WHERE vs.vehicle_id = $1
      ORDER BY 
        CASE vs.status 
          WHEN 'overdue' THEN 0 
          WHEN 'upcoming' THEN 1 
          ELSE 2 
        END,
        vs.next_due_mileage ASC NULLS LAST
    `, [vehicle.id]);

    res.json(schedules);
  } catch (err) {
    console.error('Get schedule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
