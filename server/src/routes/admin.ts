import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { ServiceDefinitionSchema, ScheduleRuleSchema } from '../types';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);
router.use(adminMiddleware);

// ═══════════════════════════════════════════════════════
// Service Definitions
// ═══════════════════════════════════════════════════════

router.get('/service-definitions', (_req: AuthRequest, res: Response) => {
  try {
    const definitions = db.prepare('SELECT * FROM service_definitions ORDER BY category, name').all();
    res.json(definitions);
  } catch (err) {
    console.error('List service definitions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/service-definitions', (req: AuthRequest, res: Response) => {
  try {
    const parsed = ServiceDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO service_definitions (id, name, description, category) VALUES (?, ?, ?, ?)
    `).run(id, parsed.data.name, parsed.data.description || null, parsed.data.category || null);

    const def = db.prepare('SELECT * FROM service_definitions WHERE id = ?').get(id);
    res.status(201).json(def);
  } catch (err) {
    console.error('Create service definition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/service-definitions/:id', (req: AuthRequest, res: Response) => {
  try {
    const parsed = ServiceDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    db.prepare(`
      UPDATE service_definitions SET name = ?, description = ?, category = ? WHERE id = ?
    `).run(parsed.data.name, parsed.data.description || null, parsed.data.category || null, req.params.id);

    const def = db.prepare('SELECT * FROM service_definitions WHERE id = ?').get(req.params.id);
    if (!def) {
      res.status(404).json({ error: 'Service definition not found' });
      return;
    }

    res.json(def);
  } catch (err) {
    console.error('Update service definition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/service-definitions/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE service_definitions SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Service definition deactivated' });
  } catch (err) {
    console.error('Delete service definition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════
// Schedule Rules
// ═══════════════════════════════════════════════════════

router.get('/schedule-rules', (_req: AuthRequest, res: Response) => {
  try {
    const rules = db.prepare(`
      SELECT sr.*, sd.name as service_name, sd.category
      FROM schedule_rules sr
      JOIN service_definitions sd ON sd.id = sr.service_definition_id
      ORDER BY sr.make, sr.model, sd.category, sd.name
    `).all();

    res.json(rules);
  } catch (err) {
    console.error('List schedule rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/schedule-rules', (req: AuthRequest, res: Response) => {
  try {
    const parsed = ScheduleRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const d = parsed.data;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO schedule_rules (id, service_definition_id, year_min, year_max, make, model, engine, drive_type, mileage_interval, month_interval, is_combined, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, d.serviceDefinitionId,
      d.yearMin ?? null, d.yearMax ?? null,
      d.make ?? null, d.model ?? null,
      d.engine ?? null, d.driveType ?? null,
      d.mileageInterval ?? null, d.monthInterval ?? null,
      d.isCombined ? 1 : 0, d.priority,
      d.notes ?? null
    );

    const rule = db.prepare('SELECT * FROM schedule_rules WHERE id = ?').get(id);
    res.status(201).json(rule);
  } catch (err) {
    console.error('Create schedule rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/schedule-rules/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM schedule_rules WHERE id = ?').run(req.params.id);
    res.json({ message: 'Schedule rule deleted' });
  } catch (err) {
    console.error('Delete schedule rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════
// System Health / Stats
// ═══════════════════════════════════════════════════════

router.get('/stats', (_req: AuthRequest, res: Response) => {
  try {
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    const vehicleCount = (db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as any).count;
    const serviceCount = (db.prepare('SELECT COUNT(*) as count FROM service_history').get() as any).count;
    const overdueCount = (db.prepare("SELECT COUNT(*) as count FROM vehicle_schedules WHERE status = 'overdue'").get() as any).count;
    const upcomingCount = (db.prepare("SELECT COUNT(*) as count FROM vehicle_schedules WHERE status = 'upcoming'").get() as any).count;

    res.json({
      users: userCount,
      vehicles: vehicleCount,
      servicesCompleted: serviceCount,
      overdueServices: overdueCount,
      upcomingServices: upcomingCount,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
