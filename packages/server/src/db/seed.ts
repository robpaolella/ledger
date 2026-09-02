/**
 * Fresh-database seed. Deletes any existing database file, then boots the same
 * bootstrap the server runs on start-up: `db/index.ts` creates the core tables
 * and seeds the default category taxonomy, and `db/migrate.ts` brings the file
 * up to the current schema. Keeping one code path means a brand-new install can
 * never drift from what the running server expects.
 *
 *   npm run seed            (dev)      DATABASE_PATH overrides the file location
 *   npm run seed:prod       (built)
 */
import path from 'path';
import fs from 'fs';

const defaultDir = path.resolve(process.cwd(), 'data');
const dbPath = process.env.DATABASE_PATH || path.join(defaultDir, 'ledger.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Delete existing DB (and its WAL sidecars) for a clean seed — before the db
// module opens a handle, so nothing keeps a deleted inode alive.
for (const suffix of ['', '-wal', '-shm']) {
  const f = `${dbPath}${suffix}`;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
console.log('Creating a fresh database...');

async function seed() {
  // Dynamic imports: `db/index.ts` opens the file at import time.
  const { sqlite } = await import('./index.js');
  const { runMigrations } = await import('./migrate.js');

  console.log('Running migrations...');
  runMigrations(sqlite);

  const catCount = sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  const incCount = sqlite.prepare("SELECT COUNT(*) as count FROM categories WHERE type = 'income'").get() as { count: number };
  const expCount = sqlite.prepare("SELECT COUNT(*) as count FROM categories WHERE type = 'expense'").get() as { count: number };
  const instCount = sqlite.prepare('SELECT COUNT(*) as count FROM financial_institutions').get() as { count: number };

  console.log(`\nSeed complete!`);
  console.log(`  Categories: ${catCount.count} (${incCount.count} income, ${expCount.count} expense)`);
  console.log(`  Institutions: ${instCount.count}`);
  console.log(`\nDatabase seeded at ${dbPath}. Visit the app to create your admin account.`);

  sqlite.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
