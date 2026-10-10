'use strict';
/* Modded Evolve Telemetry: joins the game's raw telemetry records into matches and draws every page.
   COVERAGE.md lists where each recorded field ends up. Site text says "match"; the game's own field names say "Round". */
// display names: those that came with the stored totals, then those of the players in the loaded recent records
const C = window.CATALOG, NAMES = { ...(window.TELEMETRY_SUMMARY?.names || {}), ...(window.TELEMETRY_PLAYERS || {}) };
// Owner's rule (2026-10-09): only matches played on an OFFICIAL public release count. Each record names the release it was played on
// (BaseHeader.Context, set by the launcher only when the player's game files are exactly that release). Everything else is left out:
// older public builds, betas and drafts, files that match no release, and Turtle Rock's own test tag ("aisoak").
// Add each official release's exact name here when it goes live. The About page says which are counted and how many records were left out.
const OFFICIAL = new Set([
  'Patch-1.0-Release',      // public game manifest version, live 2026-10-09 13:17 UTC
  'Patch-1.0-Hot-Fix-1',    // public game manifest version (client/game-manifest-stage2.json), live 2026-10-10 09:37 UTC
]);
// Ranked: a player is placed on a ladder (Hunter or Monster) after this many ranked matches on it. The original game used 10.
// The modded game uses 5: the launcher hands the game "ui_rp_placement_matches 5" with its build settings (launcher source
// Services/Stage2LocalServices.cs), and the account server's ladder uses the same number (TestRankedLadder.PlacementMatches).
const PLACEMENT = 5;
// the invented sample, and the private local preview, show everything they are given
const SHOW_ALL = !!window.TELEMETRY_SAMPLE || ['localhost', '127.0.0.1'].includes(location.hostname) && !/[?&]official=1/.test(location.search);
const RAW = window.TELEMETRY_EVENTS || [];
const counted = e => e.BaseHeader?.Context !== 'aisoak' && (SHOW_ALL || OFFICIAL.has(e.BaseHeader?.Context));
const EVENTS = RAW.filter(counted);
const LEFT_OUT = RAW.length - EVENTS.length;
// What was left out, by the release name each record carries ('' when the game files match no release). The About page lists
// it, so a new public release that has not been added to OFFICIAL above is seen at once instead of silently going missing.
const LEFT_BY = {}; for (const e of RAW) if (!counted(e)) { const c = e.BaseHeader?.Context || ''; LEFT_BY[c] = (LEFT_BY[c] || 0) + 1; }
const ROLES = ['Assault', 'Trapper', 'Medic', 'Support', 'Monster'], HUNTERS = ROLES.slice(0, 4);
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
const sumv = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
const cell = (o, k, init) => o[k] || (o[k] = init());
const nw = () => ({ n: 0, w: 0, d: 0 });
const T = e => e._t ?? (e._t = Date.parse(e._received));
// The dates the loaded records span. Shown beside every total, because the server only sends a recent window: without this a shorter window would shrink the numbers unseen.
const SPAN = () => SPAN.v || (SPAN.v = EVENTS.reduce((a, e) => [Math.min(a[0], T(e)), Math.max(a[1], T(e))], [Infinity, 0]));
const stamp = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const covers = () => window.TELEMETRY_SUMMARY && window.SUMMARY ? `every match from ${day(Date.parse(window.TELEMETRY_SUMMARY.from))} to ${day(Date.parse(window.TELEMETRY_SUMMARY.to))} · totals updated ${stamp(window.TELEMETRY_SUMMARY.built)}`
  : EVENTS.length ? `records from ${day(SPAN()[0])} to ${day(SPAN()[1])}` : 'no records yet';
