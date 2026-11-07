/*
 * Default marketplace fees used by the profit calculator.
 *
 * Every value here is a starting point: users can edit any fee in the app.
 * "official" = taken from the platform's own announcement.
 * "public"   = taken from a recent public fee breakdown.
 * "estimate" = our best estimate; check your own seller rate card.
 *
 * Last verified: 7 Nov 2026. Update VERIFIED and the values below when fees change.
 */
window.PS_FEES = {
  VERIFIED: '7 Nov 2026',

  // Categories. aRate / fRate = commission % when the price is ₹1,000 or more.
  // Below ₹1,000 both Amazon and Flipkart charge 0% on eligible products.
  // fashion: true = Flipkart charges 0% at every price (from July 2026).
  categories: [
    { id: 'sports',    name: 'Sports & fitness',          aRate: 8,  fRate: 9,  fashion: false },
    { id: 'apparel',   name: 'Clothing & apparel',        aRate: 13, fRate: 0,  fashion: true },
    { id: 'footwear',  name: 'Footwear',                  aRate: 12, fRate: 0,  fashion: true },
    { id: 'jewellery', name: 'Fashion jewellery',         aRate: 17, fRate: 0,  fashion: true },
    { id: 'bags',      name: 'Bags & luggage',            aRate: 11, fRate: 10, fashion: false },
    { id: 'home',      name: 'Home & kitchen',            aRate: 12, fRate: 11, fashion: false },
    { id: 'furnish',   name: 'Home furnishing',           aRate: 10, fRate: 11, fashion: false },
    { id: 'beauty',    name: 'Beauty & personal care',    aRate: 10, fRate: 12, fashion: false },
    { id: 'toys',      name: 'Toys & games',              aRate: 9,  fRate: 10, fashion: false },
    { id: 'baby',      name: 'Baby products',             aRate: 8,  fRate: 9,  fashion: false },
    { id: 'elecacc',   name: 'Electronics accessories',   aRate: 7,  fRate: 7,  fashion: false },
    { id: 'books',     name: 'Books',                     aRate: 9,  fRate: 10, fashion: false },
    { id: 'grocery',   name: 'Grocery & gourmet',         aRate: 5,  fRate: 5,  fashion: false },
    { id: 'stationery',name: 'Office & stationery',       aRate: 9,  fRate: 9,  fashion: false },
    { id: 'auto',      name: 'Car & bike accessories',    aRate: 10, fRate: 10, fashion: false }
  ],

  amazon: {
    zeroUnder: 1000,                       // official: 0% referral below ₹1,000 (16 Mar 2026)
    // Closing fee by price band [upTo, fee]. Easy Ship values include the Sept 2026 increase.
    closing: {
      easy: [[250, 5], [500, 10], [1000, 20], [Infinity, 50]],
      self: [[300, 20], [500, 26], [1000, 36], [Infinity, 65]],
      fba:  [[250, 25], [500, 20], [1000, 18], [Infinity, 35]]
    },
    // Weight handling [local, regional, national]
    ship: { first500: [29, 43, 63], upTo1kg: [41, 65, 97], addl500: [13, 19, 31] },
    fbaPickPack: 14,
    reverseExtra: 0                        // reverse shipping = forward shipping + this
  },

  flipkart: {
    zeroUnder: 1000,                       // official: 0% commission below ₹1,000 (Nov 2025)
    fixed: [[300, 8], [500, 12], [1000, 15], [Infinity, 30]],
    collectionPrepaid: 2,                  // % of order value
    collectionCod: 3,
    ship: { first500: [0, 0, 65], upTo1kg: [35, 50, 95], addl500: [15, 20, 30] },
    reverse: 160,                          // per returned order
    fbfPickPack: 15
  },

  meesho: {
    commission: 0,                         // official: 0% commission, 0 collection fee
    ship: { first500: 65, upTo1kg: 90, addl500: 30 },
    reverse: 70
  },

  gstOnFees: 18,
  tcs: 1,      // % of taxable value, held and refundable via GST returns
  tds: 0.1,    // % of gross amount, under Sec 194-O

  // Source label shown next to each value in the fee structure section.
  source: {
    'amazon.zero': 'official', 'amazon.closing': 'public', 'amazon.ship': 'public', 'amazon.rate': 'estimate',
    'flipkart.zero': 'official', 'flipkart.fashion': 'official', 'flipkart.rate': 'estimate', 'flipkart.fixed': 'estimate',
    'flipkart.collection': 'estimate', 'flipkart.ship': 'estimate', 'flipkart.reverse': 'public',
    'meesho.commission': 'official', 'meesho.ship': 'estimate', 'meesho.reverse': 'estimate'
  },

  links: {
    amazon: 'https://sell.amazon.in/fees-and-pricing',
    flipkart: 'https://seller.flipkart.com/fees-and-commission',
    meesho: 'https://supplier.meesho.com/'
  }
};
