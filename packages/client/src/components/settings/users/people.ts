import { ACCESS_LABEL, accessLevelOf } from '@ledger/shared';

export interface ManagedUser {
  id: number;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  isActive: boolean;
  twofaEnabled: boolean;
  createdAt: string;
  permissions: Record<string, boolean> | null;
}

export type CallerRole = 'owner' | 'admin' | 'member';

export const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/** The owner, and admins only for the owner, may change someone; nobody changes the owner. */
export const canTouch = (mu: ManagedUser, callerRole: CallerRole) =>
  mu.role !== 'owner' && (callerRole === 'owner' || (callerRole === 'admin' && mu.role === 'member'));

/** "Member · Everyday", "Admin", "Owner". */
export const roleLine = (mu: ManagedUser) => `${ROLE_LABEL[mu.role]}${mu.role === 'member' ? ` · ${ACCESS_LABEL[accessLevelOf(mu.permissions)]}` : ''}`;
