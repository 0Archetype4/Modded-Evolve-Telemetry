'use strict';
/* Modded Evolve Telemetry: joins the game's raw telemetry records into matches and draws every page.
   COVERAGE.md lists where each recorded field ends up. Site text says "match"; the game's own field names say "Round". */
// display names: those that came with the stored totals, then those of the players in the loaded recent records
const C = window.CATALOG, NAMES = { ...(window.TELEMETRY_SUMMARY?.names || {}), ...(window.TELEMETRY_PLAYERS || {}) };
// Ranked: a player is placed on a ladder (Hunter or Monster) after this many ranked matches on it. The original game used 10.
// The modded game uses 5: the launcher hands the game "ui_rp_placement_matches 5" with its build settings (launcher source
// Services/Stage2LocalServices.cs), and the account server's ladder uses the same number (TestRankedLadder.PlacementMatches).
const PLACEMENT = 5;
// the invented sample, and the private local preview, show everything they are given
const SHOW_ALL = !!window.TELEMETRY_SAMPLE || ['localhost', '127.0.0.1'].includes(location.hostname) && !/[?&]official=1/.test(location.search);
// The public site and the developer view (Roger, 2026-10-18: "info that backend devs need should not be shown publicly"). The
// public site shows the competitive numbers; queue internals, progression, the store, dialogue, conduct and record bookkeeping
// are the developer view only: this folder served on localhost, reading the NAS's own full totals (data/totals.js). Nothing for
// the developer view is uploaded. ?official=1 on localhost shows the public site, and so does the public totals' core wherever it is
// loaded (tools/publish.py --preview).
const PUBLIC = !['localhost', '127.0.0.1'].includes(location.hostname) || /[?&]official=1/.test(location.search) || !!window.TELEMETRY_SUMMARY?.split;
// The counting rules and the counting itself are in count.js, shared with the hourly job (tools/summarize.js counts with the same code).
// Here they join the records this page was handed; the stored totals are only shown.
const COUNT = makeCounter({ catalog: C, records: window.TELEMETRY_EVENTS || [], showAll: SHOW_ALL, officialExtra: window.TELEMETRY_OFFICIAL_EXTRA || window.TELEMETRY_SUMMARY?.official || [] });
const { OFFICIAL, RAW, counted, EVENTS, LEFT_OUT, LEFT_BY, ROLES, HUNTERS, sumv, cell, nw, T, sessionOf, build, PATCH_OF, ver, ITEMS, charInfo, perkBase, perkLevel, division, byId, slot, SLOT_TYPE, SLOT_ORDER, kitOf, AFTER_UNFINISHED, IMPOSSIBLE, amounts, pileOf, slotItem, learnItems, ingest, toMatch, MATCHES, UNFINISHED, MATCH, won, pid, isRanked, NO_RANK, rankOf, GRID, mapBounds, gridCell, compute, QSTEP, QSTEPS, qhist, qbin, qmedian, HSTEP, HSTEPS, hhist, hbin, account, ledger } = COUNT;
const app = document.getElementById('app');
const banner = document.getElementById('sample');
const HAS_TOTALS = !!(window.TELEMETRY_SUMMARY && window.SUMMARY);       // stored all-time totals are loaded
// never show an empty site as if it were the truth
if (!EVENTS.length && !HAS_TOTALS) banner.textContent = 'The statistics could not be loaded right now. Refresh in a minute.';
banner.hidden = !window.TELEMETRY_SAMPLE && (EVENTS.length > 0 || HAS_TOTALS);

/* ---------- small helpers ---------- */
// every string that comes out of a record or a player name goes through esc(): records are sent by players' own PCs
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => b ? 100 * a / b : null;
const fpct = v => v == null ? '–' : v.toFixed(1) + '%';
const num = v => v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('en-US');
const dec = v => v == null || isNaN(v) ? '–' : v.toFixed(1);
const clock = s => s == null || isNaN(s) ? '–' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hours = s => s == null ? '–' : s >= 3600 ? (s / 3600).toFixed(1) + ' h' : Math.round(s / 60) + ' min';
const day = t => !t || isNaN(t) ? '–' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const avg = (sum, n) => n ? sum / n : null;
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
// The dates the loaded records span. Shown beside every total, because the server only sends a recent window: without this a shorter window would shrink the numbers unseen.
const SPAN = () => SPAN.v || (SPAN.v = EVENTS.reduce((a, e) => [Math.min(a[0], T(e)), Math.max(a[1], T(e))], [Infinity, 0]));
const stamp = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const covers = () => window.TELEMETRY_SUMMARY && window.SUMMARY ? `every match from ${day(Date.parse(window.TELEMETRY_SUMMARY.from))} to ${day(Date.parse(window.TELEMETRY_SUMMARY.to))} · totals updated ${stamp(window.TELEMETRY_SUMMARY.built)}`
  : EVENTS.length ? `records from ${day(SPAN()[0])} to ${day(SPAN()[1])}` : 'no records yet';
