/* Search term analyser UI. Depends on engine.js (window.STA) and samples.js. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PNAME = { amazon: 'Amazon', flipkart: 'Flipkart' };
  var DEF = { amazon: { target: 30, be: 40, minClicks: 15, auto: true }, flipkart: { target: 4, be: 2.5, minClicks: 15, auto: true } };
  var store = (function () { try { return JSON.parse(localStorage.getItem('sta.v1') || '{}'); } catch (e) { return {}; } })();
  var S = {
    platform: store.platform === 'flipkart' ? 'flipkart' : 'amazon',
    set: { amazon: Object.assign({}, DEF.amazon, store.amazon || {}), flipkart: Object.assign({}, DEF.flipkart, store.flipkart || {}) },
    report: null, fileName: '', isSample: false, a: null, tab: 'wasted', q: '', limit: 50, cpo: null
  };
  function save() { try { localStorage.setItem('sta.v1', JSON.stringify({ platform: S.platform, amazon: S.set.amazon, flipkart: S.set.flipkart })); } catch (e) {} }

  function pageSize() { return window.innerWidth < 768 ? 15 : 50; }
  /* ---------- formatting ---------- */
  var cur = function () { return S.report ? S.report.currency : '₹'; };
  function money(v) {
    var a = Math.abs(v), s = a >= 100 ? Math.round(a).toLocaleString('en-IN') : a.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return (v < 0 ? '−' : '') + cur() + s;
  }
  var int = function (v) { return Math.round(v).toLocaleString('en-IN'); };
  var pct = function (v) { return v == null ? '—' : v.toFixed(1) + '%'; };
  var x2 = function (v) { return v == null ? '—' : v.toFixed(2) + 'x'; };
  function niceDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2400); }

  /* ---------- rules (stored in each platform's own units) ---------- */
  var isFk = function () { return S.platform === 'flipkart'; };
  function opts() {
    var s = S.set[S.platform];
    var o = isFk() ? { targetAcos: 100 / s.target, beAcos: 100 / s.be } : { targetAcos: s.target, beAcos: s.be };
    o.minClicks = s.auto && S.cpo ? autoClicks() : s.minClicks;
    o.minOrders = 2;
    return o;
  }
  function autoClicks() { return Math.max(5, Math.min(60, Math.round(S.cpo * 1.5))); }
  function ruleDefs() {
    var s = S.set[S.platform];
    return isFk() ? [
      { k: 'target', label: 'Target ROI', val: s.target.toFixed(1) + 'x', min: 1, max: 15, step: 0.5, help: 'Terms at or above this are winners to scale.' },
      { k: 'be', label: 'Break-even ROI', val: s.be.toFixed(1) + 'x', min: 1, max: 10, step: 0.5, help: 'Below this, every ad sale loses money.' }
    ] : [
      { k: 'target', label: 'Target ACoS', val: s.target + '%', min: 5, max: 80, step: 1, help: 'Terms at or under this are winners to scale.' },
      { k: 'be', label: 'Break-even ACoS', val: s.be + '%', min: 5, max: 100, step: 1, help: 'Above this, every ad sale loses money.' }
    ];
  }
  function clicksVal() { var s = S.set[S.platform]; return s.auto && S.cpo ? autoClicks() : s.minClicks; }
  function renderRules() {
    var s = S.set[S.platform], defs = ruleDefs();
    var full = defs.map(function (d) {
      return '<label class="sl"><span><span>' + d.label + '</span><b data-v="' + d.k + '">' + d.val + '</b></span>' +
        '<input type="range" data-k="' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + s[d.k] + '" aria-label="' + d.label + '"><small>' + d.help + '</small></label>';
    }).join('') +
      '<div class="sl"><span><label for="mc1">Clicks with no order before a term is “wasted”</label></span>' +
      '<div class="auto"><span class="in"><input id="mc1" type="number" inputmode="numeric" min="1" max="500" data-k="minClicks" value="' + clicksVal() + '"><b>clicks</b></span>' +
      '<button type="button" data-auto aria-pressed="' + !!s.auto + '">Auto</button></div><small data-cpo>' + cpoText() + '</small></div>';
    $('[data-rules]').innerHTML = full;
    $('[data-rules-compact]').innerHTML = defs.map(function (d) {
      return '<label class="sl"><span><span>' + d.label + '</span><b data-v="' + d.k + '">' + d.val + '</b></span><input type="range" data-k="' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + s[d.k] + '" aria-label="' + d.label + '"></label>';
    }).join('') + '<label class="sl"><span><span>Wasted after</span><b data-v="minClicks">' + clicksVal() + ' clicks</b></span><input type="range" data-k="minClicks" min="3" max="80" step="1" value="' + clicksVal() + '" aria-label="Clicks before a term is wasted"></label>';
    $('#rulesNote').textContent = isFk()
      ? 'Not sure? Many Flipkart sellers aim for 4x ROI or more. Leave clicks on Auto.'
      : 'Not sure? Most sellers start with a target ACoS of 25–30%. Leave clicks on Auto.';
  }
  function cpoText() {
    if (!S.cpo) return 'Auto sets this from your report: 1.5× the clicks you usually need for one order.';
    return 'Your account gets 1 order every ~' + Math.round(S.cpo) + ' clicks.' + (S.set[S.platform].auto ? ' Auto uses 1.5× that.' : '');
  }
  function syncRuleLabels() {
    var s = S.set[S.platform], defs = ruleDefs();
    defs.forEach(function (d) { $$('[data-v="' + d.k + '"]').forEach(function (el) { el.textContent = d.val; }); $$('input[data-k="' + d.k + '"]').forEach(function (el) { if (document.activeElement !== el) el.value = s[d.k]; }); });
    var mc = clicksVal();
    $$('[data-v="minClicks"]').forEach(function (el) { el.textContent = mc + ' clicks'; });
    $$('input[data-k="minClicks"]').forEach(function (el) { if (document.activeElement !== el) el.value = mc; });
    var ab = $('[data-auto]'); if (ab) ab.setAttribute('aria-pressed', !!s.auto);
    var c = $('[data-cpo]'); if (c) c.textContent = cpoText();
  }
  document.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (!k) return;
    var s = S.set[S.platform], v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    if (k === 'minClicks') { s.minClicks = Math.max(1, Math.round(v)); s.auto = false; }
    else s[k] = v;
    save(); syncRuleLabels(); if (S.report) analyse();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-auto]');
    if (!b) return;
    var s = S.set[S.platform]; s.auto = !s.auto; save(); syncRuleLabels(); if (S.report) analyse();
  });

  /* ---------- platform switch ---------- */
  function setPlatform(p, silent) {
    S.platform = p; save();
    $$('[data-plat]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-plat') === p)); });
    $$('[data-pname]').forEach(function (el) { el.textContent = PNAME[p]; });
    $$('[data-how]').forEach(function (el) { el.hidden = el.getAttribute('data-how') !== p; });
    renderRules();
    if (!silent && S.report && S.report.platform !== p) resetReport();
  }
  $$('[data-plat]').forEach(function (b) { b.addEventListener('click', function () { setPlatform(b.getAttribute('data-plat')); }); });

  /* ---------- file loading ---------- */
  var drop = $('#drop'), fileIn = $('#file');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('over'); }); });
  fileIn.addEventListener('change', function () { var f = fileIn.files && fileIn.files[0]; if (f) readFile(f); });

  function showErr(msg) { var e = $('#err'); e.textContent = msg; e.hidden = !msg; }
  function readFile(f) {
    showErr('');
    $('#dropTitle').textContent = 'Reading ' + f.name + '…';
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var fr = new FileReader();
    if (ext === 'xlsx' || ext === 'xls') {
      fr.onload = function () {
        loadXLSX(function (ok) {
          if (!ok) return fail('Could not open the Excel reader. Check your connection, or export the report as .csv instead.');
          try {
            var wb = window.XLSX.read(new Uint8Array(fr.result), { type: 'array' });
            var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
            load(rows, f.name, false);
          } catch (err) { fail(errText(err)); }
        });
      };
      fr.readAsArrayBuffer(f);
    } else {
      fr.onload = function () { try { load(STA.parseCSV(String(fr.result)), f.name, false); } catch (err) { fail(errText(err)); } };
      fr.readAsText(f);
    }
  }
  function loadXLSX(cb) {
    if (window.XLSX) return cb(true);
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = function () { cb(!!window.XLSX); }; s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function errText(err) {
    var m = err && err.message;
    if (m === 'NOT_A_REPORT') return 'This doesn’t look like a search term report. Amazon’s has a “Customer search term” column and Flipkart’s has a “Query” column.';
    if (m === 'MISSING_COLUMNS') return 'We found the search terms, but not the clicks or spend columns. Please download the full search term report and try again.';
    return 'Sorry, this file couldn’t be read. Try exporting it again as .csv.';
  }
  function fail(msg) { resetDrop(); showErr(msg); }
  function resetDrop() { drop.classList.remove('done'); $('#dropTitle').textContent = 'Drop your report here'; $('#dropSub').textContent = '.csv or .xlsx · we detect Amazon or Flipkart automatically'; }

  function load(rows, name, sample) {
    var rep = STA.normalise(rows);
    if (!rep.rows.length) throw new Error('MISSING_COLUMNS');
    S.report = rep; S.fileName = name; S.isSample = sample; S.tab = 'wasted'; S.q = ''; S.limit = pageSize();
    S.cpo = STA.suggestMinClicks(rep.rows).clicksPerOrder;
    setPlatform(rep.platform, true);
    drop.classList.add('done');
    $('#dropTitle').textContent = name;
    $('#dropSub').textContent = PNAME[rep.platform] + ' report detected · ' + int(rep.rows.length) + ' search terms · choose another file to replace it';
    $('#q').value = '';
    analyse();
    var first = ['wasted', 'bleeding', 'nosale', 'winner', 'all'].filter(function (t) { return listForCount(t) > 0; })[0] || 'wasted';
    if (first !== S.tab) { S.tab = first; renderTabs(); renderTable(); }
    $('#results').hidden = false; document.body.classList.add('has-results');
    setTimeout(function () { $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
  function resetReport() {
    S.report = null; S.a = null; S.cpo = null;
    $('#results').hidden = true; $('#sticky').hidden = true; document.body.classList.remove('has-results');
    fileIn.value = ''; resetDrop(); renderRules();
  }
  $('#sampleBtn').addEventListener('click', function () {
    showErr('');
    try { load(STA.parseCSV(window.STA_SAMPLES[S.platform]), 'Sample ' + PNAME[S.platform] + ' report', true); } catch (e) { showErr(errText(e)); }
  });
  $('#again').addEventListener('click', function () { $('#uploadArea').scrollIntoView({ behavior: 'smooth' }); setTimeout(function () { fileIn.click(); }, 400); });

  /* ---------- analysis + render ---------- */
  var VNAME = { winner: 'Winners', watch: 'Watch', bleeding: 'Bleeding', wasted: 'Wasted' };
  function analyse() {
    S.a = STA.analyse(S.report, opts());
    renderAll();
  }
  function metric(r) { return !r.sales ? '—' : (isFk() ? x2(r.roi) : pct(r.acos)); }
  function metricClass(r) {
    var o = opts();
    if (r.acos == null) return 'none-t';
    if (r.acos > o.beAcos) return 'bad-t';
    return r.acos <= o.targetAcos ? 'good-t' : '';
  }
  function action(r) {
    if (r.verdict === 'wasted') return r.handled ? ['Already negative', 'done'] : [isFk() ? 'Add as negative keyword' : (r.isAsin ? 'Add as negative product target' : 'Add as negative exact'), 'wasted'];
    if (r.verdict === 'bleeding') return ['Lower the bid', 'bleeding'];
    if (r.verdict === 'winner') return r.added === 'keyword' ? ['Already a keyword · raise bid', 'done'] : [isFk() ? 'Raise bid · scale it' : 'Add as exact keyword', 'winner'];
    return r.orders === 0 ? ['No sales yet · watch', 'watch'] : ['Leave running', 'watch'];
  }

  function renderAll() {
    var a = S.a, t = a.totals, r = S.report, o = opts();
    var dates = r.start && r.end ? niceDate(r.start) + ' – ' + niceDate(r.end) : '';
    $('#repChip').innerHTML = '<i class="dot ' + (isFk() ? 'f' : 'a') + '"></i><b>' + esc(S.fileName) + '</b><span>' + PNAME[r.platform] + (dates ? ' · ' + dates : '') + ' · ' + int(a.withClicks) + ' terms with clicks' + (r.rows.length > a.withClicks ? ' (' + int(r.rows.length - a.withClicks) + ' with no clicks hidden)' : '') + '</span>';

    var noSale = a.rows.filter(function (x) { return x.orders === 0 && x.spend > 0; });
    var noSaleAmt = noSale.reduce(function (s, x) { return s + x.spend; }, 0);
    var waste = a.split.wasted.spend;
    var k = function (label, val, sub, cls) { return '<div class="kpi ' + (cls || '') + '"><span>' + label + '</span><b>' + val + '</b><small>' + sub + '</small></div>'; };
    $('#kpis').innerHTML =
      k('Ad spend', money(t.spend), int(t.clicks) + ' clicks · CPC ' + money(t.clicks ? t.spend / t.clicks : 0)) +
      (isFk()
        ? k('Revenue', money(t.sales), int(t.orders) + ' units · ' + money(t.indirectSales) + ' indirect') + k('ROI', x2(t.roi), 'ACoS ' + pct(t.acos))
        : k('Ad sales', money(t.sales), int(t.orders) + ' orders') + k('ACoS', pct(t.acos), 'ROAS ' + x2(t.roi))) +
      k('Wasted spend', money(waste), t.spend ? (waste / t.spend * 100).toFixed(1) + '% of spend · ' + a.split.wasted.count + ' terms' : '—', waste > 0 ? 'red' : '') +
      k('Spend with no sales', money(noSaleAmt), t.spend ? (noSaleAmt / t.spend * 100).toFixed(1) + '% · ' + int(noSale.length) + ' terms' : '—') +
      k('Winners to scale', String(a.split.winner.count), money(a.split.winner.sales) + ' in sales', 'green');

    $('#spendLbl').textContent = money(t.spend);
    var order = ['winner', 'watch', 'bleeding', 'wasted'];
    $('#splitBar').innerHTML = order.map(function (v) { var p = t.spend ? a.split[v].spend / t.spend * 100 : 0; return p > 0 ? '<i class="c-' + v + '" style="width:' + p.toFixed(2) + '%"></i>' : ''; }).join('');
    $('#splitBar').setAttribute('aria-label', order.map(function (v) { return VNAME[v] + ' ' + (t.spend ? Math.round(a.split[v].spend / t.spend * 100) : 0) + '%'; }).join(', '));
    $('#legend').innerHTML = order.map(function (v) {
      var p = t.spend ? Math.round(a.split[v].spend / t.spend * 100) : 0;
      return '<div><i class="c-' + v + '"></i><span><b>' + VNAME[v] + ' · ' + p + '%</b><small>' + money(a.split[v].spend) + ' across ' + int(a.split[v].count) + ' terms</small></span></div>';
    }).join('');
    var warn = '<svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    var ok = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
    var al = $('#alert');
    if (waste > 0) { al.className = 'alert bad'; al.innerHTML = warn + '<span><b>' + money(waste) + ' (' + (waste / t.spend * 100).toFixed(1) + '% of spend)</b> went to ' + a.split.wasted.count + ' search terms that got ' + o.minClicks + '+ clicks and never sold. Negating them frees that budget for your winners.</span>'; }
    else { al.className = 'alert good'; al.innerHTML = ok + '<span><b>No search term crossed your waste line.</b> ' + (noSaleAmt > 0 ? money(noSaleAmt) + ' went to ' + int(noSale.length) + ' smaller terms that haven’t sold yet. Check the “No sales yet” tab and the words below.' : 'Nice, tidy account.') + '</span>'; }

    renderTabs(); renderTable(); renderWords(); renderDownloads(); renderTips();
    var st = $('#sticky');
    st.hidden = false;
    $('#stickyAmt').textContent = waste > 0 ? money(waste) : money(noSaleAmt);
    $('#stickySub').textContent = waste > 0 ? 'wasted · ready to negate' : 'spent with no sales yet';
    $('#stickyBtn').textContent = waste > 0 ? 'Download negatives' : 'Download analysis';
  }

  function listFor(tab) {
    var a = S.a, base;
    if (tab === 'all') base = a.rows.filter(function (r) { return r.clicks > 0 || r.spend > 0; });
    else if (tab === 'nosale') base = a.rows.filter(function (r) { return r.orders === 0 && r.spend > 0 && r.verdict !== 'wasted'; });
    else base = a.groups[tab];
    if (S.q) { var q = S.q.toLowerCase(); base = base.filter(function (r) { return r.term.toLowerCase().indexOf(q) !== -1 || r.where.toLowerCase().indexOf(q) !== -1; }); }
    return base.slice().sort(function (x, y) { return y.spend - x.spend || y.clicks - x.clicks; });
  }
  var TABS = [['wasted', 'Wasted'], ['bleeding', 'Bleeding'], ['winner', 'Winners'], ['nosale', 'No sales yet'], ['watch', 'Watch'], ['all', 'All']];
  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(function (t) {
      var n = (t[0] === 'all' ? S.a.withClicks : (t[0] === 'nosale' ? listForCount('nosale') : S.a.groups[t[0]].length));
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + ' <span class="n">' + int(n) + '</span></button>';
    }).join('');
    var o = opts(), fk = isFk();
    var hints = {
      wasted: 'These terms got ' + o.minClicks + '+ clicks and never sold. ' + (fk ? 'Add them as negative keywords in the campaign shown.' : 'Add them as negative exact in the campaign shown.'),
      bleeding: 'These terms sell, but ' + (fk ? 'below your ' + S.set.flipkart.be.toFixed(1) + 'x break-even ROI' : 'above your ' + S.set.amazon.be + '% break-even ACoS') + '. Lower their bids so each sale stays profitable.',
      winner: 'These terms have 2+ orders at ' + (fk ? S.set.flipkart.target.toFixed(1) + 'x ROI or better' : S.set.amazon.target + '% ACoS or better') + '. ' + (fk ? 'Give them more budget or a higher bid.' : 'Add them as exact-match keywords with their own bids.'),
      nosale: 'Terms with spend but no sales that haven’t reached your waste line yet. Watch them, and look for repeated words below.',
      watch: 'Not enough data yet, or between your target and break-even. Leave these running and check again next week.',
      all: 'Every search term with clicks, sorted by spend.'
    };
    $('#tabHint').textContent = hints[S.tab];
    $('#copyLbl').textContent = S.tab === 'wasted' ? 'Copy as negatives' : (S.tab === 'winner' ? 'Copy winners' : 'Copy terms');
  }
  function listForCount(t) { var q = S.q; S.q = ''; var n = listFor(t).length; S.q = q; return n; }
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.getAttribute('data-tab'); S.limit = pageSize(); renderTabs(); renderTable(); });
  $('#q').addEventListener('input', function () { S.q = this.value.trim(); S.limit = pageSize(); renderTable(); });
  $('#moreBtn').addEventListener('click', function () { S.limit += pageSize() * 2; renderTable(); });

  function renderTable() {
    var list = listFor(S.tab), fk = isFk();
    var head = '<div class="tr th" role="row"><span>Search term</span><span>' + (S.report.rows.some(function (r) { return r.campaign; }) ? 'Campaign' : 'Matched target') + '</span><span class="r">Clicks</span><span class="r">Spend</span><span class="r">' + (fk ? 'Units' : 'Orders') + '</span><span class="r">' + (fk ? 'Revenue' : 'Sales') + '</span><span class="r">' + (fk ? 'ROI' : 'ACoS') + '</span><span>What to do</span></div>';
    if (!list.length) {
      $('#tbl').innerHTML = head + '<div class="empty">' + (S.q ? 'No terms match “' + esc(S.q) + '”.' : (S.tab === 'wasted' ? 'Nothing wasted at your current rules. Check the “No sales yet” tab.' : 'No terms here at your current rules.')) + '</div>';
      $('#moreBtn').hidden = true; return;
    }
    $('#tbl').innerHTML = head + list.slice(0, S.limit).map(function (r) {
      var ac = action(r);
      return '<div class="tr" role="row"><span class="term">' + esc(r.term) + (r.variants > 1 ? ' <small class="muted">×' + r.variants + '</small>' : '') + '</span><span class="where">' + esc(r.where || '—') + '</span>' +
        '<span class="r" data-l="Clicks">' + int(r.clicks) + '</span><span class="r" data-l="Spend"><b>' + money(r.spend) + '</b></span><span class="r" data-l="' + (fk ? 'Units' : 'Orders') + '">' + int(r.orders) + '</span>' +
        '<span class="r" data-l="' + (fk ? 'Revenue' : 'Sales') + '">' + (r.sales ? money(r.sales) : '—') + '</span><span class="ac ' + metricClass(r) + '" data-l="' + (fk ? 'ROI' : 'ACoS') + '">' + metric(r) + '</span>' +
        '<span class="chip k-' + ac[1] + '">' + ac[0] + '</span></div>';
    }).join('');
    var more = list.length - S.limit;
    $('#moreBtn').hidden = more <= 0;
    $('#moreBtn').textContent = 'Show ' + Math.min(pageSize() * 2, more) + ' more (' + int(more) + ' left)';
  }
  $('#copyBtn').addEventListener('click', function () {
    var list = listFor(S.tab).filter(function (r) { return !(S.tab === 'wasted' && r.handled); });
    if (!list.length) return toast('Nothing to copy here.');
    var text = list.map(function (r) { return r.term; }).join('\n');
    var done = function () { toast('Copied ' + list.length + ' search terms'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  });
  function fallbackCopy(text) { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); }

  function renderWords() {
    var w = S.a.words;
    if (!w.length) { $('#words').innerHTML = '<p class="empty">No single word is wasting money across several terms. Good sign.</p>'; return; }
    var mx = w[0].spend || 1;
    $('#words').innerHTML = w.map(function (x) {
      var neg = x.verdict === 'negative';
      return '<div class="w"><b>“' + esc(x.word) + '”</b><span class="bar-w"><span class="trk"><i style="width:' + (x.spend / mx * 100).toFixed(1) + '%;background:' + (neg ? '#B91C1C' : '#F59E0B') + '"></i></span><small>' + money(x.spend) + ' spent · ' + x.terms + ' terms · ' + int(x.clicks) + ' clicks · ' + (neg ? 'no sales' : (isFk() ? x2(x.sales / x.spend) + ' ROI' : pct(x.acos) + ' ACoS')) + '</small></span><span class="chip ' + (neg ? 'k-wasted' : 'k-bleeding') + '">' + (neg ? 'Negative phrase' : 'Lower bids') + '</span></div>';
    }).join('');
  }

  function stamp() { var r = S.report; return (r.platform) + (r.end ? '-' + r.end : '') ; }
  function download(name, csv) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Downloaded ' + name);
  }
  var DL = {
    neg: function () { download('negative-keywords-' + stamp() + '.csv', STA.exportNegatives(S.a, S.platform)); },
    words: function () { download('negative-phrase-words-' + stamp() + '.csv', STA.exportWords(S.a)); },
    harvest: function () { download('exact-keywords-' + stamp() + '.csv', STA.exportHarvest(S.a, opts(), S.platform)); },
    all: function () { download('search-term-analysis-' + stamp() + '.csv', STA.exportAll(S.a, S.platform)); }
  };
  function renderDownloads() {
    var a = S.a, negN = a.groups.wasted.filter(function (r) { return !r.handled; }).length;
    var negW = a.words.filter(function (w) { return w.verdict === 'negative'; }).length;
    var harvN = a.groups.winner.filter(function (r) { return !r.handled && !r.isAsin; }).length;
    var item = function (k, title, sub, n, primary) {
      return '<button type="button" class="dl' + (primary ? ' primary' : '') + '" data-dl="' + k + '"' + (n === 0 ? ' disabled' : '') + '><span><b>' + title + '</b><small>' + sub + '</small></span><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>';
    };
    $('#dls').innerHTML =
      item('neg', isFk() ? 'Negative keyword list' : 'Negative exact list', negN + ' terms · ' + money(a.split.wasted.spend) + ' wasted', negN, negN > 0) +
      item('words', 'Negative phrase words', negW + ' words that never sold', a.words.length) +
      item('harvest', isFk() ? 'Winning search terms' : 'Exact-match harvest list', harvN + ' winners with suggested bids', harvN) +
      item('all', 'Full analysis', 'Every term with its verdict · opens in Excel', 1, negN === 0);
  }
  $('#dls').addEventListener('click', function (e) { var b = e.target.closest('[data-dl]'); if (b && !b.disabled) DL[b.getAttribute('data-dl')](); });
  $('#stickyBtn').addEventListener('click', function () { (S.a.split.wasted.spend > 0 ? DL.neg : DL.all)(); });

  function renderTips() {
    var a = S.a, o = opts(), fk = isFk(), tips = [];
    var tw = a.groups.wasted.filter(function (r) { return !r.handled; })[0];
    var topWin = a.groups.winner.slice().sort(function (x, y) { return y.sales - x.sales; })[0];
    var neg = a.words.filter(function (w) { return w.verdict === 'negative'; })[0];
    if (tw) tips.push('Negate <b>“' + esc(tw.term) + '”</b> first. It cost ' + money(tw.spend) + ' over ' + int(tw.clicks) + ' clicks with no ' + (fk ? 'units sold' : 'orders') + '.');
    if (neg) tips.push('Add <b>“' + esc(neg.word) + '”</b> as a negative phrase. It appears in ' + neg.terms + ' search terms that cost ' + money(neg.spend) + ' and never sold.');
    if (topWin) tips.push((fk ? 'Scale <b>“' + esc(topWin.term) + '”</b>. It brought ' + money(topWin.sales) + ' at ' + x2(topWin.roi) + ' ROI; raise its bid or budget.' : (topWin.added === 'keyword' ? 'Raise the bid on <b>“' + esc(topWin.term) + '”</b>. ' : 'Move <b>“' + esc(topWin.term) + '”</b> into an exact-match campaign. ') + 'It brought ' + money(topWin.sales) + ' at ' + pct(topWin.acos) + ' ACoS.'));
    if (a.groups.bleeding.length) tips.push('Cut bids on the ' + a.groups.bleeding.length + ' bleeding terms. Together they cost ' + money(a.split.bleeding.spend) + ' at ' + (fk ? 'an ROI below your break-even.' : 'an ACoS above ' + S.set.amazon.be + '%.'));
    var noSale = a.rows.filter(function (r) { return r.orders === 0 && r.spend > 0 && r.verdict !== 'wasted'; });
    if (!tw && noSale.length) tips.push('Nothing has crossed your waste line yet. Re-run this report in 2–3 weeks: ' + int(noSale.length) + ' terms with spend and no sales will have more data by then.');
    if (!tips.length) tips.push('Your search terms look healthy at these rules. Try a longer date range for a fuller picture.');
    $('#tips').innerHTML = tips.slice(0, 4).map(function (t) { return '<li><span>' + t + '</span></li>'; }).join('');
  }

  /* ---------- start ---------- */
  setPlatform(S.platform, true);
})();
