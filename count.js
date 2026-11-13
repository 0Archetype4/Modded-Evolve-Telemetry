/* The counting rules and the counting itself: which records count, how they join into matches, and every total the site shows.
   Shared by the page (app.js shows the totals and opens a single match from its records) and the hourly job (tools/summarize.js
   counts every day of the archive with it). A change here changes the published numbers at the job's next run: keep
   node tools/summarize.js --check passing. Moved out of app.js on 2026-11-12, unchanged, so that a page edit cannot break the count.
   makeCounter() joins the records it is given and returns the rules, the matches and the counting functions:
     catalog          window.CATALOG (data/catalog.js)
     records          parsed records, oldest first
     showAll          count every release, not only the official ones (the invented sample and the private local preview)
     officialExtra    more official release names (every name the public game manifest has shown, from tools/update.py)
     afterUnfinished  { matchId: 1 } for matches played right after one their host never finished (worked out by the job)
     filedDay         the day the server filed these records under, for the per-day sign-in counts (the job counts a day at a time) */
(function (root) {
'use strict';
function makeCounter({ catalog, records = [], showAll = false, officialExtra = [], afterUnfinished = {}, filedDay = '' } = {}) {
const C = catalog, SHOW_ALL = showAll;
// Owner's rule (2026-10-09): only matches played on an OFFICIAL public release count. Each record names the release it was played on
// (BaseHeader.Context). The PUBLIC launcher writes the public release list's version text there at every PLAY, after its file
// check and repair, whether or not every file matched (launcher 0.1.69, MainWindow.Stage2.cs; read by the Test Client chat
// 2026-10-11); it is empty only when the launcher could not read the release list. The test channel is stricter and has its
// own names. Everything else is left out: older public builds, betas and drafts, records with no name, and Turtle Rock's own
// test tag ("aisoak").
// Add each official release's exact name here when it goes live. The About page says which are counted and how many records were left out.
const OFFICIAL = new Set([
  'Patch-1.0-Release',      // public game manifest version, live 2026-10-09 13:17 UTC
  'Patch-1.0-Hot-Fix-1',    // public game manifest version (client/game-manifest-stage2.json), switched 2026-10-10 09:42:07 UTC; confirmed official by the Patch Work Flow chat
  'Patch-1.0-Community-Skins-1',   // switched 2026-10-14 09:06 UTC (Patch Work Flow chat): Hot Fix 1 plus two Elder Kraken skins, no gameplay change
  'Patch-1.0-Legacy-Map-FusionPlant',   // switched 2026-10-16 17:06 UTC (Patch Work Flow chat): the Fusion Plant map added, no balance change
  'Patch-1.0-Hotfix',      // switched 2026-10-17 06:57 UTC (Patch Work Flow chat): balance changes to Goliath, Gorgon, Battle Cabot, Lennox
  'Patch-1.0-Hotfix-3',    // the public manifest's version on 2026-10-17 12:05 UTC (read there directly)
  'Patch-1.1',             // public 2026-11-06 18:27 UTC (Patch Work Flow chat): Armory, Quick Play is Hunt and Arena only, Rescue in Custom, balance changes
  'Patch-1.1-Release',     // the public manifest's name for Patch 1.1 from 2026-11-06 about 20:30 UTC
  'Patch-1.1-Release-2026-11-06',   // that release renamed for a few minutes on 2026-11-07 so its update could reuse the name (Patch Work Flow chat)
  'Patch-1.1-Release-2026-11-07',   // the 7 Nov update, renamed on 2026-11-08 when the Rescue fix reused the name (Patch Work Flow chat)
  'Patch-1.1-Release-2026-11-08',   // the 8 Nov 00:18 UTC Rescue fix, renamed when the 8 Nov 04:46 UTC update (tree b648970163db) reused the name
  'Patch-1.2-Release',     // Patch 1.2, the public manifest's name for it from release (Patch Work Flow chat, 2026-11-13); shown as "Patch 1.2"
  ...officialExtra,   // and every name the public manifest has shown (tools/update.py)
]);

const RAW = records;
const counted = e => e.BaseHeader?.Context !== 'aisoak' && (SHOW_ALL || OFFICIAL.has(e.BaseHeader?.Context));
const EVENTS = RAW.filter(counted);
const LEFT_OUT = RAW.length - EVENTS.length;
// What was left out, by the release name each record carries ('' when the game files match no release). The About page lists
// it, so a new public release that has not been added to OFFICIAL above is seen at once instead of silently going missing.
const LEFT_BY = {}; for (const e of RAW) if (!counted(e)) { const c = e.BaseHeader?.Context || ''; LEFT_BY[c] = (LEFT_BY[c] || 0) + 1; }
const ROLES = ['Assault', 'Trapper', 'Medic', 'Support', 'Monster'], HUNTERS = ROLES.slice(0, 4);

const sumv = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
const cell = (o, k, init) => o[k] || (o[k] = init());
const nw = () => ({ n: 0, w: 0, d: 0 });
// When a record happened: the time the player's launcher stamped on it (_received), unless that is more than two minutes later
// than the moment the server took the record in (_at, on every record since backend 0.1.110). Only a wrong PC clock can do that,
// and then the server's time is used. A record delivered late keeps its own, earlier, time.
const T = e => e._t ?? (e._t = (r => Date.parse(e._at) < r - 120000 ? Date.parse(e._at) : r)(Date.parse(e._received)));

// which play session a record belongs to: the launcher blanks the sign-on session id and leaves a short hash of it in _session
const sessionOf = e => e._session || e.ClientHeader?.SSOSessionID || '';
const build = e => `${e.BaseHeader?.BuildNumber}.${e.BaseHeader?.Micropatch}`;
// the patch name is whatever the client put in the context tag; records without one fall back to the game build
// Release names that are shown and counted as one patch. Owner, 2026-10-11 (through the Skin Creation chat): Hot Fix 1 only
// restored two badge files and changed no gameplay value, so it and the Release are one "Patch 1.0". Every record keeps its own
// release name in the archive, so taking a line out of here splits them again at the next recount.
const PATCH_OF = { 'Patch-1.0-Release': 'Patch 1.0', 'Patch-1.0-Hot-Fix-1': 'Patch 1.0', 'Patch-1.0-Community-Skins-1': 'Patch 1.0', 'Patch-1.0-Legacy-Map-FusionPlant': 'Patch 1.0',
  // balance changed from here on: one patch of its own after Patch 1.0 (owner, 2026-10-17: "combine the two hot fixes into
  // their own patch after patch 1.0 as their own category"), so numbers before and after can be compared
  'Patch-1.0-Hotfix': 'Patch 1.0 Hotfix', 'Patch-1.0-Hotfix-3': 'Patch 1.0 Hotfix',
  // Patch 1.1 is one patch whatever name its release carried (owner, 2026-11-06, through the Patch Work Flow chat: "make sure
  // telemetry will follow patch 1.1 as a new section"; the update of 2026-11-07 stays inside it)
  'Patch-1.1': 'Patch 1.1', 'Patch-1.1-Release': 'Patch 1.1', 'Patch-1.1-Release-2026-11-06': 'Patch 1.1',
  'Patch-1.1-Release-2026-11-07': 'Patch 1.1', 'Patch-1.1-Release-2026-11-08': 'Patch 1.1',
  // owner, 2026-11-13 (Patch Work Flow chat): the release is named Patch-1.2-Release on Gitea and the Desk, shown here as "Patch 1.2"
  'Patch-1.2-Release': 'Patch 1.2' };
// every Patch 1.0 hotfix build, now and later (Hotfix, Hotfix-3, Hotfix-4 ...), is one patch: "Patch 1.0 Hotfix" (owner, 2026-10-17)
const ver = e => { const c = e.BaseHeader?.Context; return PATCH_OF[c] || (/^Patch-1\.0-Hotfix/i.test(c || '') ? 'Patch 1.0 Hotfix' : c ? 'Patch ' + c.replace(/^patch[-_ ]?/i, '') : 'Build ' + build(e)); };

const ITEMS = { Pistol: { name: 'Pistol', icon: '' }, BasicAttack: { name: 'Melee', icon: '' }, Pounce: { name: 'Pounce', icon: '' },
  Special: { name: 'Burn and wall pounce', icon: '' }, Uncategorized: { name: 'Other', icon: '' } };
for (const c of Object.values(C.characters)) for (const it of c.items) ITEMS[it.key] = it;
const charInfo = id => C.characters[id] || { name: id, class: '', thumb: '', items: [], voice: '' };

// a recorded perk id is the perk plus a number 1 to 3 ("PerkMartyrLow2"), read here as the perk's level: the site counts the perk and keeps the level beside it
const perkBase = k => C.perks[String(k).toLowerCase()] ? String(k) : String(k).replace(/[1-3]$/, ''), perkLevel = k => +(/[1-3]$/.exec(String(k)) || [0])[0];

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

/* ---------- sort the records ---------- */
const byId = new Map();
const slot = id => byId.get(id) || byId.set(id, { id, players: {}, clients: {}, domes: [], kicks: [], mm: [] }).get(id);
// The records name weapons by the game's own class names ("FlameThrowerB"); the catalog knows a character's kit by slot. So each name is
// matched to the catalog by the slot it arrives in. Slot order as the first real match showed it: Hunters 1 primary, 2 class ability,
// 3 secondary, 4 special; Monsters 1 to 4 in card order. ponytail: one name is assumed to mean one item for every character that carries it.
const SLOT_TYPE = ['Primary', 'Class Ability', 'Secondary', 'Special Ability'];
// The order weapons and abilities are listed in, the same for every character. Hunters: primary, secondary, special ability,
// class ability (the record's slots 1, 3, 4, 2), then the pistol. Monsters: abilities 1 to 4, then melee, pounce and the rest.
const SLOT_ORDER = [['Ability1', 'Ability3', 'Ability4', 'Ability2', 'Pistol', 'Uncategorized'], ['Ability1', 'Ability2', 'Ability3', 'Ability4', 'BasicAttack', 'Pounce', 'Special', 'Uncategorized']];
// the kit a per-player record carries: its four weapon or ability names, in slot order
const kitOf = p => [1, 2, 3, 4].map(j => p.Data['Ability' + j]?.Name ?? '').join('|');
// Two kinds of record are never used for damage numbers, whatever kit they carry:
//  - a match played right after one its host started and never finished: the game can carry that match's weapon list and
//    damage over into the next record (seen only after an unfinished match, never after a finished one). The job works out
//    which matches these are from the order of each host's start records (tools/summarize.js) and passes their ids in.
//  - a record holding an impossible number. The largest believable seat so far dealt 193,180; the new-player scenario scripts
//    hits of exactly 10,000,000, and one record held 1.8e33.
const AFTER_UNFINISHED = afterUnfinished, IMPOSSIBLE = 1e6;
const amounts = p => [p.ServerPlayerRoundHeader.DamageToEnemyTeam, p.ServerPlayerRoundHeader.DamageFromEnemyTeam,
  ...Object.values(p.Data).flatMap(s => s && typeof s === 'object' ? (typeof s.TotalDamageDealt === 'object' ? Object.values(s.TotalDamageDealt || {}) : [s.TotalDamageDealt, s.TotalHeals]) : [])];
// the pile a seat's damage, healing, weapon and ability numbers go on: its kit, or one of the two piles the pages never read ("!...")
const pileOf = (m, p) => amounts(p).some(v => Math.abs(v) >= IMPOSSIBLE) ? '!impossible' : (AFTER_UNFINISHED[m.id] ? '!after-unfinished|' : '') + kitOf(p);
// a character's own item for a slot, from the catalog ('Ability3' -> their secondary; for a Monster their third ability)
const slotItem = (id, label) => { const c = charInfo(id), j = /^Ability([1-4])$/.exec(label)?.[1]; return j ? (c.class === 'Monster' ? c.items[j - 1] : c.items.find(i => i.type === SLOT_TYPE[j - 1])) : null; };
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
// The rank a player held going into a ranked match: the division of the rating the game recorded for their seat at the start
// of it. Everyone starts at exactly 1500, so that is a first ranked match, with no rank yet. Matches played during placement
// are included: the game shows no division then, but the rating is already the player's own.
const NO_RANK = 'No rating yet';
const rankOf = (m, role) => { const r = m.d.PlayerGlickoScores?.[role] ?? m.clients[role]?.Data.GlickoScore; return !(r > 0) ? '' : r === 1500 ? NO_RANK : division(r).name; };

// Dome positions are counted per cell of a GRID x GRID net laid over the map's own bounds, not kept one by one.
const GRID = 50, mapBounds = mapKey => C.maps[String(mapKey).split('|')[0].toLowerCase()]?.bounds || [0, 0, 1, 1];
const gridCell = (mapKey, x, y) => { const b = mapBounds(mapKey), u = (x - b[0]) / (b[2] - b[0]), v = (y - b[1]) / (b[3] - b[1]);       // 'off': outside the map's bounds, or no position. Counted, not drawn
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? Math.min(GRID - 1, Math.floor(u * GRID)) + '|' + Math.min(GRID - 1, Math.floor(v * GRID)) : 'off'; };

function compute(matches, nested) {
  const S = { matches, total: matches.length, chars: {}, ranks: {}, perks: {}, combos: {}, maps: {}, players: {}, ends: {}, party: {}, even: {}, leavers: {}, lines: {}, triggers: {},
    hw: 0, decided: 0, dur: 0, first: 0, throws: 0, caught: 0, late: 0, leaverMatches: 0, lineCount: 0, lineSecs: 0, bots: {}, side: { hunter: 0, monster: 0 }, dist: {} };
  const newChar = (id, role) => () => ({ id, role, n: 0, w: 0, d: 0, healRecv: 0, shield: 0, deaths: 0, downs: 0, ships: 0, lvl: 0, lvlN: 0,
    feed: 0, firstStage: {}, finalStage: {}, downT: Array(20).fill(0), perks: {}, combos: {}, vs: {}, kits: {}, players: {}, skins: {} });
  // A seat's damage, healing, weapon, ability and skill-point numbers are kept per pile (pileOf): normally its kit, the four
  // weapon names its record carries. A character's own kit is by far the most common pile, and the pages take a character's
  // numbers from that one only (ownNumbers); every seat counts for picks and wins whatever pile it is on.
  const newKit = () => ({ n: 0, dmg: 0, taken: 0, heal: 0, wlTo: 0, wlFrom: 0, st: [0, 1, 2, 3].map(() => ({ n: 0, to: 0, from: 0, wlTo: 0, wlFrom: 0, heal: 0, uses: 0, hits: 0 })),
    items: {}, src: {}, builds: {}, pts: [0, 1, 2].map(() => [0, 0, 0, 0]), lvN: [0, 0, 0] });
  for (const m of matches) {
    const d = m.d, H = d.Hunters || {}, mon = d.Monster || {};
    const decided = m.decided ? 1 : 0;       // a match with no recorded winner is nobody's win and nobody's loss: it stays out of every win rate
    if (m.decided) { S.decided++; S.hw += m.hunterWin; }
    S.dur += m.dur; S.first += d.FirstEncounterTime || 0; S.throws += d.Dome?.Throws || 0; S.caught += d.Dome?.Captures || 0;
    const far = String(mon.TotalDistanceTraveled ?? 'nothing'); S.dist[far] = (S.dist[far] || 0) + 1;       // the Monster's distance travelled, as recorded (About page)
    const mp = cell(S.maps, m.mapKey, () => ({ key: m.mapKey, n: 0, w: 0, d: 0, dur: 0, first: 0, throws: 0, caught: 0, endDome: 0, wlMon: 0, wlHun: 0, ends: {}, grid: {}, inside: {} }));
    mp.n++; mp.w += m.hunterWin; mp.d += decided; mp.dur += m.dur; mp.first += d.FirstEncounterTime || 0; mp.throws += d.Dome?.Throws || 0; mp.caught += d.Dome?.Captures || 0;
    mp.wlMon += d.Wildlife?.DamageToMonster || 0; mp.wlHun += d.Wildlife?.DamageToHunters || 0; mp.endDome += m.domes.some(e => e.Data.GameEnding) ? 1 : 0;
    for (const e of m.domes) for (const r of ROLES) mp.inside[r] = (mp.inside[r] || 0) + (e.Data.InDome?.[r] ? 1 : 0);
    for (const e of m.domes) { const g = cell(mp.grid, gridCell(m.mapKey, e.Data.DomeXPosition, e.Data.DomeYPosition), () => [0, 0, 0, 0, 0, 0, 0]), st = e.Data.MonsterSummary?.Start?.Stage;
      g[0]++; g[1] += e.Data.InDome?.Monster ? 1 : 0; g[2] += e.Data.MonsterSummary?.TotalDamageReceived || 0; g[3] += sumv(e.Data.HunterSummary?.TotalIncaps); if (st >= 1 && st <= 3) g[3 + st]++; }
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
        const pc = cell(pl.chars, id, () => ({ id, n: 0, w: 0, d: 0, dn: 0, dmg: 0, taken: 0, level: null, skins: {} }));
        pc.n++; pc.w += w; pc.d += decided; pc.level ??= cd.CharacterLevel;
        if (ph && !pileOf(m, p).startsWith('!')) { pc.dn++; pc.dmg += ph.DamageToEnemyTeam || 0; pc.taken += ph.DamageFromEnemyTeam || 0; }      // dn: matches whose damage is counted
        pc.skins[cd.CharacterSkin] = (pc.skins[cd.CharacterSkin] || 0) + 1;
        pl.matches.push({ m, role }); pl.secs += rec.BaseHeader.Duration || 0; pl.chat += cd.ChatMessagesSent || 0; pl.late += cd.LateJoiner ? 1 : 0;
        pl.leaves += d.LeaverCounts?.[role] || 0; if (sessionOf(rec)) pl.sessions.add(sessionOf(rec)); S.late += cd.LateJoiner ? 1 : 0;
        pl.level ??= cd.PlayerLevel;                                         // matches are newest first, so the first seen is the latest
        if (isRanked(m)) { const lad = pl.rk[role === 'Monster' ? 'm' : 'h']; lad.n++; lad.w += w; lad.d += decided; if (cd.GlickoScore > 0) { lad.rating ??= cd.GlickoScore; pl.rating ??= cd.GlickoScore; } }
      }
      if (!ph || ph.IsBot) { S.bots[role] = (S.bots[role] || 0) + 1; continue; }   // bots would skew every character number; counted so the pages can say how many were left out
      const cs = cell(S.chars, id, newChar(id, role));
      const kit = cell(cs.kits, pileOf(m, p), newKit); kit.n++;
      cs.n++; cs.w += w; cs.d += decided; kit.dmg += ph.DamageToEnemyTeam || 0; kit.taken += ph.DamageFromEnemyTeam || 0; kit.wlTo += ph.DamageToWildlife || 0; kit.wlFrom += ph.DamageFromWildlife || 0;
      if (ph.CharacterLevel > 0) { cs.lvl += ph.CharacterLevel; cs.lvlN++; }
      const skin = m.clients[role]?.Data.CharacterSkin; if (skin) cs.skins[skin] = (cs.skins[skin] || 0) + 1;
      if (role === 'Monster') {
        cs.feed += mon.Feeding || 0; cs.firstStage[mon.FirstEncounterStage] = (cs.firstStage[mon.FirstEncounterStage] || 0) + 1;
        cs.finalStage[m.hdr.MonsterFinalStage] = (cs.finalStage[m.hdr.MonsterFinalStage] || 0) + 1;
        // skill points: levels[stage - 1][ability - 1] for each stage the Monster reached
        const levels = [1, 2, 3].filter(s => s <= m.hdr.MonsterFinalStage).map(s => [1, 2, 3, 4].map(j => p.Data['Ability' + j]?.['Stage' + s]?.Level ?? 0));
        const b = cell(kit.builds, levels.map(l => l.join('·')).join('  →  '), () => ({ n: 0, w: 0, d: 0, levels })); b.n++; b.w += w; b.d += decided;
        // pts[stage][ability]: skill points put into the ability AT that stage (points held now minus points held the stage before)
        levels.forEach((l, s) => { kit.lvN[s]++; l.forEach((v, j) => { kit.pts[s][j] += v - (s ? levels[s - 1][j] : 0); }); });
      } else {
        cs.healRecv += H.Healing?.Received?.[role] || 0; cs.shield += H.Shielding?.[role] || 0; cs.deaths += H.Deaths?.[role] || 0;
        (H.Incaps?.Class || []).forEach((c, i) => { if (c === role) { cs.downs++; cs.downT[Math.min(19, Math.floor(H.Incaps.Timestamp[i] / 60))]++; } });
        cs.ships += (H.Dropships?.[role] || []).filter(Boolean).length;
      }
      for (let s = 1; s <= 3; s++) { const g = ph['Stage' + s]; if (!g) continue; const st = kit.st[s];
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
      const src = (kind, name, s, v) => { if (!v) return; const x = cell(kit.src, kind + '|' + name, () => ({ kind, name, s: [0, 0, 0, 0] })); x.s[s] += v; x.s[0] += v; };
      for (const [label, s] of Object.entries(p.Data)) {
        if (!s || typeof s !== 'object') continue;
        if (label === 'AppliedHeals') { kit.heal += s.TotalHeals || 0;
          for (let i = 1; i <= 3; i++) for (const h of s['Stage' + i] || []) { src('Healing', h.Name, i, h.HealAmount); kit.st[i].heal += h.HealAmount; } continue; }
        if (!s.TotalDamageDealt && s.TotalDamageDealt !== 0) continue;
        const flat = typeof s.TotalDamageDealt === 'number';                // "other" damage is one number, not a Hunters / wildlife pair
        const it = cell(kit.items, label + '|' + (s.Name ?? label), () => ({ label, key: s.Name ?? label, n: 0, uses: 0, hits: 0, hitsWl: 0, miss: 0, dmg: 0, dmgWl: 0 })), a = s.Aggregate;
        it.n++; it.dmg += flat ? s.TotalDamageDealt : s.TotalDamageDealt.OpposingTeam || 0; it.dmgWl += flat ? 0 : s.TotalDamageDealt.Wildlife || 0;
        if (a) { it.uses += a.Uses || 0; it.hits += a.Hits?.OpposingTeam || 0; it.hitsWl += a.Hits?.Wildlife || 0; it.miss += a.Misses > 2e9 ? 0 : a.Misses || 0; }   // the game's Hunter miss count can wrap around
        for (let i = 1; i <= 3; i++) { const g = s['Stage' + i]; if (!g) continue;
          if (Array.isArray(g)) { for (const e of g) src('Damage', e.Name, i, e.DamageDealt); continue; }
          for (const e of g.OpposingTeamEffects || []) src('Damage', e.Name, i, e.DamageDealt);
          for (const e of g.WildlifeEffects || []) src('Wildlife damage', e.Name, i, e.DamageDealt);
          if (g.OpposingTeam != null) { src('Damage', label, i, g.OpposingTeam); src('Wildlife damage', label, i, g.Wildlife); }
          if (g.Uses != null) { kit.st[i].uses += g.Uses; kit.st[i].hits += g.Hits?.OpposingTeam || 0; } }
      }
    }
  }
  // Ranked matches once more, split by the rank each player held going into the match (rankOf): the same character numbers,
  // one set per division, for the Rank filter on the Characters pages. Each seat is counted on its own, as a match with that
  // one player in it.
  if (!nested) { const seats = {};
    for (const m of matches) if (isRanked(m)) for (const role of ROLES) { const p = m.players[role], k = p && !p.ServerPlayerRoundHeader.IsBot && rankOf(m, role);
      if (k) cell(seats, k, () => []).push({ ...m, players: { [role]: p } }); }
    for (const [k, list] of Object.entries(seats)) S.ranks[k] = compute(list, true).chars; }
  // self-check: shouts in the console if the join above stops adding up
  console.assert(Object.values(S.maps).reduce((a, m) => a + m.n, 0) === matches.length, 'map totals do not add up to the matches');
  console.assert(Object.values(S.players).every(p => p.h.n + p.m.n === p.n && p.w <= p.n), 'player totals are inconsistent');
  return S;
}

/* ---------- account totals ----------
   Everything the Matchmaking, Progression, Store, Community, Fair play and About pages show that does not come from a finished
   match: queue attempts, XP, rewards, challenges, purchases, sign-ins, kicks, and what each player's game says about their account.
   Like compute(), it only counts and sums, so tools/summarize.js works it out a day at a time and adds the days up (summary.js).
   starts: the start records of matches that never sent an end record. */
// Queue times that found a match, counted in 15-second steps up to an hour (the last step: an hour or more). The mean is pulled far
// out by a few attempts left running for hours (a Ranked mean of over 100 hours on 2026-10-18), so the pages show the median.
const QSTEP = 15, QSTEPS = 241, qhist = () => Array(QSTEPS).fill(0), qbin = s => Math.max(0, Math.min(QSTEPS - 1, Math.floor((s || 0) / QSTEP)));
// the median of a queue histogram, in seconds (the middle of its step), or null when it holds nothing
const qmedian = (h, step = QSTEP) => { const n = sumv(h); if (!n) return null; let a = 0; for (let i = 0; i < h.length; i++) if ((a += h[i] || 0) >= n / 2) return (i + .5) * step; return null; };
// the same per hour of the day (UTC), coarser: minutes up to an hour
const HSTEP = 60, HSTEPS = 61, hhist = () => Array(HSTEPS).fill(0), hbin = s => Math.max(0, Math.min(HSTEPS - 1, Math.floor((s || 0) / HSTEP)));
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
    const vs = cell(A.vers, `${b.Context || ver(e)} · build ${build(e)} · ${b.Platform}`, () => ({ n: 0, t: 0 })); vs.n++; vs.t = Math.max(vs.t, t);
    if (kind === 'ServerEACClientKickRecord') { const k = cell(A.kicks, d.code + '|' + d.message, () => ({ n: 0, t: 0 })); k.n++; k.t = Math.max(k.t, t); }
    if (!ch) continue;
    const id = ch.My2kID, p = cell(A.players, id, () => ({ t: 0, since: t, region: '', cregion: '', lang: '', audio: '', founder: null, bal: null, fresh: 0, q: { n: 0, ok: 0, dur: 0, dodges: 0 } }));
    // the day the server filed the record under when the job says so (a player's own clock can be wrong), else the record's own date
    const day = cell(A.daily, filedDay || (isNaN(t) ? 'unknown' : new Date(t).toISOString().slice(0, 10)), () => ({ signins: 0, ids: new Set() }));
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
      const q = cell(A.mm, [ver(e), d.GameMode, d.MatchType === 'Ranked' ? 'R' : 'N'].join('|'), () => ({ n: 0, ok: 0, dur: 0, dodges: 0, team: {}, type: {}, hourN: Array(24).fill(0), hourDur: Array(24).fill(0), hist: qhist(), hourHist: Array.from({ length: 24 }, hhist), stages: {}, reasons: {} }));
      q.n++; q.dodges += d.QueueDodger ? 1 : 0; p.q.n++; p.q.dodges += d.QueueDodger ? 1 : 0;
      if (ok) { q.ok++; q.dur += dur; q.hourN[h]++; q.hourDur[h] += dur; q.hist[qbin(dur)]++; q.hourHist[h][hbin(dur)]++; p.q.ok++; p.q.dur += dur;
        for (const [o, k] of [[q.team, d.PlayerTeam], [q.type, d.MatchType]]) { const x = cell(o, k, () => ({ n: 0, dur: 0, hist: qhist() })); x.n++; x.dur += dur; x.hist[qbin(dur)]++; } }
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
return { OFFICIAL, RAW, counted, EVENTS, LEFT_OUT, LEFT_BY, ROLES, HUNTERS, sumv, cell, nw, T, sessionOf, build, PATCH_OF, ver, ITEMS, charInfo, perkBase, perkLevel, division, byId, slot, SLOT_TYPE, SLOT_ORDER, kitOf, AFTER_UNFINISHED, IMPOSSIBLE, amounts, pileOf, slotItem, learnItems, ingest, toMatch, MATCHES, UNFINISHED, MATCH, won, pid, isRanked, NO_RANK, rankOf, GRID, mapBounds, gridCell, compute, QSTEP, QSTEPS, qhist, qbin, qmedian, HSTEP, HSTEPS, hhist, hbin, account, ledger };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { makeCounter }; else root.makeCounter = makeCounter;
})(typeof window !== 'undefined' ? window : globalThis);
