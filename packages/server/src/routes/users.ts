import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { db, sqlite } from '../db/index.js';
import { users, userPermissions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireRole } from '../middleware/permissions.js';
import { invalidatePermissionCache, ALL_PERMISSIONS } from '../middleware/permissions.js';
import { DEFAULT_MEMBER_PERMISSIONS } from '../db/migrate-roles-permissions.js';
import { sanitize } from '../utils/sanitize.js';

const router = Router();

// GET /api/users — public for authenticated users (display names for dropdowns)
// When called by admin/owner, returns full user list with permissions
router.get('/', (req: Request, res: Response): void => {
  if (req.user?.role === 'admin' || req.user?.role === 'owner') {
    const allUsers = db.select().from(users).all();
    const result = allUsers.map(u => {
      let permissions: Record<string, boolean> | null = null;
      if (u.role === 'member') {
        permissions = {};
        for (const perm of ALL_PERMISSIONS) {
          permissions[perm] = false;
        }
        const rows = db.select({
          permission: userPermissions.permission,
          granted: userPermissions.granted,
        }).from(userPermissions).where(eq(userPermissions.user_id, u.id)).all();
        for (const row of rows) {
          permissions[row.permission] = row.granted === 1;
        }
      }
      return {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        role: u.role,
        isActive: u.is_active === 1,
        twofaEnabled: u.twofa_enabled === 1,
        createdAt: u.created_at,
        permissions,
      };
    });
    const basicList = allUsers.filter(u => u.is_active === 1).map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
    }));
    res.json({ users: result, data: basicList });
    return;
  }

  // Non-admin: basic list for dropdowns
  const rows = db.select({
    id: users.id,
    username: users.username,
    display_name: users.display_name,
  }).from(users).where(eq(users.is_active, 1)).all();
  res.json({ data: rows });
});

