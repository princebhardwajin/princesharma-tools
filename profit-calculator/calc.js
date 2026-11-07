/*
 * Profit engine for Amazon, Flipkart and Meesho.
 * Pure functions: no DOM. Works in the browser (window.PSCalc) and in Node (module.exports).
 *
 * Assumptions:
 * - Selling price includes GST. Taxable value = price / (1 + GST rate).
 * - Commission/referral and collection fees are charged on the GST-inclusive price.
 * - GST-registered sellers claim GST on platform fees and ads back as input credit,
 *   so those costs count at their pre-GST value. Unregistered sellers pay the extra 18%.
 * - Returns cost = return rate x (forward + reverse shipping). On Meesho a share of
 *   returns also comes back damaged or lost, costing the product.
 * - Ad spend is a % of sales (ACoS).
 */
(function (root) {
  'use strict';

  function band(table, price) {
    for (var i = 0; i < table.length; i++) if (price <= table[i][0]) return table[i][1];
    return table[table.length - 1][1];
  }

  var ZONES = { local: 0, regional: 1, national: 2 };

  // Chargeable weight in kg: higher of actual and volumetric (L x W x H / 5000).
  function chargeableWeight(inp) {
    var vol = (inp.l > 0 && inp.w > 0 && inp.h > 0) ? (inp.l * inp.w * inp.h) / 5000 : 0;
    return { actual: inp.weight || 0, volumetric: vol, chargeable: Math.max(inp.weight || 0, vol, 0.001) };
  }

  // Weight-slab shipping: first 500 g, then up to 1 kg, then each extra 500 g.
  function slabShip(ship, kg, zoneIdx) {
    var pick = function (v) { return Array.isArray(v) ? v[zoneIdx] : v; };
    if (kg <= 0.5) return pick(ship.first500);
    if (kg <= 1) return pick(ship.upTo1kg);
    return pick(ship.upTo1kg) + Math.ceil((kg - 1) / 0.5) * pick(ship.addl500);
  }

  function category(F, id) {
    for (var i = 0; i < F.categories.length; i++) if (F.categories[i].id === id) return F.categories[i];
    return F.categories[0];
  }

  // Fee lines for one platform at a given price. Returns per-unit amounts.
  function fees(platform, price, inp, F) {
    var cat = category(F, inp.category);
    var w = chargeableWeight(inp);
    var z = ZONES[inp.zone] != null ? ZONES[inp.zone] : 2;
    var mode = inp.fulfilment || 'platform';   // platform | warehouse | self
    var out = { lines: [], ship: 0, reverse: 0, commissionRate: 0 };

    if (platform === 'amazon') {
      var A = F.amazon;
      var rate = price < A.zeroUnder ? 0 : cat.aRate;
      out.commissionRate = rate;
      out.lines.push({ key: 'commission', label: 'Referral fee', amount: price * rate / 100,
        detail: rate === 0 ? '0%: price is under ₹' + A.zeroUnder.toLocaleString('en-IN') : rate + '% · ' + cat.name });
      var ct = mode === 'self' ? A.closing.self : (mode === 'warehouse' ? A.closing.fba : A.closing.easy);
      var cf = band(ct, price);
      out.lines.push({ key: 'fixed', label: 'Closing fee', amount: cf, detail: priceBandLabel(ct, price) + ' · ' + modeName('amazon', mode) });
      if (mode === 'self') {
        out.ship = inp.selfShip || 0;
        out.lines.push({ key: 'ship', label: 'Your shipping cost', amount: out.ship, detail: 'You ship it yourself' });
      } else {
        out.ship = slabShip(A.ship, w.chargeable, z);
        out.lines.push({ key: 'ship', label: 'Weight handling', amount: out.ship, detail: fmtKg(w.chargeable) + ' chargeable · ' + zoneName(inp.zone) });
        if (mode === 'warehouse') out.lines.push({ key: 'pickpack', label: 'FBA pick & pack', amount: A.fbaPickPack, detail: 'Per unit' });
      }
      out.reverse = out.ship + (A.reverseExtra || 0);
    }

    if (platform === 'flipkart') {
      var Fk = F.flipkart;
      var frate = cat.fashion ? 0 : (price < Fk.zeroUnder ? 0 : cat.fRate);
      out.commissionRate = frate;
      out.lines.push({ key: 'commission', label: 'Commission', amount: price * frate / 100,
        detail: cat.fashion ? '0%: fashion is commission-free' : (price < Fk.zeroUnder ? '0%: price is under ₹' + Fk.zeroUnder.toLocaleString('en-IN') : frate + '% · ' + cat.name) });
      var ff = band(Fk.fixed, price);
      out.lines.push({ key: 'fixed', label: 'Fixed fee', amount: ff, detail: priceBandLabel(Fk.fixed, price) });
      var cod = Math.max(0, Math.min(100, inp.cod == null ? 50 : inp.cod));
      var collPct = (Fk.collectionPrepaid * (100 - cod) + Fk.collectionCod * cod) / 100;
      out.lines.push({ key: 'collection', label: 'Collection fee', amount: price * collPct / 100, detail: collPct.toFixed(2).replace(/\.?0+$/, '') + '% · ' + cod + '% COD orders' });
      if (mode === 'self') {
        out.ship = inp.selfShip || 0;
        out.lines.push({ key: 'ship', label: 'Your shipping cost', amount: out.ship, detail: 'You ship it yourself' });
      } else {
        out.ship = slabShip(Fk.ship, w.chargeable, z);
        out.lines.push({ key: 'ship', label: 'Shipping', amount: out.ship, detail: fmtKg(w.chargeable) + ' chargeable · ' + zoneName(inp.zone) });
        if (mode === 'warehouse') out.lines.push({ key: 'pickpack', label: 'Flipkart pick & pack', amount: Fk.fbfPickPack, detail: 'Per unit' });
      }
      out.reverse = Fk.reverse;
    }

    if (platform === 'meesho') {
      var M = F.meesho;
      out.lines.push({ key: 'commission', label: 'Commission', amount: price * M.commission / 100, detail: M.commission === 0 ? 'Meesho charges 0% commission' : M.commission + '%' });
      out.ship = slabShip(M.ship, w.chargeable, 0);
      out.lines.push({ key: 'ship', label: 'Shipping', amount: out.ship, detail: fmtKg(w.chargeable) + ' chargeable · deducted from payout' });
      out.reverse = M.reverse;
    }
    return out;
  }

  // Full profit breakdown for one platform at a given price.
  function compute(platform, price, inp, F) {
    var g = (inp.gst || 0) / 100;
    var taxable = price / (1 + g);
    var gstOut = price - taxable;
    var fe = fees(platform, price, inp, F);
    var feeSum = 0;
    fe.lines.forEach(function (l) { if (l.key !== 'ship') feeSum += l.amount; });
    var feeGst = (feeSum + fe.ship) * F.gstOnFees / 100;
    var ads = price * (inp.ads || 0) / 100;
    var adsGst = ads * F.gstOnFees / 100;
    var itc = inp.gstRegistered !== false;
    var extraGst = itc ? 0 : feeGst + adsGst;
    var ret = (inp.returns || 0) / 100;
    var returnsShip = ret * (fe.ship + fe.reverse);
    var lost = platform === 'meesho' ? ret * (inp.lost || 0) / 100 * (inp.cost || 0) : 0;
    var cost = inp.cost || 0;
    var profit = taxable - feeSum - fe.ship - ads - returnsShip - lost - cost - extraGst;
    var tcs = taxable * F.tcs / 100, tds = price * F.tds / 100;
    return {
      platform: platform, price: price, taxable: taxable, gstOut: gstOut,
      feeLines: fe.lines, feeSum: feeSum, ship: fe.ship, reverse: fe.reverse,
      commissionRate: fe.commissionRate, feeGst: feeGst, adsGst: adsGst, itc: itc, extraGst: extraGst,
      ads: ads, returnsShip: returnsShip, lost: lost, cost: cost,
      profit: profit, margin: price > 0 ? profit / price * 100 : 0,
      beAcos: price > 0 ? Math.max(0, (profit + ads) / price * 100) : 0,
      cashHeld: tcs + tds, tcs: tcs, tds: tds
    };
  }

  // Lowest whole-rupee price at which margin reaches `target` %. Scans upward because
  // fee bands make profit jump at thresholds such as ₹1,000.
  function priceForMargin(platform, target, inp, F, maxPrice) {
    maxPrice = maxPrice || 300000;
    var p = 1, step = 1;
    for (; p <= maxPrice; p += step) {
      var r = compute(platform, p, inp, F);
      if (r.profit >= 0 && r.margin >= target) return p;
      step = p < 5000 ? 1 : (p < 50000 ? 5 : 25);
    }
    return null;
  }

  function breakEven(platform, inp, F) { return priceForMargin(platform, 0, inp, F); }

  function priceBandLabel(table, price) {
    var lo = 0;
    for (var i = 0; i < table.length; i++) {
      if (price <= table[i][0]) {
        if (table[i][0] === Infinity) return 'Above ₹' + lo.toLocaleString('en-IN');
        return '₹' + (lo === 0 ? 0 : lo + 1).toLocaleString('en-IN') + '–' + table[i][0].toLocaleString('en-IN') + ' band';
      }
      lo = table[i][0];
    }
    return '';
  }
  function zoneName(z) { return z === 'local' ? 'Local' : (z === 'regional' ? 'Regional' : 'National'); }
  function modeName(p, m) {
    if (p === 'amazon') return m === 'self' ? 'Self Ship' : (m === 'warehouse' ? 'FBA' : 'Easy Ship');
    return m === 'self' ? 'Self ship' : (m === 'warehouse' ? 'Flipkart fulfilment' : 'Standard');
  }
  function fmtKg(kg) { return (Math.round(kg * 100) / 100).toString().replace(/\.0+$/, '') + ' kg'; }

  var api = { compute: compute, fees: fees, priceForMargin: priceForMargin, breakEven: breakEven,
    chargeableWeight: chargeableWeight, slabShip: slabShip, band: band, category: category, modeName: modeName, zoneName: zoneName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PSCalc = api;
})(this);
