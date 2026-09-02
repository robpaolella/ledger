import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthPayload } from '@ledger/shared/src/types.js';
import { getJwtSecret } from '../utils/jwt.js';
import { sqlite } from '../db/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/2fa/verify', '/api/health', '/api/setup'];

/**
 * A JWT lives for days, so its `role` claim can go stale and it keeps working
 * after the account is deactivated. Re-read the live row on every request
 * (cached briefly per user) so a demotion or deactivation takes effect within
 * a minute instead of at token expiry.
 */
const LIVE_TTL_MS = 60_000;
type Role = AuthPayload['role'];
const liveCache = new Map<number, { at: number; role: Role; active: boolean }>();
const liveStmt = () => sqlite.prepare('SELECT role, is_active FROM users WHERE id = ?');

function liveUser(userId: number): { role: Role; active: boolean } | null {
  const now = Date.now();
  const hit = liveCache.get(userId);
  if (hit && now - hit.at < LIVE_TTL_MS) return hit;
  const row = liveStmt().get(userId) as { role: Role; is_active: number } | undefined;
  if (!row) { liveCache.delete(userId); return null; }
  const entry = { at: now, role: row.role, active: row.is_active === 1 };
  liveCache.set(userId, entry);
  return entry;
}

/** Drop the cached row after a role/active change so it applies immediately. */
export function invalidateLiveUser(userId?: number): void {
  if (userId == null) liveCache.clear(); else liveCache.delete(userId);
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Use originalUrl for full path matching since middleware may be mounted at a sub-path
  if (PUBLIC_PATHS.some(p => req.originalUrl === p || req.originalUrl.startsWith(p + '?') || req.originalUrl.startsWith(p + '/'))) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Reject temp 2FA tokens from being used as full auth tokens
  if (payload.purpose === '2fa') {
    res.status(401).json({ error: 'Invalid token — 2FA verification required' });
    return;
  }

  const live = liveUser(payload.userId);
  if (!live || !live.active) {
    res.status(401).json({ error: 'This account is no longer active' });
    return;
  }

  req.user = { ...payload, role: live.role };
  next();
}
