/* Business Pulse front end. One file, no dependencies, works from file://.
   Reads window.PULSE_DATA (data/data.js) plus three research bundles. Never fetches anything.
   Rule that shapes everything below: a figure is live, dated (muted, with its date) or absent.
   Dated figures never enter a ranking, a median or a count. */
(function () {
'use strict';

/* ---------- data ---------- */
const D = Object.assign({ competitors: [], excluded: [], connections: [], igFollowersHistory: {}, igActivity: [], webSweepHistory: [],
  aiChecks: [], aiPrompts: { prompts: [] }, townCoords: { coords: {}, aliases: {} }, seedDates: {}, seedMeta: {}, freshness: { sources: [] } }, window.PULSE_DATA || {});
const DET = window.PULSE_DETAILS || {};
const VEN = window.PULSE_VENUES || [];
const WI = (window.PULSE_WEBSITE_INTEL || {}).intel || {};

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
const dlong = new Date(ASOF * DAY).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const age = s => { const n = dn(s); return n == null ? null : ASOF - n; };
const ageText = a => a == null ? 'no date' : a <= 0 ? 'today' : a === 1 ? 'yesterday' : a + ' days ago';
const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
const money = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const signed = n => n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const plural = (n, a, b) => n === 1 ? a : (b || a + 's');
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- freshness ---------- */
const SRC = {}; (D.freshness.sources || []).forEach(s => SRC[s.id] = s);
function stat(id, a) {
  const s = SRC[id]; if (!s || a == null) return 'none';
  if (a >= s.stalled_after_days) return 'stalled';
  if (a > s.late_after_days) return 'late';
  return 'ok';
}
const maxDate = arr => arr.reduce((m, x) => x && (!m || x > m) ? x : m, null);
const ACTIVE = (D.aiPrompts.prompts || []).filter(p => !p.retired);
const ACTIVE_IDS = new Set(ACTIVE.map(p => p.id));
const AIROWS = (D.aiChecks || []).filter(r => ACTIVE_IDS.has(r.prompt_id));
const SD = D.seedDates || {};
const DATES = {
  ig: maxDate(D.igActivity.map(r => r.date)),
  ai: maxDate(AIROWS.map(r => r.date)),
  web: maxDate(D.webSweepHistory.map(w => w.date)),
  reviews: SD.reviews && SD.reviews.collected,
  pricing: SD.pricing && SD.pricing.collected,
  recency: (D.seedMeta || {}).recency,
  roster: (D.builtAt || '').slice(0, 10)
};
const SS = (D.freshness.sources || []).map(s => {
  const a = age(DATES[s.id]);
  return Object.assign({}, s, { date: DATES[s.id], age: a, st: stat(s.id, a) });
});
const SSBY = {}; SS.forEach(s => SSBY[s.id] = s);
const STTXT = { ok: 'Current', late: 'Late', stalled: 'Stalled', none: 'No data' };

/* ---------- instagram state ---------- */
const ROWS = {};
D.igActivity.forEach(r => (ROWS[r.handle] = ROWS[r.handle] || []).push(r));
Object.keys(ROWS).forEach(h => ROWS[h].sort((a, b) => a.date < b.date ? -1 : 1));
const CARRIED = /pull failed|carried|not pulled/i;
function igState(h) {
  const rows = h && ROWS[h]; if (!rows) return { state: 'none' };
  const last = rows[rows.length - 1];
  const liveRows = rows.filter(r => !CARRIED.test(r.activity || '') && r.followers != null);
  const lastLive = liveRows[liveRows.length - 1];
  if (!lastLive) return { state: 'carried', count: last.followers, date: null };
  if (last === lastLive && age(last.date) <= SRC.ig.late_after_days) return { state: 'live', count: last.followers, date: last.date };
  return { state: CARRIED.test(last.activity || '') ? 'carried' : 'late', count: lastLive.followers, date: lastLive.date };
}
function delta7(h) {
  const hs = D.igFollowersHistory[h]; if (!hs || hs.length < 2) return null;
  const last = hs[hs.length - 1], t = dn(last.date) - 7; let base = null;
  hs.forEach(e => { if (dn(e.date) <= t) base = e; });
  return base ? last.count - base.count : null;
}

/* ---------- pricing parse (derived from the verified text, which is always shown in full) ---------- */
const P_SKIP = /deposit|retainer|booth|print|travel|second[- ]?shooter|disk|usb|add-?on|extra|album|mini/i;
const AMT = /\$\s?(\d[\d,]*(?:\.\d+)?)/;
function parsePrice(txt) {
  const out = { wed: null, sess: null };
  if (!txt) return out;
  const w = [], s = [];
  String(txt).split(/;|\||,(?!\d{3})/).forEach(cl => {
    const c = cl.toLowerCase(); if (P_SKIP.test(c)) return;
    const m = AMT.exec(cl); if (!m) return;
    const a = parseFloat(m[1].replace(/,/g, '')); if (a < 50) return;
    if (/\/\s?(hr|hour)|per hour|hourly/.test(c)) return;
    if (/wedding|elopement|bridal/.test(c) && !/video|film|cinema/.test(c)) { if (a >= 500) w.push(a); }
    else if (/portrait|session|senior|family|families|headshot|maternity|newborn|couple/.test(c) && !/wedding|video|film|drone|real estate/.test(c)) s.push(a);
  });
  out.wed = w.length ? Math.min.apply(null, w) : null;
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

/* ---------- business model ---------- */
const REGION = { slc: 'St. Lawrence County', adjacent: 'Adjacent', unconfirmed: 'Unconfirmed' };
const RCOL = { slc: '#5ea6e6', adjacent: '#d2bf9f', unconfirmed: '#6f7b8f' };
const REC_ST = stat('recency', age(DATES.recency));
const B = D.competitors.map(c => {
  const ig = igState(c.ig_handle);
  const d7 = ig.state === 'live' ? delta7(c.ig_handle) : null;
  const hs = D.igFollowersHistory[c.ig_handle];
  const pv = (SD.pricing && SD.pricing.per && SD.pricing.per[c.id]) || DATES.pricing;
  const rv = (SD.reviews && SD.reviews.per && SD.reviews.per[c.id]) || DATES.reviews;
  const pst = c.pricing ? stat('pricing', age(pv)) : 'none';
  const rst = c.review_count != null ? stat('reviews', age(rv)) : 'none';
  const pp = parsePrice(c.pricing);
  const lastLive = c.last_post_date && ((ig.state === 'live') || REC_ST === 'ok');
  return {
    c, id: c.id, name: clean(c.name), town: c.town || '', region: c.region || 'unconfirmed', county: c.county || '',
    lanes: lanesOf(c), ig, d7, spark: hs ? hs.slice(-28).map(e => e.count) : null,
    last: { date: c.last_post_date, live: !!lastLive },
    pst, pdate: pv, price: pp, wedLive: pst === 'ok' ? pp.wed : null, sessLive: pst === 'ok' ? pp.sess : null,
    rev: { count: c.review_count, rating: c.review_rating, st: rst, date: rv, live: rst === 'ok' }
  };
});
const BY = {}; B.forEach(b => BY[b.id] = b);
const LIVEIG = B.filter(b => b.ig.state === 'live');
const V = VEN.map(v => {
  const ig = igState(v.ig_handle);
  return { v, id: 'v:' + v.id, name: clean(v.name), town: v.town || '', region: v.region || 'unconfirmed', ig };
});
const VBY = {}; V.forEach(x => VBY[x.id] = x);

/* ---------- ai ---------- */
const STOP = new Set(['photography', 'photographer', 'photographers', 'photo', 'photos', 'llc', 'inc', 'studio', 'studios', 'media', 'films', 'film', 'video', 'videography', 'productions', 'production', 'services', 'the', 'and', 'co', 'company', 'by']);
const flat = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const stripped = s => flat(s).split(' ').filter(w => !STOP.has(w)).join(' ');
const ALIAS = {};
const NAMEMAP = {};
(function () {
  const cnt = {};
  B.forEach(b => { const k = stripped(b.name); if (k) cnt[k] = (cnt[k] || 0) + 1; });
  B.forEach(b => { NAMEMAP[flat(b.name)] = b.id; const k = stripped(b.name); if (k && cnt[k] === 1) NAMEMAP[k] = b.id; });
})();
function matchName(n) {
  const f = flat(n); if (NAMEMAP[f]) return NAMEMAP[f];
  const s = stripped(n); if (s && NAMEMAP[s]) return NAMEMAP[s];
  if (ALIAS[f]) return ALIAS[f];
  return null;
}
function latestFor(engine) {
  const rows = AIROWS.filter(r => r.engine === engine);
  const d = maxDate(rows.map(r => r.date));
  return { date: d, rows: rows.filter(r => r.date === d) };
}
const ENGINES = ['ChatGPT', 'Gemini'];
const AI = {};
ENGINES.forEach(e => AI[e] = latestFor(e));
function aiCompute(lane) {
  const pids = new Set(ACTIVE.filter(p => !lane || lane === 'all' || (p.services || []).indexOf(lane) >= 0).map(p => p.id));
  const res = { prompts: pids.size, den: {}, ids: {}, off: {}, answered: 0 };
  ENGINES.forEach(e => { res.den[e] = 0; });
  AIROWS.length;
  ENGINES.forEach(e => {
    AI[e].rows.forEach(r => {
      if (!pids.has(r.prompt_id) || !r.completed) return;
      res.den[e]++; res.answered++;
      const seen = new Set();
      (r.named || []).forEach(n => {
        const id = matchName(n);
        if (id) { if (seen.has(id)) return; seen.add(id); const o = res.ids[id] = res.ids[id] || { ChatGPT: 0, Gemini: 0, total: 0 }; o[e]++; o.total++; }
        else if (!/[$()\[\];,]/.test(n)) { const k = flat(n); const o = res.off[k] = res.off[k] || { name: clean(n), ChatGPT: 0, Gemini: 0, total: 0 }; o[e]++; o.total++; }
      });
    });
  });
  return res;
}

/* ---------- web sweep ---------- */
const SW = D.webSweepHistory.slice().sort((a, b) => a.date < b.date ? -1 : 1);
function sweepInfo(w) {
  if (!w) return null;
  const pages = w.pages || {}, ks = Object.keys(pages);
  let ch = 0, un = 0; const changed = [];
  ks.forEach(k => { const s = (pages[k].status || '').toLowerCase(); if (s === 'changed') { ch++; changed.push({ id: k, note: pages[k].note }); } else if (s === 'unreachable') un++; });
  const of = w.of_total != null ? w.of_total : ks.length;
  const fetched = w.fetched != null ? w.fetched : ks.length - un;
  return { date: w.date, label: w.run_label, of, fetched, ch, un, changed };
}

/* ---------- ui bits ---------- */
const state = { view: 'brief', q: '', lane: 'all', region: 'all', sort: { k: 'fol', dir: -1 }, kind: 'biz', sel: null, aiLane: 'all', aiOpen: {}, mapTown: null, mapVen: false, aiZero: false };
const stage = $('#stage'), drawer = $('#drawer');
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1800); }
function copyText(text, msg) {
  const done = () => toast(msg || 'Copied');
  const fb = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy blocked. Select the text manually.'); } ta.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
}
function spark(a, w, h) {
  w = w || 78; h = h || 24;
  if (!a || a.length < 2) return '<span class="muted">—</span>';
  const mn = Math.min.apply(null, a), mx = Math.max.apply(null, a), r = mx - mn || 1;
  const pts = a.map((v, i) => [(i / (a.length - 1)) * (w - 4) + 2, h - 3 - ((v - mn) / r) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const l = pts[pts.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '"><path d="' + d + '" fill="none" stroke="#5ea6e6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + l[0].toFixed(1) + '" cy="' + l[1].toFixed(1) + '" r="2.2" fill="#8fcaff"/></svg>';
}
function bigChart(a, dates) {
  const w = 396, h = 92, pl = 4, pr = 4, pt = 8, pb = 18;
  const mn = Math.min.apply(null, a), mx = Math.max.apply(null, a), r = mx - mn || 1;
  const pts = a.map((v, i) => [pl + (i / (a.length - 1)) * (w - pl - pr), pt + (h - pt - pb) - ((v - mn) / r) * (h - pt - pb)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const area = line + 'L' + pts[pts.length - 1][0] + ' ' + (h - pb) + 'L' + pts[0][0] + ' ' + (h - pb) + 'Z';
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Follower history"><defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ea6e6" stop-opacity=".28"/><stop offset="1" stop-color="#5ea6e6" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#gf)"/><path d="' + line + '" fill="none" stroke="#8fcaff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<text x="' + pl + '" y="' + (h - 3) + '" fill="#6f7c90" font-size="10.5">' + esc(dshort(dates[0])) + ' · ' + fmt(a[0]) + '</text>' +
    '<text x="' + (w - pr) + '" y="' + (h - 3) + '" text-anchor="end" fill="#a6b1c3" font-size="10.5">' + esc(dshort(dates[dates.length - 1])) + ' · ' + fmt(a[a.length - 1]) + '</text></svg>';
}
const pill = (t, c) => '<span class="pill ' + (c || '') + '">' + esc(t) + '</span>';
const RSHORT = { slc: 'St. Lawrence', adjacent: 'Adjacent', unconfirmed: 'Unconfirmed' };
const regPill = (r, long) => pill(long ? (REGION[r] || r) : (RSHORT[r] || r), r === 'slc' ? 'ice' : r === 'adjacent' ? 'tan' : 'gray');
const empty = (t, s) => '<div class="empty"><b>' + esc(t) + '</b>' + (s ? '<span>' + esc(s) + '</span>' : '') + '</div>';
function countUp(root) {
  if (REDUCED) return;
  $$('[data-count]', root).forEach(el => {
    const to = +el.dataset.count, t0 = performance.now(), dur = 750;
    const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.firstChild.nodeValue = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
    el.firstChild.nodeValue = '0'; requestAnimationFrame(step);
  });
}
const num = n => '<span class="num" data-count="' + n + '">' + fmt(n) + '</span>';

/* ---------- cells ---------- */
function cFollowers(b) {
  if (b.ig.state === 'live') return '<span class="val">' + fmt(b.ig.count) + '</span>';
  if (b.ig.state === 'none') return '<span class="muted">—</span>';
  return '<span class="dated" data-tip="Not refreshed today. Excluded from rankings.">' + fmt(b.ig.count) + '<small>' + (b.ig.date ? 'as of ' + esc(dshort(b.ig.date)) : 'carried') + '</small></span>';
}
function cD7(b) {
  if (b.ig.state !== 'live' || b.d7 == null) return '<span class="muted">—</span>';
  return '<span class="val ' + (b.d7 > 0 ? 'up' : b.d7 < 0 ? 'down' : 'flat') + '">' + signed(b.d7) + '</span>';
}
function cLast(b) {
  if (!b.last.date) return '<span class="muted">—</span>';
  const a = age(b.last.date);
  if (b.last.live) return '<span class="val">' + esc(dshort(b.last.date)) + '<small>' + ageText(a) + '</small></span>';
  return '<span class="dated">' + esc(dshort(b.last.date)) + '<small>unverified</small></span>';
}
function cPrice(b, k) {
  const v = b.price[k]; if (v == null) return '<span class="muted">—</span>';
  if (b.pst === 'ok') return '<span class="val">' + money(v) + '</span>';
  return '<span class="dated">' + money(v) + '<small>as of ' + esc(dshort(b.pdate)) + '</small></span>';
}
function cRev(b) {
  if (b.rev.count == null) return '<span class="muted">—</span>';
  const t = fmt(b.rev.count) + (b.rev.rating != null ? ' · ' + Number(b.rev.rating).toFixed(1) : '');
  return b.rev.live ? '<span class="val">' + t + '</span>' : '<span class="dated">' + t + '<small>as of ' + esc(dshort(b.rev.date)) + '</small></span>';
}

/* ---------- BRIEF ---------- */
function fchips() {
  return '<div class="fresh">' + SS.map(s => {
    const v = s.date ? ageText(s.age) : 'No data';
    const a = s.st === 'ok' ? s.cadence : s.st === 'late' ? 'Late. ' + s.cadence : s.st === 'stalled' ? 'Stalled since ' + dshort(s.date) : 'Not recorded';
    return '<button class="fchip ' + s.st + '" data-go="data" data-tip="' + esc(s.feeds) + '"><span class="l"><i class="dot ' + (s.st === 'ok' ? 'ok' : s.st) + '"></i>' + esc(s.label) + '</span><span class="v">' + esc(v) + '</span><span class="a">' + esc(a) + '</span></button>';
  }).join('') + '</div>';
}
function panel(title, sub, body, link) {
  return '<section class="panel"><div class="panel-h"><h2>' + esc(title) + '</h2>' + (link ? '<button class="link" data-go="' + link[1] + '">' + esc(link[0]) + '</button>' : '<span class="sub">' + esc(sub || '') + '</span>') + '</div><div class="panel-b">' + body + '</div></section>';
}
function liRow(b, rt, sb) {
  return '<button class="li" data-open="' + esc(b.id) + '"><span><span class="nm">' + esc(b.name) + '</span><br><span class="sb">' + esc(sb || b.town) + '</span></span><span class="rt">' + rt + '</span></button>';
}
function viewBrief() {
  const n = B.length;
  const reg = { slc: 0, adjacent: 0, unconfirmed: 0 }; B.forEach(b => reg[b.region] = (reg[b.region] || 0) + 1);
  const wed = B.map(b => b.wedLive).filter(x => x != null), ses = B.map(b => b.sessLive).filter(x => x != null);
  const withHandle = B.filter(b => b.c.ig_handle).length;
  const tiles = '<div class="tiles">' +
    '<div class="tile"><div class="n">' + num(n) + '</div><div class="t">Businesses tracked</div></div>' +
    '<div class="tile"><div class="n">' + num(LIVEIG.length) + '<small>of ' + withHandle + '</small></div><div class="t">Instagram live today</div></div>' +
    '<div class="tile"><div class="n">' + (wed.length ? money(median(wed)) : '—') + '</div><div class="t">Median wedding, from · ' + wed.length + ' priced</div></div>' +
    '<div class="tile"><div class="n">' + (ses.length ? money(median(ses)) : '—') + '</div><div class="t">Median session, from · ' + ses.length + ' priced</div></div></div>' +
    '<div class="stack">' + ['slc', 'adjacent', 'unconfirmed'].map(r => '<i style="flex-grow:' + (reg[r] || 0) + ';background:' + RCOL[r] + '"></i>').join('') + '</div>' +
    '<div class="legend">' + ['slc', 'adjacent', 'unconfirmed'].map(r => '<span><i style="background:' + RCOL[r] + '"></i>' + REGION[r] + ' ' + (reg[r] || 0) + '</span>').join('') + '</div>';

  const mv = LIVEIG.filter(b => b.d7 != null).sort((a, b) => Math.abs(b.d7) - Math.abs(a.d7) || a.name.localeCompare(b.name)).slice(0, 5);
  const ig = SSBY.ig;
  let movers;
  if (ig.st === 'stalled') movers = '<div class="banner red">Instagram has not refreshed since ' + esc(dshort(ig.date)) + '. Movement is hidden until it does.</div>';
  else movers = mv.length ? '<div class="list">' + mv.map(b => liRow(b, '<span class="' + (b.d7 > 0 ? 'up' : b.d7 < 0 ? 'down' : 'flat') + '">' + signed(b.d7) + '</span><small>' + fmt(b.ig.count) + '</small>')).join('') + '</div>' : empty('No movement yet', 'Needs 7 days of live history.');

  const ac = aiCompute('all');
  const top = Object.keys(ac.ids).map(id => ({ b: BY[id], o: ac.ids[id] })).sort((a, b) => b.o.total - a.o.total || a.b.name.localeCompare(b.b.name)).slice(0, 5);
  const aiBody = !ac.answered ? empty('No audit recorded') : SSBY.ai.st === 'stalled' ? '<div class="banner red">The latest audit is from ' + esc(dshort(DATES.ai)) + ' (' + ageText(SSBY.ai.age) + '). Nothing is ranked from it until a new audit is recorded.</div>' :
    '<div class="list">' + top.map(t => liRow(t.b, '<span class="num">' + t.o.total + '</span><small>of ' + ac.answered + ' answers</small>', 'ChatGPT ' + t.o.ChatGPT + ' of ' + ac.den.ChatGPT + ' · Gemini ' + t.o.Gemini + ' of ' + ac.den.Gemini)).join('') + '</div>';

  const bands = [['Past week', 0, 7, '#8fcaff'], ['8 to 30 days', 8, 30, '#5ea6e6'], ['31 to 90 days', 31, 90, '#d2bf9f'], ['Over 90 days', 91, 1e9, '#6f7b8f']];
  const tr = LIVEIG.filter(b => b.last.date);
  const bc = bands.map(x => tr.filter(b => { const a = age(b.last.date); return a >= x[1] && a <= x[2]; }).length);
  const recBody = tr.length ? '<div class="stack" style="height:12px;margin-top:6px">' + bands.map((x, i) => '<i style="flex-grow:' + bc[i] + ';background:' + x[3] + '"></i>').join('') + '</div>' +
    '<dl class="kv" style="margin-top:14px">' + bands.map((x, i) => '<dt><span class="legend" style="margin:0"><span><i style="background:' + x[3] + '"></i>' + x[0] + '</span></span></dt><dd>' + bc[i] + ' of ' + tr.length + '</dd>').join('') + '</dl>' : empty('No live posting data');

  const sw = sweepInfo(SW[SW.length - 1]), ws = SSBY.web;
  let webBody = '';
  if (ws.st === 'stalled' || ws.st === 'late') webBody += '<div class="banner ' + (ws.st === 'stalled' ? 'red' : 'amber') + '" style="margin-bottom:12px">Last sweep was ' + esc(dshort(ws.date)) + ' (' + ageText(ws.age) + '). Prices and offerings below may have changed since.</div>';
  webBody += sw ? '<dl class="kv"><dt>Last sweep</dt><dd>' + esc(dshort(sw.date)) + '</dd><dt>Pages checked</dt><dd>' + sw.fetched + ' of ' + sw.of + '</dd><dt>Changed</dt><dd>' + sw.ch + '</dd><dt>Unreachable</dt><dd>' + sw.un + '</dd></dl>' : empty('No sweep recorded');

  const recent = B.filter(b => b.c.discovered_date && age(b.c.discovered_date) <= 30).sort((a, b) => a.c.discovered_date < b.c.discovered_date ? 1 : -1).slice(0, 5);
  const addBody = recent.length ? '<div class="list">' + recent.map(b => liRow(b, '<span class="flat">' + esc(dshort(b.c.discovered_date)) + '</span>')).join('') + '</div>' : empty('No additions in 30 days');

  return '<div class="view brief">' +
    '<div class="brief-head"><div><h1>North Country market</h1><p>' + n + ' photo, video and drone businesses · ' + esc(dlong) + '</p></div>' + pill(LIVEIG.length + ' of ' + B.filter(b => b.c.ig_handle).length + ' Instagram accounts live', LIVEIG.length ? 'ice' : 'amber') + '</div>' +
    fchips() +
    '<div class="row3">' + panel('Market', 'Counts from the roster', tiles) + panel('Instagram movement', 'Last 7 days, live accounts', movers, ['All businesses', 'market']) + panel('AI assistants', 'Latest audit ' + dshort(DATES.ai) + ' · directional', aiBody, ['Open', 'ai']) + '</div>' +
    '<div class="row3b">' + panel('Posting recency', 'Live Instagram accounts', recBody) + panel('Website watch', 'Weekly sweep', webBody, ['Details', 'data']) + panel('Added to roster', 'Discovery, not market growth', addBody) + '</div></div>';
}

/* ---------- MARKET ---------- */
const COLS = [
  { k: 'name', l: 'Business', get: b => b.name.toLowerCase() },
  { k: 'region', l: 'Region', cls: 'c-reg', get: b => b.region },
  { k: 'lanes', l: 'Lanes', cls: 'c-lanes', ns: true },
  { k: 'fol', l: 'Followers', r: 1, get: b => b.ig.state === 'live' ? b.ig.count : null },
  { k: 'd7', l: '7 days', r: 1, cls: 'c-d7', get: b => b.ig.state === 'live' ? b.d7 : null },
  { k: 'trend', l: 'Trend', cls: 'c-trend', ns: true },
  { k: 'last', l: 'Last post', cls: 'c-last', get: b => b.last.live ? dn(b.last.date) : null },
  { k: 'wed', l: 'Wedding from', r: 1, get: b => b.wedLive },
  { k: 'sess', l: 'Session from', r: 1, get: b => b.sessLive },
  { k: 'rev', l: 'Reviews', r: 1, get: b => b.rev.live ? b.rev.count : null }
];
function filtered() {
  const q = state.q.trim().toLowerCase();
  return B.filter(b => (state.lane === 'all' || b.lanes.indexOf(state.lane) >= 0) && (state.region === 'all' || b.region === state.region) &&
    (!q || (b.name + ' ' + b.town + ' ' + b.county).toLowerCase().indexOf(q) >= 0));
}
function sorted(list) {
  const col = COLS.find(c => c.k === state.sort.k) || COLS[3], d = state.sort.dir;
  return list.slice().sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (x == null && y == null) return a.name.localeCompare(b.name);
    if (x == null) return 1; if (y == null) return -1;
    if (x < y) return -d; if (x > y) return d;
    return a.name.localeCompare(b.name);
  });
}
function spreadStrip(list) {
  const pts = list.filter(b => b.wedLive != null);
  if (pts.length < 3) return '<div class="spread"><span class="t">Wedding prices</span><span class="muted" style="font-size:12px">Fewer than 3 current prices in this view.</span><span></span></div>';
  const vals = pts.map(b => b.wedLive), mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), r = mx - mn || 1, md = median(vals);
  const x = v => 6 + ((v - mn) / r) * 588;
  const dots = pts.map(b => '<circle class="sd" data-open="' + esc(b.id) + '" data-tip="' + esc(b.name) + ' · ' + money(b.wedLive) + '" cx="' + x(b.wedLive).toFixed(1) + '" cy="17" r="4.5" fill="#5ea6e6" fill-opacity=".55" stroke="#8fcaff" stroke-opacity=".7" style="cursor:pointer"/>').join('');
  return '<div class="spread"><span class="t"><b>Wedding, from</b><br>' + pts.length + ' current prices</span><svg viewBox="0 0 600 34" preserveAspectRatio="none"><line x1="6" x2="594" y1="17" y2="17" stroke="rgba(150,180,220,.18)"/><line x1="' + x(md).toFixed(1) + '" x2="' + x(md).toFixed(1) + '" y1="4" y2="30" stroke="#f2b552" stroke-width="1.5"/>' + dots + '</svg><span class="t" style="text-align:right">' + money(mn) + ' to ' + money(mx) + '<br>median <b>' + money(md) + '</b></span></div>';
}
function tableBiz(list) {
  const head = COLS.map(c => '<th class="' + (c.cls || '') + (c.r ? ' r' : '') + (c.ns ? '' : ' s') + (state.sort.k === c.k ? ' on' : '') + '"' + (c.ns ? '' : ' data-sort="' + c.k + '"') + '>' + esc(c.l) + (state.sort.k === c.k ? '<span class="ar">' + (state.sort.dir < 0 ? '↓' : '↑') + '</span>' : '<span class="ar"></span>') + '</th>').join('');
  const body = list.map(b => '<tr data-open="' + esc(b.id) + '" aria-selected="' + (state.sel === b.id) + '"><td class="nm"><b>' + esc(b.name) + '</b><span>' + esc(b.town) + '</span></td><td class="c-reg">' + regPill(b.region) + '</td><td class="c-lanes"><div class="lanes">' + b.lanes.slice(0, 3).map(l => '<span class="lane">' + LANE_NAME[l] + '</span>').join('') + (b.lanes.length > 3 ? '<span class="lane">+' + (b.lanes.length - 3) + '</span>' : '') + '</div></td><td class="r">' + cFollowers(b) + '</td><td class="r c-d7">' + cD7(b) + '</td><td class="c-trend">' + (b.ig.state === 'live' ? spark(b.spark) : '<span class="muted">—</span>') + '</td><td class="c-last">' + cLast(b) + '</td><td class="r">' + cPrice(b, 'wed') + '</td><td class="r">' + cPrice(b, 'sess') + '</td><td class="r">' + cRev(b) + '</td></tr>').join('');
  return '<table class="tbl"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
}
function tableVen() {
  const q = state.q.trim().toLowerCase();
  let list = V.filter(x => (state.region === 'all' || x.region === state.region) && (!q || (x.name + ' ' + x.town).toLowerCase().indexOf(q) >= 0));
  list = list.sort((a, b) => (b.v.capacity_num || 0) - (a.v.capacity_num || 0) || a.name.localeCompare(b.name));
  const body = list.map(x => '<tr data-open="' + esc(x.id) + '" aria-selected="' + (state.sel === x.id) + '"><td class="nm"><b>' + esc(x.name) + '</b><span>' + esc(x.town) + '</span></td><td>' + regPill(x.region) + '</td><td class="r">' + (x.v.capacity_num ? fmt(x.v.capacity_num) : '<span class="muted">—</span>') + '</td><td class="r">' + (x.ig.state === 'live' ? '<span class="val">' + fmt(x.ig.count) + '</span>' : '<span class="muted">—</span>') + '</td><td style="white-space:normal;max-width:420px;color:var(--fg-2);font-size:12.5px">' + esc(clean(x.v.price_note || '').slice(0, 130)) + '</td></tr>').join('');
  return { n: list.length, html: '<table class="tbl"><thead><tr><th>Venue</th><th>Region</th><th class="r">Capacity</th><th class="r">Followers</th><th>Price note</th></tr></thead><tbody>' + body + '</tbody></table>' };
}
function viewMarket() {
  const lanes = [['all', 'All lanes']].concat(LANES);
  return '<div class="view market"><div class="toolbar">' +
    '<div class="seg sm" id="kindseg" role="tablist"><i class="thumb"></i><button data-kind="biz" aria-selected="' + (state.kind === 'biz') + '">Businesses</button><button data-kind="ven" aria-selected="' + (state.kind === 'ven') + '">Venues</button></div>' +
    '<div class="search"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg><input id="q" type="search" placeholder="Search name or town" value="' + esc(state.q) + '" autocomplete="off"><kbd>/</kbd></div>' +
    '<div class="chips" id="lanechips" ' + (state.kind === 'ven' ? 'hidden' : '') + '>' + lanes.map(l => '<button class="fc" data-lane="' + l[0] + '" aria-pressed="' + (state.lane === l[0]) + '">' + l[1] + '</button>').join('') + '</div>' +
    '<div class="chips">' + [['all', 'All regions'], ['slc', 'St. Lawrence'], ['adjacent', 'Adjacent'], ['unconfirmed', 'Unconfirmed']].map(r => '<button class="fc" data-reg="' + r[0] + '" aria-pressed="' + (state.region === r[0]) + '">' + r[1] + '</button>').join('') + '</div>' +
    '<span class="spacer"></span><span class="count" id="cnt"></span><button class="btn" id="csv">Copy CSV</button></div>' +
    '<div id="spreadwrap"></div><div class="tblwrap" id="tw"></div></div>';
}
function fillMarket() {
  const tw = $('#tw'); if (!tw) return;
  const keep = tw.scrollTop;
  if (state.kind === 'ven') {
    const t = tableVen(); tw.innerHTML = t.html; $('#cnt').textContent = t.n + ' of ' + V.length + ' venues'; $('#spreadwrap').innerHTML = '';
  } else {
    const list = filtered(); tw.innerHTML = tableBiz(sorted(list)); $('#cnt').textContent = list.length + ' of ' + B.length + ' businesses'; $('#spreadwrap').innerHTML = spreadStrip(list);
  }
  tw.scrollTop = keep;
}
function csvBiz() {
  const rows = [['name', 'town', 'county', 'region', 'lanes', 'instagram_followers_live', 'followers_7d', 'last_post_live', 'wedding_from_current', 'session_from_current', 'reviews_current', 'rating_current', 'website']];
  sorted(filtered()).forEach(b => rows.push([b.name, b.town, b.county, b.region, b.lanes.map(l => LANE_NAME[l]).join('/'), b.ig.state === 'live' ? b.ig.count : '', b.d7 == null ? '' : b.d7, b.last.live ? b.last.date : '', b.wedLive == null ? '' : b.wedLive, b.sessLive == null ? '' : b.sessLive, b.rev.live ? b.rev.count : '', b.rev.live && b.rev.rating != null ? b.rev.rating : '', b.c.website || '']));
  return rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n');
}

/* ---------- DRAWER ---------- */
function fig(v, k, o) { o = o || {}; return '<div class="fig"><div class="v ' + (o.dated ? 'dated' : '') + '">' + v + '</div><div class="k ' + (o.late ? 'late' : '') + '">' + k + '</div></div>'; }
function aiFor(id) {
  const ac = aiCompute('all'), o = ac.ids[id] || { ChatGPT: 0, Gemini: 0, total: 0 };
  return { o, ac };
}
function openBiz(id) {
  const b = BY[id]; if (!b) return;
  const c = b.c, det = DET[id] || {}, wi = WI[id] || {};
  const links = [];
  if (c.website) links.push('<a href="' + esc(/^https?:/.test(c.website) ? c.website : 'https://' + c.website) + '" target="_blank" rel="noopener">Website</a>');
  if (c.ig_handle) links.push('<a href="https://instagram.com/' + esc(c.ig_handle) + '" target="_blank" rel="noopener">Instagram</a>');
  if (c.review_url) links.push('<a href="' + esc(c.review_url) + '" target="_blank" rel="noopener">Reviews</a>');
  if (c.pricing_url) links.push('<a href="' + esc(c.pricing_url) + '" target="_blank" rel="noopener">Pricing page</a>');
  const dated = b.ig.state !== 'live';
  const figs = '<div class="figs">' +
    fig(b.ig.state === 'none' ? '—' : fmt(b.ig.count), b.ig.state === 'live' ? 'Instagram followers' : b.ig.state === 'none' ? 'No Instagram pull' : 'Followers, ' + (b.ig.date ? 'as of ' + esc(dshort(b.ig.date)) : 'carried'), { dated: dated && b.ig.state !== 'none', late: dated && b.ig.state !== 'none' }) +
    fig(b.ig.state === 'live' && b.d7 != null ? '<span class="' + (b.d7 > 0 ? 'up' : b.d7 < 0 ? 'down' : 'flat') + '">' + signed(b.d7) + '</span>' : '—', 'Followers, 7 days') +
    fig(c.last_post_date ? esc(dshort(c.last_post_date)) : '—', b.last.live ? 'Last post, ' + ageText(age(c.last_post_date)) : c.last_post_date ? 'Last post, unverified' : 'Last post', { dated: c.last_post_date && !b.last.live }) +
    fig(c.review_count != null ? fmt(c.review_count) + (c.review_rating != null ? ' · ' + Number(c.review_rating).toFixed(1) : '') : '—', c.review_count != null ? (b.rev.live ? 'Reviews' : 'Reviews, as of ' + esc(dshort(b.rev.date))) : 'Reviews', { dated: c.review_count != null && !b.rev.live, late: c.review_count != null && !b.rev.live }) +
    fig(b.price.wed != null ? money(b.price.wed) : '—', b.pst === 'ok' || b.price.wed == null ? 'Wedding, from' : 'Wedding, as of ' + esc(dshort(b.pdate)), { dated: b.price.wed != null && b.pst !== 'ok', late: b.price.wed != null && b.pst !== 'ok' }) +
    fig(b.price.sess != null ? money(b.price.sess) : '—', b.pst === 'ok' || b.price.sess == null ? 'Session, from' : 'Session, as of ' + esc(dshort(b.pdate)), { dated: b.price.sess != null && b.pst !== 'ok', late: b.price.sess != null && b.pst !== 'ok' }) + '</div>';
  const hs = D.igFollowersHistory[c.ig_handle];
  const chart = hs && hs.length > 2 ? '<div class="dr-sec dr-chart"><h3>Followers' + (b.ig.state === 'live' ? '' : ', history to ' + esc(dshort(hs[hs.length - 1].date))) + '</h3>' + bigChart(hs.slice(-30).map(e => e.count), hs.slice(-30).map(e => e.date)) + '</div>' : '';
  const about = clean(det.blurb || c.biography || '');
  const svc = (det.services && det.services.length ? det.services : c.services || []).map(clean).filter(s => s && !/^events?$/i.test(s));
  const cov = (det.coverage ? [].concat(det.coverage) : wi.coverage || []).map(clean).filter(Boolean);
  const pr = c.pricing ? '<div class="dr-sec"><h3>Published pricing · verified ' + esc(dshort(b.pdate)) + (b.pst === 'ok' ? '' : ' · ' + STTXT[b.pst].toLowerCase()) + '</h3><p class="dr-text">' + esc(clean(c.pricing)) + '</p></div>' : '';
  const ai = aiFor(id);
  const aiSec = ai.ac.answered ? '<div class="dr-sec"><h3>In AI assistant answers · ' + esc(dshort(DATES.ai)) + ', directional</h3><div class="ailine"><span>ChatGPT</span><span>' + ai.o.ChatGPT + ' of ' + ai.ac.den.ChatGPT + '</span><span>Gemini</span><span>' + ai.o.Gemini + ' of ' + ai.ac.den.Gemini + '</span></div></div>' : '';
  const conn = D.connections.filter(x => flat(x.a) === flat(b.name) || flat(x.b) === flat(b.name));
  const connSec = conn.length ? '<div class="dr-sec"><h3>Worked with</h3><div class="tags">' + conn.map(x => pill((flat(x.a) === flat(b.name) ? x.b : x.a) + (x.type ? ' · ' + x.type : ''), 'gray')).join('') + '</div></div>' : '';
  const gaps = []; if (!c.website) gaps.push('No website'); if (!c.pricing) gaps.push('No published pricing'); if (!c.ig_handle) gaps.push('No Instagram handle'); else if (b.ig.state === 'none') gaps.push('Instagram not pulled daily'); if (c.review_count == null) gaps.push('No reviews found');
  const gapSec = gaps.length ? '<div class="dr-sec"><h3>Not available</h3><div class="gaps">' + gaps.map(g => pill(g, 'gray')).join('') + '</div></div>' : '';
  drawer.innerHTML = '<div class="dr-head"><button class="dr-x" data-close aria-label="Close">×</button><h2>' + esc(b.name) + '</h2><div class="where">' + esc(b.town) + (b.county && b.region !== 'slc' ? ' · ' + esc(b.county) + ' County' : '') + '</div><div class="dr-links">' + regPill(b.region) + links.join('') + '</div></div>' +
    '<div class="dr-body">' + figs + chart + (about ? '<div class="dr-sec"><h3>About</h3><p class="dr-text">' + esc(about) + '</p></div>' : '') +
    (svc.length ? '<div class="dr-sec"><h3>Services</h3><div class="tags">' + svc.map(s => pill(s, '')).join('') + '</div></div>' : '') +
    (cov.length ? '<div class="dr-sec"><h3>Coverage area</h3><div class="tags">' + cov.map(s => pill(s, 'tan')).join('') + '</div></div>' : '') + pr + aiSec + connSec + gapSec + '</div>';
  showDrawer(id);
}
function openVen(id) {
  const x = VBY[id]; if (!x) return; const v = x.v;
  const links = [];
  if (v.website) links.push('<a href="' + esc(v.website) + '" target="_blank" rel="noopener">Website</a>');
  if (v.ig_handle) links.push('<a href="https://instagram.com/' + esc(v.ig_handle) + '" target="_blank" rel="noopener">Instagram</a>');
  const figs = '<div class="figs">' + fig(v.capacity_num ? fmt(v.capacity_num) : '—', 'Guest capacity') + fig(x.ig.state === 'live' ? fmt(x.ig.count) : '—', x.ig.state === 'live' ? 'Instagram followers' : 'Instagram not pulled daily') + '</div>';
  const list = (t, a) => a && a.length ? '<div class="dr-sec"><h3>' + t + '</h3><div class="tags">' + a.map(s => pill(clean(s), '')).join('') + '</div></div>' : '';
  drawer.innerHTML = '<div class="dr-head"><button class="dr-x" data-close aria-label="Close">×</button><h2>' + esc(x.name) + '</h2><div class="where">' + esc(v.address || x.town) + '</div><div class="dr-links">' + regPill(x.region) + links.join('') + '</div></div>' +
    '<div class="dr-body">' + figs + (v.price_note ? '<div class="dr-sec"><h3>Price note</h3><p class="dr-text">' + esc(clean(v.price_note)) + '</p></div>' : '') +
    (v.setting ? '<div class="dr-sec"><h3>Setting</h3><p class="dr-text">' + esc(clean(v.setting)) + (v.season ? ' · ' + esc(clean(v.season)) : '') + '</p></div>' : '') + list('Spaces', v.spaces) + list('Services', (v.services || []).filter(s => !/^events?$/i.test(s))) + '</div>';
  showDrawer(id);
}
function showDrawer(id) {
  state.sel = id; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); stage.classList.add('has-drawer');
  $$('tr[data-open]').forEach(tr => tr.setAttribute('aria-selected', String(tr.dataset.open === id)));
  $$('.bub').forEach(g => g.classList.toggle('sel', g.dataset.open === id));
  const body = $('.dr-body', drawer); if (body) body.scrollTop = 0;
}
function closeDrawer() {
  state.sel = null; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); stage.classList.remove('has-drawer');
  $$('tr[data-open]').forEach(tr => tr.setAttribute('aria-selected', 'false')); $$('.bub.sel').forEach(g => g.classList.remove('sel'));
}
function openAny(id) { if (id.indexOf('v:') === 0) openVen(id); else openBiz(id); }

/* ---------- MAP (tile-free, schematic) ---------- */
const MK = 423.2, MC = 0.716, MX0 = -76.5, MY0 = 45.1;
const proj = (lat, lng) => [(lng - MX0) * MC * MK, (MY0 - lat) * MK];
const poly = pts => pts.map((p, i) => { const q = proj(p[1], p[0]); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
const RIVER = [[-76.33, 44.13], [-76.08, 44.24], [-75.92, 44.34], [-75.7, 44.52], [-75.5, 44.70], [-75.2, 44.86], [-74.9, 44.99], [-74.7, 45.0]];
const tname = t => String(t || '').replace(/,\s*NY.*$/, '').replace(/\s*[\u2014(].*$/, '').trim() || 'Unknown';
let MAPPTS = [], MAPMISS = 0, curBox = [0, 0, 1000, 677];
function mapPoints() {
  const coords = D.townCoords.coords || {}, al = D.townCoords.aliases || {}, cnt = {};
  MAPPTS = []; MAPMISS = 0;
  const place = (id, name, town, region, kind, ll, ig) => {
    if (!ll) { if (kind === 'b') MAPMISS++; return; }
    const i = cnt[town] = (cnt[town] || 0) + 1, p = proj(ll[0], ll[1]);
    const ang = i * 2.4, rr = i > 1 ? 9 * Math.sqrt(i - 1) : 0;
    MAPPTS.push({ id, name, town, tn: tname(town), region, kind, x: p[0] + Math.cos(ang) * rr, y: p[1] + Math.sin(ang) * rr, ig });
  };
  B.forEach(b => { const c = coords[al[b.town] || b.town]; place(b.id, b.name, b.town, b.region, 'b', c ? [c.lat, c.lng] : null, b.ig); });
  if (state.mapVen) V.forEach(x => place(x.id, x.name, x.town, x.region, 'v', x.v.lat != null ? [x.v.lat, x.v.lng] : null, x.ig));
}
function boxFor(which) {
  if (which === 'all') return [0, 0, 1000, 677];
  const pts = MAPPTS.filter(p => p.region === 'slc'); if (!pts.length) return [0, 0, 1000, 677];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  let w = Math.max(x1 - x0 + 120, (y1 - y0 + 120) * 1000 / 677, 300), h = w * 677 / 1000;
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}
function applyBox(b) { const s = $('#mapsvg'); if (!s) return; curBox = b; s.setAttribute('viewBox', b.map(v => v.toFixed(1)).join(' ')); s.style.setProperty('--k', (b[2] / 1000).toFixed(4)); }
function animBox(to) {
  const from = curBox.slice(), t0 = performance.now(), dur = REDUCED ? 1 : 620;
  const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); applyBox(from.map((v, i) => v + (to[i] - v) * e)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function mapSvg() {
  let g = '';
  for (let la = 43.5; la <= 45.01; la += 0.5) { const y = proj(la, MX0)[1]; g += '<line x1="0" x2="1000" y1="' + y + '" y2="' + y + '" stroke="rgba(150,180,220,.06)" vector-effect="non-scaling-stroke"/>'; }
  for (let ln = -76; ln <= -73.5; ln += 1) { const x = proj(45, ln)[0]; g += '<line y1="0" y2="677" x1="' + x + '" x2="' + x + '" stroke="rgba(150,180,220,.06)" vector-effect="non-scaling-stroke"/>'; }
  const canada = poly([[-76.5, 44.05]].concat(RIVER, [[-73.34, 45.0], [-73.3, 45.1], [-76.5, 45.1]])) + 'Z';
  const lake = poly([[-76.5, 44.05], [-76.33, 44.13], [-76.28, 43.85], [-76.35, 43.5], [-76.5, 43.5]]) + 'Z';
  const champ = poly([[-73.35, 45.0], [-73.4, 44.5], [-73.42, 44.0], [-73.4, 43.6]]);
  g += '<path d="' + canada + '" fill="rgba(143,202,255,.035)"/><path d="' + lake + '" fill="rgba(143,202,255,.05)"/>' +
    '<path d="' + poly([[-76.5, 44.05]].concat(RIVER, [[-73.34, 45.0]])) + '" fill="none" stroke="rgba(143,202,255,.32)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>' +
    '<path d="' + champ + '" fill="none" stroke="rgba(143,202,255,.22)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>';
  const lbl = (t, lat, lng) => { const p = proj(lat, lng); return '<text x="' + p[0] + '" y="' + p[1] + '" fill="#465165" font-style="italic" style="font-size:calc(13px*var(--k))">' + t + '</text>'; };
  g += lbl('Canada', 45.06, -75.6) + lbl('St. Lawrence River', 44.83, -75.95) + lbl('Lake Ontario', 43.8, -76.45) + lbl('Lake Champlain', 44.2, -73.7);
  const byTown = {}; MAPPTS.forEach(p => { if (p.kind === 'b') byTown[p.tn] = (byTown[p.tn] || 0) + 1; });
  const rawOf = {}; MAPPTS.forEach(p => { if (!rawOf[p.tn]) rawOf[p.tn] = p.town; });
  const dim = t => state.mapTown && state.mapTown !== t;
  const pts = MAPPTS.slice().sort((a, b) => (b.ig && b.ig.count || 0) - (a.ig && a.ig.count || 0)).map(p => {
    const col = RCOL[p.region] || RCOL.unconfirmed, live = p.ig && p.ig.state === 'live';
    const r = live ? Math.max(5, Math.min(16, 3.2 + Math.sqrt(p.ig.count) / 5)) : 4.5;
    const shape = p.kind === 'v' ? '<rect class="core" x="' + (-r * .8) + '" y="' + (-r * .8) + '" width="' + (r * 1.6) + '" height="' + (r * 1.6) + '" transform="rotate(45)" fill="none" stroke="#f2b552" stroke-width="1.6"/>' :
      '<circle class="core" r="' + r.toFixed(1) + '" fill="' + col + '" fill-opacity="' + (live ? .62 : .28) + '" stroke="' + col + '" stroke-width="1.3"' + (live ? '' : ' stroke-dasharray="2 2"') + '/>';
    return '<g class="bub ' + (dim(p.tn) ? 'dim' : '') + (state.sel === p.id ? ' sel' : '') + '" data-open="' + esc(p.id) + '" data-tip="' + esc(p.name) + (p.kind === 'v' ? ' · venue' : live ? ' · ' + fmt(p.ig.count) + ' followers' : '') + '" style="transform:translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) scale(var(--k))">' + shape + '</g>';
  }).join('');
  const coords = D.townCoords.coords || {};
  const names = Object.keys(byTown).filter(t => !/county|upstate|adirondacks/i.test(t)).sort((a, b) => byTown[b] - byTown[a]).slice(0, 7).map(t => {
    const c = coords[(D.townCoords.aliases || {})[rawOf[t]] || rawOf[t]]; if (!c) return ''; const p = proj(c.lat, c.lng);
    return '<text style="transform:translate(' + p[0].toFixed(1) + 'px,' + (p[1] + 24).toFixed(1) + 'px) scale(var(--k))" text-anchor="middle" fill="#a6b1c3" font-size="12" font-weight="500" pointer-events="none">' + esc(t) + '</text>';
  }).join('');
  return '<svg id="mapsvg" viewBox="' + curBox.join(' ') + '" style="--k:' + (curBox[2] / 1000) + '" preserveAspectRatio="xMidYMid meet">' + g + names + pts + '</svg>';
}
function viewMap() {
  mapPoints();
  const towns = {}; MAPPTS.filter(p => p.kind === 'b').forEach(p => towns[p.tn] = (towns[p.tn] || 0) + 1);
  const list = Object.keys(towns).sort((a, b) => towns[b] - towns[a] || a.localeCompare(b)).map(t => '<button class="li" data-town="' + esc(t) + '" style="' + (state.mapTown === t ? 'background:var(--ice-bg)' : '') + '"><span class="nm">' + esc(t) + '</span><span class="rt">' + towns[t] + '</span></button>').join('');
  return '<div class="view mapv"><div class="mapcard"><div class="mapctl"><div class="seg sm" id="boxseg"><i class="thumb"></i><button data-box="all" aria-selected="true">North Country</button><button data-box="slc" aria-selected="false">St. Lawrence County</button></div><button class="fc" id="venToggle" aria-pressed="' + state.mapVen + '" style="height:32px;background:rgba(5,7,11,.6)">Venues</button></div>' + mapSvg() +
    '<div class="mapnote">Schematic outline. Solid circles are live Instagram accounts sized by followers; dashed circles are not refreshed. ' + (MAPMISS ? MAPMISS + ' without a mapped town.' : '') + '</div></div>' +
    '<section class="panel maplist"><div class="panel-h"><h2>Towns</h2><span class="sub">' + MAPPTS.filter(p => p.kind === 'b').length + ' businesses</span></div><div class="panel-b list">' + list + '</div></section></div>';
}

/* ---------- AI VISIBILITY ---------- */
const AI_LANES = [['all', 'All prompts'], ['wed', 'Wedding photo'], ['vid', 'Wedding video'], ['port', 'Portrait and family'], ['re', 'Real estate'], ['dr', 'Drone'], ['com', 'Commercial']];
function traitRows(inIds, ac) {
  const T = [
    ['Has a website', b => !!b.c.website],
    ['Publishes pricing', b => !!b.c.pricing],
    ['Located in St. Lawrence County', b => b.region === 'slc'],
    ['Has 10 or more reviews', b => b.rev.live ? b.rev.count >= 10 : null],
    ['Active Instagram, posted in 30 days', b => b.last.live ? age(b.last.date) <= 30 : null],
    ['Offers three or more lanes', b => b.lanes.length >= 3]
  ];
  const A = B.filter(b => inIds.has(b.id)), N = B.filter(b => !inIds.has(b.id));
  const cnt = (g, f) => { let k = 0, t = 0; g.forEach(b => { const v = f(b); if (v == null) return; t++; if (v) k++; }); return [k, t]; };
  return { A: A.length, N: N.length, rows: T.map(t => ({ l: t[0], a: cnt(A, t[1]), n: cnt(N, t[1]) })) };
}
function viewAI() {
  const lane = state.aiLane, ac = aiCompute(lane), st = SSBY.ai;
  const entries = B.map(b => ({ b, o: ac.ids[b.id] || { ChatGPT: 0, Gemini: 0, total: 0 } })).sort((x, y) => y.o.total - x.o.total || x.b.name.localeCompare(y.b.name));
  const named = entries.filter(e => e.o.total > 0), zero = entries.filter(e => e.o.total === 0);
  const max = named.length ? named[0].o.total : 1;
  const offList = Object.keys(ac.off).map(k => ac.off[k]).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const row = (e, i) => '<button class="lb-r" data-open="' + esc(e.b.id) + '"><span class="rk">' + (i + 1) + '</span><span class="nm"><b>' + esc(e.b.name) + '</b><span class="bar2"><i style="width:' + (e.o.total / max * 100).toFixed(1) + '%"></i></span></span>' +
    '<span class="c ' + (e.o.ChatGPT ? '' : 'zero') + '">' + e.o.ChatGPT + ' of ' + ac.den.ChatGPT + '</span><span class="c ' + (e.o.Gemini ? '' : 'zero') + '">' + e.o.Gemini + ' of ' + ac.den.Gemini + '</span><span class="t">' + e.o.total + ' of ' + ac.answered + ' answers</span></button>';
  const lb = '<div class="lb"><div class="lb-h"><span></span><span>Business</span><span>ChatGPT</span><span>Gemini</span><span>Both</span></div>' +
    (named.length ? named.map(row).join('') : empty('Nobody was named for these prompts')) +
    (zero.length ? (state.aiZero ? zero.map((e, i) => row(e, named.length + i)).join('') : '') + '<button class="link" data-zero style="padding:12px 14px;text-align:left">' + (state.aiZero ? 'Hide' : 'Show') + ' ' + zero.length + ' not named in these answers</button>' : '') + '</div>';
  const prompts = ACTIVE.filter(p => lane === 'all' || (p.services || []).indexOf(lane) >= 0);
  const byP = {}; ENGINES.forEach(e => AI[e].rows.forEach(r => { (byP[r.prompt_id] = byP[r.prompt_id] || {})[e] = r; }));
  const mx = '<div class="mx"><div class="mx-r h"><span>Prompt asked</span><span style="text-align:right">ChatGPT</span><span style="text-align:right">Gemini</span></div>' + prompts.map(p => {
    const r = byP[p.id] || {}, cell = e => !r[e] || !r[e].completed ? '<span class="muted">—</span>' : (r[e].named || []).length;
    const open = state.aiOpen[p.id];
    const names = e => !r[e] || !r[e].completed ? '' : (r[e].named || []).map(n => { const id = matchName(n); return id ? '<button class="pill ice" data-open="' + esc(id) + '" style="border:0;cursor:pointer">' + esc(clean(n)) + '</button>' : pill(clean(n), 'gray'); }).join('') || '<span class="muted" style="font-size:12px">No businesses named</span>';
    return '<button class="mx-r" data-mx="' + esc(p.id) + '"><span class="p">' + esc(p.text) + '<small>' + (open ? 'Hide' : 'Show') + ' who was named</small></span><span class="c">' + cell('ChatGPT') + '</span><span class="c">' + cell('Gemini') + '</span></button>' +
      (open ? '<div class="mx-open"><b style="font-size:11.5px;color:var(--fg-3);font-weight:500">ChatGPT</b><div class="tags">' + (names('ChatGPT') || '<span class="muted" style="font-size:12px">No answer recorded</span>') + '</div><b style="font-size:11.5px;color:var(--fg-3);font-weight:500;margin-top:6px">Gemini</b><div class="tags">' + (names('Gemini') || '<span class="muted" style="font-size:12px">No answer recorded</span>') + '</div></div>' : '');
  }).join('') + '</div>';
  const tr = traitRows(new Set(named.map(e => e.b.id)), ac);
  const traits = '<div class="share"><div class="sh-h"><span></span><span>Named by an assistant (' + tr.A + ')</span><span>Not named (' + tr.N + ')</span></div>' + tr.rows.map(r => '<div class="sh-r"><span class="k">' + esc(r.l) + '</span><span class="b"><i style="width:' + (r.a[1] ? r.a[0] / r.a[1] * 100 : 0).toFixed(1) + '%"></i><span>' + r.a[0] + ' of ' + r.a[1] + '</span></span><span class="b"><i class="o" style="width:' + (r.n[1] ? r.n[0] / r.n[1] * 100 : 0).toFixed(1) + '%"></i><span>' + r.n[0] + ' of ' + r.n[1] + '</span></span></div>').join('') + '</div>';
  const stats = '<div class="stats">' +
    '<div class="tile"><div class="n">' + ac.answered + '<small>of ' + (ac.prompts * ENGINES.length) + '</small></div><div class="t">Answers recorded</div></div>' +
    '<div class="tile"><div class="n">' + named.length + '<small>of ' + B.length + '</small></div><div class="t">Roster businesses named</div></div>' +
    '<div class="tile"><div class="n">' + offList.length + '</div><div class="t">Names not on the roster</div></div>' +
    ENGINES.map(e => '<div class="tile"><div class="n" style="font-size:26px;padding-top:8px">' + esc(dshort(AI[e].date) || '—') + '</div><div class="t">' + e + ', ' + ageText(age(AI[e].date)) + '</div></div>').join('') + '</div>';
  const banner = st.st === 'stalled' || st.st === 'late' ? '<div class="banner ' + (st.st === 'stalled' ? 'red' : 'amber') + '">The latest audit is from ' + esc(dshort(st.date)) + ' (' + ageText(st.age) + '). What is shown is history, not today. ' + esc((SRC.ai || {}).fix || '') + '</div>' : '';
  const method = '<div class="method"><div><b>What is asked</b>' + ACTIVE.length + ' fixed prompts a local customer might type, repeated every audit.</div><div><b>Who answers</b>ChatGPT and Gemini in signed-out sessions. Other assistants are not counted.</div><div><b>How it is counted</b>Each cell is answers that named the business out of answers recorded. A missing answer is missing coverage, never “not named”.</div><div><b>What it cannot tell you</b>Directional only. One audit, two assistants, no percentages and no average positions.</div></div>';
  return '<div class="view scroll"><div class="ai"><div class="page-h"><div><h1>AI visibility</h1><p>Which businesses ChatGPT and Gemini name when asked about local photo, video and drone work. Every business is measured the same way.</p></div><button class="btn" data-copy="ledger">Copy audit data</button></div>' +
    '<div class="chips">' + AI_LANES.map(l => '<button class="fc" data-ailane="' + l[0] + '" aria-pressed="' + (lane === l[0]) + '">' + l[1] + '</button>').join('') + '</div>' + banner + stats +
    '<div class="ai-grid" style="' + (st.st === 'stalled' ? 'opacity:.6' : '') + '"><section class="panel"><div class="panel-h"><h2>Named in answers</h2><span class="sub">Audit ' + esc(dshort(DATES.ai)) + '</span></div><div class="lbscroll">' + lb + '</div></section>' +
    '<div style="display:grid;gap:14px"><section class="panel"><div class="panel-h"><h2>Prompt by prompt</h2><span class="sub">Names per answer</span></div>' + mx + '</section>' +
    '<section class="panel"><div class="panel-h"><h2>What named businesses share</h2><span class="sub">Directional</span></div>' + traits + '</section></div></div>' +
    (offList.length ? '<section class="panel"><div class="panel-h"><h2>Named but not on the roster</h2><span class="sub">' + offList.length + ' names</span></div><div class="panel-b"><div class="tags">' + offList.map(o => pill(o.name + ' · ' + o.total, 'gray')).join('') + '</div></div></section>' : '') +
    '<section class="panel">' + method + '</section></div></div>';
}

/* ---------- DATA ---------- */
function viewData() {
  const srcs = SS.map(s => '<div class="src"><i class="dot ' + (s.st === 'ok' ? 'ok' : s.st) + '"></i><div class="l"><b>' + esc(s.label) + '</b><span>' + esc(s.feeds) + ' · ' + esc(s.cadence) + '</span></div><div class="num">' + (s.date ? esc(dshort(s.date)) : '—') + '</div><div>' + pill(STTXT[s.st] + (s.age != null ? ' · ' + s.age + 'd' : ''), s.st === 'ok' ? 'ice' : s.st === 'late' ? 'amber' : s.st === 'stalled' ? 'red' : 'gray') + '</div><div class="f ' + (s.st === 'ok' ? '' : 'fix') + '">' + (s.st === 'ok' ? 'Nothing to do.' : esc(s.fix)) + '</div></div>').join('');
  const cnt = k => { const m = {}; B.forEach(b => { const v = b[k] || 'Unknown'; m[v] = (m[v] || 0) + 1; }); return Object.keys(m).map(x => [x, m[x]]).sort((a, b) => b[1] - a[1]); };
  const tbl = (rows, h) => '<table class="mini"><thead><tr><th>' + h + '</th><th class="r">Businesses</th></tr></thead><tbody>' + rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="r">' + r[1] + '</td></tr>').join('') + '</tbody></table>';
  const laneRows = LANES.map(l => [l[1], B.filter(b => b.lanes.indexOf(l[0]) >= 0).length]);
  const n = B.length, wh = B.filter(b => b.c.ig_handle).length;
  const cov = [['Website listed', B.filter(b => b.c.website).length], ['Instagram handle', wh], ['Instagram live today', LIVEIG.length], ['Published pricing', B.filter(b => b.c.pricing).length], ['Reviews found', B.filter(b => b.c.review_count != null).length], ['Mapped to a town', MAPPTS.length ? B.filter(b => (D.townCoords.coords || {})[(D.townCoords.aliases || {})[b.town] || b.town]).length : B.length]].map(r => [r[0] + ' (of ' + n + ')', r[1]]);
  const regRows = ['slc', 'adjacent', 'unconfirmed'].map(r => [REGION[r], B.filter(b => b.region === r).length]);
  const rules = ['A figure is live, dated or absent. Dated figures are shown muted with their date and never enter a ranking, median or count.', 'Instagram counts are live only when pulled within ' + (SRC.ig ? SRC.ig.late_after_days : 2) + ' days. A carried count is dated.', 'Prices and review counts carry the date they were verified. The full verified text is always in the business panel.', '“From” prices are read from that text. Hourly rates, deposits, add-ons and minis are not used.', 'AI figures are counts of answers out of answers recorded. Directional only. No percentages, no average positions.', 'A business added to the roster is discovery, not market growth.', 'Region is St. Lawrence County, Adjacent or Unconfirmed. Nothing is guessed.'];
  const exc = D.excluded.map(x => '<tr><td style="white-space:nowrap;font-weight:500">' + esc(clean(x.name)) + '</td><td class="muted">' + esc(clean(x.reason)) + '</td></tr>').join('');
  const nodaily = B.filter(b => b.c.ig_handle && b.ig.state === 'none').length, carried = B.filter(b => b.ig.state === 'carried' || b.ig.state === 'late').length;
  return '<div class="view scroll"><div class="data"><div class="page-h"><div><h1>Data</h1><p>How current every source is, what the roster covers and how figures are counted. Built ' + esc(dshort(DATES.roster)) + ' · viewing as of ' + esc(ASOF_S) + '.</p></div><div class="chips"><button class="btn" data-copy="csv">Copy businesses CSV</button><button class="btn" data-copy="report">Copy freshness report</button></div></div>' +
    '<section class="panel"><div class="panel-h"><h2>Source freshness</h2><span class="sub">Windows come from config/freshness.json</span></div>' + srcs + '</section>' +
    (nodaily || carried ? '<div class="banner gray">' + (carried ? carried + ' Instagram ' + plural(carried, 'account') + ' showing a carried or late count. ' : '') + (nodaily ? nodaily + ' ' + plural(nodaily, 'business has', 'businesses have') + ' a handle but no daily pull.' : '') + '</div>' : '') +
    '<div class="cols2"><section class="panel"><div class="panel-h"><h2>Roster coverage</h2><span class="sub">' + n + ' businesses</span></div>' + tbl(cov, 'Field') + '</section><section class="panel"><div class="panel-h"><h2>By region</h2></div>' + tbl(regRows, 'Region') + '<div class="panel-h"><h2>By lane</h2></div>' + tbl(laneRows, 'Lane') + '</section></div>' +
    '<div class="cols2"><section class="panel"><div class="panel-h"><h2>By county</h2></div><div class="scrollbox">' + tbl(cnt('county').slice(0, 20), 'County') + '</div></section><section class="panel"><div class="panel-h"><h2>Counting rules</h2></div><ol class="rules">' + rules.map(r => '<li>' + esc(r) + '</li>').join('') + '</ol></section></div>' +
    '<section class="panel"><div class="panel-h"><h2>Reviewed and excluded</h2><span class="sub">' + D.excluded.length + ' names kept off the roster</span></div><div class="scrollbox"><table class="mini"><tbody>' + exc + '</tbody></table></div></section></div></div>';
}
function freshnessReport() {
  return 'Business Pulse freshness, as of ' + ASOF_S + '\n' + SS.map(s => (s.st === 'ok' ? 'OK     ' : s.st === 'late' ? 'LATE   ' : s.st === 'stalled' ? 'STALLED' : 'NO DATA') + ' ' + s.label + ': ' + (s.date || 'none') + (s.age != null ? ' (' + s.age + ' days)' : '') + (s.st === 'ok' ? '' : '\n         Do this: ' + s.fix)).join('\n');
}

/* ---------- shell ---------- */
const VIEWS = ['brief', 'market', 'map', 'ai', 'data'];
const RENDER = { brief: viewBrief, market: viewMarket, map: viewMap, ai: viewAI, data: viewData };
function thumb(seg) {
  if (!seg) return; const t = $('.thumb', seg), b = $('[aria-selected="true"]', seg); if (!t || !b) return;
  t.style.width = b.offsetWidth + 'px'; t.style.transform = 'translateX(' + b.offsetLeft + 'px)';
}
function health() {
  const bad = SS.filter(s => s.st === 'stalled').length, late = SS.filter(s => s.st === 'late').length, none = SS.filter(s => s.st === 'none').length;
  const chip = $('#health'), dot = $('.dot', chip), t = $('#health-t');
  if (bad) { dot.className = 'dot stalled'; t.textContent = bad + ' ' + plural(bad, 'source') + ' stalled'; }
  else if (late) { dot.className = 'dot late'; t.textContent = late + ' ' + plural(late, 'source') + ' late'; }
  else if (none) { dot.className = 'dot'; t.textContent = 'Some data missing'; }
  else { dot.className = 'dot ok'; t.textContent = 'All sources current'; }
}
function render() {
  const v = state.view;
  $$('#nav button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  thumb($('#nav'));
  closeDrawer();
  stage.innerHTML = RENDER[v]();
  stage.scrollTop = 0;
  if (v === 'market') fillMarket();
  if (v === 'brief') countUp(stage);
  $$('.seg.sm').forEach(thumb);
  if (v === 'map') { const s = $('#mapsvg'); if (s) applyBox(curBox); }
}
function show(v) { if (VIEWS.indexOf(v) < 0) v = 'brief'; state.view = v; try { if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); } catch (e) { } render(); }
function route() { const h = (location.hash || '').replace('#', ''); const v = VIEWS.indexOf(h) >= 0 ? h : 'brief'; if (v !== state.view || !stage.firstChild) { state.view = v; render(); } }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target, q = s => t.closest(s);
  let el;
  if ((el = q('#nav button'))) return show(el.dataset.v);
  if (q('.brand')) { e.preventDefault(); return show('brief'); }
  if (q('#health')) return show('data');
  if (q('[data-close]')) return closeDrawer();
  if ((el = q('[data-go]'))) return show(el.dataset.go);
  if ((el = q('[data-open]'))) { e.stopPropagation(); return openAny(el.dataset.open); }
  if ((el = q('[data-sort]'))) {
    const k = el.dataset.sort; state.sort = state.sort.k === k ? { k, dir: -state.sort.dir } : { k, dir: k === 'name' || k === 'region' ? 1 : -1 }; return fillMarket();
  }
  if ((el = q('[data-kind]'))) { state.kind = el.dataset.kind; state.sel = null; render(); return; }
  if ((el = q('[data-lane]'))) { state.lane = el.dataset.lane; $$('[data-lane]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); return fillMarket(); }
  if ((el = q('[data-reg]'))) { state.region = el.dataset.reg; $$('[data-reg]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); return fillMarket(); }
  if (q('#csv')) return copyText(state.kind === 'biz' ? csvBiz() : '', 'Copied ' + filtered().length + ' rows');
  if ((el = q('[data-ailane]'))) { state.aiLane = el.dataset.ailane; const y = stage.firstChild.scrollTop; render(); stage.firstChild.scrollTop = y; return; }
  if ((el = q('[data-mx]'))) { const id = el.dataset.mx; state.aiOpen[id] = !state.aiOpen[id]; const y = stage.firstChild.scrollTop; render(); stage.firstChild.scrollTop = y; return; }
  if (q('[data-zero]')) { state.aiZero = !state.aiZero; const y = stage.firstChild.scrollTop; render(); stage.firstChild.scrollTop = y; return; }
  if ((el = q('[data-town]'))) { state.mapTown = state.mapTown === el.dataset.town ? null : el.dataset.town; const keep = curBox.slice(); render(); applyBox(keep); return; }
  if ((el = q('[data-box]'))) { $$('[data-box]').forEach(b => b.setAttribute('aria-selected', String(b === el))); thumb($('#boxseg')); return animBox(boxFor(el.dataset.box)); }
  if (q('#venToggle')) { state.mapVen = !state.mapVen; const keep = curBox.slice(); render(); applyBox(keep); return; }
  if ((el = q('[data-copy]'))) {
    const k = el.dataset.copy;
    if (k === 'csv') return copyText(csvBiz(), 'Copied businesses CSV');
    if (k === 'report') return copyText(freshnessReport(), 'Copied freshness report');
    if (k === 'ledger') return copyText(JSON.stringify(AIROWS, null, 1), 'Copied audit data');
  }
});
document.addEventListener('input', e => { if (e.target.id === 'q') { state.q = e.target.value; fillMarket(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (drawer.classList.contains('open')) closeDrawer(); else if (document.activeElement && document.activeElement.id === 'q') document.activeElement.blur(); }
  if (e.key === '/' && !/input|textarea/i.test((document.activeElement || {}).tagName || '')) {
    if (state.view !== 'market') show('market');
    const i = $('#q'); if (i) { e.preventDefault(); i.focus(); i.select(); }
  }
});
const tip = $('#tip');
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return;
  tip.textContent = el.dataset.tip; tip.classList.add('on');
});
document.addEventListener('mousemove', e => {
  if (!tip.classList.contains('on')) return;
  const w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 12, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 16) + 'px';
});
document.addEventListener('mouseout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) tip.classList.remove('on'); });
window.addEventListener('hashchange', route);
window.addEventListener('resize', () => { thumb($('#nav')); $$('.seg.sm').forEach(thumb); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { thumb($('#nav')); $$('.seg.sm').forEach(thumb); });

health();
route();
window.__pulse = { B, V, AI, aiCompute, SS, ASOF_S };
})();
