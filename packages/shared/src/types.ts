// === Enums / Unions ===

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'retirement' | 'venmo' | 'cash';
export type AccountClassification = 'liquid' | 'investment' | 'liability';
export type CategoryType = 'income' | 'expense';

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

export interface Account {
  id: number;
  name: string;
  last_four: string | null;
  type: AccountType;
  classification: AccountClassification;
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

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  description: string;
  note: string | null;
  category_id: number | null;
  amount: number;
  simplefin_transaction_id: string | null;
  created_at: string;
}

export interface TransactionSplit {
  id: number;
  transaction_id: number;
  category_id: number;
  amount: number;
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
