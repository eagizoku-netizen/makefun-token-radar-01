// Token Launch Radar's page. It reads window.RADAR (the data.js main.ts writes beside this
// page's parent directory) and renders the ranked board, its filters, and a detail view per
// protocol with the model's own arithmetic and the protocol's farm plan. No network: every
// byte the page shows was computed by main.ts from the sealed snapshot.
(function () {
  'use strict';

  var R = window.RADAR;
  if (!R) return;
  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { q: '', cat: 'all', chain: 'all', band: 'all', growth: 'all', watch: false, sort: 'implied' };

  // ------------------------------------------------------------ formatting
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function full(n) {
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pct(n) {
    if (n === null || n === undefined) return '<span class="flat">n/a</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(2) + '%</span>';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30.4) + 'mo';
    return days + 'd';
  }
  function mult(x) { return x.toFixed(2) + 'x'; }
  function factor(x) { return 'x' + x.toFixed(3); }

  // ------------------------------------------------------------ header, stats, model
  document.getElementById('stamp').innerHTML =
    'Snapshot <b>' + esc(R.as_of) + '</b> · DefiLlama<br>sealed input, same for every run';

  document.getElementById('stats').innerHTML = [
    ['Protocols scanned', R.scanned, 'every protocol at $5M TVL or more'],
    ['Pre-token, ranked', R.board_size, 'of ' + R.pre_token + ' that record no token'],
    ['Watchlist covered', R.watchlist_size + ' / ' + R.watchlist_size, 'the house floor, every slug'],
    ['Launched comparables', R.launched_comps, 'tokens that already trade'],
    ['Total implied value', money(R.total_implied_usd), 'the board summed', 'acc'],
  ].map(function (s) {
    return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v' + (s[3] ? ' acc' : '') + '">' +
      s[1] + '</div><div class="s">' + s[2] + '</div></div>';
  }).join('');

  var mults = R.multiples.map(function (m) {
    return '<div><span class="c">' + esc(m.category) + '</span><span class="d">' + m.comps +
      ' launched</span><span class="m">' + mult(m.multiple) + '</span></div>';
  }).join('');
  document.getElementById('model').innerHTML =
    '<h2>How the implied value is derived</h2>' +
    '<div class="formula">implied value = TVL x category multiple x growth x age x chains x size</div>' +
    '<p>The <b>category multiple</b> is measured, not chosen: for every protocol whose token already trades, ' +
    'the snapshot gives a market cap and a TVL, and the multiple is that category\'s median market-cap-to-TVL ' +
    'ratio, shrunk toward the market-wide median of <b>' + mult(R.global_median) + '</b> so a category with one ' +
    'comparable cannot run away. No protocol name is an input. <b>Growth</b> reads the seven-day TVL change, ' +
    '<b>age</b> how long the protocol has run with no token (a missing listing date is priced at the snapshot\'s ' +
    'median age, ' + R.median_age_days + ' days), <b>chains</b> its distribution surface, <b>size</b> its TVL band.</p>' +
    '<p>Protocols that record a token are never ranked: the ones with a market cap are the comparables below, ' +
    'and ' + R.token_no_mcap + ' record a token with no market cap in the snapshot and sit in neither set. ' +
    'Bridged, staked and exchange house products are set aside by the same category reading the house\'s ' +
    'watchlist uses — they are claims on another protocol\'s asset, not launches of their own.</p>' +
    '<div class="mults">' + mults + '</div>';

  document.getElementById('foot').innerHTML =
    '<p>Implied values are this model\'s claims about what a launch would be worth if the protocol\'s record ' +
    'stayed as it is; they are not predictions that a token will be issued. Farm plans are starting points: ' +
    'check the protocol\'s own page before acting, and never pay anyone to claim an allocation for you.</p>' +
    '<p>Data: the sealed DefiLlama snapshot of ' + esc(R.as_of) + ' (' + R.scanned + ' protocols). ' +
    'This page renders offline from data.js, written by the same run that wrote the board.</p>';

  // ------------------------------------------------------------ controls
  function options(list, allLabel) {
    return '<option value="all">' + allLabel + '</option>' + list.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    }).join('');
  }
  var cats = [], chains = [], seenC = {}, seenH = {};
  rows.forEach(function (r) {
    var c = r.category || 'Uncategorized';
    if (!seenC[c]) { seenC[c] = 1; cats.push(c); }
    r.chains.forEach(function (h) { if (!seenH[h]) { seenH[h] = 1; chains.push(h); } });
  });
  cats.sort(); chains.sort();
  document.getElementById('controls').innerHTML =
    '<input type="search" id="f-q" placeholder="Search protocol or category" aria-label="Search">' +
    '<select id="f-cat" aria-label="Category">' + options(cats, 'All categories') + '</select>' +
    '<select id="f-chain" aria-label="Chain">' + options(chains, 'All chains') + '</select>' +
    '<select id="f-band" aria-label="TVL band">' +
    '<option value="all">Any TVL</option><option value="b1">$1B and up</option>' +
    '<option value="b2">$250M to $1B</option><option value="b3">$50M to $250M</option>' +
    '<option value="b4">$10M to $50M</option><option value="b5">Under $10M</option></select>' +
    '<select id="f-growth" aria-label="Seven-day growth">' +
    '<option value="all">Any 7d move</option><option value="up">Growing</option><option value="down">Shrinking</option></select>' +
    '<label><input type="checkbox" id="f-watch"> Watchlist only</label>' +
    '<span class="sp"></span>' +
    '<label>Sort <select id="f-sort">' +
    '<option value="implied">Implied value</option><option value="tvl">TVL</option>' +
    '<option value="change">7d change</option><option value="age">Age</option><option value="name">Name</option>' +
    '</select></label>' +
    '<button class="btn" id="f-reset" type="button">Reset</button>';

  function bandOk(tvl) {
    if (state.band === 'b1') return tvl >= 1e9;
    if (state.band === 'b2') return tvl >= 2.5e8 && tvl < 1e9;
    if (state.band === 'b3') return tvl >= 5e7 && tvl < 2.5e8;
    if (state.band === 'b4') return tvl >= 1e7 && tvl < 5e7;
    if (state.band === 'b5') return tvl < 1e7;
    return true;
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (!bandOk(r.tvl_usd)) return false;
      if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && (r.category || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      change: function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
      name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },
    };
    out.sort(by[state.sort] || by.implied);
    return out;
  }

  // ------------------------------------------------------------ the board
  var tbody = document.getElementById('rows');
  function renderBoard() {
    var list = filtered();
    tbody.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + (r.on_watchlist ? '<span class="chip">Watch</span>' : '') + '</td>' +
        '<td class="cat">' + esc(r.category || 'Uncategorized') + '</td>' +
        '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="n">' + money(r.tvl_usd) + '</td>' +
        '<td class="n">' + pct(r.change_7d) + '</td>' +
        '<td class="n">' + ageText(r.age_days) + '</td>' +
        '<td class="n">' + mult(r.model.multiple) + '</td>' +
        '<td class="n imp">' + money(r.implied_value_usd) + '</td></tr>';
    }).join('');
    var total = list.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    document.getElementById('count').textContent =
      'Showing ' + list.length + ' of ' + rows.length + ' ranked protocols · ' + money(total) +
      ' of implied value in view · ranks are the model\'s, whatever the sort. Click a row for its farm plan.';
  }

  // ------------------------------------------------------------ detail view
  var boardView = document.getElementById('board-view');
  var detailView = document.getElementById('detail-view');
  function showDetail(r) {
    var m = r.model;
    var base = r.tvl_usd * m.multiple;
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var comps = (R.comps[r.category || ''] || []);
    var compHtml;
    if (comps.length > 0) {
      compHtml = '<table class="mini"><thead><tr><th>Launched comparable</th><th class="num">TVL</th>' +
        '<th class="num">Market cap</th><th class="num">Cap / TVL</th></tr></thead><tbody>' +
        comps.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td class="n">' + money(c.tvl_usd) + '</td><td class="n">' +
            money(c.mcap_usd) + '</td><td class="n">' + mult(c.ratio) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="note">These ' + esc(r.category || 'Uncategorized') + ' protocols already trade; the board ranks only ' +
        'protocols that record no token. Their ratios are where this row\'s multiple comes from.</p>';
    } else {
      compHtml = '<p class="note">No launched protocol in this category carries a market cap in the snapshot, ' +
        'so this row is priced at the market-wide median multiple of ' + mult(R.global_median) + '.</p>';
    }
    detailView.innerHTML =
      '<button class="btn back" id="d-back" type="button">Back to the board</button>' +
      '<div class="panel"><div class="dhead"><div>' +
      '<h2>' + esc(r.name) + (r.on_watchlist ? '<span class="chip">Watchlist</span>' : '') + '</h2>' +
      '<div class="sub">Rank #' + r.rank + ' of ' + rows.length + ' · ' + esc(r.category || 'Uncategorized') +
      ' · records no token in the snapshot</div></div>' +
      '<div class="bigval"><div class="k">Implied value</div><div class="v">' + full(r.implied_value_usd) + '</div></div></div>' +
      '<div class="grid">' +
      '<div class="cell"><div class="k">TVL</div><div class="v">' + full(r.tvl_usd) + '</div><div class="s">across ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</div></div>' +
      '<div class="cell"><div class="k">7-day TVL change</div><div class="v">' + pct(r.change_7d) + '</div><div class="s">the snapshot\'s own window</div></div>' +
      '<div class="cell"><div class="k">Running with no token</div><div class="v">' + ageText(r.age_days) + '</div><div class="s">' + (r.listed_at ? 'tracked since ' + esc(r.listed_at) : 'no listing date in the snapshot') + '</div></div>' +
      '<div class="cell"><div class="k">Category multiple</div><div class="v">' + mult(m.multiple) + '</div><div class="s">median cap/TVL of launched peers</div></div>' +
      '</div>' +
      '<h3 class="sec">How this value is derived</h3>' +
      '<table class="mini"><tbody>' +
      '<tr><td>TVL x category multiple</td><td class="n">' + full(r.tvl_usd) + ' x ' + m.multiple.toFixed(4) + '</td><td class="n">' + money(base) + '</td></tr>' +
      '<tr><td>x growth factor (7-day TVL change)</td><td class="n">' + factor(m.growth_factor) + '</td><td class="n">' + money(base * m.growth_factor) + '</td></tr>' +
      '<tr><td>x age factor (time with no token)</td><td class="n">' + factor(m.age_factor) + '</td><td class="n">' + money(base * m.growth_factor * m.age_factor) + '</td></tr>' +
      '<tr><td>x chains factor (' + r.chains.length + ' chains)</td><td class="n">' + factor(m.chain_factor) + '</td><td class="n">' + money(base * m.growth_factor * m.age_factor * m.chain_factor) + '</td></tr>' +
      '<tr><td>x size factor (TVL band)</td><td class="n">' + factor(m.size_factor) + '</td><td class="n">' + full(r.implied_value_usd) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="note">Chains: ' + esc(r.chains.join(', ') || 'none named') + '.</p>' +
      '<h3 class="sec">Farm plan</h3><ol class="steps">' + steps + '</ol>' +
      '<h3 class="sec">Launched comparables</h3>' + compHtml +
      '</div>';
    boardView.hidden = true;
    detailView.hidden = false;
    document.getElementById('d-back').addEventListener('click', function () {
      detailView.hidden = true;
      boardView.hidden = false;
      window.scrollTo(0, 0);
    });
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ wiring
  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (tr && bySlug[tr.getAttribute('data-slug')]) showDetail(bySlug[tr.getAttribute('data-slug')]);
  });
  function on(id, ev, fn) { document.getElementById(id).addEventListener(ev, fn); }
  on('f-q', 'input', function (e) { state.q = e.target.value; renderBoard(); });
  on('f-cat', 'change', function (e) { state.cat = e.target.value; renderBoard(); });
  on('f-chain', 'change', function (e) { state.chain = e.target.value; renderBoard(); });
  on('f-band', 'change', function (e) { state.band = e.target.value; renderBoard(); });
  on('f-growth', 'change', function (e) { state.growth = e.target.value; renderBoard(); });
  on('f-watch', 'change', function (e) { state.watch = e.target.checked; renderBoard(); });
  on('f-sort', 'change', function (e) { state.sort = e.target.value; renderBoard(); });
  on('f-reset', 'click', function () {
    state = { q: '', cat: 'all', chain: 'all', band: 'all', growth: 'all', watch: false, sort: 'implied' };
    document.getElementById('f-q').value = '';
    ['f-cat', 'f-chain', 'f-band', 'f-growth', 'f-sort'].forEach(function (id) { document.getElementById(id).value = 'all'; });
    document.getElementById('f-sort').value = 'implied';
    document.getElementById('f-watch').checked = false;
    renderBoard();
  });

  renderBoard();
  document.getElementById('app').setAttribute('aria-busy', 'false');
})();
