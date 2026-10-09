import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { userPermissions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/** All permission keys in the system */
export const ALL_PERMISSIONS = [
  'transactions.create',
  'transactions.edit',
  'transactions.delete',
  'transactions.bulk_edit',
  'import.csv',
  'import.bank_sync',
  'categories.create',
  'categories.edit',
  'categories.delete',
  'accounts.create',
  'accounts.edit',
  'accounts.delete',
  'budgets.edit',
  'balances.update',
  'assets.create',
  'assets.edit',
  'assets.delete',
  'simplefin.manage',
] as const;

export type PermissionKey = typeof ALL_PERMISSIONS[number];

// --- In-memory permission cache ---
interface CacheEntry {
  permissions: Map<string, boolean>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const permissionCache = new Map<number, CacheEntry>();

export function invalidatePermissionCache(userId: number): void {
  permissionCache.delete(userId);
}

function getCachedPermissions(userId: number): Map<string, boolean> | null {
  const entry = permissionCache.get(userId);
  if (!entry || Date.now() > entry.expiresAt) {
    permissionCache.delete(userId);
    return null;
  }
  return entry.permissions;
}

function setCachedPermissions(userId: number, permissions: Map<string, boolean>): void {
  permissionCache.set(userId, {
    permissions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function loadPermissions(userId: number): Map<string, boolean> {
  const cached = getCachedPermissions(userId);
  if (cached) return cached;

  const rows = db.select({
    permission: userPermissions.permission,
    granted: userPermissions.granted,
  }).from(userPermissions).where(eq(userPermissions.user_id, userId)).all();

  const perms = new Map<string, boolean>();
  for (const row of rows) {
    perms.set(row.permission, row.granted === 1);
  }

  setCachedPermissions(userId, perms);
  return perms;
}

/** Role hierarchy levels for comparison */
const ROLE_LEVEL: Record<string, number> = { owner: 3, admin: 2, member: 1 };

/**
 * Middleware: require the user to have at least the specified role.
 * owner satisfies admin checks; admin satisfies admin checks; member does not.
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const requiredLevel = ROLE_LEVEL[role] ?? 99;
    const userLevel = ROLE_LEVEL[req.user.role] ?? 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'This action requires administrator privileges',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: require the user to have a specific permission.
 * Admins bypass all permission checks.
 */
export function requirePermission(permission: string) {
  return requireAnyPermission(permission);
}

/** Middleware: require at least one of the permissions. Admins bypass all permission checks. */
export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Owners and admins have all permissions
    if (req.user.role === 'owner' || req.user.role === 'admin') {
      next();
      return;
    }

    const perms = loadPermissions(req.user.userId);
    if (permissions.some((p) => perms.get(p))) {
      next();
      return;
    }

    res.status(403).json({
      error: 'Forbidden',
      message: "You don't have permission to perform this action",
      requiredPermission: permissions[0],
    });
  };
}
