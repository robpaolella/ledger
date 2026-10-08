import type { Helpers } from './helpers.js';
import { SAMPLE_AMAZON_MATCH_FIXTURES } from './transactions.js';

const ITEM_TITLES = [
  'USB-C Cable', 'Storage Organizer', 'LED Desk Light', 'Kitchen Timer',
  'Reusable Food Containers', 'Notebook Set', 'Microfiber Cleaning Cloths',
  'Phone Stand', 'Water Filter Pitcher', 'Drawer Dividers', 'Battery Pack',
  'Cotton Bath Towels', 'Measuring Spoon Set', 'Yoga Block', 'Picture Frame',
  'Dish Drying Rack', 'Garden Gloves', 'Air Filter', 'Pillowcase Set',
] as const;

interface AmazonTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
}

interface OrderFixture {
  transactions: AmazonTransaction[];
  titleOffset: number;
}

const orderNumber = (index: number) =>
  `114-${String(4_200_000 + index).padStart(7, '0')}-${String(8_100_000 + index).padStart(7, '0')}`;

export function seedAmazonOrders({ db, rel, today }: Helpers): number {
  const transactions = db.prepare(`
    SELECT t.id, t.date, t.description, t.amount
    FROM transactions t
    JOIN merchants m ON m.id = t.merchant_id
    WHERE m.name = 'Amazon' AND t.description LIKE 'Amazon%'
    ORDER BY t.date, t.id
  `).all() as AmazonTransaction[];
  const splitDescriptions = new Set(SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.descriptions);
  const splitTransactions = transactions.filter(transaction => splitDescriptions.has(transaction.description as typeof SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.descriptions[number]));
  if (splitTransactions.length !== 2) throw new Error('Sample Amazon split shipment transactions missing');

  const orders: OrderFixture[] = [];
  for (const transaction of transactions) {
    if (splitDescriptions.has(transaction.description as typeof SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.descriptions[number])) continue;
    orders.push({ transactions: [transaction], titleOffset: orders.length });
  }
  orders.push({ transactions: splitTransactions, titleOffset: orders.length });

  const insertOrder = db.prepare(`
    INSERT INTO amazon_orders (order_number, order_date, total, subtotal, tax, raw_json, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO amazon_order_items (order_number, title, unit_price, quantity, asin, seller)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCharge = db.prepare(`
    INSERT INTO amazon_charges (charge_date, amount, order_number, payment_method, is_refund)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMatch = db.prepare(`
    INSERT INTO amazon_matches (transaction_id, order_number, charge_id, amount, matched_by, confidence, enriched_at, created_at)
    VALUES (?, ?, ?, ?, 'auto', 0.95, ?, ?)
  `);

  db.transaction(() => {
    orders.forEach((fixture, index) => {
      const number = orderNumber(index + 1);
      const total = fixture.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
      const orderDate = fixture.transactions.map(transaction => transaction.date).sort()[0];
      const itemCount = 1 + (index % 4);
      const itemAmount = total / itemCount;
      const isRefund = fixture.transactions.some(transaction => transaction.amount < 0);
      insertOrder.run(number, orderDate, total, total, 0, JSON.stringify({ orderNumber: number, synthetic: true }), orderDate);
      for (let item = 0; item < itemCount; item++) {
        insertItem.run(number, ITEM_TITLES[(fixture.titleOffset + item) % ITEM_TITLES.length], itemAmount, 1, `B0SAMPLE${String(index + 1).padStart(3, '0')}`, 'Amazon.com');
      }
      for (const transaction of fixture.transactions) {
        const charge = insertCharge.run(transaction.date, transaction.amount, number, 'Visa', isRefund ? 1 : 0);
        insertMatch.run(transaction.id, number, charge.lastInsertRowid, transaction.amount, transaction.date, transaction.date);
      }
    });

    const unmatchedOrder = orderNumber(orders.length + 1);
    const unmatchedDate = rel('2026-02-22');
    if (unmatchedDate > today) throw new Error('Sample Amazon unmatched order date is in the future');
    insertOrder.run(unmatchedOrder, unmatchedDate, 42.5, 42.5, 0, JSON.stringify({ orderNumber: unmatchedOrder, synthetic: true }), unmatchedDate);
    insertItem.run(unmatchedOrder, 'Reusable Shopping Bags', 21.25, 2, 'B0SAMPLE999', 'Amazon.com');
  })();

  console.log(`  Created ${orders.length + 1} synthetic Amazon orders (${transactions.length} matched charges)`);
  return orders.length + 1;
}
