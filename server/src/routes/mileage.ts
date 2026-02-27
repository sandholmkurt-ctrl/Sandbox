import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { AddMileageSchema, UpdateMileageSchema, Vehicle, MileageEntry } from '../types';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { updateVehicleStatuses } from '../services/scheduleEngine';

const router = Router();
router.use(authMiddleware);

// ─── Get Mileage History ────────────────────────────────
router.get('/:vehicleId/mileage', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const entries = db.prepare(`
      SELECT * FROM mileage_entries WHERE vehicle_id = ?
      ORDER BY recorded_at DESC
    `).all(vehicle.id);

    res.json(entries);
  } catch (err) {
    console.error('Get mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add Mileage Entry ──────────────────────────────────
router.post('/:vehicleId/mileage', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const parsed = AddMileageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { mileage, recordedAt, notes } = parsed.data;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO mileage_entries (id, vehicle_id, mileage, recorded_at, notes)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?)
    `).run(id, vehicle.id, mileage, recordedAt || null, notes || null);

    // Update vehicle current mileage if this is the highest
    if (mileage > vehicle.current_mileage) {
      db.prepare("UPDATE vehicles SET current_mileage = ?, updated_at = datetime('now') WHERE id = ?")
        .run(mileage, vehicle.id);
      updateVehicleStatuses(vehicle.id);
    }

    const entry = db.prepare('SELECT * FROM mileage_entries WHERE id = ?').get(id);
    res.status(201).json(entry);
  } catch (err) {
    console.error('Add mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update Mileage Entry ───────────────────────────────
router.put('/:vehicleId/mileage/:entryId', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const entry = db.prepare(
      'SELECT * FROM mileage_entries WHERE id = ? AND vehicle_id = ?'
    ).get(req.params.entryId, vehicle.id) as MileageEntry | undefined;

    if (!entry) {
      res.status(404).json({ error: 'Mileage entry not found' });
      return;
    }

    const parsed = UpdateMileageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    db.prepare('UPDATE mileage_entries SET mileage = ?, notes = ? WHERE id = ?')
      .run(parsed.data.mileage, parsed.data.notes || entry.notes, entry.id);

    // Recalculate vehicle current mileage
    const maxMileage = db.prepare(
      'SELECT MAX(mileage) as max_mileage FROM mileage_entries WHERE vehicle_id = ?'
    ).get(vehicle.id) as { max_mileage: number };

    if (maxMileage?.max_mileage !== undefined) {
      db.prepare("UPDATE vehicles SET current_mileage = ?, updated_at = datetime('now') WHERE id = ?")
        .run(maxMileage.max_mileage, vehicle.id);
      updateVehicleStatuses(vehicle.id);
    }

    const updated = db.prepare('SELECT * FROM mileage_entries WHERE id = ?').get(entry.id);
    res.json(updated);
  } catch (err) {
    console.error('Update mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Mileage Entry ───────────────────────────────
router.delete('/:vehicleId/mileage/:entryId', (req: AuthRequest, res: Response) => {
  try {
    const vehicle = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.vehicleId, req.userId) as Vehicle | undefined;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const entry = db.prepare(
      'SELECT * FROM mileage_entries WHERE id = ? AND vehicle_id = ?'
    ).get(req.params.entryId, vehicle.id);

    if (!entry) {
      res.status(404).json({ error: 'Mileage entry not found' });
      return;
    }

    db.prepare('DELETE FROM mileage_entries WHERE id = ?').run(req.params.entryId);
    res.json({ message: 'Mileage entry deleted' });
  } catch (err) {
    console.error('Delete mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
