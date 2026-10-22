import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import { db, sqlite } from '../db/index.js';
import { users, appConfig } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sanitize } from '../utils/sanitize.js';
import { requireRole } from '../middleware/permissions.js';

const router = Router();

const ISSUER = 'Ledger';
const BACKUP_CODE_COUNT = 10;

/** Generate a random backup code in XXXX-XXXX format */
function generateBackupCode(): string {
  const hex = crypto.randomBytes(4).toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`.toUpperCase();
}

/** Generate a set of backup codes and return both plain and hashed versions */
async function generateBackupCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateBackupCode();
    plain.push(code);
    hashed.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashed };
}

// POST /api/auth/2fa/setup — generate QR code + secret for TOTP setup
router.post('/setup', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.twofa_enabled) {
      res.status(400).json({ error: '2FA is already enabled. Disable it first to reconfigure.' });
      return;
    }

    // Generate a new TOTP secret
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: ISSUER,
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrCodeUrl = await QRCode.toDataURL(otpauthUri);

    res.json({
      data: {
        qrCodeUrl,
        secret: secret.base32,
        otpauthUri,
      },
    });
  } catch (err) {
    console.error('POST /auth/2fa/setup error:', err);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// POST /api/auth/2fa/confirm — enable 2FA after verifying a TOTP code
router.post('/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { token, secret: secretBase32 } = sanitize(req.body) as { token: string; secret: string };

    if (!token || !secretBase32) {
      res.status(400).json({ error: 'Token and secret are required' });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.twofa_enabled) {
      res.status(400).json({ error: '2FA is already enabled' });
      return;
    }

    // Validate the TOTP token
    let secretObj: Secret;
    try { secretObj = Secret.fromBase32(secretBase32); }
    catch { res.status(400).json({ error: 'Invalid setup secret — start the setup again' }); return; }
    const totp = new TOTP({
      issuer: ISSUER,
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secretObj,
    });

    const delta = totp.validate({ token, window: 1 });
    if (delta === null) {
      res.status(400).json({ error: 'Invalid verification code. Please try again.' });
      return;
    }

    // Generate backup codes
    const { plain, hashed } = await generateBackupCodes();

    // Enable 2FA
    sqlite.prepare(
      'UPDATE users SET twofa_enabled = 1, twofa_secret = ?, twofa_backup_codes = ?, twofa_enabled_at = ? WHERE id = ?'
    ).run(secretBase32, JSON.stringify(hashed), new Date().toISOString(), req.user.userId);

    res.json({
      data: {
        backupCodes: plain,
      },
    });
  } catch (err) {
    console.error('POST /auth/2fa/confirm error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// POST /api/auth/2fa/disable — disable 2FA (requires password)
router.post('/disable', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { password } = sanitize(req.body) as { password: string };
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.twofa_enabled) {
      res.status(400).json({ error: '2FA is not enabled' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(400).json({ error: 'Password is incorrect' });
      return;
    }

    sqlite.prepare(
      'UPDATE users SET twofa_enabled = 0, twofa_secret = NULL, twofa_backup_codes = NULL, twofa_enabled_at = NULL WHERE id = ?'
    ).run(req.user.userId);

    res.json({ data: { message: '2FA has been disabled' } });
  } catch (err) {
    console.error('POST /auth/2fa/disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// POST /api/auth/2fa/regenerate-backup-codes — generate new backup codes (requires password)
router.post('/regenerate-backup-codes', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { password } = sanitize(req.body) as { password: string };
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.twofa_enabled) {
      res.status(400).json({ error: '2FA is not enabled' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(400).json({ error: 'Password is incorrect' });
      return;
    }

    const { plain, hashed } = await generateBackupCodes();
    sqlite.prepare('UPDATE users SET twofa_backup_codes = ? WHERE id = ?').run(
      JSON.stringify(hashed), req.user.userId
    );

    res.json({ data: { backupCodes: plain } });
  } catch (err) {
    console.error('POST /auth/2fa/regenerate-backup-codes error:', err);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

// GET /api/auth/2fa/status — get current user's 2FA status
router.get('/status', (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    data: {
      enabled: !!user.twofa_enabled,
      enabledAt: user.twofa_enabled_at,
    },
  });
});

// POST /api/auth/2fa/reset/:userId — admin/owner reset 2FA for another user
router.post('/reset/:userId', requireRole('admin'), (req: Request, res: Response): void => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const targetId = parseInt(req.params.userId as string, 10);
    if (isNaN(targetId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Cannot reset own 2FA via admin endpoint (use disable instead)
    if (targetId === req.user.userId) {
      res.status(400).json({ error: 'Use the disable endpoint for your own account' });
      return;
    }

    const targetUser = db.select().from(users).where(eq(users.id, targetId)).get();
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Enforce role hierarchy: owner > admin > member
    const ROLE_LEVEL: Record<string, number> = { owner: 3, admin: 2, member: 1 };
    const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
    const targetLevel = ROLE_LEVEL[targetUser.role] ?? 0;

    if (callerLevel <= targetLevel) {
      res.status(403).json({ error: 'You cannot reset 2FA for a user with equal or higher role' });
      return;
    }

    if (!targetUser.twofa_enabled) {
      res.status(400).json({ error: 'User does not have 2FA enabled' });
      return;
    }

    sqlite.prepare(
      'UPDATE users SET twofa_enabled = 0, twofa_secret = NULL, twofa_backup_codes = NULL, twofa_enabled_at = NULL WHERE id = ?'
    ).run(targetId);

    res.json({ data: { message: `2FA has been reset for ${targetUser.display_name}` } });
  } catch (err) {
    console.error('POST /auth/2fa/reset/:userId error:', err);
    res.status(500).json({ error: 'Failed to reset 2FA' });
  }
});

// GET /api/auth/2fa/requirements — get 2FA requirement settings
router.get('/requirements', (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const requireAdmin = db.select().from(appConfig).where(eq(appConfig.key, 'require_2fa_admin')).get();
  const requireMember = db.select().from(appConfig).where(eq(appConfig.key, 'require_2fa_member')).get();

  res.json({
    data: {
      requireAdmin: requireAdmin?.value === 'true',
      requireMember: requireMember?.value === 'true',
    },
  });
});

// PUT /api/auth/2fa/requirements — update 2FA requirement settings (owner only)
router.put('/requirements', requireRole('owner'), (req: Request, res: Response): void => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { requireAdmin, requireMember } = sanitize(req.body) as {
      requireAdmin?: boolean;
      requireMember?: boolean;
    };

    if (requireAdmin !== undefined) {
      sqlite.prepare("UPDATE app_config SET value = ? WHERE key = 'require_2fa_admin'")
        .run(requireAdmin ? 'true' : 'false');
    }

    if (requireMember !== undefined) {
      sqlite.prepare("UPDATE app_config SET value = ? WHERE key = 'require_2fa_member'")
        .run(requireMember ? 'true' : 'false');
    }

    res.json({ data: { message: '2FA requirements updated' } });
  } catch (err) {
    console.error('PUT /auth/2fa/requirements error:', err);
    res.status(500).json({ error: 'Failed to update 2FA requirements' });
  }
});

export default router;