// POST /api/users — create user (admin only)
router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, displayName, role } = sanitize(req.body) as {
      username: string; password: string; displayName: string; role: string;
    };

    if (!username || !password || !displayName) {
      res.status(400).json({ error: 'Username, password, and display name are required' });
      return;
    }

    if (!/^[a-z0-9]{3,20}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-20 lowercase alphanumeric characters' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const callerRole = req.user!.role;

    // Owner can create admin or member; admin can only create member
    let validRole = 'member';
    if (role === 'admin' && callerRole === 'owner') {
      validRole = 'admin';
    } else if (role === 'admin' && callerRole !== 'owner') {
      res.status(403).json({ error: 'Only the owner can create admin accounts' });
      return;
    }

    // Check uniqueness
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
    if (existing) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const result = db.insert(users).values({
      username,
      password_hash: hash,
      display_name: displayName,
      role: validRole,
      is_active: 1,
      created_at: now,
    }).run();

    const userId = Number(result.lastInsertRowid);

    // Insert default permissions for members
    if (validRole === 'member') {
      const insertPerm = sqlite.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission, granted) VALUES (?, ?, ?)');
      const txn = sqlite.transaction(() => {
        for (const [perm, granted] of Object.entries(DEFAULT_MEMBER_PERMISSIONS)) {
          insertPerm.run(userId, perm, granted);
        }
      });
      txn();
    }

    res.status(201).json({
      data: {
        id: userId,
        username,
        displayName,
        role: validRole,
        isActive: true,
        createdAt: now,
      },
    });
  } catch (err) {
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id — update user (admin+ only, with hierarchy checks)
router.put('/:id', requireRole('admin'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { displayName, role, isActive } = sanitize(req.body) as {
      displayName?: string; role?: string; isActive?: boolean;
    };

    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const callerRole = req.user!.role;
    const targetRole = user.role;

    // Owner cannot be modified (except display name by themselves)
    if (targetRole === 'owner') {
      if (id !== req.user!.userId) {
        res.status(400).json({ error: 'The owner account cannot be modified' });
        return;
      }
      // Owner editing self: can change display name only, not role
      if (role && role !== 'owner') {
        res.status(400).json({ error: 'The owner role cannot be changed' });
        return;
      }
      if (isActive === false) {
        res.status(400).json({ error: 'The owner account cannot be deactivated' });
        return;
      }
      const updates: Record<string, unknown> = {};
      if (displayName !== undefined) updates.display_name = displayName;
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        sqlite.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values, id);
      }
      res.json({ data: { message: 'User updated' } });
      return;
    }

    // Admin can only edit members, not other admins
    if (callerRole === 'admin' && targetRole === 'admin') {
      res.status(403).json({ error: 'Only the owner can manage admin accounts', message: 'Only the owner can manage admin accounts' });
      return;
    }

    // Admin cannot promote to admin
    if (callerRole === 'admin' && role === 'admin') {
      res.status(403).json({ error: 'Only the owner can promote users to admin', message: 'Only the owner can promote users to admin' });
      return;
    }

    // Cannot deactivate yourself
    if (isActive === false && id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (isActive !== undefined) updates.is_active = isActive ? 1 : 0;

    if (role && (role === 'admin' || role === 'member')) {
      // Only owner can set role to admin
      if (role === 'admin' && callerRole !== 'owner') {
        res.status(403).json({ error: 'Only the owner can promote users to admin' });
        return;
      }
      updates.role = role;

      // Role change: admin → member: insert default permissions
      if (targetRole === 'admin' && role === 'member') {
        const insertPerm = sqlite.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission, granted) VALUES (?, ?, ?)');
        const txn = sqlite.transaction(() => {
          for (const [perm, granted] of Object.entries(DEFAULT_MEMBER_PERMISSIONS)) {
            insertPerm.run(id, perm, granted);
          }
        });
        txn();
      }

      // Role change: member → admin: delete permission rows
      if (targetRole === 'member' && role === 'admin') {
        db.delete(userPermissions).where(eq(userPermissions.user_id, id)).run();
        invalidatePermissionCache(id);
      }
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      sqlite.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values, id);
    }

    res.json({ data: { message: 'User updated' } });
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PUT /api/users/:id/password — admin password reset (with hierarchy checks)
router.put('/:id/password', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { password } = sanitize(req.body) as { password: string };

    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const user = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const callerRole = req.user!.role;

    // Admin cannot reset another admin's or owner's password
    if (callerRole === 'admin' && (user.role === 'admin' || user.role === 'owner') && id !== req.user!.userId) {
      res.status(403).json({ error: 'Only the owner can manage admin accounts', message: 'Only the owner can manage admin accounts' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);

    res.json({ data: { message: 'Password updated' } });
  } catch (err) {
    console.error('PUT /users/:id/password error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// PUT /api/users/:id/permissions — update member permissions (admin only)
router.put('/:id/permissions', requireRole('admin'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { permissions } = req.body as { permissions: Record<string, boolean> };

    if (!permissions || typeof permissions !== 'object') {
      res.status(400).json({ error: 'Permissions object is required' });
      return;
    }

    const user = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.role === 'admin' || user.role === 'owner') {
      res.status(400).json({ error: 'Admin and owner users have all permissions' });
      return;
    }

    const upsert = sqlite.prepare(
      'INSERT INTO user_permissions (user_id, permission, granted) VALUES (?, ?, ?) ON CONFLICT(user_id, permission) DO UPDATE SET granted = excluded.granted'
    );

    const txn = sqlite.transaction(() => {
      for (const [perm, granted] of Object.entries(permissions)) {
        if ((ALL_PERMISSIONS as readonly string[]).includes(perm)) {
          upsert.run(id, perm, granted ? 1 : 0);
        }
      }
    });
    txn();

    invalidatePermissionCache(id);

    res.json({ data: { message: 'Permissions updated' } });
  } catch (err) {
    console.error('PUT /users/:id/permissions error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// GET /api/users/:id/delete-preview — preview deletion dependencies
router.get('/:id/delete-preview', requireRole('admin'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot preview yourself
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Owner cannot be deleted
    if (user.role === 'owner') {
      res.status(403).json({ error: 'The owner account cannot be deleted' });
      return;
    }

    // Admin can only preview members
    if (req.user!.role === 'admin' && user.role === 'admin') {
      res.status(403).json({ error: 'Only the owner can manage admin accounts' });
      return;
    }

    // Sole-owned accounts: accounts where this user is the only entry in account_owners
    const soleOwned = sqlite.prepare(`
      SELECT a.id, a.name, a.last_four, a.type, a.classification
      FROM account_owners ao
      JOIN accounts a ON ao.account_id = a.id AND a.is_active = 1
      WHERE ao.user_id = ?
        AND (SELECT COUNT(*) FROM account_owners ao2 WHERE ao2.account_id = ao.account_id) = 1
    `).all(id) as { id: number; name: string; last_four: string | null; type: string; classification: string }[];

    // Co-owned accounts: accounts where this user is one of multiple owners
    const coOwned = sqlite.prepare(`
      SELECT a.id, a.name, a.last_four
      FROM account_owners ao
      JOIN accounts a ON ao.account_id = a.id AND a.is_active = 1
      WHERE ao.user_id = ?
        AND (SELECT COUNT(*) FROM account_owners ao2 WHERE ao2.account_id = ao.account_id) > 1
    `).all(id) as { id: number; name: string; last_four: string | null }[];

    // Get remaining owners for co-owned accounts
    const coOwnedWithOwners = coOwned.map(acct => {
      const others = sqlite.prepare(`
        SELECT u.display_name FROM account_owners ao
        JOIN users u ON ao.user_id = u.id
        WHERE ao.account_id = ? AND ao.user_id != ?
      `).all(acct.id, id) as { display_name: string }[];
      return {
        id: acct.id,
        name: acct.name,
        lastFour: acct.last_four,
        remainingOwners: others.map(o => o.display_name),
      };
    });

    // Personal SimpleFIN connections
    const personalConnCount = sqlite.prepare(
      'SELECT COUNT(*) as cnt FROM simplefin_connections WHERE user_id = ?'
    ).get(id) as { cnt: number };

    // Owned pay cycles (will be unassigned, not deleted, on permanent delete)
    const payCyclesOwnedCount = sqlite.prepare(
      'SELECT COUNT(*) as cnt FROM pay_cycles WHERE user_id = ?'
    ).get(id) as { cnt: number };

    // Available owners (all active users except the one being deleted)
    const available = sqlite.prepare(
      'SELECT id, display_name FROM users WHERE is_active = 1 AND id != ? ORDER BY display_name'
    ).all(id) as { id: number; display_name: string }[];

    res.json({
      data: {
        user: {
          id: user.id,
          displayName: user.display_name,
          username: user.username,
          role: user.role,
        },
        soleOwnedAccounts: soleOwned.map(a => ({
          id: a.id,
          name: a.name,
          lastFour: a.last_four,
          type: a.type,
          classification: a.classification,
        })),
        coOwnedAccounts: coOwnedWithOwners,
        personalConnections: personalConnCount.cnt,
        payCyclesOwned: payCyclesOwnedCount.cnt,
        availableOwners: available.map(u => ({ id: u.id, displayName: u.display_name })),
      },
    });
  } catch (err) {
    console.error('GET /users/:id/delete-preview error:', err);
    res.status(500).json({ error: 'Failed to load delete preview' });
  }
});

// DELETE /api/users/:id — soft delete (admin+ only, with hierarchy checks)
router.delete('/:id', requireRole('admin'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot delete yourself
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Owner cannot be deleted
    if (user.role === 'owner') {
      res.status(400).json({ error: 'The owner account cannot be deleted' });
      return;
    }

    // Admin can only delete members
    if (req.user!.role === 'admin' && user.role === 'admin') {
      res.status(403).json({ error: 'Only the owner can manage admin accounts', message: 'Only the owner can manage admin accounts' });
      return;
    }

    sqlite.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    invalidatePermissionCache(id);

    res.json({ data: { message: 'User deactivated' } });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// DELETE /api/users/:id/permanent — permanently delete user with account reassignment
const permanentDeleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many deletion attempts. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.delete('/:id/permanent', requireRole('admin'), permanentDeleteLimiter, (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { reassignments, confirmUsername } = req.body as {
      reassignments: { accountId: number; newOwnerId: number }[];
      confirmUsername: string;
    };

    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot delete yourself
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Owner cannot be deleted
    if (user.role === 'owner') {
      res.status(403).json({ error: 'The owner account cannot be deleted' });
      return;
    }

    // Admin can only delete members
    if (req.user!.role === 'admin' && user.role === 'admin') {
      res.status(403).json({ error: 'Only the owner can manage admin accounts' });
      return;
    }

    // Confirm username
    if (!confirmUsername || confirmUsername !== user.username) {
      res.status(400).json({ error: 'Username confirmation does not match' });
      return;
    }

    // Check all sole-owned accounts have reassignments
    const soleOwnedIds = (sqlite.prepare(`
      SELECT ao.account_id FROM account_owners ao
      JOIN accounts a ON ao.account_id = a.id AND a.is_active = 1
      WHERE ao.user_id = ?
        AND (SELECT COUNT(*) FROM account_owners ao2 WHERE ao2.account_id = ao.account_id) = 1
    `).all(id) as { account_id: number }[]).map(r => r.account_id);

    const reassignMap = new Map((reassignments || []).map(r => [r.accountId, r.newOwnerId]));

    for (const acctId of soleOwnedIds) {
      if (!reassignMap.has(acctId)) {
        res.status(400).json({ error: 'All sole-owned accounts must be reassigned' });
        return;
      }
    }

    // Validate all new owners are active users
    for (const newOwnerId of reassignMap.values()) {
      const owner = sqlite.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(newOwnerId) as { id: number } | undefined;
      if (!owner) {
        res.status(400).json({ error: `Invalid new owner ID: ${newOwnerId}` });
        return;
      }
    }

    // Execute everything in a single transaction
    const txn = sqlite.transaction(() => {
      let accountsReassigned = 0;

      // 1. Sole-owned accounts: add new owner, remove old
      for (const [accountId, newOwnerId] of reassignMap.entries()) {
        sqlite.prepare('INSERT OR IGNORE INTO account_owners (account_id, user_id) VALUES (?, ?)').run(accountId, newOwnerId);
        sqlite.prepare('DELETE FROM account_owners WHERE account_id = ? AND user_id = ?').run(accountId, id);
        accountsReassigned++;
      }

      // 2. Co-owned accounts: remove this user
      // Need to count co-owned before deleting
      const coOwnedCount = (sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM account_owners WHERE user_id = ?
      `).get(id) as { cnt: number }).cnt;
      // Delete remaining ownership entries
      sqlite.prepare('DELETE FROM account_owners WHERE user_id = ?').run(id);

      // 3. User permissions
      sqlite.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);

      // 4. Personal SimpleFIN connections and their links
      const personalConns = sqlite.prepare(
        'SELECT id FROM simplefin_connections WHERE user_id = ?'
      ).all(id) as { id: number }[];
      let connectionsRemoved = 0;
      for (const conn of personalConns) {
        sqlite.prepare('DELETE FROM simplefin_links WHERE simplefin_connection_id = ?').run(conn.id);
        sqlite.prepare('DELETE FROM simplefin_connections WHERE id = ?').run(conn.id);
        connectionsRemoved++;
      }

      // 4b. Orphan owned pay cycles — preserve the projection, drop attribution
      const payCyclesOrphaned = (sqlite.prepare(
        'SELECT COUNT(*) as cnt FROM pay_cycles WHERE user_id = ?'
      ).get(id) as { cnt: number }).cnt;
      sqlite.prepare('UPDATE pay_cycles SET user_id = NULL WHERE user_id = ?').run(id);

      // 5. Delete the user row
      sqlite.prepare('DELETE FROM users WHERE id = ?').run(id);

      return { accountsReassigned, coOwnershipRemoved: coOwnedCount, connectionsRemoved, payCyclesOrphaned };
    });

    const result = txn();
    invalidatePermissionCache(id);

    console.log(`User ${req.user!.username} permanently deleted user ${user.username} (id: ${id})`);

    res.json({
      data: {
        deleted: true,
        accountsReassigned: result.accountsReassigned,
        coOwnershipRemoved: result.coOwnershipRemoved,
        connectionsRemoved: result.connectionsRemoved,
        payCyclesOrphaned: result.payCyclesOrphaned,
      },
    });
  } catch (err) {
    console.error('DELETE /users/:id/permanent error:', err);
    res.status(500).json({ error: 'Failed to permanently delete user' });
  }
});

export default router;
