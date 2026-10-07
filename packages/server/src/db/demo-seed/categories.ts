/** Resolves the demo category IDs created by the regular seed. */
import type { Helpers } from './helpers.js';

export function createCategories({ catId }: Helpers) {
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
