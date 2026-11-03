import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requireRole } from '../middleware/permissions.js';
import { setConfig, getConfig } from '../services/appConfig.js';
import { BENCHMARKS_ENABLED_KEY, BENCHMARKS_LAST_UPDATED_KEY, benchmarksEnabled } from '../services/benchmarks.js';

/** Investment benchmark price sync status + switch. Admin-only; never returns the token. */
const router = Router();

// GET /api/benchmarks/status
router.get('/status', requireRole('admin'), (_req: Request, res: Response) => {
  res.json({
    data: {
      configured: Boolean(process.env.TIINGO_TOKEN),
      enabled: benchmarksEnabled(sqlite),
      lastUpdatedAt: getConfig(sqlite, BENCHMARKS_LAST_UPDATED_KEY),
    },
  });
});

// PUT /api/benchmarks/config { enabled }
router.put('/config', requireRole('admin'), (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled?: unknown };
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
  setConfig(sqlite, BENCHMARKS_ENABLED_KEY, enabled ? '1' : '0');
  res.json({ data: { enabled } });
});

export default router;
