import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { calculateCurrentValue } from '../utils/depreciation.js';
import { requirePermission } from '../middleware/permissions.js';
import { isValidYmd, toFinite } from '../utils/validate.js';

const router = Router();

// GET /api/assets
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.select().from(assets).all();
    const data = rows.map((a) => ({
      ...a,
      currentValue: calculateCurrentValue({
        cost: a.cost, salvageValue: a.salvage_value, lifespanYears: a.lifespan_years,
        purchaseDate: a.purchase_date, depreciationMethod: a.depreciation_method as 'straight_line' | 'declining_balance',
        decliningRate: a.declining_rate,
      }),
    }));
    res.json({ data });
  } catch (err) {
    console.error('GET /assets error:', err);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// GET /api/assets/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const asset = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    res.json({
      data: {
        ...asset,
        currentValue: calculateCurrentValue({
          cost: asset.cost, salvageValue: asset.salvage_value, lifespanYears: asset.lifespan_years,
          purchaseDate: asset.purchase_date, depreciationMethod: asset.depreciation_method as 'straight_line' | 'declining_balance',
          decliningRate: asset.declining_rate,
        }),
      },
    });
  } catch (err) {
    console.error('GET /assets/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// POST /api/assets
router.post('/', requirePermission('assets.create'), (req: Request, res: Response) => {
  try {
    const { name, purchaseDate, depreciationMethod } = req.body;
    const cost = toFinite(req.body.cost), salvageValue = toFinite(req.body.salvageValue);
    const lifespanYears = toFinite(req.body.lifespanYears), decliningRate = toFinite(req.body.decliningRate);
    if (!name || !purchaseDate || cost == null || salvageValue == null) {
      res.status(400).json({ error: 'name, purchaseDate, cost, and salvageValue are required' });
      return;
    }
    if (!isValidYmd(purchaseDate)) { res.status(400).json({ error: 'purchaseDate must be YYYY-MM-DD' }); return; }
    if (cost < 0 || salvageValue < 0) { res.status(400).json({ error: 'cost and salvageValue cannot be negative' }); return; }
    const method = depreciationMethod || 'straight_line';
    if (method !== 'straight_line' && method !== 'declining_balance') { res.status(400).json({ error: 'depreciationMethod must be straight_line or declining_balance' }); return; }
    if (method === 'straight_line' && (lifespanYears == null || lifespanYears <= 0)) {
      res.status(400).json({ error: 'lifespanYears must be greater than 0 for straight line depreciation' });
      return;
    }
    if (method === 'declining_balance' && (decliningRate == null || decliningRate <= 0 || decliningRate >= 100)) {
      res.status(400).json({ error: 'decliningRate (1-99) is required for declining balance depreciation' });
      return;
    }

    const result = db.insert(assets)
      .values({
        name, purchase_date: purchaseDate, cost, lifespan_years: lifespanYears ?? 0,
        salvage_value: salvageValue, depreciation_method: method,
        declining_rate: method === 'declining_balance' ? decliningRate : null,
      })
      .run();

    res.status(201).json({ data: { id: result.lastInsertRowid, name, purchaseDate, cost, lifespanYears, salvageValue, depreciationMethod: method, decliningRate } });
  } catch (err) {
    console.error('POST /assets error:', err);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// PUT /api/assets/:id
router.put('/:id', requirePermission('assets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const { name, purchaseDate, depreciationMethod } = req.body;
    const cost = req.body.cost === undefined ? undefined : toFinite(req.body.cost);
    const salvageValue = req.body.salvageValue === undefined ? undefined : toFinite(req.body.salvageValue);
    const lifespanYears = req.body.lifespanYears === undefined ? undefined : toFinite(req.body.lifespanYears);
    const decliningRate = req.body.decliningRate === undefined ? undefined : toFinite(req.body.decliningRate);
    const method = depreciationMethod ?? existing.depreciation_method;
    if (purchaseDate !== undefined && !isValidYmd(purchaseDate)) { res.status(400).json({ error: 'purchaseDate must be YYYY-MM-DD' }); return; }
    if (cost === null || salvageValue === null || lifespanYears === null || decliningRate === null) { res.status(400).json({ error: 'Numeric fields must be numbers' }); return; }
    if (method !== 'straight_line' && method !== 'declining_balance') { res.status(400).json({ error: 'depreciationMethod must be straight_line or declining_balance' }); return; }
    const finalLifespan = lifespanYears ?? existing.lifespan_years;
    if (method === 'straight_line' && !(finalLifespan > 0)) { res.status(400).json({ error: 'lifespanYears must be greater than 0 for straight line depreciation' }); return; }
    const finalRate = decliningRate ?? existing.declining_rate;
    if (method === 'declining_balance' && (finalRate == null || finalRate <= 0 || finalRate >= 100)) { res.status(400).json({ error: 'decliningRate (1-99) is required for declining balance depreciation' }); return; }
    db.update(assets).set({
      name: name ?? existing.name,
      purchase_date: purchaseDate ?? existing.purchase_date,
      cost: cost ?? existing.cost,
      lifespan_years: lifespanYears ?? existing.lifespan_years,
      salvage_value: salvageValue ?? existing.salvage_value,
      depreciation_method: method,
      declining_rate: method === 'declining_balance' ? (decliningRate ?? existing.declining_rate) : null,
    }).where(eq(assets.id, id)).run();

    res.json({ data: { id, name: name ?? existing.name } });
  } catch (err) {
    console.error('PUT /assets/:id error:', err);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// DELETE /api/assets/:id
router.delete('/:id', requirePermission('assets.delete'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    db.delete(assets).where(eq(assets.id, id)).run();
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('DELETE /assets/:id error:', err);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export default router;
