// === Enums / Unions ===

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'retirement' | 'venmo' | 'cash';
export type AccountClassification = 'liquid' | 'investment' | 'liability';
export type CategoryType = 'income' | 'expense' | 'transfer';

// === Database Row Interfaces ===

export interface User {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: 'owner' | 'admin' | 'member';
  is_active: number;
  twofa_enabled: number;
  twofa_secret: string | null;
  twofa_backup_codes: string | null;
  twofa_enabled_at: string | null;
  created_at: string;
}

export interface AccountOwner {
  id: number;
  displayName: string;
}

export interface FinancialInstitution {
  id: number;
  name: string;
  domain: string | null;
  logo_url: string | null;
  color: string | null;
  is_system: number;
  sort_order: number | null;
  created_at: string;
  account_count?: number;
}

// The institution reference attached to an enriched Account (subset of the row).
export interface AccountInstitutionRef {
  id: number;
  name: string;
  logo_url: string | null;
  color: string | null;
}

export interface Account {
  id: number;
  name: string;
  last_four: string | null;
  type: AccountType;
  classification: AccountClassification;
  institution: string | null; // legacy free-text (kept; institution_id is the source of truth)
  institution_id: number | null;
  institutionRef: AccountInstitutionRef | null; // enriched by GET /accounts
  avatar_url: string | null; // per-account image override (else fall back to institution logo)
  owner: string; // legacy — first owner display_name for backward compat
  owners: AccountOwner[];
  isShared: boolean;
  is_active: number;
  created_at: string;
}

export interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: CategoryType;
  is_deductible: number;
  sort_order: number;
}

export interface Merchant {
  id: number;
  name: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  description: string;
  /** Verbatim bank-provided statement text (null on legacy + manual rows). */
  bank_description: string | null;
  note: string | null;
  category_id: number | null;
  merchant_id: number | null;
  amount: number;
  simplefin_transaction_id: string | null;
  categorize_confidence: number | null;
  needs_review: number;
  created_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string | null;
  action_label: string | null;
  action_target: string | null;
  dedupe_key: string | null;
  is_read: number;
  created_at: string;
}

export interface CategoryRule {
  id: number;
  match_type: 'merchant' | 'contains' | 'regex';
  pattern: string;
  category_id: number;
  priority: number;
  created_at: string;
}

export interface TransactionSplit {
  id: number;
  transaction_id: number;
  category_id: number;
  amount: number;
  // Per-split (full-Monarch model): each leg can carry its own merchant + note.
  // NULL merchant_id = inherit the parent transaction's merchant.
  merchant_id: number | null;
  note: string | null;
  created_at: string;
}

export interface Budget {
  id: number;
  category_id: number;
  month: string;
  amount: number;
}

export interface BalanceSnapshot {
  id: number;
  account_id: number;
  date: string;
  balance: number;
  note: string | null;
}

export interface Asset {
  id: number;
  name: string;
  purchase_date: string;
  cost: number;
  lifespan_years: number;
  salvage_value: number;
  depreciation_method: 'straight_line' | 'declining_balance';
  declining_rate: number | null;
  created_at: string;
}

// === API Response Types ===

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// === Auth Types ===

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthPayload {
  userId: number;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  purpose?: '2fa';
}

// === 2FA Types ===

export interface TwoFASetupResponse {
  qrCodeUrl: string;
  secret: string;
  otpauthUri: string;
}

export interface TwoFAConfirmRequest {
  token: string;
  secret: string;
}

export interface TwoFAConfirmResponse {
  backupCodes: string[];
}

export interface TwoFAVerifyRequest {
  tempToken: string;
  token?: string;
  backupCode?: string;
}

export interface TwoFARequirements {
  requireAdmin: boolean;
  requireMember: boolean;
}

export interface LoginResponse {
  token: string;
  user: { id: number; username: string; displayName: string; role: string; twofaEnabled: boolean };
  twofaSetupRequired?: boolean;
}

export interface LoginResponse2FA {
  status: '2fa_required';
  tempToken: string;
}

// === SimpleFIN Types ===

export interface SimpleFINConnection {
  id: number;
  label: string;
  isShared: boolean;
  linkedAccountCount: number;
  lastSyncedAt: string | null;
}

