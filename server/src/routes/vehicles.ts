import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { AddVehicleSchema, UpdateVehicleSchema, Vehicle } from '../types';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { generateScheduleForVehicle, updateVehicleStatuses } from '../services/scheduleEngine';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── List Vehicles ──────────────────────────────────────
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const vehicles = db.prepare(`
      SELECT v.*, 
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'overdue') as overdue_count,
        (SELECT COUNT(*) FROM vehicle_schedules vs WHERE vs.vehicle_id = v.id AND vs.status = 'upcoming') as upcoming_count
      FROM vehicles v 
      WHERE v.user_id = ?
      ORDER BY v.created_at DESC
    `).all(req.userId);

    res.json(vehicles);
  } catch (err) {
    console.error('List vehicles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get Single Vehicle ─────────────────────────────────
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    // Get upcoming schedules
    const schedules = db.prepare(`
      SELECT vs.*, sd.name as service_name, sd.description as service_description, sd.category,
             vs.source as oem_source, vs.source_notes as oem_notes
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      WHERE vs.vehicle_id = ?
      ORDER BY 
        CASE vs.status 
          WHEN 'overdue' THEN 0 
          WHEN 'upcoming' THEN 1 
          ELSE 2 
        END,
        vs.next_due_mileage ASC
    `).all(vehicle.id);

    // Get recent service history
    const history = db.prepare(`
      SELECT sh.*, sd.name as service_name, sd.category
      FROM service_history sh
      JOIN service_definitions sd ON sd.id = sh.service_definition_id
      WHERE sh.vehicle_id = ?
      ORDER BY sh.completed_date DESC
      LIMIT 10
    `).all(vehicle.id);

    res.json({ ...vehicle, schedules, recentHistory: history });
  } catch (err) {
    console.error('Get vehicle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add Vehicle ────────────────────────────────────────
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const parsed = AddVehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { vin, year, make, model, engine, trimLevel, driveType, currentMileage } = parsed.data;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO vehicles (id, user_id, vin, year, make, model, engine, trim_level, drive_type, current_mileage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.userId, vin || null, year, make, model, engine || null, trimLevel || null, driveType || null, currentMileage);

    // Record initial mileage
    if (currentMileage > 0) {
      db.prepare(`
        INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
        VALUES (?, ?, ?, 'Initial mileage at vehicle registration')
      `).run(uuidv4(), id, currentMileage);
    }

    // Generate maintenance schedule
    generateScheduleForVehicle(id);

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    res.status(201).json(vehicle);
  } catch (err: any) {
    console.error('Add vehicle error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err?.message || String(err) });
  }
});

// ─── Update Vehicle ─────────────────────────────────────
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId) as Vehicle | undefined;

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

    if (currentMileage !== undefined) {
      updates.push('current_mileage = ?');
      values.push(currentMileage);

      // Record mileage entry
      db.prepare(`
        INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
        VALUES (?, ?, ?, 'Mileage update')
      `).run(uuidv4(), vehicle.id, currentMileage);
    }
    if (engine !== undefined) { updates.push('engine = ?'); values.push(engine); }
    if (trimLevel !== undefined) { updates.push('trim_level = ?'); values.push(trimLevel); }
    if (driveType !== undefined) { updates.push('drive_type = ?'); values.push(driveType); }
    if (remindersEnabled !== undefined) { updates.push('reminders_enabled = ?'); values.push(remindersEnabled ? 1 : 0); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(vehicle.id);

    db.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Re-evaluate statuses if mileage changed
    if (currentMileage !== undefined) {
      updateVehicleStatuses(vehicle.id);
    }

    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle.id);
    res.json(updated);
  } catch (err) {
    console.error('Update vehicle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Vehicle ─────────────────────────────────────
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    db.prepare('DELETE FROM vehicles WHERE id = ?').run(vehicle.id);
    res.json({ message: 'Vehicle deleted' });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
