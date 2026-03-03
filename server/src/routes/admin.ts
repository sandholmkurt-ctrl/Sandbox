import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ─── List Service Definitions ───────────────────────────
router.get('/service-definitions', async (_req: AuthRequest, res: Response) => {
  try {
    const definitions = await queryAll('SELECT * FROM service_definitions ORDER BY category, name');
    res.json(definitions);
  } catch (err) {
    console.error('List service definitions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add Service Definition ─────────────────────────────
router.post('/service-definitions', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category } = req.body;
    const id = uuidv4();

    await execute(
      'INSERT INTO service_definitions (id, name, description, category) VALUES ($1, $2, $3, $4)',
      [id, name, description || null, category || 'general']
    );

    const def = await queryOne('SELECT * FROM service_definitions WHERE id = $1', [id]);
    res.status(201).json(def);
  } catch (err) {
    console.error('Add service definition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update Service Definition ──────────────────────────
router.put('/service-definitions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category } = req.body;
    await execute(
      'UPDATE service_definitions SET name = $1, description = $2, category = $3 WHERE id = $4',
      [name, description, category, req.params.id]
    );

    const def = await queryOne('SELECT * FROM service_definitions WHERE id = $1', [req.params.id]);
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

// ─── Delete Service Definition ──────────────────────────
router.delete('/service-definitions/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM service_definitions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Service definition deleted' });
  } catch (err) {
    console.error('Delete service definition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── List Schedule Rules ────────────────────────────────
router.get('/schedule-rules', async (_req: AuthRequest, res: Response) => {
  try {
    const rules = await queryAll(`
      SELECT sr.*, sd.name as service_name, sd.category
      FROM schedule_rules sr
      JOIN service_definitions sd ON sd.id = sr.service_definition_id
      ORDER BY sr.make, sr.model, sd.name
    `);
    res.json(rules);
  } catch (err) {
    console.error('List schedule rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add Schedule Rule ──────────────────────────────────
router.post('/schedule-rules', async (req: AuthRequest, res: Response) => {
  try {
    const {
      serviceDefinitionId, make, model, yearMin, yearMax,
      engine, trimLevel, driveType, mileageInterval, monthInterval,
      severity, notes, source
    } = req.body;
    const id = uuidv4();

    await execute(
      `INSERT INTO schedule_rules (id, service_definition_id, make, model, year_min, year_max, engine, trim_level, drive_type, mileage_interval, month_interval, severity, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, serviceDefinitionId, make || null, model || null, yearMin || null, yearMax || null,
       engine || null, trimLevel || null, driveType || null, mileageInterval || null,
       monthInterval || null, severity || 'normal', notes || null, source || null]
    );

    const rule = await queryOne('SELECT * FROM schedule_rules WHERE id = $1', [id]);
    res.status(201).json(rule);
  } catch (err) {
    console.error('Add schedule rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update Schedule Rule ───────────────────────────────
router.put('/schedule-rules/:id', async (req: AuthRequest, res: Response) => {
  try {
    const {
      serviceDefinitionId, make, model, yearMin, yearMax,
      engine, trimLevel, driveType, mileageInterval, monthInterval,
      severity, notes, source
    } = req.body;

    await execute(
      `UPDATE schedule_rules SET
        service_definition_id = $1, make = $2, model = $3, year_min = $4, year_max = $5,
        engine = $6, trim_level = $7, drive_type = $8, mileage_interval = $9, month_interval = $10,
        severity = $11, notes = $12, source = $13
       WHERE id = $14`,
      [serviceDefinitionId, make, model, yearMin, yearMax,
       engine, trimLevel, driveType, mileageInterval, monthInterval,
       severity, notes, source, req.params.id]
    );

    const rule = await queryOne('SELECT * FROM schedule_rules WHERE id = $1', [req.params.id]);
    if (!rule) {
      res.status(404).json({ error: 'Schedule rule not found' });
      return;
    }
    res.json(rule);
  } catch (err) {
    console.error('Update schedule rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Schedule Rule ───────────────────────────────
router.delete('/schedule-rules/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM schedule_rules WHERE id = $1', [req.params.id]);
    res.json({ message: 'Schedule rule deleted' });
  } catch (err) {
    console.error('Delete schedule rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── System Stats ───────────────────────────────────────
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users');
    const vehicles = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM vehicles');
    const definitions = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM service_definitions');
    const rules = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM schedule_rules');

    res.json({
      users: parseInt(users?.count || '0', 10),
      vehicles: parseInt(vehicles?.count || '0', 10),
      serviceDefinitions: parseInt(definitions?.count || '0', 10),
      scheduleRules: parseInt(rules?.count || '0', 10),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