// which play session a record belongs to: the launcher blanks the sign-on session id and leaves a short hash of it in _session
const sessionOf = e => e._session || e.ClientHeader?.SSOSessionID || '';
const build = e => `${e.BaseHeader?.BuildNumber}.${e.BaseHeader?.Micropatch}`;
// the patch name is whatever the client put in the context tag; records without one fall back to the game build
const ver = e => { const c = e.BaseHeader?.Context; return c ? 'Patch ' + c.replace(/^patch[-_ ]?/i, '') : 'Build ' + build(e); };
const pretty = s => String(s ?? '').replace(/^(ONLINE_REGION_|CLASSIFICATION_REGION_|ROUND_END_REASON_|eLSR?_)/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase().replace(/^./, c => c.toUpperCase());
// the names the site uses for the game's match types and modes (owner's wording: Ranked, Arcade, Custom).
// "Campaign" is what the game calls the tutorial missions: every Campaign match recorded so far has GameMode "Tutorial" on the map "tutorial".
const TYPES = { RankedQuickPlay: 'Ranked', QuickPlay: 'Arcade', Custom: 'Custom', RankedQuickPlayCoop: 'Ranked co-op', QuickPlayCoop: 'Arcade co-op', CustomCoop: 'Custom co-op',
  Ranked: 'Ranked', Hunt: 'Arcade', Campaign: 'Tutorial' }, MODES = { ArenaMode: 'Arena', NewPlayerScenario: 'New player scenario' };
const typeName = t => TYPES[t] || pretty(t), modeName = g => MODES[g] || pretty(g);
const bar = v => v == null ? '–' : `<span class="bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(1)}%"></i></span>${fpct(v)}`;

const ITEMS = { Pistol: { name: 'Pistol', icon: '' }, BasicAttack: { name: 'Melee', icon: '' }, Pounce: { name: 'Pounce', icon: '' },
  Special: { name: 'Burn and wall pounce', icon: '' }, Uncategorized: { name: 'Other', icon: '' } };
for (const c of Object.values(C.characters)) for (const it of c.items) ITEMS[it.key] = it;
const charInfo = id => C.characters[id] || { name: id, class: '', thumb: '', items: [], voice: '' };
const itemInfo = k => ITEMS[k] || { name: k, icon: '' };
// a recorded perk id is the perk plus a number 1 to 3 ("PerkMartyrLow2"), read here as the perk's level: the site counts the perk and keeps the level beside it
const perkBase = k => C.perks[String(k).toLowerCase()] ? String(k) : String(k).replace(/[1-3]$/, ''), perkLevel = k => +(/[1-3]$/.exec(String(k)) || [0])[0];
const perkInfo = k => C.perks[perkBase(k).toLowerCase()] || { name: k, icon: '', tier: '', team: '' };
const mapInfo = key => { const [k, layer] = String(key).split('|'), m = C.maps[k.toLowerCase()] || { name: pretty(k), minimap: '', layers: {} }, l = m.layers?.[layer];
  return { ...m, name: l ? `${m.name} (${l.name})` : layer ? `${m.name} (${pretty(layer)})` : m.name, minimap: l?.minimap || m.minimap }; };
const pname = id => NAMES[id] || 'Player ' + String(id).slice(0, 6);
// A rating's division. The catalog holds a division's rating range only once the game itself has shown it (and the three tiers'
// ranges). Outside the known ranges the tier is still certain, and the divisions it could be are the unseen ones around it.
function division(r) {
  if (!(r > 0)) return null;
  const R = C.ranks, exact = R.find(d => d.max != null && r >= d.min && r < d.max);
  if (exact) return exact;
  const tier = Object.keys(C.tiers).find(t => r >= C.tiers[t][0] && r < C.tiers[t][1]) || R[R.length - 1].tier;
  const lo = R.findLastIndex(d => d.max != null && d.max <= r), hi = R.findIndex(d => d.min != null && d.min > r);
  const open = R.slice(lo + 1, hi < 0 ? R.length : hi).filter(d => d.tier === tier), Tier = tier[0].toUpperCase() + tier.slice(1);
  if (open.length === 1) return open[0];
  return { name: open.length === 2 ? `${open[0].name} or ${open[1].name.split(' ')[1]}` : `${Tier} (division not seen yet)`, tier, icon: '' };
}
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

/* ---------- sort the records ---------- */
const byId = new Map();
const slot = id => byId.get(id) || byId.set(id, { id, players: {}, clients: {}, domes: [], kicks: [], mm: [] }).get(id);
// The records name weapons by the game's own class names ("FlameThrowerB"); the catalog knows a character's kit by slot. So each name is
// matched to the catalog by the slot it arrives in. Slot order as the first real match showed it: Hunters 1 primary, 2 class ability,
// 3 secondary, 4 special; Monsters 1 to 4 in card order. ponytail: one name is assumed to mean one item for every character that carries it.
const SLOT_TYPE = ['Primary', 'Class Ability', 'Secondary', 'Special Ability'];
function learnItems(e) {
  const cls = e.ServerPlayerRoundHeader.Class, items = charInfo(e.ServerRoundHeader.CharacterId?.[cls]).items;
  for (let j = 1; j <= 4; j++) { const n = e.Data['Ability' + j]?.Name, it = cls === 'Monster' ? items[j - 1] : items.find(i => i.type === SLOT_TYPE[j - 1]);
    if (n && it && !ITEMS[n]) ITEMS[n] = { ...it, game: n }; }
  const pn = e.Data.Pistol?.Name;
  if (pn && !ITEMS[pn]) ITEMS[pn] = { ...ITEMS.Pistol, game: pn };
}
// Put one record where its match looks for it. (Everything that is not part of a match is counted by account() further down.)
function ingest(e) {
  if (e.ClientHeader) {       // records arrive oldest first, so the last one seen wins
    if (e.EventName === 'ClientRoundRecord') slot(String(e.Data.RoundID)).clients[e.Data.CharacterClass] = e;
    if (e.EventName === 'ClientMatchmakingRecord' && +e.Data.GameSessionId) slot(String(e.Data.GameSessionId)).mm.push(e);
    return;
  }
  const h = e.ServerRoundHeader;
  if (!h) return;
  const r = slot(String(h.RoundID));
  if (e.EventName === 'ServerRoundRecord') r.round = e;
  else if (e.EventName === 'ServerRoundStartRecord') r.start = e;
  else if (e.EventName === 'ServerDomeRecord') r.domes.push(e);
  else if (e.EventName === 'ServerDialogueRecord') r.dialogue = e;
  else if (e.EventName === 'ServerEACClientKickRecord') r.kicks.push(e);
  else if (e.ServerPlayerRoundHeader) { r.players[e.ServerPlayerRoundHeader.Class] = e; learnItems(e); }
}
for (const e of EVENTS) ingest(e);
const toMatch = r => { const hdr = r.round.ServerRoundHeader;
  return { ...r, hdr, d: r.round.Data, dur: r.round.BaseHeader.Duration, t: T(r.round), v: ver(r.round), mapKey: hdr.Map + (hdr.MapLayer ? '|' + hdr.MapLayer : ''),
    decided: hdr.WinningTeam === 'Merc' || hdr.WinningTeam === 'Monster', hunterWin: hdr.WinningTeam === 'Merc' }; };
const MATCHES = [...byId.values()].filter(r => r.round).map(toMatch).sort((a, b) => b.t - a.t);
const UNFINISHED = [...byId.values()].filter(r => r.start && !r.round);
const MATCH = new Map(MATCHES.map(m => [m.id, m]));
const won = (m, role) => m.decided ? (role === 'Monster') !== m.hunterWin : null;
const pid = (m, role) => m.clients[role]?.ClientHeader?.My2kID || null;
const isRanked = m => String(m.hdr.MatchType).startsWith('Ranked');

/* ---------- page state and filters ---------- */
/* Stored totals (data/totals.js, written by tools/summarize.js from the archive of every record) cover every match since launch,
   split into the smallest groups the filters can tell apart: "patch|mode|match type|solo". With them, the numbers on the totals
   pages are those groups added together (summary.js), and the records this page loaded only supply recent matches for the lists. */
const SUM = window.TELEMETRY_SUMMARY && window.SUMMARY ? window.TELEMETRY_SUMMARY : null;
const sliceKeys = SUM ? Object.keys(SUM.slices) : [];
for (const [k, v] of Object.entries(SUM?.items || {})) ITEMS[k] ||= v;      // weapon and ability names the job learned from the records (learnItems)
const optionsOf = (i, f) => SUM ? [...new Set(sliceKeys.map(k => k.split('|')[i]))].sort() : uniq(f);
// solo matches are left out by default, unless they are all there is
const ST = { fl: { v: '', mode: '', type: '', solo: (SUM ? sliceKeys.some(k => k.endsWith('|0')) : MATCHES.some(m => m.hdr.Multiplayer)) ? '' : '1' }, chars: { cls: 'All' }, perks: { tab: 'hunter', tier: '', all: '', allc: '', char: '' }, maps: { key: '', view: 'all' }, rk: { view: 'o', tier: '', cls: '', region: '', q: '', sort: 'rating' },
  players: { q: '', region: '', all: '' }, dlg: { speaker: '' }, prog: { track: 'Global' }, browse: { day: '', all: '' } };
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
function compute(matches) {
  const S = { matches, total: matches.length, chars: {}, perks: {}, combos: {}, maps: {}, players: {}, ends: {}, party: {}, even: {}, leavers: {}, lines: {}, triggers: {},
    hw: 0, decided: 0, dur: 0, first: 0, throws: 0, caught: 0, late: 0, leaverMatches: 0, lineCount: 0, lineSecs: 0, bots: {}, side: { hunter: 0, monster: 0 }, dist: {} };
  const newChar = (id, role) => () => ({ id, role, n: 0, w: 0, d: 0, dmg: 0, taken: 0, heal: 0, healRecv: 0, shield: 0, wlTo: 0, wlFrom: 0, deaths: 0, downs: 0, ships: 0, lvl: 0, lvlN: 0,
    feed: 0, firstStage: {}, finalStage: {}, downT: Array(20).fill(0), st: [0, 1, 2, 3].map(() => ({ n: 0, to: 0, from: 0, wlTo: 0, wlFrom: 0, heal: 0, uses: 0, hits: 0 })),
    perks: {}, combos: {}, vs: {}, items: {}, players: {}, skins: {}, builds: {}, src: {}, pts: [0, 1, 2].map(() => [0, 0, 0, 0]), lvN: [0, 0, 0] });
  for (const m of matches) {
    const d = m.d, H = d.Hunters || {}, mon = d.Monster || {};
    const decided = m.decided ? 1 : 0;       // a match with no recorded winner is nobody's win and nobody's loss: it stays out of every win rate
    if (m.decided) { S.decided++; S.hw += m.hunterWin; }
    S.dur += m.dur; S.first += d.FirstEncounterTime || 0; S.throws += d.Dome?.Throws || 0; S.caught += d.Dome?.Captures || 0;
    const far = String(mon.TotalDistanceTraveled ?? 'nothing'); S.dist[far] = (S.dist[far] || 0) + 1;       // the Monster's distance travelled, as recorded (About page)
    const mp = cell(S.maps, m.mapKey, () => ({ key: m.mapKey, n: 0, w: 0, d: 0, dur: 0, first: 0, throws: 0, caught: 0, endDome: 0, wlMon: 0, wlHun: 0, ends: {}, domes: [], inside: {} }));
    mp.n++; mp.w += m.hunterWin; mp.d += decided; mp.dur += m.dur; mp.first += d.FirstEncounterTime || 0; mp.throws += d.Dome?.Throws || 0; mp.caught += d.Dome?.Captures || 0;
    mp.wlMon += d.Wildlife?.DamageToMonster || 0; mp.wlHun += d.Wildlife?.DamageToHunters || 0; mp.endDome += m.domes.some(e => e.Data.GameEnding) ? 1 : 0;
    for (const e of m.domes) for (const r of ROLES) mp.inside[r] = (mp.inside[r] || 0) + (e.Data.InDome?.[r] ? 1 : 0);
    for (const e of m.domes) mp.domes.push({ x: e.Data.DomeXPosition, y: e.Data.DomeYPosition, caught: !!e.Data.InDome?.Monster, dmg: e.Data.MonsterSummary?.TotalDamageReceived || 0,
      downs: sumv(e.Data.HunterSummary?.TotalIncaps), stage: e.Data.MonsterSummary?.Start?.Stage });
    const end = m.hdr.WinningTeam + '|' + m.hdr.WinCondition;
    cell(S.ends, end, () => ({ n: 0 })).n++; cell(mp.ends, end, () => ({ n: 0 })).n++;
    const pk = cell(S.party, (d.InitialPartySizes || []).join(' + ') + '|' + (d.MercHealthBuff || ''), nw); pk.n++; pk.w += m.hunterWin; pk.d += decided;
    const sk = d.PlayerSkillLevels || {}, hs = HUNTERS.map(r => sk[r]).filter(v => v >= 0);
    if (hs.length && sk.Monster >= 0) { const gap = Math.max(-20, Math.min(20, Math.round((hs.reduce((a, b) => a + b, 0) / hs.length - sk.Monster) / 5) * 5)), ev = cell(S.even, gap, nw); ev.n++; ev.w += m.hunterWin; ev.d += decided; }
    for (const r of ROLES) S.leavers[r] = (S.leavers[r] || 0) + (d.LeaverCounts?.[r] || 0);
    S.leaverMatches += sumv(d.LeaverCounts) ? 1 : 0; S.late += sumv(d.LateJoinerCounts);
    const dl = m.dialogue?.Data;
    if (dl) { S.lineSecs += m.dialogue.BaseHeader.Duration;
      (dl.Responses || []).forEach((resp, i) => { const sp = dl.Speakers[i], ln = cell(S.lines, sp + '|' + resp, () => ({ speaker: sp, response: resp, events: {}, vars: new Set(), n: 0 }));
        ln.n++; ln.vars.add(dl.Variations?.[i]); ln.events[dl.EventNames[i]] = (ln.events[dl.EventNames[i]] || 0) + 1;   /* a line can have more than one trigger: count each */ cell(S.triggers, dl.EventNames[i], () => ({ n: 0 })).n++; S.lineCount++; }); }

    const seen = new Set();          // perks and sides already counted for this match, so a match counts once however many players brought the perk
    for (const role of ROLES) {
      const p = m.players[role], ph = p?.ServerPlayerRoundHeader, id = m.hdr.CharacterId[role], w = won(m, role) ? 1 : 0, who = pid(m, role);
      if (who) {
        const rec = m.clients[role], cd = rec.Data;
        const pl = cell(S.players, who, () => ({ id: who, n: 0, w: 0, d: 0, h: nw(), m: nw(), chars: {}, matches: [], level: null, rating: null, secs: 0, chat: 0, late: 0, leaves: 0, sessions: new Set(),
          rk: { h: { n: 0, w: 0, d: 0, rating: null }, m: { n: 0, w: 0, d: 0, rating: null } } }));
        pl.n++; pl.w += w; pl.d += decided; const side = role === 'Monster' ? pl.m : pl.h; side.n++; side.w += w; side.d += decided;
        const pc = cell(pl.chars, id, () => ({ id, n: 0, w: 0, d: 0, dmg: 0, taken: 0, level: null, skins: {} }));
        pc.n++; pc.w += w; pc.d += decided; pc.dmg += ph?.DamageToEnemyTeam || 0; pc.taken += ph?.DamageFromEnemyTeam || 0; pc.level ??= cd.CharacterLevel;
        pc.skins[cd.CharacterSkin] = (pc.skins[cd.CharacterSkin] || 0) + 1;
        pl.matches.push({ m, role }); pl.secs += rec.BaseHeader.Duration || 0; pl.chat += cd.ChatMessagesSent || 0; pl.late += cd.LateJoiner ? 1 : 0;
        pl.leaves += d.LeaverCounts?.[role] || 0; if (sessionOf(rec)) pl.sessions.add(sessionOf(rec)); S.late += cd.LateJoiner ? 1 : 0;
        pl.level ??= cd.PlayerLevel;                                         // matches are newest first, so the first seen is the latest
        if (isRanked(m)) { const lad = pl.rk[role === 'Monster' ? 'm' : 'h']; lad.n++; lad.w += w; lad.d += decided; if (cd.GlickoScore > 0) { lad.rating ??= cd.GlickoScore; pl.rating ??= cd.GlickoScore; } }
      }
      if (!ph || ph.IsBot) { S.bots[role] = (S.bots[role] || 0) + 1; continue; }   // bots would skew every character number; counted so the pages can say how many were left out
      const cs = cell(S.chars, id, newChar(id, role));
      cs.n++; cs.w += w; cs.d += decided; cs.dmg += ph.DamageToEnemyTeam || 0; cs.taken += ph.DamageFromEnemyTeam || 0; cs.wlTo += ph.DamageToWildlife || 0; cs.wlFrom += ph.DamageFromWildlife || 0;
      if (ph.CharacterLevel > 0) { cs.lvl += ph.CharacterLevel; cs.lvlN++; }
      const skin = m.clients[role]?.Data.CharacterSkin; if (skin) cs.skins[skin] = (cs.skins[skin] || 0) + 1;
      if (role === 'Monster') {
        cs.feed += mon.Feeding || 0; cs.firstStage[mon.FirstEncounterStage] = (cs.firstStage[mon.FirstEncounterStage] || 0) + 1;
        cs.finalStage[m.hdr.MonsterFinalStage] = (cs.finalStage[m.hdr.MonsterFinalStage] || 0) + 1;
        // skill points: levels[stage - 1][ability - 1] for each stage the Monster reached
        const levels = [1, 2, 3].filter(s => s <= m.hdr.MonsterFinalStage).map(s => [1, 2, 3, 4].map(j => p.Data['Ability' + j]?.['Stage' + s]?.Level ?? 0));
        const b = cell(cs.builds, levels.map(l => l.join('·')).join('  →  '), () => ({ n: 0, w: 0, d: 0, levels })); b.n++; b.w += w; b.d += decided;
        // pts[stage][ability]: skill points put into the ability AT that stage (points held now minus points held the stage before)
        levels.forEach((l, s) => { cs.lvN[s]++; l.forEach((v, j) => { cs.pts[s][j] += v - (s ? levels[s - 1][j] : 0); }); });
      } else {
        cs.healRecv += H.Healing?.Received?.[role] || 0; cs.shield += H.Shielding?.[role] || 0; cs.deaths += H.Deaths?.[role] || 0;
        (H.Incaps?.Class || []).forEach((c, i) => { if (c === role) { cs.downs++; cs.downT[Math.min(19, Math.floor(H.Incaps.Timestamp[i] / 60))]++; } });
        cs.ships += (H.Dropships?.[role] || []).filter(Boolean).length;
      }
      for (let s = 1; s <= 3; s++) { const g = ph['Stage' + s]; if (!g) continue; const st = cs.st[s];
        st.n++; st.to += g.DamageToEnemyTeam || 0; st.from += g.DamageFromEnemyTeam || 0; st.wlTo += g.DamageToWildlife || 0; st.wlFrom += g.DamageFromWildlife || 0; }
      const raw = Object.values(ph.Perks || {}), keys = raw.map(k => k && perkBase(k)), side = role === 'Monster' ? 'monster' : 'hunter';
      if (!seen.has('#' + side)) { seen.add('#' + side); S.side[side]++; }       // matches where a person played on this side
      keys.forEach((k, i) => { if (!k) return;
        const lv = perkLevel(raw[i]);       // lv / lvN: sum of the levels it was brought at, and how many times a level was recorded
        const a = cell(S.perks, k.toLowerCase(), () => ({ key: k, n: 0, w: 0, d: 0, m: 0, mw: 0, md: 0, lv: 0, lvN: 0, team: role === 'Monster' ? 'monster' : 'hunter', slots: [0, 0, 0], chars: {} })); a.n++; a.w += w; a.d += decided; a.slots[i]++;
        a.lv += lv; a.lvN += lv ? 1 : 0;
        if (!seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); a.m++; a.mw += w; a.md += decided; }      // m / mw: matches the perk appeared in, and how many of those its side won
        a.chars[id] = (a.chars[id] || 0) + 1;
        const b = cell(cs.perks, k.toLowerCase(), () => ({ key: k, n: 0, w: 0, d: 0, lv: 0, lvN: 0 })); b.n++; b.w += w; b.d += decided; b.lv += lv; b.lvN += lv ? 1 : 0; });
      if (keys.filter(Boolean).length === 3) { const ck = keys.map(k => k.toLowerCase()).sort().join('+');
        for (const o of [S.combos, cs.combos]) {
          if (o === S.combos && seen.has('c|' + ck)) continue;       // site-wide, a combination counts once per match
          const cb = cell(o, ck, () => ({ keys: [...keys].sort(), team: role === 'Monster' ? 'monster' : 'hunter', n: 0, w: 0, d: 0 })); cb.n++; cb.w += w; cb.d += decided; }
        seen.add('c|' + ck); }
      for (const o of role === 'Monster' ? HUNTERS : ['Monster']) { const v = cell(cs.vs, m.hdr.CharacterId[o], nw); v.n++; v.w += w; v.d += decided; }
      if (who) { const v = cell(cs.players, who, nw); v.n++; v.w += w; v.d += decided; }
      const src = (kind, name, s, v) => { if (!v) return; const x = cell(cs.src, kind + '|' + name, () => ({ kind, name, s: [0, 0, 0, 0] })); x.s[s] += v; x.s[0] += v; };
      for (const [label, s] of Object.entries(p.Data)) {
        if (!s || typeof s !== 'object') continue;
        if (label === 'AppliedHeals') { cs.heal += s.TotalHeals || 0;
          for (let i = 1; i <= 3; i++) for (const h of s['Stage' + i] || []) { src('Healing', h.Name, i, h.HealAmount); cs.st[i].heal += h.HealAmount; } continue; }
        if (!s.TotalDamageDealt && s.TotalDamageDealt !== 0) continue;
        const flat = typeof s.TotalDamageDealt === 'number';                // "other" damage is one number, not a Hunters / wildlife pair
        // one entry per slot AND item name: the same slot can hold different items in different matches (a patch can swap a weapon)
        const it = cell(cs.items, label + '|' + (s.Name ?? label), () => ({ label, key: s.Name ?? label, n: 0, uses: 0, hits: 0, hitsWl: 0, miss: 0, dmg: 0, dmgWl: 0 })), a = s.Aggregate;
        it.n++; it.dmg += flat ? s.TotalDamageDealt : s.TotalDamageDealt.OpposingTeam || 0; it.dmgWl += flat ? 0 : s.TotalDamageDealt.Wildlife || 0;
        if (a) { it.uses += a.Uses || 0; it.hits += a.Hits?.OpposingTeam || 0; it.hitsWl += a.Hits?.Wildlife || 0; it.miss += a.Misses > 2e9 ? 0 : a.Misses || 0; }   // the game's Hunter miss count can wrap around
        for (let i = 1; i <= 3; i++) { const g = s['Stage' + i]; if (!g) continue;
          if (Array.isArray(g)) { for (const e of g) src('Damage', e.Name, i, e.DamageDealt); continue; }
          for (const e of g.OpposingTeamEffects || []) src('Damage', e.Name, i, e.DamageDealt);
          for (const e of g.WildlifeEffects || []) src('Wildlife damage', e.Name, i, e.DamageDealt);
          if (g.OpposingTeam != null) { src('Damage', label, i, g.OpposingTeam); src('Wildlife damage', label, i, g.Wildlife); }
          if (g.Uses != null) { cs.st[i].uses += g.Uses; cs.st[i].hits += g.Hits?.OpposingTeam || 0; } }
      }
    }
  }
  // self-check: shouts in the console if the join above stops adding up
  console.assert(Object.values(S.maps).reduce((a, m) => a + m.n, 0) === matches.length, 'map totals do not add up to the matches');
  console.assert(Object.values(S.players).every(p => p.h.n + p.m.n === p.n && p.w <= p.n), 'player totals are inconsistent');
  return S;
}
const slicePasses = k => { const [v, mode, type, solo] = k.split('|'); return (!ST.fl.v || v === ST.fl.v) && (!ST.fl.mode || mode === ST.fl.mode) && (!ST.fl.type || type === ST.fl.type) && (ST.fl.solo || solo !== '1'); };
// The totals the pages show: counted from the loaded records, or, with stored totals, the stored groups the filters select added up.
function totals(filtered) {
  const recent = compute(filtered ? MATCHES.filter(passes) : MATCHES);
  if (!SUM) return recent;
  const parts = sliceKeys.filter(k => !filtered || slicePasses(k)).map(k => SUM.slices[k]);
  const T = parts.length ? SUMMARY.merge(parts) : SUMMARY.plain(compute([]));
  T.matches = recent.matches;                 // the match objects themselves exist only for what this page loaded
  for (const [id, p] of Object.entries(T.players)) { p.sessions = new Set(p.sessions); p.matches = recent.players[id]?.matches || []; }
  for (const l of Object.values(T.lines)) l.vars = new Set(l.vars);
  return T;
}
// (window.TELEMETRY_JOB: tools/summarize.js runs this file to count, and calls compute() and account() itself)
const ALL = window.TELEMETRY_JOB ? null : totals(false);     // players, ranked and the unfiltered pages
let S = window.TELEMETRY_JOB ? null : totals(true);          // the stats pages, following the filter bar

