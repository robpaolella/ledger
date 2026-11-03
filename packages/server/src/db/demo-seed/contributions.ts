/** Seeds two tracked contributions and their transfers; transfers never move Income, Expenses or Net. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';

export const CONTRIBUTION_MERCHANT = 'Mossquill Finance';
export const COLLEGE_CATEGORY: [string, string] = ['Transfers', 'College Savings'];
export const RETIREMENT_CATEGORY: [string, string] = ['Transfers', 'Retirement Contribution'];

export function seedContributions(
  { db, insertTx, rel, today }: Helpers,
  { college, j401k, jaIRA, jChecking, jaChecking }: PeopleAccounts,
) {
  console.log('Creating contribution setups and transfers...');
  const jointChecking = (db.prepare("SELECT id FROM accounts WHERE name = 'Joint Checking'").get() as { id: number }).id;
  let order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get() as { n: number }).n;
  const category = ([group, sub]: [string, string]) => Number(db.prepare(
    'INSERT INTO categories (group_name, sub_name, display_name, type, sort_order, exclude_from_budget) VALUES (?, ?, ?, ?, ?, 1)',
  ).run(group, sub, `${group}: ${sub}`, 'transfer', ++order).lastInsertRowid);
  const collegeCat = category(COLLEGE_CATEGORY);
  const retirementCat = category(RETIREMENT_CATEGORY);

  const track = (categoryId: number, accountIds: number[]) => {
    const setup = Number(db.prepare('INSERT INTO contribution_setups (category_id, includes_external) VALUES (?, 0)').run(categoryId).lastInsertRowid);
    for (const account of accountIds) db.prepare('INSERT INTO contribution_setup_accounts (setup_id, account_id) VALUES (?, ?)').run(setup, account);
  };
  track(collegeCat, [college]);
  track(retirementCat, [j401k, jaIRA]);

  // Fixture months run July 2025 (0) to March 2026 (8); rel() shifts them to today.
  const date = (month: number, day: number) => {
    const m = new Date(2025, 6 + month, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  // Positive = money out of the account, negative = money in (the app's sign rule).
  const add = (account: number, month: number, day: number, categoryId: number, amount: number) => {
    const d = date(month, day);
    return rel(d) <= today ? insertTx(account, d, CONTRIBUTION_MERCHANT, categoryId, amount) : null;
  };

  db.transaction(() => {
    // College: only the Joint Checking side is recorded, every month.
    for (let month = 0; month < 9; month++) add(jointChecking, month, 10, collegeCat, 500);
    add(jointChecking, 4, 22, collegeCat, -1200); // a withdrawal back to checking
    add(jointChecking, 5, 28, collegeCat, 400);   // a deposit reversed on the other side of the month end
    add(jointChecking, 6, 2, collegeCat, -400);

    // Retirement: a few one-sided contributions from personal accounts.
    add(jChecking, 2, 12, retirementCat, 300);
    add(jaChecking, 4, 12, retirementCat, 250);
    add(jChecking, 6, 12, retirementCat, 300);

    // Retirement: both legs recorded and linked as one transfer pair.
    const out = add(jChecking, 7, 15, retirementCat, 350);
    const into = add(j401k, 7, 15, retirementCat, -350);
    if (out != null && into != null) {
      db.prepare("INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, linked_by, status) VALUES (?, ?, 350, 'manual', 'linked')")
        .run(out, into);
    }
  })();
}
