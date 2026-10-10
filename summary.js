/* How two sets of the site's totals are added together. Shared by the summary job (tools/summarize.js, under Node) and,
   later, by the page. The totals are what compute() in app.js returns; almost everything in them is a count or a sum, so
   totals for separate groups of matches (one day, one filter combination) can be worked out apart and added up afterwards.
   The exceptions are named here. tools/summarize.js --check proves that adding parts gives the same as counting everything at once. */
(function (root) {
  const LATEST = new Set(['level', 'rating']);      // not sums: the newest value wins, decided by the owning player's `t` (time of their newest match)
  const KEEP = new Set(['levels', 'keys']);         // part of what an entry is (a build's skill points, a combination's perks): identical on both sides
  const CONCAT = new Set(['domes']);                // ponytail: every dome position is kept; bin them into a grid when the list gets heavy
  const UNION = new Set(['sessions', 'vars']);      // sets of distinct things, stored as lists

  const clone = v => v == null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v));

  // add b into a (a is changed and returned). bNewer: b's owner holds the more recent data.
  function add(a, b, key, bNewer) {
    if (b == null) return a;
    if (a == null) return clone(b);
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (KEEP.has(key)) return a;
      if (CONCAT.has(key)) return a.concat(clone(b));
      if (UNION.has(key)) return [...new Set(a.concat(b))];
      const out = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) out[i] = add(a[i], b[i], key + '[]', bNewer);
      return out;
    }
    if (typeof a === 'object' && typeof b === 'object') {
      if (typeof a.t === 'number' || typeof b.t === 'number') bNewer = (b.t || 0) > (a.t || 0);
      for (const k of Object.keys(b)) {
        if (k === 't') a.t = Math.max(a.t || 0, b.t || 0);
        else if (LATEST.has(k)) a[k] = bNewer ? (b[k] ?? a[k]) : (a[k] ?? b[k]);
        else a[k] = k in a ? add(a[k], b[k], k, bNewer) : clone(b[k]);
      }
      return a;
    }
    return a;       // text and yes/no values are the same on both sides
  }
  const merge = parts => parts.reduce((acc, p) => add(acc, p, '', false), null);

  // compute()'s result as plain data: sets become lists, and the match objects themselves are left out (kept as a count, and
  // per player as the time of their newest match, which is what "newest value wins" goes by).
  function plain(S) {
    // (a Set made inside the job's sandbox is not an "instanceof Set" out here, so sets are recognised by their tag)
    const out = JSON.parse(JSON.stringify(S, (k, v) => k === 'matches' ? undefined : Object.prototype.toString.call(v) === '[object Set]' ? [...v] : v));
    out.total = S.matches.length;
    for (const [id, p] of Object.entries(S.players || {})) out.players[id].t = Math.max(0, ...(p.matches || []).map(x => x.m.t));
    return out;
  }

  const api = { add, merge, plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SUMMARY = api;
})(typeof window !== 'undefined' ? window : globalThis);