export interface SimpleFINLink {
  id: number;
  simplefinConnectionId: number;
  simplefinAccountId: string;
  accountId: number;
  simplefinAccountName: string;
  simplefinOrgName: string | null;
  lastSyncedAt: string | null;
}

export interface SimpleFINHolding {
  id: number;
  simplefinLinkId: number;
  symbol: string;
  description: string;
  shares: number;
  costBasis: number;
  marketValue: number;
  updatedAt: string;
}

export type DuplicateStatus = 'exact' | 'possible' | 'none';

export interface SyncTransaction {
  simplefinId: string;
  accountId: number;
  accountName: string;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  suggestedCategoryId: number | null;
  suggestedGroupName: string | null;
  suggestedSubName: string | null;
  suggestedSource?: string;
  confidence: number;
  duplicateStatus: DuplicateStatus;
  duplicateMatchId: number | null;
  duplicateMatchDescription?: string;
  duplicateMatchDate?: string;
  duplicateMatchAmount?: number;
  duplicateMatchAccountName?: string;
  isLikelyTransfer: boolean;
}

export interface SyncBalanceUpdate {
  accountId: number;
  accountName: string;
  currentBalance: number;
  previousBalance: number | null;
  balanceDate: string;
}

export interface SyncHoldingsUpdate {
  accountId: number;
  accountName: string;
  holdings: {
    symbol: string;
    description: string;
    shares: number;
    costBasis: number;
    marketValue: number;
  }[];
}

// Frequency kinds for the recurring engine (payCycleMath). Retained after the
// pay-cycles feature was removed — the recurring engine still uses it.
export type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';

// === Recurring Items (unified recurring income + expense + savings) ===

export type RecurrenceKind =
  | 'monthly' | 'semi_monthly' | 'biweekly' | 'weekly' | 'every_n_months' | 'custom_months';

export interface RecurringItem {
  id: number;
  type: 'income' | 'expense'; // savings shares the expense (outflow) sign convention
  label: string;
  merchant_id: number | null;
  category_id: number;
  account_id: number | null;
  amount: number | null; // per-occurrence positive magnitude (null = unset)
  freq_kind: RecurrenceKind;
  day: number | null; // monthly/every-N/custom day-of-month (0 = last day)
  days_json: string | null; // semi_monthly two days, e.g. '[1,15]'
  interval: number | null; // every_n_months
  anchor_date: string | null; // 'YYYY-MM-DD' phase ref (weekly/biweekly/every-N)
  months_json: string | null; // custom_months 1-based, e.g. '[3,11]'
  start_date: string | null;
  status: 'active' | 'paused';
  user_id: number | null;
  effective_start: string | null;
  effective_end: string | null;
  created_at: string;
  updated_at: string;
}

// A recurring item enriched with category/merchant/account meta (GET /api/recurring).
export interface RecurringItemWithMeta extends RecurringItem {
  groupName: string;
  subName: string;
  displayName: string;
  categoryType: CategoryType;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  accountName: string | null;
  accountLastFour: string | null;
}

// One dated occurrence of a recurring item within a month.
export interface RecurringOccurrence {
  itemId: number;
  label: string;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  date: string; // 'YYYY-MM-DD'
  amount: number; // positive magnitude
  type: 'income' | 'expense';
  categoryId: number;
  groupName: string;
  subName: string;
  categoryType: CategoryType;
  accountName: string | null;
  accountLastFour: string | null;
  frequency: RecurrenceKind;
  status: 'paid' | 'due' | 'upcoming';
}

export interface RecurringMonthFlow {
  total: number;
  paid: number; // occurrences on/before today
  remaining: number;
}

export interface RecurringMonthView {
  month: string; // 'YYYY-MM'
  occurrences: RecurringOccurrence[];
  income: RecurringMonthFlow;
  expense: RecurringMonthFlow;
  net: number;
}

// Per-category recurring total for a month, for the budget overlay.
export interface RecurringBudgetFloor {
  categoryId: number;
  amount: number; // summed positive magnitude of active occurrences this month
  itemCount: number;
  items: { label: string; cadence: string }[]; // contributing items, for the breakdown
}
