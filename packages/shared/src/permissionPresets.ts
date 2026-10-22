// Member access levels. A preset is a named set of granted permission keys; anything
// else is Custom. The level is always worked out from the stored permissions.

/** Every permission key the server checks (mirrors ALL_PERMISSIONS on the server). */
export const PERMISSION_KEYS = [
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

export type AccessPreset = 'view' | 'everyday' | 'everything';
export type AccessLevel = AccessPreset | 'custom';

export const ACCESS_PRESETS: Record<AccessPreset, { label: string; desc: string; keys: readonly string[] }> = {
  view: { label: 'View only', desc: 'Can see the household’s money but change nothing.', keys: [] },
  everyday: {
    label: 'Everyday',
    desc: 'Add and edit transactions, import, edit budgets and update balances.',
    keys: ['transactions.create', 'transactions.edit', 'import.csv', 'import.bank_sync', 'budgets.edit', 'balances.update'],
  },
  everything: { label: 'Everything except managing people', desc: 'Every switch below. Only the owner and admins manage people.', keys: PERMISSION_KEYS },
};

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  view: ACCESS_PRESETS.view.label,
  everyday: ACCESS_PRESETS.everyday.label,
  everything: ACCESS_PRESETS.everything.label,
  custom: 'Custom',
};

/** Which access level these stored permissions amount to. Unknown keys are ignored. */
export function accessLevelOf(permissions: Record<string, boolean> | null | undefined): AccessLevel {
  const granted = new Set<string>(PERMISSION_KEYS.filter((k) => permissions?.[k] === true));
  for (const [level, preset] of Object.entries(ACCESS_PRESETS) as [AccessPreset, typeof ACCESS_PRESETS[AccessPreset]][]) {
    if (preset.keys.length === granted.size && preset.keys.every((k) => granted.has(k))) return level;
  }
  return 'custom';
}

/** The full permission map (all 18 keys) a preset stores. */
export function presetPermissions(preset: AccessPreset): Record<string, boolean> {
  const keys = new Set(ACCESS_PRESETS[preset].keys);
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, keys.has(k)]));
}
