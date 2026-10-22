/**
 * Bundled brand-alias dictionary. Maps noisy bank/statement strings to a single
 * canonical merchant display name — the thing normalization alone can't do
 * (e.g. `AMZN MKTP US*2X9K1` → `Amazon`). Offline + privacy-preserving.
 *
 * Ordered: first matching pattern wins, so put more-specific patterns first
 * (e.g. `COSTCO GAS` before `COSTCO`). Patterns are tested case-insensitively
 * against the RAW string (processor prefixes still attached).
 */
export interface MerchantAlias {
  pattern: RegExp;
  canonical: string;
}

// NOTE: order matters — specific before general.
export const MERCHANT_ALIASES: MerchantAlias[] = [
  // Fuel-specific (before the general warehouse/grocery brands)
  { pattern: /costco\s*gas/i, canonical: 'Costco Gas' },
  { pattern: /\bshell\b/i, canonical: 'Shell' },
  { pattern: /\bchevron\b/i, canonical: 'Chevron' },
  { pattern: /\bexxon(mobil)?\b|\bmobil\b/i, canonical: 'ExxonMobil' },
  { pattern: /\bsunoco\b/i, canonical: 'Sunoco' },
  { pattern: /\bvalero\b/i, canonical: 'Valero' },
  { pattern: /\bmarathon\s*(gas|petro)/i, canonical: 'Marathon' },
  { pattern: /\bcitgo\b/i, canonical: 'Citgo' },
  { pattern: /\barco\b/i, canonical: 'ARCO' },
  { pattern: /phillips\s*66/i, canonical: 'Phillips 66' },
  { pattern: /\bwawa\b/i, canonical: 'Wawa' },
  // Retail / warehouse — Prime (specific) BEFORE the general Amazon rule.
  { pattern: /amazon\s*prime|prime\s*video/i, canonical: 'Amazon Prime' },
  { pattern: /\bamzn\b|amazon|amazon\.com|amzn\s*mktp/i, canonical: 'Amazon' },
  { pattern: /wal[\s-]*mart|wm\s*supercenter|walmart/i, canonical: 'Walmart' },
  { pattern: /\btarget\b|target\s*t-?\d*/i, canonical: 'Target' },
  { pattern: /costco(?!\s*gas)/i, canonical: 'Costco' },
  { pattern: /\bsam'?s\s*club\b/i, canonical: "Sam's Club" },
  { pattern: /\bbest\s*buy\b/i, canonical: 'Best Buy' },
  { pattern: /\bhome\s*depot\b|the\s*home\s*depot/i, canonical: 'Home Depot' },
  { pattern: /\blowe'?s\b/i, canonical: "Lowe's" },
  { pattern: /\bikea\b/i, canonical: 'IKEA' },
  { pattern: /\bcvs\b|cvs\/?pharmacy/i, canonical: 'CVS' },
  { pattern: /\bwalgreens\b/i, canonical: 'Walgreens' },
  { pattern: /\brite\s*aid\b/i, canonical: 'Rite Aid' },
  { pattern: /dollar\s*general/i, canonical: 'Dollar General' },
  { pattern: /dollar\s*tree/i, canonical: 'Dollar Tree' },
  // Grocery
  { pattern: /trader\s*joe'?s?/i, canonical: "Trader Joe's" },
  { pattern: /whole\s*foods|wholefds|wfm/i, canonical: 'Whole Foods' },
  { pattern: /\bsafeway\b/i, canonical: 'Safeway' },
  { pattern: /\bkroger\b/i, canonical: 'Kroger' },
  { pattern: /\bpublix\b/i, canonical: 'Publix' },
  { pattern: /\baldi\b/i, canonical: 'Aldi' },
  { pattern: /\bwegmans\b/i, canonical: 'Wegmans' },
  { pattern: /food\s*lion/i, canonical: 'Food Lion' },
  { pattern: /\bgiant\b(?!\s*eagle)/i, canonical: 'Giant' },
  { pattern: /giant\s*eagle/i, canonical: 'Giant Eagle' },
  { pattern: /\bralphs\b/i, canonical: 'Ralphs' },
  { pattern: /\bvons\b/i, canonical: 'Vons' },
  { pattern: /\bsprouts\b/i, canonical: 'Sprouts' },
  // Dining / coffee / fast food
  { pattern: /starbucks|sbux/i, canonical: 'Starbucks' },
  { pattern: /dunkin/i, canonical: 'Dunkin' },
  { pattern: /peet'?s/i, canonical: "Peet's Coffee" },
  { pattern: /mcdonald'?s?|mcdonalds/i, canonical: "McDonald's" },
  { pattern: /chick[\s-]*fil[\s-]*a/i, canonical: 'Chick-fil-A' },
  { pattern: /chipotle/i, canonical: 'Chipotle' },
  { pattern: /panera/i, canonical: 'Panera' },
  { pattern: /\btaco\s*bell\b/i, canonical: 'Taco Bell' },
  { pattern: /\bwendy'?s\b/i, canonical: "Wendy's" },
  { pattern: /burger\s*king/i, canonical: 'Burger King' },
  { pattern: /\bsubway\b/i, canonical: 'Subway' },
  { pattern: /jersey\s*mike'?s/i, canonical: "Jersey Mike's" },
  { pattern: /in[\s-]*n[\s-]*out/i, canonical: 'In-N-Out' },
  // Delivery / ride
  { pattern: /uber\s*eats/i, canonical: 'Uber Eats' },
  { pattern: /\bdoordash\b|\bdd\s*doordash\b/i, canonical: 'DoorDash' },
  { pattern: /grubhub/i, canonical: 'Grubhub' },
  { pattern: /postmates/i, canonical: 'Postmates' },
  { pattern: /\buber\b(?!\s*eats)/i, canonical: 'Uber' },
  { pattern: /\blyft\b/i, canonical: 'Lyft' },
  // Subscriptions / digital
  { pattern: /netflix/i, canonical: 'Netflix' },
  { pattern: /\bhulu\b/i, canonical: 'Hulu' },
  { pattern: /disney\s*plus|disney\+/i, canonical: 'Disney+' },
  { pattern: /spotify/i, canonical: 'Spotify' },
  { pattern: /apple\.com\/bill|apple\s*music|itunes/i, canonical: 'Apple' },
  { pattern: /\bhbo\s*max\b|\bmax\s*help\b/i, canonical: 'HBO Max' },
  { pattern: /paramount\+|paramount\s*plus/i, canonical: 'Paramount+' },
  { pattern: /\bpeacock\b/i, canonical: 'Peacock' },
  { pattern: /youtube\s*premium|google\s*youtube/i, canonical: 'YouTube Premium' },
  { pattern: /\bgithub\b/i, canonical: 'GitHub' },
  { pattern: /cloudflare/i, canonical: 'Cloudflare' },
  { pattern: /namecheap/i, canonical: 'Namecheap' },
  { pattern: /openai|chatgpt/i, canonical: 'OpenAI' },
  { pattern: /\bsteam\s*games?\b|steampowered/i, canonical: 'Steam' },
  // Telecom / utilities
  { pattern: /at&t|att\s*bill|attwireless/i, canonical: 'AT&T' },
  { pattern: /verizon/i, canonical: 'Verizon' },
  { pattern: /t[\s-]*mobile/i, canonical: 'T-Mobile' },
  { pattern: /comcast|xfinity/i, canonical: 'Comcast' },
  // Insurance
  { pattern: /geico/i, canonical: 'GEICO' },
  { pattern: /progressive/i, canonical: 'Progressive' },
  { pattern: /state\s*farm/i, canonical: 'State Farm' },
  { pattern: /allstate/i, canonical: 'Allstate' },
  // Fitness
  { pattern: /planet\s*fitness/i, canonical: 'Planet Fitness' },
  { pattern: /equinox/i, canonical: 'Equinox' },
  // Payments / P2P
  { pattern: /venmo/i, canonical: 'Venmo' },
  { pattern: /cash\s*app|cashapp|\bsq\s*cash\b/i, canonical: 'Cash App' },
  { pattern: /zelle/i, canonical: 'Zelle' },
  // Airlines
  { pattern: /southwest\s*air|southwestair/i, canonical: 'Southwest Airlines' },
  { pattern: /american\s*air/i, canonical: 'American Airlines' },
  { pattern: /united\s*air/i, canonical: 'United Airlines' },
  { pattern: /delta\s*air/i, canonical: 'Delta Air Lines' },
  // Additional popular brands (conservative, word-boundary matched). Kept after
  // the specific rules above so a more-specific brand still wins.
  { pattern: /wayfair/i, canonical: 'Wayfair' },
  { pattern: /\bchewy\b/i, canonical: 'Chewy' },
  { pattern: /petsmart/i, canonical: 'PetSmart' },
  { pattern: /\bpetco\b/i, canonical: 'Petco' },
  { pattern: /macy'?s/i, canonical: "Macy's" },
  { pattern: /kohl'?s/i, canonical: "Kohl's" },
  { pattern: /nordstrom/i, canonical: 'Nordstrom' },
  { pattern: /sephora/i, canonical: 'Sephora' },
  { pattern: /\bulta\b/i, canonical: 'Ulta' },
  { pattern: /\bnike\b/i, canonical: 'Nike' },
  { pattern: /\betsy\b/i, canonical: 'Etsy' },
  { pattern: /\bebay\b/i, canonical: 'eBay' },
  { pattern: /instacart/i, canonical: 'Instacart' },
  { pattern: /airbnb/i, canonical: 'Airbnb' },
  { pattern: /marriott/i, canonical: 'Marriott' },
  { pattern: /hilton/i, canonical: 'Hilton' },
  { pattern: /expedia/i, canonical: 'Expedia' },
  { pattern: /\badobe\b/i, canonical: 'Adobe' },
  { pattern: /microsoft|msft/i, canonical: 'Microsoft' },
  { pattern: /playstation|sony\s*interactive/i, canonical: 'PlayStation' },
  { pattern: /\bxbox\b/i, canonical: 'Xbox' },
  { pattern: /nintendo/i, canonical: 'Nintendo' },
  { pattern: /\bgoogle\b(?!\s*youtube)/i, canonical: 'Google' },
];

/** Return the canonical brand name for a raw string, or null if no alias matches. */
export function matchAlias(raw: string): string | null {
  for (const a of MERCHANT_ALIASES) {
    if (a.pattern.test(raw)) return a.canonical;
  }
  return null;
}
