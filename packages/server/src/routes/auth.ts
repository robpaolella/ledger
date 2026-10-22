import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { TOTP, Secret } from 'otpauth';
import { db, sqlite } from '../db/index.js';
import { users, userPermissions, appConfig } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sanitize } from '../utils/sanitize.js';
import { ALL_PERMISSIONS } from '../middleware/permissions.js';
import { getJwtSecret } from '../utils/jwt.js';
import type { AuthPayload } from '@ledger/shared/src/types.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = sanitize(req.body);

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Account is disabled. Contact an administrator.' });
    return;
  }

  const secret = getJwtSecret();

  // If 2FA is enabled, return a temp token instead of full JWT
  if (user.twofa_enabled) {
    const tempToken = jwt.sign(
      { userId: user.id, username: user.username, displayName: user.display_name, role: user.role, purpose: '2fa' } as AuthPayload,
      secret,
      { expiresIn: '5m' }
    );

    res.json({
      data: {
        status: '2fa_required',
        tempToken,
      },
    });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, displayName: user.display_name, role: user.role },
    secret,
    { expiresIn: '7d' }
  );

  // Check if 2FA setup is required for this user's role
  const twofaSetupRequired = check2FARequired(user.role, !!user.twofa_enabled);

  res.json({
    data: {
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, twofaEnabled: false },
      ...(twofaSetupRequired && { twofaSetupRequired: true }),
    },
  });
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response): void => {
  res.json({ data: { message: 'Logged out' } });
});

// PUT /api/auth/change-password — self-service password change
router.put('/change-password', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { currentPassword, newPassword } = sanitize(req.body) as {
      currentPassword: string; newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);
    sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.userId);

    res.json({ data: { message: 'Password changed successfully' } });
  } catch (err) {
    console.error('PUT /auth/change-password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// PUT /api/auth/profile — update own display name
router.put('/profile', (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { displayName } = sanitize(req.body) as { displayName: string };
  if (!displayName || !displayName.trim()) {
    res.status(400).json({ error: 'Display name is required' });
    return;
  }

  sqlite.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName.trim(), req.user.userId);

  res.json({ data: { message: 'Profile updated' } });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Fetch fresh display name, role, and 2FA status from DB
  const freshUser = sqlite.prepare('SELECT display_name, role, twofa_enabled FROM users WHERE id = ?').get(req.user.userId) as { display_name: string; role: string; twofa_enabled: number } | undefined;
  if (!freshUser) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  // Build permissions map using DB role (not JWT role, which may be stale)
  let permissions: Record<string, boolean>;

  if (freshUser.role === 'admin' || freshUser.role === 'owner') {
    permissions = {};
    for (const perm of ALL_PERMISSIONS) {
      permissions[perm] = true;
    }
  } else {
    const rows = db.select({
      permission: userPermissions.permission,
      granted: userPermissions.granted,
    }).from(userPermissions).where(eq(userPermissions.user_id, req.user.userId)).all();

    permissions = {};
    for (const perm of ALL_PERMISSIONS) {
      permissions[perm] = false;
    }
    for (const row of rows) {
      permissions[row.permission] = row.granted === 1;
    }
  }

  // Check if 2FA setup is required for this role
  const twofaSetupRequired = check2FARequired(freshUser.role, !!freshUser.twofa_enabled);

  res.json({
    data: {
      id: req.user.userId,
      username: req.user.username,
      displayName: freshUser.display_name,
      role: freshUser.role,
      permissions,
      twofaEnabled: !!freshUser.twofa_enabled,
      ...(twofaSetupRequired && { twofaSetupRequired: true }),
    },
  });
});

/** Check if 2FA setup is required based on role-level requirements */
function check2FARequired(role: string, twofaEnabled: boolean): boolean {
  if (twofaEnabled) return false;
  if (role === 'owner') return false; // Owner is never forced

  if (role === 'admin') {
    const row = db.select().from(appConfig).where(eq(appConfig.key, 'require_2fa_admin')).get();
    return row?.value === 'true';
  }

  if (role === 'member') {
    const row = db.select().from(appConfig).where(eq(appConfig.key, 'require_2fa_member')).get();
    return row?.value === 'true';
  }

  return false;
}

// Track 2FA verify attempts per temp token
const twofaAttempts = new Map<string, number>();
// Temp tokens live 5 minutes; sweep counters for tokens that can no longer be used.
const twofaAttemptsSeen = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [tok, at] of twofaAttemptsSeen) {
    if (at < cutoff) { twofaAttemptsSeen.delete(tok); twofaAttempts.delete(tok); }
  }
}, 5 * 60_000).unref();

// POST /api/auth/2fa/verify — verify TOTP code during login (uses temp token)
router.post('/2fa/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, token: totpCode, backupCode } = sanitize(req.body) as {
      tempToken: string;
      token?: string;
      backupCode?: string;
    };

    if (!tempToken) {
      res.status(400).json({ error: 'Temporary token is required' });
      return;
    }

    if (!totpCode && !backupCode) {
      res.status(400).json({ error: 'Verification code or backup code is required' });
      return;
    }

    // Check rate limit per temp token
    const attempts = twofaAttempts.get(tempToken) || 0;
    if (attempts >= 5) {
      res.status(429).json({ error: 'Too many attempts. Please log in again.' });
      return;
    }

    // Verify the temp token
    const jwtSecret = getJwtSecret();
    let payload: AuthPayload;
    try {
      payload = jwt.verify(tempToken, jwtSecret) as AuthPayload;
    } catch {
      res.status(401).json({ error: 'Temporary token is invalid or expired. Please log in again.' });
      return;
    }

    if (payload.purpose !== '2fa') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
    if (!user || !user.twofa_enabled || !user.twofa_secret) {
      res.status(400).json({ error: '2FA is not configured for this account' });
      return;
    }

    let verified = false;

    if (totpCode) {
      // Verify TOTP code
      const totp = new TOTP({
        issuer: 'Ledger',
        label: user.username,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(user.twofa_secret),
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      verified = delta !== null;
    } else if (backupCode) {
      // Verify backup code
      const storedHashes: string[] = user.twofa_backup_codes ? JSON.parse(user.twofa_backup_codes) : [];
      for (let i = 0; i < storedHashes.length; i++) {
        const match = await bcrypt.compare(backupCode.toUpperCase(), storedHashes[i]);
        if (match) {
          // Remove used backup code
          storedHashes.splice(i, 1);
          sqlite.prepare('UPDATE users SET twofa_backup_codes = ? WHERE id = ?')
            .run(JSON.stringify(storedHashes), user.id);
          verified = true;
          break;
        }
      }
    }

    if (!verified) {
      twofaAttempts.set(tempToken, attempts + 1);
      twofaAttemptsSeen.set(tempToken, Date.now());
      const remaining = 4 - attempts;
      res.status(400).json({
        error: 'Invalid verification code',
        attemptsRemaining: remaining > 0 ? remaining : 0,
      });
      return;
    }

    // Clean up attempt tracking
    twofaAttempts.delete(tempToken);

    // Issue full JWT
    const fullToken = jwt.sign(
      { userId: user.id, username: user.username, displayName: user.display_name, role: user.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Check if 2FA setup is required (shouldn't be if they just used 2FA, but for completeness)
    const twofaSetupRequired = check2FARequired(user.role, !!user.twofa_enabled);

    res.json({
      data: {
        token: fullToken,
        user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, twofaEnabled: true },
        ...(twofaSetupRequired && { twofaSetupRequired: true }),
      },
    });
  } catch (err) {
    console.error('POST /auth/2fa/verify error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA code' });
  }
});

export default router;
