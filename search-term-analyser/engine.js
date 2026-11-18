/* Search term report analyser engine (Amazon + Flipkart).
   Pure functions: no DOM. Works in the browser (window.STA) and in Node (module.exports). */
(function (root) {
  'use strict';

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cell = '', q = false, i = 0, c, n = text.length;
    for (; i < n; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  /* ---------- helpers ---------- */
  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
    var x = parseFloat(s);
    return isFinite(x) ? x : 0;
  }
  function pick(map, names) {
    for (var i = 0; i < names.length; i++) if (map[names[i]] != null) return map[names[i]];
    return null;
  }
  function findCol(map, test) {
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) if (test(keys[i])) return map[keys[i]];
    return null;
  }

  /* ---------- detect + normalise ---------- */
  function detect(rows) {
    for (var i = 0; i < Math.min(rows.length, 25); i++) {
      var keys = rows[i].map(norm);
      var has = function (k) { return keys.indexOf(k) !== -1; };
      if (has('query') && (has('sumcost') || has('views') || has('directunitssold'))) return { platform: 'flipkart', header: i };
      if (has('customersearchterm')) return { platform: 'amazon', header: i };
      if (has('searchterm') && (has('clicks') || has('spend'))) return { platform: 'amazon', header: i };
    }
    return null;
  }

  function readMeta(rows, upto) {
    var meta = {};
    for (var i = 0; i < upto; i++) {
      var k = norm(rows[i][0]), v = String(rows[i][1] || '').trim();
      if (k === 'starttime' || k === 'startdate') meta.start = v.slice(0, 10);
      if (k === 'endtime' || k === 'enddate') meta.end = v.slice(0, 10);
    }
    return meta;
  }

  /* rows: array of arrays (from CSV or a spreadsheet). Returns a normalised report. */
  function normalise(rows) {
    var d = detect(rows);
    if (!d) throw new Error('NOT_A_REPORT');
    var head = rows[d.header], map = {};
    head.forEach(function (h, i) { var k = norm(h); if (k && map[k] == null) map[k] = i; });
    var meta = readMeta(rows, d.header);
    var cur = /\(inr\)|₹|inr/i.test(head.join(' ')) || d.platform === 'flipkart' ? '₹' : (/\(\$\)|usd/i.test(head.join(' ')) ? '$' : '₹');
    var C;
    if (d.platform === 'flipkart') {
      C = {
        term: pick(map, ['query', 'searchterm']),
        campaign: pick(map, ['campaignname']),
        adgroup: pick(map, ['adgroupname']),
        impressions: pick(map, ['views', 'impressions']),
        clicks: pick(map, ['clicks']),
        spend: pick(map, ['sumcost', 'cost', 'spend', 'adspend']),
        dUnits: pick(map, ['directunitssold']), iUnits: pick(map, ['indirectunitssold']),
        dRev: pick(map, ['directrevenue']), iRev: pick(map, ['indirectrevenue'])
      };
    } else {
      C = {
        term: pick(map, ['customersearchterm', 'searchterm']),
        campaign: pick(map, ['campaignname', 'campaign']),
        adgroup: pick(map, ['adgroupname', 'adgroup']),
        target: pick(map, ['targeting', 'keywords', 'keyword', 'matchedtarget']),
        match: pick(map, ['matchtype']),
        addedAs: pick(map, ['addedas']),
        impressions: pick(map, ['impressions']),
        clicks: pick(map, ['clicks']),
        spend: pick(map, ['totalcostinr', 'spend', 'totalcost', 'cost']) ,
        orders: pick(map, ['purchases', '7daytotalorders', '14daytotalorders', '30daytotalorders', 'orders', 'totalorders']),
        sales: pick(map, ['salesinr', '7daytotalsales', '14daytotalsales', '30daytotalsales', 'sales', 'totalsales']),
        start: pick(map, ['startdate', 'date']), end: pick(map, ['enddate'])
      };
      if (C.spend == null) C.spend = findCol(map, function (k) { return /^(totalcost|spend|cost)/.test(k); });
      if (C.orders == null) C.orders = findCol(map, function (k) { return /totalorders|purchases/.test(k); });
      if (C.sales == null) C.sales = findCol(map, function (k) { return /totalsales|^sales/.test(k); });
    }
    if (C.term == null || C.clicks == null || C.spend == null) throw new Error('MISSING_COLUMNS');
    var get = function (r, i) { return i == null ? '' : r[i]; };
    var out = [], starts = [], ends = [];
    for (var i = d.header + 1; i < rows.length; i++) {
      var r = rows[i], term = String(get(r, C.term) || '').trim();
      if (!term || /^total/i.test(term) && !num(get(r, C.clicks)) && i === rows.length - 1) continue;
      if (!term) continue;
      var x = {
        term: term,
        campaign: String(get(r, C.campaign) || '').trim(),
        adgroup: String(get(r, C.adgroup) || '').trim(),
        target: String(get(r, C.target) || '').trim(),
        match: String(get(r, C.match) || '').trim(),
        addedAs: String(get(r, C.addedAs) || '').trim(),
        impressions: num(get(r, C.impressions)),
        clicks: num(get(r, C.clicks)),
        spend: num(get(r, C.spend))
      };
      if (d.platform === 'flipkart') {
        x.directOrders = num(get(r, C.dUnits)); x.indirectOrders = num(get(r, C.iUnits));
        x.directSales = num(get(r, C.dRev)); x.indirectSales = num(get(r, C.iRev));
        x.orders = x.directOrders + x.indirectOrders;
        x.sales = x.directSales + x.indirectSales;
      } else {
        x.orders = num(get(r, C.orders)); x.sales = num(get(r, C.sales));
        if (C.start != null && get(r, C.start)) starts.push(String(get(r, C.start)));
        if (C.end != null && get(r, C.end)) ends.push(String(get(r, C.end)));
      }
      out.push(x);
    }
    if (!meta.start && starts.length) meta.start = toISO(starts.sort()[0]);
    if (!meta.end && ends.length) meta.end = toISO(ends.sort()[ends.length - 1]);
    return { platform: d.platform, currency: cur, start: meta.start || '', end: meta.end || '', rows: merge(out, d.platform), rawRows: out.length };
  }

  function toISO(s) {
    var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    var t = Date.parse(s); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
  }

  /* Merge rows of the same search term (case-insensitive) within a campaign + ad group. */
  function merge(rows, platform) {
    var by = {}, list = [];
    rows.forEach(function (x) {
      var key = x.term.toLowerCase().replace(/\s+/g, ' ') + '|' + x.campaign.toLowerCase() + '|' + x.adgroup.toLowerCase();
      var m = by[key];
      if (!m) {
        m = by[key] = {
          term: x.term.replace(/\s+/g, ' ').trim(), campaign: x.campaign, adgroup: x.adgroup,
          targets: [], added: '', impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0,
          directOrders: 0, indirectOrders: 0, directSales: 0, indirectSales: 0, variants: 0
        };
        list.push(m);
      }
      m.variants++;
      if (x.term === x.term.toLowerCase() && m.term !== m.term.toLowerCase()) m.term = x.term;
      if (x.target && m.targets.indexOf(x.target) === -1) m.targets.push(x.target);
      if (x.match && m.targets.indexOf(x.match) === -1 && !x.target) m.targets.push(x.match);
      if (x.addedAs) m.added = /neg/i.test(x.addedAs) ? 'negative' : (m.added || 'keyword');
      ['impressions', 'clicks', 'spend', 'orders', 'sales', 'directOrders', 'indirectOrders', 'directSales', 'indirectSales'].forEach(function (k) { m[k] += x[k] || 0; });
    });
    list.forEach(function (m) {
      m.isAsin = /^b0[a-z0-9]{8}$/i.test(m.term);
      m.where = m.campaign ? m.campaign + (m.adgroup ? ' · ' + m.adgroup : '') : (m.targets.length ? prettyTarget(m.targets[0]) + (m.targets.length > 1 ? ' +' + (m.targets.length - 1) : '') : '');
    });
    return list;
  }
  function prettyTarget(t) {
    var m = String(t).match(/keyword-group="?([^"]+)"?/i);
    if (m) return 'Auto: ' + m[1].toLowerCase().replace(/^keywords /, '');
    if (/^(close-match|loose-match|substitutes|complements)$/i.test(t)) return 'Auto: ' + t.toLowerCase();
    if (/^asin=/i.test(t)) return 'Product: ' + t.replace(/^asin="?|"$/gi, '').toUpperCase();
    return 'Keyword: ' + t;
  }

  /* ---------- analysis ---------- */
  /* opts: { targetAcos, beAcos, minClicks, minOrders } (ACoS in %) */
  function suggestMinClicks(rows) {
    var c = 0, o = 0;
    rows.forEach(function (r) { c += r.clicks; o += r.orders; });
    if (!o) return { minClicks: 15, clicksPerOrder: null };
    var cpo = c / o;
    return { minClicks: Math.max(5, Math.min(60, Math.round(cpo * 1.5))), clicksPerOrder: cpo };
  }

  function classify(r, o) {
    var acos = r.sales > 0 ? r.spend / r.sales * 100 : null;
    r.acos = acos; r.roi = r.spend > 0 ? r.sales / r.spend : null; r.cpc = r.clicks ? r.spend / r.clicks : 0;
    if (!r.clicks && !r.spend && !r.orders) r.verdict = 'idle';
    else if (r.orders === 0 && r.clicks >= o.minClicks) r.verdict = 'wasted';
    else if (r.orders > 0 && acos > o.beAcos) r.verdict = 'bleeding';
    else if (r.orders >= (o.minOrders || 2) && acos <= o.targetAcos) r.verdict = 'winner';
    else r.verdict = 'watch';
    r.handled = (r.verdict === 'wasted' && r.added === 'negative') || (r.verdict === 'winner' && r.added === 'keyword');
    return r;
  }

  var STOP = {};
  'a an and the for of in on to with by from at or is are my me i you your new best buy online price rs inr under above below less than set pack pcs piece pieces combo'.split(' ').forEach(function (w) { STOP[w] = 1; });

  function words(rows, o, limit) {
    var W = {};
    rows.forEach(function (r) {
      if (!r.clicks) return;
      var seen = {};
      r.term.toLowerCase().split(/[^a-z0-9ऀ-ॿ]+/).forEach(function (w) {
        if (w.length < 3 || STOP[w] || /^\d+$/.test(w) || /^b0[a-z0-9]{8}$/.test(w) || seen[w]) return;
        seen[w] = 1;
        var x = W[w] || (W[w] = { word: w, spend: 0, orders: 0, sales: 0, clicks: 0, terms: 0 });
        x.spend += r.spend; x.orders += r.orders; x.sales += r.sales; x.clicks += r.clicks; x.terms++;
      });
    });
    var total = rows.reduce(function (a, r) { return a + r.spend; }, 0) || 1;
    return Object.keys(W).map(function (k) { return W[k]; }).filter(function (w) {
      if (w.terms < 2) return false;
      if (w.spend / total > 0.5) return false;           /* the product's own name, e.g. "football" */
      if (w.orders === 0) return w.clicks >= Math.max(3, Math.round(o.minClicks * 0.6));
      return w.spend / w.sales * 100 > o.beAcos && w.clicks >= o.minClicks;
    }).map(function (w) {
      w.acos = w.sales ? w.spend / w.sales * 100 : null;
      w.verdict = w.orders === 0 ? 'negative' : 'lower';
      return w;
    }).sort(function (a, b) { return b.spend - a.spend; }).slice(0, limit || 8);
  }

  function analyse(report, o) {
    var rows = report.rows.map(function (r) { return classify(r, o); });
    var sum = function (list, k) { return list.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };
    var groups = { winner: [], watch: [], bleeding: [], wasted: [] };
    rows.forEach(function (r) { if (groups[r.verdict]) groups[r.verdict].push(r); });
    Object.keys(groups).forEach(function (k) { groups[k].sort(function (a, b) { return b.spend - a.spend || b.clicks - a.clicks; }); });
    var t = {
      spend: sum(rows, 'spend'), sales: sum(rows, 'sales'), orders: sum(rows, 'orders'), clicks: sum(rows, 'clicks'), impressions: sum(rows, 'impressions'),
      directSales: sum(rows, 'directSales'), indirectSales: sum(rows, 'indirectSales'), directOrders: sum(rows, 'directOrders'), indirectOrders: sum(rows, 'indirectOrders')
    };
    t.acos = t.sales ? t.spend / t.sales * 100 : null; t.roi = t.spend ? t.sales / t.spend : null;
    var split = {};
    Object.keys(groups).forEach(function (k) { split[k] = { spend: sum(groups[k], 'spend'), sales: sum(groups[k], 'sales'), count: groups[k].length }; });
    return {
      rows: rows, groups: groups, totals: t, split: split,
      words: words(rows, o, 8),
      withClicks: rows.filter(function (r) { return r.clicks > 0 || r.spend > 0; }).length
    };
  }

  /* Suggested bid for an exact-match winner: scale today's CPC toward the target ACoS, within ±50%. */
  function suggestBid(r, targetAcos) {
    if (!r.cpc || !r.acos) return r.cpc || 0;
    var b = r.cpc * (targetAcos / r.acos);
    return Math.max(r.cpc * 0.5, Math.min(r.cpc * 1.5, b));
  }

  /* ---------- exports ---------- */
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }

  function exportNegatives(a, platform) {
    var list = a.groups.wasted.filter(function (r) { return !r.handled; });
    if (platform === 'flipkart') return toCSV([['Campaign Name', 'Negative Keyword', 'Clicks', 'Spend', 'Orders']].concat(list.map(function (r) { return [r.campaign, r.term, r.clicks, r.spend.toFixed(2), r.orders]; })));
    return toCSV([['Campaign Name', 'Ad Group Name', 'Keyword or Product Targeting', 'Match Type', 'Clicks', 'Spend']].concat(list.map(function (r) {
      return [r.campaign, r.adgroup, r.isAsin ? 'asin="' + r.term.toUpperCase() + '"' : r.term, r.isAsin ? 'Negative product targeting' : 'Negative exact', r.clicks, r.spend.toFixed(2)];
    })));
  }
  function exportWords(a) {
    return toCSV([['Word', 'Suggested match type', 'Search terms', 'Clicks', 'Spend', 'Orders']].concat(a.words.map(function (w) {
      return [w.word, w.verdict === 'negative' ? 'Negative phrase' : 'Review bids', w.terms, w.clicks, w.spend.toFixed(2), w.orders];
    })));
  }
  function exportHarvest(a, o, platform) {
    var list = a.groups.winner.filter(function (r) { return !r.handled && !r.isAsin; });
    return toCSV([['Campaign Name', 'Ad Group Name', 'Keyword', 'Match Type', 'Suggested Bid', 'Orders', 'Sales', platform === 'flipkart' ? 'ROI' : 'ACoS %']].concat(list.map(function (r) {
      return [r.campaign, r.adgroup, r.term, 'Exact', suggestBid(r, o.targetAcos).toFixed(2), r.orders, r.sales.toFixed(2), platform === 'flipkart' ? r.roi.toFixed(2) : r.acos.toFixed(1)];
    })));
  }
  function exportAll(a, platform) {
    var label = { winner: 'Winner', watch: 'Watch', bleeding: 'Bleeding', wasted: 'Wasted' };
    var head = ['Search term', 'Campaign', 'Ad group', 'Matched target', 'Impressions', 'Clicks', 'Spend', 'Orders', 'Sales', 'CPC', 'ACoS %', 'ROAS / ROI', 'Verdict', 'Already in account'];
    if (platform === 'flipkart') head.splice(9, 0, 'Direct sales', 'Indirect sales');
    return toCSV([head].concat(a.rows.filter(function (r) { return r.clicks > 0 || r.spend > 0; }).sort(function (x, y) { return y.spend - x.spend; }).map(function (r) {
      var row = [r.term, r.campaign, r.adgroup, r.targets.join(' | '), r.impressions, r.clicks, r.spend.toFixed(2), r.orders, r.sales.toFixed(2)];
      if (platform === 'flipkart') row.push(r.directSales.toFixed(2), r.indirectSales.toFixed(2));
      row.push(r.cpc.toFixed(2), r.acos == null ? '' : r.acos.toFixed(1), r.roi == null ? '' : r.roi.toFixed(2), label[r.verdict], r.added || '');
      return row;
    })));
  }

  var API = { parseCSV: parseCSV, normalise: normalise, analyse: analyse, suggestMinClicks: suggestMinClicks, suggestBid: suggestBid,
    exportNegatives: exportNegatives, exportWords: exportWords, exportHarvest: exportHarvest, exportAll: exportAll, num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.STA = API;
})(this);
