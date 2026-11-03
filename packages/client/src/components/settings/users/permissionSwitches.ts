// --- The 12 switches a member can be given, grouped as in the approved design ---
export const PERMISSION_GROUPS: { label: string; permissions: { key: string; label: string; desc: string }[] }[] = [
  {
    label: 'Transactions',
    permissions: [
      { key: 'transactions.create', label: 'Add transactions', desc: 'Enter transactions by hand' },
      { key: 'transactions.edit', label: 'Edit transactions, merchants, rules and Review', desc: 'Change categories, notes and splits; edit and merge merchants; delete rules; resolve Review items' },
      { key: 'transactions.delete', label: 'Delete transactions', desc: 'Remove transactions for good' },
      { key: 'transactions.bulk_edit', label: 'Edit many at once', desc: 'Select several transactions and change or delete them together' },
    ],
  },
  {
    label: 'Household',
    permissions: [
      { key: 'accounts.create', label: 'Manage accounts and institutions', desc: 'Add, edit and remove accounts, institutions and investment symbols' },
      { key: 'categories.create', label: 'Manage categories', desc: 'Add, edit and remove groups and categories' },
      { key: 'simplefin.manage', label: 'Manage bank connections', desc: 'Connect SimpleFIN, link accounts and switch daily sync on or off' },
    ],
  },
  {
    label: 'Finance',
    permissions: [
      { key: 'budgets.edit', label: 'Edit budgets and recurring bills', desc: 'Plan amounts, and add, edit or remove recurring bills and income' },
      { key: 'balances.update', label: 'Update balances (including fetching from the bank)', desc: 'Record balances by hand or fetch them from SimpleFIN' },
      { key: 'assets.create', label: 'Manage assets', desc: 'Add, edit and remove assets and their depreciation' },
      { key: 'import.csv', label: 'Import CSV files', desc: 'Upload bank and card statements' },
      { key: 'import.bank_sync', label: 'Run bank sync', desc: 'Pull new transactions from SimpleFIN on demand' },
    ],
  },
];

// Compound switches: one switch sets create/edit/delete together.
export const COMPOUND_PERMISSIONS: Record<string, string[]> = {
  'accounts.create': ['accounts.create', 'accounts.edit', 'accounts.delete'],
  'categories.create': ['categories.create', 'categories.edit', 'categories.delete'],
  'assets.create': ['assets.create', 'assets.edit', 'assets.delete'],
};
