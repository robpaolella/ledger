import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { sqlite } from '../db/index.js';
import { requireRole } from '../middleware/permissions.js';
import { getConfig, setConfig } from '../services/appConfig.js';
import { amazonDir } from '../services/amazonIngest.js';
import { runAmazonPipeline } from '../services/amazonPipeline.js';

/** Amazon order-enrichment status + controls. Admin-only. */
const router = Router();

// GET /api/amazon/status
router.get('/status', requireRole('admin'), (_req: Request, res: Response) => {
  try {
    let sidecar: unknown = null;
    const statusPath = path.join(amazonDir(), 'status.json');
    if (fs.existsSync(statusPath)) {
      try { sidecar = JSON.parse(fs.readFileSync(statusPath, 'utf-8')); } catch { /* unreadable */ }
    }
    const counts = sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM amazon_orders) AS orders,
        (SELECT COUNT(*) FROM amazon_charges) AS charges,
        (SELECT COUNT(*) FROM amazon_matches) AS matched,
        (SELECT COUNT(*) FROM amazon_matches WHERE enriched_at IS NOT NULL) AS enriched
    `).get();
    res.json({
      data: {
        enabled: getConfig(sqlite, 'amazon.enabled') === '1',
        lastIngestAt: getConfig(sqlite, 'amazon.last_ingest_at'),
        dataDir: amazonDir(),
        sidecar,
        counts,
      },
    });
  } catch (err) {
    console.error('GET /amazon/status error:', err);
    res.status(500).json({ error: 'Failed to read Amazon status' });
  }
});

// PUT /api/amazon/config { enabled }
router.put('/config', requireRole('admin'), (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled?: unknown };
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
  setConfig(sqlite, 'amazon.enabled', enabled ? '1' : '0');
  res.json({ data: { enabled } });
});

// POST /api/amazon/run — ingest + match now (testing / after a manual scrape)
router.post('/run', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    if (getConfig(sqlite, 'amazon.enabled') !== '1') {
      return res.status(400).json({ error: 'Amazon integration is disabled — enable it first' });
    }
    const result = await runAmazonPipeline(sqlite);
    res.json({ data: result });
  } catch (err) {
    console.error('POST /amazon/run error:', err);
    res.status(500).json({ error: 'Amazon pipeline failed' });
  }
});

export default router;
