import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requireRole } from '../middleware/permissions.js';
import { getConfig, setConfig } from '../services/appConfig.js';
import { llmStatus } from '../services/llmCategorize.js';

/** AI categorization settings + connection probe. Admin-only. */
const router = Router();

// GET /api/llm/config
router.get('/config', requireRole('admin'), (_req: Request, res: Response) => {
  res.json({
    data: {
      enabled: getConfig(sqlite, 'llm.enabled') === '1',
      baseUrl: getConfig(sqlite, 'llm.base_url') ?? '',
      model: getConfig(sqlite, 'llm.model') ?? '',
    },
  });
});

// PUT /api/llm/config { enabled?, baseUrl?, model? }
router.put('/config', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const { enabled, baseUrl, model } = req.body as { enabled?: unknown; baseUrl?: unknown; model?: unknown };
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      setConfig(sqlite, 'llm.enabled', enabled ? '1' : '0');
    }
    if (baseUrl !== undefined) {
      if (typeof baseUrl !== 'string') return res.status(400).json({ error: 'baseUrl must be a string' });
      const cleaned = baseUrl.trim().replace(/\/+$/, '');
      if (cleaned && !/^https?:\/\//.test(cleaned)) return res.status(400).json({ error: 'baseUrl must start with http:// or https://' });
      setConfig(sqlite, 'llm.base_url', cleaned);
    }
    if (model !== undefined) {
      if (typeof model !== 'string') return res.status(400).json({ error: 'model must be a string' });
      setConfig(sqlite, 'llm.model', model.trim());
    }
    res.json({
      data: {
        enabled: getConfig(sqlite, 'llm.enabled') === '1',
        baseUrl: getConfig(sqlite, 'llm.base_url') ?? '',
        model: getConfig(sqlite, 'llm.model') ?? '',
      },
    });
  } catch (err) {
    console.error('PUT /llm/config error:', err);
    res.status(500).json({ error: 'Failed to save LLM config' });
  }
});

// GET /api/llm/status — connection + model probe
router.get('/status', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    res.json({ data: await llmStatus(sqlite) });
  } catch (err) {
    console.error('GET /llm/status error:', err);
    res.status(500).json({ error: 'Failed to check LLM status' });
  }
});

export default router;
