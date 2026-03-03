import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../database';
import { AddMileageSchema, UpdateMileageSchema, Vehicle, MileageEntry } from '../types';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { updateVehicleStatuses } from '../services/scheduleEngine';

const router = Router();
router.use(authMiddleware);

// ─── Get Mileage History ────────────────────────────────
router.get('/:vehicleId/mileage', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const entries = await queryAll(
      `SELECT * FROM mileage_entries WHERE vehicle_id = $1
       ORDER BY recorded_at DESC`,
      [vehicle.id]
    );

    res.json(entries);
  } catch (err) {
    console.error('Get mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add Mileage Entry ──────────────────────────────────
router.post('/:vehicleId/mileage', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

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

    await execute(
      `INSERT INTO mileage_entries (id, vehicle_id, mileage, recorded_at, notes)
       VALUES ($1, $2, $3, COALESCE($4, NOW()), $5)`,
      [id, vehicle.id, mileage, recordedAt || null, notes || null]
    );

    // Update vehicle current mileage if this is the highest
    if (mileage > vehicle.current_mileage) {
      await execute(
        "UPDATE vehicles SET current_mileage = $1, updated_at = NOW() WHERE id = $2",
        [mileage, vehicle.id]
      );
      await updateVehicleStatuses(vehicle.id);
    }

    const entry = await queryOne('SELECT * FROM mileage_entries WHERE id = $1', [id]);
    res.status(201).json(entry);
  } catch (err) {
    console.error('Add mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update Mileage Entry ───────────────────────────────
router.put('/:vehicleId/mileage/:entryId', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const entry = await queryOne<MileageEntry>(
      'SELECT * FROM mileage_entries WHERE id = $1 AND vehicle_id = $2',
      [req.params.entryId, vehicle.id]
    );

    if (!entry) {
      res.status(404).json({ error: 'Mileage entry not found' });
      return;
    }

    const parsed = UpdateMileageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    await execute(
      'UPDATE mileage_entries SET mileage = $1, notes = $2 WHERE id = $3',
      [parsed.data.mileage, parsed.data.notes || entry.notes, entry.id]
    );

    // Recalculate vehicle current mileage
    const maxMileage = await queryOne<{ max_mileage: number }>(
      'SELECT MAX(mileage) as max_mileage FROM mileage_entries WHERE vehicle_id = $1',
      [vehicle.id]
    );

    if (maxMileage?.max_mileage !== undefined) {
      await execute(
        "UPDATE vehicles SET current_mileage = $1, updated_at = NOW() WHERE id = $2",
        [maxMileage.max_mileage, vehicle.id]
      );
      await updateVehicleStatuses(vehicle.id);
    }

    const updated = await queryOne('SELECT * FROM mileage_entries WHERE id = $1', [entry.id]);
    res.json(updated);
  } catch (err) {
    console.error('Update mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Mileage Entry ───────────────────────────────
router.delete('/:vehicleId/mileage/:entryId', async (req: AuthRequest, res: Response) => {
  try {
    const vehicle = await queryOne<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.vehicleId, req.userId]
    );

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const entry = await queryOne(
      'SELECT * FROM mileage_entries WHERE id = $1 AND vehicle_id = $2',
      [req.params.entryId, vehicle.id]
    );

    if (!entry) {
      res.status(404).json({ error: 'Mileage entry not found' });
      return;
    }

    await execute('DELETE FROM mileage_entries WHERE id = $1', [req.params.entryId]);
    res.json({ message: 'Mileage entry deleted' });
  } catch (err) {
    console.error('Delete mileage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
