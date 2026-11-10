/* Business Pulse front end. One file, no dependencies, works from file://.
   Private competitor tool built around JD Meyers Productions. Reads the same data files the
   daily build already writes: data/data.js (window.PULSE_DATA), details-enrichment.js,
   website-intel.js, venues.js.
   Standing rule (JD, Nov 10, 2026): a figure or claim appears only if it comes with a link
   that takes you to where it can be checked. No link, no figure. Every verdict on the
   Council, Auditor and Home pages is computed here from linked figures. */
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
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const plural = (n, a, b) => n === 1 ? a : (b || a + 's');
const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const maxDate = arr => arr.reduce((m, x) => x && (!m || x > m) ? x : m, null);
const minDate = arr => arr.reduce((m, x) => x && (!m || x < m) ? x : m, null);
const when = d => d ? 'checked ' + dshort(d) : 'no check date';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };

/* ---------- source links ----------
   A figure is usable only if one of these returns a link. Prices open the business's own pricing
   page and ask the browser to highlight the figure (a "text fragment"; it highlights when the site
   shows the number as plain text, and just opens the page when it does not). Reviews open the
   listing the count was read from. Followers open the Instagram profile. */
const A = (txt, url, title) => url ? '<a class="sa" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(title || 'Opens ' + host(url)) + '">' + txt + '</a>' : txt;
function priceUrl(c, amount) {
  const u = c.pricing_url; if (!u || amount == null) return null;
  const a = '$' + Math.round(amount).toLocaleString('en-US'), b = '$' + Math.round(amount);
  const frag = 'text=' + encodeURIComponent(a) + (a !== b ? '&text=' + encodeURIComponent(b) : '');
  return u + (u.indexOf('#') >= 0 ? ':~:' : '#:~:') + frag;
}
const igUrl = h => h ? 'https://www.instagram.com/' + encodeURIComponent(h) + '/' : null;

/* ---------- freshness windows ---------- */
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

/* ---------- lanes: read only from the linked pricing text ---------- */
const LANES = [['wed', 'Wedding'], ['port', 'Portrait'], ['vid', 'Video'], ['re', 'Real estate'], ['dr', 'Drone'], ['com', 'Commercial']];
const LANE_NAME = {}; LANES.forEach(l => LANE_NAME[l[0]] = l[1]);
function lanesOf(c) {
  if (!c.pricing || !c.pricing_url) return [];
  const t = String(c.pricing).toLowerCase(), L = [];
  if (/wedding|elopement|bridal/.test(t)) L.push('wed');
  if (/portrait|family|families|senior|headshot|maternity|newborn|couple|session/.test(t)) L.push('port');
  if (/video|film|cinema/.test(t)) L.push('vid');
  if (/real estate|realty|listing|property|mls/.test(t)) L.push('re');
  if (/drone|aerial|fpv/.test(t)) L.push('dr');
  if (/commercial|brand|corporate|product|marketing|promo/.test(t)) L.push('com');
  return L;
}
const PLAT = { google: 'Google', facebook: 'Facebook', weddingwire: 'WeddingWire', theknot: 'The Knot', zola: 'Zola' };
const platName = p => PLAT[p] || p;
const REGION = { slc: 'St. Lawrence County', adjacent: 'Adjacent county', unconfirmed: 'Unconfirmed' };

/* ---------- the business model: one row per business ---------- */
const SD = D.seedDates || {};
const PER_P = (SD.pricing && SD.pricing.per) || {};
const PER_R = (SD.reviews && SD.reviews.per) || {};
const B = D.competitors.map(c => {
  const ig = igState(c.ig_handle);
  const pdate = PER_P[c.id] || null, rdate = PER_R[c.id] || null;
  const price = parsePrice(c.pricing);
  const pfresh = !!(c.pricing && c.pricing_url && pdate && age(pdate) <= PRICE_DAYS);
  return {
    c, id: c.id, name: clean(c.name), town: c.town || '', region: c.region || 'unconfirmed', lanes: lanesOf(c),
    ig, price, pdate, pfresh, rdate,
    rev: c.review_url ? c.review_count : null, revHidden: c.review_count != null && !c.review_url, rating: c.review_rating, revSrc: c.review_source
  };
});
const BY = {}; B.forEach(b => BY[b.id] = b);
const JD = BY[JD_ID] || B[0];

