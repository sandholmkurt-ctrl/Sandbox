import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// ─── Get Notifications ──────────────────────────────────
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { unreadOnly } = req.query;
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    if (unreadOnly === 'true') {
      query += ' AND is_read = 0';
    }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const notifications = db.prepare(query).all(req.userId);
    res.json(notifications);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get Unread Count ───────────────────────────────────
router.get('/count', (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(req.userId) as { count: number };

    res.json({ count: result.count });
  } catch (err) {
    console.error('Get notification count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Mark as Read ───────────────────────────────────────
router.put('/:id/read', (req: AuthRequest, res: Response) => {
  try {
    db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.userId);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Mark All as Read ───────────────────────────────────
router.put('/read-all', (req: AuthRequest, res: Response) => {
  try {
    db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
    ).run(req.userId);

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete Notification ────────────────────────────────
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.userId);

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
