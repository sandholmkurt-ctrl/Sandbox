import { Router, Response } from 'express';
import { queryOne, queryAll, execute } from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ─── List Notifications ─────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { unreadOnly } = req.query;

    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params: any[] = [req.userId];

    if (unreadOnly === 'true') {
      sql += ' AND is_read = 0';
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    const notifications = await queryAll(sql, params);
    res.json(notifications);
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Count Unread ───────────────────────────────────────
router.get('/count', async (req: AuthRequest, res: Response) => {
  try {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 0',
      [req.userId]
    );
    res.json({ count: parseInt(result?.count || '0', 10) });
  } catch (err) {
    console.error('Count notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Mark Read ──────────────────────────────────────────
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await execute(
      'UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Mark All Read ──────────────────────────────────────
router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await execute(
      'UPDATE notifications SET is_read = 1 WHERE user_id = $1',
      [req.userId]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Notification ────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