/* ---------- AI answers: used only when the answer row carries a link to the conversation ---------- */
const ACTIVE = (D.aiPrompts.prompts || []).filter(p => !p.retired);
const ACTIVE_IDS = new Set(ACTIVE.map(p => p.id));
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
const AI_ALL = (D.aiChecks || []).filter(r => ACTIVE_IDS.has(r.prompt_id));
const AIROWS = AI_ALL.filter(r => r.url);
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
const ENG_OK = ENGINES.filter(e => AI[e].cur.den);

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
/* where to check one business's figure for one metric */
function figSrc(mk, b) {
  if (mk === 'wed' || mk === 'wedv' || mk === 'sess') return { url: priceUrl(b.c, b.price[mk]), date: b.pdate, what: 'price page' };
  if (mk === 'rev') return { url: b.c.review_url || null, date: b.rdate, what: platName(b.revSrc) || 'review listing' };
  if (mk === 'fol') return { url: b.ig.state === 'none' ? null : igUrl(b.c.ig_handle), date: b.ig.date, what: 'Instagram profile' };
  return { url: null };
}
const linked = (mk, b, text) => A(esc(text), figSrc(mk, b).url);
function stand(mk, setKey) {
  const M = METRICS[mk], S = SETS[setKey];
  const arr = B.filter(b => b === JD || S.f(b)).map(b => ({ b, v: M.val(b) })).filter(x => x.v != null);
  const me = arr.find(x => x.b === JD);
  const peers = arr.filter(x => x.b !== JD).map(x => x.v);
  const res = { n: arr.length, list: arr, me: me ? me.v : null, peers, med: peers.length >= 8 ? median(peers) : null, min: null, max: null, rank: null };
  const all = arr.map(x => x.v);
  if (all.length) { res.min = Math.min.apply(null, all); res.max = Math.max.apply(null, all); }
  if (me) res.rank = 1 + peers.filter(v => M.dir === 'asc' ? v < me.v : v > me.v).length;
  return res;
}
function rankText(mk, st) {
  if (st.rank == null) return 'No linked figure for JD Meyers Productions';
  if (st.n < 2) return 'No peers with a linked figure';
  const asc = METRICS[mk].dir === 'asc';
  return (st.rank === 1 ? (asc ? 'Lowest' : 'Highest') : ord(st.rank) + (asc ? ' lowest' : ' highest')) + ' of ' + st.n;
}
function strip(st, mk) {
  const M = METRICS[mk];
  if (st.n < 3 || st.me == null) return '<div class="plot"></div>';
  const f = v => M.log ? Math.log10(Math.max(v, 1)) : v;
  const mn = f(st.min), mx = f(st.max), pos = v => mx === mn ? 50 : ((f(v) - mn) / (mx - mn)) * 100;
  return '<div class="plot"><div class="strip">' + st.peers.map(v => '<i style="left:0" data-to="' + pos(v).toFixed(1) + '"></i>').join('') + '<b style="left:0" data-to="' + pos(st.me).toFixed(1) + '"></b></div>' +
    '<div class="strip-l"><span>' + esc(M.f(st.min)) + '</span><span>' + esc(M.f(st.max)) + '</span></div></div>';
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

/* ---------- source freshness and link coverage ---------- */
const lastSweep = SW.filter(w => w.fetched != null).pop();
const pDates = B.filter(b => b.pfresh || (b.c.pricing && b.pdate)).map(b => b.pdate);
const rDates = B.filter(b => b.rdate).map(b => b.rdate);
const revAll = B.filter(b => b.c.review_count != null).length, revNoDate = B.filter(b => b.rev != null && !b.rdate).length;
const priceAll = B.filter(b => b.c.pricing).length, priceNoDate = B.filter(b => b.c.pricing && b.c.pricing_url && !b.pdate).length;
const igTracked = new Set(D.igActivity.map(r => r.handle)).size, igHandles = B.filter(b => b.c.ig_handle).length;
const SOURCES = [
  { id: 'ig', label: 'Instagram followers', date: maxDate(D.igActivity.map(r => r.date)), cover: igTracked + ' of ' + igHandles + ' roster handles pulled daily' },
  { id: 'ai', label: 'AI assistant answers', date: ENG_OK.length ? minDate(ENG_OK.map(e => AI[e].last)) : maxDate(AI_ALL.map(r => r.date)), cover: AIROWS.length + ' of ' + AI_ALL.length + ' recorded answers link to the conversation and are used' },
  { id: 'web', label: 'Website watch', date: lastSweep && lastSweep.date, cover: lastSweep ? sweepInfo(lastSweep).n + ' of ' + B.length + ' sites in the last run' : 'no runs' },
  { id: 'reviews', label: 'Reviews', date: minDate(rDates), cover: (revAll - revNoDate) + ' of ' + revAll + ' counts have their own check date (oldest date shown)' },
  { id: 'pricing', label: 'Pricing', date: minDate(pDates), cover: (priceAll - priceNoDate) + ' of ' + priceAll + ' price lists have their own check date (oldest date shown)' },
  { id: 'roster', label: 'Daily build', date: (D.builtAt || '').slice(0, 10), cover: B.length + ' businesses on the roster' }
].map(s => { const a = age(s.date); return Object.assign({}, s, { age: a, st: stat(s.id, a), win: SRC[s.id] }); });
const COVERAGE = [
  ['Prices', B.filter(b => b.pfresh).length, priceAll, 'Opens the business\'s own pricing page and highlights the figure where the site allows it. Hidden when there is no pricing page link or no check date in the last ' + PRICE_DAYS + ' days.'],
  ['Review counts', B.filter(b => b.rev != null).length, revAll, 'Opens the listing the count was read from. Hidden when the roster has no listing link.'],
  ['Instagram followers', B.filter(b => b.ig.state === 'live').length, igHandles, 'Opens the profile. Hidden when the account was not pulled live in the last 2 days.'],
  ['AI answers', AIROWS.length, AI_ALL.length, 'Each answer must link to the conversation (a share link saved in the answer row\'s url field). None do yet, so none are used.'],
  ['Follower movement (7 and 30 days)', 0, B.filter(b => b.ig.state === 'live').length, 'Computed from this tool\'s own daily snapshots. Instagram shows no history, so there is no link that proves it. Not shown.'],
  ['Founding years and business descriptions', 0, Object.keys(DET).length, 'Stored with no source link. Not shown.']
];

/* ---------- the Auditor ---------- */
function runAudit() {
  const F = [];
  const add = (sev, id, title, text, chain) => F.push({ sev, id, title, text, chain });
  if (!AIROWS.length && AI_ALL.length) add('high', 'ai-nolink', AI_ALL.length + ' of ' + AI_ALL.length + ' AI answers have no link to the conversation',
    'None of them can be checked, so none are used and the AI Visibility numbers are off. To turn them on, save a share link for each answer in the row\'s url field.', 'aiChecks[].url missing');
  else if (AI_ALL.length > AIROWS.length) add('med', 'ai-partial', (AI_ALL.length - AIROWS.length) + ' AI answers have no link and are left out', 'Only answers with a link to the conversation are counted.', 'aiChecks[].url missing');
  const noPriceLink = B.filter(b => b.c.pricing && !b.c.pricing_url);
  if (noPriceLink.length) add('high', 'price-nolink', noPriceLink.length + ' price lists have no link to a pricing page and are hidden', noPriceLink.map(b => b.name).join(', '), 'competitors[].pricing_url missing');
  const noRevLink = B.filter(b => b.revHidden);
  if (noRevLink.length) add('high', 'rev-nolink', noRevLink.length + ' review counts have no link to a listing and are hidden', noRevLink.map(b => b.name).join(', '), 'competitors[].review_url missing');
  if (revNoDate) add('high', 'rev-undated', revNoDate + ' of ' + revAll + ' review counts have no check date of their own',
    'The link opens the live listing, so the count there may differ from the stored one. The roster has no record of when someone last looked. Shown with a "no check date" flag.', 'data.js competitors[].review_count -> seedDates.reviews.per[id] missing');
  const mixed = B.filter(b => b.rev != null && b.revSrc && b.revSrc !== 'google');
  if (mixed.length) add('med', 'rev-mixed', mixed.length + ' review counts come from a platform other than Google',
    mixed.map(b => b.name + ' (' + platName(b.revSrc) + ')').join(', ') + '. Counts from different platforms are different things. Each links to its own platform.', 'competitors[].review_source');
  if (priceNoDate) add('high', 'price-undated', priceNoDate + ' of ' + priceAll + ' price lists have no verification date',
    'These are left out of every price comparison. Names: ' + B.filter(b => b.c.pricing && b.c.pricing_url && !b.pdate).slice(0, 8).map(b => b.name).join(', ') + (priceNoDate > 8 ? ', and ' + (priceNoDate - 8) + ' more' : '') + '.',
    'competitors[].pricing -> seedDates.pricing.per[id] missing');
  const oldP = B.filter(b => b.c.pricing && b.pdate && age(b.pdate) > PRICE_DAYS);
  if (oldP.length) add('med', 'price-old', oldP.length + ' price lists are older than ' + PRICE_DAYS + ' days and are left out', oldP.map(b => b.name + ' (' + dshort(b.pdate) + ')').join(', '), 'seedDates.pricing.per');
  const byDisc = {};
  D.competitors.forEach(c => { if (c.discovered_date) (byDisc[c.discovered_date] = byDisc[c.discovered_date] || []).push(c); });
  Object.keys(byDisc).forEach(d => { if (byDisc[d].length >= 5) add('med', 'disc-' + d, byDisc[d].length + ' businesses share the discovery date ' + dshort(d),
    'That is the day the roster was filled in, not the day these businesses started. A discovery date must never be read as a start date or a "new business" signal.', 'competitors[].discovered_date = ' + d); });
  const withYear = D.competitors.filter(c => c.est_year).length + Object.keys(DET).filter(k => DET[k].since).length;
  if (withYear) add('med', 'since-nosrc', 'Founding years carry no source link and are not shown',
    withYear + ' year entries exist in the roster and descriptions. Some are guesses stored as facts (for example "~2015 (inferred)"). To show a year, save a link to the record that proves it (state business records, the earliest Google review, an archived page).', 'est_year, details-enrichment.js[id].since');
  if (DET[JD_ID] && DET[JD_ID].since && JD.c.est_year && String(DET[JD_ID].since) !== String(JD.c.est_year)) add('med', 'jd-founded', 'JD Meyers Productions has two founding years: ' + JD.c.est_year + ' and ' + DET[JD_ID].since,
    'The business started in 2016. 2018 is the year the DBA was registered. One field needs to change.', 'competitors[jd].est_year vs details-enrichment.js[jd].since');
  const ai = D.competitors.filter(c => c.source_label === 'AI audit');
  if (ai.length) add('med', 'circular-ai', ai.length + ' roster businesses were found through AI answers',
    'Businesses that entered the roster because an assistant named them are guaranteed to be named at least once. Read their AI numbers with that in mind: ' + ai.map(c => clean(c.name)).join(', ') + '.',
    'competitors[].source_label = "AI audit"');
  const infos = SW.map(sweepInfo).filter(Boolean);
  const everChanged = infos.reduce((s, i) => s + i.ch, 0);
  if (infos.length >= 5 && everChanged === 0) add('high', 'sweep-blind', 'The website watch has never recorded a change in ' + infos.length + ' runs',
    'Either no competitor changed anything or the check cannot see changes.' + (infos.some(i => i.n >= 5 && i.un === i.n) ? ' Some runs logged every page as unreachable, which points to the checker failing, not the websites.' : ''), 'webSweepHistory[].pages[].status');
  const allDown = infos.filter(i => i.n >= 5 && i.un === i.n);
  if (allDown.length) add('med', 'sweep-failed', allDown.length + ' sweep runs logged every page as unreachable', allDown.map(i => dshort(i.date)).join(', ') + '. That is a collection failure being recorded as a property of the websites.', 'webSweepHistory[].pages[].status = unreachable');
  if (lastSweep) { const i = sweepInfo(lastSweep); if (i.n < B.length / 2) add('med', 'sweep-cover', 'The last website check covered ' + i.n + ' of ' + B.length + ' businesses', 'Prices can change at the other ' + (B.length - i.n) + ' without this tool seeing it.', 'webSweepHistory[last]'); }
  const tp = D.trendPoints || [], full = Math.max.apply(null, tp.map(t => t.igLive || 0).concat([0]));
  const part = tp.filter(t => t.igLive != null && t.igLive < full);
  if (part.length) add('med', 'partial-snap', part.length + ' daily follower totals were taken with fewer accounts than usual',
    part.map(t => dshort(t.date) + ' (' + t.igLive + ' of ' + full + ' accounts, total ' + fmt(t.igTotal) + ')').join('; ') + '. Any change computed against these days is wrong, which is one reason follower movement is not shown.', 'trendPoints[].igLive');
  const frozen = Object.keys(D.igFollowersHistory).filter(h => { const v = D.igFollowersHistory[h]; return v.length >= 30 && new Set(v.map(e => e.count)).size === 1; });
  if (frozen.length) add('low', 'ig-flat', frozen.length + ' Instagram accounts show an identical count for 30+ days', frozen.map(h => '@' + h + ' (' + D.igFollowersHistory[h][0].count + ')').join(', ') + '. May be real. Looks the same as a carried-forward number. Open the profile to check.', 'igFollowersHistory');
  const carried = D.igActivity.filter(r => CARRIED.test(r.activity || '')).length;
  if (carried) add('low', 'ig-carried', carried + ' Instagram rows are carried-forward numbers',
    'They are kept in the same field as real pulls and told apart only by the wording of a note. This tool ignores them.', 'igActivity[].activity matches "carried"');
  const order = { high: 0, med: 1, low: 2 };
  return F.sort((a, b) => order[a.sev] - order[b.sev]);
}
const FINDINGS = runAudit();

/* ---------- recommendations: only from linked figures ---------- */
function recommendations() {
  const R = [], key = 'slcwed';
  const wed = stand('wed', key);
  if (wed.me != null && wed.n >= 5) {
    const pos = wed.med != null ? (wed.me > wed.med ? 'above' : wed.me < wed.med ? 'below' : 'at') + ' the peer median of ' + money(wed.med) : 'ranked ' + rankText('wed', wed).toLowerCase();
    R.push({ t: 'Check your entry wedding price against local peers', proof: ['wed', key],
      p: 'Your Essential wedding photography price of ' + money(wed.me) + ' is ' + pos + ' (' + SETS[key].label + ' with a linked, current price: ' + wed.n + ', range ' + money(wed.min) + ' to ' + money(wed.max) + '). Decide on purpose: hold it and sell on proof, or test a different entry price.',
      w: 'Would be wrong if: your booked weddings over the next 8 weeks do not change either way. Inquiry and booking counts are not connected to this tool yet, so you will need to count them yourself.' });
  }
  const rev = stand('rev', key);
  if (rev.me != null && rev.med != null && rev.me < rev.med) {
    const need = Math.ceil(rev.med - rev.me);
    R.push({ t: 'Close the review gap with a direct ask', proof: ['rev', key],
      p: 'You have ' + fmt(rev.me) + ' reviews against a peer median of ' + fmt(rev.med) + ' (' + rankText('rev', rev).toLowerCase() + '). That is ' + need + ' more to reach the median. Ask your most recent clients, in the delivery email, for a Google review.',
      w: 'Would be wrong if: the peer median moves up faster than you can close it. Re-open the listings each month to check.' });
  }
  const hi = FINDINGS.filter(f => f.sev === 'high').length;
  if (hi) R.push({ t: 'Fix ' + hi + ' data ' + plural(hi, 'problem') + ' before leaning on the numbers',
    p: 'The Auditor found ' + hi + ' high-severity ' + plural(hi, 'problem') + '. They affect which figures can be shown at all. See the Auditor page.', w: 'Done when: the Auditor shows no high-severity findings.', link: '#audit' });
  return R;
}
const RECS = recommendations();

/* ---------- views ---------- */
const stage = $('#stage');
const state = { q: '', lane: 'all', region: 'all', sort: { k: 'fol', dir: -1 }, set: 'slcwed', vs: null };
const lanePills = b => b.lanes.length ? b.lanes.slice(0, 3).map(l => '<span class="pill">' + LANE_NAME[l] + '</span>').join('') + (b.lanes.length > 3 ? '<span class="pill">+' + (b.lanes.length - 3) + '</span>' : '') : '<span class="muted">—</span>';
const ago = d => d ? dshort(d) + (age(d) > 0 ? ' (' + age(d) + 'd ago)' : ' (today)') : 'no date';
const proofBtn = (mk, key, n) => '<button class="proofbtn" data-proof="' + mk + '|' + key + '">Verify the ' + n + ' ' + plural(n, 'figure') + '</button>';

function tile(mk, key) {
  const st = stand(mk, key), M = METRICS[mk], s = figSrc(mk, JD);
  return '<div class="card tile hov"><div class="k">' + esc(M.label) + '</div>' +
    '<div class="n">' + (st.me != null ? linked(mk, JD, M.f(st.me)) : '—') + '</div>' +
    '<div class="d">' + esc(rankText(mk, st)) + (st.med != null ? '<br>Peer median ' + esc(M.f(st.med)) : st.n > 1 && st.n < 8 ? '<br>Too few peers for a median (' + (st.n - 1) + ')' : '') + '</div>' +
    strip(st, mk) + '<div class="foot"><div class="srcline">' + (s.url ? A(esc(host(s.url)), s.url) + '<span>' + esc(when(s.date)) + '</span>' : 'No linked figure') + '</div>' +
    (st.n ? proofBtn(mk, key, st.n) : '') + '</div></div>';
}
function viewHome() {
  const key = state.set;
  const fresh = B.filter(b => b.pfresh && b.price.wed != null && age(b.pdate) <= 7).sort((a, b) => a.pdate < b.pdate ? 1 : -1).slice(0, 8);
  const si = lastSweep ? sweepInfo(lastSweep) : null;
  const late = SOURCES.filter(s => s.st !== 'ok');
  return '<div class="view"><div class="page-h"><div><h1>Where you stand</h1><p class="sub">JD Meyers Productions as of ' + dshort(ASOF_S) + '. Every figure opens the page it came from.</p></div><label class="fld"><span>Compared with</span><select class="sel" id="setsel">' + Object.keys(SETS).map(k => '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + esc(SETS[k].label) + '</option>').join('') + '</select></label></div>' +
    '<div class="tiles">' + tile('wed', key) + tile('wedv', key) + tile('sess', key) + tile('rev', key) + tile('fol', 'all') + '</div>' +
    '<p class="note">Prices are the lowest listed price on each business\'s own site, counted only when checked in the last ' + PRICE_DAYS + ' days. Click a figure to open its source. "Verify" lists every figure behind a ranking, each with its own link. Medians show only with 8 or more peers.</p>' +
    '<div class="cols"><div><h2>What changed</h2><div class="card"><div class="list">' +
      (fresh.length ? fresh.map(b => '<div class="row"><div><div class="t">' + esc(b.name) + '</div><div class="m">Wedding photography from ' + linked('wed', b, money(b.price.wed)) + ', price ' + esc(when(b.pdate)) + '</div></div><div class="r">' + A('Source', figSrc('wed', b).url) + '</div></div>').join('') : '<div class="empty">No price was re-checked in the last 7 days.</div>') +
    '</div></div><p class="note">Shows prices re-checked in the last 7 days. The data keeps only the latest checked figure for each business, with no linked earlier version, so a rise or fall cannot be shown with a link.' + (si ? ' Last website watch: ' + si.fetched + ' of ' + B.length + ' sites, ' + dshort(si.date) + '.' : '') + '</p>' +
      (late.length ? '<p class="note">' + late.map(s => s.label + ' is ' + s.st + ' (' + ago(s.date) + ')').join('. ') + '.</p>' : '') + '</div>' +
    '<div><h2>What to do</h2><div class="card">' + (RECS.length ? RECS.slice(0, 4).map(recHtml).join('') : '<div class="empty">Nothing in the linked data calls for action today.</div>') + '</div></div></div></div>';
}
function recHtml(r) {
  return '<div class="rec"><div class="t">' + esc(r.t) + '</div><p>' + esc(r.p) + '</p><div class="w">' + esc(r.w) + '</div>' +
    (r.proof ? '<button class="proofbtn" data-proof="' + r.proof.join('|') + '">Verify the figures</button>' : r.link ? '<a class="proofbtn" href="' + r.link + '" style="display:inline-block">Open the Auditor</a>' : '') + '</div>';
}

function openProof(mk, key) {
  const st = stand(mk, key), M = METRICS[mk];
  const rows = st.list.slice().sort((a, b) => M.dir === 'asc' ? a.v - b.v : b.v - a.v);
  const body = rows.map((x, i) => { const s = figSrc(mk, x.b); return '<tr class="' + (x.b === JD ? 'me' : '') + '"><td class="muted">' + (i + 1) + '</td><td><b>' + esc(x.b.name) + '</b>' + (x.b === JD ? ' <span class="pill me">You</span>' : '') + '</td><td class="r"><b>' + A(esc(M.f(x.v)), s.url) + '</b></td><td>' + (s.url ? A(esc(host(s.url)), s.url) : '') + '<span class="s2">' + esc(s.what || '') + '</span></td><td class="muted">' + esc(s.date ? dshort(s.date) : 'no date') + '</td></tr>'; }).join('');
  const el = document.createElement('div'); el.className = 'sheet'; el.id = 'sheet';
  el.innerHTML = '<div class="sheet-in"><button class="x" aria-label="Close">×</button><h3>' + esc(M.label) + '</h3><p class="sub" style="margin-bottom:16px">' + esc(SETS[key].label) + ' · ' + rows.length + ' figures, each with its own link. ' + (mk === 'wed' || mk === 'wedv' || mk === 'sess' ? 'A price link opens the business\'s pricing page and highlights the figure where the site shows it as plain text. Otherwise the page opens and the figure is on it.' : mk === 'rev' ? 'A review link opens the listing the count was read from. The live count may be newer than the date shown.' : 'A follower link opens the Instagram profile.') + '</p>' +
    '<div class="wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th>#</th><th>Business</th><th class="r">Figure</th><th>Source</th><th>Checked</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
}

function cmpRow(label, me, them, gap) { return '<tr><td>' + esc(label) + '</td><td>' + me + '</td><td>' + them + '</td><td class="gap">' + (gap || '') + '</td></tr>'; }
function figCell(mk, b, text, sub, flag) { return A(esc(text), figSrc(mk, b).url) + (sub ? '<span class="s2' + (flag ? ' flag' : '') + '">' + sub + '</span>' : ''); }
function viewCompare() {
  const opts = B.filter(b => b !== JD).sort((a, b) => a.name.localeCompare(b.name));
  const them = state.vs && BY[state.vs] && state.vs !== JD_ID ? BY[state.vs] : null;
  let body = '';
  if (them) {
    const dif = (a, b, f) => a == null || b == null ? '' : (a === b ? 'Same' : 'They are ' + f(Math.abs(b - a)) + (b > a ? ' higher' : ' lower'));
    const src = (mk, b) => { const s = figSrc(mk, b); return s.url ? esc(host(s.url)) + ', ' + esc(when(s.date)) : ''; };
    const priceCells = k => {
      const lab = k === 'wed' ? 'Wedding photography, from' : k === 'wedv' ? 'Wedding video, from' : 'Session, from';
      const okJ = METRICS[k].val(JD) != null, okT = METRICS[k].val(them) != null;
      return cmpRow(lab, okJ ? figCell(k, JD, money(JD.price[k]), src(k, JD)) : '—', okT ? figCell(k, them, money(them.price[k]), src(k, them)) : '<span class="muted">—</span><span class="s2">' + (them.c.pricing ? (them.c.pricing_url ? 'not checked in ' + PRICE_DAYS + ' days' : 'no pricing link') : (D.pricingGaps[them.id] ? 'not published' : 'not found')) + '</span>', okJ && okT ? dif(JD.price[k], them.price[k], money) : '');
    };
    const ex = [];
    const pw = METRICS.wed.val(JD), tw = METRICS.wed.val(them);
    if (pw != null && tw != null) { const g = tw - pw; ex.push('Their wedding photography starts <b>' + money(Math.abs(g)) + (g < 0 ? ' below' : g > 0 ? ' above' : ' at') + '</b> your Essential price. Check: ' + A('their price', figSrc('wed', them).url) + ' · ' + A('your price', figSrc('wed', JD).url) + '.'); }
    if (JD.rev != null && them.rev != null) ex.push('They have <b>' + fmt(them.rev) + ' reviews</b> to your ' + fmt(JD.rev) + (them.revSrc && them.revSrc !== 'google' ? ' (their count is from ' + esc(platName(them.revSrc)) + ', not Google)' : '') + '. Check: ' + A('their listing', figSrc('rev', them).url) + ' · ' + A('your listing', figSrc('rev', JD).url) + '.');
    if (JD.ig.state === 'live' && them.ig.state === 'live') ex.push('They have <b>' + fmt(them.ig.count) + ' followers</b> to your ' + fmt(JD.ig.count) + '. Check: ' + A('their profile', figSrc('fol', them).url) + ' · ' + A('your profile', figSrc('fol', JD).url) + '.');
    const links = [['Website', them.c.website && (/^https?:/.test(them.c.website) ? them.c.website : 'https://' + them.c.website)], ['Pricing page', them.c.pricing_url], ['Reviews', them.c.review_url], ['Instagram', igUrl(them.c.ig_handle)]].filter(x => x[1]);
    body = (ex.length ? '<div class="says">' + ex.map(x => '<div>' + x + '</div>').join('') + '</div>' : '') +
      '<div class="wrap"><table class="tbl cmp"><thead><tr><th></th><th>JD Meyers Productions</th><th>' + esc(them.name) + '</th><th class="r">Gap</th></tr></thead><tbody>' +
      priceCells('wed') + priceCells('wedv') + priceCells('sess') +
      cmpRow('Reviews', JD.rev != null ? figCell('rev', JD, fmt(JD.rev) + (JD.rating != null ? ' · ' + JD.rating.toFixed(1) : ''), esc(platName(JD.revSrc)) + ', ' + esc(when(JD.rdate)), !JD.rdate) : '—',
        them.rev != null ? figCell('rev', them, fmt(them.rev) + (them.rating != null ? ' · ' + them.rating.toFixed(1) : ''), esc(platName(them.revSrc) || '') + ', ' + esc(when(them.rdate)), !them.rdate) : '<span class="muted">—</span>' + (them.revHidden ? '<span class="s2">no listing link</span>' : ''), dif(JD.rev, them.rev, fmt)) +
      cmpRow('Instagram followers', JD.ig.state === 'live' ? figCell('fol', JD, fmt(JD.ig.count), src('fol', JD)) : '—',
        them.ig.state === 'live' ? figCell('fol', them, fmt(them.ig.count), src('fol', them)) : '<span class="muted">—</span><span class="s2">' + (them.c.ig_handle ? 'not pulled in the last 2 days' : 'no handle') + '</span>', JD.ig.state === 'live' && them.ig.state === 'live' ? dif(JD.ig.count, them.ig.count, fmt) : '') +
      cmpRow('Services (from the pricing page)', lanePills(JD), lanePills(them), '') +
      cmpRow('Based in (roster)', esc(JD.town), esc(them.town), '') +
      '</tbody></table></div>' +
      '<h2>Sources for ' + esc(them.name) + '</h2><div class="card"><div class="srcs">' + (links.length ? links.map(l => '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + l[0] + '</a>').join('') : '<span class="muted">No links on record. Nothing about this business can be shown.</span>') + '</div><p class="note">Only figures with a working link are shown above. Anything missing here has no link on record.</p></div>';
  } else body = '<h2>Closest to you</h2><div class="tiles c3">' + opts.filter(b => b.region === JD.region && b.ig && b.ig.count != null).sort((x, y) => Math.abs(x.ig.count - JD.ig.count) - Math.abs(y.ig.count - JD.ig.count)).slice(0, 6).map(b => '<a class="card hov pick" href="#compare/' + encodeURIComponent(b.id) + '"><b>' + esc(b.name) + '</b><span>' + esc(b.town) + '</span></a>').join('') + '</div>';
  return '<div class="view"><div class="page-h"><div><h1>Compare</h1><p class="sub">JD Meyers Productions next to any competitor. Every figure is a link to where it can be checked.</p></div>' +
    '<select class="sel" id="vssel"><option value="">Choose a business</option>' + opts.map(b => '<option value="' + esc(b.id) + '"' + (them && b.id === them.id ? ' selected' : '') + '>' + esc(b.name) + ' · ' + esc(b.town.replace(/, NY.*/, '')) + '</option>').join('') + '</select></div>' + body + '</div>';
}

function marketRows() {
  const q = flat(state.q);
  let list = B.filter(b => (!q || flat(b.name + ' ' + b.town).indexOf(q) >= 0) && (state.region === 'all' || b.region === state.region) && (state.lane === 'all' || b.lanes.indexOf(state.lane) >= 0));
  const k = state.sort.k, dir = state.sort.dir;
  const val = { name: b => b.name.toLowerCase(), fol: METRICS.fol.val, wed: METRICS.wed.val, sess: METRICS.sess.val, rev: METRICS.rev.val }[k];
  return list.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return a.name.localeCompare(b.name); if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
}
function viewMarket() {
  const list = marketRows();
  const th = (k, l, r) => '<th class="s' + (r ? ' r' : '') + '" data-sort="' + k + '">' + l + (state.sort.k === k ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>';
  const cellM = (mk, b, f) => { const v = METRICS[mk].val(b); return v == null ? '<span class="muted">—</span>' : linked(mk, b, f(v)); };
  const body = list.map(b => {
    const web = b.c.website ? ' <a class="sa" href="' + esc(/^https?:/.test(b.c.website) ? b.c.website : 'https://' + b.c.website) + '" target="_blank" rel="noopener" title="Opens ' + esc(host(/^https?:/.test(b.c.website) ? b.c.website : 'https://' + b.c.website)) + '"></a>' : '';
    return '<tr class="c' + (b === JD ? ' me' : '') + '" data-vs="' + esc(b.id) + '"><td><b>' + esc(b.name) + '</b>' + web + (b === JD ? ' <span class="pill me">You</span>' : '') + '<span class="s2">' + esc(b.town) + '</span></td><td>' + lanePills(b) + '</td>' +
      '<td class="r">' + cellM('fol', b, fmt) + '</td><td class="r">' + cellM('wed', b, money) + '</td><td class="r">' + cellM('sess', b, money) + '</td>' +
      '<td class="r">' + (b.rev != null ? linked('rev', b, fmt(b.rev)) + (b.rdate ? '' : '<span class="s2 flag">no check date</span>') : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="view"><div class="page-h"><div><h1>Market</h1><p class="sub">' + B.length + ' businesses. Click a row to compare it with yours, or click a figure to open its source. A dash means no linked, current figure.</p></div></div>' +
    '<div class="ctl"><input class="in" id="q" placeholder="Search name or town" value="' + esc(state.q) + '"><select class="sel" id="reg"><option value="all">All regions</option>' + Object.keys(REGION).map(r => '<option value="' + r + '"' + (state.region === r ? ' selected' : '') + '>' + REGION[r] + '</option>').join('') + '</select>' +
    '<select class="sel" id="lane"><option value="all">All services</option>' + LANES.map(l => '<option value="' + l[0] + '"' + (state.lane === l[0] ? ' selected' : '') + '>' + l[1] + '</option>').join('') + '</select></div>' +
    '<div class="wrap"><table class="tbl mkt"><thead><tr>' + th('name', 'Business') + '<th>Services</th>' + th('fol', 'Followers', 1) + th('wed', 'Wedding from', 1) + th('sess', 'Session from', 1) + th('rev', 'Reviews', 1) + '</tr></thead><tbody>' + (body || '<tr><td colspan="6"><div class="empty">No matches.</div></td></tr>') + '</tbody></table></div></div>';
}

function viewAI() {
  if (!ENG_OK.length) {
    return '<div class="view"><div class="page-h"><div><h1>AI Visibility</h1><p class="sub">Who the assistants name when a stranger asks.</p></div></div>' +
      '<div class="card"><h3>No AI answers can be shown yet</h3><p class="sub" style="margin-top:8px">' + AI_ALL.length + ' answers are on record from ' + ENGINES.map(e => e).join(' and ') + ', and none of them links to the conversation. Without a link nobody can check what the assistant said, so none are used.</p>' +
      '<p class="sub" style="margin-top:10px">To turn this page on: when Muse runs a prompt in a signed-out chat, save the share link for that chat in the answer row\'s <b>url</b> field. Rows with a link appear here by themselves on the next build.</p></div></div>';
  }
  const act = ACTIVE, eng = ENG_OK;
  const top = {};
  eng.forEach(e => Object.keys(AI[e].cur.ids).forEach(id => top[id] = (top[id] || 0) + AI[e].cur.ids[id]));
  let tl = Object.keys(top).sort((a, b) => top[b] - top[a]).slice(0, 10);
  if (tl.indexOf(JD.id) < 0 && top[JD.id]) tl.push(JD.id);
  const mx = Math.max.apply(null, tl.map(id => top[id]).concat([1])), den = eng.reduce((s, e) => s + AI[e].cur.den, 0);
  const prow = act.map(p => {
    const cellFor = e => { const r = AI[e].cur.rows.find(x => x.prompt_id === p.id); if (!r) return '<td class="muted">—</td>'; const names = (r.named || []).map(clean); const jd = (r.named || []).some(n => matchName(n) === JD.id);
      return '<td>' + (jd ? '<span class="pill me">You</span>' : '<span class="pill">Not you</span>') + A('Open the answer', r.url) + '<span class="s2">' + names.length + ' named' + (names.length ? ': ' + esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? '…' : '') : '') + '</span></td>'; };
    return '<tr><td>' + esc(p.text) + '</td>' + eng.map(cellFor).join('') + '</tr>';
  }).join('');
  const tiles = eng.map(e => { const n = AI[e].cur.ids[JD.id] || 0; return '<div class="card tile hov"><div class="k">Named by ' + e + '</div><div class="n">' + n + '<small>of ' + AI[e].cur.den + ' prompts</small></div><div class="d">Signed-out chat, ' + dshort(AI[e].last) + ', directional</div></div>'; }).join('');
  return '<div class="view"><div class="page-h"><div><h1>AI Visibility</h1><p class="sub">Who the assistants name when a stranger asks. Only answers with a link to the conversation are counted. Counts, not percentages, and directional only.</p></div></div>' +
    '<div class="tiles">' + tiles + '</div>' +
    '<h2>Most named, both assistants</h2><div class="card"><div class="bars">' + tl.map(id => '<div class="bar-r2' + (id === JD.id ? ' me' : '') + '"><span>' + esc(BY[id].name) + '</span><span class="tr"><i style="width:0" data-w="' + (top[id] / mx * 100).toFixed(1) + '"></i></span><b>' + top[id] + '</b></div>').join('') + '</div><p class="note">Out of ' + den + ' linked answers in the latest audits.</p></div>' +
    '<h2>Prompt by prompt, latest audit</h2><div class="wrap"><table class="tbl"><thead><tr><th>Prompt</th>' + eng.map(e => '<th>' + e + '</th>').join('') + '</tr></thead><tbody>' + prow + '</tbody></table></div></div>';
}

function viewCouncil() {
  const key = 'slcwed';
  const lines = k => k.filter(Boolean).map(x => '<div class="row"><div class="t" style="font-weight:500">' + x + '</div></div>').join('');
  const stl = (mk, k) => { const st = stand(mk, k); if (st.me == null) return null; const M = METRICS[mk]; return esc(M.label) + ': ' + linked(mk, JD, M.f(st.me)) + ', ' + esc(rankText(mk, st).toLowerCase()) + (st.med != null ? ', peer median ' + esc(M.f(st.med)) : st.n > 1 ? ', range ' + esc(M.f(st.min)) + ' to ' + esc(M.f(st.max)) : ''); };
  const hiFind = FINDINGS.filter(f => f.sev === 'high').length;
  const priced = B.filter(b => b.lanes.indexOf('wed') >= 0 && b.region === 'slc'), pubd = priced.filter(b => b.pfresh && b.price.wed != null).length;
  const aiLines = ENG_OK.length ? ENG_OK.map(e => esc(e) + ': named in ' + (AI[e].cur.ids[JD.id] || 0) + ' of ' + AI[e].cur.den + ' linked answers (' + dshort(AI[e].last) + ')') : ['No answer links to its conversation, so none are used. See AI Visibility.'];
  const fs = stand('fol', 'all');
  const depts = [
    ['Data Integrity', 'The Auditor. Traces figures to where they came from.', [FINDINGS.length + ' open ' + plural(FINDINGS.length, 'finding') + ', ' + hiFind + ' high severity', hiFind ? esc(FINDINGS.filter(f => f.sev === 'high')[0].title) : 'No high-severity findings'], null, 'audit', 'Open the Auditor'],
    ['Pricing and Offers', 'What competitors charge and where you sit.', [stl('wed', key), stl('wedv', key), stl('sess', 'slc'), pubd + ' of ' + priced.length + ' St. Lawrence County wedding businesses have a linked, current price'], ['wed', key, stand('wed', key).n], null],
    ['AI Visibility', 'Who the assistants name.', aiLines, null, 'ai', 'Open AI Visibility'],
    ['Social', 'Instagram reach.', [fs.me != null ? 'Followers ' + linked('fol', JD, fmt(fs.me)) + ', ' + esc(rankText('fol', fs).toLowerCase()) + ' tracked accounts' : null, igTracked + ' of ' + igHandles + ' roster handles are tracked daily', 'Follower movement is not shown: it has no link that proves it.'], ['fol', 'all', fs.n], null],
    ['JD Funnel', 'Inquiries, replies, bookings, conversion.', ['Not connected. This is the only department that can show whether a recommendation worked. It needs inquiry and booking counts from your own email and Square.'], null, null]
  ];
  return '<div class="view"><div class="page-h"><div><h1>Council</h1><p class="sub">Each department reads the linked data and gives short, dated verdicts, as of ' + dshort(ASOF_S) + '.</p></div></div>' +
    '<div class="tiles c3">' + depts.map((d, i) => '<div class="card hov dept' + (i === depts.length - 1 ? ' wide' : '') + '"><h3>' + esc(d[0]) + '</h3><p class="note dsub">' + esc(d[1]) + '</p><div class="list">' + lines(d[2]) + '</div>' + (d[3] && d[3][2] ? proofBtn(d[3][0], d[3][1], d[3][2]) : '') + (d[4] ? '<p class="more"><a href="#' + d[4] + '">' + d[5] + ' \u2192</a></p>' : '') + '</div>').join('') + '</div>' +
    '<h2>Recommendations</h2><div class="card">' + (RECS.length ? RECS.map(recHtml).join('') : '<div class="empty">Nothing in the linked data calls for action today.</div>') + '</div>' +
    '<p class="note">Rules for every recommendation: it uses only linked figures, names the number of businesses behind it, is not built from a one-week change, and says what result would show it was wrong.</p></div>';
}

function viewAudit() {
  const sevPill = s => '<span class="pill ' + (s === 'high' ? 'b' : s === 'med' ? 'w' : '') + '">' + (s === 'high' ? 'High' : s === 'med' ? 'Medium' : 'Low') + '</span>';
  return '<div class="view"><div class="page-h"><div><h1>Auditor</h1><p class="sub">Looks for figures that are wrong because this tool treated its own records as proof, and for figures with no link to check. Each finding shows the chain back to the file it came from. Checked live on every build.</p></div></div>' +
    '<div class="card">' + (FINDINGS.length ? FINDINGS.map(f => '<div class="fnd"><div class="t">' + sevPill(f.sev) + ' ' + esc(f.title) + '</div><p>' + esc(f.text) + '</p><div class="chain">' + esc(f.chain) + '</div></div>').join('') : '<div class="empty">No findings.</div>') + '</div>' +
    '<p class="note">Traced to files only. The Auditor cannot open a competitor\'s website for you. Use the links on each figure to check it against the business\'s own page.</p></div>';
}

function viewSources() {
  const rows = SOURCES.map(s => '<tr><td><b>' + esc(s.label) + '</b></td><td><span class="pill ' + (s.st === 'ok' ? 'g' : s.st === 'late' ? 'w' : s.st === 'stalled' ? 'b' : '') + '">' + ({ ok: 'Current', late: 'Late', stalled: 'Stalled', none: 'No data' }[s.st]) + '</span></td><td>' + esc(ago(s.date)) + '</td><td class="muted">' + esc(s.cover) + '</td><td class="muted">' + (s.win ? esc(s.win.cadence) + '. Late after ' + s.win.late_after_days + ' days.' : '') + '</td></tr>').join('');
  const fix = SOURCES.filter(s => s.st !== 'ok' && s.win).map(s => '<div class="row"><div><div class="t">' + esc(s.label) + '</div><div class="m">' + esc(s.win.fix) + '</div></div></div>').join('');
  const cov = COVERAGE.map(c => '<tr><td><b>' + esc(c[0]) + '</b></td><td class="r">' + c[1] + ' of ' + c[2] + '</td><td class="muted">' + esc(c[3]) + '</td></tr>').join('');
  return '<div class="view"><div class="page-h"><div><h1>Sources</h1><p class="sub">Where every number comes from, how recently it was checked, and which figures are hidden because they have no link.</p></div></div>' +
    '<h2>Link coverage</h2><div class="wrap"><table class="tbl"><thead><tr><th>Kind of figure</th><th class="r">Shown</th><th>How it is checked</th></tr></thead><tbody>' + cov + '</tbody></table></div>' +
    '<h2>Freshness</h2><div class="wrap"><table class="tbl"><thead><tr><th>Source</th><th>Status</th><th>Last checked</th><th>Coverage</th><th>Schedule</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (fix ? '<h2>What to run</h2><div class="card"><div class="list">' + fix + '</div></div>' : '') +
    '<h2>Left off the roster</h2><div class="card"><div class="list">' + D.excluded.map(x => '<div class="row"><div><div class="t">' + esc(clean(x.name)) + '</div><div class="m">' + esc(clean(x.reason)) + '</div></div></div>').join('') + '</div></div></div>';
}

/* ---------- router and effects ---------- */
const VIEWS = { home: viewHome, compare: viewCompare, market: viewMarket, ai: viewAI, council: viewCouncil, audit: viewAudit, sources: viewSources };
function route() {
  const h = (location.hash || '#home').slice(1).split('/');
  const v = VIEWS[h[0]] ? h[0] : 'home';
  if (v === 'compare' && h[1]) state.vs = decodeURIComponent(h[1]);
  render(v);
}
function render(v) {
  stage.innerHTML = VIEWS[v]();
  stage.scrollTop = 0;
  $$('#nav button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === v));
  moveThumb();
  bind(v);
  fx();
}
function fx() {
  countUp();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.strip [data-to]').forEach((el, i) => { el.style.transitionDelay = (el.tagName === 'B' ? 80 : Math.min(i, 24) * 8) + 'ms'; el.style.left = el.dataset.to + '%'; if (el.tagName === 'I') el.classList.add('on'); });
    $$('.bar-r2 .tr i').forEach((el, i) => { el.style.transitionDelay = (60 + i * 30) + 'ms'; el.style.width = el.dataset.w + '%'; });
  }));
}
function countUp() {
  if (REDUCED) return;
  $$('.tile .n').forEach(el => {
    const holder = el.querySelector('a') || el, tn = holder.firstChild; if (!tn || tn.nodeType !== 3) return;
    const m = /^(\$?)([\d,]+)$/.exec(tn.nodeValue.trim()); if (!m) return;
    const target = +m[2].replace(/,/g, ''), pre = m[1], t0 = performance.now(), dur = 700;
    (function step(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); tn.nodeValue = pre + Math.round(target * e).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(step); })(t0);
  });
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
    $$('tr[data-vs]').forEach(tr => tr.onclick = e => { if (e.target.closest('a') || tr.dataset.vs === JD_ID) return; location.hash = '#compare/' + encodeURIComponent(tr.dataset.vs); });
  }
}
stage.addEventListener('click', e => { const b = e.target.closest('[data-proof]'); if (b) { const p = b.dataset.proof.split('|'); openProof(p[0], p[1]); } });
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
