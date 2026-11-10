/* Business Pulse front end. One file, no dependencies, works from file://.
   Private competitor tool built around JD Meyers Productions. Reads the same data files the
   daily build already writes: data/data.js (window.PULSE_DATA), details-enrichment.js,
   website-intel.js, venues.js. Every verdict on the Council, Auditor and Home pages is
   computed here from those files. Nothing is typed in by hand, so it cannot go stale on its own.
   Every number is shown with where it came from and when it was checked. */
(function () {
'use strict';

/* ---------- data ---------- */
const D = Object.assign({ competitors: [], excluded: [], connections: [], igFollowersHistory: {}, igActivity: [], webSweepHistory: [],
  aiChecks: [], aiPrompts: { prompts: [] }, seedDates: {}, seedMeta: {}, freshness: { sources: [] }, pricingGaps: {}, trendPoints: [] }, window.PULSE_DATA || {});
const DET = window.PULSE_DETAILS || {};
const WI = (window.PULSE_WEBSITE_INTEL || {}).intel || {};
const JD_ID = 'jd-meyers-productions';

/* ---------- helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMO = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const clean = s => String(s == null ? '' : s).replace(EMO, '').replace(/\s+/g, ' ').trim();
const DAY = 864e5;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dn = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null; };
function etToday() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
const QS = new URLSearchParams(location.search);
const ASOF_S = /^\d{4}-\d{2}-\d{2}$/.test(QS.get('asof') || '') ? QS.get('asof') : etToday();
const ASOF = dn(ASOF_S);
const dshort = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : ''; };
const age = s => { const n = dn(s); return n == null ? null : ASOF - n; };
const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
const money = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const signed = n => n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const plural = (n, a, b) => n === 1 ? a : (b || a + 's');
const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const maxDate = arr => arr.reduce((m, x) => x && (!m || x > m) ? x : m, null);
const minDate = arr => arr.reduce((m, x) => x && (!m || x < m) ? x : m, null);
const when = d => d ? 'checked ' + dshort(d) : 'no check date';

/* ---------- freshness windows (from data/data.js, written by the daily build) ---------- */
const SRC = {}; (D.freshness.sources || []).forEach(s => SRC[s.id] = s);
function stat(id, a) {
  const s = SRC[id]; if (!s || a == null) return 'none';
  if (a >= s.stalled_after_days) return 'stalled';
  if (a > s.late_after_days) return 'late';
  return 'ok';
}
const PRICE_DAYS = (SRC.pricing && SRC.pricing.late_after_days) || 45;

/* ---------- instagram ---------- */
const ROWS = {};
D.igActivity.forEach(r => (ROWS[r.handle] = ROWS[r.handle] || []).push(r));
Object.keys(ROWS).forEach(h => ROWS[h].sort((a, b) => a.date < b.date ? -1 : 1));
const CARRIED = /pull failed|carried|not pulled/i;
function igState(h) {
  const rows = h && ROWS[h]; if (!rows) return { state: 'none' };
  const live = rows.filter(r => !CARRIED.test(r.activity || '') && r.followers != null);
  const last = live[live.length - 1]; if (!last) return { state: 'none' };
  const a = age(last.date);
  return { state: a <= (SRC.ig ? SRC.ig.late_after_days : 2) ? 'live' : 'late', count: last.followers, date: last.date, age: a };
}
function deltaN(h, days) {
  const hs = D.igFollowersHistory[h]; if (!hs || hs.length < 2) return null;
  const last = hs[hs.length - 1], t = dn(last.date) - days; let base = null;
  hs.forEach(e => { if (dn(e.date) <= t) base = e; });
  return base ? last.count - base.count : null;
}

/* ---------- pricing text to numbers (lowest listed price per line of work) ---------- */
const P_SKIP = /deposit|retainer|booth|print|travel|second[- ]?shooter|disk|usb|add-?on|extra|album|mini/i;
const AMT = /\$\s?(\d[\d,]*(?:\.\d+)?)/;
function parsePrice(txt) {
  const out = { wed: null, wedv: null, sess: null };
  if (!txt) return out;
  const w = [], wv = [], s = [];
  String(txt).split(/;|\||,(?!\d{3})/).forEach(cl => {
    const c = cl.toLowerCase(); if (P_SKIP.test(c)) return;
    const m = AMT.exec(cl); if (!m) return;
    const a = parseFloat(m[1].replace(/,/g, '')); if (a < 50) return;
    if (/\/\s?(hr|hour)|per hour|hourly/.test(c)) return;
    if (/wedding|bridal/.test(c)) { if (a >= 500) { if (/video|film|cinema/.test(c)) wv.push(a); else w.push(a); } }
    else if (/elopement/.test(c)) return;
    else if (/portrait|session|senior|family|families|headshot|maternity|newborn|couple/.test(c) && !/video|film|drone|real estate/.test(c)) s.push(a);
  });
  out.wed = w.length ? Math.min.apply(null, w) : null;
  out.wedv = wv.length ? Math.min.apply(null, wv) : null;
  out.sess = s.length ? Math.min.apply(null, s) : null;
  return out;
}

/* ---------- lanes ---------- */
const LANES = [['wed', 'Wedding'], ['port', 'Portrait'], ['vid', 'Video'], ['re', 'Real estate'], ['dr', 'Drone'], ['com', 'Commercial']];
const LANE_NAME = {}; LANES.forEach(l => LANE_NAME[l[0]] = l[1]);
function lanesOf(c) {
  const det = DET[c.id] || {}, wi = WI[c.id] || {};
  const t = [(c.services || []).join(' '), (det.services || []).join(' '), (wi.services || []).join(' '), c.pricing || ''].join(' ').toLowerCase();
  const L = [];
  if (/wedding|elopement|bridal/.test(t)) L.push('wed');
  if (/portrait|family|families|senior|headshot|maternity|newborn|couple|session/.test(t)) L.push('port');
  if (c.specialty === 'video' || c.specialty === 'both' || /video|film|cinema/.test(t)) L.push('vid');
  if (/real estate|realty|listing|property|mls/.test(t)) L.push('re');
  if (c.specialty === 'drone' || /drone|aerial|fpv/.test(t)) L.push('dr');
  if (/commercial|brand|corporate|product|marketing|promo/.test(t)) L.push('com');
  return L;
}
const PLAT = { google: 'Google', facebook: 'Facebook', weddingwire: 'WeddingWire', theknot: 'The Knot', zola: 'Zola' };
const platName = p => PLAT[p] || p;
const REGION = { slc: 'St. Lawrence County', adjacent: 'Adjacent county', unconfirmed: 'Unconfirmed' };

/* ---------- the business model: one row per business, with source and date on every figure ---------- */
const SD = D.seedDates || {};
const PER_P = (SD.pricing && SD.pricing.per) || {};
const PER_R = (SD.reviews && SD.reviews.per) || {};
const B = D.competitors.map(c => {
  const ig = igState(c.ig_handle);
  const hasIg = ig.state !== 'none';
  const pdate = PER_P[c.id] || null, rdate = PER_R[c.id] || null;
  const price = parsePrice(c.pricing);
  const pfresh = !!(c.pricing && pdate && age(pdate) <= PRICE_DAYS);
  const det = DET[c.id] || {}, wi = WI[c.id] || {};
  return {
    c, id: c.id, name: clean(c.name), town: c.town || '', region: c.region || 'unconfirmed', lanes: lanesOf(c), det, wi,
    ig, d7: hasIg ? deltaN(c.ig_handle, 7) : null, d30: hasIg ? deltaN(c.ig_handle, 30) : null,
    price, pdate, pfresh, rdate,
    rev: c.review_count, rating: c.review_rating, revSrc: c.review_source,
    founded: c.est_year || det.since || null
  };
});
const BY = {}; B.forEach(b => BY[b.id] = b);
const JD = BY[JD_ID] || B[0];

/* ---------- AI answers ---------- */
const ACTIVE = (D.aiPrompts.prompts || []).filter(p => !p.retired);
const ACTIVE_IDS = new Set(ACTIVE.map(p => p.id));
const PTEXT = {}; (D.aiPrompts.prompts || []).forEach(p => PTEXT[p.id] = p.text);
const STOP = new Set(['photography', 'photographer', 'photographers', 'photo', 'photos', 'llc', 'inc', 'studio', 'studios', 'media', 'films', 'film', 'video', 'videography', 'productions', 'production', 'services', 'the', 'and', 'co', 'company', 'by']);
const flat = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const stripped = s => flat(s).split(' ').filter(w => !STOP.has(w)).join(' ');
const NAMEMAP = {};
(function () {
  const cnt = {};
  B.forEach(b => { const k = stripped(b.name); if (k) cnt[k] = (cnt[k] || 0) + 1; });
  B.forEach(b => { NAMEMAP[flat(b.name)] = b.id; const k = stripped(b.name); if (k && cnt[k] === 1) NAMEMAP[k] = b.id; });
})();
function matchName(n) { const f = flat(n); if (NAMEMAP[f]) return NAMEMAP[f]; const s = stripped(n); return s && NAMEMAP[s] ? NAMEMAP[s] : null; }
const ENGINES = ['ChatGPT', 'Gemini'];
const AIROWS = (D.aiChecks || []).filter(r => ACTIVE_IDS.has(r.prompt_id));
const AI = {};
ENGINES.forEach(e => {
  const rows = AIROWS.filter(r => r.engine === e);
  const dates = Array.from(new Set(rows.map(r => r.date))).sort();
  AI[e] = { dates, rows, last: dates[dates.length - 1] || null, prev: dates[dates.length - 2] || null };
});
function aiRun(e, date) {
  const out = { den: 0, ids: {}, off: {}, rows: [] };
  if (!date) return out;
  AI[e].rows.filter(r => r.date === date && r.completed).forEach(r => {
    out.den++; out.rows.push(r);
    const seen = new Set();
    (r.named || []).forEach(n => {
      const id = matchName(n);
      if (id) { if (!seen.has(id)) { seen.add(id); out.ids[id] = (out.ids[id] || 0) + 1; } }
      else if (!/[$()\[\];,]/.test(n)) { const k = flat(n); (out.off[k] = out.off[k] || { name: clean(n), n: 0 }).n++; }
    });
  });
  return out;
}
ENGINES.forEach(e => { AI[e].cur = aiRun(e, AI[e].last); AI[e].prv = aiRun(e, AI[e].prev); });
const aiNamed = (b, e) => AI[e].cur.den ? (AI[e].cur.ids[b.id] || 0) : null;
const aiTotal = b => ENGINES.reduce((s, e) => s + (aiNamed(b, e) || 0), 0);

/* ---------- peer sets and standing ---------- */
const SETS = {
  slcwed: { label: 'St. Lawrence County wedding businesses', f: b => b.region === 'slc' && b.lanes.indexOf('wed') >= 0 },
  slc: { label: 'St. Lawrence County, all services', f: b => b.region === 'slc' },
  wed: { label: 'Wedding businesses, whole market', f: b => b.lanes.indexOf('wed') >= 0 },
  all: { label: 'Everyone on the roster', f: () => true }
};
const METRICS = {
  wed: { label: 'Wedding photography, from', val: b => b.pfresh ? b.price.wed : null, f: money, dir: 'asc', log: false },
  wedv: { label: 'Wedding video, from', val: b => b.pfresh ? b.price.wedv : null, f: money, dir: 'asc', log: false },
  sess: { label: 'Session, from', val: b => b.pfresh ? b.price.sess : null, f: money, dir: 'asc', log: false },
  rev: { label: 'Reviews', val: b => b.rev, f: fmt, dir: 'desc', log: true },
  fol: { label: 'Instagram followers', val: b => b.ig.state === 'live' ? b.ig.count : null, f: fmt, dir: 'desc', log: true }
};
function stand(mk, setKey) {
  const M = METRICS[mk], S = SETS[setKey];
  const arr = B.filter(b => b === JD || S.f(b)).map(b => ({ b, v: M.val(b) })).filter(x => x.v != null);
  const me = arr.find(x => x.b === JD);
  const peers = arr.filter(x => x.b !== JD).map(x => x.v);
  const res = { n: arr.length, me: me ? me.v : null, peers, med: peers.length >= 8 ? median(peers) : null, min: null, max: null, rank: null };
  const all = arr.map(x => x.v);
  if (all.length) { res.min = Math.min.apply(null, all); res.max = Math.max.apply(null, all); }
  if (me) res.rank = 1 + peers.filter(v => M.dir === 'asc' ? v < me.v : v > me.v).length;
  return res;
}
function rankText(mk, st) {
  if (st.rank == null) return 'No current figure for JD Meyers Productions';
  if (st.n < 2) return 'No peers with a current figure';
  const asc = METRICS[mk].dir === 'asc';
  return (st.rank === 1 ? (asc ? 'Lowest' : 'Highest') : ord(st.rank) + (asc ? ' lowest' : ' highest')) + ' of ' + st.n;
}
function strip(st, mk) {
  const M = METRICS[mk];
  if (st.n < 3 || st.me == null) return '<div class="strip"></div>';
  const f = v => M.log ? Math.log10(Math.max(v, 1)) : v;
  const mn = f(st.min), mx = f(st.max), pos = v => mx === mn ? 50 : ((f(v) - mn) / (mx - mn)) * 100;
  return '<div class="strip">' + st.peers.map(v => '<i style="left:' + pos(v).toFixed(1) + '%"></i>').join('') + '<b style="left:' + pos(st.me).toFixed(1) + '%"></b></div>' +
    '<div class="strip-l"><span>' + esc(M.f(st.min)) + '</span><span>' + esc(M.f(st.max)) + '</span></div>';
}

/* ---------- web sweep ---------- */
const SW = D.webSweepHistory.slice().sort((a, b) => a.date < b.date ? -1 : 1);
function sweepInfo(w) {
  if (!w) return null;
  const pages = w.pages || {}, ks = Object.keys(pages);
  let ch = 0, un = 0;
  ks.forEach(k => { const s = (pages[k].status || '').toLowerCase(); if (s === 'changed') ch++; else if (s === 'unreachable') un++; });
  return { date: w.date, label: w.run_label, of: w.of_total != null ? w.of_total : ks.length, fetched: w.fetched != null ? w.fetched : ks.length - un, ch, un, n: ks.length };
}

/* ---------- source freshness ---------- */
const lastSweep = SW.filter(w => w.fetched != null).pop();
const pDates = B.filter(b => b.pfresh || (b.c.pricing && b.pdate)).map(b => b.pdate);
const rDates = B.filter(b => b.rdate).map(b => b.rdate);
const revNoDate = B.filter(b => b.rev != null && !b.rdate).length, revAll = B.filter(b => b.rev != null).length;
const priceNoDate = B.filter(b => b.c.pricing && !b.pdate).length, priceAll = B.filter(b => b.c.pricing).length;
const igTracked = new Set(D.igActivity.map(r => r.handle)).size, igHandles = B.filter(b => b.c.ig_handle).length;
const SOURCES = [
  { id: 'ig', label: 'Instagram followers', date: maxDate(D.igActivity.map(r => r.date)), cover: igTracked + ' of ' + igHandles + ' roster handles pulled daily' },
  { id: 'ai', label: 'AI assistant answers', date: minDate(ENGINES.map(e => AI[e].last)), cover: ENGINES.map(e => e + ' ' + AI[e].cur.den + ' of ' + ACTIVE.length + ' prompts').join(', ') },
  { id: 'web', label: 'Website watch', date: lastSweep && lastSweep.date, cover: lastSweep ? sweepInfo(lastSweep).n + ' of ' + B.length + ' sites in the last run' : 'no runs' },
  { id: 'reviews', label: 'Reviews', date: minDate(rDates), cover: (revAll - revNoDate) + ' of ' + revAll + ' counts have their own check date (oldest date shown)' },
  { id: 'pricing', label: 'Pricing', date: minDate(pDates), cover: (priceAll - priceNoDate) + ' of ' + priceAll + ' price lists have their own check date (oldest date shown)' },
  { id: 'roster', label: 'Daily build', date: (D.builtAt || '').slice(0, 10), cover: B.length + ' businesses on the roster' }
].map(s => { const a = age(s.date); return Object.assign({}, s, { age: a, st: stat(s.id, a), win: SRC[s.id] }); });

/* ---------- the Auditor: checks that trace a figure back to where it came from ---------- */
function runAudit() {
  const F = [];
  const add = (sev, id, title, text, chain) => F.push({ sev, id, title, text, chain });
  // 1. review counts without their own check date
  if (revNoDate) add('high', 'rev-undated', revNoDate + ' of ' + revAll + ' review counts have no check date of their own',
    'The roster file stores a review count for these businesses but no record of when someone last looked at the listing. Showing them as current would borrow the date of the last batch update.',
    'data.js competitors[].review_count -> seedDates.reviews.per[id] missing');
  const mixed = B.filter(b => b.rev != null && b.revSrc && b.revSrc !== 'google');
  if (mixed.length) add('med', 'rev-mixed', mixed.length + ' review counts come from a platform other than Google',
    mixed.map(b => b.name + ' (' + platName(b.revSrc) + ')').join(', ') + '. Adding these to Google counts mixes different things.', 'competitors[].review_source');
  // 2. pricing without a date
  if (priceNoDate) add('high', 'price-undated', priceNoDate + ' of ' + priceAll + ' price lists have no verification date',
    'These are left out of every price comparison. Names: ' + B.filter(b => b.c.pricing && !b.pdate).slice(0, 8).map(b => b.name).join(', ') + (priceNoDate > 8 ? ', and ' + (priceNoDate - 8) + ' more' : '') + '.',
    'competitors[].pricing -> seedDates.pricing.per[id] missing');
  const oldP = B.filter(b => b.c.pricing && b.pdate && age(b.pdate) > PRICE_DAYS);
  if (oldP.length) add('med', 'price-old', oldP.length + ' price lists are older than ' + PRICE_DAYS + ' days', oldP.map(b => b.name + ' (' + dshort(b.pdate) + ')').join(', '), 'seedDates.pricing.per');
  // 3. discovery dates used as business facts
  const byDisc = {};
  D.competitors.forEach(c => { if (c.discovered_date) (byDisc[c.discovered_date] = byDisc[c.discovered_date] || []).push(c); });
  Object.keys(byDisc).forEach(d => { if (byDisc[d].length >= 5) add('med', 'disc-' + d, byDisc[d].length + ' businesses share the discovery date ' + dshort(d),
    'That is the day the roster was filled in, not the day these businesses started. A discovery date must never be read as a start date or a "new business" signal.', 'competitors[].discovered_date = ' + d); });
  // 4. founding years that are guesses, and recent ones to verify
  const guess = B.filter(b => b.det.since && /infer|impl|~|about|approx/i.test(String(b.det.since) + ' ' + String(b.det.years_in_business || '')));
  if (guess.length) add('med', 'since-guess', guess.length + ' founding years are guesses stored as facts',
    guess.map(b => b.name + ': ' + String(b.det.since).slice(0, 60)).join('; '), 'details-enrichment.js[id].since');
  const recent = B.filter(b => b.id !== JD_ID && b.founded && +b.founded >= +ASOF_S.slice(0, 4) - 2);
  if (recent.length) add('low', 'recent-founding', recent.length + ' recent founding years to check against a primary source',
    recent.map(b => b.name + ' (' + b.founded + ')').join(', ') + '. Check state business records, the earliest Google review and the earliest Instagram post. Each one only sets a floor.', 'est_year / details.since');
  // 5. JD row: conflicting founding years
  if (JD.det.since && JD.c.est_year && String(JD.det.since) !== String(JD.c.est_year)) add('high', 'jd-founded', 'JD Meyers Productions has two founding years: ' + JD.c.est_year + ' and ' + JD.det.since,
    'The business started in 2016. 2018 is the year the DBA was registered. One field needs to change.', 'competitors[jd].est_year vs details-enrichment.js[jd].since');
  // 6. circular sourcing
  const ai = D.competitors.filter(c => c.source_label === 'AI audit');
  if (ai.length) add('med', 'circular-ai', ai.length + ' roster businesses were found through AI answers',
    'The AI Visibility page measures who the assistants name. Businesses that entered the roster because an assistant named them are guaranteed to be named at least once. Read their numbers with that in mind: ' + ai.map(c => clean(c.name)).join(', ') + '.',
    'competitors[].source_label = "AI audit"');
  // 7. website watch
  const infos = SW.map(sweepInfo).filter(Boolean);
  const everChanged = infos.reduce((s, i) => s + i.ch, 0);
  if (infos.length >= 5 && everChanged === 0) add('high', 'sweep-blind', 'The website watch has never recorded a change in ' + infos.length + ' runs',
    'Either no competitor changed anything or the check cannot see changes.' + (infos.some(i => i.n >= 5 && i.un === i.n) ? ' Some runs logged every page as unreachable, which points to the checker failing, not the websites.' : ''), 'webSweepHistory[].pages[].status');
  const allDown = infos.filter(i => i.n >= 5 && i.un === i.n);
  if (allDown.length) add('med', 'sweep-failed', allDown.length + ' sweep runs logged every page as unreachable', allDown.map(i => dshort(i.date)).join(', ') + '. That is a collection failure being recorded as a property of the websites.', 'webSweepHistory[].pages[].status = unreachable');
  if (lastSweep) { const i = sweepInfo(lastSweep); if (i.n < B.length / 2) add('med', 'sweep-cover', 'The last website check covered ' + i.n + ' of ' + B.length + ' businesses', 'Prices can change at the other ' + (B.length - i.n) + ' without this tool seeing it.', 'webSweepHistory[last]'); }
  // 8. partial snapshots
  const tp = D.trendPoints || [], full = Math.max.apply(null, tp.map(t => t.igLive || 0).concat([0]));
  const part = tp.filter(t => t.igLive != null && t.igLive < full);
  if (part.length) add('med', 'partial-snap', part.length + ' daily follower totals were taken with fewer accounts than usual',
    part.map(t => dshort(t.date) + ' (' + t.igLive + ' of ' + full + ' accounts, total ' + fmt(t.igTotal) + ')').join('; ') + '. Any change computed against these days is wrong.', 'trendPoints[].igLive');
  // 9. frozen instagram counts
  const frozen = Object.keys(D.igFollowersHistory).filter(h => { const v = D.igFollowersHistory[h]; return v.length >= 30 && new Set(v.map(e => e.count)).size === 1; });
  if (frozen.length) add('low', 'ig-flat', frozen.length + ' Instagram accounts show an identical count for 30+ days', frozen.map(h => '@' + h + ' (' + D.igFollowersHistory[h][0].count + ')').join(', ') + '. May be real. Looks the same as a carried-forward number.', 'igFollowersHistory');
  const carried = D.igActivity.filter(r => CARRIED.test(r.activity || '')).length;
  if (carried) add('low', 'ig-carried', carried + ' Instagram rows are carried-forward numbers',
    'They are kept in the same field as real pulls and told apart only by the wording of a note. This tool ignores them for follower counts.', 'igActivity[].activity matches "carried"');
  // 10. descriptive fields have no dates
  const wiAges = Object.keys(WI).map(k => WI[k].fetched ? Math.round((ASOF - Date.parse(WI[k].fetched + ' UTC') / DAY)) : null).filter(x => x != null && !isNaN(x));
  if (wiAges.length && Math.max.apply(null, wiAges) > 30) add('low', 'intel-old', 'Website intel is ' + Math.min.apply(null, wiAges) + ' to ' + Math.max.apply(null, wiAges) + ' days old',
    'Services, coverage areas and founding years come from pages read once in late September. Descriptions in details-enrichment.js carry no date at all.', 'website-intel.js[id].fetched');
  // 11. price lines that mix products
  const elop = B.filter(b => b.c.pricing && /elopement/i.test(b.c.pricing)).length;
  if (elop) add('low', 'price-mix', elop + ' price lists mention elopement packages',
    'Elopement lines are skipped when this tool picks the wedding price, so those businesses show their full-wedding price only if they list one.', 'competitors[].pricing');
  const order = { high: 0, med: 1, low: 2 };
  return F.sort((a, b) => order[a.sev] - order[b.sev]);
}
const FINDINGS = runAudit();

/* ---------- the Council: short, dated verdicts computed from the data ---------- */
function peerTxt(mk, key) {
  const st = stand(mk, key), M = METRICS[mk];
  if (st.me == null) return null;
  return { st, text: M.label + ': ' + M.f(st.me) + ', ' + rankText(mk, st).toLowerCase() + (st.med != null ? ', peer median ' + M.f(st.med) : st.n > 1 ? ', range ' + M.f(st.min) + ' to ' + M.f(st.max) : '') };
}
function recommendations() {
  const R = [], key = 'slcwed';
  const wed = stand('wed', key);
  if (wed.me != null && wed.n >= 5) {
    const pos = wed.med != null ? (wed.me > wed.med ? 'above' : wed.me < wed.med ? 'below' : 'at') + ' the peer median of ' + money(wed.med) : 'ranked ' + rankText('wed', wed).toLowerCase();
    R.push({ t: 'Check your entry wedding price against local peers',
      p: 'Your Essential wedding photography price of ' + money(wed.me) + ' is ' + pos + ' (' + SETS[key].label + ' with a verified price: ' + wed.n + ', range ' + money(wed.min) + ' to ' + money(wed.max) + '). Decide on purpose: hold it and sell on proof, or test a different entry price.',
      w: 'Would be wrong if: your booked weddings over the next 8 weeks do not change either way. Inquiry and booking counts are not connected to this tool yet, so you will need to count them yourself.' });
  }
  const rev = stand('rev', key);
  if (rev.me != null && rev.med != null && rev.me < rev.med) {
    const need = Math.ceil(rev.med - rev.me);
    R.push({ t: 'Close the review gap with a direct ask',
      p: 'You have ' + fmt(rev.me) + ' reviews against a peer median of ' + fmt(rev.med) + ' (' + rankText('rev', rev).toLowerCase() + '). That is ' + need + ' more to reach the median. Ask your most recent clients, in the delivery email, for a Google review.',
      w: 'Would be wrong if: the peer median moves up faster than you can close it. Review counts are not tracked over time here, so re-read the listings each month.' });
  }
  const miss = [];
  ACTIVE.forEach(p => {
    const hit = ENGINES.some(e => AI[e].cur.rows.some(r => r.prompt_id === p.id && (r.named || []).some(n => matchName(n) === JD.id)));
    const asked = ENGINES.some(e => AI[e].cur.rows.some(r => r.prompt_id === p.id));
    if (asked && !hit) miss.push(p.text);
  });
  if (miss.length) R.push({ t: 'Show up for the searches that do not name you',
    p: 'In the latest audit, neither assistant named you for ' + miss.length + ' of ' + ACTIVE.length + ' prompts: ' + miss.slice(0, 4).map(m => '"' + m + '"').join(', ') + (miss.length > 4 ? ', and ' + (miss.length - 4) + ' more' : '') + '. Put plain pages or Google Business posts on your site that answer those exact questions.',
    w: 'Would be wrong if: you are named for these prompts in two audits in a row without any change on your side. One signed-out session is directional only.' });
  const fol = stand('fol', 'all');
  const jd30 = JD.d30, peer30 = B.filter(b => b !== JD && b.ig.state === 'live' && b.d30 != null).map(b => b.d30);
  if (jd30 != null && peer30.length >= 8 && jd30 < median(peer30)) R.push({ t: 'Post more where you are falling behind on Instagram',
    p: 'You gained ' + signed(jd30) + ' followers in 30 days. The median for ' + peer30.length + ' tracked accounts is ' + signed(median(peer30)) + '. Instagram is a small part of how wedding clients find you, so treat this as a low-priority fix.',
    w: 'Would be wrong if: your inquiries do not follow follower growth. Compare at the end of the month.' });
  const hi = FINDINGS.filter(f => f.sev === 'high').length;
  if (hi) R.push({ t: 'Fix ' + hi + ' data ' + plural(hi, 'problem') + ' before leaning on the numbers',
    p: 'The Auditor found ' + hi + ' high-severity ' + plural(hi, 'problem') + '. They affect review comparisons, price comparisons and the website watch. See the Auditor page.', w: 'Done when: the Auditor shows no high-severity findings.' });
  return R;
}
const RECS = recommendations();

/* ---------- views ---------- */
const stage = $('#stage');
const state = { q: '', lane: 'all', region: 'all', sort: { k: 'fol', dir: -1 }, set: 'slcwed', vs: null, aiOpen: {} };
const lanePills = b => b.lanes.slice(0, 3).map(l => '<span class="pill">' + LANE_NAME[l] + '</span>').join('') + (b.lanes.length > 3 ? '<span class="pill">+' + (b.lanes.length - 3) + '</span>' : '');
const ago = d => d ? dshort(d) + (age(d) > 0 ? ' (' + age(d) + 'd ago)' : ' (today)') : 'no date';

function tile(mk, key) {
  const st = stand(mk, key), M = METRICS[mk];
  const src = mk === 'fol' ? (JD.ig.state === 'none' ? '' : 'Instagram, ' + dshort(JD.ig.date)) : mk === 'rev' ? 'Google, ' + when(JD.rdate) : 'jdmeyersjr.com, ' + when(JD.pdate);
  return '<div class="card tile hov"><div class="k">' + esc(M.label) + '</div>' +
    '<div class="n">' + (st.me != null ? esc(M.f(st.me)) : '—') + '</div>' +
    '<div class="d">' + esc(rankText(mk, st)) + (st.med != null ? '<br>Peer median ' + esc(M.f(st.med)) : st.n > 1 && st.n < 8 ? '<br>Too few peers for a median (' + (st.n - 1) + ')' : '') + '</div>' +
    strip(st, mk) + '<div class="src">' + esc(src) + '</div></div>';
}
function aiTile(e) {
  const A = AI[e], n = A.cur.ids[JD.id] || 0, p = A.prv.ids[JD.id];
  const ch = A.prev && A.prv.den ? (n - (p || 0)) : null;
  return '<div class="card tile hov"><div class="k">Named by ' + e + '</div><div class="n">' + n + '<small>of ' + A.cur.den + ' prompts</small></div>' +
    '<div class="d">' + (ch == null ? 'No earlier audit to compare' : ch === 0 ? 'Same as ' + dshort(A.prev) : (ch > 0 ? 'Up ' : 'Down ') + Math.abs(ch) + ' since ' + dshort(A.prev)) + '</div>' +
    '<div class="src">Signed-out chat, ' + dshort(A.last) + ', directional</div></div>';
}
function viewHome() {
  const key = state.set;
  const movers = B.filter(b => b !== JD && b.ig.state === 'live' && b.d7 != null).sort((a, b) => Math.abs(b.d7) - Math.abs(a.d7)).slice(0, 4);
  const jdAi = ENGINES.map(e => ({ e, n: AI[e].cur.ids[JD.id] || 0, p: AI[e].prev ? (AI[e].prv.ids[JD.id] || 0) : null, den: AI[e].cur.den })).filter(x => x.den);
  const si = lastSweep ? sweepInfo(lastSweep) : null;
  const late = SOURCES.filter(s => s.st !== 'ok');
  const changed = [];
  if (JD.d7 != null) changed.push(['Your Instagram', 'followers, last 7 days', signed(JD.d7)]);
  movers.forEach(b => changed.push([b.name, 'followers, last 7 days', signed(b.d7)]));
  jdAi.forEach(x => changed.push(['AI answers, ' + x.e, x.p == null ? 'you were named in ' + x.n + ' of ' + x.den : 'named in ' + x.n + ' of ' + x.den + ', was ' + x.p, x.p == null ? '' : signed(x.n - x.p)]));
  if (si) changed.push(['Website watch', si.fetched + ' of ' + B.length + ' sites checked ' + dshort(si.date) + (si.ch ? '' : ', no price or offer changes recorded'), si.ch ? si.ch + ' changed' : 'none']);
  return '<div class="view"><div class="page-h"><div><h1>Where you stand</h1><p class="sub">JD Meyers Productions against <select class="sel" id="setsel" style="margin:0 2px">' + Object.keys(SETS).map(k => '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + esc(SETS[k].label) + '</option>').join('') + '</select> as of ' + dshort(ASOF_S) + '.</p></div></div>' +
    '<div class="tiles">' + tile('wed', key) + tile('wedv', key) + tile('sess', key) + tile('rev', key) + tile('fol', 'all') + ENGINES.filter(e => AI[e].cur.den).map(aiTile).join('') + '</div>' +
    '<p class="note">Prices are the lowest listed price on each business\'s own site, counted only when checked in the last ' + PRICE_DAYS + ' days. Followers compare against every tracked account. Medians show only with 8 or more peers.</p>' +
    '<div class="cols"><div><h2>What changed</h2><div class="card"><div class="list">' + changed.map(c => '<div class="row"><div><div class="t">' + esc(c[0]) + '</div><div class="m">' + esc(c[1]) + '</div></div><div class="r">' + esc(c[2]) + '</div></div>').join('') + '</div></div>' +
      (late.length ? '<p class="note">' + late.map(s => s.label + ' is ' + s.st + ' (' + ago(s.date) + ')').join('. ') + '.</p>' : '') + '</div>' +
    '<div><h2>What to do</h2><div class="card">' + (RECS.length ? RECS.slice(0, 4).map(r => '<div class="rec"><div class="t">' + esc(r.t) + '</div><p>' + esc(r.p) + '</p><div class="w">' + esc(r.w) + '</div></div>').join('') : '<div class="empty">Nothing in the data calls for action today.</div>') + '</div></div></div></div>';
}

function cmpRow(label, me, them, gap) {
  return '<tr><td>' + esc(label) + '</td><td>' + me + '</td><td>' + them + '</td><td class="gap">' + (gap || '') + '</td></tr>';
}
function cell(val, sub, flag) { return esc(val) + (sub ? '<span class="s2' + (flag ? ' flag' : '') + '">' + esc(sub) + '</span>' : ''); }
function viewCompare() {
  const opts = B.filter(b => b !== JD).sort((a, b) => a.name.localeCompare(b.name));
  const them = state.vs && BY[state.vs] && state.vs !== JD_ID ? BY[state.vs] : null;
  let body = '';
  if (them) {
    const d = (a, b, f) => a == null || b == null ? '' : (a === b ? 'Same' : (b > a ? 'They are ' : 'They are ') + f(Math.abs(b - a)) + (b > a ? ' higher' : ' lower'));
    const priceCells = k => {
      const lab = k === 'wed' ? 'Wedding photography, from' : k === 'wedv' ? 'Wedding video, from' : 'Session, from';
      const a = JD.price[k], b = them.price[k];
      return cmpRow(lab, cell(a == null ? '—' : money(a), JD.pdate ? when(JD.pdate) : 'no check date', !JD.pfresh), cell(b == null ? '—' : money(b), them.pdate ? when(them.pdate) : (them.c.pricing ? 'no check date' : (D.pricingGaps[them.id] ? 'not published' : 'not found')), them.c.pricing && !them.pfresh), JD.pfresh && them.pfresh ? d(a, b, money) : '');
    };
    const ex = [];
    if (JD.pfresh && them.pfresh && JD.price.wed != null && them.price.wed != null) { const g = them.price.wed - JD.price.wed; ex.push('Their wedding photography starts <b>' + money(Math.abs(g)) + (g < 0 ? ' below' : g > 0 ? ' above' : ' at') + '</b> your Essential price.'); }
    if (JD.rev != null && them.rev != null) ex.push('They have <b>' + fmt(them.rev) + ' reviews</b> to your ' + fmt(JD.rev) + (them.revSrc && them.revSrc !== 'google' ? ' (their count is from ' + esc(platName(them.revSrc)) + ', not Google)' : '') + '.');
    if (JD.ig.state === 'live' && them.ig.state === 'live') ex.push('They have <b>' + fmt(them.ig.count) + ' followers</b> to your ' + fmt(JD.ig.count) + '.');
    const jn = ENGINES.map(e => aiNamed(JD, e)), tn = ENGINES.map(e => aiNamed(them, e));
    const tS = tn.reduce((a, b) => a + (b || 0), 0), jS = jn.reduce((a, b) => a + (b || 0), 0);
    ex.push('The assistants named them <b>' + tS + ' ' + plural(tS, 'time') + '</b> and you <b>' + jS + ' ' + plural(jS, 'time') + '</b> across both latest audits.');
    const jf = JD.founded, tf = them.founded;
    body = '<div class="says">' + ex.map(x => '<div>' + x + '</div>').join('') + '</div>' +
      '<div class="wrap"><table class="tbl cmp"><thead><tr><th></th><th>JD Meyers Productions</th><th>' + esc(them.name) + '</th><th class="r">Gap</th></tr></thead><tbody>' +
      priceCells('wed') + priceCells('wedv') + priceCells('sess') +
      cmpRow('Reviews', cell(JD.rev == null ? '—' : fmt(JD.rev) + (JD.rating != null ? ' · ' + JD.rating.toFixed(1) : ''), when(JD.rdate), !JD.rdate), cell(them.rev == null ? '—' : fmt(them.rev) + (them.rating != null ? ' · ' + them.rating.toFixed(1) : ''), (platName(them.revSrc) || '') + (them.rdate ? ', ' + when(them.rdate) : ', no check date'), !them.rdate), d(JD.rev, them.rev, fmt)) +
      cmpRow('Instagram followers', cell(JD.ig.state === 'none' ? '—' : fmt(JD.ig.count), JD.ig.state === 'none' ? '' : (JD.ig.state === 'late' ? 'last pull ' + dshort(JD.ig.date) : 'pulled ' + dshort(JD.ig.date)), JD.ig.state === 'late'), cell(them.ig.state === 'none' ? '—' : fmt(them.ig.count), them.ig.state === 'none' ? (them.c.ig_handle ? 'not pulled daily' : 'no handle') : (them.ig.state === 'late' ? 'last pull ' + dshort(them.ig.date) : 'pulled ' + dshort(them.ig.date)), them.ig.state === 'late'), JD.ig.state !== 'none' && them.ig.state !== 'none' ? d(JD.ig.count, them.ig.count, fmt) : '') +
      cmpRow('Followers, last 7 days', cell(signed(JD.d7)), cell(signed(them.d7)), '') +
      cmpRow('Followers, last 30 days', cell(signed(JD.d30)), cell(signed(them.d30)), '') +
      ENGINES.map((e, i) => cmpRow('Named by ' + e, cell(jn[i] == null ? '—' : jn[i] + ' of ' + AI[e].cur.den, dshort(AI[e].last)), cell(tn[i] == null ? '—' : tn[i] + ' of ' + AI[e].cur.den, dshort(AI[e].last)), '')).join('') +
      cmpRow('Founded', cell(jf || '—', jf ? 'own site' : ''), cell(tf || '—', tf ? (them.det.since && /infer|impl|~/i.test(String(them.det.since)) ? 'inferred' : 'roster or website') : 'unknown', tf && them.det.since && /infer|impl|~/i.test(String(them.det.since))), '') +
      cmpRow('Services', lanePills(JD), lanePills(them), '') +
      cmpRow('Based in', esc(JD.town), esc(them.town), '') +
      '</tbody></table></div>' +
      (them.det.blurb ? '<h2>About them</h2><div class="card"><p>' + esc(clean(them.det.blurb)) + '</p><p class="note">' + [them.c.website ? '<a href="' + esc(/^https?:/.test(them.c.website) ? them.c.website : 'https://' + them.c.website) + '" target="_blank" rel="noopener">Website</a>' : '', them.c.ig_handle ? '<a href="https://instagram.com/' + esc(them.c.ig_handle) + '" target="_blank" rel="noopener">Instagram</a>' : '', them.c.review_url ? '<a href="' + esc(them.c.review_url) + '" target="_blank" rel="noopener">Reviews</a>' : ''].filter(Boolean).join(' · ') + '</p></div>' : '');
  } else body = '<div class="empty">Pick a business to put next to yours.</div>';
  return '<div class="view"><div class="page-h"><div><h1>Compare</h1><p class="sub">JD Meyers Productions next to any competitor. Every figure shows where it came from and when it was checked.</p></div>' +
    '<select class="sel" id="vssel"><option value="">Choose a business</option>' + opts.map(b => '<option value="' + esc(b.id) + '"' + (them && b.id === them.id ? ' selected' : '') + '>' + esc(b.name) + ' · ' + esc(b.town.replace(/, NY.*/, '')) + '</option>').join('') + '</select></div>' + body + '</div>';
}

function marketRows() {
  const q = flat(state.q);
  let list = B.filter(b => (!q || flat(b.name + ' ' + b.town).indexOf(q) >= 0) && (state.region === 'all' || b.region === state.region) && (state.lane === 'all' || b.lanes.indexOf(state.lane) >= 0));
  const k = state.sort.k, dir = state.sort.dir;
  const val = { name: b => b.name.toLowerCase(), fol: b => b.ig.state === 'live' ? b.ig.count : null, d7: b => b.d7, wed: b => b.pfresh ? b.price.wed : null, sess: b => b.pfresh ? b.price.sess : null, rev: b => b.rev, ai: b => aiTotal(b) }[k];
  return list.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return a.name.localeCompare(b.name); if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
}
function viewMarket() {
  const list = marketRows();
  const th = (k, l, r) => '<th class="s' + (r ? ' r' : '') + '" data-sort="' + k + '">' + l + (state.sort.k === k ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>';
  const body = list.map(b => '<tr class="c' + (b === JD ? ' me' : '') + '" data-vs="' + esc(b.id) + '"><td><b>' + esc(b.name) + '</b>' + (b === JD ? ' <span class="pill me">You</span>' : '') + '<span class="s2">' + esc(b.town) + '</span></td><td>' + lanePills(b) + '</td>' +
    '<td class="r">' + (b.ig.state === 'live' ? fmt(b.ig.count) : '<span class="muted">—</span>') + '</td><td class="r">' + (b.ig.state === 'live' && b.d7 != null ? '<span class="' + (b.d7 > 0 ? 'up' : b.d7 < 0 ? 'down' : 'muted') + '">' + signed(b.d7) + '</span>' : '<span class="muted">—</span>') + '</td>' +
    '<td class="r">' + (b.pfresh && b.price.wed != null ? money(b.price.wed) : '<span class="muted">—</span>') + '</td><td class="r">' + (b.pfresh && b.price.sess != null ? money(b.price.sess) : '<span class="muted">—</span>') + '</td>' +
    '<td class="r">' + (b.rev != null ? fmt(b.rev) + (b.rdate ? '' : '<span class="s2 flag">no date</span>') : '<span class="muted">—</span>') + '</td><td class="r">' + (aiTotal(b) || '<span class="muted">0</span>') + '</td></tr>').join('');
  return '<div class="view"><div class="page-h"><div><h1>Market</h1><p class="sub">' + B.length + ' businesses. Click any row to compare it with yours. A dash means no current figure.</p></div></div>' +
    '<div class="ctl"><input class="in" id="q" placeholder="Search name or town" value="' + esc(state.q) + '"><select class="sel" id="reg"><option value="all">All regions</option>' + Object.keys(REGION).map(r => '<option value="' + r + '"' + (state.region === r ? ' selected' : '') + '>' + REGION[r] + '</option>').join('') + '</select>' +
    '<select class="sel" id="lane"><option value="all">All services</option>' + LANES.map(l => '<option value="' + l[0] + '"' + (state.lane === l[0] ? ' selected' : '') + '>' + l[1] + '</option>').join('') + '</select></div>' +
    '<div class="wrap"><table class="tbl"><thead><tr>' + th('name', 'Business') + '<th>Services</th>' + th('fol', 'Followers', 1) + th('d7', '7 days', 1) + th('wed', 'Wedding from', 1) + th('sess', 'Session from', 1) + th('rev', 'Reviews', 1) + th('ai', 'AI named', 1) + '</tr></thead><tbody>' + (body || '<tr><td colspan="8"><div class="empty">No matches.</div></td></tr>') + '</tbody></table></div></div>';
}

function viewAI() {
  const act = ACTIVE;
  const eng = ENGINES.filter(e => AI[e].cur.den);
  const top = {};
  eng.forEach(e => Object.keys(AI[e].cur.ids).forEach(id => top[id] = (top[id] || 0) + AI[e].cur.ids[id]));
  let tl = Object.keys(top).sort((a, b) => top[b] - top[a]).slice(0, 10);
  if (tl.indexOf(JD.id) < 0 && top[JD.id]) tl.push(JD.id);
  const mx = Math.max.apply(null, tl.map(id => top[id]).concat([1])), den = eng.reduce((s, e) => s + AI[e].cur.den, 0);
  const off = {};
  eng.forEach(e => Object.keys(AI[e].cur.off).forEach(k => { const o = AI[e].cur.off[k]; (off[k] = off[k] || { name: o.name, n: 0 }).n += o.n; }));
  const offL = Object.keys(off).sort((a, b) => off[b].n - off[a].n).slice(0, 14);
  const prow = act.map(p => {
    const cellFor = e => { const r = AI[e].cur.rows.find(x => x.prompt_id === p.id); if (!r) return '<td class="muted">—</td>'; const names = (r.named || []).map(clean); const jd = (r.named || []).some(n => matchName(n) === JD.id);
      return '<td>' + (jd ? '<span class="pill me">You</span>' : '<span class="pill">Not you</span>') + '<span class="s2">' + names.length + ' named' + (names.length ? ': ' + esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? '…' : '') : '') + '</span></td>'; };
    return '<tr><td>' + esc(p.text) + '</td>' + eng.map(cellFor).join('') + '</tr>';
  }).join('');
  const hist = [];
  eng.forEach(e => AI[e].dates.slice().reverse().forEach(d => { const r = aiRun(e, d); hist.push({ d, e, n: r.ids[JD.id] || 0, den: r.den }); }));
  hist.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : a.e.localeCompare(b.e));
  return '<div class="view"><div class="page-h"><div><h1>AI Visibility</h1><p class="sub">Who the assistants name when a stranger asks. Signed-out chat, a fresh chat for each prompt. Counts, not percentages, and directional only.</p></div></div>' +
    '<div class="tiles">' + eng.map(aiTile).join('') + '<div class="card tile"><div class="k">Names not on the roster</div><div class="n">' + Object.keys(off).length + '</div><div class="d">Businesses the assistants named that are not tracked here</div></div></div>' +
    '<div class="cols"><div><h2>Most named, both assistants</h2><div class="card"><div class="bars">' + tl.map(id => '<div class="bar-r2' + (id === JD.id ? ' me' : '') + '"><span>' + esc(BY[id].name) + '</span><span class="tr"><i style="width:' + (top[id] / mx * 100).toFixed(1) + '%"></i></span><b>' + top[id] + '</b></div>').join('') + '</div><p class="note">Out of ' + den + ' answers in the latest audits.</p></div></div>' +
    '<div><h2>History: times you were named</h2><div class="card"><div class="list">' + hist.map(h => '<div class="row"><div><div class="t">' + esc(h.e) + '</div><div class="m">' + dshort(h.d) + '</div></div><div class="r">' + h.n + ' of ' + h.den + '</div></div>').join('') + '</div></div></div></div>' +
    '<h2>Prompt by prompt, latest audit</h2><div class="wrap"><table class="tbl"><thead><tr><th>Prompt</th>' + eng.map(e => '<th>' + e + '</th>').join('') + '</tr></thead><tbody>' + prow + '</tbody></table></div>' +
    '<p class="note">The prompts ask about a region, and 3 of ' + act.length + ' name Potsdam, your home town. Results are a picture of your home market only. Citations were recorded for almost none of the answers, so sources cannot be shown.</p>' +
    (offL.length ? '<h2>Named but not on the roster</h2><div class="card">' + offL.map(k => '<span class="pill">' + esc(off[k].name) + ' · ' + off[k].n + '</span>').join('') + '</div>' : '') + '</div>';
}

function viewCouncil() {
  const key = 'slcwed';
  const lines = k => k.filter(Boolean).map(x => '<div class="row"><div class="t" style="font-weight:500">' + esc(x) + '</div></div>').join('');
  const pw = peerTxt('wed', key), pv = peerTxt('wedv', key), ps = peerTxt('sess', 'slc');
  const priced = B.filter(b => b.lanes.indexOf('wed') >= 0 && b.region === 'slc'), pubd = priced.filter(b => b.pfresh && b.price.wed != null).length;
  const hiFind = FINDINGS.filter(f => f.sev === 'high').length;
  const jd30 = JD.d30, folStand = stand('fol', 'all');
  const aiL = ENGINES.filter(e => AI[e].cur.den).map(e => e + ': named in ' + (AI[e].cur.ids[JD.id] || 0) + ' of ' + AI[e].cur.den + ' prompts (' + dshort(AI[e].last) + ')');
  const topNamed = Object.keys(AI.ChatGPT.cur.ids).concat(Object.keys(AI.Gemini.cur.ids)).reduce((m, id) => { m[id] = aiTotal(BY[id]); return m; }, {});
  const tops = Object.keys(topNamed).filter(id => id !== JD.id).sort((a, b) => topNamed[b] - topNamed[a]).slice(0, 3).map(id => BY[id].name + ' (' + topNamed[id] + ')');
  const depts = [
    ['Data Integrity', 'The Auditor. Traces figures to where they came from.', [FINDINGS.length + ' open ' + plural(FINDINGS.length, 'finding') + ', ' + hiFind + ' high severity', hiFind ? FINDINGS.filter(f => f.sev === 'high')[0].title : 'No high-severity findings'], 'audit'],
    ['Pricing and Offers', 'What competitors charge and where you sit.', [pw && pw.text, pv && pv.text, ps && ps.text, pubd + ' of ' + priced.length + ' St. Lawrence County wedding businesses have a current price on record'], 'market'],
    ['AI Visibility', 'Who the assistants name.', aiL.concat(tops.length ? ['Most named other than you: ' + tops.join(', ')] : []), 'ai'],
    ['Social', 'Instagram reach and activity.', [JD.ig.state !== 'none' ? 'Followers ' + fmt(JD.ig.count) + ', ' + rankText('fol', folStand).toLowerCase() + ' tracked accounts' : null, jd30 != null ? 'Last 30 days: ' + signed(jd30) : null, igTracked + ' of ' + igHandles + ' roster handles are tracked daily'], 'market'],
    ['JD Funnel', 'Inquiries, replies, bookings, conversion.', ['Not connected. This is the only department that can show whether a recommendation worked. It needs inquiry and booking counts from your own email and Square.'], null]
  ];
  return '<div class="view"><div class="page-h"><div><h1>Council</h1><p class="sub">Each department reads the data and gives short, dated verdicts. All of them are computed from the files, as of ' + dshort(ASOF_S) + '.</p></div></div>' +
    '<div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">' + depts.map(d => '<div class="card hov"><h3>' + esc(d[0]) + '</h3><p class="note" style="margin:2px 0 8px">' + esc(d[1]) + '</p><div class="list">' + lines(d[2]) + '</div>' + (d[3] ? '<p class="note"><a href="#' + d[3] + '">Open ' + (d[3] === 'audit' ? 'the Auditor' : d[3] === 'ai' ? 'AI Visibility' : 'the Market') + '</a></p>' : '') + '</div>').join('') + '</div>' +
    '<h2>Recommendations</h2><div class="card">' + (RECS.length ? RECS.map(r => '<div class="rec"><div class="t">' + esc(r.t) + '</div><p>' + esc(r.p) + '</p><div class="w">' + esc(r.w) + '</div></div>').join('') : '<div class="empty">Nothing in the data calls for action today.</div>') + '</div>' +
    '<p class="note">Rules for every recommendation: it names its evidence and the number of businesses behind it, it is not built from a one-week change, and it says what result would show it was wrong.</p></div>';
}

function viewAudit() {
  const sevPill = s => '<span class="pill ' + (s === 'high' ? 'b' : s === 'med' ? 'w' : '') + '">' + (s === 'high' ? 'High' : s === 'med' ? 'Medium' : 'Low') + '</span>';
  return '<div class="view"><div class="page-h"><div><h1>Auditor</h1><p class="sub">Looks for figures that are wrong because this tool treated its own records as proof: a discovery date used as a start date, a first price read as a price change, a total built from a partial pull. Each finding shows the chain back to the file it came from. Checked live on every build.</p></div></div>' +
    '<div class="card">' + (FINDINGS.length ? FINDINGS.map(f => '<div class="fnd"><div class="t">' + sevPill(f.sev) + ' ' + esc(f.title) + '</div><p>' + esc(f.text) + '</p><div class="chain">' + esc(f.chain) + '</div></div>').join('') : '<div class="empty">No findings.</div>') + '</div>' +
    '<p class="note">Traced to files only. The Auditor cannot open a competitor\'s website for you: a claim that cannot be traced past this tool\'s own files needs a manual check against the business\'s site, Google profile or state records.</p></div>';
}

function viewSources() {
  const rows = SOURCES.map(s => '<tr><td><b>' + esc(s.label) + '</b></td><td><span class="pill ' + (s.st === 'ok' ? 'g' : s.st === 'late' ? 'w' : s.st === 'stalled' ? 'b' : '') + '">' + ({ ok: 'Current', late: 'Late', stalled: 'Stalled', none: 'No data' }[s.st]) + '</span></td><td>' + esc(ago(s.date)) + '</td><td class="muted">' + esc(s.cover) + '</td><td class="muted">' + (s.win ? esc(s.win.cadence) + '. Late after ' + s.win.late_after_days + ' days.' : '') + '</td></tr>').join('');
  const fix = SOURCES.filter(s => s.st !== 'ok' && s.win).map(s => '<div class="row"><div><div class="t">' + esc(s.label) + '</div><div class="m">' + esc(s.win.fix) + '</div></div></div>').join('');
  return '<div class="view"><div class="page-h"><div><h1>Sources</h1><p class="sub">Where every number comes from and how recently it was checked. Windows come from the freshness settings the daily build writes.</p></div></div>' +
    '<div class="wrap"><table class="tbl"><thead><tr><th>Source</th><th>Status</th><th>Last checked</th><th>Coverage</th><th>Schedule</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (fix ? '<h2>What to run</h2><div class="card"><div class="list">' + fix + '</div></div>' : '') +
    '<h2>Left off the roster</h2><div class="card"><div class="list">' + D.excluded.map(x => '<div class="row"><div><div class="t">' + esc(clean(x.name)) + '</div><div class="m">' + esc(clean(x.reason)) + '</div></div></div>').join('') + '</div></div></div>';
}

/* ---------- router ---------- */
const VIEWS = { home: viewHome, compare: viewCompare, market: viewMarket, ai: viewAI, council: viewCouncil, audit: viewAudit, sources: viewSources };
function route() {
  const h = (location.hash || '#home').slice(1).split('/');
  let v = VIEWS[h[0]] ? h[0] : 'home';
  if (v === 'compare' && h[1]) state.vs = decodeURIComponent(h[1]);
  render(v);
}
function render(v) {
  stage.innerHTML = VIEWS[v]();
  stage.scrollTop = 0;
  $$('#nav button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === v));
  moveThumb();
  bind(v);
}
function moveThumb() {
  const on = $('#nav button[aria-selected=true]'), t = $('#nav .thumb');
  if (on && t) { t.style.left = on.offsetLeft + 'px'; t.style.width = on.offsetWidth + 'px'; }
}
function bind(v) {
  if (v === 'home') { const s = $('#setsel'); if (s) s.onchange = () => { state.set = s.value; render('home'); }; }
  if (v === 'compare') { const s = $('#vssel'); if (s) s.onchange = () => { state.vs = s.value || null; history.replaceState(null, '', '#compare' + (s.value ? '/' + encodeURIComponent(s.value) : '')); render('compare'); }; }
  if (v === 'market') {
    const q = $('#q'); q.oninput = () => { state.q = q.value; const pos = q.selectionStart; render('market'); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#reg').onchange = e => { state.region = e.target.value; render('market'); };
    $('#lane').onchange = e => { state.lane = e.target.value; render('market'); };
    $$('th[data-sort]').forEach(th => th.onclick = () => { const k = th.dataset.sort; state.sort = state.sort.k === k ? { k, dir: -state.sort.dir } : { k, dir: k === 'name' ? 1 : -1 }; render('market'); });
    $$('tr[data-vs]').forEach(tr => tr.onclick = () => { if (tr.dataset.vs === JD_ID) return; location.hash = '#compare/' + encodeURIComponent(tr.dataset.vs); });
  }
}
$$('#nav button').forEach(b => b.onclick = () => { if (location.hash === '#' + b.dataset.v) render(b.dataset.v); else location.hash = '#' + b.dataset.v; });
window.addEventListener('hashchange', route);
window.addEventListener('resize', moveThumb);
(function health() {
  const worst = SOURCES.some(s => s.st === 'stalled') ? 'stalled' : SOURCES.some(s => s.st === 'late') ? 'late' : 'ok';
  const n = SOURCES.filter(s => s.st !== 'ok').length;
  const hi = FINDINGS.filter(f => f.sev === 'high').length;
  const lvl = worst !== 'ok' ? worst : hi ? 'late' : 'ok';
  $('#health .dot').className = 'dot ' + lvl;
  $('#health-t').textContent = worst !== 'ok' ? n + ' ' + plural(n, 'source') + ' ' + worst : hi ? hi + ' data ' + plural(hi, 'issue') + ' to fix' : 'All sources current';
  $('#health').onclick = () => { location.hash = worst !== 'ok' ? '#sources' : '#audit'; };
})();
route();
})();