/* ---------- account totals ----------
   Everything the Matchmaking, Progression, Store, Community, Fair play and About pages show that does not come from a finished
   match: queue attempts, XP, rewards, challenges, purchases, sign-ins, kicks, and what each player's game says about their account.
   Like compute(), it only counts and sums, so tools/summarize.js works it out a day at a time and adds the days up (summary.js).
   starts: the start records of matches that never sent an end record. */
function account(events, starts) {
  const A = { records: {}, hdr: {}, vers: {}, mm: {}, xp: { n: 0, gain: 0, ups: 0 }, rewards: {}, chall: {}, challN: 0, store: { n: 0, ok: 0, paid: 0, items: {}, by: {} },
    logins: 0, late: 0, kicks: {}, daily: {}, sessions: new Set(), players: {}, unfin: { n: 0, by: {} } };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; }, at = {};
  const newest = (id, field, t) => t >= (at[id + field] || 0) && (at[id + field] = t, true);      // is this the player's newest record carrying that field?
  for (const e of events) {
    const t = T(e), b = e.BaseHeader || {}, d = e.Data || {}, ch = e.ClientHeader, kind = e.EventName;
    const rc = cell(A.records, kind, () => ({ n: 0, t: 0, versions: {} })); rc.n++; rc.t = Math.max(rc.t, t); bump(rc.versions, String(d.Version));
    for (const [k, v] of [['Config', b.Config], ['Platform', b.Platform], ['Changelist', b.Changelist], ['BuildNumber', b.BuildNumber], ['Micropatch', b.Micropatch], ['Context', b.Context],
      ['PublicAppID', b.PublicAppID], ['base', b.Version], ['player', ch?.Version], ['match', e.ServerRoundHeader?.Version], ['perPlayer', e.ServerPlayerRoundHeader?.Version]])
      if (v !== undefined) bump(cell(A.hdr, k, () => ({})), String(v));
    const vs = cell(A.vers, `${ver(e)} · build ${build(e)} · ${b.Platform}`, () => ({ n: 0, t: 0 })); vs.n++; vs.t = Math.max(vs.t, t);
    if (kind === 'ServerEACClientKickRecord') { const k = cell(A.kicks, d.code + '|' + d.message, () => ({ n: 0, t: 0 })); k.n++; k.t = Math.max(k.t, t); }
    if (!ch) continue;
    const id = ch.My2kID, p = cell(A.players, id, () => ({ t: 0, since: t, region: '', cregion: '', lang: '', audio: '', founder: null, bal: null, fresh: 0, q: { n: 0, ok: 0, dur: 0, dodges: 0 } }));
    // the day the server filed the record under when the job says so (a player's own clock can be wrong), else the record's own date
    const day = cell(A.daily, window.TELEMETRY_DAY || (isNaN(t) ? 'unknown' : new Date(t).toISOString().slice(0, 10)), () => ({ signins: 0, ids: new Set() }));
    day.ids.add(id); if (sessionOf(e)) A.sessions.add(sessionOf(e));
    p.since = Math.min(p.since, t); p.fresh += ch.FirstTimeUser ? 1 : 0;
    if (t >= p.t) { p.t = t; p.region = ch.OnlineRegion; p.cregion = ch.ClassificationRegion; p.lang = ch.Language; p.audio = ch.LanguageAudio; }
    for (const r of d.Rewards || []) { const x = cell(A.rewards, [d.Source || (kind === 'ClientXPRecord' ? 'Level up' : 'Challenge'), r.Type, r.Name].join('|'), () => ({ n: 0, total: 0 })); x.n++; x.total += r.Amount || 0; }
    if (['ClientXPRecord', 'ClientRewardRecord', 'ClientChallengeUpdateRecord'].includes(kind) && d.CurrencyBalance != null && newest(id, 'bal', t)) p.bal = d.CurrencyBalance;
    if (['ClientLoginRecord', 'ClientPurchaseRecord'].includes(kind) && d.Founder != null && newest(id, 'founder', t)) p.founder = d.Founder;
    if (kind === 'ClientLoginRecord') { A.logins++; day.signins++; }
    else if (kind === 'ClientRoundRecord') A.late += d.LateJoiner ? 1 : 0;
    else if (kind === 'ClientXPRecord') { if (d.Category === 'Global') { A.xp.n++; A.xp.gain += d.XPNew - d.XPOld; } A.xp.ups += d.LevelNew > d.LevelOld ? 1 : 0; }
    else if (kind === 'ClientChallengeUpdateRecord') { A.challN++;
      const c = cell(A.chall, d.Name, () => ({ cat: d.Category, taken: 0, done: 0, declined: 0, upd: 0, pay: 0 }));
      if (d.Event === 'ChallengeNew') c.taken++; else if (d.Event === 'ChallengeDecline') c.declined++;
      else { c.upd++; if (d.ProgressNew >= d.ProgressMax) { c.done++; c.pay += sumv((d.Rewards || []).map(r => r.Amount)); } } }
    else if (kind === 'ClientPurchaseRecord') { const s = A.store, ok = d.Result === 'Success' ? 1 : 0, paid = ok ? d.SalePrice || 0 : 0; s.n++; s.ok += ok; s.paid += paid;
      const it = cell(s.items, d.OfferID, () => ({ name: d.Name, kind: d.OfferType, n: 0, ok: 0, paid: 0, list: 0 })); it.n++; it.ok += ok; it.paid += paid; it.list += d.ListPrice || 0;
      for (const [dim, v] of [['ctx', d.Context], ['pay', d.Method], ['kind', d.OfferType], ['fd', d.Founder === 'Yes' ? 'Founder' : d.Founder === 'No' ? 'Not a Founder' : 'Unknown'], ['res', d.Result]]) {
        const x = cell(cell(s.by, dim, () => ({})), v ?? '', () => ({ n: 0, ok: 0 })); x.n++; x.ok += ok; } }
    else if (kind === 'ClientMatchmakingRecord') {       // one queue attempt; it reached a match when it carries a game session id
      const ok = +d.GameSessionId ? 1 : 0, dur = b.Duration || 0, h = new Date(t).getUTCHours();
      const q = cell(A.mm, [ver(e), d.GameMode, d.MatchType === 'Ranked' ? 'R' : 'N'].join('|'), () => ({ n: 0, ok: 0, dur: 0, dodges: 0, team: {}, type: {}, hourN: Array(24).fill(0), hourDur: Array(24).fill(0), stages: {}, reasons: {} }));
      q.n++; q.dodges += d.QueueDodger ? 1 : 0; p.q.n++; p.q.dodges += d.QueueDodger ? 1 : 0;
      if (ok) { q.ok++; q.dur += dur; q.hourN[h]++; q.hourDur[h] += dur; p.q.ok++; p.q.dur += dur;
        for (const [o, k] of [[q.team, d.PlayerTeam], [q.type, d.MatchType]]) { const x = cell(o, k, () => ({ n: 0, dur: 0 })); x.n++; x.dur += dur; } }
      for (const ev of d.Events || []) {
        if (ev.Type === 'LeftQueue') { const r = cell(q.reasons, ev.Data, () => ({ n: 0, at: 0 })); r.n++; r.at += ev.TimeStamp || 0; continue; }
        const s = cell(q.stages, ev.Type === 'LobbyState' ? ev.Data : ev.Type, () => ({ n: 0, at: 0, pl: 0, lobby: ev.Type === 'LobbyState' })); s.n++; s.at += ev.TimeStamp || 0; s.pl += ev.Val || 0; } }
  }
  for (const e of starts) { A.unfin.n++; bump(A.unfin.by, e.ServerRoundHeader.GameMode + '|' + e.ServerRoundHeader.MatchType); }
  return A;
}
// Each player's own progression history for their page: account XP gains, rewards, and where each challenge stands. tools/summarize.js
// files it per player and day beside their matches (archive/site/p), so one player's history is loaded only when they are opened.
function ledger(events) {
  const L = {};
  for (const e of events) {
    const id = e.ClientHeader?.My2kID, d = e.Data || {}, t = T(e), kind = e.EventName;
    if (!id) continue;
    const p = cell(L, id, () => ({ xp: [], rewards: [], chall: {} }));
    if (kind === 'ClientXPRecord' && d.Category === 'Global') p.xp.push({ t, gain: d.XPNew - d.XPOld, up: d.LevelNew > d.LevelOld ? 1 : 0 });
    for (const r of d.Rewards || []) p.rewards.push({ t, why: d.Source || (kind === 'ClientXPRecord' ? 'Level up' : 'Challenge'), name: r.Name, amount: r.Amount });
    if (kind === 'ClientChallengeUpdateRecord' && t >= (p.chall[d.Name]?.t || 0)) p.chall[d.Name] = { t, cat: d.Category, ev: d.Event, pn: d.ProgressNew, pm: d.ProgressMax };
  }
  return L;
}
// On the page: the stored account totals, or, without them, the loaded records counted here.
const ACC = SUM?.account || (window.SUMMARY ? SUMMARY.plain(account(EVENTS, UNFINISHED.map(r => r.start))) : null);
const acct = id => ACC.players[id];
// Pick rate means the same thing everywhere on the site (owner's rule): the share of matches the thing appeared in,
// 100% = it was in every match. Only people count: a slot filled by a bot is left out of both halves of the sum, so a
// class's characters always add up to 100%. `group` is a class for characters, or 'hunter' / 'monster' for perks.
const people = group => group === 'hunter' || group === 'monster' ? S.side[group] : S.total - (S.bots[group] || 0);
const pickRate = (n, group) => pct(n, people(group));

