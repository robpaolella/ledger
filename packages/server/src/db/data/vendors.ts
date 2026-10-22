// Seed catalog of popular US vendors → primary web domain, used to auto-attach a
// logo (fetched once from logo.dev, cached to /uploads) to any merchant whose
// canonical name matches. `name` MUST exactly equal the canonical name that
// merchant normalization produces (see services/merchantAliases.ts) so the
// backfill/attach matches merchants by name. `color` is the monogram fallback.

export interface SeedVendor {
  name: string;
  domain: string;
  color: string;
}

export const VENDORS: SeedVendor[] = [
  // Fuel
  { name: 'Costco Gas', domain: 'costco.com', color: '#E31837' },
  { name: 'Shell', domain: 'shell.com', color: '#FBCE07' },
  { name: 'Chevron', domain: 'chevron.com', color: '#1F4E9D' },
  { name: 'ExxonMobil', domain: 'exxon.com', color: '#EE1C25' },
  { name: 'Sunoco', domain: 'sunoco.com', color: '#00539F' },
  { name: 'Valero', domain: 'valero.com', color: '#00539B' },
  { name: 'Marathon', domain: 'marathonpetroleum.com', color: '#0033A0' },
  { name: 'Citgo', domain: 'citgo.com', color: '#ED1C24' },
  { name: 'ARCO', domain: 'arco.com', color: '#003DA5' },
  { name: 'Phillips 66', domain: 'phillips66.com', color: '#C8102E' },
  { name: 'Wawa', domain: 'wawa.com', color: '#B21F2D' },
  // Retail / warehouse
  { name: 'Amazon Prime', domain: 'amazon.com', color: '#00A8E1' },
  { name: 'Amazon', domain: 'amazon.com', color: '#FF9900' },
  { name: 'Walmart', domain: 'walmart.com', color: '#0071CE' },
  { name: 'Target', domain: 'target.com', color: '#CC0000' },
  { name: 'Costco', domain: 'costco.com', color: '#E31837' },
  { name: "Sam's Club", domain: 'samsclub.com', color: '#0067A0' },
  { name: 'Best Buy', domain: 'bestbuy.com', color: '#0046BE' },
  { name: 'Home Depot', domain: 'homedepot.com', color: '#F96302' },
  { name: "Lowe's", domain: 'lowes.com', color: '#004990' },
  { name: 'IKEA', domain: 'ikea.com', color: '#0058A3' },
  { name: 'CVS', domain: 'cvs.com', color: '#CC0000' },
  { name: 'Walgreens', domain: 'walgreens.com', color: '#E31837' },
  { name: 'Rite Aid', domain: 'riteaid.com', color: '#004B8D' },
  { name: 'Dollar General', domain: 'dollargeneral.com', color: '#FFD400' },
  { name: 'Dollar Tree', domain: 'dollartree.com', color: '#00954C' },
  { name: 'Wayfair', domain: 'wayfair.com', color: '#7F187F' },
  { name: 'Chewy', domain: 'chewy.com', color: '#1361A9' },
  { name: 'Petco', domain: 'petco.com', color: '#004B87' },
  { name: 'PetSmart', domain: 'petsmart.com', color: '#0072CE' },
  // Department / apparel / beauty
  { name: 'Macy\'s', domain: 'macys.com', color: '#E21A2C' },
  { name: "Kohl's", domain: 'kohls.com', color: '#000000' },
  { name: 'Nordstrom', domain: 'nordstrom.com', color: '#000000' },
  { name: 'Sephora', domain: 'sephora.com', color: '#000000' },
  { name: 'Ulta', domain: 'ulta.com', color: '#E00034' },
  { name: 'Nike', domain: 'nike.com', color: '#111111' },
  { name: 'Etsy', domain: 'etsy.com', color: '#F1641E' },
  { name: 'eBay', domain: 'ebay.com', color: '#E53238' },
  // Grocery
  { name: "Trader Joe's", domain: 'traderjoes.com', color: '#D22630' },
  { name: 'Whole Foods', domain: 'wholefoodsmarket.com', color: '#00674B' },
  { name: 'Safeway', domain: 'safeway.com', color: '#E11B22' },
  { name: 'Kroger', domain: 'kroger.com', color: '#004990' },
  { name: 'Publix', domain: 'publix.com', color: '#007A33' },
  { name: 'Aldi', domain: 'aldi.us', color: '#00447C' },
  { name: 'Wegmans', domain: 'wegmans.com', color: '#C8102E' },
  { name: 'Food Lion', domain: 'foodlion.com', color: '#004B8D' },
  { name: 'Giant', domain: 'giantfood.com', color: '#E4002B' },
  { name: 'Giant Eagle', domain: 'gianteagle.com', color: '#E4002B' },
  { name: 'Ralphs', domain: 'ralphs.com', color: '#004990' },
  { name: 'Vons', domain: 'vons.com', color: '#E11B22' },
  { name: 'Sprouts', domain: 'sprouts.com', color: '#5B8F22' },
  { name: 'Instacart', domain: 'instacart.com', color: '#43B02A' },
  // Dining / coffee / fast food
  { name: 'Starbucks', domain: 'starbucks.com', color: '#00704A' },
  { name: 'Dunkin', domain: 'dunkindonuts.com', color: '#FF6E1B' },
  { name: "Peet's Coffee", domain: 'peets.com', color: '#00583D' },
  { name: "McDonald's", domain: 'mcdonalds.com', color: '#FFC72C' },
  { name: 'Chick-fil-A', domain: 'chick-fil-a.com', color: '#E51636' },
  { name: 'Chipotle', domain: 'chipotle.com', color: '#A81612' },
  { name: 'Panera', domain: 'panerabread.com', color: '#5E9732' },
  { name: 'Taco Bell', domain: 'tacobell.com', color: '#702082' },
  { name: "Wendy's", domain: 'wendys.com', color: '#E2203B' },
  { name: 'Burger King', domain: 'bk.com', color: '#D62300' },
  { name: 'Subway', domain: 'subway.com', color: '#008C15' },
  { name: "Jersey Mike's", domain: 'jerseymikes.com', color: '#00447C' },
  { name: 'In-N-Out', domain: 'in-n-out.com', color: '#E0112B' },
  // Delivery / ride
  { name: 'Uber Eats', domain: 'ubereats.com', color: '#06C167' },
  { name: 'DoorDash', domain: 'doordash.com', color: '#FF3008' },
  { name: 'Grubhub', domain: 'grubhub.com', color: '#F63440' },
  { name: 'Postmates', domain: 'postmates.com', color: '#000000' },
  { name: 'Uber', domain: 'uber.com', color: '#000000' },
  { name: 'Lyft', domain: 'lyft.com', color: '#FF00BF' },
  // Travel
  { name: 'Airbnb', domain: 'airbnb.com', color: '#FF5A5F' },
  { name: 'Marriott', domain: 'marriott.com', color: '#96172E' },
  { name: 'Hilton', domain: 'hilton.com', color: '#12284C' },
  { name: 'Expedia', domain: 'expedia.com', color: '#FCC72C' },
  // Subscriptions / digital
  { name: 'Netflix', domain: 'netflix.com', color: '#E50914' },
  { name: 'Hulu', domain: 'hulu.com', color: '#1CE783' },
  { name: 'Disney+', domain: 'disneyplus.com', color: '#113CCF' },
  { name: 'Spotify', domain: 'spotify.com', color: '#1DB954' },
  { name: 'Apple', domain: 'apple.com', color: '#555555' },
  { name: 'HBO Max', domain: 'max.com', color: '#0046FF' },
  { name: 'Paramount+', domain: 'paramountplus.com', color: '#0064FF' },
  { name: 'Peacock', domain: 'peacocktv.com', color: '#000000' },
  { name: 'YouTube Premium', domain: 'youtube.com', color: '#FF0000' },
  { name: 'GitHub', domain: 'github.com', color: '#181717' },
  { name: 'Cloudflare', domain: 'cloudflare.com', color: '#F38020' },
  { name: 'Namecheap', domain: 'namecheap.com', color: '#DE3910' },
  { name: 'OpenAI', domain: 'openai.com', color: '#000000' },
  { name: 'Steam', domain: 'steampowered.com', color: '#1B2838' },
  { name: 'Adobe', domain: 'adobe.com', color: '#FF0000' },
  { name: 'Microsoft', domain: 'microsoft.com', color: '#0067B8' },
  { name: 'Google', domain: 'google.com', color: '#4285F4' },
  { name: 'PlayStation', domain: 'playstation.com', color: '#003791' },
  { name: 'Xbox', domain: 'xbox.com', color: '#107C10' },
  { name: 'Nintendo', domain: 'nintendo.com', color: '#E60012' },
  // Telecom
  { name: 'AT&T', domain: 'att.com', color: '#00A8E0' },
  { name: 'Verizon', domain: 'verizon.com', color: '#EE0000' },
  { name: 'T-Mobile', domain: 't-mobile.com', color: '#E20074' },
  { name: 'Comcast', domain: 'xfinity.com', color: '#000000' },
  // Insurance
  { name: 'GEICO', domain: 'geico.com', color: '#006B54' },
  { name: 'Progressive', domain: 'progressive.com', color: '#0033A0' },
  { name: 'State Farm', domain: 'statefarm.com', color: '#E31837' },
  { name: 'Allstate', domain: 'allstate.com', color: '#0033A0' },
  // Fitness
  { name: 'Planet Fitness', domain: 'planetfitness.com', color: '#6A1B9A' },
  { name: 'Equinox', domain: 'equinox.com', color: '#000000' },
  // Payments / P2P
  { name: 'Venmo', domain: 'venmo.com', color: '#3D95CE' },
  { name: 'Cash App', domain: 'cash.app', color: '#00D632' },
  { name: 'Zelle', domain: 'zellepay.com', color: '#6D1ED4' },
  // Airlines
  { name: 'Southwest Airlines', domain: 'southwest.com', color: '#304CB2' },
  { name: 'American Airlines', domain: 'aa.com', color: '#0078D2' },
  { name: 'United Airlines', domain: 'united.com', color: '#005DAA' },
  { name: 'Delta Air Lines', domain: 'delta.com', color: '#C8102E' },
];
