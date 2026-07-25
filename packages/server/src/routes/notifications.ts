import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';

const router = Router();

/**
 * Per-user notification center. Every endpoint is self-scoped to the
 * authenticated user — no permission gates (your notifications are yours).
 * The client bell dropdown is the only surface: unread + read sections,
 * explicit "Mark all read", per-row clear (delete), Clear All.
 */

interface NotifRow {
  id: number; type: string; severity: string; title: string; body: string | null;
  action_label: string | null; action_target: string | null; is_read: number; created_at: string;
}

const mapRow = (r: NotifRow) => ({
  id: r.id,
  type: r.type,
  severity: r.severity as 'info' | 'success' | 'warning' | 'error',
  title: r.title,
  body: r.body,
  actionLabel: r.action_label,
  actionTarget: r.action_target,
  isRead: r.is_read === 1,
  createdAt: r.created_at,
});

// GET /api/notifications?readLimit=30 — unread (all) + read (capped), newest first
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const readLimit = Math.min(Math.max(parseInt(String(req.query.readLimit ?? '30'), 10) || 30, 1), 100);
    const unread = (sqlite.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC, id DESC',
    ).all(userId) as NotifRow[]).map(mapRow);
    const read = (sqlite.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND is_read = 1 ORDER BY created_at DESC, id DESC LIMIT ?',
    ).all(userId, readLimit) as NotifRow[]).map(mapRow);
    res.json({ data: { unread, read, unreadCount: unread.length } });
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// GET /api/notifications/unread-count — cheap bell-poll target
router.get('/unread-count', (req: Request, res: Response) => {
  try {
    const row = sqlite.prepare(`
      SELECT COUNT(*) AS count,
             SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors
      FROM notifications WHERE user_id = ? AND is_read = 0
    `).get(req.user!.userId) as { count: number; errors: number | null };
    res.json({ data: { count: row.count, hasError: (row.errors ?? 0) > 0 } });
  } catch (err) {
    console.error('GET /notifications/unread-count error:', err);
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

// POST /api/notifications/read-all — explicit "Mark all read"
router.post('/read-all', (req: Request, res: Response) => {
  try {
    const r = sqlite.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
      .run(req.user!.userId);
    res.json({ data: { updated: r.changes } });
  } catch (err) {
    console.error('POST /notifications/read-all error:', err);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// DELETE /api/notifications — Clear All
router.delete('/', (req: Request, res: Response) => {
  try {
    const r = sqlite.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user!.userId);
    res.json({ data: { deleted: r.changes } });
  } catch (err) {
    console.error('DELETE /notifications error:', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// DELETE /api/notifications/:id — hover-clear one row
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const r = sqlite.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
      .run(id, req.user!.userId);
    if (r.changes === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ data: { id } });
  } catch (err) {
    console.error('DELETE /notifications/:id error:', err);
    res.status(500).json({ error: 'Failed to clear notification' });
  }
});

export default router;
