/** Synthetic sample merchants only; never used by real transaction ingestion. */
import type Database from 'better-sqlite3';
import { findOrCreateMerchant } from '../merchants.js';

export const brandMerchants = [
  'Amazon', 'Target', 'Costco', 'Costco Gas', 'Shell', 'Chevron', "Trader Joe's",
  'Whole Foods', 'Publix', 'Aldi', 'Starbucks', 'Chipotle', 'Panera', 'Chick-fil-A',
  'Taco Bell', 'PetSmart', 'Chewy', 'GEICO', 'CVS', 'Walgreens', 'Home Depot',
  'Delta Air Lines', 'Marriott', 'Nordstrom', 'T-Mobile', 'Comcast', 'Netflix',
  'Walmart', 'Best Buy', 'IKEA', 'Spotify', 'Hulu', 'Uber', 'Lyft', 'Venmo',
];

// Deliberately coined places, not a list of real local businesses. Ten places ×
// fifteen services gives a stable, varied long tail without 150 hand-copied rows.
const places = ['Larkspindle', 'Mossquill', 'Ferncairn', 'Pebblewisp', 'Clovermere',
  'Birchwhistle', 'Amberfen', 'Willowthimble', 'Cedarwhorl', 'Hazelglen'];
const services = ['Market', 'Bakery', 'Cafe', 'Books', 'Music', 'Cinema', 'Bistro',
  'Pet Clinic', 'Family Clinic', 'Property Management', 'Waterworks', 'Energy',
  'Insurance', 'Finance', 'Workshop'];
export const inventedMerchants = places.flatMap(place => services.map(service => `${place} ${service}`));

const aliases: Record<string, string> = {
  'Direct Deposit — Payroll': 'Larkspindle Workshop',
  'Interest Payment': 'Larkspindle Finance',
  'Rent': 'Larkspindle Property Management',
  'Oakwood Apartments': 'Larkspindle Property Management',
  'Xfinity Internet': 'Comcast',
  'Spectrum': 'Comcast',
  'Duke Energy': 'Larkspindle Energy',
  'City Water Dept': 'Larkspindle Waterworks',
  'Whole Foods Market': 'Whole Foods',
  'BP': 'Shell',
  'Olive Garden': 'Mossquill Bistro',
  'Panera Bread': 'Panera',
  'Banfield Pet Hospital': 'Larkspindle Pet Clinic',
  'BlueCross BlueShield': 'Larkspindle Insurance',
  'Honda Financial': 'Larkspindle Finance',
  'CVS Pharmacy': 'CVS',
  'AMC Theatres': 'Larkspindle Cinema',
  'Barnes & Noble': 'Larkspindle Books',
  'ALDI': 'Aldi',
  'Five Guys': 'Ferncairn Bistro',
  'The Melting Pot': 'Pebblewisp Bistro',
  'Chewy.com': 'Chewy',
  'Guitar Center': 'Larkspindle Music',
  'Delta Airlines': 'Delta Air Lines',
  'Marriott NYC': 'Marriott',
  'Nordstrom Rack': 'Nordstrom',
  'Doctor Copay': 'Larkspindle Family Clinic',
  'Amazon Refund': 'Amazon',
};
const intendedNames = new Set([...brandMerchants, ...inventedMerchants]);

export function sampleMerchantName(description: string): string {
  const stem = description.split(' — ')[0];
  const name = aliases[description] ?? aliases[stem] ?? stem;
  if (!intendedNames.has(name)) throw new Error(`Unlisted sample merchant: ${description}`);
  return name;
}

export function seedMerchants(db: Database.Database) {
  for (const name of brandMerchants) {
    const vendor = db.prepare('SELECT name FROM vendor_logos WHERE LOWER(name) = LOWER(?)').get(name);
    if (!vendor) throw new Error(`Sample brand missing from vendor catalog: ${name}`);
  }
  for (const name of intendedNames) findOrCreateMerchant(name, db);
  console.log(`  Created ${brandMerchants.length} brand and ${inventedMerchants.length} invented merchants`);
}