const pretty = s => String(s ?? '').replace(/^(ONLINE_REGION_|CLASSIFICATION_REGION_|ROUND_END_REASON_|eLSR?_)/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase().replace(/^./, c => c.toUpperCase());
// the names the site uses for the game's match types and modes (owner's wording: Ranked, Arcade, Custom).
// "Campaign" is what the game calls the tutorial missions: every Campaign match recorded so far has GameMode "Tutorial" on the map "tutorial".
const TYPES = { RankedQuickPlay: 'Ranked', QuickPlay: 'Arcade', Custom: 'Custom', RankedQuickPlayCoop: 'Ranked co-op', QuickPlayCoop: 'Arcade co-op', CustomCoop: 'Custom co-op',
  Ranked: 'Ranked', Hunt: 'Arcade', Campaign: 'Tutorial' }, MODES = { ArenaMode: 'Arena', NewPlayerScenario: 'New player scenario' };
const typeName = t => TYPES[t] || pretty(t), modeName = g => MODES[g] || pretty(g);
const bar = v => v == null ? '–' : `<span class="bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(1)}%"></i></span>${fpct(v)}`;

const itemInfo = k => ITEMS[k] || { name: k, icon: '' };
const perkInfo = k => C.perks[perkBase(k).toLowerCase()] || { name: k, icon: '', tier: '', team: '' };
const mapInfo = key => { const [k, layer] = String(key).split('|'), m = C.maps[k.toLowerCase()] || { name: pretty(k), minimap: '', layers: {} }, l = m.layers?.[layer];
  return { ...m, name: l ? `${m.name} (${l.name})` : layer ? `${m.name} (${pretty(layer)})` : m.name, minimap: l?.minimap || m.minimap }; };
const pname = id => NAMES[id] || 'Player ' + String(id).slice(0, 6);
const img = (src, cls, title = '') => src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(title)}" title="${esc(title)}" loading="lazy">` : '';
const icon = src => src ? img(src, 'icon') : '<span class="icon"></span>';
const face = id => { const c = charInfo(id); return `<img class="face c-${esc(c.class)}" src="${esc(c.thumb)}" alt="${esc(c.name)}" title="${esc(c.name)}" loading="lazy">`; };
// "there is a page behind this" cues use the game's observer role: its eye icon and its purple
const eye = `<img class="obs" src="${C.observerIcon}" alt="">`, cue = text => `<span class="more">${eye}${text} ›</span>`, hint = text => `<p class="hint">${eye}${text}</p>`;
// more = also print a "Full stats" cue under the name, for lists where opening the character's page is the point
const chip = (id, more) => { const c = charInfo(id); return `<a class="chip c-${esc(c.class)}" href="#/character/${encodeURIComponent(id)}">${img(c.thumb, '')}<span class="nm"><span>${esc(c.name)}</span>${more ? cue('Full stats') : ''}</span></a>`; };
const charHref = id => '#/character/' + encodeURIComponent(id), playerHref = id => '#/player/' + encodeURIComponent(id);
// a Class column cell: the class icon alone, large (the class name is its hover text and screen-reader label)
const classCell = role => role ? img(C.classIcons[role], 'cls-lg', role) : '';
const classTag = role => role ? `<span class="clscell">${img(C.classIcons[role], 'cls')}<span class="clsname">${esc(role)}</span></span>` : '';
const plink = id => id ? `<a href="#/player/${encodeURIComponent(id)}"><u>${esc(pname(id))}</u></a>` : '<span class="dim">not reported</span>';
// skill points: an ability holds 0 to 3; pips() draws an exact count as dots
const pips = n => `<span class="pips" role="img" aria-label="${n} of 3 points">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const tile = (k, v, n = '') => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
const tiles = (...t) => `<div class="tiles">${t.join('')}</div>`;
const kv = (l, r) => `<div class="kv"><span class="l">${l}</span><span class="r">${r}</span></div>`;
const perkIcons = keys => keys.filter(Boolean).map(k => (img(perkInfo(k).icon, 'perk', perkInfo(k).name) || esc(perkInfo(k).name)) + (perkLevel(k) ? `<small class="plv" title="Perk level">${perkLevel(k)}</small>` : '')).join(' ');
const play = url => url ? `<button class="play" data-audio="${esc(url)}" aria-label="Play this line">Play</button>` : '';
const lineUrl = (speaker, response) => charInfo(speaker).voice ? `${C.audioBase}/${charInfo(speaker).voice}/${encodeURIComponent(response)}.wav` : '';
function chart(vals, labels, fmt = num, cls = '') {
  const mx = Math.max(1e-9, ...vals.map(v => v || 0));
  return `<div class="chart ${cls}">${vals.map((v, i) => `<div class="col" title="${esc(labels[i])}: ${fmt(v)}"><div class="b"><i style="height:${v ? Math.max(2, v / mx * 100) : 0}%"></i></div><span>${esc(labels[i])}</span></div>`).join('')}</div>`;
}


/* ---------- page state and filters ---------- */
/* Stored totals (data/totals.js, written by tools/summarize.js from the archive of every record) cover every match since launch,
   split into the smallest groups the filters can tell apart: "patch|mode|match type|solo". With them, the numbers on the totals
   pages are those groups added together (summary.js), and the records this page loaded only supply recent matches for the lists. */
const SUM = window.TELEMETRY_SUMMARY && window.SUMMARY ? window.TELEMETRY_SUMMARY : null;
const sliceKeys = SUM ? Object.keys(SUM.slices) : [];
for (const [k, v] of Object.entries(SUM?.items || {})) ITEMS[k] ||= v;      // weapon and ability names the job learned from the records (learnItems)
const optionsOf = (i, f) => SUM ? [...new Set(sliceKeys.map(k => k.split('|')[i]))].sort() : uniq(f);
// solo matches are left out by default, unless they are all there is
const ST = { fl: { v: '', mode: '', type: '', rank: '', solo: (SUM ? sliceKeys.some(k => k.endsWith('|0')) : MATCHES.some(m => m.hdr.Multiplayer)) ? '' : '1' }, chars: { cls: 'All', bst: '3' }, perks: { tab: 'hunter', tier: '', all: '', allc: '', char: '' }, maps: { key: '', view: 'all' }, rk: { view: 'o', tier: '', cls: '', region: '', q: '', sort: 'rating' },
  players: { q: '', region: '', all: '', side: '', pchar: '' }, dlg: { speaker: '' }, prog: { track: 'Global' }, browse: { day: '', all: '' } };
const passes = m => (!ST.fl.v || m.v === ST.fl.v) && (!ST.fl.mode || m.hdr.GameMode === ST.fl.mode) && (!ST.fl.type || m.hdr.MatchType === ST.fl.type) && (ST.fl.solo || m.hdr.Multiplayer);
const uniq = f => [...new Set(MATCHES.map(f))].sort();
const select = (path, opts, cur, all) => `<select data-st="${path}">${all ? `<option value="">${all}</option>` : ''}${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const filterBar = () => `<div class="filters"><label>Patch ${select('fl.v', optionsOf(0, m => m.v), ST.fl.v, 'All patches')}</label>
  <label>Mode ${select('fl.mode', optionsOf(1, m => m.hdr.GameMode).map(g => [g, modeName(g)]), ST.fl.mode, 'All modes')}</label><label>Match type ${select('fl.type', optionsOf(2, m => m.hdr.MatchType).sort((a, b) => Object.keys(TYPES).indexOf(a) - Object.keys(TYPES).indexOf(b)).map(t => [t, typeName(t)]), ST.fl.type, 'All types')}</label>
  <label>Solo matches ${select('fl.solo', [['', 'Left out'], ['1', 'Included']], ST.fl.solo)}</label><span class="dim">${num(S.total)} matches · ${covers()}</span></div>`;
const tabs = (path, opts, cur) => `<div class="tabs">${opts.map(o => { const [v, l, off] = Array.isArray(o) ? o : [o, o];
  return `<button data-st="${path}" data-v="${esc(v)}" class="${v === cur ? 'on' : ''}"${off ? ' disabled' : ''}>${l}</button>`; }).join('')}</div>`;

/* ---------- totals ----------
   ponytail: all of this runs in the browser on every load and every filter change. Fine for a few thousand matches;
   when the file gets heavy, do this join in the collector and ship the totals instead. */
const gsum = (mp, i) => Object.values(mp.grid).reduce((a, g) => a + g[i], 0);       // i: 0 domes, 1 Monster caught, 2 Monster damage, 3 Hunters downed, 4-6 domes at stage 1-3
const slicePasses = k => { const [v, mode, type, solo] = k.split('|'); return (!ST.fl.v || v === ST.fl.v) && (!ST.fl.mode || mode === ST.fl.mode) && (!ST.fl.type || type === ST.fl.type) && (ST.fl.solo || solo !== '1'); };
// The totals the pages show: counted from the loaded records, or, with stored totals, the stored groups the filters select added up.
function totals(filtered) {
  const recent = compute(filtered ? MATCHES.filter(passes) : MATCHES);
  if (!SUM) return recent;
  const parts = sliceKeys.filter(k => !filtered || slicePasses(k)).map(k => SUM.slices[k]);
  const T = parts.length ? SUMMARY.merge(parts) : SUMMARY.plain(compute([]));
  T.matches = recent.matches;                 // the match objects themselves exist only for what this page loaded
  for (const l of Object.values(T.lines || {})) l.vars = new Set(l.vars);
  return T;
}
let ALL = totals(false);       // players, ranked and the unfiltered pages
let S = totals(true);          // the stats pages, following the filter bar
/* The public site's totals come in parts (tools/summarize.js, publicFiles): a small core every visitor loads (each character's
   headline numbers, matchups, maps, the ladder), then, only when a page needs them, one character's full numbers ("char/<id>"),
   the rank split ("ranks"), perks and combinations ("perks") and the dome grids ("grids"). part() says whether one is here
   ('ok', 'loading' or 'missing') and fetches it the first time. The developer view loads the whole totals file, so for it
   every part is always here. */
const CHAR_PLAYERS = {}, CHAR_LEVELS = {};      // from a character's part: char id -> slice -> its players (5 or more matches on it), and their level
const part = name => !SUM?.split ? 'ok' : fetchOnce('part/' + name, `${SITE_DATA}/${name}.js?b=${encodeURIComponent(SUM.built)}`, d => { joinPart(d); return 'ok'; });
function joinPart(d) {
  for (const [k, p] of Object.entries(d.slices || {})) {
    const s = SUM.slices[k]; if (!s) continue;
    Object.assign(s.chars, p.chars);         // a character's full numbers take the place of its headline ones
    // a rank's characters: the headline ones from "ranks", the full ones from a character's part; full never gives way to headline
    for (const [rk, chars] of Object.entries(p.ranks || {})) { const r = cell(s.ranks ||= {}, rk, () => ({}));
      for (const [id, c] of Object.entries(chars)) if (!r[id] || r[id].light) r[id] = c; }
    if (p.perks) s.perks = p.perks;
    if (p.combos) s.combos = p.combos;
    for (const [key, grid] of Object.entries(p.grids || {})) if (s.maps[key]) s.maps[key].grid = grid;
  }
  Object.assign(CHAR_PLAYERS, d.players); Object.assign(CHAR_LEVELS, d.levels);
  ALL = totals(false); S = totals(true);
}
// what a page shows while a part it needs is on its way
const partWait = (got, what) => `<p class="dim">${got === 'missing' ? `The ${what} could not be loaded. Refresh in a minute.` : `Loading the ${what}…`}</p>`;
// Per-player rows are not in the stored totals, which every visitor downloads: they grow with every new player. The all-time table
// of players, and who played each character, sit in a file of their own beside the match files (tools/summarize.js writes it),
// fetched the first time a page needs it. roster() gives { players, chars }, or 'loading' / 'missing' until then.
// The public site's players file (players2.js) holds what its pages show: matches, play time, ladders, characters and the time of
// their newest match (`t`). Nothing from the account table (region, sign-in times) and no conduct.
// The developer view reads the whole table, conduct included, from the NAS's own folder (archive/dev, never uploaded).
const roster = () => !SUM ? { players: ALL.players } : SUM.split ? fetchOnce('players', `${SITE_DATA}/players2.js?b=${encodeURIComponent(SUM.built)}`)
  : fetchOnce('players', `${DEV_DATA}/players.js?t=${Math.floor(Date.now() / 600000)}`);
const waiting = (title, R) => `<h1>${title}</h1><p class="dim">${R === 'missing' ? 'The players list could not be loaded.' : 'Loading the players list…'}</p>`;

// On the page: the stored account totals, or, without them, the loaded records counted here.
const ACC = SUM?.account || (window.SUMMARY ? SUMMARY.plain(account(EVENTS, UNFINISHED.map(r => r.start))) : null);
// what a player's game says about their account (region, languages, sign-in times, queueing). The developer view's only: the public
// site has no account table.
const acct = id => ACC.players?.[id];
// the online regions players are in (the public totals carry only a count per region)
const regionList = () => [...new Set(ACC.players ? Object.values(ACC.players).map(p => p.region) : Object.keys(ACC.regions || {}))].sort();
// A character's own kit in a patch: the one most of that character's seats in the patch were recorded with, over every mode
// and match type (so a filter that leaves a handful of matches cannot make a leftover kit look like the usual one).
function ownKit(id) {
  const n = {};
  for (const k of SUM ? sliceKeys : ['']) { const kits = (SUM ? SUM.slices[k] : ALL).chars[id]?.kits || {}, v = k.split('|')[0];
    for (const [sig, kit] of Object.entries(kits)) if (sig[0] !== '!') cell(n, v, () => ({}))[sig] = (n[v][sig] || 0) + kit.n; }
  return Object.fromEntries(Object.entries(n).map(([v, o]) => [v, Object.keys(o).sort((a, b) => o[b] - o[a] || a.localeCompare(b))[0]]));
}
// a character's damage, healing, weapon and ability numbers under the current filters, from seats recorded with their own kit
function ownNumbers(id, rank = '') {
  const cache = S.own || (S.own = {}), key = id + '|' + rank;        // S is rebuilt whenever a filter changes
  if (cache[key]) return cache[key];
  const own = ownKit(id), mine = new Set(Object.values(own));
  // (with a rank chosen the piles of all patches are already added together, so "own kit" is the own kit of any patch)
  const parts = rank ? Object.entries(rankChars()[id]?.kits || {}).filter(([sig]) => mine.has(sig)).map(([, kit]) => kit)
    : SUM ? sliceKeys.filter(slicePasses).map(k => SUM.slices[k].chars[id]?.kits[own[k.split('|')[0]]]) : [S.chars[id]?.kits[own['']]];
  return cache[key] = SUMMARY.merge(parts.filter(Boolean)) || { n: 0, dmg: 0, taken: 0, heal: 0, wlTo: 0, wlFrom: 0, st: [], items: {}, src: {}, builds: {}, pts: [0, 1, 2].map(() => [0, 0, 0, 0]), lvN: [0, 0, 0] };
}
// The Rank filter of the Characters pages. A choice is one division ("Silver Expert"), a whole tier ("tier:silver") or
// NO_RANK. rankChars() is S.chars for that choice: the seats of ranked matches whose player held that rank going in.
const rankList = () => { const have = Object.keys(S.ranks || {}), at = k => { const i = C.ranks.findIndex(r => k.startsWith(r.name)); return i < 0 ? 99 : i; };
  return have.sort((a, b) => at(a) - at(b) || a.localeCompare(b)); };
const inRank = (k, sel) => sel.startsWith('tier:') ? k !== NO_RANK && k.toLowerCase().startsWith(sel.slice(5)) : k === sel;
function rankChars() {
  const cache = S.rk || (S.rk = {}), sel = ST.fl.rank;
  return cache[sel] || (cache[sel] = SUMMARY.merge(Object.entries(S.ranks || {}).filter(([k]) => inRank(k, sel)).map(([, chars]) => chars)) || {});
}
const rankSeats = k => Object.values(S.ranks[k]).reduce((a, c) => a + c.n, 0);
const rankBar = () => { if (part('ranks') !== 'ok') return '';      // the Rank filter appears once the rank split is here
  const list = rankList(), tiers = ['bronze', 'silver', 'gold'].filter(t => list.some(k => inRank(k, 'tier:' + t)));
  return !list.length ? '' : `<div class="filters"><label>Rank ${select('fl.rank', [...tiers.map(t => ['tier:' + t, `${t[0].toUpperCase() + t.slice(1)} (all) · ${num(list.filter(k => inRank(k, 'tier:' + t)).reduce((a, k) => a + rankSeats(k), 0))}`]),
    ...list.map(k => [k, `${k} · ${num(rankSeats(k))}`])], ST.fl.rank, 'All ranks, all matches')}</label></div>
  ${ST.fl.rank ? `<p class="note">Rank filter: ranked matches only. Each player is counted under the division of the rating they had going into the match, so matches played during placement are included; a player's first ranked match has no rating yet. The number beside each rank is how many players' matches it holds. Pick rate is the share of that class's players at this rank.</p>` : ''}`; };
// Hunters against the Monster under the current filters: the share of matches with a winner that each side won
const versus = () => { const h = pct(S.hw, S.decided); return h == null ? '' : `<div class="versus"><b class="h">Hunters ${fpct(h)}</b><span class="vbar" role="img" aria-label="Hunters won ${fpct(h)}, the Monster ${fpct(100 - h)}"><i style="width:${h.toFixed(1)}%"></i></span><b class="m">${fpct(100 - h)} Monster</b></div>
  <p class="note">${num(S.hw)} Hunter wins and ${num(S.decided - S.hw)} Monster wins in ${num(S.decided)} matches with a winner${S.total - S.decided ? ` (${num(S.total - S.decided)} more ended without one)` : ''}.</p>`; };
// Pick rate means the same thing everywhere on the site (owner's rule): the share of matches the thing appeared in,
// 100% = it was in every match. Only people count: a slot filled by a bot is left out of both halves of the sum, so a
// class's characters always add up to 100%. `group` is a class for characters, or 'hunter' / 'monster' for perks.
const people = group => group === 'hunter' || group === 'monster' ? S.side[group] : S.total - (S.bots[group] || 0);
const pickRate = (n, group) => pct(n, people(group));

/* ---------- sortable table ---------- */
const sortState = {};
// href(row) makes the whole row open that address when clicked or tapped.
// min: the matches a win rate needs before it can lead (Roger, 2026-11-09: no more 1-match 100% rows on top). A rate column
// made with W() knows its own sample; below min its cell is greyed, and when the table is sorted by it those rows come after
// all the others, in the same order. Nothing is hidden.
// A closed box for detail a reader opens only when they want it. It stays open across re-renders (sorting, filters).
const FOLDS = new Set();
const fold = (key, title, hint, body) => `<details class="fold" data-fold="${key}"${FOLDS.has(key) ? ' open' : ''}><summary><b>${title}</b><span class="dim">${hint}</span></summary><div class="in">${body}</div></details>`;
function table(id, cols, rows, def = 0, limit = 0, asc = false, href = null, min = 0) {
  const st = sortState[id] || (sortState[id] = { i: def, dir: asc ? 1 : -1 }), col = cols[st.i] || cols[0];
  const few = (c, r) => !!(min && c.cnt && c.cnt(r) < min);
  let sorted = [...rows].sort((a, b) => {
    const x = col.v(a), y = col.v(b);
    if (x == null || y == null) return (x == null) - (y == null);
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir;
  });
  const fewN = sorted.filter(r => few(col, r)).length;
  if (fewN) sorted = [...sorted.filter(r => !few(col, r)), ...sorted.filter(r => few(col, r))];
  // limit: rows per page; numbered pages under the table let a reader go through the whole sorted list
  const total = sorted.length, pages = limit ? Math.max(1, Math.ceil(total / limit)) : 1, pg = Math.min(st.pg || 0, pages - 1);
  if (limit) sorted = sorted.slice(pg * limit, pg * limit + limit);
  const pgBtn = (q, label, off) => `<button data-pg="${esc(id)}" data-p="${q}"${q === pg ? ' class="on"' : ''}${off ? ' disabled' : ''}>${label}</button>`;
  const near = [...new Set([0, pg - 1, pg, pg + 1, pages - 1])].filter(q => q >= 0 && q < pages).sort((a, b) => a - b);
  const pager = pages < 2 ? '' : `<div class="pager">${pgBtn(pg - 1, '‹', !pg)}${near.map((q, i) => (i && q - near[i - 1] > 1 ? '<span class="dim">…</span>' : '') + pgBtn(q, q + 1)).join('')}${pgBtn(pg + 1, '›', pg === pages - 1)}
    <span class="dim">${num(pg * limit + 1)}–${num(Math.min(total, pg * limit + limit))} of ${num(total)}</span></div>`;
  return `<div class="tw"><table><thead><tr>${cols.map((c, i) => `<th class="${c.n ? 'n' : ''}${i === st.i ? ' on' : ''}" aria-sort="${i === st.i ? (st.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button data-sort="${esc(id)}" data-i="${i}">${c.h}${i === st.i ? (st.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr></thead>
  <tbody>${sorted.map(r => `<tr${href ? ` data-href="${esc(href(r))}"` : ''}>${cols.map(c => few(c, r)
    ? `<td class="${c.n ? 'n ' : ''}few" title="Fewer than ${num(min)} matches">${c.r ? c.r(r) : esc(c.v(r) ?? '–')}</td>`
    : `<td class="${c.n ? 'n' : ''}">${c.r ? c.r(r) : esc(c.v(r) ?? '–')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="dim">Nothing recorded yet.</td></tr>`}</tbody></table></div>${pager}`
  + (fewN ? `<p class="note">Only rows with ${num(min)} or more matches are ranked by ${esc(col.h)}. The ${plural(fewN, 'row', 'rows')} with fewer ${fewN === 1 ? 'comes' : 'come'} after them, greyed.</p>` : '');
}
const N = (h, v, r) => ({ h, v, r: r || (x => num(v(x))), n: 1 });
const P = (h, v) => N(h, v, x => fpct(v(x)));
// a win rate with its sample (cnt: the matches it comes from), so table()'s minimum can keep small samples from leading
const W = (h, v, r, cnt) => ({ ...N(h, v, r || (x => fpct(v(x)))), cnt });
// the minimum for perks: 30 matches, or 1% of the matches they are out of when that is more
const FEW = 30, minOf = base => Math.max(FEW, Math.ceil((base || 0) / 100));
// Perk combinations: only loadouts with more than COMBO_MIN matches are listed at all (Roger, 2026-11-09), so a handful of
// games never decides anything; the note under the table says how many were left out.
const COMBO_MIN = 30, comboRows = all => all.filter(x => x.n > COMBO_MIN);
const comboNote = (all, base) => { const out = all.length - comboRows(all).length;
  return `<p class="note">${out ? `Only loadouts with more than ${COMBO_MIN} matches are listed; ${plural(out, 'rarer one is', 'rarer ones are')} left out. ` : ''}Adjusted
  counts each loadout as if it also had ${ADJ_K} matches at the average win rate of the loadouts listed (${fpct(100 * base)}), so a
  short lucky run does not lead. Sort by it to find the strongest loadouts.</p>`; };
// Adjusted win rate (Roger, 2026-11-09), on "Most matches on" and perk combinations: each row counted as if it also had ADJ_K
// matches at the average win rate of the rows listed (for players, the character's regulars: 65.9% on Goliath on 9 Nov). ADJ_K is the site's own rule, "proven over many
// games": the 9 Nov data suggests about 20-35 for Hunters but only about 3 for Monsters, whose players differ far more, and
// with 3 the Goliath list would be led by 14-0 and 18-0 records again.
const ADJ_K = 20;
// win rates of the listed rows, and the Adjusted column for them (what: "player", "loadout", "build"; get: a row's wins and decided)
const adjusted = (list, what, get = x => x) => { const w = list.reduce((a, x) => a + get(x).w, 0), d = list.reduce((a, x) => a + get(x).d, 0), base = d ? w / d : 0.5;
  const value = x => 100 * (get(x).w + ADJ_K * base) / (get(x).d + ADJ_K);
  return { base, value, col: P(`<span title="Win rate as if each ${what} also had ${ADJ_K} matches at the average win rate of the ${what}s listed">Adjusted</span>`, value) }; };
const Tx = (h, v, r) => ({ h, v, r });
// what usually sets a voice line off: its most common trigger (ties go to the first in A to Z order), with a count of the others
const trigger = l => { const e = Object.entries(l.events || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); return e.length ? e[0][0] + (e.length > 1 ? ` (+${e.length - 1} more)` : '') : '–'; };
const count = (list, key) => { const o = {}; for (const x of list) { const k = key(x); if (k != null) o[k] = (o[k] || 0) + 1; } return Object.entries(o).map(([k, n]) => ({ k, n })); };

/* ---------- shared pieces ---------- */
function matchRow(m, role) {
  const res = role ? (won(m, role) ? ['w', 'Win'] : m.decided ? ['l', 'Loss'] : ['', 'No result'])
                   : (m.hunterWin ? ['h', 'Hunters'] : m.decided ? ['m', 'Monster'] : ['', 'No result']);
  const cd = role && m.clients[role]?.Data, extra = cd ? `${cd.LateJoiner ? ' · joined late' : ''}${cd.ChatMessagesSent ? ` · ${cd.ChatMessagesSent} chat` : ''}` : '';
  return `<a class="mrow" href="#/match/${encodeURIComponent(m.id)}"><span class="res ${res[0]}">${res[1]}</span>
    <span class="comp">${HUNTERS.map(r => face(m.hdr.CharacterId[r])).join('')}<span class="vs">vs</span>${face(m.hdr.CharacterId.Monster)}</span>
    <span class="meta">${esc(mapInfo(m.mapKey).name)} · ${clock(m.dur)} · ${day(m.t)}${extra}</span></a>`;
}
const endLabel = (team, cond) => `${team === 'Merc' ? 'Hunters' : team === 'Monster' ? 'Monster' : 'No winner'} · ${cond ? pretty(cond) : 'unknown'}`;
const endsTable = (id, ends, total) => table(id, [Tx('Ending', e => e.k, e => { const [t, c] = e.k.split('|'); return endLabel(t, c); }), N('Matches', e => e.n), N('Share', e => pct(e.n, total), e => bar(pct(e.n, total)))],
  Object.entries(ends).map(([k, v]) => ({ k, n: v.n })), 1);
const HEAT = [['all', 'All fights'], ['caught', 'Monster caught'], ['dmg', 'Monster damage'], ['downs', 'Hunters down'], ['s1', 'Stage 1'], ['s2', 'Stage 2'], ['s3', 'Stage 3'], ['move', 'Movement'], ['fps', 'Frame rate']];
function heat(mapKey, domes, view = 'all', numbered = false) {
  const info = mapInfo(mapKey), b = mapBounds(mapKey);
  if (view === 'move' || view === 'fps') return `<div class="heat">${img(info.minimap, '', info.name)}<div class="none">No data. The game builds this record but never switches it on (${num(ACC.records?.ClientProfilingRecord?.n || 0)} received).</div></div>`;
  // one match: its own domes, numbered. The totals: the grid compute() counted, a cell the brighter the more it holds of what the view shows.
  const col = { all: 0, caught: 1, dmg: 2, downs: 3, s1: 4, s2: 5, s3: 6 }[view];
  const pts = numbered ? domes : Object.entries(domes).filter(([k, g]) => g[col] && k !== 'off').map(([k, g]) => { const [i, j] = k.split('|').map(Number); return { i, j, wt: g[col] }; });
  const mx = pts.reduce((a, p) => Math.max(a, p.wt || 1), 1);
  return `<div class="heat">${img(info.minimap, '', info.name)}<svg viewBox="0 0 100 100" role="img" aria-label="Dome positions on ${esc(info.name)}">${pts.map((p, i) => {
    if (!numbered) return `<rect x="${p.i * 100 / GRID}" y="${100 - (p.j + 1) * 100 / GRID}" width="${100 / GRID}" height="${100 / GRID}" fill="#ff3b1f" opacity="${(.1 + .8 * p.wt / mx).toFixed(2)}"/>`;
    const x = ((p.x - b[0]) / (b[2] - b[0]) * 100).toFixed(1), y = (100 - (p.y - b[1]) / (b[3] - b[1]) * 100).toFixed(1);       // the minimap is north up: world y grows upward
    return `<circle cx="${x}" cy="${y}" r="3.2" fill="${p.caught ? '#c0392b' : '#777'}" stroke="#fff" stroke-width=".4"/><text x="${x}" y="${(+y + 1.2).toFixed(1)}" font-size="3.4" text-anchor="middle" fill="#fff">${i + 1}</text>`; }).join('')}</svg></div>`;
}

/* ---------- pages ---------- */
// a fourth entry `true`: the developer view only
const SECTIONS = [['characters', 'Characters', 'Who gets picked and who wins'], ['matchups', 'Matchups', 'Who wins versus who'], ['perks', 'Perks', 'Which perks are picked the most, and which are not'],
  ['maps', 'Maps', 'Which side wins on each map, and where the fights happen'], ['ranked', 'Ranked', 'The ranked leaderboard'], ['players', 'Players', 'Look up any player'],
  ['matches', 'Matches', 'Every match played, day by day'], ['matchmaking', 'Matchmaking', 'How long queues take, how even matches are, and leavers'], ['progression', 'Progression', 'XP, levels, keys and challenges', true], ['store', 'Store', 'What gets bought', true],
  ['dialogue', 'Dialogue', 'Which voice lines play the most', true], ['community', 'Community', 'Who is playing, where and when'], ['fairplay', 'Fair play', 'Leavers, dodgers and kicks', true],
  ['about', 'About the data', 'Where the numbers come from']].filter(s => !PUBLIC || !s[3]);
document.getElementById('nav').innerHTML = `<a href="#/" data-r="">Overview</a>` + SECTIONS.map(s => `<a href="#/${s[0]}" data-r="${s[0]}">${s[1]}</a>`).join('');

function overview() {
  return `<div class="hero"><h1>Modded Evolve Telemetry</h1>
    <p class="sub">Statistics for Evolve Stage 2, built from the records the game writes about every match, queue and sign-in. Pick a section.</p></div>
  ${filterBar()}${versus()}
  <div class="tiles">${SECTIONS.map(s => `<a class="tile" href="#/${s[0]}"><div class="v" style="font-size:1.25rem">${s[1]}</div><div class="n" style="font-size:.95rem">${s[2]}</div></a>`).join('')}</div>`;
}

function characters() {
  const R = ST.fl.rank, chars = R ? rankChars() : S.chars, seats = {};
  for (const c of Object.values(chars)) seats[c.role] = (seats[c.role] || 0) + c.n;         // with a rank: that class's players at the rank
  const rows = Object.values(chars).filter(c => ST.chars.cls === 'All' || c.role === ST.chars.cls), own = c => ownNumbers(c.id, R);
  return `<h1>Characters</h1><p class="sub">How often each character is picked, and how often that side wins. Pick rate is the share of matches the character was played in: 100% would mean every match. Only matches played by people are counted.</p>${filterBar()}${rankBar()}${R ? '' : versus()}
  ${tabs('chars.cls', ['All', ...ROLES.map(r => [r, img(C.classIcons[r], 'cls') + r])], ST.chars.cls)}
  ${hint('Tap a character to open its full page: weapons and abilities, stages, perks, skins, opponents and more.')}
  <div class="bigchips">${table('chars', [Tx('Character', c => charInfo(c.id).name, c => chip(c.id, true)), Tx('Class', c => c.role, c => classCell(c.role)),
    N('Matches', c => c.n), P('Pick rate', c => R ? pct(c.n, seats[c.role]) : pickRate(c.n, c.role)), W('Win rate', c => pct(c.w, c.d), c => `<span class="c-${c.role}">${bar(pct(c.w, c.d))}</span>`, c => c.n),
    N('Damage dealt', c => avg(own(c).dmg, own(c).n)), N('Damage taken', c => avg(own(c).taken, own(c).n)), N('Healing done', c => avg(own(c).heal, own(c).n) || null),
    N('Avg level', c => avg(c.lvl, c.lvlN), c => dec(avg(c.lvl, c.lvlN)))], rows, 2, 0, false, c => charHref(c.id), FEW)}</div>
  <p class="note">${(ST.chars.cls === 'All' ? ROLES : [ST.chars.cls]).map(r => R ? `${r}: ${num(seats[r] || 0)} players' matches at this rank` : `${r}: a person played it in ${num(people(r))} of the ${num(S.total)} matches${S.bots[r] ? ` (a bot in the other ${num(S.bots[r])})` : ''}`).join(' · ')}.
    Each class's pick rates are out of its own number and add up to 100%.</p>
  <p class="note">Damage and healing are averages per match, against the other team only, from the matches whose damage record can be relied on (a few in every hundred cannot; About the data explains).</p>`;
}

function character(id) {
  // with a rank chosen, the pick rate needs every character at that rank too (the rank split)
  const info = charInfo(id), got = [part('char/' + id), ST.fl.rank ? part('ranks') : 'ok'].find(g => g !== 'ok') || 'ok';
  if (got !== 'ok') return `<h1>${esc(info.name)}</h1>${partWait(got, 'numbers for ' + esc(info.name))}`;
  const R = ST.fl.rank, chars = R ? rankChars() : S.chars, c = chars[id];
  if (!c) return `<h1>${esc(info.name)}</h1>${filterBar()}${rankBar()}<p class="sub">No matches recorded for this character with these filters.</p>`;
  const classSeats = Object.values(chars).reduce((a, x) => a + (x.role === c.role ? x.n : 0), 0);
  // damage, healing, weapons, abilities and sources: only seats recorded with this character's own kit; each slot is named after their own item
  const kit = ownNumbers(id, R), named = (label, key) => slotItem(id, label) || itemInfo(key);
  const mon = c.role === 'Monster', items = Object.values(kit.items).map(it => ({ ...it, info: named(it.label, it.key) })), total = items.reduce((a, it) => a + it.dmg, 0);
  const leftOut = c.n - kit.n ? `<p class="note">Damage, healing, weapon and ability numbers on this page come from ${num(kit.n)} of these ${num(c.n)} matches. The other ${num(c.n - kit.n)} are left out because the game's record of them cannot be relied on: the match came right after one its host had started and never finished (the game can carry weapon data over from it), or the record lists weapons that are not this character's own (in the tutorial, a cut-down kit), or it holds an impossible number. They still count for matches, pick rate and win rate.</p>` : '';
  // the four ability slots, for the skill-point tables: the item most often seen in each slot
  const inSlot = j => Object.values(kit.items).filter(it => it.label === 'Ability' + j).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))[0];
  const abil = [1, 2, 3, 4].map(j => inSlot(j) ? named('Ability' + j, inSlot(j).key) : slotItem(id, 'Ability' + j) || { name: 'Ability ' + j, icon: '' });
  // Builds, stage by stage (owner's rule: every match counts, however far it got). A match counts at each stage its Monster
  // reached, with the exact points it held in every ability by then; so a match that ended at Stage 2 is in the Stage 1 and
  // Stage 2 lists, and the three lists never need an empty column.
  const buildsBy = stage => Object.values(Object.values(kit.builds).filter(b => b.levels.length >= stage).reduce((o, b) => {
    const pts = b.levels[stage - 1], x = cell(o, pts.join('·'), () => ({ n: 0, w: 0, d: 0, pts })); x.n += b.n; x.w += b.w; x.d += b.d; return o; }, {})).sort((a, b) => b.n - a.n);
  // Builds at one stage: the points held in each ability by the end of it, with matches and win rate. (A table of each
  // ability's share of the points spent was dropped on 2026-11-09, Roger: every ability got about 20-33%, so it said little.)
  const bst = +ST.chars.bst || 3, stageList = buildsBy(bst), stageAll = stageList.reduce((x, y) => x + y.n, 0), bAdj = adjusted(stageList.filter(x => x.n >= FEW), 'build');
  const buildTable = table(`bld-${id}-${bst}`, [...abil.map((ab, j) => N(`${icon(ab.icon)}${esc(ab.name)}`, x => x.pts[j], x => pips(x.pts[j]))),
    N('Matches', x => x.n), P('Share', x => pct(x.n, stageAll)), W('Win rate', x => pct(x.w, x.d), null, x => x.n), bAdj.col],
    stageList, 4, 10, false, null, FEW) + `<p class="note">Adjusted counts each build as if it also had ${ADJ_K} matches at the average win rate
    of the builds with ${FEW} or more matches (${fpct(100 * bAdj.base)}), so a build with few matches does not lead by luck.</p>`;
  // Order (Roger, 2026-11-09): what players come for first (perks, builds, matchups, abilities); per-stage numbers, wildlife,
  // damage sources and skins sit in closed boxes at the bottom, still one tap away.
  const ccList = comboRows(Object.values(c.combos)), ccAdj = adjusted(ccList, 'loadout');
  return `<div class="headline c-${c.role}">${img(info.thumb, 'big', info.name)}<div>${classTag(c.role)}<h1 style="margin-top:.4rem">${esc(info.name)}</h1></div></div>${filterBar()}${rankBar()}
  ${tiles(tile('Matches', num(c.n)), tile('Pick rate', fpct(R ? pct(c.n, classSeats) : pickRate(c.n, c.role)), R ? `of ${c.role} players at this rank` : `of ${c.role} matches`), tile('Win rate', fpct(pct(c.w, c.d))),
    tile('Damage dealt', num(avg(kit.dmg, kit.n)), 'per match'), tile('Damage taken', num(avg(kit.taken, kit.n)), 'per match'),
    mon ? tile('Feeding', dec(avg(c.feed, c.n)), 'per match') : tile('Deaths', dec(avg(c.deaths, c.n)), `${dec(avg(c.downs, c.n))} downs per match`))}
  <div>
    <section><h2>Perks picked</h2><p class="lead">How often each perk is taken with ${esc(info.name)}, and how often those matches are won.</p>${table('cp-' + id, [Tx('Perk', p => perkInfo(p.key).name, p => `${img(perkInfo(p.key).icon, 'perk')} ${esc(perkInfo(p.key).name)}`),
      P('Pick rate', p => pct(p.n, c.n)), N('Matches', p => p.n), W('Win rate', p => pct(p.w, p.d), null, p => p.n)], Object.values(c.perks), 1, 10, false, null, minOf(c.n))}</section>
    <section><h2>Perk combinations</h2><p class="lead">The full set of perks taken together in one match.</p>${table('cc-' + id, [Tx('Perks', x => x.keys.join(), x => perkIcons(x.keys) + ' <span class="dim">' + x.keys.map(k => esc(perkInfo(k).name)).join(', ') + '</span>'), N('Matches', x => x.n), W('Win rate', x => pct(x.w, x.d), null, x => x.n), ccAdj.col], ccList, 1, 10)}${comboNote(Object.values(c.combos), ccAdj.base)}</section>
  </div>
  ${mon ? `<h2>Builds</h2>
      <p class="lead">Each row is one build: the points players had in each ability at the end of the stage, out of 3 (● is a
      point), and how often it wins. Pick a stage to see how builds start and grow. Only matches that reached that stage count.</p>
      ${tabs('chars.bst', [1, 2, 3].map(st => [String(st), 'Stage ' + st, !buildsBy(st).length]), String(bst))}${buildTable}` : ''}
  <div class="cols">
    <section><h2>${mon ? 'Against each Hunter' : 'Against each Monster'}</h2><p class="lead">${esc(info.name)}'s win rate in matches against each ${mon ? 'Hunter' : 'Monster'}.</p>${table('vs-' + id, [Tx('Opponent', v => charInfo(v.id).name, v => chip(v.id)), N('Matches', v => v.n),
      W('Win rate', v => pct(v.w, v.d), v => `<span class="c-${c.role}">${bar(pct(v.w, v.d))}</span>`, v => v.n)], Object.entries(c.vs).map(([k, v]) => ({ id: k, ...v })), 1, 10, false, v => charHref(v.id), FEW)}</section>
    <section>${topPlayers(id, c, info.name)}</section>
  </div>
  <h2>${mon ? 'Abilities and attacks' : 'Weapons and equipment'}</h2>
  <p class="lead">Per match: how often each is used, how often it lands, and how much damage it does. Share is its part of all the damage ${esc(info.name)} deals.</p>
  ${table('items-' + id, [Tx('Item', it => SLOT_ORDER[mon ? 1 : 0].indexOf(it.label) + 1 || 99, it => `${icon(it.info.icon)}${esc(it.info.name || it.label)}`),
    N('Uses', it => avg(it.uses, it.n) || null, it => it.uses ? dec(it.uses / it.n) : '–'), N('Misses', it => avg(it.miss, it.n) || null, it => it.uses ? dec(it.miss / it.n) : '–'),
    N('Hits', it => avg(it.hits, it.n) || null, it => it.uses ? dec(it.hits / it.n) : '–'), N('Wildlife hits', it => avg(it.hitsWl, it.n) || null, it => it.uses ? dec(it.hitsWl / it.n) : '–'),
    mon ? P('Hit rate', it => pct(it.hits, it.uses)) : N('Damage per use', it => avg(it.dmg, it.uses)),
    N('Damage', it => avg(it.dmg, it.n)), N('To wildlife', it => avg(it.dmgWl, it.n)), N('Share', it => pct(it.dmg, total), it => bar(pct(it.dmg, total)))], items, 0, 0, true)}
  <p class="note">${mon ? 'A use counts as a hit when it damages a Hunter before the ability is used again.' : 'The game counts every damage tick as a hit, so hits can exceed uses and its miss count is unreliable for Hunters.'} Averages per match.</p>${leftOut}
  ${mon ? '' : `<div class="cols"><section><h2>Healing and shielding</h2><div class="panel">${kv('Healing done', num(avg(kit.heal, kit.n)) + ' per match')}${kv('Healing received', num(avg(c.healRecv, c.n)) + ' per match')}
      ${kv('Shielding received', num(avg(c.shield, c.n)) + ' per match')}${kv('Dropship returns', dec(avg(c.ships, c.n)) + ' per match')}</div></section>
    <section><h2>When ${esc(info.name)} goes down</h2><div class="panel c-${c.role}">${chart(c.downT, c.downT.map((_, i) => i + (i === 19 ? '+' : '')))}<p class="note">Downs by minute of the match.</p></div></section></div>`}
  <h2>More detail</h2>
  ${fold('more', 'By Monster stage, wildlife and level', 'damage dealt and taken at each stage, wildlife, average level', tiles(tile('Average level', dec(avg(c.lvl, c.lvlN))),
    tile('To wildlife', num(avg(kit.wlTo, kit.n)), 'damage per match'), tile('From wildlife', num(avg(kit.wlFrom, kit.n)), 'damage per match')) + `
    ${table('stage-' + id, [Tx('Stage', s => s.i, s => 'Stage ' + s.i), N('Matches reaching it', s => s.n), N('Damage dealt', s => avg(s.to, s.n)), N('Damage taken', s => avg(s.from, s.n)),
    N('To wildlife', s => avg(s.wlTo, s.n)), N('From wildlife', s => avg(s.wlFrom, s.n)), mon ? P('Hit rate', s => pct(s.hits, s.uses)) : N('Healing done', s => avg(s.heal, s.n) || null)],
    kit.st.map((s, i) => ({ ...s, i })).filter(s => s.i && s.n), 0, 0, true)}
    ${mon ? `<h3 style="margin-top:1.2rem">Stages</h3><div class="panel">${[1, 2, 3].map(s => kv(`First fight at Stage ${s}`, plural(c.firstStage[s] || 0, 'match', 'matches'))).join('')}${[1, 2, 3].map(s => kv(`Finished at Stage ${s}`, plural(c.finalStage[s] || 0, 'match', 'matches'))).join('')}</div>` : ''}`)}
  ${fold('src', 'Damage and healing sources', `every effect that dealt or healed damage, ${Object.keys(kit.src).length} sources`, `${table('src-' + id, [Tx('Source', s => named(s.name, s.name).name), Tx('Kind', s => s.kind), N('Per match', s => s.s[0] / kit.n), N('Stage 1', s => s.s[1] / kit.n), N('Stage 2', s => s.s[2] / kit.n), N('Stage 3', s => s.s[3] / kit.n)], Object.values(kit.src), 2)}`)}
  ${fold('skins', 'Skins used', `${Object.keys(c.skins).length} skins`, `${table('skin-' + id, [Tx('Skin', s => s.k), N('Matches', s => s.n), N('Share', s => pct(s.n, sumv(c.skins)), s => bar(pct(s.n, sumv(c.skins))))], Object.entries(c.skins).map(([k, n]) => ({ k, n })), 1)}`)}`;
}

function matchups() {
  // every character, in tier order (the catalog lists them tier 1 first, variants after their base); nothing here links away
  const inTier = role => Object.keys(C.characters).filter(id => C.characters[id].class === role), mons = inTier('Monster');
  const label = id => `<span class="chip">${img(charInfo(id).thumb, '')}<span>${esc(charInfo(id).name)}</span></span>`;
  // Hunter-favoured cells use the Stage 2 website's Hunter blue (#2f6f9f); Monster-favoured cells the Monster red
  const shade = v => v >= 50 ? `rgba(47,111,159,${Math.min(.95, .2 + (v - 50) / 38)})` : `rgba(139,26,26,${Math.min(.95, .15 + (50 - v) / 40)})`;
  return `<h1>Matchups</h1>${hint('Who wins versus who: how often the Hunters win when this Hunter faces this Monster. Blue favours the Hunter, red favours the Monster. Under each percentage is the number of matches it comes from. Pairs with fewer than 3 matches are left blank, and pairs with fewer than ' + FEW + ' are shown in grey: too few to say who is favoured. Hunters and Monsters are listed in tier order.')}${filterBar()}
  <div class="tw" style="border:0"><table class="grid"><thead><tr><th></th>${mons.map(m => `<th>${face(m)}${esc(charInfo(m).name)}</th>`).join('')}</tr></thead><tbody>
  ${HUNTERS.map(role => `<tr class="sep"><td colspan="${mons.length + 1}">${role}</td></tr>` + inTier(role).map(h =>
    `<tr><td>${label(h)}</td>${mons.map(m => { const v = S.chars[h]?.vs[m]; return v && v.n >= 3
      ? `<td class="cell" style="background:${v.n >= FEW ? shade(pct(v.w, v.d) ?? 50) : 'rgba(255,255,255,.06)'}" title="${v.w} Hunter wins in ${v.n} matches">${v.d ? pct(v.w, v.d).toFixed(0) + '%' : '–'}<small>${v.n} matches</small></td>`
      : `<td class="cell dim" title="${v ? v.n : 0} matches">·</td>`; }).join('')}</tr>`).join('')).join('')}
  </tbody></table></div>`;
}

function perks() {
  // the characters that bring a perk most often, as a share of that character's own matches (at least 3 uses, so one-offs don't lead)
  const fans = p => Object.entries(p.chars).filter(([, n]) => n >= 3).map(([id, n]) => ({ id, share: pct(n, S.chars[id].n) })).sort((a, b) => b.share - a.share).slice(0, 3);
  // one list at a time, ten rows a page, so the page is short on a phone
  const k = ST.perks, team = ['hunter', 'monster', 'char'].includes(k.tab) ? k.tab : 'hunter', top = 10;
  // the three-perk combinations for whichever list is showing, under its perk table, with their own pages
  const comboCell = x => perkIcons(x.keys) + ' <span class="dim">' + x.keys.map(key => esc(perkInfo(key).name)).join(', ') + '</span>';
  const combosTable = (id, title, rows, rate, list = comboRows(rows), ad = adjusted(list, 'loadout')) => `<h2>${title}</h2>` + table(id, [Tx('Combination', x => x.keys.join(), comboCell), P('Pick rate', rate), N('Matches', x => x.n),
    W('Win rate', x => pct(x.w, x.d), null, x => x.n), ad.col], list, 1, 10) + comboNote(rows, ad.base);
  let body;
  const ids = ROLES.flatMap(r => Object.keys(C.characters).filter(x => C.characters[x].class === r)), id = C.characters[k.char] ? k.char : ids[0];
  const got = part(team === 'char' ? 'char/' + id : 'perks');
  if (got !== 'ok') body = partWait(got, team === 'char' ? 'perks for ' + esc(charInfo(id).name) : 'perks');
  else if (team === 'char') {
    // one character's perks: every number here is measured against that character's own matches
    const c = S.chars[id], info = charInfo(id), perkCell = p => `${img(perkInfo(p.key).icon, 'perk')} ${esc(perkInfo(p.key).name)}`;
    const rows = Object.values(c?.perks || {}).filter(p => !k.tier || perkInfo(p.key).tier === k.tier), combos = Object.values(c?.combos || {});
    body = `<div class="filters"><label>Character ${select('perks.char', ids.map(x => [x, `${charInfo(x).class} · ${charInfo(x).name}`]), id)}</label>
        <span class="clscell">${img(info.thumb, 'face', info.name)}${img(C.classIcons[info.class], 'cls', info.class)}<b>${esc(info.name)}</b><span class="dim">${num(c?.n || 0)} matches</span></span>
        <a href="${charHref(id)}">${cue('Full stats')}</a></div>` +
      tabs('perks.tier', [['', 'All tiers'], 'Minor', 'Major', 'Superior'], k.tier) +
      table('perks-char', [Tx('Perk', p => perkInfo(p.key).name, perkCell), Tx('Tier', p => perkInfo(p.key).tier), P('Pick rate', p => pct(p.n, c.n)), N('Matches', p => p.n),
        W('Win rate', p => pct(p.w, p.d), p => `<span class="c-${esc(info.class)}">${bar(pct(p.w, p.d))}</span>`, p => p.n)], rows, 2, top, false, null, minOf(c?.n)) +
      combosTable('combos-char', `Combinations on ${esc(info.name)}`, combos, x => pct(x.n, c.n)) +
      `<p class="note">On this tab, pick rate is the share of ${esc(info.name)}'s own matches where the perk or combination was brought.</p>`;
  } else {
    const rows = Object.values(S.perks).filter(p => p.team === team && (!k.tier || perkInfo(p.key).tier === k.tier));
    body = tabs('perks.tier', [['', 'All tiers'], 'Minor', 'Major', 'Superior'], k.tier) +
      table('perks-' + team, [Tx('Perk', p => perkInfo(p.key).name, p => `${img(perkInfo(p.key).icon, 'perk')} ${esc(perkInfo(p.key).name)}`), Tx('Tier', p => perkInfo(p.key).tier),
        N('Usual slot', p => p.slots.indexOf(Math.max(...p.slots)) + 1), P('Pick rate', p => pickRate(p.m, team)), N('Matches', p => p.m),
        Tx('Most used on', p => charInfo(fans(p)[0]?.id || '').name, p => `<span class="comp">${fans(p).map(f => `<a href="#/character/${encodeURIComponent(f.id)}" title="${esc(charInfo(f.id).name)}: in ${fpct(f.share)} of their matches">${face(f.id)}</a>`).join('') || '<span class="dim">–</span>'}</span>`),
        W('Win rate', p => pct(p.mw, p.md), p => `<span class="${team === 'monster' ? 'c-Monster' : 'c-Medic'}">${bar(pct(p.mw, p.md))}</span>`, p => p.m)], rows, 3, top, false, null, minOf(people(team))) +
      combosTable('combos-' + team, team === 'monster' ? 'Monster perk combinations' : 'Hunter perk combinations', Object.values(S.combos).filter(x => x.team === team), x => pickRate(x.n, team));
  }
  return `<h1>Perks</h1><p class="sub">Which perks are picked the most, and which are not. Pick rate is the share of matches where the perk was brought: 100% would mean it showed up in every match.</p>${filterBar()}
    ${tabs('perks.tab', [['hunter', 'Hunter perks'], ['monster', 'Monster perks'], ['char', 'By character']], team)}${body}`;
}

function maps() {
  const list = Object.values(S.maps).sort((a, b) => b.n - a.n), mp = S.maps[ST.maps.key] || list[0], got = part('grids');
  if (!mp) return `<h1>Maps</h1>${filterBar()}<p class="sub">No matches with these filters.</p>`;
  // the movement and frame-rate views stay empty (the game never switches their record on): the developer view only
  const views = HEAT.filter(v => !PUBLIC || !['move', 'fps'].includes(v[0])), view = views.some(v => v[0] === ST.maps.view) ? ST.maps.view : 'all';
  return `<h1>Maps</h1><p class="sub">Which side wins on each map, and where the fights happen. The heat map shows where domes went up: Hunters throw one where they catch the Monster.</p>${filterBar()}
  ${tabs('maps.key', list.map(m => [m.key, esc(mapInfo(m.key).name)]), mp.key)}
  <h2>Fight heatmap</h2>
  ${got !== 'ok' ? partWait(got, 'heat map') : `<div class="heatwrap">${heat(mp.key, mp.grid, view)}<div>${tabs('maps.view', views, view)}
    <div class="panel">${kv('Domes thrown', num(mp.throws))}${kv('Caught the Monster', `${num(mp.caught)} · ${fpct(pct(mp.caught, mp.throws))}`)}${kv('Monster damage in domes', num(gsum(mp, 2)))}
      ${kv('Hunters downed in domes', num(gsum(mp, 3)))}
      ${HUNTERS.map(r => kv(`${r} inside when it went up`, fpct(pct(mp.inside[r], gsum(mp, 0))))).join('')}</div>
    <p class="note">Dome positions are grouped into a ${GRID} by ${GRID} grid over the map; a brighter cell holds more.</p>
    <p class="note">Positions are placed with each map's own minimap bounds from the game files.</p></div></div>`}
  <h2>Map numbers</h2>
  ${tiles(tile('Matches', num(mp.n)), tile('Hunters win', fpct(pct(mp.w, mp.d))), tile('Average match', clock(avg(mp.dur, mp.n))), tile('First fight', clock(avg(mp.first, mp.n))),
    tile('Ended inside a dome', fpct(pct(mp.endDome, mp.n))), tile('Wildlife damage', num(avg(mp.wlMon, mp.n)), 'to the Monster, per match'), tile('Wildlife damage', num(avg(mp.wlHun, mp.n)), 'to Hunters, per match'))}
  <h2>How matches end here</h2>${endsTable('ends-' + mp.key, mp.ends, mp.n)}
  <h2>All maps</h2>${table('maps', [Tx('Map', m => mapInfo(m.key).name), N('Matches', m => m.n), W('Hunters win', m => pct(m.w, m.d), m => `<span class="c-Medic">${bar(pct(m.w, m.d))}</span>`, m => m.n),
    N('Average match', m => avg(m.dur, m.n), m => clock(avg(m.dur, m.n))), N('First fight', m => avg(m.first, m.n), m => clock(avg(m.first, m.n))), P('Domes that caught', m => pct(m.caught, m.throws))], list, 1, 0, false, null, FEW)}`;
}

// The ranked ladder as the account server holds it: the rating after a player's latest match (what the game itself shows), with
// matches, wins and losses per side. It comes with every update (tools/summarize.js puts it in the totals). Without it the
// "Most matches on <character>". Under a rank the seats counted at that rank carry their players; otherwise they come from the
// players file, added up for the slices the filter bar selects.
// Only players with at least TOP_MIN matches on the character under the filters are listed (Roger: 5 on 2026-10-18, 10 on 2026-11-09). On the public site
// the character's own part carries its players; the developer view adds them up from the players file.
const TOP_MIN = 10, OWN_MIN = 5;      // OWN_MIN: a player's own Characters table ranks win rate on 5+ matches
function topPlayers(id, c, name) {
  const split = SUM?.split, R = split ? null : roster(), have = split || typeof R === 'object';
  const who = c.players || (!have ? null : split ? SUMMARY.merge(sliceKeys.filter(slicePasses).map(k => CHAR_PLAYERS[id]?.[k]).filter(Boolean)) || {}
    : SUMMARY.merge(sliceKeys.filter(slicePasses).map(k => R.chars[k]?.[id]).filter(Boolean)) || {});
  const level = pid => split ? CHAR_LEVELS[id]?.[pid] : R.players[pid]?.chars[id]?.level;
  const list = who ? Object.entries(who).filter(([, v]) => v.n >= TOP_MIN).map(([k, v]) => ({ id: k, ...v })) : [];
  const { base, col: adjCol } = adjusted(list, 'player');
  return `<h2>Most matches on ${esc(name)}</h2><p class="lead">The players with the most matches on ${esc(name)}, and how often they win.</p>` + (!who ? waiting('', R).replace('<h1></h1>', '') : table('cpl-' + id, [Tx('Player', p => pname(p.id), p => plink(p.id)), N('Matches', p => p.n), P('Win rate', p => pct(p.w, p.d)),
    adjCol, N('Level', p => level(p.id))], list, 1, 10, false, p => playerHref(p.id))
    + `<p class="note">Players with at least ${TOP_MIN} matches on ${esc(name)} under these filters. Adjusted win rate is this site's way of ranking
    players who have proven it over many games: each player is counted as if they had also played ${ADJ_K} matches at the
    average win rate of the players listed (${fpct(100 * base)}). A short perfect streak moves towards that average; a long
    strong record barely moves. Sort by it to find the best players.</p>`);
}
// ladders are worked out from the match records, whose ratings are from the start of each match and so trail by one match.
const side = l => l ? { n: l.played, w: l.wins, d: l.wins + l.losses, rating: l.rating } : { n: 0, w: 0, d: 0, rating: null };
// (with the server's ladder, a player it does not list has no ranked standing, whatever their own game reported)
const ladderOf = p => { const l = SUM?.ladder?.[p.id]; return SUM?.ladder ? { h: side(l?.hunter), m: side(l?.monster) } : p.rk; };
// one rating for a player across both ladders: the better one they are placed on, else the better one so far
const topRating = (h, m) => { const placed = [h, m].filter(x => x.n >= PLACEMENT); return Math.max(...(placed.length ? placed : [h, m]).map(x => x.rating || 0)) || null; };
function ranked() {
  const R = roster(); if (typeof R !== 'object') return waiting('Ranked', R);
  const k = ST.rk, ids = Object.keys(SUM?.ladder || R.players);
  const players = ids.map(id => R.players[id] || { id, chars: {}, rk: { h: side(), m: side() } }).map(p => {
    const { h, m } = ladderOf(p), lad = k.view === 'h' ? h : k.view === 'm' ? m : { n: h.n + m.n, w: h.w + m.w, d: h.d + m.d, rating: topRating(h, m) };
    const placed = k.view === 'o' ? h.n >= PLACEMENT || m.n >= PLACEMENT : lad.n >= PLACEMENT, pn = k.view === 'o' ? Math.max(h.n, m.n) : lad.n;   // placement is per ladder
    const mains = Object.values(p.chars).filter(c => k.view === 'o' || (charInfo(c.id).class === 'Monster') === (k.view === 'm')).sort((a, b) => b.n - a.n).slice(0, 3);
    return { id: p.id, ...lad, placed, pn, div: placed ? division(lad.rating) : null, mains, cls: charInfo(mains[0]?.id).class, region: acct(p.id)?.region };
  }).filter(p => p.n && (!k.tier || p.div?.tier === k.tier) && (!k.cls || p.cls === k.cls) && (!k.region || p.region === k.region) && (!k.q || pname(p.id).toLowerCase().includes(k.q.toLowerCase())));
  // a win rate ranks only once the player is placed and has PLAYER_MIN matches; the rest follow it, greyed
  // Adjusted win rate (see ADJ_K), measured against the placed players with PLAYER_MIN or more matches in this view
  const ok = p => p.placed && p.n >= PLAYER_MIN, rAdj = adjusted(players.filter(ok), 'player'), byAdj = k.sort === 'adjusted';
  const wr = p => byAdj ? rAdj.value(p) : pct(p.w, p.d) || 0, byWr = k.sort === 'winrate' || byAdj, fewN = byWr ? players.filter(p => !ok(p)).length : 0;
  players.sort((a, b) => byWr ? (ok(b) - ok(a)) || wr(b) - wr(a) : k.sort === 'wins' ? b.w - a.w : (b.placed - a.placed) || (b.rating || 0) - (a.rating || 0) || wr(b) - wr(a));
  const divCell = p => p.div ? `<div class="div">${img(p.div.icon, '', p.div.name)}<span>${esc(p.div.name)}</span></div>` : `<span class="dim">In placement (${p.pn}/${PLACEMENT})</span>`;
  const tierBtn = t => [t, img(C.ranks.find(r => r.tier === t && r.name.endsWith('Destroyer')).icon, 'tier', t)];
  return `<h1>Ranked</h1><p class="sub">The ranked leaderboard, from ranked matches only. Hunters and Monsters have separate ladders; a player is placed after ${PLACEMENT} matches on a ladder.</p>
  ${tabs('rk.view', [['o', 'Overall'], ['h', 'Hunter'], ['m', 'Monster']], k.view)}
  <div class="filters">${tabs('rk.tier', [['', 'All'], tierBtn('gold'), tierBtn('silver'), tierBtn('bronze')], k.tier).replace('class="tabs"', 'class="tabs" style="margin:0"')}
    ${select('rk.cls', ROLES, k.cls, 'All classes')}${PUBLIC ? '' : select('rk.region', regionList().map(r => [r, pretty(r)]), k.region, 'All regions')}
    <input type="search" data-st="rk.q" placeholder="Search player" aria-label="Search player" value="${esc(k.q)}">${select('rk.sort', [['rating', 'Sort: rating'], ['winrate', 'Sort: win rate'], ['adjusted', 'Sort: adjusted win rate'], ['wins', 'Sort: wins']], k.sort)}</div>
  <div class="podium">${(byWr ? players.filter(ok) : players).slice(0, 3).map((p, i) => `<div><div class="rk" style="color:${['#ffd700', '#cfd2d4', '#cd7f3a'][i]}">#${i + 1}</div>${p.div ? img(p.div.icon, '', p.div.name) : ''}
    <div><b>${plink(p.id)}</b></div><div class="wr">${fpct(byAdj ? rAdj.value(p) : pct(p.w, p.d))}${byAdj ? ' <small class="dim">adjusted</small>' : ''}</div><div class="dim">${p.w}-${p.d - p.w} · ${p.div ? esc(p.div.name) : 'In placement'}</div></div>`).join('')}</div>
  <div class="tw"><table><thead><tr><th>Division</th><th class="n">#</th><th>Player</th><th>Mains</th><th class="n">Rating</th><th class="n">W-L</th><th class="n">Win rate</th><th class="n" title="Win rate as if each player also had ${ADJ_K} matches at the average win rate of the ranked players listed">Adjusted</th></tr></thead><tbody>
  ${players.map((p, i) => `<tr data-href="${esc(playerHref(p.id))}"><td>${divCell(p)}</td><td class="n">${i + 1}</td><td><b>${plink(p.id)}</b></td><td><span class="comp">${p.mains.map(c => face(c.id)).join('')}</span></td>
    <td class="n">${num(p.rating)}</td><td class="n dim">${p.w}-${p.d - p.w}</td>${ok(p) ? '<td class="n">' : `<td class="n few" title="In placement, or fewer than ${PLAYER_MIN} matches">`}${bar(pct(p.w, p.d))}</td><td class="n${ok(p) ? '' : ' few'}">${fpct(rAdj.value(p))}</td></tr>`).join('') || '<tr><td colspan="8" class="dim">No players found.</td></tr>'}</tbody></table></div>
  <p class="note">Adjusted counts each player as if they had also played ${ADJ_K} matches at the average win rate of the placed players
  with ${PLAYER_MIN} or more matches in this view (${fpct(100 * rAdj.base)}), so a short winning streak does not outrank a long strong record.</p>
  ${fewN ? `<p class="note">Sorted by ${byAdj ? 'adjusted ' : ''}win rate among placed players with ${PLAYER_MIN} or more matches. The ${plural(fewN, 'player', 'players')} still in placement or with fewer matches ${fewN === 1 ? 'comes' : 'come'} after them, greyed.</p>` : ''}
  <details style="margin-top:1.2rem"><summary><b>Rank legend</b></summary><div class="in"><div class="legend3">${['bronze', 'silver', 'gold'].map(t => `<div><h3>${t}</h3>${C.ranks.filter(r => r.tier === t).reverse().map(r =>
    `<div class="div">${img(r.icon, '', r.name)}<span>${esc(r.name)} <span class="dim">${r.max != null ? `${num(r.min)} to ${num(r.max)}` : 'range not seen yet'}</span></span></div>`).join('')}</div>`).join('')}</div>
    <p class="note">Tiers: Bronze below ${num(C.tiers.silver[0])}, Silver from ${num(C.tiers.silver[0])}, Gold from ${num(C.tiers.gold[0])}. A division's own range is listed once the game has asked the server about it, which happens when a player reaches it. Until then a player there is shown by tier, or as one of the two divisions it can be.</p></div></details>
  <p class="note">${SUM?.ladder ? 'Ratings, matches, wins and losses are the game server\'s own ladder, as of the last update.' : 'Rating and division are as each player\'s game reported them at the start of their latest ranked match, so they trail the game by one match.'}</p>`;
}

const PLAYERS_SHOWN = 100;
const PLAYER_MIN = 20;       // matches a player's win rate needs to rank on the Players and Ranked pages
// a player's matches with other people (the players file's `pp`, written by tools/summarize.js): solo matches against bots left out
const peopleOf = p => { const a = p.pp || [0, 0, 0, 0, 0, 0]; return { n: a[0], w: a[1], d: a[2], h: { n: a[3], w: a[4], d: a[5] }, m: { n: a[0] - a[3], w: a[1] - a[4], d: a[2] - a[5] } }; };
function players() {
  const R = roster(); if (typeof R !== 'object') return waiting('Players', R);
  // win rates from matches with other people when the players file has them (an older file, or counting on the spot: every match)
  const wl = p => !R.people ? p : p.wl || (p.wl = peopleOf(p));
  // Overall, or one side (Roger, 2026-11-09): h = Hunter, m = Monster. A side shows that side's matches, win rate, rating and most
  // played character, and lists only players who have played it.
  const side = ['h', 'm'].includes(ST.players.side) ? ST.players.side : '', sideName = { h: 'Hunter', m: 'Monster' }[side];
  const rec = p => side ? wl(p)[side] : wl(p), matchesOf = p => side ? p[side]?.n || 0 : p.n;
  const q = ST.players.q.trim().toLowerCase(), fav = p => Object.values(p.chars).filter(c => !side || (charInfo(c.id).class === 'Monster') === (side === 'm')).sort((a, b) => b.n - a.n)[0];
  // Adjusted win rate, measured against the players who rank (PLAYER_MIN or more matches with other people, on this side)
  const pAdj = adjusted(Object.values(R.players).filter(p => rec(p).n >= PLAYER_MIN), 'player', rec);
  // PLAYERS_SHOWN rows a page of the current sort (drawing all of them, 18,000 and more, took seconds); a search narrows the whole table
  const rows = Object.values(R.players).filter(p => (!q || pname(p.id).toLowerCase().includes(q)) && (!ST.players.region || acct(p.id)?.region === ST.players.region) && matchesOf(p) > 0);
  return `<h1>Players</h1><p class="sub">Everyone whose game has reported at least one match. Search for a name to find anyone.</p>
  <div class="filters"><input type="search" data-st="players.q" placeholder="Search players" aria-label="Search players" value="${esc(ST.players.q)}">
    ${PUBLIC ? '' : select('players.region', regionList().map(r => [r, pretty(r)]), ST.players.region, 'All regions')}</div>
  ${tabs('players.side', [['', 'Overall'], ['m', 'Monster'], ['h', 'Hunter']], side)}
  ${hint('Tap a player to open their profile: characters, ranked ladders and latest matches.')}
  ${table('players' + side, [Tx('Player', p => pname(p.id), p => plink(p.id) + (!PUBLIC && acct(p.id)?.founder === 'Yes' ? ' <span class="tag gold">Founder</span>' : '') + cue('Profile')), N('Level', p => p.level),
    N('Rating', p => side ? ladderOf(p)[side].rating : topRating(ladderOf(p).h, ladderOf(p).m)), N('Matches', matchesOf),
    W('Win rate', p => pct(rec(p).w, rec(p).d), p => bar(pct(rec(p).w, rec(p).d)), p => rec(p).n), pAdj.col,
    ...(side ? [] : [W('As Hunter', p => pct(wl(p).h.w, wl(p).h.d), p => wl(p).h.n ? `${fpct(pct(wl(p).h.w, wl(p).h.d))} <span class="dim">(${wl(p).h.n})</span>` : '–', p => wl(p).h.n),
      W('As Monster', p => pct(wl(p).m.w, wl(p).m.d), p => wl(p).m.n ? `${fpct(pct(wl(p).m.w, wl(p).m.d))} <span class="dim">(${wl(p).m.n})</span>` : '–', p => wl(p).m.n)]),
    Tx(side ? `Most played ${sideName}` : 'Most played', p => charInfo(fav(p)?.id || '').name, p => fav(p) ? chip(fav(p).id) : '–'),
    ...(PUBLIC ? [N('Last match', p => p.t, p => day(p.t))] : [Tx('Region', p => pretty(acct(p.id)?.region)), N('Last seen', p => acct(p.id)?.t, p => day(acct(p.id)?.t))])],
    rows, 3, PLAYERS_SHOWN, false, p => playerHref(p.id), PLAYER_MIN)}
  <p class="note">Adjusted counts each player as if they had also played ${ADJ_K} matches at the average win rate of the players
  with ${PLAYER_MIN} or more matches${side ? ` as ${sideName}` : ''} (${fpct(100 * pAdj.base)}), so a short winning streak does not outrank a long strong record.
  Sort by it to find the best players.</p>
  ${!R.people ? '' : side ? `<p class="note">Matches counts every match as ${sideName}. Win rate and Adjusted count only matches with other people: solo matches against bots are left out, as on the rest of the site.</p>`
    : '<p class="note">Matches counts every match. Win rate, As Hunter and As Monster count only matches with other people: solo matches against bots are left out, as on the rest of the site. The number in brackets is how many matches each of those win rates comes from.</p>'}
  <p class="note">Rating is ${side ? `the player's ${sideName} ladder rating` : 'the ranked rating the game reports for the player (the higher of their two ladders)'}; it is blank until they have one.</p>`;
}

// a line of a player's own match list (their file), in the shape matchRow() draws
const asMatch = r => ({ id: r.id, t: r.t, dur: r.dur, mapKey: r.map, decided: r.win === 'Merc' || r.win === 'Monster', hunterWin: r.win === 'Merc', hdr: { CharacterId: r.c },
  clients: { [r.role]: { Data: { LateJoiner: r.late, ChatMessagesSent: r.chat } } } });
function player(id) {
  // p: their match totals. a: what their game says about the account. x: their own file, every match and their progression, a section per day
  const R = roster(); if (typeof R !== 'object') return waiting('Player', R);
  const p = R.players[id], a = acct(id), sess = p?.sessions?.size ?? p?.sessions ?? 0;      // play sessions: a set when counted on the spot, a count in the players file
  if (!p) return `<h1>Player not found</h1><p class="sub">No matches reported under this id.</p>`;
  const got = fetchOnce('p/' + id, `${SITE_DATA}/p/${id.slice(-2)}/${encodeURIComponent(id)}.js?t=${Math.floor(Date.now() / 600000)}`, d => ({ matches: Object.values(d.days).flatMap(x => x.matches).sort((x, y) => y.t - x.t), chars: d.chars }));
  // the developer view: their progression, from the NAS's own folder (archive/dev/p, never uploaded)
  const dev = PUBLIC ? null : fetchOnce('pd/' + id, `${DEV_DATA}/p/${id.slice(-2)}/${encodeURIComponent(id)}.js?t=${Math.floor(Date.now() / 600000)}`, d => { const s = Object.values(d.days);
    return { xp: s.flatMap(x => x.xp).sort((x, y) => x.t - y.t), rewards: s.flatMap(x => x.rewards).sort((x, y) => y.t - x.t),
      chall: Object.values(s.reduce((o, x) => { for (const [name, c] of Object.entries(x.chall)) if (c.t >= (o[name]?.t || 0)) o[name] = { name, ...c }; return o; }, {})) }; });
  const x = typeof got === 'object' ? got : { matches: [] }, y = typeof dev === 'object' && dev ? dev : { xp: [], rewards: [], chall: [] }, gains = y.xp.slice(-30);
  const waitFor = g => g === 'loading' ? '<p class="dim">Loading this player\'s history…</p>' : g === 'missing' ? '<p class="dim">This player\'s history could not be loaded.</p>' : '', wait = waitFor(got);
  const lad = (l, name) => { const dv = l.n >= PLACEMENT ? division(l.rating) : null; return kv(name, l.n ? `${dv ? esc(dv.name) : `In placement (${l.n}/${PLACEMENT})`} · rating ${num(l.rating)} · ${l.w}-${l.d - l.w}` : 'No ranked matches'); };
  const skinOf = c => c.skin ?? Object.entries(c.skins || {}).sort((a, b) => b[1] - a[1])[0]?.[0];      // the public players file keeps only the usual skin
  // every character they played: in the public site's players file only their mains, the whole table in their own file
  const pchars = SUM?.split ? x.chars || {} : p.chars;
  // Perks (Roger, 2026-11-09): what they bring on each character, from their own match rows (pk: the perks of that match, in the
  // player files from 9 Nov). Every match with perks recorded counts, like the rest of this page.
  const pkMatches = x.matches.filter(r => r.pk?.length && r.c?.[r.role]), charOf = r => r.c[r.role];
  const pkChars = Object.entries(pkMatches.reduce((o, r) => { o[charOf(r)] = (o[charOf(r)] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]);
  const pkChar = pkChars.some(([cid]) => cid === ST.players.pchar) ? ST.players.pchar : pkChars[0]?.[0], pkRows = pkMatches.filter(r => charOf(r) === pkChar);
  const decided = r => r.win === 'Merc' || r.win === 'Monster' ? 1 : 0, won = r => decided(r) && (r.role === 'Monster') === (r.win === 'Monster') ? 1 : 0;
  const tally = keysOf => Object.values(pkRows.reduce((o, r) => { for (const k of keysOf(r)) { const t = o[k] ||= { k, n: 0, w: 0, d: 0 }; t.n++; t.w += won(r); t.d += decided(r); } return o; }, {}));
  const pkPerks = tally(r => r.pk), pkSets = tally(r => r.pk.length > 1 ? [[...r.pk].sort().join('+')] : []);
  const perkCell = k => `${img(perkInfo(k).icon, 'perk')} ${esc(perkInfo(k).name)}`;
  return `<h1>${esc(pname(id))} ${!PUBLIC && a?.founder === 'Yes' ? '<span class="tag gold">Founder</span>' : ''}</h1>
  <p class="sub">${a ? `${esc(pretty(a.region))} · text ${esc(a.lang)} · audio ${esc(a.audio)} · first seen ${day(a.since)} · last seen ${day(a.t)} · ` : p.t ? `last match ${day(p.t)} · ` : ''}id ${esc(String(id).slice(0, 8))}…</p>
  ${tiles(tile('Matches', num(p.n)), tile('Win rate', fpct(pct(p.w, p.d))), tile('As Hunter', fpct(pct(p.h.w, p.h.d)), `${p.h.n} matches`), tile('As Monster', fpct(pct(p.m.w, p.m.d)), `${p.m.n} matches`),
    tile('Account level', num(p.level)), tile('Time played', hours(p.secs)),
    PUBLIC ? '' : tile('Play sessions', sess ? num(sess) : '–', sess ? `${dec(p.n / sess)} matches each` : 'not recorded'), PUBLIC ? '' : tile('Chat', dec(p.chat / p.n), 'messages per match'))}
  <div class="cols"><section><h2>Ranked</h2><div class="panel">${lad(ladderOf(p).m, 'Monster ladder')}${lad(ladderOf(p).h, 'Hunter ladder')}</div></section>
    ${PUBLIC ? '' : `<section><h2>Queueing and conduct</h2><div class="panel">${kv('Average queue', clock(avg(a?.q.dur, a?.q.ok)))}${kv('Left the queue', num(a ? a.q.n - a.q.ok : null))}
      ${kv('Queue dodges', num(a?.q.dodges))}${kv('Joined late', num(p.late))}${kv('Disconnects', num(p.leaves))}</div></section>`}</div>
  <h2>Characters</h2>${[['m', 'Monsters'], ['h', 'Hunters']].map(([sd, title]) => {       // Monsters (the shorter list) then Hunters (Roger, 2026-11-09)
    const list = Object.values(pchars).filter(c => (charInfo(c.id).class === 'Monster') === (sd === 'm'));
    return !list.length ? '' : `<h3 style="margin-top:1rem">${title}</h3>` + table(`pc-${sd}-${id}`, [Tx('Character', c => charInfo(c.id).name, c => chip(c.id)),
      ...(sd === 'h' ? [Tx('Class', c => charInfo(c.id).class, c => classCell(charInfo(c.id).class))] : []),
      N('Matches', c => c.n), W('Win rate', c => pct(c.w, c.d), c => bar(pct(c.w, c.d)), c => c.n), N('Level', c => c.level), Tx('Usual skin', skinOf),
      N('Damage dealt', c => avg(c.dmg, c.dn ?? c.n)), N('Damage taken', c => avg(c.taken, c.dn ?? c.n))], list, sd === 'h' ? 2 : 1, 0, false, c => charHref(c.id), OWN_MIN); }).join('')}${SUM?.split ? wait : ''}
  ${!pkChars.length ? '' : `<h2>Perks</h2><p class="lead">The perks ${esc(pname(id))} brings, character by character.</p>
  <div class="filters"><label>Character ${select('players.pchar', pkChars.map(([cid, n]) => [cid, `${charInfo(cid).name} (${plural(n, 'match', 'matches')})`]), pkChar)}</label></div>
  ${table('ppk-' + id + '-' + pkChar, [Tx('Perk', t => perkInfo(t.k).name, t => perkCell(t.k)), N('Times picked', t => t.n), P('Pick rate', t => pct(t.n, pkRows.length)),
    W('Win rate', t => pct(t.w, t.d), null, t => t.n)], pkPerks, 1, 10, false, null, OWN_MIN)}
  ${pkSets.length ? `<h3 style="margin-top:1.2rem">Loadouts</h3>${table('pps-' + id + '-' + pkChar, [Tx('Perks', t => t.k, t => perkIcons(t.k.split('+')) + ' <span class="dim">' + t.k.split('+').map(k => esc(perkInfo(k).name)).join(', ') + '</span>'),
    N('Matches', t => t.n), P('Share', t => pct(t.n, pkRows.length)), W('Win rate', t => pct(t.w, t.d), null, t => t.n)], pkSets, 1, 10, false, null, OWN_MIN)}` : ''}
  <p class="note">From ${plural(pkRows.length, 'match', 'matches')} on ${esc(charInfo(pkChar).name)} with perks recorded. Pick rate is the share of those matches where the perk was brought.</p>`}
  ${PUBLIC ? '' : `<h2>Progression</h2>${waitFor(dev)}<div class="cols"><section><div class="panel"><h3>Account XP gained, last ${gains.length} times</h3>${chart(gains.map(g => g.gain), gains.map(g => g.up ? '▲' : ''))}
      <p class="note">▲ marks a level-up.</p></div></section>
    <section>${table('prw-' + id, [N('When', r => r.t, r => day(r.t)), Tx('Why', r => pretty(r.why)), Tx('Reward', r => r.name), N('Amount', r => r.amount)], y.rewards, 0, 8)}</section></div>
  <h2>Challenges</h2>${table('pch-' + id, [Tx('Challenge', c => c.name), Tx('Category', c => c.cat), Tx('Status', c => c.pn >= c.pm ? 'Finished' : c.ev === 'ChallengeDecline' ? 'Declined' : 'In progress'),
    N('Progress', c => pct(c.pn, c.pm), c => `${bar(pct(c.pn, c.pm))} <span class="dim">${num(c.pn)} / ${num(c.pm)}</span>`)], y.chall, 3)}`}
  <h2>Matches</h2>${wait}${x.matches.slice(0, ST.players.all ? Infinity : 20).map(r => matchRow(asMatch(r), r.role)).join('')}
  ${x.matches.length > 20 && !ST.players.all ? `<p><button data-st="players.all" data-v="1">Show all ${num(x.matches.length)} matches</button></p>` : ''}`;
}

function timeline(m) {
  const D = m.dur || 1, x = t => (Math.max(0, Math.min(D, t)) / D * 1000).toFixed(1), t0 = m.t - D * 1000;
  // a dome record has no match clock; its start is worked out from when the record arrived
  const domes = m.domes.map(e => { const up = e.BaseHeader.Duration, end = (T(e) - t0) / 1000; return { s: end - up, up, caught: e.Data.InDome?.Monster }; }).filter(d => !isNaN(d.s));
  const inc = m.d.Hunters?.Incaps || {}, sh = m.d.Hunters?.Dropships || {}, ships = sh.Timestamps || [];
  return `<svg class="tl" viewBox="0 0 1000 86" role="img" aria-label="Match timeline">
    ${domes.map(d => `<rect x="${x(d.s)}" y="18" width="${Math.max(3, x(d.s + d.up) - x(d.s)).toFixed(1)}" height="34" rx="3" fill="${d.caught ? 'rgba(139,26,26,.55)' : 'none'}" stroke="${d.caught ? '#8b1a1a' : '#555'}"><title>Dome at ${clock(d.s)}, up ${Math.round(d.up)}s, ${d.caught ? 'caught the Monster' : 'missed'}</title></rect>`).join('')}
    <line x1="0" y1="35" x2="1000" y2="35" stroke="#444" stroke-width="2"/>
    <line x1="${x(m.d.FirstEncounterTime)}" y1="8" x2="${x(m.d.FirstEncounterTime)}" y2="62" stroke="#fff" stroke-dasharray="3 3"><title>First fight at ${clock(m.d.FirstEncounterTime)}</title></line>
    ${(inc.Timestamp || []).map((t, i) => `<circle cx="${x(t)}" cy="35" r="6" style="fill:var(--cl-${esc(String(inc.Class[i]).toLowerCase())})" stroke="#000"><title>${esc(inc.Class[i])} down at ${clock(t)}</title></circle>`).join('')}
    ${ships.map((t, i) => `<path d="M${x(t)} 58 l6 10 h-12 z" fill="#ddd"><title>Dropship at ${clock(t)} carrying ${HUNTERS.filter(r => sh[r]?.[i]).join(', ') || 'nobody recorded'}</title></path>`).join('')}
    <g fill="#888" font-size="13" font-family="Archivo Narrow, sans-serif"><text x="0" y="84">0:00</text><text x="500" y="84" text-anchor="middle">${clock(D / 2)}</text><text x="1000" y="84" text-anchor="end">${clock(D)}</text></g>
  </svg>
  <div class="legend"><span><i style="background:rgba(139,26,26,.6)"></i>Dome that caught the Monster</span><span><i style="background:none;border:1px solid #555"></i>Dome that missed</span>
    ${HUNTERS.map(r => `<span class="c-${r}"><i style="border-radius:50%"></i>${r} down</span>`).join('')}<span>▲ Dropship (hover for who it carried)</span><span>┊ First fight</span></div>`;
}

function slots(p, stages) {
  const id = p.ServerRoundHeader.CharacterId?.[p.ServerPlayerRoundHeader.Class], own = SUM ? ownKit(id)[ver(p)] : null, leftover = own != null && kitOf(p) !== own;
  const huge = amounts(p).some(v => Math.abs(v) >= IMPOSSIBLE);
  const rows = Object.entries(p.Data).filter(([, s]) => s && typeof s === 'object' && s.TotalDamageDealt != null).map(([label, s]) => ({ label, s, info: (!leftover && slotItem(id, label)) || itemInfo(s.Name ?? label) }));
  const list = g => Array.isArray(g) ? g : g?.OpposingTeamEffects;
  const st = (s, i) => { const g = s['Stage' + i]; return !g ? null : list(g) ? list(g).reduce((a, e) => a + e.DamageDealt, 0) : g.OpposingTeam ?? null; };
  const dmg = s => typeof s.TotalDamageDealt === 'number' ? s.TotalDamageDealt : s.TotalDamageDealt.OpposingTeam;
  const sources = s => [...new Set([1, 2, 3].flatMap(i => (list(s['Stage' + i]) || []).map(e => itemInfo(e.Name).name)))].join(', ');
  const cols = [Tx('Item', r => r.info.name || r.label, r => `${icon(r.info.icon)}${esc(r.info.name || r.label)}${r.info.game ? ` <span class="dim">${esc(r.info.game)}</span>` : ''}`), N('Uses', r => r.s.Aggregate?.Uses ?? null),
    N('Misses', r => r.s.Aggregate ? (r.s.Aggregate.Misses > 2e9 ? null : r.s.Aggregate.Misses) : null), N('Hits', r => r.s.Aggregate?.Hits?.OpposingTeam ?? null),
    N('Wildlife hits', r => r.s.Aggregate?.Hits?.Wildlife ?? null), N('Damage', r => dmg(r.s)), N('To wildlife', r => r.s.TotalDamageDealt?.Wildlife ?? null)];
  for (let i = 1; i <= stages; i++) cols.push(N('Stage ' + i, r => st(r.s, i)));
  if (p.ServerPlayerRoundHeader.Class === 'Monster') cols.push(Tx('Points by stage', r => '', r => [1, 2, 3].map(i => r.s['Stage' + i]?.Level).filter(v => v != null).join(' · ')),
    Tx('Uses / hits / misses by stage', r => '', r => [1, 2, 3].map(i => r.s['Stage' + i]).filter(g => g?.Uses != null).map(g => `${g.Uses}/${g.Hits.OpposingTeam}/${g.Misses}`).join(' · ') || '–'));
  cols.push(Tx('Damage sources', r => sources(r.s)));
  const heals = p.Data.AppliedHeals;
  return (leftover || huge ? `<p class="note">${huge ? 'This record holds an impossible number.' : 'The game recorded this player with weapons that are not this character\'s own, usually carried over from a match the host had started and never finished.'} The names and numbers below are as recorded, and are left out of ${esc(charInfo(id).name)}'s damage and weapon numbers.</p>` : '')
    + table('slots-' + p.ServerPlayerRoundHeader.Class, cols, rows.filter(r => r.info.name), 5) + (heals ? `<div class="in"><h3>Healing done, by source</h3>${[1, 2, 3].filter(i => heals['Stage' + i]).map(i =>
    kv('Stage ' + i, heals['Stage' + i].map(h => `${esc(itemInfo(h.Name).name)} ${num(h.HealAmount)}`).join(' · '))).join('')}${kv('Total', num(heals.TotalHeals))}</div>` : '');
}

/* Every finished match has a small file of its own records, and every day a list of its matches (tools/summarize.js writes them
   from the archive). So any match ever played can be opened, not only the recent ones this page loaded. */
const SITE_DATA = window.TELEMETRY_SITE_DATA || 'archive/site';
// the developer view's own files, written beside the job and never uploaded: the whole players table and each player's progression
const DEV_DATA = 'archive/dev';
// The files are small scripts that hand their data to TELEMETRY_LOADED(key, data): a script tag may load from the asset
// bucket's address, where a plain fetch from this page would be refused by the browser.
const FETCHED = {}, ARRIVED = {};      // key -> 'loading' | 'missing' | what came back
window.TELEMETRY_LOADED = (key, data) => { ARRIVED[key] = data; };
function fetchOnce(key, url, use) {
  if (FETCHED[key]) return FETCHED[key];
  FETCHED[key] = 'loading';
  const s = document.createElement('script');
  s.src = url;
  s.onload = () => { const d = ARRIVED[key]; delete ARRIVED[key]; FETCHED[key] = d === undefined ? 'missing' : (use && use(d)) || d; render(true); };
  s.onerror = () => { FETCHED[key] = 'missing'; render(true); };
  document.head.appendChild(s);
  return 'loading';
}
const utcDay = () => new Date().toISOString().slice(0, 10);

// Every match, one day at a time. Follows the filter bar like the totals pages do.
function matches() {
  const days = SUM?.dayList ? [...SUM.dayList].reverse() : [];
  if (!days.length) return `<h1>Matches</h1>${filterBar()}${table('mlist', [Tx('Match', m => m.t, m => matchRow(m))], S.matches, 0, 200)}`;
  const day = days.some(d => d.day === ST.browse.day) ? ST.browse.day : days[0].day;
  const got = fetchOnce('days/' + day, `${SITE_DATA}/days/${day}.js?t=${Math.floor(Date.now() / 600000)}`);
  const pick = `<div class="filters"><label>Day ${select('browse.day', days.map(d => [d.day, `${day_(d.day)} · ${num(d.matches)} matches`]), day)}</label></div>`;
  if (got === 'loading') return `<h1>Matches</h1>${filterBar()}${pick}<p class="dim">Loading the list for ${day_(day)}…</p>`;
  if (got === 'missing') return `<h1>Matches</h1>${filterBar()}${pick}<p class="dim">The list for ${day_(day)} could not be loaded.</p>`;
  const rows = got.rows.filter(r => slicePasses([r.v, r.mode, r.type, r.mp ? 0 : 1].join('|')));
  const faces = (r, roles) => `<span class="comp">${roles.map(role => r.bots.includes(role) ? `<span class="dim" title="${role}: bot">bot</span>` : face(r.c[role])).join('')}</span>`;
  return `<h1>Matches</h1><p class="sub">Every match played, newest first. Open one for its full scoreboard, weapons, domes and voice lines.</p>${filterBar()}${pick}
  ${table('mlist', [N('Time (UTC)', r => r.t, r => new Date(r.t).toISOString().slice(11, 16)), Tx('Type', r => typeName(r.type)), Tx('Mode', r => modeName(r.mode)), Tx('Map', r => mapInfo(r.map).name),
    Tx('Winner', r => r.win, r => r.win === 'Merc' ? '<span class="c-Medic">Hunters</span>' : r.win === 'Monster' ? '<span class="c-Monster">Monster</span>' : '<span class="dim">No result</span>'),
    N('Length', r => r.dur, r => clock(r.dur)), N('Final stage', r => r.stage), Tx('Monster', r => charInfo(r.c.Monster).name, r => faces(r, ['Monster'])), Tx('Hunters', r => '', r => faces(r, HUNTERS)),
    N('People', r => 5 - r.bots.length)], rows, 0, ST.browse.all ? 0 : 200, false, r => '#/match/' + encodeURIComponent(r.id))}
  ${rows.length > 200 && !ST.browse.all ? `<p><button data-st="browse.all" data-v="1">Show all ${num(rows.length)} matches of this day</button></p>` : ''}
  <p class="note">${num(rows.length)} of this day's ${num(got.rows.length)} matches pass the filters above. The day is the UTC day the match's result reached the server.</p>
  ${got.unfinished?.length ? `<details><summary><b>${num(got.unfinished.length)} matches started this day and never finished</b></summary>${table('mopen', [N('Started (UTC)', r => r.t, r => new Date(r.t).toISOString().slice(11, 16)),
    Tx('Type', r => typeName(r.type)), Tx('Mode', r => modeName(r.mode)), Tx('Map', r => mapInfo(r.map).name), Tx('Line-up', r => '', r => `<span class="comp">${ROLES.map(x => face(r.c[x])).join('')}</span>`)], got.unfinished, 0)}
    <p class="note">No end record arrived for these: usually a restart or the host leaving. One still being played when the list was made is here until it ends.</p></details>` : ''}`;
}
const day_ = d => day(Date.parse(d + 'T00:00:00Z'));

function match(id) {
  let m = MATCH.get(id);
  if (!m && SUM) {        // not among the loaded recent records: fetch this match's own file
    const got = fetchOnce('m/' + id, `${SITE_DATA}/m/${id.slice(-2)}/${encodeURIComponent(id)}.js?d=${utcDay()}`, recs => { for (const e of recs) ingest(e); const r = byId.get(id); if (r?.round) MATCH.set(id, toMatch(r)); });
    if (got === 'loading') return `<h1>Loading this match…</h1>`;
    m = MATCH.get(id);
  }
  if (!m) return `<h1>Match not found</h1>`;
  const d = m.d, H = d.Hunters || {}, mon = d.Monster || {}, incaps = r => (H.Incaps?.Class || []).filter(c => c === r).length, t0 = m.t - m.dur * 1000;
  const rows = ROLES.map(role => ({ role, p: m.players[role], ph: m.players[role]?.ServerPlayerRoundHeader || {}, id: m.hdr.CharacterId[role], cd: m.clients[role]?.Data, who: pid(m, role) }));
  const q = role => m.mm.find(e => e.ClientHeader.My2kID === pid(m, role));
  const dl = m.dialogue?.Data, hm = (a, b) => `${num(a)} → ${num(b)}`;
  return `<p class="sub" style="margin:0">${esc(modeName(m.hdr.GameMode))} · ${esc(typeName(m.hdr.MatchType))} ·${m.hdr.Multiplayer ? 'multiplayer' : 'solo'} · ${day(m.t)} · ${esc(m.v)}</p>
  <h1 style="color:${m.hunterWin ? '#6fc3bd' : m.decided ? '#e0584f' : '#fff'}">${m.hunterWin ? 'Hunters win' : m.decided ? 'Monster wins' : 'No result'}</h1>
  <p class="sub">${endLabel(m.hdr.WinningTeam, m.hdr.WinCondition)} · ${esc(mapInfo(m.mapKey).name)} · ${clock(m.dur)}${!PUBLIC && m.kicks.length ? ` · ${m.kicks.length} anti-cheat kick` : ''}</p>
  <h2>Scoreboard</h2>
  ${table('score', [Tx('Class', r => -ROLES.indexOf(r.role), r => img(C.classIcons[r.role], 'cls', r.role)), Tx('Character', r => charInfo(r.id).name, r => chip(r.id) + (r.cd ? ` <span class="dim">${esc(r.cd.CharacterSkin)}</span>` : '')),
    Tx('Player', r => r.ph.IsBot ? 'Bot' : pname(r.who || ''), r => r.ph.IsBot ? '<span class="dim">Bot</span>' : plink(r.who)),
    N('Level', r => r.ph.Level > 0 ? r.ph.Level : r.cd?.PlayerLevel > 0 ? r.cd.PlayerLevel : null),     // the host can report 0 for a person; their own record has the level
    Tx('Perks', r => '', r => perkIcons(Object.values(r.ph.Perks || {}))), N('Damage dealt', r => r.ph.DamageToEnemyTeam), N('Damage taken', r => r.ph.DamageFromEnemyTeam),
    N('Healing done', r => r.p?.Data?.AppliedHeals?.TotalHeals ?? null), N('Healing received', r => H.Healing?.Received?.[r.role] ?? null), N('Shielding', r => H.Shielding?.[r.role] ?? null),
    N('Downs', r => r.role === 'Monster' ? null : incaps(r.role)), N('Deaths', r => H.Deaths?.[r.role] ?? null), N('Strikes', r => H.StrikesAtEnd?.[r.role] ?? null)], rows, 0)}
  <div style="height:.6rem"></div>
  ${table('score2', [Tx('Character', r => -ROLES.indexOf(r.role), r => chip(r.id)), N('To wildlife', r => r.ph.DamageToWildlife), N('From wildlife', r => r.ph.DamageFromWildlife), N('Character level', r => r.ph.CharacterLevel > 0 ? r.ph.CharacterLevel : null),
    ...(PUBLIC ? [] : [N('Chat messages', r => r.cd?.ChatMessagesSent ?? null)]), Tx('Joined late', r => '', r => r.cd ? (r.cd.LateJoiner ? 'Yes' : 'No') : '–'), N('Late joins', r => d.LateJoinerCounts?.[r.role] ?? null),
    N('Hotswaps', r => r.cd ? sumv(r.cd.Hotswaps) : null), N('Disconnects', r => d.LeaverCounts?.[r.role] ?? null),
    ...(PUBLIC ? [] : [N('Queued for', r => q(r.role)?.BaseHeader.Duration ?? null, r => clock(q(r.role)?.BaseHeader.Duration))])], rows, 0)}
  <h2>Lobby</h2><div class="cols"><section><div class="panel">${kv('Parties', esc((d.InitialPartySizes || []).join(' + ')) || '–')}${kv('Hunter health buff', esc(d.MercHealthBuff || 'None'))}
      ${kv('A character was not what was asked for', m.hdr.RequestedCharacterMismatch ? 'Yes' : 'No')}${kv('Match start record', m.start ? 'Received' : 'Missing')}</div></section>
    <section>${table('lobby', [Tx('Class', r => -ROLES.indexOf(r.role), r => classCell(r.role)), N('Skill', r => d.PlayerSkillLevels?.[r.role] >= 0 ? d.PlayerSkillLevels[r.role] : null), N('Rating', r => d.PlayerGlickoScores?.[r.role] > 0 ? d.PlayerGlickoScores[r.role] : null),
      Tx('Asked for', r => charInfo(m.hdr.RequestedCharacterId?.[r.role] || '').name || '–'), Tx('Got', r => charInfo(r.id).name)], rows, 0)}</section></div>
  <h2>Timeline</h2><div class="panel">${timeline(m)}</div>
  <div class="cols">
    <section><h2>Monster</h2><div class="panel">${kv('Final stage', 'Stage ' + esc(m.hdr.MonsterFinalStage))}${kv('First fight', `${clock(d.FirstEncounterTime)} at Stage ${esc(mon.FirstEncounterStage)}`)}
      ${kv('Health, start to end', hm(mon.StartHealth, mon.FinalHealth))}${kv('Armor, start to end', hm(mon.StartArmor, mon.FinalArmor))}${kv('Fed', dec(mon.Feeding))}
      ${kv('Damage from wildlife', num(d.Wildlife?.DamageToMonster))}${kv('Wildlife damage to Hunters', num(d.Wildlife?.DamageToHunters))}</div></section>
    <section><h2>Domes</h2><div class="panel">${kv('Thrown', num(d.Dome?.Throws))}${kv('Caught the Monster', num(d.Dome?.Captures))}${kv('Total time up', clock(d.Dome?.TotalTime))}
      ${kv('Monster damage taken in domes', num(m.domes.reduce((a, e) => a + (e.Data.MonsterSummary?.TotalDamageReceived || 0), 0)))}${kv('Hunters downed in domes', num(m.domes.reduce((a, e) => a + sumv(e.Data.HunterSummary?.TotalIncaps), 0)))}</div></section>
  </div>
  ${PUBLIC ? '' : `<h2>Every dome</h2>
  <div class="heatwrap">${heat(m.mapKey, m.domes.map(e => ({ x: e.Data.DomeXPosition, y: e.Data.DomeYPosition, caught: !!e.Data.InDome?.Monster })), 'all', true)}
  ${table('domes', [N('#', e => e.i), N('At', e => e.at, e => clock(e.at)), N('Up for', e => e.BaseHeader.Duration, e => Math.round(e.BaseHeader.Duration) + 's'),
    Tx('Inside', e => '', e => ROLES.filter(r => e.Data.InDome?.[r]).map(r => img(C.classIcons[r], 'cls', r)).join(' ')), Tx('Monster health', e => '', e => { const s = e.Data.MonsterSummary; return s ? hm(s.Start.HitPoints, s.End.HitPoints) : '–'; }),
    Tx('Monster armor', e => '', e => { const s = e.Data.MonsterSummary; return s ? hm(s.Start.Armor, s.End.Armor) : '–'; }), N('Health damage', e => e.Data.MonsterSummary?.HealthDamageReceived ?? null),
    N('Armor damage', e => e.Data.MonsterSummary?.ArmorDamageReceived ?? null), N('Stage', e => e.Data.MonsterSummary?.Start.Stage ?? null),
    Tx('Downs', e => '', e => (e.Data.HunterSummary?.IncapList || []).map((c, i) => `${esc(c)} ${clock(e.Data.HunterSummary.IncapTimes[i])}`).join(', ') || '–'),
    Tx('Strikes after', e => '', e => { const s = e.Data.HunterSummary; return s ? HUNTERS.map(r => `${s.Start.Strikes[r]}→${s.End.Strikes[r]}`).join(' ') : '–'; }),
    Tx('Died', e => '', e => HUNTERS.filter(r => e.Data.HunterSummary?.Deaths?.[r]).join(', ') || '–'), Tx('Timed events', e => '', e => (e.Data.DurationEvents || []).map(x => `${pretty(x.Event)} ${x.Duration}s`).join(', ') || '–'),
    Tx('Ended match', e => '', e => e.Data.GameEnding ? 'Yes' : 'No')], m.domes.map((e, i) => ({ ...e, i: i + 1, at: (T(e) - t0) / 1000 - e.BaseHeader.Duration })), 0, 0, true)}</div>
  <p class="note">Dome numbers on the map match the table. Strikes are listed Assault, Trapper, Medic, Support.</p>`}
  <h2>Weapons and abilities</h2>
  ${rows.filter(r => r.p).map(r => `<details class="c-${r.role}"><summary>${img(C.classIcons[r.role], 'cls', r.role)} ${face(r.id)} <b>${esc(charInfo(r.id).name)}</b>
    <span class="dim">${num(r.ph.DamageToEnemyTeam)} damage</span></summary>${slots(r.p, Math.min(3, m.hdr.MonsterFinalStage))}</details>`).join('')}
  ${dl && !PUBLIC ? `<h2>Dialogue</h2><details><summary><b>${dl.Responses.length} voice lines played</b></summary>${table('dlog', [N('#', l => l.i), Tx('Speaker', l => charInfo(l.sp).name), Tx('Line', l => l.resp), Tx('Triggered by', l => l.ev),
    N('Variation', l => l.va), Tx('', l => '', l => play(lineUrl(l.sp, l.resp)))], dl.Responses.map((resp, i) => ({ i: i + 1, resp, sp: dl.Speakers[i], ev: dl.EventNames[i], va: dl.Variations?.[i] })), 0, 0, true)}</details>` : ''}`;
}

function matchmaking() {
  // queue attempts are stored per patch, mode and ranked-or-not, so the filter bar picks groups to add up (the solo box does not apply)
  const pass = k => { const [v, mode, rk] = k.split('|'); return (!ST.fl.v || v === ST.fl.v) && (!ST.fl.mode || mode === ST.fl.mode) && (!ST.fl.type || (rk === 'R') === ST.fl.type.startsWith('Ranked')); };
  const mm = SUMMARY.merge(Object.keys(ACC.mm).filter(pass).map(k => ACC.mm[k])) || { n: 0, ok: 0, dur: 0, dodges: 0, team: {}, type: {}, hourN: [], hourDur: [], hist: [], stages: {}, reasons: {} };
  // queue times are medians (qmedian): a few attempts left running for hours pull the average far out
  const q = x => x ? qmedian(x.hist) : null, byHour = Array.from({ length: 24 }, (_, h) => mm.hourHist?.[h] ? qmedian(mm.hourHist[h], HSTEP) : avg(mm.hourDur[h], mm.hourN[h])), rows = o => Object.entries(o).map(([k, v]) => ({ k, ...v }));
  const gaps = Object.keys(S.even).map(Number).sort((a, b) => a - b);
  return `<h1>Matchmaking</h1><p class="sub">How long queues take, how even the matches are, and how often players leave them. Custom games never queue, so their queues are not here.</p>${filterBar()}
  ${tiles(tile('Queue attempts', num(mm.n)), tile('Typical queue', clock(q(mm)), 'median, when a match was found'), tile('Reached a match', fpct(pct(mm.ok, mm.n))), tile('Left the queue', fpct(pct(mm.n - mm.ok, mm.n))),
    tile('Hunter queue', clock(q(mm.team.Merc))), tile('Monster queue', clock(q(mm.team.Monster))), tile('Ranked queue', clock(q(mm.type.Ranked))), tile('Arcade queue', clock(q(mm.type.Hunt))))}
  <p class="note">Queue times are medians: half of the queues that found a match took less, half took longer.</p>
  <h2>Queue time through the day</h2><div class="panel">${chart(byHour, byHour.map((_, h) => String(h).padStart(2, '0')), clock)}<p class="note">Median queue by hour (UTC), to the minute.${ST.fl.mode ? ' Most queue attempts are recorded without a mode, so with a mode picked only the ones that name it are counted.' : ''}</p></div>
  ${PUBLIC ? '' : `<div class="cols"><section><h2>How far queue attempts get</h2>${table('mmst', [Tx('Step', s => pretty(s.k)), N('Reached', s => s.n), N('Share', s => pct(s.n, mm.n), s => bar(pct(s.n, mm.n))),
      N('Time to reach', s => s.at / s.n, s => clock(s.at / s.n)), N('Players in lobby', s => s.lobby ? s.pl / s.n : null, s => s.lobby ? dec(s.pl / s.n) : '–')], rows(mm.stages), 1)}</section>
    <section><h2>Why people leave</h2>${table('mmwhy', [Tx('Reason', r => pretty(r.k)), N('Times', r => r.n), N('After', r => r.at / r.n, r => clock(r.at / r.n))], rows(mm.reasons), 1)}
      <p class="note">${num(mm.dodges)} queue attempts were queue dodges: leaving a ranked lobby that already had a Hunter and a Monster.</p></section></div>`}
  <h2>Leavers</h2>
  ${tiles(tile('Matches with a leaver', fpct(pct(S.leaverMatches, S.total)), `${num(S.leaverMatches)} of ${num(S.total)}`), tile('Disconnects', num(sumv(S.leavers))))}
  ${table('mmleav', [Tx('Class', r => r.k, r => classTag(r.k)), N('Disconnects', r => r.n), P('Share of matches', r => pct(r.n, S.total))], ROLES.map(k => ({ k, n: S.leavers[k] || 0 })), 1)}
  <div class="cols"><section><h2>Parties and the health buff</h2>${table('mmparty', [Tx('Parties in the lobby', x => x.k.split('|')[0]), Tx('Hunter health buff', x => x.k.split('|')[1] || 'None'), N('Matches', x => x.n),
      W('Hunters win', x => pct(x.w, x.d), x => `<span class="c-Medic">${bar(pct(x.w, x.d))}</span>`, x => x.n)], Object.entries(S.party).map(([k, v]) => ({ k, ...v })), 2, 0, false, null, FEW)}</section>
    <section><h2>How even matches are</h2><div class="panel c-Medic">${chart(gaps.map(g => pct(S.even[g].w, S.even[g].d)), gaps.map(g => (g > 0 ? '+' : '') + g), fpct)}
      <p class="note">Hunter win rate by skill gap (Hunters' average matchmaking skill minus the Monster's). A flat line near 50% means even matches.</p></div></section></div>`;
}

function progression() {
  const R = roster(); if (typeof R !== 'object') return waiting('Progression', R);
  const A = ACC, people = Object.values(R.players), src = Object.entries(A.rewards).map(([k, r]) => { const [why, type, ...name] = k.split('|'); return { why, type, name: name.join('|'), ...r }; });
  // levels come with each player's own match record: the account level, and the level of the character they played
  const tracks = ['Global', ...Object.keys(C.characters).filter(c => people.some(p => p.chars[c]?.level != null))];
  const latest = people.map(p => ST.prog.track === 'Global' ? p.level : p.chars[ST.prog.track]?.level).filter(v => v != null);
  const lv = Array(Math.ceil((latest.reduce((a, v) => Math.max(a, v), 1) + 1) / 5)).fill(0); for (const v of latest) lv[Math.floor(v / 5)]++;
  const kb = A.keyHist || SUMMARY.keyHist(A.players);
  return `<h1>Progression</h1><p class="sub">XP, levels, Silver Keys, rewards and challenges, as the profile service reported them to each player's game.</p>
  ${tiles(tile('XP per match', dec(avg(A.xp.gain, A.xp.n)), 'account XP'), tile('Level-ups', num(A.xp.ups)), tile('Keys earned', num(src.filter(r => r.type === 'Currency').reduce((a, r) => a + r.total, 0))),
    tile('Rewards granted', num(src.reduce((a, r) => a + r.n, 0))), tile('Challenge updates', num(A.challN)))}
  <h2>Level spread</h2><div class="filters"><label>Track ${select('prog.track', tracks.map(t => [t, t === 'Global' ? 'Account' : charInfo(t).name]), ST.prog.track)}</label></div>
  <div class="panel">${chart(lv, lv.map((_, i) => `${i * 5}-${i * 5 + 4}`))}<p class="note">${num(latest.length)} players by their level on this track, as their game reported it with their newest match.</p></div>
  <h2>Rewards by source</h2>${table('rsrc', [Tx('Source', r => pretty(r.why)), Tx('Kind', r => r.type), Tx('Reward', r => r.name), N('Times', r => r.n), N('Total', r => r.total), N('Each', r => r.total / r.n)], src, 3)}
  <h2>Challenges</h2>${table('chal', [Tx('Challenge', c => c.name), Tx('Category', c => c.cat), N('Taken', c => c.taken), N('Finished', c => c.done), N('Declined', c => c.declined),
    N('Updates to finish', c => c.done ? c.upd / c.done : null, c => c.done ? dec(c.upd / c.done) : '–'), N('Reward', c => c.done ? c.pay / c.done : null)], Object.entries(A.chall).map(([name, c]) => ({ name, ...c })), 2)}
  <h2>Silver Key balances</h2><div class="panel">${chart(kb, kb.map((_, i) => i === 10 ? '10k+' : i + 'k'))}<p class="note">${num(sumv(kb))} players by their latest key balance. Totals only; individual balances are not shown.</p></div>`;
}

function store() {
  const s = ACC.store;
  const by = (id, label, dim) => table(id, [Tx(label, x => pretty(x.k) || 'Not recorded'), N('Attempts', x => x.n), N('Completed', x => x.ok), P('Share', x => pct(x.n, s.n))],
    Object.entries(s.by[dim] || {}).map(([k, v]) => ({ k, ...v })), 1);
  return `<h1>Store</h1><p class="sub">What gets bought in the in-game Store. Totals only; nobody's purchases are shown by name.</p>
  ${tiles(tile('Purchase attempts', num(s.n)), tile('Completed', num(s.ok), fpct(pct(s.ok, s.n))), tile('Not completed', num(s.n - s.ok), 'cancelled or failed'), tile('Keys spent', num(s.paid)))}
  <h2>Most bought</h2>${table('store', [Tx('Item', i => i.name), Tx('Kind', i => i.kind), Tx('Offer', i => i.id), N('List price', i => avg(i.list, i.n)), N('Average paid', i => i.ok ? i.paid / i.ok : null),
    N('Attempts', i => i.n), N('Bought', i => i.ok)], Object.entries(s.items).map(([id, i]) => ({ id, ...i })), 6)}
  <div class="cols"><section><h2>Where purchases start</h2>${by('st-ctx', 'Screen', 'ctx')}</section><section><h2>How they are paid</h2>${by('st-pay', 'Method', 'pay')}</section></div>
  <div class="cols"><section><h2>By kind</h2>${by('st-kind', 'Kind', 'kind')}</section><section><h2>Founders against everyone else</h2>${by('st-f', 'Founder', 'fd')}</section></div>
  <h2>Outcomes</h2>${by('st-res', 'Result', 'res')}`;
}

function dialogue() {
  const speakers = [...new Set(Object.values(ALL.lines).map(l => l.speaker))].sort((a, b) => charInfo(a).name.localeCompare(charInfo(b).name));
  const lines = Object.values(ALL.lines).filter(l => !ST.dlg.speaker || l.speaker === ST.dlg.speaker);
  return `<h1>Dialogue</h1><p class="sub">Every voice line the game chose to play, with how often. Play uses the audio already on the Stage 2 website where a file with that name exists.</p>
  <div class="filters"><label>Speaker ${select('dlg.speaker', speakers.map(s => [s, charInfo(s).name]), ST.dlg.speaker, 'Everyone')}</label></div>
  ${tiles(tile('Lines played', num(ALL.lineCount)), tile('Lines per minute', dec(ALL.lineCount / (ALL.lineSecs / 60 || 1))), tile('Distinct lines', num(Object.keys(ALL.lines).length)), tile('Speakers', num(speakers.length)))}
  <h2>Lines</h2>${table('lines', [Tx('Line', l => l.response), Tx('Triggered by', trigger), Tx('Speaker', l => charInfo(l.speaker).name, l => chip(l.speaker)),
    Tx('Variations heard', l => [...l.vars].sort().join(', ')), N('Times played', l => l.n), Tx('', l => '', l => play(lineUrl(l.speaker, l.response)))], lines, 4, 60)}
  <h2>What triggers dialogue</h2>${table('trig', [Tx('Trigger', t => t.k), N('Times', t => t.n), N('Share', t => pct(t.n, ALL.lineCount), t => bar(pct(t.n, ALL.lineCount)))], Object.entries(ALL.triggers).map(([k, v]) => ({ k, n: v.n })), 1, 25)}`;
}

function community() {
  // the public totals have no account table: a player count and a count per region instead
  const A = ACC, people = Object.values(A.players || {}), nPeople = A.playersN ?? people.length, days = Object.keys(A.daily).sort().slice(-28), founders = people.filter(p => p.founder === 'Yes').length;
  const active = days.map(d => A.daily[d].active ?? A.daily[d].ids.length), signins = days.map(d => A.daily[d].signins), sessions = A.sessN ?? A.sessions.length;
  const share = (id, label, rows) => table(id, [Tx(label, x => pretty(x.k)), N('Players', x => x.n), N('Share', x => pct(x.n, nPeople), x => bar(pct(x.n, nPeople)))], rows, 1);
  const split = (id, label, key) => share(id, label, count(people, key));
  return `<h1>Community</h1><p class="sub">Who is playing, where and when.</p>
  ${tiles(tile('Players', num(nPeople), 'whose game has sent a record'), tile('Active on the last day', num(active.at(-1)), days.length ? day_(days.at(-1)) + ', so far' : ''), tile('Sign-ins', num(A.logins)),
    PUBLIC ? '' : tile('New players', num(people.filter(p => p.fresh).length)), PUBLIC ? '' : tile('Founders', fpct(pct(founders, people.length)), `${num(founders)} players`), tile('Play sessions', sessions ? num(sessions) : '–'))}
  <div class="cols"><section><h2>Active players per day</h2><div class="panel">${chart(active, days.map(d => d.slice(8)))}</div></section>
    <section><h2>Sign-ins per day</h2><div class="panel">${chart(signins, days.map(d => d.slice(8)))}</div></section></div>
  <p class="note">Days are UTC. A player is active on a day when their game sent any record that day.</p>
  ${PUBLIC ? `<h2>Regions</h2>${A.regions ? share('reg', 'Online region', Object.entries(A.regions).map(([k, n]) => ({ k, n }))) : split('reg', 'Online region', p => p.region)}`
  : `<div class="cols"><section><h2>Regions</h2>${split('reg', 'Online region', p => p.region)}</section><section><h2>Ratings regions</h2>${split('creg', 'Ratings region', p => p.cregion)}</section></div>
  <div class="cols"><section><h2>Text language</h2>${split('lang', 'Language', p => p.lang)}</section><section><h2>Audio language</h2>${split('alang', 'Language', p => p.audio)}</section></div>
  <h2>Patches, game build and platform</h2>${table('vers', [Tx('Patch · build · platform', v => v.k), N('Records', v => v.n), N('Last seen', v => v.t, v => day(v.t))], Object.entries(A.vers).map(([k, v]) => ({ k, ...v })), 2)}`}`;
}

function fairplay() {
  const A = ACC, kicks = Object.entries(A.kicks).map(([k, v]) => { const [code, ...msg] = k.split('|'); return { code, msg: msg.join('|'), ...v }; });
  return `<h1>Fair play</h1><p class="sub">Leavers, queue dodgers, late joins and anti-cheat kicks. Counts only; nobody is named here.</p>
  ${tiles(tile('Matches with a leaver', fpct(pct(ALL.leaverMatches, ALL.total)), `${num(ALL.leaverMatches)} of ${num(ALL.total)}`), tile('Disconnects', num(sumv(ALL.leavers))),
    tile('Queue dodges', num(Object.values(A.mm).reduce((a, q) => a + q.dodges, 0))), tile('Late joins', num(A.late), 'reported by players'), tile('Anti-cheat kicks', num(kicks.reduce((a, k) => a + k.n, 0))),
    tile('Never finished', num(A.unfin.n), 'matches that started'))}
  <div class="cols"><section><h2>Disconnects by class</h2>${table('leav', [Tx('Class', r => r.k, r => classCell(r.k)), N('Disconnects', r => r.n), P('Share of matches', r => pct(r.n, ALL.total))],
      ROLES.map(k => ({ k, n: ALL.leavers[k] || 0 })), 1)}</section>
    <section><h2>Anti-cheat kicks</h2>${table('kicks', [Tx('Code', k => k.code), Tx('Message', k => k.msg), N('Times', k => k.n), N('Last', k => k.t, k => day(k.t))], kicks, 2)}</section></div>
  <h2>Matches that started but never finished</h2>${table('unfin', [Tx('Mode', r => modeName(r.k.split('|')[0])), Tx('Match type', r => typeName(r.k.split('|')[1])), N('Matches', r => r.n), N('Share', r => pct(r.n, A.unfin.n), r => bar(pct(r.n, A.unfin.n)))],
    Object.entries(A.unfin.by).map(([k, n]) => ({ k, n })), 2)}
  <p class="note">A start with no end usually means the match was restarted or the host left. The game also drops the end record when a match is restarted. A match still being played when the totals were last updated is counted here until its end record arrives.</p>`;
}

function about() {
  const A = ACC, one = f => Object.keys(A.hdr?.[f] || {}).map(v => v === '' ? '(empty)' : v).join(', '), ctx = Object.keys(A.hdr?.Context || {}).filter(Boolean);
  const dist = Object.keys(ALL.dist || {}).join(', '), leftOut = SUM ? SUM.recordsLeftOut : LEFT_OUT,
    leftBy = Object.entries((SUM ? SUM.leftOutBy : LEFT_BY) || {}).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${num(n)} ${c ? 'marked ' + esc(c) : 'with no release name'}`).join(', ');
  const feeds = [['Characters, Matchups, Perks, Maps, Match page', 'ServerRoundRecord', 'The PC hosting the match'], ['Weapon, ability, stage and source numbers', 'ServerPlayer Assault / Trapper / Medic / Support / Monster records', 'The PC hosting the match'],
    ['Fight heatmap, dome list', 'ServerDomeRecord', 'The PC hosting the match'], ['Lobby panel, unfinished matches', 'ServerRoundStartRecord', 'The PC hosting the match'], ['Dialogue', 'ServerDialogueRecord', 'The PC hosting the match'],
    ['Anti-cheat kicks', 'ServerEACClientKickRecord', 'The PC hosting the match'], ['Players, Ranked, skins, chat, late joins', 'ClientRoundRecord', "Each player's own game"], ['Matchmaking', 'ClientMatchmakingRecord', "Each player's own game"],
    ['Progression', 'ClientXPRecord, ClientRewardRecord, ClientChallengeUpdateRecord', "Each player's own game"], ['Store', 'ClientPurchaseRecord', "Each player's own game"],
    ['Community: sign-ins, Founders', 'ClientLoginRecord', "Each player's own game"], ['Movement and frame-rate heatmaps', 'ClientProfilingRecord', 'Nobody: never switched on']];
  return `<h1>About the data</h1><p class="sub">Evolve Stage 2 builds a set of records about every match, queue attempt and sign-in. This site only reads those records.</p>
  ${PUBLIC ? '' : `<h2>What each page is built from</h2><div class="tw"><table><thead><tr><th>Page</th><th>Record</th><th>Sent by</th></tr></thead><tbody>${feeds.map(f => `<tr><td>${f[0]}</td><td>${f[1]}</td><td>${f[2]}</td></tr>`).join('')}</tbody></table></div>
  <h2>Records received</h2>${table('recs', [Tx('Record', r => r.k), N('Received', r => r.n), N('Last seen', r => r.t, r => day(r.t)), Tx('Data version', r => Object.keys(r.versions).join(', '))], Object.entries(A.records).map(([k, v]) => ({ k, ...v })), 1)}
  <h2>Record details</h2><div class="panel">${kv('Build configuration', esc(one('Config')))}${kv('Platform', esc(one('Platform')))}${kv('Change-list number', esc(one('Changelist')))}
    ${kv('Build number', esc(one('BuildNumber')))}${kv('Micro-patch version', esc(one('Micropatch')))}${kv('Context tags seen', esc(ctx.join(', ') || 'none'))}
    ${kv('Application id', esc(one('PublicAppID')))}${kv('Header versions', `base ${esc(one('base'))} · player ${esc(one('player'))} · match ${esc(one('match'))} · per-player ${esc(one('perPlayer'))}`)}</div>`}
  <h2>Things to know</h2><div class="panel"><ul class="plain">
    <li>Match records name the role and the character, never the player. A player is linked to a role only when their own game also reported the match; otherwise the scoreboard says "not reported".</li>
    ${PUBLIC ? '' : `<li>Records hold no player names. Names shown here come from a separate id to name list. The sign-on session id is used to count play sessions and is never shown.</li>`}
    <li>Match records come from the host's PC only, so a host could send false numbers. Nothing here cross-checks them yet.</li>
    <li>For Hunters the game counts every damage tick as a hit, so hits can exceed uses and its miss count is unreliable. Monster hits are counted per ability use.</li>
    ${PUBLIC ? '' : `<li>Records carry no clock time. Dates, queue hours and dome times come from when each record arrived.</li>`}
    ${PUBLIC ? '' : `<li>The game never fills in the Monster's distance travelled: the value seen across all ${num(ALL.total)} match records is ${esc(dist)}.</li>`}
    ${PUBLIC ? '' : `<li>Hotswap and late-join counts may always read zero: nothing was found in the game that triggers them.</li>`}
    <li>Ranked ratings, matches, wins and losses come from the game server's own ladder, handed over with each update. The game keeps its division table hidden, so a division's rating range is known only once the game has asked the server about it.</li>
    ${PUBLIC ? '' : `<li>The post-match survey never reaches a record, so its answers cannot be shown.</li>`}
    ${PUBLIC ? '' : `<li>The game marks nobody as a first-time user or as a Founder in these records, so New players and Founders read zero.</li>`}
    <li>Matches played by bots are left out of character, perk and matchup numbers.</li>
    <li>When a host starts a match that never finishes, the game can carry that match's weapon list and damage into the record of the next one: another character's weapon names, or both characters' damage mixed together. So a match played right after an unfinished one on the same host counts for matches, picks and wins, and is left out of every damage, healing, weapon, ability and skill-point number, on character pages and players' own pages alike. The same goes for a record that lists weapons that are not the character's own, and for one that holds an impossible number (the new-player scenario scripts hits of 10,000,000).</li>
    <li>Only matches played on an official release are counted${OFFICIAL.size ? ': ' + [...OFFICIAL].map(n => esc(n) + (PATCH_OF[n] ? ` (shown as ${esc(PATCH_OF[n])})` : '')).join(', ') : ''}. The launcher writes the release name on every record when the game is started: on the public game it is the public release at that moment, and it is blank only when the launcher could not read the release list. Records from any other build, or with no name, are left out${PUBLIC ? '' : SUM || !SHOW_ALL ? `; ${num(leftOut)} left out so far${leftBy ? ` (${leftBy})` : ''}` : ' (this local preview shows everything)'}.</li>
    <li>The game collects telemetry data such as damage dealt, damage taken, healing, and a wide variety of other stats that are used to analyze matches and the current state of the game. Matches are shown here with the player's display name.</li></ul></div>
  <h2>What the site holds</h2>${tiles(PUBLIC ? '' : tile('Records', num(Object.values(A.records).reduce((a, r) => a + r.n, 0))), tile('Matches', num(ALL.total), 'finished'), tile('Players', num(A.playersN ?? Object.keys(A.players).length)),
    tile('Covers', SUM ? `${day_(SUM.from)} to ${day_(SUM.to)}` : EVENTS.length ? `${day(SPAN()[0])} to ${day(SPAN()[1])}` : '–', SUM ? 'updated ' + stamp(SUM.built) : ''))}`;
}

/* ---------- router ---------- */
const routes = { '': overview, characters, character, matchups, perks, maps, ranked, players, player, matches, match, matchmaking, progression, store, dialogue, community, fairplay, about };
if (PUBLIC) for (const s of ['progression', 'store', 'dialogue', 'fairplay']) delete routes[s];      // the developer view's own pages
const parent = { character: 'characters', player: 'players', match: 'matches' };
const header = document.querySelector('.top'), menuBtn = document.getElementById('menuBtn');   // the phone menu
const menu = open => { header.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open); menuBtn.textContent = open ? 'Close' : 'Menu'; };
menuBtn.addEventListener('click', () => menu(!header.classList.contains('open')));
document.getElementById('nav').addEventListener('click', () => menu(false));
function render(keepScroll) {
  const [, name = '', arg = ''] = location.hash.split('/');
  if (!keepScroll) menu(false);
  app.innerHTML = (routes[name] || overview)(decodeURIComponent(arg));
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.r === (name in parent ? parent[name] : name));
  if (!keepScroll) window.scrollTo(0, 0);
}
function setState(path, value) {
  const [group, key] = path.split('.');
  ST[group][key] = value;
  if (group === 'fl') S = totals(true);
  render(true);
}
const audio = new Audio();
addEventListener('hashchange', () => render());
app.addEventListener('click', e => {
  const s = e.target.closest('[data-sort]'), b = e.target.closest('button[data-st]'), a = e.target.closest('[data-audio]'), row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a, button, select, input')) location.hash = row.dataset.href;      // the whole row opens the page, not just the name
  if (s) { const st = sortState[s.dataset.sort], i = +s.dataset.i; st.dir = st.i === i ? -st.dir : -1; st.i = i; st.pg = 0; render(true); }
  const pb = e.target.closest('button[data-pg]'); if (pb && !pb.disabled) { sortState[pb.dataset.pg].pg = +pb.dataset.p; render(true); }
  if (b) setState(b.dataset.st, b.dataset.v);
  if (a) { audio.src = a.dataset.audio; audio.play().catch(() => { a.textContent = 'No file'; }); }
});
app.addEventListener('toggle', e => { const k = e.target.dataset?.fold; if (k) e.target.open ? FOLDS.add(k) : FOLDS.delete(k); }, true);
app.addEventListener('change', e => { if (e.target.matches('select[data-st]')) setState(e.target.dataset.st, e.target.value); });
app.addEventListener('input', e => {
  if (!e.target.matches('input[data-st]')) return;
  const path = e.target.dataset.st, at = e.target.selectionStart;
  setState(path, e.target.value);
  const el = app.querySelector(`input[data-st="${path}"]`); el.focus(); el.setSelectionRange(at, at);   // the page was redrawn, so put the cursor back
});
render();
