/** Fixed-seed synthetic activity: eight complete months plus this month to date. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';
import type { Categories } from './categories.js';
import { brandMerchants, inventedMerchants } from './merchants.js';

export function seedTransactions(
  { db, insertTx, rel, today, catId }: Helpers,
  { jChecking, jaChecking, jointSav, jVisa, jaAmex }: PeopleAccounts,
  CAT: Categories,
) {
  const accounts = db.prepare('SELECT id, name, type FROM accounts ORDER BY id').all() as Array<{ id: number; name: string; type: string }>;
  const mastercard = accounts.find(a => a.name === "John's Mastercard");
  if (!mastercard) throw new Error('Sample Mastercard missing');
  const cards = [jVisa, jaAmex, mastercard.id];
  const liquid = accounts.filter(a => ['checking', 'savings'].includes(a.type)).map(a => a.id);
  const investments = accounts.filter(a => ['investment', 'retirement'].includes(a.type)).map(a => a.id);
  const savings = accounts.filter(a => a.type === 'savings' && a.id !== jointSav).map(a => a.id);
  const popular = ['Costco', 'Target', "Trader Joe's", 'Whole Foods', 'Publix', 'Shell', 'Starbucks', 'Chipotle', 'Walmart', 'Panera'];
  // Reserve the last 100 invented merchants for exactly one appearance each.
  // Amazon fixtures belong to #69; do not consume its matching candidates here.
  const singletons = inventedMerchants.slice(-100);
  const regular = [...brandMerchants, ...inventedMerchants.slice(0, 50)]
    .filter(name => name !== 'Amazon' && !popular.includes(name));
  let state = 57;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  let expenseIndex = 0, singleIndex = 0, regularIndex = 0, popularIndex = 0, count = 0;
  const categoryFor = (name: string) => {
    if (/Market|Costco$|Trader Joe|Whole Foods|Publix|Aldi|Walmart/.test(name)) return CAT.groceries;
    if (/Bakery|Cafe|Bistro|Starbucks|Chipotle|Panera|Chick-fil-A|Taco Bell/.test(name)) return CAT.dining;
    if (/Gas|Shell|Chevron/.test(name)) return CAT.fuel;
    if (/Pet Clinic/.test(name)) return catId('Pets', 'Veterinary');
    if (/PetSmart|Chewy/.test(name)) return catId('Pets', 'Food');
    if (/Family Clinic/.test(name)) return CAT.doctor;
    if (/CVS|Walgreens/.test(name)) return CAT.medicine;
    if (/Books/.test(name)) return CAT.books;
    if (/Cinema|Netflix|Spotify|Hulu/.test(name)) return CAT.otherEnt;
    if (/Music|Workshop/.test(name)) return CAT.hobby;
    if (/Property Management/.test(name)) return CAT.maintenance;
    if (/Waterworks/.test(name)) return CAT.water;
    if (/Energy/.test(name)) return CAT.power;
    if (/Insurance|GEICO/.test(name)) return CAT.autoIns;
    if (/Finance/.test(name)) return CAT.autoLoan;
    if (/Marriott/.test(name)) return catId('Travel', 'Lodging');
    if (/Delta/.test(name)) return catId('Travel', 'Airfare');
    if (/Uber|Lyft/.test(name)) return CAT.transport;
    if (/Nordstrom/.test(name)) return CAT.clothes;
    if (/IKEA|Home Depot|Best Buy/.test(name)) return CAT.furnishings;
    if (/Comcast/.test(name)) return CAT.internet;
    if (/T-Mobile/.test(name)) return CAT.phone;
    return CAT.personalSupp;
  };
  db.transaction(() => {
    for (let month = 0; month < 9; month++) {
      // July 2025 through March 2026, using the shared relative-date anchor.
      const fixtureMonth = new Date(2025, 6 + month, 1);
      const prefix = `${fixtureMonth.getFullYear()}-${String(fixtureMonth.getMonth() + 1).padStart(2, '0')}`;
      const add = (account: number, day: number, merchant: string, category: number | null, cents: number, note?: string) => {
        const date = `${prefix}-${String(day).padStart(2, '0')}`;
        if (rel(date) <= today) { insertTx(account, date, merchant, category, cents / 100, note); count++; }
      };
      // 128 expenses; 117 on cards. Generate before clipping so the RNG never
      // depends on today's date and earlier rows remain stable across launches.
      for (let i = 0; i < 128; i++, expenseIndex++) {
        let merchant = expenseIndex % 10 === 0 && singleIndex < singletons.length
          ? singletons[singleIndex++]
          : expenseIndex % 32 < 17 ? popular[popularIndex++ % popular.length] : regular[regularIndex++ % regular.length];
        if (i === 117) merchant = 'Rent';
        const category = i === 117 ? CAT.rent : categoryFor(merchant);
        const cents = category === CAT.rent ? 140000 : 450 + Math.floor(random() ** 2 * 9000);
        const day = category === CAT.rent ? 1 : 1 + Math.floor(random() * 28);
        add(i < 117 ? cards[i % 3] : i === 117 ? jChecking : liquid[(month * 11 + i - 117) % liquid.length], day, merchant, category, cents);
      }
      for (const day of [2, 16]) {
        add(jChecking, day, 'Direct Deposit — Payroll', CAT.takeHomePay, -175000);
        add(jaChecking, day, 'Direct Deposit — Payroll', CAT.takeHomePay, -150000);
      }
      // Interest and small side-work receipts supply the rest of the income mix.
      for (let i = 0; i < 5; i++) {
        add(i < 3 ? savings[(month + i) % savings.length] : i === 3 ? investments[month % investments.length] : jaChecking,
          4 + i * 6, i < 4 ? 'Interest Payment' : 'Mossquill Workshop',
          i < 4 ? CAT.interestInc : catId('Income', 'Other Income'), i < 4 ? -(125 + month * 13 + i * 71) : -8500);
      }
      // Five balanced transfer pairs: three card payments and two savings moves.
      for (let i = 0; i < 5; i++) {
        const card = i < 3;
        const category = catId('Transfers', card ? 'Credit Card Payment' : 'Savings Move');
        const cents = card ? 35000 + i * 12000 : 12500;
        const merchant = card ? 'Larkspindle Finance' : 'Mossquill Finance';
        add(i % 2 ? jaChecking : jChecking, 5 + i * 4, merchant, category, cents);
        add(card ? cards[i] : i === 3 ? jointSav : savings[month % savings.length],
          5 + i * 4, merchant, category, -cents);
      }
      for (let i = 0; i < 3; i++) add(liquid[(month + i) % liquid.length], 3 + i * 10, 'Venmo', null, 1500 + i * 725);
    }
  })();
  console.log(`  Created ${count} synthetic transactions (nine months, through ${today})`);
}
