#!/usr/bin/env bash
# Rebuilds ledger.db from tag v1.0.2 using only that tag's own seed scripts.
# Synthetic data only: nothing here reads data/ or any real database.
# Usage: bash build.sh   (needs network for `npm ci`; takes about a minute)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Extract the tag outside the repo and install its own dependencies.
git -C "$REPO" archive v1.0.2 | tar -x -C "$WORK"
(cd "$WORK" && npm ci --silent)

# 2. Seed a throwaway file: base seed, demo seed, then the server's startup migrations
#    (the order a new user's install goes through).
export DATABASE_PATH="$WORK/ledger.db"
cd "$WORK/packages/server"
npx tsx src/db/seed.ts
npx tsx src/db/demo-seed.ts
cat > run-migrations.ts <<'TS'
import Database from 'better-sqlite3';
import { migrateAccountOwners } from './src/db/migrate-account-owners.js';
import { migrateSimplefin } from './src/db/migrate-simplefin.js';
import { migrateAssetsDepreciation } from './src/db/migrate-assets-depreciation.js';
import { migrateRolesPermissions } from './src/db/migrate-roles-permissions.js';
import { migrateDevStorage } from './src/db/migrate-dev-storage.js';
import { migrate2FA } from './src/db/migrate-2fa.js';
import { migrateCategorySortOrder } from './src/db/migrate-category-sort-order.js';
import { migrateTransactionSplits } from './src/db/migrate-transaction-splits.js';
import { migrateBudgetTemplatesRecurring } from './src/db/migrate-budget-templates-recurring.js';
import { migrateDismissedTransfers } from './src/db/migrate-dismissed-transfers.js';
const sqlite = new Database(process.env.DATABASE_PATH!);
for (const migrate of [migrateAccountOwners, migrateSimplefin, migrateAssetsDepreciation, migrateRolesPermissions,
  migrateDevStorage, migrate2FA, migrateCategorySortOrder, migrateTransactionSplits,
  migrateBudgetTemplatesRecurring, migrateDismissedTransfers]) migrate(sqlite);
sqlite.close();
TS
npx tsx run-migrations.ts

# 3. Fold the WAL into one standalone file and place it next to this script.
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.DATABASE_PATH);
db.pragma('wal_checkpoint(TRUNCATE)');
db.exec('VACUUM INTO ' + JSON.stringify(process.argv[1]).replace(/\"/g, \"'\"));
" "$HERE/ledger.db.new"
mv "$HERE/ledger.db.new" "$HERE/ledger.db"
echo "Wrote $HERE/ledger.db"
