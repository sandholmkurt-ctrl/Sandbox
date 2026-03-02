import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../database';
import { AddVehicleSchema, UpdateVehicleSchema, Vehicle } from '../types';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { generateScheduleForVehicle, updateVehicleStatuses } from '../services/scheduleEngine';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── List Vehicles ──────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const vehicles = await queryAll(`
      SELECT v.*, 
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'overdue') as overdue_count,
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'upcoming') as upcoming_count
      FROM vehicles v 
      WHERE v.user_id = $1
      ORDER BY v.created_at DESC
    `, [req.userId]);

    res.json(vehicles);
  } catch (err) {
    console.error('List vehicles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get Single Vehicle ─────────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    // Get upcoming schedules
    const schedules = await queryAll(`
      SELECT vs.*, sd.name as service_name, sd.description as service_description, sd.category,
             sd.service_type, vs.source as oem_source, vs.source_notes as oem_notes
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      WHERE vs.vehicle_id = $1
      ORDER BY 
        CASE vs.status 
          WHEN 'overdue' THEN 0 
          WHEN 'upcoming' THEN 1 
          ELSE 2 
        END,
        vs.next_due_mileage ASC
    `, [vehicle.id]);

    // Get recent service history
    const history = await queryAll(`
      SELECT sh.*, sd.name as service_name, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.vehicle_id = $1
      ORDER BY sh.completed_date DESC
      LIMIT 10
    `, [vehicle.id]);

    res.json({ ...vehicle, schedules, recentHistory: history });
  } catch (err) {
    console.error('Get vehicle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add Vehicle ────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = AddVehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { vin, year, make, model, engine, trimLevel, driveType, currentMileage } = parsed.data;
    const id = uuidv4();

    await execute(
      `INSERT INTO vehicles (id, user_id, vin, year, make, model, engine, trim_level, drive_type, current_mileage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, req.userId, vin || null, year, make, model, engine || null, trimLevel || null, driveType || null, currentMileage]
    );

    // Record initial mileage
    if (currentMileage > 0) {
      await execute(
        `INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
         VALUES ($1, $2, $3, 'Initial mileage at vehicle registration')`,
        [uuidv4(), id, currentMileage]
      );
    }

    // Generate maintenance schedule
    await generateScheduleForVehicle(id);

    const vehicle = await queryOne('SELECT * FROM vehicles WHERE id = $1', [id]);
    res.status(201).json(vehicle);
  } catch (err: any) {
    console.error('Add vehicle error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err?.message || String(err) });
  }
});

// ─── Update Vehicle ─────────────────────────────────────
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const parsed = UpdateVehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { currentMileage, engine, trimLevel, driveType, remindersEnabled } = parsed.data;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (currentMileage !== undefined) {
      updates.push(`current_mileage = $${paramIdx++}`);
      values.push(currentMileage);

      // Record mileage entry
      await execute(
        `INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
         VALUES ($1, $2, $3, 'Mileage update')`,
        [uuidv4(), vehicle.id, currentMileage]
      );
    }
    if (engine !== undefined) { updates.push(`engine = $${paramIdx++}`); values.push(engine); }
    if (trimLevel !== undefined) { updates.push(`trim_level = $${paramIdx++}`); values.push(trimLevel); }
    if (driveType !== undefined) { updates.push(`drive_type = $${paramIdx++}`); values.push(driveType); }
    if (remindersEnabled !== undefined) { updates.push(`reminders_enabled = $${paramIdx++}`); values.push(remindersEnabled ? 1 : 0); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = NOW()');
    values.push(vehicle.id);

    await execute(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);

    // Re-evaluate statuses if mileage changed
    if (currentMileage !== undefined) {
      await updateVehicleStatuses(vehicle.id);
    }

    // Regenerate schedule if drive type or engine changed (picks up new matching rules)
    if (driveType !== undefined || engine !== undefined) {
      await generateScheduleForVehicle(vehicle.id);
    }

    const updated = await queryOne('SELECT * FROM vehicles WHERE id = $1', [vehicle.id]);
    res.json(updated);
  } catch (err) {
    console.error('Update vehicle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Vehicle ─────────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    await execute('DELETE FROM vehicles WHERE id = $1', [vehicle.id]);
    res.json({ message: 'Vehicle deleted' });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
