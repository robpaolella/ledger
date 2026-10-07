/** Seeds the demo users, setup flag, accounts, and account owners. */
import type Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

export function seedPeopleAccounts(db: Database.Database) {
  // ---------------------------------------------------------------------------
  // 1. Users
  // ---------------------------------------------------------------------------
  console.log('Creating users...');

  const johnHash = bcrypt.hashSync('password1', 10);
  const janeHash = bcrypt.hashSync('password1', 10);

  db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
  ).run('john', johnHash, 'John', 'owner');

  db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
  ).run('jane', janeHash, 'Jane', 'admin');

  const johnId = (db.prepare("SELECT id FROM users WHERE username = 'john'").get() as any).id;
  const janeId = (db.prepare("SELECT id FROM users WHERE username = 'jane'").get() as any).id;

  // Mark setup complete
  db.prepare(
    `INSERT OR REPLACE INTO app_config (key, value) VALUES ('setup_complete', 'true')`
  ).run();

  console.log(`  John (id=${johnId}, owner), Jane (id=${janeId}, admin)`);

  // ---------------------------------------------------------------------------
  // 2. Accounts
  // ---------------------------------------------------------------------------
  console.log('Creating accounts...');

  interface Acct { name: string; last_four: string; type: string; classification: string; owners: number[] }

  // Match the migration-owned catalog; never silently create a second institution.
  const institutionNames = ['Chase', 'Capital One', 'American Express National Bank',
    'Ally Bank', 'Fidelity', 'Vanguard', 'Bank of America', 'Venmo'];
  const institutions = institutionNames.map(name => {
    const row = db.prepare('SELECT id FROM financial_institutions WHERE name = ?').get(name) as { id: number } | undefined;
    if (!row) throw new Error(`Sample institution missing from catalog: ${name}`);
    return { id: row.id, name };
  });

  const accountDefs: Acct[] = [
    { name: "John's Checking",   last_four: '4821', type: 'checking',   classification: 'liquid',     owners: [johnId] },
    { name: "John's Visa",       last_four: '7733', type: 'credit',     classification: 'liability',  owners: [johnId] },
    { name: "Jane's Checking",   last_four: '9102', type: 'checking',   classification: 'liquid',     owners: [janeId] },
    { name: "Jane's Savings",    last_four: '5540', type: 'savings',    classification: 'liquid',     owners: [janeId] },
    { name: "Jane's Amex",       last_four: '1008', type: 'credit',     classification: 'liability',  owners: [janeId] },
    { name: 'Joint Savings',     last_four: '6200', type: 'savings',    classification: 'liquid',     owners: [johnId, janeId] },
    { name: "John's 401(k)",     last_four: '3310', type: 'retirement', classification: 'investment', owners: [johnId] },
    { name: "Jane's Roth IRA",   last_four: '8841', type: 'retirement', classification: 'investment', owners: [janeId] },
  ];

  // Append only: other seed modules rely on the first eight IDs and return keys.
  accountDefs.push(
    { name: "John's Savings", last_four: '2046', type: 'savings', classification: 'liquid', owners: [johnId] },
    { name: 'Joint Checking', last_four: '3057', type: 'checking', classification: 'liquid', owners: [johnId, janeId] },
    { name: "John's Brokerage", last_four: '4068', type: 'investment', classification: 'investment', owners: [johnId] },
    { name: "Jane's Brokerage", last_four: '5079', type: 'investment', classification: 'investment', owners: [janeId] },
    { name: "John's Roth IRA", last_four: '6080', type: 'retirement', classification: 'investment', owners: [johnId] },
    { name: "Jane's 401(k)", last_four: '7091', type: 'retirement', classification: 'investment', owners: [janeId] },
    { name: "John's Mastercard", last_four: '8102', type: 'credit', classification: 'liability', owners: [johnId] },
    { name: "Jane's Visa", last_four: '9213', type: 'credit', classification: 'liability', owners: [janeId] },
    { name: "John's Travel Savings", last_four: '1324', type: 'savings', classification: 'liquid', owners: [johnId] },
    { name: "Jane's Emergency Savings", last_four: '2435', type: 'savings', classification: 'liquid', owners: [janeId] },
    { name: "John's Venmo", last_four: '3546', type: 'checking', classification: 'liquid', owners: [johnId] },
    { name: "Jane's Venmo", last_four: '4657', type: 'checking', classification: 'liquid', owners: [janeId] },
  );
  const institutionIndexes = [0, 0, 6, 3, 2, 3, 4, 5, 1, 6, 4, 5, 5, 4, 1, 6, 0, 3, 7, 7];
  const acctIds: Record<string, number> = {};

  for (const [index, a] of accountDefs.entries()) {
    const institution = institutions[institutionIndexes[index]];
    const res = db.prepare(
      'INSERT INTO accounts (name, last_four, type, classification, owner, institution_id, institution) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(a.name, a.last_four, a.type, a.classification, a.owners.map(id => id === johnId ? 'John' : 'Jane').join(', '), institution.id, institution.name);
    const acctId = Number(res.lastInsertRowid);
    acctIds[a.name] = acctId;
    for (const uid of a.owners) {
      db.prepare('INSERT INTO account_owners (account_id, user_id) VALUES (?, ?)').run(acctId, uid);
    }
  }

  console.log(`  Created ${Object.keys(acctIds).length} accounts`);

  // Shorthand references
  const jChecking  = acctIds["John's Checking"];
  const jVisa      = acctIds["John's Visa"];
  const jaChecking = acctIds["Jane's Checking"];
  const jaSavings  = acctIds["Jane's Savings"];
  const jaAmex     = acctIds["Jane's Amex"];
  const jointSav   = acctIds["Joint Savings"];
  const j401k      = acctIds["John's 401(k)"];
  const jaIRA      = acctIds["Jane's Roth IRA"];


  return { johnId, janeId, jChecking, jVisa, jaChecking, jaSavings, jaAmex, jointSav, j401k, jaIRA };
}

export type PeopleAccounts = ReturnType<typeof seedPeopleAccounts>;
