// Token Radar's page: everything renders client-side from window.RADAR, which
// main.ts writes as data.js beside this page. No fetch, no network.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) {
    document.getElementById('meta').textContent = 'No data: data.js did not load.';
    return;
  }

  var state = { q: '', cat: '', chain: '', minTvl: 0, scope: 'ranked', sortKey: 'rank', sortDir: 1, detail: null };

  function $(id) { return document.getElementById(id); }

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function age(d) {
    if (d === null || d === undefined) return '—';
    if (d < 365) return d + 'd';
    return (d / 365).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // ---- header, stats, model -----------------------------------------------
  $('meta').textContent = 'Snapshot: DefiLlama protocols, as of ' + R.as_of + ' · watchlist floor $' +
    (R.floor_usd / 1e6) + 'M · ' + R.total_protocols + ' protocols in the snapshot';
  $('modelver').textContent = 'model ' + R.model_version;
  $('stats').innerHTML = [
    [R.board_size, 'protocols ranked'],
    [R.watchlist_size, 'on the watchlist'],
    [R.pre_token_count, 'pre-token found'],
    [R.excluded_count, 'wrapped / exchange left out'],
    [R.live_size, 'already trading, shown below'],
  ].map(function (s) { return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');

  var m = R.model;
  $('modelgrid').innerHTML = [
    ['<b>Growth</b> ×' + m.growth_weight, '7d change clamped ' + m.growth_floor + '%…+' + m.growth_cap + '%'],
    ['<b>Maturity</b> ' + m.maturity_floor + '–' + (m.maturity_floor + m.maturity_range), 'over ' + (m.maturity_days / 365) + ' years, unknown age = ' + m.unknown_age_days + 'd'],
    ['<b>Chains</b> +' + (m.chain_step * 100) + '% each', 'up to +' + (m.chain_step * m.chain_cap * 100) + '% for ' + (m.chain_cap + 1) + '+ chains'],
    ['<b>Category</b> ' + Math.min.apply(null, Object.values(m.category_multiples)).toFixed(2) + '–' + Math.max.apply(null, Object.values(m.category_multiples)).toFixed(2), 'FDV/TVL multiple by sector, table below'],
  ].map(function (c) { return '<div>' + c[0] + '<br>' + c[1] + '</div>'; }).join('');

  var cats = Object.keys(m.category_multiples).sort(function (a, b) { return m.category_multiples[b] - m.category_multiples[a] || cmp(a, b); });
  $('catmult').innerHTML = '<table><thead><tr><th>Sector</th><th>Multiple</th></tr></thead><tbody>' +
    cats.map(function (c) { return '<tr><td>' + esc(c) + '</td><td class="num val">' + m.category_multiples[c].toFixed(2) + '×</td></tr>'; }).join('') +
    '<tr><td>Any other sector</td><td class="num val">' + m.default_multiple.toFixed(2) + '×</td></tr></tbody></table>';

  // ---- filters -------------------------------------------------------------
  var catSel = $('cat');
  var allCats = Array.from(new Set(R.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
  catSel.innerHTML = '<option value="">All categories</option>' + allCats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');

  var chainCounts = {};
  R.rows.forEach(function (r) { r.chains.forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
  var topChains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 15);
  $('chain').innerHTML = '<option value="">All chains</option>' + topChains.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + ' (' + chainCounts[c] + ')</option>'; }).join('');

  function filtered() {
    var q = state.q.toLowerCase();
    return R.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.cat && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      return true;
    });
  }

  function sortRows(rows) {
    var k = state.sortKey, d = state.sortDir;
    return rows.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (k === 'name' || k === 'category') return cmp(String(av || ''), String(bv || '')) * d;
      if (k === 'chains') return (a.chains.length - b.chains.length) * d || cmp(a.slug, b.slug);
      if (av === null || av === undefined) av = -1e18;
      if (bv === null || bv === undefined) bv = -1e18;
      return (av - bv) * d || cmp(a.slug, b.slug);
    });
  }

  function renderBoard() {
    var rows = sortRows(filtered());
    $('count').textContent = 'Showing ' + rows.length + ' of ' + R.rows.length;
    $('rows').innerHTML = rows.map(function (r) {
      var g = r.change_7d;
      var cls = g === null ? '' : g >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span style="color:var(--dim);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td><span class="cat">' + esc(r.category || '—') + '</span></td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + pct(g) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug'), true); });
    });
    document.querySelectorAll('#board th').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sortKey);
    });
  }

  function renderLive() {
    $('liverows').innerHTML = R.live.map(function (r) {
      var g = r.change_7d;
      var cls = g === null ? '' : g >= 0 ? 'pos' : 'neg';
      return '<tr><td><b>' + esc(r.name) + '</b></td>' +
        '<td><span class="cat">' + esc(r.category || '—') + '</span></td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num val">' + money(r.mcap_usd) + '</td>' +
        '<td class="num ' + cls + '">' + pct(g) + '</td></tr>';
    }).join('');
  }

  function openDetail(slug, scroll) {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) { r = R.rows[i]; break; }
    if (!r) return;
    state.detail = slug;
    var base = r.tvl_usd * r.category_multiple;
    var afterGrowth = base * r.growth_multiplier;
    var afterMaturity = afterGrowth * r.maturity_multiplier;
    var steps = r.farm_steps.map(function (s, i) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      var tailHtml = tail.replace('Cost:', '<b>Cost:</b>').replace('Time:', '<b>Time:</b>');
      return '<li>' + esc(action) + ' ' + tailHtml + '</li>';
    }).join('');
    $('detail').hidden = false;
    $('detail').innerHTML =
      '<h2>#' + r.rank + ' — ' + esc(r.name) + '</h2>' +
      '<p class="fine">' + esc(r.slug) + ' · records no token · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) + '</p>' +
      '<div class="kv">' +
      '<div><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div><span>7-day change</span><b>' + pct(r.change_7d) + '</b></div>' +
      '<div><span>Tracked since</span><b>' + (r.listed_at || 'unknown') + ' (' + age(r.age_days) + ')</b></div>' +
      '<div><span>Implied value</span><b style="color:var(--amber)">' + money(r.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<h3>How the implied value is computed</h3>' +
      '<div class="breakdown">' +
      'TVL ' + money(r.tvl_usd) + ' × category ' + r.category_multiple.toFixed(2) + ' = <b>' + money(base) + '</b><br>' +
      '× growth ' + r.growth_multiplier.toFixed(4) + ' (' + pct(r.change_7d) + ' over 7d) = <b>' + money(afterGrowth) + '</b><br>' +
      '× maturity ' + r.maturity_multiplier.toFixed(4) + ' (' + age(r.age_days) + ' with no token) = <b>' + money(afterMaturity) + '</b><br>' +
      '× chains ' + r.chain_multiplier.toFixed(2) + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ') = <b>' + money(r.implied_value_usd) + '</b>' +
      '</div>' +
      '<h3>Farm plan — 7 steps</h3><ol class="farm">' + steps + '</ol>';
    if (scroll) $('detail').scrollIntoView({ block: 'start' });
    try { history.replaceState(null, '', '#detail=' + slug); } catch (e) { /* hash is a bonus, not a requirement */ }
  }

  // ---- wiring ---------------------------------------------------------------
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else { state.sortKey = k; state.sortDir = k === 'name' || k === 'category' ? 1 : -1; }
      renderBoard();
    });
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('minTvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); renderBoard(); });
  $('scope').addEventListener('change', function (e) {
    state.scope = e.target.value;
    if (state.scope === 'live') { $('boardsec').style.display = 'none'; $('livesec').style.display = ''; $('livesec').scrollIntoView(); }
    else { $('boardsec').style.display = ''; $('livesec').style.display = ''; }
  });

  // ---- hash state: #detail=<slug> opens a detail, #cat=<category> filters ----
  var hash = (location.hash || '').slice(1);
  var params = {};
  hash.split('&').forEach(function (part) {
    var kv = part.split('=');
    if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
  });
  if (params.cat) { state.cat = params.cat; catSel.value = params.cat; }

  renderBoard();
  renderLive();
  if (params.detail) {
    // A deep link to a detail puts the panel first, so it is the page's top with no scroll timing involved.
    openDetail(params.detail, false);
    document.body.insertBefore($('detail'), document.body.firstChild);
    window.scrollTo(0, 0);
  }
})();
