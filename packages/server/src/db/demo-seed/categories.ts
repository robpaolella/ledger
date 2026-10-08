/** Extends only the synthetic taxonomy, preserving every regular-seed category. */
import type { Helpers } from './helpers.js';

export function createCategories({ db, catId }: Helpers) {
  const additions: Array<[string, string[], string]> = [
    ['Education', ['Supplies'], 'expense'],
    ['Tax Not Withheld', ['State'], 'expense'],
    ['Transfers', ['Credit Card Payment', 'Savings Move'], 'transfer'],
    ['Travel', ['Lodging', 'Airfare', 'Activities'], 'expense'],
    ['Gifts', ['Birthdays', 'Holidays', 'Donations'], 'expense'],
    ['Pets', ['Food', 'Veterinary', 'Supplies'], 'expense'],
  ];
  let order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get() as { n: number }).n;
  for (const [group, subs, type] of additions) {
    for (const sub of subs) {
      if (db.prepare('SELECT id FROM categories WHERE group_name = ? AND sub_name = ?').get(group, sub)) continue;
      db.prepare('INSERT INTO categories (group_name, sub_name, display_name, type, sort_order, exclude_from_budget) VALUES (?, ?, ?, ?, ?, ?)')
        .run(group, sub, `${group}: ${sub}`, type, ++order, type === 'transfer' ? 1 : 0);
    }
  }
  // ---------------------------------------------------------------------------
  // 3. Category IDs
  // ---------------------------------------------------------------------------
  const CAT = {
    takeHomePay:   catId('Income', 'Take Home Pay'),
    interestInc:   catId('Income', 'Interest Income'),
    fuel:          catId('Auto/Transportation', 'Fuel'),
    autoService:   catId('Auto/Transportation', 'Service'),
    transport:     catId('Auto/Transportation', 'Transportation'),
    dining:        catId('Daily Living', 'Dining/Eating Out'),
    groceries:     catId('Daily Living', 'Groceries'),
    personalSupp:  catId('Daily Living', 'Personal Supplies'),
    pets:          catId('Daily Living', 'Pets'),
    otherDaily:    catId('Daily Living', 'Other Daily Living'),
    clothes:       catId('Clothing', 'Clothes/Shoes'),
    books:         catId('Entertainment', 'Books/Magazine'),
    hobby:         catId('Entertainment', 'Hobby'),
    otherEnt:      catId('Entertainment', 'Other Entertainment'),
    medicine:      catId('Health', 'Medicine/Drug'),
    doctor:        catId('Health', 'Doctor/Dentist/Optometrist'),
    rent:          catId('Household', 'Rent'),
    furnishings:   catId('Household', 'Furnishings'),
    maintenance:   catId('Household', 'Maintenance'),
    autoIns:       catId('Insurance', 'Auto'),
    healthIns:     catId('Insurance', 'Health'),
    autoLoan:      catId('Loan', 'Auto'),
    internet:      catId('Utilities', 'Internet'),
    phone:         catId('Utilities', 'Phone'),
    power:         catId('Utilities', 'Power'),
    water:         catId('Utilities', 'Water'),
  };


  return CAT;
}

export type Categories = ReturnType<typeof createCategories>;