/* ---------- sortable table ---------- */
const sortState = {};
// href(row) makes the whole row open that address when clicked or tapped
function table(id, cols, rows, def = 0, limit = 0, asc = false, href = null) {
  const st = sortState[id] || (sortState[id] = { i: def, dir: asc ? 1 : -1 }), col = cols[st.i] || cols[0];
  let sorted = [...rows].sort((a, b) => {
    const x = col.v(a), y = col.v(b);
    if (x == null || y == null) return (x == null) - (y == null);
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir;
  });
  if (limit) sorted = sorted.slice(0, limit);
  return `<div class="tw"><table><thead><tr>${cols.map((c, i) => `<th class="${c.n ? 'n' : ''}${i === st.i ? ' on' : ''}" aria-sort="${i === st.i ? (st.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button data-sort="${esc(id)}" data-i="${i}">${c.h}${i === st.i ? (st.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr></thead>
  <tbody>${sorted.map(r => `<tr${href ? ` data-href="${esc(href(r))}"` : ''}>${cols.map(c => `<td class="${c.n ? 'n' : ''}">${c.r ? c.r(r) : esc(c.v(r) ?? '–')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="dim">Nothing recorded yet.</td></tr>`}</tbody></table></div>`;
}
const N = (h, v, r) => ({ h, v, r: r || (x => num(v(x))), n: 1 });
const P = (h, v) => N(h, v, x => fpct(v(x)));
const Tx = (h, v, r) => ({ h, v, r });
// what usually sets a voice line off: its most common trigger (ties go to the first in A to Z order), with a count of the others
const trigger = l => { const e = Object.entries(l.events || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); return e.length ? e[0][0] + (e.length > 1 ? ` (+${e.length - 1} more)` : '') : '–'; };
const LV = N('Avg level', p => avg(p.lv, p.lvN), p => dec(avg(p.lv, p.lvN)));      // a perk row's average recorded level, 1 to 3
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
  const info = mapInfo(mapKey), b = C.maps[mapKey.split('|')[0].toLowerCase()]?.bounds || [0, 0, 1, 1];
  if (view === 'move' || view === 'fps') return `<div class="heat">${img(info.minimap, '', info.name)}<div class="none">No data. The game builds this record but never switches it on (${num(ACC.records.ClientProfilingRecord?.n || 0)} received).</div></div>`;
  const pts = domes.filter(d => view === 'caught' ? d.caught : view === 'dmg' ? d.dmg : view === 'downs' ? d.downs : view[0] === 's' ? d.stage === +view[1] : true)
    .map(d => ({ ...d, wt: view === 'dmg' ? d.dmg : view === 'downs' ? d.downs : 1 }));
  const mx = Math.max(1, ...pts.map(p => p.wt));
  return `<div class="heat">${img(info.minimap, '', info.name)}<svg viewBox="0 0 100 100" role="img" aria-label="Dome positions on ${esc(info.name)}">${pts.map((p, i) => {
    const x = ((p.x - b[0]) / (b[2] - b[0]) * 100).toFixed(1), y = (100 - (p.y - b[1]) / (b[3] - b[1]) * 100).toFixed(1);       // the minimap is north up: world y grows upward
    return numbered ? `<circle cx="${x}" cy="${y}" r="3.2" fill="${p.caught ? '#c0392b' : '#777'}" stroke="#fff" stroke-width=".4"/><text x="${x}" y="${(+y + 1.2).toFixed(1)}" font-size="3.4" text-anchor="middle" fill="#fff">${i + 1}</text>`
      : `<circle cx="${x}" cy="${y}" r="${(1.4 + 2.4 * p.wt / mx).toFixed(1)}" fill="#ff3b1f" opacity=".3"/>`; }).join('')}</svg></div>`;
}

/* ---------- pages ---------- */
const SECTIONS = [['characters', 'Characters', 'Who gets picked and who wins'], ['matchups', 'Matchups', 'Who wins versus who'], ['perks', 'Perks', 'Which perks are picked the most, and which are not'],
  ['maps', 'Maps', 'Which side wins on each map, and where the fights happen'], ['ranked', 'Ranked', 'The ranked leaderboard'], ['players', 'Players', 'Look up any player'],
  ['matches', 'Matches', 'Every match played, day by day'], ['matchmaking', 'Matchmaking', 'How long queues take and how even matches are'], ['progression', 'Progression', 'XP, levels, keys and challenges'], ['store', 'Store', 'What gets bought'],
  ['dialogue', 'Dialogue', 'Which voice lines play the most'], ['community', 'Community', 'Who is playing, where and when'], ['fairplay', 'Fair play', 'Leavers, dodgers and kicks'],
  ['about', 'About the data', 'Where the numbers come from']];
document.getElementById('nav').innerHTML = `<a href="#/" data-r="">Overview</a>` + SECTIONS.map(s => `<a href="#/${s[0]}" data-r="${s[0]}">${s[1]}</a>`).join('');

function overview() {
  return `<div class="hero"><h1>Modded Evolve Telemetry</h1>
    <p class="sub">Statistics for Evolve Stage 2, built from the records the game writes about every match, queue and sign-in. Pick a section.</p></div>
  <div class="tiles">${SECTIONS.map(s => `<a class="tile" href="#/${s[0]}"><div class="v" style="font-size:1.25rem">${s[1]}</div><div class="n" style="font-size:.95rem">${s[2]}</div></a>`).join('')}</div>`;
}

function characters() {
  const rows = Object.values(S.chars).filter(c => ST.chars.cls === 'All' || c.role === ST.chars.cls);
  return `<h1>Characters</h1><p class="sub">How often each character is picked, and how often that side wins. Pick rate is the share of matches the character was played in: 100% would mean every match. Only matches played by people are counted.</p>${filterBar()}
  ${tabs('chars.cls', ['All', ...ROLES.map(r => [r, img(C.classIcons[r], 'cls') + r])], ST.chars.cls)}
  ${hint('Tap a character to open its full page: weapons and abilities, stages, perks, skins, opponents and more.')}
  <div class="bigchips">${table('chars', [Tx('Character', c => charInfo(c.id).name, c => chip(c.id, true)), Tx('Class', c => c.role, c => classCell(c.role)),
    N('Matches', c => c.n), P('Pick rate', c => pickRate(c.n, c.role)), N('Win rate', c => pct(c.w, c.d), c => `<span class="c-${c.role}">${bar(pct(c.w, c.d))}</span>`),
    N('Damage dealt', c => avg(c.dmg, c.n)), N('Damage taken', c => avg(c.taken, c.n)), N('Healing done', c => avg(c.heal, c.n) || null),
    N('Avg level', c => avg(c.lvl, c.lvlN), c => dec(avg(c.lvl, c.lvlN)))], rows, 2, 0, false, c => charHref(c.id))}</div>
  <p class="note">${(ST.chars.cls === 'All' ? ROLES : [ST.chars.cls]).map(r => `${r}: a person played it in ${num(people(r))} of the ${num(S.total)} matches${S.bots[r] ? ` (a bot in the other ${num(S.bots[r])})` : ''}`).join(' · ')}.
    Each class's pick rates are out of its own number and add up to 100%.</p>
  <p class="note">Damage and healing are averages per match, against the other team only.</p>`;
}

function character(id) {
  const c = S.chars[id], info = charInfo(id);
  if (!c) return `<h1>${esc(info.name)}</h1>${filterBar()}<p class="sub">No matches recorded for this character with these filters.</p>`;
  const mon = c.role === 'Monster', items = Object.values(c.items).map(it => ({ ...it, info: itemInfo(it.key) })), total = items.reduce((a, it) => a + it.dmg, 0);
  const lines = Object.values(S.lines).filter(l => l.speaker === id);
  // the four ability slots, for the skill-point tables: the item most often seen in each slot
  const inSlot = j => Object.values(c.items).filter(it => it.label === 'Ability' + j).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))[0];
  const abil = [1, 2, 3, 4].map(j => inSlot(j) ? itemInfo(inSlot(j).key) : { name: 'Ability ' + j, icon: '' });
  // a ranked list of the four abilities, most points first: points invested in each and its share of all points in the list
  const ranked = (title, matches, points) => { const total = points.reduce((a, b) => a + b, 0);
    return `<div class="build"><div class="bh"><b>${title}</b><span>${plural(total, 'point', 'points')} in ${plural(matches, 'match', 'matches')}</span></div>${abil.map((a, j) => ({ a, v: points[j] })).sort((x, y) => y.v - x.v).map((x, i) =>
      `<div class="rk-row"><span class="rk-n">${i + 1}</span>${icon(x.a.icon)}<span class="rk-name">${esc(x.a.name)}<small>${plural(x.v, 'point', 'points')}</small></span><span class="c-Monster rk-v">${bar(pct(x.v, total))}</span></div>`).join('')}</div>`; };
  return `<div class="headline c-${c.role}">${img(info.thumb, 'big', info.name)}<div>${classTag(c.role)}<h1 style="margin-top:.4rem">${esc(info.name)}</h1></div></div>${filterBar()}
  ${tiles(tile('Matches', num(c.n)), tile('Pick rate', fpct(pickRate(c.n, c.role)), `of ${c.role} matches`), tile('Win rate', fpct(pct(c.w, c.d))),
    tile('Average level', dec(avg(c.lvl, c.lvlN))), tile('Damage dealt', num(avg(c.dmg, c.n)), 'per match'), tile('Damage taken', num(avg(c.taken, c.n)), 'per match'),
    tile('To wildlife', num(avg(c.wlTo, c.n)), 'damage per match'), tile('From wildlife', num(avg(c.wlFrom, c.n)), 'damage per match'),
    mon ? tile('Feeding', dec(avg(c.feed, c.n)), 'per match') : tile('Deaths', dec(avg(c.deaths, c.n)), `${dec(avg(c.downs, c.n))} downs per match`))}
  <h2>${mon ? 'Abilities and attacks' : 'Weapons and equipment'}</h2>
  ${table('items-' + id, [Tx('Item', it => it.info.name || it.label, it => `${icon(it.info.icon)}${esc(it.info.name || it.label)}`),
    N('Uses', it => avg(it.uses, it.n) || null, it => it.uses ? dec(it.uses / it.n) : '–'), N('Misses', it => avg(it.miss, it.n) || null, it => it.uses ? dec(it.miss / it.n) : '–'),
    N('Hits', it => avg(it.hits, it.n) || null, it => it.uses ? dec(it.hits / it.n) : '–'), N('Wildlife hits', it => avg(it.hitsWl, it.n) || null, it => it.uses ? dec(it.hitsWl / it.n) : '–'),
    mon ? P('Hit rate', it => pct(it.hits, it.uses)) : N('Damage per use', it => avg(it.dmg, it.uses)),
    N('Damage', it => avg(it.dmg, it.n)), N('To wildlife', it => avg(it.dmgWl, it.n)), N('Share', it => pct(it.dmg, total), it => bar(pct(it.dmg, total)))], items, 6)}
  <p class="note">${mon ? 'A use counts as a hit when it damages a Hunter before the ability is used again.' : 'The game counts every damage tick as a hit, so hits can exceed uses and its miss count is unreliable for Hunters.'} Averages per match.</p>
  <h2>By Monster stage</h2>
  ${table('stage-' + id, [Tx('Stage', s => s.i, s => 'Stage ' + s.i), N('Matches reaching it', s => s.n), N('Damage dealt', s => avg(s.to, s.n)), N('Damage taken', s => avg(s.from, s.n)),
    N('To wildlife', s => avg(s.wlTo, s.n)), N('From wildlife', s => avg(s.wlFrom, s.n)), mon ? P('Hit rate', s => pct(s.hits, s.uses)) : N('Healing done', s => avg(s.heal, s.n) || null)],
    c.st.map((s, i) => ({ ...s, i })).filter(s => s.i && s.n), 0, 0, true)}
  <h2>Damage and healing sources</h2>
  ${table('src-' + id, [Tx('Source', s => itemInfo(s.name).name), Tx('Kind', s => s.kind), N('Per match', s => s.s[0] / c.n), N('Stage 1', s => s.s[1] / c.n), N('Stage 2', s => s.s[2] / c.n), N('Stage 3', s => s.s[3] / c.n)], Object.values(c.src), 2)}
  ${mon ? `<h2>Skill points</h2>
    <h3>Most popular abilities</h3>
    <div class="ranks">${ranked('Overall', c.lvN[0], [0, 1, 2, 3].map(j => c.pts.reduce((a, s) => a + s[j], 0)))}
      ${[0, 1, 2].filter(s => c.lvN[s]).map(s => ranked('Stage ' + (s + 1), c.lvN[s], c.pts[s])).join('')}</div>
    <p class="note">How many skill points players invested in each ability, and what share of all the points invested that is. Each list adds up to 100%. A stage's list counts only the points spent at that stage; Overall counts every point spent in the match.</p>
    <h3 style="margin-top:1.4rem">Most used builds</h3>
    <div class="builds">${Object.values(c.builds).sort((a, b) => b.n - a.n).slice(0, 6).map((b, i) => `<div class="build"><div class="bh"><b>Build ${i + 1}</b><span>${b.n} ${b.n === 1 ? 'match' : 'matches'} · ${fpct(pct(b.w, b.d))} won</span></div>
      <table class="skill"><thead><tr><th></th>${b.levels.map((_, s) => `<th>Stage ${s + 1}</th>`).join('')}</tr></thead><tbody>
      ${abil.map((a, j) => `<tr><td>${icon(a.icon)}${esc(a.name)}</td>${b.levels.map(l => `<td>${pips(l[j])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>
    <p class="note">A build is the exact points a player had in every ability at each stage. Filled dots are points spent.</p>
    <div class="cols"><section><h2>Stages</h2><div class="panel">${[1, 2, 3].map(s => kv(`First fight at Stage ${s}`, plural(c.firstStage[s] || 0, 'match', 'matches'))).join('')}${[1, 2, 3].map(s => kv(`Finished at Stage ${s}`, plural(c.finalStage[s] || 0, 'match', 'matches'))).join('')}</div></section></div>`
  : `<div class="cols"><section><h2>Healing and shielding</h2><div class="panel">${kv('Healing done', num(avg(c.heal, c.n)) + ' per match')}${kv('Healing received', num(avg(c.healRecv, c.n)) + ' per match')}
      ${kv('Shielding received', num(avg(c.shield, c.n)) + ' per match')}${kv('Dropship returns', dec(avg(c.ships, c.n)) + ' per match')}</div></section>
    <section><h2>When ${esc(info.name)} goes down</h2><div class="panel c-${c.role}">${chart(c.downT, c.downT.map((_, i) => i + (i === 19 ? '+' : '')))}<p class="note">Downs by minute of the match.</p></div></section></div>`}
  <div class="cols">
    <section><h2>${mon ? 'Against each Hunter' : 'Against each Monster'}</h2>${table('vs-' + id, [Tx('Opponent', v => charInfo(v.id).name, v => chip(v.id)), N('Matches', v => v.n),
      N('Win rate', v => pct(v.w, v.d), v => `<span class="c-${c.role}">${bar(pct(v.w, v.d))}</span>`)], Object.entries(c.vs).map(([k, v]) => ({ id: k, ...v })), 1, 0, false, v => charHref(v.id))}</section>
    <section><h2>Perks picked</h2>${table('cp-' + id, [Tx('Perk', p => perkInfo(p.key).name, p => `${img(perkInfo(p.key).icon, 'perk')} ${esc(perkInfo(p.key).name)}`),
      P('Pick rate', p => pct(p.n, c.n)), P('Win rate', p => pct(p.w, p.d)), LV], Object.values(c.perks), 1, 12)}</section>
  </div>
  <div class="cols">
    <section><h2>Perk combinations</h2>${table('cc-' + id, [Tx('Perks', x => x.keys.join(), x => perkIcons(x.keys) + ' <span class="dim">' + x.keys.map(k => esc(perkInfo(k).name)).join(', ') + '</span>'), N('Matches', x => x.n), P('Win rate', x => pct(x.w, x.d))], Object.values(c.combos), 1, 8)}</section>
    <section><h2>Skins used</h2>${table('skin-' + id, [Tx('Skin', s => s.k), N('Matches', s => s.n), N('Share', s => pct(s.n, sumv(c.skins)), s => bar(pct(s.n, sumv(c.skins))))], Object.entries(c.skins).map(([k, n]) => ({ k, n })), 1)}</section>
  </div>
  ${lines.length ? `<h2>Most-heard voice lines</h2>${table('cl-' + id, [Tx('Line', l => l.response), Tx('Triggered by', trigger), N('Times played', l => l.n), Tx('', l => '', l => play(lineUrl(l.speaker, l.response)))], lines, 2, 10)}` : ''}
  <h2>Most matches on ${esc(info.name)}</h2>${table('cpl-' + id, [Tx('Player', p => pname(p.id), p => plink(p.id)), N('Matches', p => p.n), P('Win rate', p => pct(p.w, p.d)),
    N('Level', p => ALL.players[p.id]?.chars[id]?.level)], Object.entries(c.players).map(([k, v]) => ({ id: k, ...v })), 1, 10, false, p => playerHref(p.id))}`;
}

function matchups() {
  // every character, in tier order (the catalog lists them tier 1 first, variants after their base); nothing here links away
  const inTier = role => Object.keys(C.characters).filter(id => C.characters[id].class === role), mons = inTier('Monster');
  const label = id => `<span class="chip">${img(charInfo(id).thumb, '')}<span>${esc(charInfo(id).name)}</span></span>`;
  // Hunter-favoured cells use the Stage 2 website's Hunter blue (#2f6f9f); Monster-favoured cells the Monster red
  const shade = v => v >= 50 ? `rgba(47,111,159,${Math.min(.95, .2 + (v - 50) / 38)})` : `rgba(139,26,26,${Math.min(.95, .15 + (50 - v) / 40)})`;
  return `<h1>Matchups</h1>${hint('Who wins versus who: how often the Hunters win when this Hunter faces this Monster. Blue favours the Hunter, red favours the Monster. Under each percentage is the number of matches it comes from. Pairs with fewer than 3 matches are left blank. Hunters and Monsters are listed in tier order.')}${filterBar()}
  <div class="tw" style="border:0"><table class="grid"><thead><tr><th></th>${mons.map(m => `<th>${face(m)}${esc(charInfo(m).name)}</th>`).join('')}</tr></thead><tbody>
  ${HUNTERS.map(role => `<tr class="sep"><td colspan="${mons.length + 1}">${role}</td></tr>` + inTier(role).map(h =>
    `<tr><td>${label(h)}</td>${mons.map(m => { const v = S.chars[h]?.vs[m]; return v && v.n >= 3
      ? `<td class="cell" style="background:${shade(pct(v.w, v.d) ?? 50)}" title="${v.w} Hunter wins in ${v.n} matches">${v.d ? pct(v.w, v.d).toFixed(0) + '%' : '–'}<small>${v.n} matches</small></td>`
      : `<td class="cell dim" title="${v ? v.n : 0} matches">·</td>`; }).join('')}</tr>`).join('')).join('')}
  </tbody></table></div>`;
}

function perks() {
  // the characters that bring a perk most often, as a share of that character's own matches (at least 3 uses, so one-offs don't lead)
  const fans = p => Object.entries(p.chars).filter(([, n]) => n >= 3).map(([id, n]) => ({ id, share: pct(n, S.chars[id].n) })).sort((a, b) => b.share - a.share).slice(0, 3);
  // one list at a time, ten rows unless "show all" is on, so the page is short on a phone
  const k = ST.perks, team = ['hunter', 'monster', 'char'].includes(k.tab) ? k.tab : 'hunter', top = k.all ? 0 : 10;
  const more = (n, what, key = 'all') => n > 10 ? tabs('perks.' + key, [[k[key] ? '' : '1', k[key] ? 'Show top 10 only' : `Show all ${n} ${what}`]], null) : '';
  // the three-perk combinations for whichever list is showing, under its perk table, with their own "show all"
  const comboCell = x => perkIcons(x.keys) + ' <span class="dim">' + x.keys.map(key => esc(perkInfo(key).name)).join(', ') + '</span>';
  const combosTable = (id, title, rows, rate) => `<h2>${title}</h2>` + table(id, [Tx('Combination', x => x.keys.join(), comboCell), P('Pick rate', rate), N('Matches', x => x.n),
    P('Win rate', x => pct(x.w, x.d))], rows, 1, k.allc ? 0 : 10) + more(rows.length, 'combinations', 'allc');
  let body;
  if (team === 'char') {
    // one character's perks: every number here is measured against that character's own matches
    const ids = ROLES.flatMap(r => Object.keys(C.characters).filter(x => C.characters[x].class === r)), id = C.characters[k.char] ? k.char : ids[0];
    const c = S.chars[id], info = charInfo(id), perkCell = p => `${img(perkInfo(p.key).icon, 'perk')} ${esc(perkInfo(p.key).name)}`;
    const rows = Object.values(c?.perks || {}).filter(p => !k.tier || perkInfo(p.key).tier === k.tier), combos = Object.values(c?.combos || {});
    body = `<div class="filters"><label>Character ${select('perks.char', ids.map(x => [x, `${charInfo(x).class} · ${charInfo(x).name}`]), id)}</label>
        <span class="clscell">${img(info.thumb, 'face', info.name)}${img(C.classIcons[info.class], 'cls', info.class)}<b>${esc(info.name)}</b><span class="dim">${num(c?.n || 0)} matches</span></span>
        <a href="${charHref(id)}">${cue('Full stats')}</a></div>` +
      tabs('perks.tier', [['', 'All tiers'], 'Minor', 'Major', 'Superior'], k.tier) +
      table('perks-char', [Tx('Perk', p => perkInfo(p.key).name, perkCell), Tx('Tier', p => perkInfo(p.key).tier), P('Pick rate', p => pct(p.n, c.n)), N('Matches', p => p.n),
        N('Win rate', p => pct(p.w, p.d), p => `<span class="c-${esc(info.class)}">${bar(pct(p.w, p.d))}</span>`), LV], rows, 2, top) + more(rows.length, 'perks') +
      combosTable('combos-char', `Combinations on ${esc(info.name)}`, combos, x => pct(x.n, c.n)) +
      `<p class="note">On this tab, pick rate is the share of ${esc(info.name)}'s own matches where the perk or combination was brought.</p>`;
  } else {
    const rows = Object.values(S.perks).filter(p => p.team === team && (!k.tier || perkInfo(p.key).tier === k.tier));
    body = tabs('perks.tier', [['', 'All tiers'], 'Minor', 'Major', 'Superior'], k.tier) +
      table('perks-' + team, [Tx('Perk', p => perkInfo(p.key).name, p => `${img(perkInfo(p.key).icon, 'perk')} ${esc(perkInfo(p.key).name)}`), Tx('Tier', p => perkInfo(p.key).tier),
        N('Usual slot', p => p.slots.indexOf(Math.max(...p.slots)) + 1), P('Pick rate', p => pickRate(p.m, team)), N('Matches', p => p.m),
        Tx('Most used on', p => charInfo(fans(p)[0]?.id || '').name, p => `<span class="comp">${fans(p).map(f => `<a href="#/character/${encodeURIComponent(f.id)}" title="${esc(charInfo(f.id).name)}: in ${fpct(f.share)} of their matches">${face(f.id)}</a>`).join('') || '<span class="dim">–</span>'}</span>`),
        N('Win rate', p => pct(p.mw, p.md), p => `<span class="${team === 'monster' ? 'c-Monster' : 'c-Medic'}">${bar(pct(p.mw, p.md))}</span>`), LV], rows, 3, top) + more(rows.length, 'perks') +
      combosTable('combos-' + team, team === 'monster' ? 'Monster perk combinations' : 'Hunter perk combinations', Object.values(S.combos).filter(x => x.team === team), x => pickRate(x.n, team));
  }
  return `<h1>Perks</h1><p class="sub">Which perks are picked the most, and which are not. Pick rate is the share of matches where the perk was brought: 100% would mean it showed up in every match.</p>${filterBar()}
    ${tabs('perks.tab', [['hunter', 'Hunter perks'], ['monster', 'Monster perks'], ['char', 'By character']], team)}${body}`;
}

function maps() {
  const list = Object.values(S.maps).sort((a, b) => b.n - a.n), mp = S.maps[ST.maps.key] || list[0];
  if (!mp) return `<h1>Maps</h1>${filterBar()}<p class="sub">No matches with these filters.</p>`;
  return `<h1>Maps</h1><p class="sub">Which side wins on each map, and where the fights happen. Each dot is a dome: Hunters throw one where they catch the Monster.</p>${filterBar()}
  ${tabs('maps.key', list.map(m => [m.key, esc(mapInfo(m.key).name)]), mp.key)}
  <h2>Fight heatmap</h2>
  <div class="heatwrap">${heat(mp.key, mp.domes, ST.maps.view)}<div>${tabs('maps.view', HEAT, ST.maps.view)}
    <div class="panel">${kv('Domes thrown', num(mp.throws))}${kv('Caught the Monster', `${num(mp.caught)} · ${fpct(pct(mp.caught, mp.throws))}`)}${kv('Monster damage in domes', num(mp.domes.reduce((a, d) => a + d.dmg, 0)))}
      ${kv('Hunters downed in domes', num(mp.domes.reduce((a, d) => a + d.downs, 0)))}
      ${HUNTERS.map(r => kv(`${r} inside when it went up`, fpct(pct(mp.inside[r], mp.domes.length)))).join('')}</div>
    <p class="note">Dots are placed with each map's own minimap bounds from the game files.</p></div></div>
  <h2>Map numbers</h2>
  ${tiles(tile('Matches', num(mp.n)), tile('Hunters win', fpct(pct(mp.w, mp.d))), tile('Average match', clock(avg(mp.dur, mp.n))), tile('First fight', clock(avg(mp.first, mp.n))),
    tile('Ended inside a dome', fpct(pct(mp.endDome, mp.n))), tile('Wildlife damage', num(avg(mp.wlMon, mp.n)), 'to the Monster, per match'), tile('Wildlife damage', num(avg(mp.wlHun, mp.n)), 'to Hunters, per match'))}
  <h2>How matches end here</h2>${endsTable('ends-' + mp.key, mp.ends, mp.n)}
  <h2>All maps</h2>${table('maps', [Tx('Map', m => mapInfo(m.key).name), N('Matches', m => m.n), N('Hunters win', m => pct(m.w, m.d), m => `<span class="c-Medic">${bar(pct(m.w, m.d))}</span>`),
    N('Average match', m => avg(m.dur, m.n), m => clock(avg(m.dur, m.n))), N('First fight', m => avg(m.first, m.n), m => clock(avg(m.first, m.n))), P('Domes that caught', m => pct(m.caught, m.throws))], list, 1)}`;
}

// The ranked ladder as the account server holds it: the rating after a player's latest match (what the game itself shows), with
// matches, wins and losses per side. It comes with every update (tools/summarize.js puts it in the totals). Without it the
// ladders are worked out from the match records, whose ratings are from the start of each match and so trail by one match.
const side = l => l ? { n: l.played, w: l.wins, d: l.wins + l.losses, rating: l.rating } : { n: 0, w: 0, d: 0, rating: null };
// (with the server's ladder, a player it does not list has no ranked standing, whatever their own game reported)
const ladderOf = p => { const l = SUM?.ladder?.[p.id]; return SUM?.ladder ? { h: side(l?.hunter), m: side(l?.monster) } : p.rk; };
// one rating for a player across both ladders: the better one they are placed on, else the better one so far
const topRating = (h, m) => { const placed = [h, m].filter(x => x.n >= PLACEMENT); return Math.max(...(placed.length ? placed : [h, m]).map(x => x.rating || 0)) || null; };
function ranked() {
  const k = ST.rk, ids = Object.keys(SUM?.ladder || ALL.players);
  const players = ids.map(id => ALL.players[id] || { id, chars: {}, rk: { h: side(), m: side() } }).map(p => {
    const { h, m } = ladderOf(p), lad = k.view === 'h' ? h : k.view === 'm' ? m : { n: h.n + m.n, w: h.w + m.w, d: h.d + m.d, rating: topRating(h, m) };
    const placed = k.view === 'o' ? h.n >= PLACEMENT || m.n >= PLACEMENT : lad.n >= PLACEMENT, pn = k.view === 'o' ? Math.max(h.n, m.n) : lad.n;   // placement is per ladder
    const mains = Object.values(p.chars).filter(c => k.view === 'o' || (charInfo(c.id).class === 'Monster') === (k.view === 'm')).sort((a, b) => b.n - a.n).slice(0, 3);
    return { id: p.id, ...lad, placed, pn, div: placed ? division(lad.rating) : null, mains, cls: charInfo(mains[0]?.id).class, region: acct(p.id)?.region };
  }).filter(p => p.n && (!k.tier || p.div?.tier === k.tier) && (!k.cls || p.cls === k.cls) && (!k.region || p.region === k.region) && (!k.q || pname(p.id).toLowerCase().includes(k.q.toLowerCase())));
  const wr = p => pct(p.w, p.d) || 0;
  players.sort((a, b) => k.sort === 'winrate' ? wr(b) - wr(a) : k.sort === 'wins' ? b.w - a.w : (b.placed - a.placed) || (b.rating || 0) - (a.rating || 0) || wr(b) - wr(a));
  const divCell = p => p.div ? `<div class="div">${img(p.div.icon, '', p.div.name)}<span>${esc(p.div.name)}</span></div>` : `<span class="dim">In placement (${p.pn}/${PLACEMENT})</span>`;
  const tierBtn = t => [t, img(C.ranks.find(r => r.tier === t && r.name.endsWith('Destroyer')).icon, 'tier', t)];
  return `<h1>Ranked</h1><p class="sub">The ranked leaderboard, from ranked matches only. Hunters and Monsters have separate ladders; a player is placed after ${PLACEMENT} matches on a ladder.</p>
  ${tabs('rk.view', [['o', 'Overall'], ['h', 'Hunter'], ['m', 'Monster']], k.view)}
  <div class="filters">${tabs('rk.tier', [['', 'All'], tierBtn('gold'), tierBtn('silver'), tierBtn('bronze')], k.tier).replace('class="tabs"', 'class="tabs" style="margin:0"')}
    ${select('rk.cls', ROLES, k.cls, 'All classes')}${select('rk.region', [...new Set(Object.values(ACC.players).map(p => p.region))].sort().map(r => [r, pretty(r)]), k.region, 'All regions')}
    <input type="search" data-st="rk.q" placeholder="Search player" aria-label="Search player" value="${esc(k.q)}">${select('rk.sort', [['rating', 'Sort: rating'], ['winrate', 'Sort: win rate'], ['wins', 'Sort: wins']], k.sort)}</div>
  <div class="podium">${players.slice(0, 3).map((p, i) => `<div><div class="rk" style="color:${['#ffd700', '#cfd2d4', '#cd7f3a'][i]}">#${i + 1}</div>${p.div ? img(p.div.icon, '', p.div.name) : ''}
    <div><b>${plink(p.id)}</b></div><div class="wr">${fpct(pct(p.w, p.d))}</div><div class="dim">${p.w}-${p.d - p.w} · ${p.div ? esc(p.div.name) : 'In placement'}</div></div>`).join('')}</div>
  <div class="tw"><table><thead><tr><th>Division</th><th class="n">#</th><th>Player</th><th>Mains</th><th class="n">Rating</th><th class="n">W-L</th><th class="n">Win rate</th></tr></thead><tbody>
  ${players.map((p, i) => `<tr data-href="${esc(playerHref(p.id))}"><td>${divCell(p)}</td><td class="n">${i + 1}</td><td><b>${plink(p.id)}</b></td><td><span class="comp">${p.mains.map(c => face(c.id)).join('')}</span></td>
    <td class="n">${num(p.rating)}</td><td class="n dim">${p.w}-${p.d - p.w}</td><td class="n">${bar(pct(p.w, p.d))}</td></tr>`).join('') || '<tr><td colspan="7" class="dim">No players found.</td></tr>'}</tbody></table></div>
  <details style="margin-top:1.2rem"><summary><b>Rank legend</b></summary><div class="in"><div class="legend3">${['bronze', 'silver', 'gold'].map(t => `<div><h3>${t}</h3>${C.ranks.filter(r => r.tier === t).reverse().map(r =>
    `<div class="div">${img(r.icon, '', r.name)}<span>${esc(r.name)} <span class="dim">${r.max != null ? `${num(r.min)} to ${num(r.max)}` : 'range not seen yet'}</span></span></div>`).join('')}</div>`).join('')}</div>
    <p class="note">Tiers: Bronze below ${num(C.tiers.silver[0])}, Silver from ${num(C.tiers.silver[0])}, Gold from ${num(C.tiers.gold[0])}. A division's own range is listed once the game has asked the server about it, which happens when a player reaches it. Until then a player there is shown by tier, or as one of the two divisions it can be.</p></div></details>
  <p class="note">${SUM?.ladder ? 'Ratings, matches, wins and losses are the game server\'s own ladder, as of the last update.' : 'Rating and division are as each player\'s game reported them at the start of their latest ranked match, so they trail the game by one match.'}</p>`;
}

function players() {
  const q = ST.players.q.trim().toLowerCase(), fav = p => Object.values(p.chars).sort((a, b) => b.n - a.n)[0];
  return `<h1>Players</h1><p class="sub">Everyone whose game has reported at least one match.</p>
  <div class="filters"><input type="search" data-st="players.q" placeholder="Search players" aria-label="Search players" value="${esc(ST.players.q)}">
    ${select('players.region', [...new Set(Object.values(ACC.players).map(p => p.region))].sort().map(r => [r, pretty(r)]), ST.players.region, 'All regions')}</div>
  ${hint('Tap a player to open their profile: characters, ranked ladders, progression, challenges and latest matches.')}
  ${table('players', [Tx('Player', p => pname(p.id), p => plink(p.id) + (acct(p.id)?.founder === 'Yes' ? ' <span class="tag gold">Founder</span>' : '') + cue('Profile')), N('Level', p => p.level), N('Rating', p => topRating(ladderOf(p).h, ladderOf(p).m)), N('Matches', p => p.n),
    N('Win rate', p => pct(p.w, p.d), p => bar(pct(p.w, p.d))), N('As Hunter', p => pct(p.h.w, p.h.d), p => p.h.n ? `${fpct(pct(p.h.w, p.h.d))} <span class="dim">(${p.h.n})</span>` : '–'),
    N('As Monster', p => pct(p.m.w, p.m.d), p => p.m.n ? `${fpct(pct(p.m.w, p.m.d))} <span class="dim">(${p.m.n})</span>` : '–'), Tx('Most played', p => charInfo(fav(p).id).name, p => chip(fav(p).id)),
    Tx('Region', p => pretty(acct(p.id)?.region)), N('Last seen', p => acct(p.id)?.t, p => day(acct(p.id)?.t))],
    Object.values(ALL.players).filter(p => (!q || pname(p.id).toLowerCase().includes(q)) && (!ST.players.region || acct(p.id)?.region === ST.players.region)), 3, 0, false, p => playerHref(p.id))}
  <p class="note">Rating is the ranked rating the game reports for the player; it is blank until they have one.</p>`;
}

// a line of a player's own match list (their file), in the shape matchRow() draws
const asMatch = r => ({ id: r.id, t: r.t, dur: r.dur, mapKey: r.map, decided: r.win === 'Merc' || r.win === 'Monster', hunterWin: r.win === 'Merc', hdr: { CharacterId: r.c },
  clients: { [r.role]: { Data: { LateJoiner: r.late, ChatMessagesSent: r.chat } } } });
function player(id) {
  // p: their match totals. a: what their game says about the account. x: their own file, every match and their progression, a section per day
  const p = ALL.players[id], a = acct(id);
  if (!p) return `<h1>Player not found</h1><p class="sub">No matches reported under this id.</p>`;
  const got = fetchOnce('p/' + id, `${SITE_DATA}/p/${id.slice(-2)}/${encodeURIComponent(id)}.js?t=${Math.floor(Date.now() / 600000)}`, d => { const s = Object.values(d.days);
    return { matches: s.flatMap(x => x.matches).sort((x, y) => y.t - x.t), xp: s.flatMap(x => x.xp).sort((x, y) => x.t - y.t), rewards: s.flatMap(x => x.rewards).sort((x, y) => y.t - x.t),
      chall: Object.values(s.reduce((o, x) => { for (const [name, c] of Object.entries(x.chall)) if (c.t >= (o[name]?.t || 0)) o[name] = { name, ...c }; return o; }, {})) }; });
  const x = typeof got === 'object' ? got : { matches: [], xp: [], rewards: [], chall: [] }, gains = x.xp.slice(-30);
  const wait = got === 'loading' ? '<p class="dim">Loading this player\'s history…</p>' : got === 'missing' ? '<p class="dim">This player\'s history could not be loaded.</p>' : '';
  const lad = (l, name) => { const dv = l.n >= PLACEMENT ? division(l.rating) : null; return kv(name, l.n ? `${dv ? esc(dv.name) : `In placement (${l.n}/${PLACEMENT})`} · rating ${num(l.rating)} · ${l.w}-${l.d - l.w}` : 'No ranked matches'); };
  return `<h1>${esc(pname(id))} ${a?.founder === 'Yes' ? '<span class="tag gold">Founder</span>' : ''}</h1>
  <p class="sub">${a ? `${esc(pretty(a.region))} · text ${esc(a.lang)} · audio ${esc(a.audio)} · first seen ${day(a.since)} · last seen ${day(a.t)} · ` : ''}id ${esc(String(id).slice(0, 8))}…</p>
  ${tiles(tile('Matches', num(p.n)), tile('Win rate', fpct(pct(p.w, p.d))), tile('As Hunter', fpct(pct(p.h.w, p.h.d)), `${p.h.n} matches`), tile('As Monster', fpct(pct(p.m.w, p.m.d)), `${p.m.n} matches`),
    tile('Account level', num(p.level)), tile('Time played', hours(p.secs)), tile('Play sessions', p.sessions.size ? num(p.sessions.size) : '–', p.sessions.size ? `${dec(p.n / p.sessions.size)} matches each` : 'not recorded'), tile('Chat', dec(p.chat / p.n), 'messages per match'))}
  <div class="cols"><section><h2>Ranked</h2><div class="panel">${lad(ladderOf(p).h, 'Hunter ladder')}${lad(ladderOf(p).m, 'Monster ladder')}</div></section>
    <section><h2>Queueing and conduct</h2><div class="panel">${kv('Average queue', clock(avg(a?.q.dur, a?.q.ok)))}${kv('Left the queue', num(a ? a.q.n - a.q.ok : null))}
      ${kv('Queue dodges', num(a?.q.dodges))}${kv('Joined late', num(p.late))}${kv('Disconnects', num(p.leaves))}</div></section></div>
  <h2>Characters</h2>${table('pc-' + id, [Tx('Character', c => charInfo(c.id).name, c => chip(c.id)), Tx('Class', c => charInfo(c.id).class, c => classCell(charInfo(c.id).class)),
    N('Matches', c => c.n), N('Win rate', c => pct(c.w, c.d), c => bar(pct(c.w, c.d))), N('Level', c => c.level), Tx('Usual skin', c => Object.entries(c.skins).sort((a, b) => b[1] - a[1])[0]?.[0]),
    N('Damage dealt', c => avg(c.dmg, c.n)), N('Damage taken', c => avg(c.taken, c.n))], Object.values(p.chars), 2, 0, false, c => charHref(c.id))}
  <h2>Progression</h2>${wait}<div class="cols"><section><div class="panel"><h3>Account XP gained, last ${gains.length} times</h3>${chart(gains.map(g => g.gain), gains.map(g => g.up ? '▲' : ''))}
      <p class="note">▲ marks a level-up.</p></div></section>
    <section>${table('prw-' + id, [N('When', r => r.t, r => day(r.t)), Tx('Why', r => pretty(r.why)), Tx('Reward', r => r.name), N('Amount', r => r.amount)], x.rewards, 0, 8)}</section></div>
  <h2>Challenges</h2>${table('pch-' + id, [Tx('Challenge', c => c.name), Tx('Category', c => c.cat), Tx('Status', c => c.pn >= c.pm ? 'Finished' : c.ev === 'ChallengeDecline' ? 'Declined' : 'In progress'),
    N('Progress', c => pct(c.pn, c.pm), c => `${bar(pct(c.pn, c.pm))} <span class="dim">${num(c.pn)} / ${num(c.pm)}</span>`)], x.chall, 3)}
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
  const rows = Object.entries(p.Data).filter(([, s]) => s && typeof s === 'object' && s.TotalDamageDealt != null).map(([label, s]) => ({ label, s, info: itemInfo(s.Name ?? label) }));
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
  return table('slots-' + p.ServerPlayerRoundHeader.Class, cols, rows.filter(r => r.info.name), 5) + (heals ? `<div class="in"><h3>Healing done, by source</h3>${[1, 2, 3].filter(i => heals['Stage' + i]).map(i =>
    kv('Stage ' + i, heals['Stage' + i].map(h => `${esc(itemInfo(h.Name).name)} ${num(h.HealAmount)}`).join(' · '))).join('')}${kv('Total', num(heals.TotalHeals))}</div>` : '');
}

/* Every finished match has a small file of its own records, and every day a list of its matches (tools/summarize.js writes them
   from the archive). So any match ever played can be opened, not only the recent ones this page loaded. */
const SITE_DATA = window.TELEMETRY_SITE_DATA || 'archive/site';
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
  <p class="sub">${endLabel(m.hdr.WinningTeam, m.hdr.WinCondition)} · ${esc(mapInfo(m.mapKey).name)} · ${clock(m.dur)}${m.kicks.length ? ` · ${m.kicks.length} anti-cheat kick` : ''}</p>
  <h2>Scoreboard</h2>
  ${table('score', [Tx('Class', r => -ROLES.indexOf(r.role), r => img(C.classIcons[r.role], 'cls', r.role)), Tx('Character', r => charInfo(r.id).name, r => chip(r.id) + (r.cd ? ` <span class="dim">${esc(r.cd.CharacterSkin)}</span>` : '')),
    Tx('Player', r => r.ph.IsBot ? 'Bot' : pname(r.who || ''), r => r.ph.IsBot ? '<span class="dim">Bot</span>' : plink(r.who)),
    N('Level', r => r.ph.Level > 0 ? r.ph.Level : r.cd?.PlayerLevel > 0 ? r.cd.PlayerLevel : null),     // the host can report 0 for a person; their own record has the level
    Tx('Perks', r => '', r => perkIcons(Object.values(r.ph.Perks || {}))), N('Damage dealt', r => r.ph.DamageToEnemyTeam), N('Damage taken', r => r.ph.DamageFromEnemyTeam),
    N('Healing done', r => r.p?.Data?.AppliedHeals?.TotalHeals ?? null), N('Healing received', r => H.Healing?.Received?.[r.role] ?? null), N('Shielding', r => H.Shielding?.[r.role] ?? null),
    N('Downs', r => r.role === 'Monster' ? null : incaps(r.role)), N('Deaths', r => H.Deaths?.[r.role] ?? null), N('Strikes', r => H.StrikesAtEnd?.[r.role] ?? null)], rows, 0)}
  <div style="height:.6rem"></div>
  ${table('score2', [Tx('Character', r => -ROLES.indexOf(r.role), r => chip(r.id)), N('To wildlife', r => r.ph.DamageToWildlife), N('From wildlife', r => r.ph.DamageFromWildlife), N('Character level', r => r.ph.CharacterLevel > 0 ? r.ph.CharacterLevel : null),
    N('Chat messages', r => r.cd?.ChatMessagesSent ?? null), Tx('Joined late', r => '', r => r.cd ? (r.cd.LateJoiner ? 'Yes' : 'No') : '–'), N('Late joins', r => d.LateJoinerCounts?.[r.role] ?? null),
    N('Hotswaps', r => r.cd ? sumv(r.cd.Hotswaps) : null), N('Disconnects', r => d.LeaverCounts?.[r.role] ?? null), N('Queued for', r => q(r.role)?.BaseHeader.Duration ?? null, r => clock(q(r.role)?.BaseHeader.Duration))], rows, 0)}
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
  <h2>Every dome</h2>
  <div class="heatwrap">${heat(m.mapKey, m.domes.map(e => ({ x: e.Data.DomeXPosition, y: e.Data.DomeYPosition, caught: !!e.Data.InDome?.Monster })), 'all', true)}
  ${table('domes', [N('#', e => e.i), N('At', e => e.at, e => clock(e.at)), N('Up for', e => e.BaseHeader.Duration, e => Math.round(e.BaseHeader.Duration) + 's'),
    Tx('Inside', e => '', e => ROLES.filter(r => e.Data.InDome?.[r]).map(r => img(C.classIcons[r], 'cls', r)).join(' ')), Tx('Monster health', e => '', e => { const s = e.Data.MonsterSummary; return s ? hm(s.Start.HitPoints, s.End.HitPoints) : '–'; }),
    Tx('Monster armor', e => '', e => { const s = e.Data.MonsterSummary; return s ? hm(s.Start.Armor, s.End.Armor) : '–'; }), N('Health damage', e => e.Data.MonsterSummary?.HealthDamageReceived ?? null),
    N('Armor damage', e => e.Data.MonsterSummary?.ArmorDamageReceived ?? null), N('Stage', e => e.Data.MonsterSummary?.Start.Stage ?? null),
    Tx('Downs', e => '', e => (e.Data.HunterSummary?.IncapList || []).map((c, i) => `${esc(c)} ${clock(e.Data.HunterSummary.IncapTimes[i])}`).join(', ') || '–'),
    Tx('Strikes after', e => '', e => { const s = e.Data.HunterSummary; return s ? HUNTERS.map(r => `${s.Start.Strikes[r]}→${s.End.Strikes[r]}`).join(' ') : '–'; }),
    Tx('Died', e => '', e => HUNTERS.filter(r => e.Data.HunterSummary?.Deaths?.[r]).join(', ') || '–'), Tx('Timed events', e => '', e => (e.Data.DurationEvents || []).map(x => `${pretty(x.Event)} ${x.Duration}s`).join(', ') || '–'),
    Tx('Ended match', e => '', e => e.Data.GameEnding ? 'Yes' : 'No')], m.domes.map((e, i) => ({ ...e, i: i + 1, at: (T(e) - t0) / 1000 - e.BaseHeader.Duration })), 0, 0, true)}</div>
  <p class="note">Dome numbers on the map match the table. Strikes are listed Assault, Trapper, Medic, Support.</p>
  <h2>Weapons and abilities</h2>
  ${rows.filter(r => r.p).map(r => `<details class="c-${r.role}"><summary>${img(C.classIcons[r.role], 'cls', r.role)} ${face(r.id)} <b>${esc(charInfo(r.id).name)}</b>
    <span class="dim">${num(r.ph.DamageToEnemyTeam)} damage</span></summary>${slots(r.p, Math.min(3, m.hdr.MonsterFinalStage))}</details>`).join('')}
  ${dl ? `<h2>Dialogue</h2><details><summary><b>${dl.Responses.length} voice lines played</b></summary>${table('dlog', [N('#', l => l.i), Tx('Speaker', l => charInfo(l.sp).name), Tx('Line', l => l.resp), Tx('Triggered by', l => l.ev),
    N('Variation', l => l.va), Tx('', l => '', l => play(lineUrl(l.sp, l.resp)))], dl.Responses.map((resp, i) => ({ i: i + 1, resp, sp: dl.Speakers[i], ev: dl.EventNames[i], va: dl.Variations?.[i] })), 0, 0, true)}</details>` : ''}`;
}

function matchmaking() {
  // queue attempts are stored per patch, mode and ranked-or-not, so the filter bar picks groups to add up (the solo box does not apply)
  const pass = k => { const [v, mode, rk] = k.split('|'); return (!ST.fl.v || v === ST.fl.v) && (!ST.fl.mode || mode === ST.fl.mode) && (!ST.fl.type || (rk === 'R') === ST.fl.type.startsWith('Ranked')); };
  const mm = SUMMARY.merge(Object.keys(ACC.mm).filter(pass).map(k => ACC.mm[k])) || { n: 0, ok: 0, dur: 0, dodges: 0, team: {}, type: {}, hourN: [], hourDur: [], stages: {}, reasons: {} };
  const q = x => x ? avg(x.dur, x.n) : null, byHour = Array.from({ length: 24 }, (_, h) => avg(mm.hourDur[h], mm.hourN[h])), rows = o => Object.entries(o).map(([k, v]) => ({ k, ...v }));
  const gaps = Object.keys(S.even).map(Number).sort((a, b) => a - b);
  return `<h1>Matchmaking</h1><p class="sub">How long queues take, how far queue attempts get, and how even the matches are. Custom games never queue, so they are not here.</p>${filterBar()}
  ${tiles(tile('Queue attempts', num(mm.n)), tile('Average queue', clock(avg(mm.dur, mm.ok)), 'when a match was found'), tile('Reached a match', fpct(pct(mm.ok, mm.n))), tile('Left the queue', fpct(pct(mm.n - mm.ok, mm.n))),
    tile('Hunter queue', clock(q(mm.team.Merc))), tile('Monster queue', clock(q(mm.team.Monster))), tile('Ranked queue', clock(q(mm.type.Ranked))), tile('Arcade queue', clock(q(mm.type.Hunt))))}
  <h2>Queue time through the day</h2><div class="panel">${chart(byHour, byHour.map((_, h) => String(h).padStart(2, '0')), clock)}<p class="note">Average queue by hour (UTC).${ST.fl.mode ? ' Most queue attempts are recorded without a mode, so with a mode picked only the ones that name it are counted.' : ''}</p></div>
  <div class="cols"><section><h2>How far queue attempts get</h2>${table('mmst', [Tx('Step', s => pretty(s.k)), N('Reached', s => s.n), N('Share', s => pct(s.n, mm.n), s => bar(pct(s.n, mm.n))),
      N('Time to reach', s => s.at / s.n, s => clock(s.at / s.n)), N('Players in lobby', s => s.lobby ? s.pl / s.n : null, s => s.lobby ? dec(s.pl / s.n) : '–')], rows(mm.stages), 1)}</section>
    <section><h2>Why people leave</h2>${table('mmwhy', [Tx('Reason', r => pretty(r.k)), N('Times', r => r.n), N('After', r => r.at / r.n, r => clock(r.at / r.n))], rows(mm.reasons), 1)}
      <p class="note">${num(mm.dodges)} queue attempts were queue dodges: leaving a ranked lobby that already had a Hunter and a Monster.</p></section></div>
  <div class="cols"><section><h2>Parties and the health buff</h2>${table('mmparty', [Tx('Parties in the lobby', x => x.k.split('|')[0]), Tx('Hunter health buff', x => x.k.split('|')[1] || 'None'), N('Matches', x => x.n),
      N('Hunters win', x => pct(x.w, x.d), x => `<span class="c-Medic">${bar(pct(x.w, x.d))}</span>`)], Object.entries(S.party).map(([k, v]) => ({ k, ...v })), 2)}</section>
    <section><h2>How even matches are</h2><div class="panel c-Medic">${chart(gaps.map(g => pct(S.even[g].w, S.even[g].d)), gaps.map(g => (g > 0 ? '+' : '') + g), fpct)}
      <p class="note">Hunter win rate by skill gap (Hunters' average matchmaking skill minus the Monster's). A flat line near 50% means even matches.</p></div></section></div>`;
}

function progression() {
  const A = ACC, people = Object.values(ALL.players), src = Object.entries(A.rewards).map(([k, r]) => { const [why, type, ...name] = k.split('|'); return { why, type, name: name.join('|'), ...r }; });
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
  const A = ACC, people = Object.values(A.players), days = Object.keys(A.daily).sort().slice(-28), founders = people.filter(p => p.founder === 'Yes').length;
  const active = days.map(d => A.daily[d].active ?? A.daily[d].ids.length), signins = days.map(d => A.daily[d].signins), sessions = A.sessN ?? A.sessions.length;
  const split = (id, label, key) => table(id, [Tx(label, x => pretty(x.k)), N('Players', x => x.n), N('Share', x => pct(x.n, people.length), x => bar(pct(x.n, people.length)))], count(people, key), 1);
  return `<h1>Community</h1><p class="sub">Who is playing, where and when.</p>
  ${tiles(tile('Players', num(people.length), 'whose game has sent a record'), tile('Active on the last day', num(active.at(-1)), days.length ? day_(days.at(-1)) + ', so far' : ''), tile('Sign-ins', num(A.logins)), tile('New players', num(people.filter(p => p.fresh).length)),
    tile('Founders', fpct(pct(founders, people.length)), `${num(founders)} players`), tile('Play sessions', sessions ? num(sessions) : '–'))}
  <div class="cols"><section><h2>Active players per day</h2><div class="panel">${chart(active, days.map(d => d.slice(8)))}</div></section>
    <section><h2>Sign-ins per day</h2><div class="panel">${chart(signins, days.map(d => d.slice(8)))}</div></section></div>
  <p class="note">Days are UTC. A player is active on a day when their game sent any record that day.</p>
  <div class="cols"><section><h2>Regions</h2>${split('reg', 'Online region', p => p.region)}</section><section><h2>Ratings regions</h2>${split('creg', 'Ratings region', p => p.cregion)}</section></div>
  <div class="cols"><section><h2>Text language</h2>${split('lang', 'Language', p => p.lang)}</section><section><h2>Audio language</h2>${split('alang', 'Language', p => p.audio)}</section></div>
  <h2>Patches, game build and platform</h2>${table('vers', [Tx('Patch · build · platform', v => v.k), N('Records', v => v.n), N('Last seen', v => v.t, v => day(v.t))], Object.entries(A.vers).map(([k, v]) => ({ k, ...v })), 2)}`;
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
  const A = ACC, one = f => Object.keys(A.hdr[f] || {}).map(v => v === '' ? '(empty)' : v).join(', '), ctx = Object.keys(A.hdr.Context || {}).filter(Boolean);
  const dist = Object.keys(ALL.dist || {}).join(', '), leftOut = SUM ? SUM.recordsLeftOut : LEFT_OUT,
    leftBy = Object.entries((SUM ? SUM.leftOutBy : LEFT_BY) || {}).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${num(n)} ${c ? 'marked ' + esc(c) : 'from game files that match no release'}`).join(', ');
  const feeds = [['Characters, Matchups, Perks, Maps, Match page', 'ServerRoundRecord', 'The PC hosting the match'], ['Weapon, ability, stage and source numbers', 'ServerPlayer Assault / Trapper / Medic / Support / Monster records', 'The PC hosting the match'],
    ['Fight heatmap, dome list', 'ServerDomeRecord', 'The PC hosting the match'], ['Lobby panel, unfinished matches', 'ServerRoundStartRecord', 'The PC hosting the match'], ['Dialogue', 'ServerDialogueRecord', 'The PC hosting the match'],
    ['Anti-cheat kicks', 'ServerEACClientKickRecord', 'The PC hosting the match'], ['Players, Ranked, skins, chat, late joins', 'ClientRoundRecord', "Each player's own game"], ['Matchmaking', 'ClientMatchmakingRecord', "Each player's own game"],
    ['Progression', 'ClientXPRecord, ClientRewardRecord, ClientChallengeUpdateRecord', "Each player's own game"], ['Store', 'ClientPurchaseRecord', "Each player's own game"],
    ['Community: sign-ins, Founders', 'ClientLoginRecord', "Each player's own game"], ['Movement and frame-rate heatmaps', 'ClientProfilingRecord', 'Nobody: never switched on']];
  return `<h1>About the data</h1><p class="sub">Evolve Stage 2 builds a set of records about every match, queue attempt and sign-in. This site only reads those records.</p>
  <h2>What each page is built from</h2><div class="tw"><table><thead><tr><th>Page</th><th>Record</th><th>Sent by</th></tr></thead><tbody>${feeds.map(f => `<tr><td>${f[0]}</td><td>${f[1]}</td><td>${f[2]}</td></tr>`).join('')}</tbody></table></div>
  <h2>Records received</h2>${table('recs', [Tx('Record', r => r.k), N('Received', r => r.n), N('Last seen', r => r.t, r => day(r.t)), Tx('Data version', r => Object.keys(r.versions).join(', '))], Object.entries(A.records).map(([k, v]) => ({ k, ...v })), 1)}
  <h2>Record details</h2><div class="panel">${kv('Build configuration', esc(one('Config')))}${kv('Platform', esc(one('Platform')))}${kv('Change-list number', esc(one('Changelist')))}
    ${kv('Build number', esc(one('BuildNumber')))}${kv('Micro-patch version', esc(one('Micropatch')))}${kv('Context tags seen', esc(ctx.join(', ') || 'none'))}
    ${kv('Application id', esc(one('PublicAppID')))}${kv('Header versions', `base ${esc(one('base'))} · player ${esc(one('player'))} · match ${esc(one('match'))} · per-player ${esc(one('perPlayer'))}`)}</div>
  <h2>Things to know</h2><div class="panel"><ul class="plain">
    <li>Match records name the role and the character, never the player. A player is linked to a role only when their own game also reported the match; otherwise the scoreboard says "not reported".</li>
    <li>Records hold no player names. Names shown here come from a separate id to name list. The sign-on session id is used to count play sessions and is never shown.</li>
    <li>Match records come from the host's PC only, so a host could send false numbers. Nothing here cross-checks them yet.</li>
    <li>For Hunters the game counts every damage tick as a hit, so hits can exceed uses and its miss count is unreliable. Monster hits are counted per ability use.</li>
    <li>Records carry no clock time. Dates, queue hours and dome times come from when each record arrived.</li>
    <li>The game never fills in the Monster's distance travelled: the value seen across all ${num(ALL.total)} match records is ${esc(dist)}.</li>
    <li>Hotswap and late-join counts may always read zero: nothing was found in the game that triggers them.</li>
    <li>Ranked ratings, matches, wins and losses come from the game server's own ladder, handed over with each update. The game keeps its division table hidden, so a division's rating range is known only once the game has asked the server about it.</li>
    <li>The post-match survey never reaches a record, so its answers cannot be shown.</li>
    <li>The game marks nobody as a first-time user or as a Founder in these records, so New players and Founders read zero.</li>
    <li>Matches played by bots are left out of character, perk and matchup numbers.</li>
    <li>Only matches played on an official release are counted${OFFICIAL.size ? ': ' + [...OFFICIAL].map(esc).join(', ') : ''}. Records from any other build are left out${SUM || !SHOW_ALL ? `; ${num(leftOut)} left out so far${leftBy ? ` (${leftBy})` : ''}` : ' (this local preview shows everything)'}.</li>
    <li>The game collects telemetry data such as damage dealt, damage taken, healing, and a wide variety of other stats that are used to analyze matches and the current state of the game. Matches are shown here with the player's display name.</li></ul></div>
  <h2>What the site holds</h2>${tiles(tile('Records', num(Object.values(A.records).reduce((a, r) => a + r.n, 0))), tile('Matches', num(ALL.total), 'finished'), tile('Players', num(Object.keys(A.players).length)),
    tile('Covers', SUM ? `${day_(SUM.from)} to ${day_(SUM.to)}` : EVENTS.length ? `${day(SPAN()[0])} to ${day(SPAN()[1])}` : '–', SUM ? 'updated ' + stamp(SUM.built) : ''))}`;
}

/* ---------- router ---------- */
const routes = { '': overview, characters, character, matchups, perks, maps, ranked, players, player, matches, match, matchmaking, progression, store, dialogue, community, fairplay, about };
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
  if (s) { const st = sortState[s.dataset.sort], i = +s.dataset.i; st.dir = st.i === i ? -st.dir : -1; st.i = i; render(true); }
  if (b) setState(b.dataset.st, b.dataset.v);
  if (a) { audio.src = a.dataset.audio; audio.play().catch(() => { a.textContent = 'No file'; }); }
});
app.addEventListener('change', e => { if (e.target.matches('select[data-st]')) setState(e.target.dataset.st, e.target.value); });
app.addEventListener('input', e => {
  if (!e.target.matches('input[data-st]')) return;
  const path = e.target.dataset.st, at = e.target.selectionStart;
  setState(path, e.target.value);
  const el = app.querySelector(`input[data-st="${path}"]`); el.focus(); el.setSelectionRange(at, at);   // the page was redrawn, so put the cursor back
});
render();
