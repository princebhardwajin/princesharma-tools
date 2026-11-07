/* Profit calculator UI. Depends on fees.js (window.PS_FEES) and calc.js (window.PSCalc). */
(function () {
  'use strict';
  var C = window.PSCalc, DEF = window.PS_FEES;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var form = $('#form');
  var LS_FEES = 'psFees.v1', LS_SAVED = 'psSaved.v1';

  var PLAT = {
    amazon: { name: 'Amazon', color: '#F59E0B', bar: '#F59E0B', ink: '#92400E', key: 'a' },
    flipkart: { name: 'Flipkart', color: '#2563EB', bar: '#3B82F6', ink: '#1E40AF', key: 'f' },
    meesho: { name: 'Meesho', color: '#C026D3', bar: '#D946EF', ink: '#86198F', key: 'm' }
  };
  var state = { mode: 'profit', plat: 'af', open: { amazon: false, flipkart: false, meesho: true }, ftab: 'amazon', etab: 'amazon' };
  var prevBig = {};

  // ---------- storage helpers (storage can be blocked, so always guard) ----------
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function clone(o) { return JSON.parse(JSON.stringify(o, function (k, v) { return v === Infinity ? 'Inf' : v; }), function (k, v) { return v === 'Inf' ? Infinity : v; }); }

  // ---------- fees: defaults + user overrides ----------
  var F;
  function loadFees() {
    F = clone(DEF);
    var o = lsGet(LS_FEES);
    if (o) applyOverrides(F, o);
  }
  function applyOverrides(f, o) {
    Object.keys(o).forEach(function (path) { setPath(f, path, o[path]); });
  }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) {
    var ks = p.split('.'), last = ks.pop();
    var t = ks.reduce(function (a, k) { return a == null ? a : a[k]; }, o);
    if (t != null) t[last] = v;
  }

  // ---------- formatting ----------
  function inr(v, dec) {
    if (v == null || isNaN(v)) return '—';
    var n = Math.abs(v);
    var s = n.toLocaleString('en-IN', { maximumFractionDigits: dec || 0, minimumFractionDigits: dec || 0 });
    return (v < -0.5 ? '−₹' : '₹') + s;
  }
  function pct(v, d) { return (isNaN(v) ? 0 : v).toFixed(d == null ? 1 : d) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- inputs ----------
  function num(name, d) { var el = form.elements[name]; var v = parseFloat(el && el.value); return isNaN(v) ? d : v; }
  function readInputs() {
    return {
      price: Math.max(0, num('price', 0)), target: num('target', 20), cost: Math.max(0, num('cost', 0)),
      category: form.elements.category.value, gst: num('gst', 18),
      weight: Math.max(0, num('weight', 0)), l: num('l', 0), w: num('w', 0), h: num('h', 0),
      zone: form.elements.zone.value, fulfilment: state.plat === 'meesho' ? 'platform' : form.elements.fulfilment.value,
      selfShip: num('selfShip', 0), cod: num('cod', 50),
      ads: num('ads', 0), returns: num('returns', 0), lost: num('lost', 0), units: Math.max(0, num('units', 0)),
      gstRegistered: form.elements.gstRegistered.checked
    };
  }

  // ---------- core render ----------
  function platformsNow() { return state.plat === 'meesho' ? ['meesho'] : ['amazon', 'flipkart']; }

  function run() {
    var inp = readInputs();
    var list = platformsNow().map(function (p) {
      var price = state.mode === 'price' ? C.priceForMargin(p, inp.target, inp, F) : inp.price;
      var r = price ? C.compute(p, price, inp, F) : null;
      return { p: p, price: price, r: r, be: C.breakEven(p, inp, F) };
    });
    renderVisibility(inp);
    renderCards(list, inp);
    renderBreakdown(list);
    renderTips(list, inp);
    renderCross(inp);
    renderSticky(list);
    renderWeightNote(inp);
    $('#adsOut').textContent = inp.ads + '%';
    $('#retOut').textContent = inp.returns + '%';
    $('#lostOut').textContent = inp.lost + '%';
    writeHash(inp);
    window.__psLast = { inp: inp, list: list };
  }

  function renderVisibility(inp) {
    $$('[data-show]').forEach(function (el) { el.hidden = el.getAttribute('data-show') !== state.mode; });
    $$('[data-show-plat]').forEach(function (el) { el.hidden = el.getAttribute('data-show-plat') !== state.plat; });
    $('[data-self-ship]').hidden = !(state.plat === 'af' && inp.fulfilment === 'self');
    document.body.classList.toggle('meesho', state.plat === 'meesho');
    $('#title').innerHTML = state.plat === 'meesho' ? 'Meesho<br><span class="grad">profit calculator</span>' : 'Amazon vs Flipkart<br><span class="grad">profit calculator</span>';
    $('#subtitle').textContent = state.plat === 'meesho'
      ? 'Meesho charges no commission, so your profit depends on shipping, returns and lost products. See exactly what you keep per order.'
      : 'See your real profit on each platform after commission, fees, shipping, GST, ads and returns. Then find the price that hits your target margin.';
    var banner = $('#priceBanner');
    banner.hidden = state.mode !== 'price';
    if (state.mode === 'price') banner.innerHTML = 'To earn a <b>' + esc(inp.target) + '%</b> profit margin, list at the price' + (state.plat === 'meesho' ? '' : 's') + ' below.';
  }

  function health(m) {
    if (m >= 15) return ['Healthy', 'b-good'];
    if (m >= 5) return ['Thin margin', 'b-thin'];
    if (m >= 0) return ['Barely break-even', 'b-bad'];
    return ['Loss-making', 'b-bad'];
  }

  function renderCards(list, inp) {
    var wrap = $('#cards');
    wrap.className = 'cards' + (list.length === 1 ? ' one' : '');
    var best = -1, diff = 0;
    if (list.length === 2 && list[0].r && list[1].r) {
      if (state.mode === 'price') { best = list[0].price <= list[1].price ? 0 : 1; diff = Math.abs(list[0].price - list[1].price); }
      else { best = list[0].r.profit >= list[1].r.profit ? 0 : 1; diff = Math.abs(list[0].r.profit - list[1].r.profit); }
      if (diff < 1) best = -1;
    }
    wrap.innerHTML = list.map(function (x, i) {
      var P = PLAT[x.p], r = x.r, isPrice = state.mode === 'price';
      if (!r) return '<article class="pc" style="--c:' + P.color + '"><div class="pc-top"><span class="pc-name"><i></i>' + P.name + '</span></div><p class="pc-label">Recommended selling price</p><p class="pc-big">Not reachable</p><p class="pc-sub">Fees and costs are too high for a ' + esc(inp.target) + '% margin. Lower your costs or the target.</p></article>';
      var h = health(r.margin);
      var win = i === best;
      var big = isPrice ? x.price : r.profit;
      var winTxt = isPrice ? '★ ' + inr(diff) + ' lower price' : '★ Better by ' + inr(diff) + '/unit';
      var kv = x.p === 'meesho'
        ? '<div class="kv kv3"><div><span>' + (isPrice ? 'Profit per order' : 'Commission') + '</span><b>' + (isPrice ? inr(r.profit) : inr(r.feeSum)) + '</b></div><div><span>Break-even price</span><b>' + (x.be ? inr(x.be) : '—') + '</b></div><div><span>Returns cost / order</span><b>' + inr(r.returnsShip + r.lost) + '</b></div></div>'
        : '<div class="kv"><div><span>Platform fees + shipping</span><b>' + inr(r.feeSum + r.ship) + '</b></div><div><span>Break-even price</span><b>' + (x.be ? inr(x.be) : '—') + '</b></div><div><span>' + (x.p === 'amazon' ? 'Break-even ACoS' : 'Break-even ROI') + '</span><b>' + (x.p === 'amazon' ? pct(r.beAcos) : (r.beAcos > 0 ? (100 / r.beAcos).toFixed(2) + 'x' : '—')) + '</b></div><div><span>Profit per month</span><b>' + inr(r.profit * inp.units) + '</b></div></div>';
      var open = !!state.open[x.p];
      return '<article class="pc' + (win ? ' win' : '') + (open ? ' open' : '') + '" style="--c:' + P.color + '" data-p="' + x.p + '">' +
        '<div class="pc-top"><span class="pc-name"><i></i>' + P.name + '</span>' +
        (win ? '<span class="badge b-good">' + winTxt + '</span>' : (list.length === 1 && !isPrice ? '<span class="badge ' + h[1] + '">' + h[0] + ' · ' + pct(r.margin) + '</span>' : '')) + '</div>' +
        '<p class="pc-label">' + (isPrice ? 'Recommended selling price' : (x.p === 'meesho' ? 'Profit per order' : 'Profit per unit')) + '</p>' +
        '<p class="pc-big" data-big="' + x.p + '" data-v="' + big + '">' + inr(prevBig[x.p] != null ? prevBig[x.p] : big) + '</p>' +
        '<div class="pc-sub">' + (isPrice ? '<span class="badge b-info">' + esc(inp.target) + '% margin</span><span>Profit ' + inr(r.profit) + ' per unit</span>' : (list.length === 1 ? '<span>Cash held as TCS/TDS: ' + inr(r.cashHeld) + ' (refundable)</span>' : '<span class="badge ' + h[1] + '">' + h[0] + '</span><span>' + pct(r.margin) + ' margin</span>')) + '</div>' +
        '<hr>' + kv +
        '<button type="button" class="more" data-toggle="' + x.p + '" aria-expanded="' + open + '"><span>' + (open ? 'Hide calculation' : 'View how this was calculated') + '</span><span>' + (open ? '▴' : '▾') + '</span></button>' +
        calcLines(x, inp) + '</article>';
    }).join('');
    animateBig();
  }

  function calcLines(x, inp) {
    var r = x.r, rows = [];
    var neg = function (v) { return v > 0.004 ? '− ' + inr(v, 2) : inr(0); };
    rows.push(['Selling price', 'Including ' + inp.gst + '% GST', inr(r.price, 2)]);
    rows.push(['GST on sale', inp.gst + '% included in your price', neg(r.gstOut)]);
    r.feeLines.forEach(function (l) { rows.push([l.label, l.detail, neg(l.amount)]); });
    rows.push(['Ads', inp.ads + '% of sales', neg(r.ads)]);
    rows.push(['Returns & RTO', inp.returns + '% × ' + inr(r.ship + r.reverse) + ' (forward + reverse shipping)', neg(r.returnsShip)]);
    if (x.p === 'meesho') rows.push(['Damaged or lost returns', inp.lost + '% of returns × product cost', neg(r.lost)]);
    rows.push(['Product cost', 'As you entered', neg(r.cost)]);
    rows.push(['GST on fees and ads', r.itc ? '18%, claimed back as input credit' : '18%, not claimable (not GST registered)', r.itc ? inr(0) : neg(r.extraGst)]);
    return '<div class="calc">' + rows.map(function (q) { return '<div><span>' + esc(q[0]) + '<small>' + esc(q[1]) + '</small></span><em>' + q[2] + '</em></div>'; }).join('') +
      '<div class="tot' + (r.profit < 0 ? ' neg' : '') + '"><span>Your profit</span><em>' + inr(r.profit, 2) + '</em></div></div>';
  }

  function animateBig() {
    $$('[data-big]').forEach(function (el) {
      var p = el.getAttribute('data-big'), to = parseFloat(el.getAttribute('data-v'));
      var from = prevBig[p] != null ? prevBig[p] : to;
      prevBig[p] = to;
      if (Math.abs(to - from) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = inr(to); return; }
      var t0 = performance.now(), dur = 380;
      (function tick(t) {
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = inr(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  function renderBreakdown(list) {
    var ok = list.filter(function (x) { return x.r; });
    if (!ok.length) { $('#breakdown').innerHTML = ''; return; }
    var max = Math.max.apply(null, ok.map(function (x) { return x.r.price; }));
    var basePrice = ok[0].r.price;
    $('#bdTitle').textContent = ok.length === 1 || state.mode === 'profit' ? 'Where your ' + inr(basePrice) + ' goes' : 'Where each price goes';
    $('#legend').innerHTML = ok.length === 2 ? 'Per unit · <b style="color:#B45309">■</b> Amazon <b style="color:#2563EB;margin-left:6px">■</b> Flipkart' : 'Per order';
    var rows = [
      ['GST on sale', function (r) { return r.gstOut; }],
      ['Commission & fees', function (r) { return r.feeSum; }],
      ['Shipping', function (r) { return r.ship; }],
      ['Ads', function (r) { return r.ads; }],
      ['Returns & RTO', function (r) { return r.returnsShip + r.lost; }],
      ['Product cost', function (r) { return r.cost; }],
      ['GST not claimable', function (r) { return r.extraGst; }],
      ['Your profit', function (r) { return r.profit; }, true]
    ].filter(function (row) { return row[0] !== 'GST not claimable' || ok.some(function (x) { return x.r.extraGst > 0; }); });
    $('#breakdown').innerHTML = rows.map(function (row) {
      return '<div class="bd-row"><span>' + row[0] + '</span><div class="bars">' + ok.map(function (x) {
        var v = row[1](x.r), P = PLAT[x.p];
        var col = row[2] ? (v >= 0 ? '#22C55E' : '#EF4444') : P.bar;
        var w = Math.max(0.8, Math.min(100, Math.abs(v) / max * 100));
        return '<div class="bar-line"><div class="track"><div class="fill" style="width:' + w.toFixed(1) + '%;background:' + col + '"></div></div><em style="color:' + P.ink + '">' + inr(v) + '</em></div>';
      }).join('') + '</div></div>';
    }).join('');
  }

  // ---------- smart tips ----------
  function renderTips(list, inp) {
    var tips = [];
    var ok = list.filter(function (x) { return x.r; });
    if (!ok.length) { $('#tips').innerHTML = ''; return; }
    var u = inp.units || 0;
    var cw = C.chargeableWeight(inp);

    // 1. Volumetric weight costs more than actual weight
    if (inp.fulfilment !== 'self' && cw.volumetric > cw.actual + 0.001) {
      var smaller = Object.assign({}, inp, { l: 0, w: 0, h: 0 });
      var save = ok.map(function (x) { return x.r.ship - C.compute(x.p, x.r.price, smaller, F).ship; }).reduce(function (a, b) { return Math.max(a, b); }, 0);
      if (save > 0.5) tips.push('Your box is charged at <strong>' + fmtKg(cw.chargeable) + '</strong> (volumetric) instead of ' + fmtKg(cw.actual) + ' (actual). A box that fits the product snugly could save up to <strong>' + inr(save) + '</strong> per order' + (u ? ', about <strong>' + inr(save * u) + '</strong> a month' : '') + '.');
    }
    // 2. Just over a weight slab
    var slab = Math.floor(cw.chargeable / 0.5) * 0.5;
    if (inp.fulfilment !== 'self' && slab >= 0.5 && cw.chargeable - slab > 0 && cw.chargeable - slab <= 0.1) {
      var lighter = Object.assign({}, inp, { weight: slab, l: 0, w: 0, h: 0 });
      var s2 = ok.map(function (x) { return x.r.ship - C.compute(x.p, x.r.price, lighter, F).ship; }).reduce(function (a, b) { return Math.max(a, b); }, 0);
      if (s2 > 0.5) tips.push('You’re only <strong>' + Math.round((cw.chargeable - slab) * 1000) + ' g</strong> over the ' + fmtKg(slab) + ' slab. Lighter packaging could save <strong>' + inr(s2) + '</strong> per order.');
    }
    // 3. The ₹1,000 commission line
    if (state.mode === 'profit' && inp.price >= 1000 && inp.price <= 1200 && state.plat === 'af') {
      var gains = ok.map(function (x) { var r999 = C.compute(x.p, 999, inp, F); return { p: x.p, from: x.r.profit, to: r999.profit }; })
        .filter(function (g) { return g.to > g.from + 1; });
      if (gains.length) tips.push('Pricing at <strong>₹999</strong> instead of ' + inr(inp.price) + ' avoids the referral/commission fee. Profit goes ' + gains.map(function (g) { return 'from ' + inr(g.from) + ' to <strong>' + inr(g.to) + '</strong> on ' + PLAT[g.p].name; }).join(', and ') + '.');
    }
    // 4. Ads vs break-even
    ok.forEach(function (x) {
      if (x.p === 'meesho' || inp.ads <= 0) return;
      if (x.r.profit < 0 && x.r.beAcos < inp.ads) tips.push('On ' + PLAT[x.p].name + ', ads at ' + inp.ads + '% are above your break-even ACoS of <strong>' + pct(x.r.beAcos) + '</strong>. Every ad sale loses money until you cut ad spend or raise the price.');
    });
    if (state.plat === 'af' && ok[0] && ok[0].r.profit >= 0) tips.push('Keep Amazon ACoS under <strong>' + pct(ok[0].r.beAcos) + '</strong>' + (ok[1] && ok[1].r.beAcos > 0 ? ' and Flipkart ROI above <strong>' + (100 / ok[1].r.beAcos).toFixed(2) + 'x</strong>' : '') + '. Beyond that, ads cost more than the sale earns.');
    // 5. Returns
    var goal = state.plat === 'meesho' ? 10 : 5;
    if (inp.returns > goal) {
      var best = ok.map(function (x) { return { p: x.p, g: x.r.profit - C.compute(x.p, x.r.price, Object.assign({}, inp, { returns: goal }), F).profit }; })
        .sort(function (a, b) { return a.g - b.g; })[0];
      var g = -best.g;
      if (g > 0.5) tips.push('Cutting returns from ' + inp.returns + '% to ' + goal + '% adds <strong>' + inr(g) + '</strong> per order on ' + PLAT[best.p].name + (u ? ', about <strong>' + inr(g * u) + '</strong> a month' : '') + '. Clear size charts and real product photos are the fastest fix.');
    }
    // 6. GST registration
    if (!inp.gstRegistered) {
      var extra = ok.reduce(function (a, x) { return Math.max(a, x.r.extraGst); }, 0);
      if (extra > 0.5) tips.push('Because you’re not GST registered, you lose <strong>' + inr(extra) + '</strong> per order in GST on fees and ads. Registered sellers claim this back.');
    }
    // 7. Cash held
    tips.push('Platforms hold back about <strong>' + inr(ok[0].r.cashHeld) + '</strong> per order as TCS and TDS. It’s not a cost: you claim it back in your GST and income tax returns.');

    $('#tips').innerHTML = tips.slice(0, 4).map(function (t, i) { return '<li><b>0' + (i + 1) + '</b><span>' + t + '</span></li>'; }).join('');
  }

  function renderCross(inp) {
    var other = state.plat === 'meesho' ? ['amazon', 'flipkart'] : ['meesho'];
    var vals = other.map(function (p) {
      var price = state.mode === 'price' ? C.priceForMargin(p, inp.target, inp, F) : inp.price;
      var r = price ? C.compute(p, price, Object.assign({}, inp, { fulfilment: p === 'meesho' ? 'platform' : inp.fulfilment }), F) : null;
      return PLAT[p].name + ' <b style="color:' + PLAT[p].ink + '">' + (r ? (state.mode === 'price' ? inr(price) : inr(r.profit)) : '—') + '</b>';
    }).join(' · ');
    $('#cross').innerHTML = '<a href="#" data-goto="' + (state.plat === 'meesho' ? 'af' : 'meesho') + '"><span><b>' +
      (state.plat === 'meesho' ? 'See how this product does on Amazon &amp; Flipkart' : 'Selling on Meesho too? Check your Meesho profit') +
      '</b><small>Same product: ' + vals + (state.mode === 'price' ? ' price' : ' profit per unit') + '</small></span><i>' + (state.plat === 'meesho' ? 'Compare →' : 'Open Meesho →') + '</i></a>';
  }

  function renderSticky(list) {
    $('#stickyVals').innerHTML = list.map(function (x) {
      return '<span style="color:' + (x.p === 'amazon' ? '#FCD34D' : x.p === 'flipkart' ? '#93C5FD' : '#F0ABFC') + '">' + PLAT[x.p].name +
        '<b>' + (x.r ? (state.mode === 'price' ? inr(x.price) : inr(x.r.profit)) : '—') + '</b></span>';
    }).join('');
  }

  function renderWeightNote(inp) {
    var cw = C.chargeableWeight(inp), n = $('#weightNote');
    if (state.plat === 'af' && inp.fulfilment === 'self') { n.innerHTML = ''; return; }
    if (cw.volumetric > cw.actual + 0.001) n.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg><span>Charged on <b>' + fmtKg(cw.chargeable) + '</b>: volumetric weight (' + fmtKg(cw.volumetric) + ') is higher than actual (' + fmtKg(cw.actual) + ').</span>';
    else n.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg><span>Charged on <b>' + fmtKg(cw.chargeable) + '</b> actual weight. Volumetric weight is ' + fmtKg(cw.volumetric) + '.</span>';
  }
  function fmtKg(kg) { return (Math.round(kg * 100) / 100).toString() + ' kg'; }

  // ---------- fee structure tables ----------
  function tag(key) { var t = F.source[key] || 'estimate'; return '<span class="tag ' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</span>'; }
  function bandRows(table, fmt) {
    var lo = 0;
    return table.map(function (b) {
      var label = b[0] === Infinity ? 'Above ₹' + lo.toLocaleString('en-IN') : (lo === 0 ? 'Up to ₹' + b[0].toLocaleString('en-IN') : '₹' + (lo + 1).toLocaleString('en-IN') + '–' + b[0].toLocaleString('en-IN'));
      lo = b[0];
      return [label, fmt(b[1])];
    });
  }
  function shipRows(s, zones) {
    var f = function (v) { return Array.isArray(v) ? v.map(function (x) { return '₹' + x; }).join(' · ') : '₹' + v; };
    return [['Up to 500 g', f(s.first500)], ['500 g – 1 kg', f(s.upTo1kg)], ['Each extra 500 g', f(s.addl500)]];
  }
  function table(title, note, tagKey, rows) {
    return '<div class="ft"><div class="ft-h"><h3>' + title + tag(tagKey) + '</h3><small>' + note + '</small></div>' +
      rows.map(function (r) { return '<div class="ft-r"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>';
  }
  function renderFeeTables() {
    var t = state.ftab, html = '';
    var cats = F.categories;
    if (t === 'amazon') {
      html += table('Referral fee', 'Under ₹' + F.amazon.zeroUnder.toLocaleString('en-IN') + ': 0% in most categories', 'amazon.rate',
        [['Under ₹' + F.amazon.zeroUnder.toLocaleString('en-IN') + ' (from 16 Mar 2026)', '0% ' ]].concat(cats.map(function (c) { return [c.name + ' · ₹1,000+', c.aRate + '%']; })));
      html += table('Closing fee', 'Easy Ship · Self Ship · FBA, per order', 'amazon.closing',
        bandRows(F.amazon.closing.easy, function (v) { return '₹' + v; }).map(function (r, i) { return [r[0], r[1] + ' · ₹' + F.amazon.closing.self[Math.min(i, F.amazon.closing.self.length - 1)][1] + ' · ₹' + F.amazon.closing.fba[Math.min(i, F.amazon.closing.fba.length - 1)][1]]; }));
      html += table('Weight handling', 'Easy Ship · Local · Regional · National', 'amazon.ship', shipRows(F.amazon.ship).concat([['FBA pick & pack', '₹' + F.amazon.fbaPickPack], ['Reverse shipping', 'Same as forward']]));
    } else if (t === 'flipkart') {
      html += table('Commission', '0% under ₹' + F.flipkart.zeroUnder.toLocaleString('en-IN') + ' · fashion 0% at every price', 'flipkart.rate',
        [['Under ₹' + F.flipkart.zeroUnder.toLocaleString('en-IN'), '0%']].concat(cats.map(function (c) { return [c.name + ' · ₹1,000+', (c.fashion ? 0 : c.fRate) + '%']; })));
      html += table('Fixed and collection fee', 'Per order · varies by seller tier', 'flipkart.fixed',
        bandRows(F.flipkart.fixed, function (v) { return '₹' + v; }).map(function (r) { return ['Fixed fee · ' + r[0], r[1]]; })
          .concat([['Collection fee · prepaid', F.flipkart.collectionPrepaid + '%'], ['Collection fee · COD', F.flipkart.collectionCod + '%']]));
      html += table('Shipping', 'Local · Zonal · National', 'flipkart.ship', shipRows(F.flipkart.ship).concat([['Reverse shipping (return)', '₹' + F.flipkart.reverse], ['Flipkart fulfilment pick & pack', '₹' + F.flipkart.fbfPickPack]]));
    } else {
      html += table('Commission', 'All categories', 'meesho.commission', [['Platform commission', F.meesho.commission + '%'], ['Collection fee', '0%']]);
      html += table('Shipping', 'Deducted from your payout', 'meesho.ship', shipRows(F.meesho.ship));
      html += table('Returns', 'Per returned order', 'meesho.reverse', [['Return shipping', '₹' + F.meesho.reverse], ['Damaged or lost returns', 'Set with the slider']]);
    }
    html += '';
    $('#feeTables').innerHTML = html;
    $('#officialLink').href = F.links[t];
    $('#officialLink').textContent = PLAT[t].name + ' official fee page ↗';
    $$('[data-ftab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-ftab') === t)); });
  }

  // ---------- edit fees dialog ----------
  var EDIT = {
    amazon: [
      ['Referral fee', null],
      ['amazon.zeroUnder', '0% referral below', '₹', 'Price under which no referral fee applies'],
      ['Closing fee · Easy Ship', null],
      ['amazon.closing.easy.0.1', 'Up to ₹250', '₹'], ['amazon.closing.easy.1.1', '₹251–500', '₹'], ['amazon.closing.easy.2.1', '₹501–1,000', '₹'], ['amazon.closing.easy.3.1', 'Above ₹1,000', '₹'],
      ['Weight handling · National', null],
      ['amazon.ship.first500.2', 'Up to 500 g', '₹'], ['amazon.ship.upTo1kg.2', '500 g – 1 kg', '₹'], ['amazon.ship.addl500.2', 'Each extra 500 g', '₹'],
      ['Weight handling · Regional', null],
      ['amazon.ship.first500.1', 'Up to 500 g', '₹'], ['amazon.ship.upTo1kg.1', '500 g – 1 kg', '₹'], ['amazon.ship.addl500.1', 'Each extra 500 g', '₹'],
      ['Weight handling · Local', null],
      ['amazon.ship.first500.0', 'Up to 500 g', '₹'], ['amazon.ship.upTo1kg.0', '500 g – 1 kg', '₹'], ['amazon.ship.addl500.0', 'Each extra 500 g', '₹']
    ],
    flipkart: [
      ['Commission', null],
      ['flipkart.zeroUnder', '0% commission below', '₹', 'For eligible non-fashion products'],
      ['Fixed fee', null],
      ['flipkart.fixed.0.1', 'Up to ₹300', '₹'], ['flipkart.fixed.1.1', '₹301–500', '₹'], ['flipkart.fixed.2.1', '₹501–1,000', '₹'], ['flipkart.fixed.3.1', 'Above ₹1,000', '₹'],
      ['Collection fee', null],
      ['flipkart.collectionPrepaid', 'Prepaid orders', '%'], ['flipkart.collectionCod', 'COD orders', '%'],
      ['Shipping · National', null],
      ['flipkart.ship.first500.2', 'Up to 500 g', '₹'], ['flipkart.ship.upTo1kg.2', '500 g – 1 kg', '₹'], ['flipkart.ship.addl500.2', 'Each extra 500 g', '₹'],
      ['Shipping · Zonal', null],
      ['flipkart.ship.first500.1', 'Up to 500 g', '₹'], ['flipkart.ship.upTo1kg.1', '500 g – 1 kg', '₹'], ['flipkart.ship.addl500.1', 'Each extra 500 g', '₹'],
      ['Returns', null],
      ['flipkart.reverse', 'Reverse shipping per return', '₹']
    ],
    meesho: [
      ['Commission', null], ['meesho.commission', 'Platform commission', '%'],
      ['Shipping', null], ['meesho.ship.first500', 'Up to 500 g', '₹'], ['meesho.ship.upTo1kg', '500 g – 1 kg', '₹'], ['meesho.ship.addl500', 'Each extra 500 g', '₹'],
      ['Returns', null], ['meesho.reverse', 'Return shipping per order', '₹']
    ]
  };
  function renderFeeEdit() {
    var t = state.etab;
    var rateRows = F.categories.map(function (c, i) {
      return t === 'amazon' ? ['categories.' + i + '.aRate', c.name, '%', 'At ₹1,000 and above'] : (t === 'flipkart' && !c.fashion ? ['categories.' + i + '.fRate', c.name, '%', 'At ₹1,000 and above'] : null);
    }).filter(Boolean);
    var rows = EDIT[t].slice();
    if (rateRows.length) rows = rows.slice(0, 2).concat([[t === 'amazon' ? 'Referral fee by category' : 'Commission by category', null]], rateRows, rows.slice(2));
    $('#feeEdit').innerHTML = rows.map(function (r) {
      if (r[1] == null) return '<div class="fe-h">' + r[0] + '</div>';
      var v = getPath(F, r[0]);
      return '<label class="fe-r"><span>' + r[1] + (r[3] ? '<small>' + r[3] + '</small>' : '') + '</span><span class="in">' + (r[2] === '₹' ? '<b>₹</b>' : '') +
        '<input type="number" step="any" min="0" data-path="' + r[0] + '" value="' + v + '">' + (r[2] === '%' ? '<b>%</b>' : '') + '</span></label>';
    }).join('');
    $$('[data-etab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-etab') === t)); });
  }
  function collectEdits() {
    var o = lsGet(LS_FEES) || {};
    $$('#feeEdit input[data-path]').forEach(function (inp) {
      var v = parseFloat(inp.value), path = inp.getAttribute('data-path');
      if (isNaN(v)) return;
      var d = getPath(DEF, path);
      if (d === v) delete o[path]; else o[path] = v;
    });
    return o;
  }

  // ---------- share / save / export ----------
  var KEYS = { price: 'price', target: 'target', cost: 'cost', category: 'cat', gst: 'gst', weight: 'wt', l: 'l', w: 'w', h: 'h', zone: 'zone', fulfilment: 'ful', selfShip: 'ship', cod: 'cod', ads: 'ads', returns: 'ret', lost: 'lost', units: 'units' };
  function writeHash(inp) {
    var q = ['m=' + state.mode, 'pl=' + state.plat];
    Object.keys(KEYS).forEach(function (k) { if (form.elements[k]) q.push(KEYS[k] + '=' + encodeURIComponent(form.elements[k].value)); });
    q.push('reg=' + (inp.gstRegistered ? 1 : 0));
    var h = '#' + q.join('&');
    if (location.hash !== h) try { history.replaceState(null, '', h); } catch (e) {}
  }
  function readHash(h) {
    if (!h || h.length < 3) return false;
    var p = {};
    h.replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (!p.m && !p.price) return false;
    applyParams(p);
    return true;
  }
  function applyParams(p) {
    if (p.m === 'price' || p.m === 'profit') state.mode = p.m;
    if (p.pl === 'af' || p.pl === 'meesho') state.plat = p.pl;
    Object.keys(KEYS).forEach(function (k) { var v = p[KEYS[k]]; if (v != null && form.elements[k]) form.elements[k].value = v; });
    if (p.reg != null) form.elements.gstRegistered.checked = p.reg === '1';
  }
  function snapshot() { var o = {}; Object.keys(KEYS).forEach(function (k) { o[KEYS[k]] = form.elements[k].value; }); o.m = state.mode; o.pl = state.plat; o.reg = form.elements.gstRegistered.checked ? '1' : '0'; return o; }

  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2200); }

  function renderSaved() {
    var list = lsGet(LS_SAVED) || [];
    $('#saved').hidden = !list.length;
    $('#savedList').innerHTML = list.map(function (s, i) {
      return '<li><span>' + esc(s.name) + '</span><span><button type="button" data-load="' + i + '">Load</button><button type="button" class="del" data-del="' + i + '" aria-label="Delete ' + esc(s.name) + '">Delete</button></span></li>';
    }).join('');
  }

  function csv() {
    var L = window.__psLast; if (!L) return;
    var rows = [['Item'].concat(L.list.map(function (x) { return PLAT[x.p].name; }))];
    var add = function (label, f) { rows.push([label].concat(L.list.map(function (x) { return x.r ? f(x) : ''; }))); };
    add('Selling price', function (x) { return x.r.price.toFixed(2); });
    add('GST on sale', function (x) { return x.r.gstOut.toFixed(2); });
    var labels = {};
    L.list.forEach(function (x) { if (x.r) x.r.feeLines.forEach(function (l) { labels[l.label] = 1; }); });
    Object.keys(labels).forEach(function (lab) { add(lab, function (x) { var l = x.r.feeLines.filter(function (q) { return q.label === lab; })[0]; return l ? l.amount.toFixed(2) : '0'; }); });
    add('Ads', function (x) { return x.r.ads.toFixed(2); });
    add('Returns & RTO', function (x) { return (x.r.returnsShip + x.r.lost).toFixed(2); });
    add('Product cost', function (x) { return x.r.cost.toFixed(2); });
    add('GST not claimable', function (x) { return x.r.extraGst.toFixed(2); });
    add('Profit per unit', function (x) { return x.r.profit.toFixed(2); });
    add('Margin %', function (x) { return x.r.margin.toFixed(2); });
    add('Break-even price', function (x) { return x.be || ''; });
    add('Profit per month', function (x) { return (x.r.profit * L.inp.units).toFixed(2); });
    rows.push([]); rows.push(['Created with tools.princesharma.in/profit-calculator · fees verified ' + F.VERIFIED]);
    var text = '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'profit-calculation.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Downloaded. Opens in Excel or Google Sheets.');
  }

  function printPdf() {
    var L = window.__psLast; if (!L) return;
    var head = $('.print-head') || document.createElement('div');
    head.className = 'print-head';
    var cat = C.category(F, L.inp.category).name;
    head.innerHTML = '<b>Profit calculation</b> · ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
      '<br>' + cat + ' · cost ' + inr(L.inp.cost) + ' · ' + L.inp.gst + '% GST · ' + fmtKg(C.chargeableWeight(L.inp).chargeable) + ' · ' + C.zoneName(L.inp.zone) + ' · ads ' + L.inp.ads + '% · returns ' + L.inp.returns + '%' +
      '<br>tools.princesharma.in/profit-calculator · fees verified ' + F.VERIFIED;
    $('#results').prepend(head);
    window.print();
  }

  // ---------- events ----------
  function bind() {
    form.addEventListener('input', run);
    form.addEventListener('change', run);
    $$('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { state.mode = b.getAttribute('data-mode'); syncTabs(); run(); }); });
    $$('[data-plat]').forEach(function (b) { b.addEventListener('click', function () { state.plat = b.getAttribute('data-plat'); prevBig = {}; syncTabs(); run(); }); });
    $('#results').addEventListener('click', function (e) {
      var t = e.target.closest('[data-toggle]');
      if (t) { var p = t.getAttribute('data-toggle'); state.open[p] = !state.open[p]; run(); return; }
      var g = e.target.closest('[data-goto]');
      if (g) { e.preventDefault(); state.plat = g.getAttribute('data-goto'); prevBig = {}; syncTabs(); run(); window.scrollTo({ top: $('.bar').getBoundingClientRect().top + scrollY - 16, behavior: 'smooth' }); return; }
      var ld = e.target.closest('[data-load]');
      if (ld) { var s = (lsGet(LS_SAVED) || [])[+ld.getAttribute('data-load')]; if (s) { applyParams(s.params); syncTabs(); run(); toast('Loaded “' + s.name + '”'); } return; }
      var dl = e.target.closest('[data-del]');
      if (dl) { var list = lsGet(LS_SAVED) || []; list.splice(+dl.getAttribute('data-del'), 1); lsSet(LS_SAVED, list); renderSaved(); }
    });
    $('#feesToggle').addEventListener('click', function () {
      var body = $('#feesBody'), open = body.hidden;
      body.hidden = !open; this.setAttribute('aria-expanded', String(open));
      this.textContent = open ? 'Hide fee structure ▴' : 'View fee structure ▾';
      if (open) renderFeeTables();
    });
    $$('[data-ftab]').forEach(function (b) { b.addEventListener('click', function () { state.ftab = b.getAttribute('data-ftab'); renderFeeTables(); }); });
    var dlg = $('#feeDialog');
    $('#editFeesBtn').addEventListener('click', function () { state.etab = state.ftab; renderFeeEdit(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); });
    $$('[data-etab]').forEach(function (b) { b.addEventListener('click', function () { lsSet(LS_FEES, collectEdits()); loadFees(); state.etab = b.getAttribute('data-etab'); renderFeeEdit(); }); });
    $('#applyFees').addEventListener('click', function (e) {
      e.preventDefault();
      if (!lsSet(LS_FEES, collectEdits())) toast('Couldn’t save on this device. Fees apply until you leave.');
      var o = collectEdits(); loadFees(); applyOverrides(F, o);
      dlg.close ? dlg.close() : dlg.removeAttribute('open');
      renderFeeTables(); run(); toast('Fees updated');
    });
    $('#resetFees').addEventListener('click', function () { try { localStorage.removeItem(LS_FEES); } catch (e) {} loadFees(); renderFeeEdit(); renderFeeTables(); run(); toast('Fees reset to defaults'); });
    $('#saveBtn').addEventListener('click', function () {
      var inp = readInputs(), cat = C.category(F, inp.category).name;
      var name = window.prompt('Name this product', cat + ' · ' + (state.mode === 'price' ? inp.target + '% target' : inr(inp.price)));
      if (!name) return;
      var list = lsGet(LS_SAVED) || [];
      list.unshift({ name: name.slice(0, 60), params: snapshot(), at: Date.now() });
      if (!lsSet(LS_SAVED, list.slice(0, 20))) { toast('Couldn’t save on this device'); return; }
      renderSaved(); toast('Saved “' + name.slice(0, 40) + '”');
    });
    $('#shareBtn').addEventListener('click', function () {
      var url = location.href;
      if (navigator.share && matchMedia('(max-width: 900px)').matches) { navigator.share({ title: 'My marketplace profit calculation', url: url }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied. Anyone with it sees your numbers.'); }, function () { window.prompt('Copy this link', url); });
    });
    $('#csvBtn').addEventListener('click', csv);
    $('#pdfBtn').addEventListener('click', printPdf);
    // hide the mobile sticky bar while the results are on screen
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { $('#sticky').classList.toggle('hide', es[0].isIntersecting); }, { threshold: 0.15 });
      io.observe($('#cards'));
    }
  }
  function syncTabs() {
    $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === state.mode)); });
    $$('[data-plat]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-plat') === state.plat)); });
  }

  // ---------- init ----------
  loadFees();
  form.elements.category.innerHTML = F.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  $$('[data-verified]').forEach(function (el) { el.textContent = F.VERIFIED; });
  readHash(location.hash);
  syncTabs(); bind(); renderSaved(); run();
})();
