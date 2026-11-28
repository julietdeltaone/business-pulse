/* Business Pulse — front end. One file, no dependencies, works from file://.
   Design owner: Claude. Data owner: Muse (daily refresh).

   ======================= NOTES FOR MUSE (read before every refresh) =======================
   Your core job is still the DATA. Before each sync, copy index.html, styles.css, app.js and
   fonts/ fresh from the repo's main branch into your workspace site/ folder — don't carry your
   own older copies forward, that is what has overwritten the design repeatedly. For a plain data
   sync, only touch: the files in data/, the <meta name="build"> line, and the ?v= tags in
   index.html.

   As of Nov 16 2026 you may ALSO add new pages/sections (not just data) — full rules, the design
   tokens, and the component helpers to reuse are in MUSE-README.md at the repo root, under
   "Adding a new section or page". Short version: never edit existing code, reuse the existing
   colors/fonts/components exactly, and land new pages on a muse-pages branch for Claude to review
   rather than pushing them straight to main.

   The page answers three questions for JD. Each one depends on specific fields. Fidelity rules:

   1. "How much is everyone charging?"  ->  competitors[].pricing, pricing_url, seedDates.pricing.per[id]
      - Read the business's OWN pricing page in a real browser (Pixieset, Wix and Squarespace pages
        often render prices with JavaScript; a plain fetch returns nothing and must NOT count as a check).
      - Only stamp seedDates.pricing.per[id] with today's date when you saw the number on the page today.
        Never carry a date forward. If the page was unreachable, leave the old date alone.
      - Keep the amount exactly as printed ("$1,400", not "1400"); the page builds a link that highlights it.
      - Label every amount with its service and tier: "Wedding photography Essential $1,400 / Signature $2,000".
        Keep elopement and hourly prices labeled as such; never fold them into a wedding package price.
      - Third-party figures (WeddingWire, The Knot, Zola) are not the business's own price. Say so in the text.
      - PREFERRED (the page already reads it when present): competitors[].prices =
          [{ service: "wed"|"wedv"|"portrait"|"family"|"drone"|"realty", low: 1400, high: 3200,
             url: "<page the number is on>", checked: "YYYY-MM-DD" }]
      - When a price changes, append to PULSE_DATA.priceHistory:
          { id, service, old, new, date: "YYYY-MM-DD", url }   (the Brief shows these as "price moves")

   2. "How often are people posting?"  ->  igActivity[] rows (handle, date, followers, media_count, last_media_date, engagement)
      - Pull EVERY roster handle every day. Today only about half are pulled; each missing handle is a blind spot.
      - media_count must be the real number from the pull. If a pull fails, write the row with
        media_count: null and "Not pulled today" in activity. Never repeat yesterday's number as if it were new.
      - PREFERRED (the page already reads it when present): PULSE_DATA.igPosts =
          { "<handle>": [{ date: "YYYY-MM-DD", permalink: "https://www.instagram.com/p/...", type: "IMAGE"|"VIDEO"|"CAROUSEL_ALBUM",
                           likes: 0, comments: 0 }] }
        Keep the last 90 days. With permalinks, every post in the posting grid links to the post itself.
      - Stories are not in this data. Do not estimate them.

   3. "Who's the most successful?"  ->  followers (igActivity), review_count / review_rating / review_url, engagement
      - A review count needs review_url (the listing you read it from) and seedDates.reviews.per[id].
      - Re-read Google listings monthly. Do not mix platforms into one count; set review_source.
      - AI assistant answers are only used when the row has url (the share link to the conversation).

   General: no link, no figure. A number without the page it came from is left off the site.
   Never invent, round, or estimate. A blank is better than a guess.
   ========================================================================================== */
(function () {
'use strict';

/* ---------- data ---------- */
const D = Object.assign({ competitors: [], excluded: [], igActivity: [], igPosts: {}, webSweepHistory: [], aiChecks: [],
  seedDates: {}, seedMeta: {}, freshness: { sources: [] }, pricingGaps: {}, priceHistory: [] }, window.PULSE_DATA || {});
const JD_ID = 'jd-meyers-productions';

/* ---------- helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMO = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const clean = s => String(s == null ? '' : s).replace(EMO, '').replace(/\s+/g, ' ').trim();
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dn = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null; };
const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
function etToday() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
const QS = new URLSearchParams(location.search);
const ASOF_S = /^\d{4}-\d{2}-\d{2}$/.test(QS.get('asof') || '') ? QS.get('asof') : etToday();
const ASOF = dn(ASOF_S);
const dshort = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : ''; };
const age = s => { const n = dn(s); return n == null ? null : ASOF - n; };
const ago = s => { const a = age(s); return a == null ? 'never' : a <= 0 ? 'today' : a === 1 ? 'yesterday' : a < 60 ? a + ' days ago' : Math.round(a / 30) + ' months ago'; };
const fmt = n => n == null ? '' : Number(n).toLocaleString('en-US');
const money = n => n == null ? '' : '$' + Math.round(n).toLocaleString('en-US');
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const plural = (n, a, b) => n === 1 ? a : (b || a + 's');
const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Every figure is wrapped in a link to the page it can be checked on. */
const A = (txt, url, title) => url ? '<a class="src" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(title || 'Opens ' + host(url)) + '">' + txt + '</a>' : txt;
function priceUrl(u, amount) {
  if (!u || amount == null) return u || null;
  const a = '$' + Math.round(amount).toLocaleString('en-US'), b = '$' + Math.round(amount);
  return u + (u.indexOf('#') >= 0 ? ':~:' : '#:~:') + 'text=' + encodeURIComponent(a) + (a !== b ? '&text=' + encodeURIComponent(b) : '');
}
const igUrl = h => h ? 'https://www.instagram.com/' + encodeURIComponent(h) + '/' : null;
const SRC = {}; (D.freshness.sources || []).forEach(s => SRC[s.id] = s);
const PRICE_DAYS = (SRC.pricing && SRC.pricing.late_after_days) || 45;

/* ---------- pricing text -> low/high per service ----------
   Used only when competitors[].prices is absent. Reads each dollar amount with the words in front of it. */
const SERVICES = [['wed', 'Wedding photo'], ['portrait', 'Portraits'], ['family', 'Family'], ['wedv', 'Wedding video'], ['drone', 'Drone'], ['realty', 'Real estate']];
const SVC = {}; SERVICES.forEach(s => SVC[s[0]] = s[1]);
const HARD_SKIP = /deposit|retain|print|travel|second[- ]?(shooter|photographer)|2nd|add-?on|album|\bminis?\b|disk|extension|extra|credit|\breg\b|usually spend|average|cap\s*&\s*gown|\bgroups?\b|per person|\+\s*$/i;
const POST_SKIP = /^\s*\)?\s*(2nd|second|retain|deposit|non-refundable|\/\s?(hr|hour|person|mi)\b|per (hour|person|mile)|total)/i;
function catOf(l) {
  if (/(wedding|ceremony)[^$]{0,24}(video|film|cinemat)|videograph/.test(l)) return /photo\s*\+\s*film|combined/.test(l) ? 'x' : 'wedv';
  if (/photo\s*\+\s*film|combined/.test(l)) return 'x';
  if (/wedding|nuptial/.test(l)) return 'wed';
  if (/drone|aerial/.test(l)) return 'drone';
  if (/real estate/.test(l)) return 'realty';
  if (/boudoir|booth|passport|video edit|sports|tour|birth events?/.test(l)) return 'x';
  if (/famil|maternity|newborn/.test(l)) return 'family';
  if (/portrait|senior|headshot|session|couple|engagement|grad|studio/.test(l)) return 'portrait';
  if (/event|brand|package/.test(l)) return 'x';
  return null;
}
function parsePrices(txt) {
  const out = {}; if (!txt) return out;
  const re = /\$\s?(\d[\d,]*(?:\.\d+)?)/g, s = String(txt); let m, prev = 0, cat = null;
  while ((m = re.exec(s))) {
    let label = s.slice(prev, m.index); const semi = label.lastIndexOf(';'); if (semi >= 0) label = label.slice(semi + 1);
    const post = s.slice(re.lastIndex, re.lastIndex + 28); prev = re.lastIndex;
    const l = label.toLowerCase(), a = parseFloat(m[1].replace(/,/g, '')), c = catOf(l);
    if (c) cat = c;
    if (/elope|micro/.test(l) && !/weddings?\s*\/\s*elope/.test(l)) continue;
    if (HARD_SKIP.test(l)) { cat = null; continue; }
    if (POST_SKIP.test(post)) continue;
    if (!cat || cat === 'x' || a < 50 || ((cat === 'wed' || cat === 'wedv') && a < 500)) continue;
    const o = out[cat] = out[cat] || { low: a, high: a };
    o.low = Math.min(o.low, a); o.high = Math.max(o.high, a);
  }
  return out;
}

/* ---------- instagram rows ---------- */
const ROWS = {};
D.igActivity.forEach(r => (ROWS[r.handle] = ROWS[r.handle] || []).push(r));
Object.keys(ROWS).forEach(h => ROWS[h].sort((a, b) => a.date < b.date ? -1 : 1));
const CARRIED = /pull failed|carried|not pulled/i;
const STRIP = 42; /* days shown in the posting grid */
function igModel(h) {
  const rows = h && ROWS[h]; if (!rows) return null;
  const live = rows.filter(r => !CARRIED.test(r.activity || '') && r.followers != null);
  const last = live[live.length - 1]; if (!last) return null;
  const a = age(last.date); if (a > 4) return null;
  const at = d => { let r = null; live.forEach(x => { if (age(x.date) >= d) r = x; }); return r; };
  const f30 = at(30), f7 = at(7);
  const mc = rows.filter(r => r.media_count != null), days = {}, links = {};
  const listed = D.igPosts && D.igPosts[h];
  if (listed && listed.length) listed.forEach(p => { if (p.date) { days[p.date] = (days[p.date] || 0) + 1; if (p.permalink && !links[p.date]) links[p.date] = p.permalink; } });
  else for (let i = 1; i < mc.length; i++) { const d = mc[i].media_count - mc[i - 1].media_count; if (d > 0) days[mc[i].date] = d; }
  const span = mc.length > 1 ? dn(mc[mc.length - 1].date) - dn(mc[0].date) : (listed && listed.length ? 90 : 0);
  const sum = n => Object.keys(days).reduce((t, d) => t + (age(d) < n && age(d) >= 0 ? days[d] : 0), 0);
  const lastRich = mc[mc.length - 1];
  return { handle: h, url: igUrl(h), followers: last.followers, date: last.date,
    g30: f30 ? last.followers - f30.followers : null, g7: f7 ? last.followers - f7.followers : null,
    tracked: span >= 28, span, days, links, posts30: span >= 28 ? sum(30) : null, posts7: span >= 7 ? sum(7) : null,
    lastPost: lastRich && lastRich.last_media_date || null, eng: lastRich && lastRich.engagement ? lastRich.engagement.rate_pct : null,
    series: live.map(r => r.followers) };
}

/* ---------- business model ---------- */
const PP = (D.seedDates.pricing && D.seedDates.pricing.per) || {}, RP = (D.seedDates.reviews && D.seedDates.reviews.per) || {};
const B = D.competitors.map(c => {
  const purl = c.pricing_url || null;
  let prices = {};
  if (Array.isArray(c.prices) && c.prices.length) c.prices.forEach(p => { if (p && SVC[p.service] && p.low != null && (p.url || purl)) prices[p.service] = { low: +p.low, high: +(p.high != null ? p.high : p.low), url: p.url || purl, checked: p.checked || PP[c.id] || null }; });
  else if (purl) { const pr = parsePrices(c.pricing); Object.keys(pr).forEach(k => prices[k] = { low: pr[k].low, high: pr[k].high, url: purl, checked: PP[c.id] || null }); }
  const hasRev = c.review_count != null && !!c.review_url;
  return { id: c.id, c, me: c.id === JD_ID, name: clean(c.name), town: clean(c.town).replace(/\s*[\u2014-]\s*town TBD.*$/i, '').replace(/\s*\(.*\)$/, '').replace(/, NY$/, ''), slc: c.region === 'slc',
    prices, ptext: purl ? c.pricing : null, purl, pdate: PP[c.id] || null,
    ig: igModel(c.ig_handle), handle: c.ig_handle || null,
    rev: hasRev ? c.review_count : null, rating: hasRev && c.review_rating != null ? +c.review_rating : null, rurl: c.review_url || null, rsrc: c.review_source || null, rdate: RP[c.id] || null,
    site: c.website ? (/^https?:/.test(c.website) ? c.website : 'https://' + c.website) : null };
}).sort((a, b) => a.name.localeCompare(b.name));
const BY = {}; B.forEach(b => BY[b.id] = b);
const JD = BY[JD_ID] || B[0];
const state = { scope: 'all', svc: 'wed', whatIf: null, psort: 'posts30', q: '', lane: '', dsort: 'full', asort: 'last' };
try { const s = localStorage.getItem('bp_scope'); if (s === 'slc' || s === 'all') state.scope = s; } catch (e) {}
const pool = () => B.filter(b => state.scope === 'all' || b.slc || b.me);
const priceStale = p => !p.checked || age(p.checked) > PRICE_DAYS;
const who = b => '<button class="who' + (b.me ? ' me' : '') + '" data-b="' + esc(b.id) + '">' + esc(b.me ? 'You' : b.name) + '</button>';
const whoFull = b => '<button class="who' + (b.me ? ' me' : '') + '" data-b="' + esc(b.id) + '">' + esc(b.name) + '</button>';

/* ---------- rankings ---------- */
function rank(list) { /* list: [{b, v, html}] highest first; equal values share a place */
  const s = list.slice().sort((x, y) => y.v - x.v || (y.t || 0) - (x.t || 0) || x.b.name.localeCompare(y.b.name));
  s.forEach((x, i) => { x.place = i && s[i - 1].v === x.v && (s[i - 1].t || 0) === (x.t || 0) ? s[i - 1].place : i + 1; });
  return s;
}
function boards() {
  const P = pool(), ig = P.filter(b => b.ig);
  const mk = (id, title, sub, list) => ({ id, title, sub, list: rank(list) });
  return [
    mk('fol', 'Largest following', 'Instagram followers', ig.map(b => ({ b, v: b.ig.followers, html: A(fmt(b.ig.followers), b.ig.url) }))),
    mk('grow', 'Fastest growing', 'Followers gained in 30 days', ig.filter(b => b.ig.g30 != null).map(b => ({ b, v: b.ig.g30, html: A(signed(b.ig.g30), b.ig.url) }))),
    mk('post', 'Most active', 'Posts in the last 30 days', ig.filter(b => b.ig.posts30 != null).map(b => ({ b, v: b.ig.posts30, html: A(fmt(b.ig.posts30), b.ig.url) }))),
    mk('eng', 'Best engagement', 'Likes and comments per follower, last 10 posts', ig.filter(b => b.ig.eng != null).map(b => ({ b, v: b.ig.eng, html: A(b.ig.eng.toFixed(1) + '%', b.ig.url) }))),
    mk('rev', 'Most reviewed', 'Reviews on their main listing', P.filter(b => b.rev != null && b.rev > 0).map(b => ({ b, v: b.rev, html: A(fmt(b.rev), b.rurl) }))),
    mk('rate', 'Best rated', 'Average rating with 5 or more reviews. Ties go to the larger review count.', P.filter(b => b.rating != null && b.rev >= 5).map(b => ({ b, v: b.rating, t: b.rev, html: A(b.rating.toFixed(1) + ' <small>' + fmt(b.rev) + '</small>', b.rurl) }))),
    mk('prem', 'Highest price', 'Wedding photography starting price', P.filter(b => b.prices.wed).map(b => ({ b, v: b.prices.wed.low, html: A(money(b.prices.wed.low), priceUrl(b.prices.wed.url, b.prices.wed.low)) })))
  ].filter(x => x.list.length >= 3);
}
function medals(bs) {
  const t = {};
  bs.forEach(bd => bd.list.forEach(x => { if (x.place <= 3) { const r = t[x.b.id] = t[x.b.id] || { b: x.b, g: 0, s: 0, z: 0, in: [] }; r[['g', 's', 'z'][x.place - 1]]++; r.in.push({ t: bd.title, p: x.place }); } }));
  return Object.values(t).sort((a, b) => b.g - a.g || b.s - a.s || b.z - a.z || a.b.name.localeCompare(b.b.name));
}

/* ---------- small pieces ---------- */
function barRow(b, pct, valHtml, extra) {
  return '<div class="br' + (b.me ? ' me' : '') + '">' + whoFull(b) + '<span class="trk"><i data-w="' + Math.max(1.5, Math.min(100, pct)).toFixed(1) + '"></i></span><b>' + valHtml + '</b>' + (extra || '') + '</div>';
}
function strip(ig, n, me) {
  let h = '';
  for (let i = n - 1; i >= 0; i--) {
    const d = iso(ASOF - i), k = ig.days[d] || 0, tip = dshort(d) + ': ' + (k ? k + plural(k, ' new post') : 'no new post');
    const cls = 'h' + Math.min(k, 3) + (dn(d) < dn(ig.date) - ig.span ? ' na' : '');
    h += k && ig.links[d] ? '<a class="' + cls + '" href="' + esc(ig.links[d]) + '" target="_blank" rel="noopener" data-tip="' + tip + '"></a>' : '<i class="' + cls + '" data-tip="' + tip + '"></i>';
  }
  return '<span class="hmap' + (me ? ' me' : '') + '" style="--n:' + n + '">' + h + '</span>';
}
/* heat tier for a value against the field: quartiles, highest = h3 */
function tiers(vals) {
  const s = vals.filter(v => v != null).sort((a, b) => a - b), q = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
  const q1 = q(.25), q2 = q(.5), q3 = q(.75);
  return v => v == null ? '' : v >= q3 && v > q2 ? 'h3' : v >= q2 && v > q1 ? 'h2' : v > q1 ? 'h1' : 'h0';
}
const hv = (cls, html) => '<span class="hv ' + cls + '">' + html + '</span>';
const placeCls = (p, n) => p <= Math.ceil(n / 3) ? 'f-ok' : p <= Math.ceil(n * 2 / 3) ? 'f-late' : 'f-old';
const freshCls = d => { const a = age(d); return a == null ? '' : a <= 7 ? 'f-ok' : a <= 30 ? 'f-late' : 'f-old'; };
function spark(vals) {
  if (!vals || vals.length < 3) return '';
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), W = 240, H = 44, r = hi - lo || 1;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * W).toFixed(1) + ',' + (H - 4 - (v - lo) / r * (H - 8)).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
}
const head = (t, s, right) => '<header class="vh"><div><h1>' + t + '</h1>' + (s ? '<p>' + s + '</p>' : '') + '</div>' + (right || '') + '</header>';
const empty = t => '<p class="empty">' + t + '</p>';

/* ---------- Brief ---------- */
function priceFacts(svc) {
  const all = pool().filter(b => b.prices[svc]), peers = all.filter(b => !b.me), lows = peers.map(b => b.prices[svc].low);
  const mine = JD.prices[svc] ? JD.prices[svc].low : null;
  const sorted = all.slice().sort((a, b) => a.prices[svc].low - b.prices[svc].low);
  return { all: sorted, peers, med: lows.length >= 5 ? median(lows) : null, mine, pos: mine != null ? lows.filter(l => l < mine).length + 1 : null, lo: sorted[0], hi: sorted[sorted.length - 1] };
}
/* ---------- widgets ---------- */
const cnt = (v, pre, suf, dec) => '<span data-count="' + v + '" data-pre="' + (pre || '') + '" data-suf="' + (suf || '') + '" data-dec="' + (dec || 0) + '">' + (pre || '') + (dec ? (+v).toFixed(dec) : fmt(v)) + (suf || '') + '</span>';
const bl = items => '<ul class="bl">' + items.filter(Boolean).map(x => '<li' + (x[2] ? ' class="' + x[2] + '"' : '') + '><span>' + x[0] + '</span><b>' + x[1] + '</b></li>').join('') + '</ul>';
function dial(pct) {
  const c = Math.PI * 80;
  return '<svg class="dial" viewBox="0 0 200 112" aria-hidden="true"><defs><linearGradient id="dg" x1="0" x2="1"><stop offset="0" stop-color="#6d5cff"/><stop offset="1" stop-color="#c9c0ff"/></linearGradient></defs><path class="dt" d="M20 102 A80 80 0 0 1 180 102"/><path class="dv" d="M20 102 A80 80 0 0 1 180 102" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" data-off="' + (c * (1 - pct / 100)).toFixed(1) + '"/></svg>';
}
function dotStrip(svc) {
  const pf = priceFacts(svc); if (!pf.all.length) return '';
  const max = Math.max.apply(null, pf.all.map(b => b.prices[svc].low)) * 1.04, x = v => (v / max * 100).toFixed(2);
  return '<div class="dstrip">' + (pf.med != null ? '<i class="dm" style="left:' + x(pf.med) + '%"><b>Median</b></i>' : '') +
    pf.all.map((b, n) => { const p = b.prices[svc]; return '<a class="dd' + (b.me ? ' me' : '') + '" href="' + esc(priceUrl(p.url, p.low)) + '" target="_blank" rel="noopener" style="left:' + x(p.low) + '%;--d:' + n * 22 + 'ms" data-tip="' + esc(b.name) + ' ' + money(p.low) + '"></a>'; }).join('') +
    '<span class="dl">' + money(0) + '</span><span class="dr">' + money(Math.round(max / 100) * 100) + '</span></div>';
}
function radar(bs) {
  const ax = bs.filter(b => b.id !== 'rate'), n = ax.length; if (n < 3) return empty('Not enough ranked categories yet.');
  const cx = 190, cy = 150, R = 100, pt = (k, f) => { const t = -Math.PI / 2 + k / n * 2 * Math.PI; return [cx + Math.cos(t) * R * f, cy + Math.sin(t) * R * f]; };
  const sc = ax.map(bd => { const m = bd.list.find(x => x.b.me), N = bd.list.length; return m ? { f: N > 1 ? (N - m.place) / (N - 1) : 1, t: ord(m.place) + ' of ' + N } : { f: 0, t: 'no figure' }; });
  const ring = f => '<polygon class="rg" points="' + ax.map((_, k) => pt(k, f).map(v => v.toFixed(1)).join(',')).join(' ') + '"/>';
  const poly = ax.map((_, k) => pt(k, Math.max(.04, sc[k].f)).map(v => v.toFixed(1)).join(',')).join(' ');
  const short = { fol: 'Followers', grow: 'Growth', post: 'Posting', eng: 'Engagement', rev: 'Reviews', prem: 'Price' };
  return '<svg class="radar" viewBox="0 0 380 300" role="img" aria-label="Your rank in each category">' + [.25, .5, .75, 1].map(ring).join('') +
    ax.map((_, k) => { const p = pt(k, 1); return '<line class="rs" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; }).join('') +
    '<g class="rp" style="transform-origin:' + cx + 'px ' + cy + 'px"><polygon points="' + poly + '"/>' + ax.map((_, k) => { const p = pt(k, Math.max(.04, sc[k].f)); return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4"/>'; }).join('') + '</g>' +
    ax.map((bd, k) => { const p = pt(k, 1.2), an = Math.abs(p[0] - cx) < 12 ? 'middle' : p[0] < cx ? 'end' : 'start'; return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 2).toFixed(1) + '" text-anchor="' + an + '" class="rl">' + (short[bd.id] || bd.title) + '</text><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 14).toFixed(1) + '" text-anchor="' + an + '" class="rv">' + sc[k].t + '</text>'; }).join('') + '</svg>';
}
function podium(md) {
  if (md.length < 3) return empty('Not enough medals yet.');
  const col = (m, pl, h) => '<div class="pod p' + pl + (m.b.me ? ' me' : '') + '">' + whoFull(m.b) + '<span class="mset"><i class="g">' + m.g + '</i><i class="s">' + m.s + '</i><i class="z">' + m.z + '</i></span><div class="blk" data-h="' + h + '"><b>' + pl + '</b></div></div>';
  return '<div class="podium">' + col(md[1], 2, 68) + col(md[0], 1, 100) + col(md[2], 3, 46) + '</div>';
}
function vbars(items, cls) { /* items: [label, value, highlight] */
  const mx = Math.max.apply(null, items.map(x => x[1])) || 1;
  return '<div class="vb ' + (cls || '') + '">' + items.map(x => '<div class="vc' + (x[2] ? ' me' : '') + '"><b>' + (x[1] || '') + '</b><i data-h="' + Math.max(2, x[1] / mx * 100).toFixed(1) + '"></i><span>' + x[0] + '</span></div>').join('') + '</div>';
}

/* ---------- Overview: the posting heat map is the hero (Nov 28) ---------- */
function viewOverview() {
  const P = pool(), ig = P.filter(b => b.ig), tracked = ig.filter(b => b.ig.posts30 != null), handles = P.filter(b => b.handle).length;
  if (!ig.length) return '<div class="view">' + head('Overview') + empty('No Instagram accounts are being tracked in this set.') + '</div>';
  const peers = tracked.filter(b => !b.me), med = peers.length >= 5 ? median(peers.map(b => b.ig.posts30)) : null;
  const top = tracked.slice().sort((a, b) => b.ig.posts30 - a.ig.posts30)[0], quiet = tracked.filter(b => b.ig.posts30 === 0).length;
  const sorts = { posts30: b => b.ig.posts30 == null ? -1 : b.ig.posts30, last: b => b.ig.lastPost ? dn(b.ig.lastPost) : 0, eng: b => b.ig.eng == null ? -1 : b.ig.eng, fol: b => b.ig.followers, g30: b => b.ig.g30 == null ? -1e9 : b.ig.g30 };
  const f = sorts[state.psort] || sorts.posts30, list = ig.slice().sort((a, b) => f(b) - f(a) || a.name.localeCompare(b.name));
  const tP = tiers(ig.map(b => b.ig.posts30)), tE = tiers(ig.map(b => b.ig.eng)), tF = tiers(ig.map(b => b.ig.followers)), tG = tiers(ig.map(b => b.ig.g30 != null && b.ig.g30 > 0 ? b.ig.g30 : null));
  const th = (k, t) => '<button class="th num" data-psort="' + k + '" aria-pressed="' + (state.psort === k) + '">' + t + '</button>';
  let wk = ''; for (let i = STRIP - 1; i >= 0; i--) { const n = ASOF - i, d = new Date(n * DAY); wk += '<span>' + (d.getUTCDay() === 1 ? dshort(iso(n)) : '') + '</span>'; }
  const rows = list.map(b => { const g = b.ig; return '<div class="po' + (b.me ? ' me' : '') + '">' + whoFull(b) + strip(g, STRIP, b.me) +
    '<b class="num">' + (g.posts30 != null ? hv(tP(g.posts30), A(fmt(g.posts30), g.url)) : '<small>tracking</small>') + '</b>' +
    '<span class="num">' + (g.lastPost ? hv(freshCls(g.lastPost), A(ago(g.lastPost), g.url, 'Latest post ' + dshort(g.lastPost))) : '') + '</span>' +
    '<span class="num">' + (g.eng != null ? hv(tE(g.eng), A(g.eng.toFixed(1) + '%', g.url)) : '') + '</span>' +
    '<span class="num">' + hv(tF(g.followers), A(fmt(g.followers), g.url)) + '</span>' +
    '<span class="num">' + (g.g30 != null ? hv(g.g30 < 0 ? 'f-old' : g.g30 === 0 ? 'h0' : tG(g.g30), A(signed(g.g30), g.url)) : '') + '</span></div>'; }).join('');
  return '<div class="view overview">' + head('Overview', 'Who is posting on Instagram, last ' + STRIP + ' days. Click a column to sort.') +
    '<div class="stats">' +
      '<div class="stat"><span>Most active</span><b>' + (top ? A(top.ig.posts30 + ' posts', top.ig.url) : '') + '</b><small>' + (top ? esc(top.name) + ', last 30 days' : '') + '</small></div>' +
      '<div class="stat"><span>Typical competitor</span><b>' + (med != null ? fmt(med) + plural(med, ' post') : 'Too few') + '</b><small>Median over 30 days, ' + peers.length + ' accounts</small></div>' +
      '<div class="stat me"><span>You</span><b>' + (JD.ig && JD.ig.posts30 != null ? A(JD.ig.posts30 + plural(JD.ig.posts30, ' post'), JD.ig.url) : 'Not tracked') + '</b><small>' + (JD.ig && JD.ig.lastPost ? 'Latest post ' + hv(freshCls(JD.ig.lastPost), ago(JD.ig.lastPost)) : '') + '</small></div>' +
      '<div class="stat"><span>Silent for 30 days</span><b>' + quiet + ' of ' + tracked.length + '</b><small>Accounts with no new post</small></div>' +
    '</div>' +
    '<div class="pane chart scroll hero-grid"><div class="pgrid"><div class="po hd"><span></span><span class="hmap wkd" style="--n:' + STRIP + '">' + wk + '</span>' + th('posts30', 'Posts, 30 days') + th('last', 'Latest post') + th('eng', 'Engagement') + th('fol', 'Followers') + th('g30', '30-day change') + '</div>' + rows + '</div>' +
    '<div class="hlegend"><span class="key"><i class="h0"></i>no post<i class="h1"></i>1<i class="h2"></i>2<i class="h3"></i>3 or more</span><span class="key"><b class="hv h1">low</b><b class="hv h2">middle</b><b class="hv h3">top</b>against the field</span><span class="key"><b class="hv f-ok">this week</b><b class="hv f-late">8 to 30 days</b><b class="hv f-old">over 30 days or losing</b></span></div>' +
    '<p class="foot">' + ig.length + ' of ' + handles + ' known Instagram accounts in this set are pulled daily. Posts are counted from the change in each profile\'s post total between daily pulls. Stories are not counted.</p></div>' +
    postCharts(tracked) + '</div>';
}

/* ---------- Your Position: everything about you, plus full pricing (Nov 28) ---------- */
function viewPosition() {
  const pf = priceFacts('wed'), P = pool(), ig = P.filter(b => b.ig && b.ig.posts30 != null);
  const peersIg = ig.filter(b => !b.me), medPost = peersIg.length >= 5 ? median(peersIg.map(b => b.ig.posts30)) : null;
  const bs = boards(), md = medals(bs), mine = md.find(m => m.b.me), pJ = JD.prices.wed, g = JD.ig;
  const place = id => { const bd = bs.find(x => x.id === id), m = bd && bd.list.find(x => x.b.me); return m ? hv(placeCls(m.place, bd.list.length), ord(m.place) + ' of ' + bd.list.length) : null; };
  const higher = pJ ? pf.peers.filter(b => b.prices.wed.low > pJ.low).length : 0, pct = pf.peers.length ? Math.round(higher / pf.peers.length * 100) : 0;
  const kpi = (k, big, list, extra) => '<div class="kpi pane"><span class="kk">' + k + '</span><div class="kn big">' + big + '</div>' + bl(list) + (extra || '') + '</div>';
  const kpis = '<section class="kpis">' +
    kpi('Your wedding start', pJ ? A(cnt(pJ.low, '$'), priceUrl(pJ.url, pJ.low)) : 'None', [pf.med != null ? ['Market median', money(pf.med)] : null, pf.pos ? ['Your place', (pf.pos === 1 ? 'Lowest' : ord(pf.pos) + ' lowest') + ' of ' + pf.all.length] : null]) +
    kpi('Your posts, 30 days', g && g.posts30 != null ? A(cnt(g.posts30), g.url) : 'Not tracked', [medPost != null ? ['Typical competitor', fmt(medPost)] : null, g && g.posts30 != null && medPost != null ? ['Against typical', hv(g.posts30 >= medPost ? 'f-ok' : g.posts30 > 0 ? 'f-late' : 'f-old', g.posts30 >= medPost ? 'At or above' : 'Below')] : null, g && g.lastPost ? ['Latest post', hv(freshCls(g.lastPost), ago(g.lastPost))] : null]) +
    kpi('Your followers', g ? A(cnt(g.followers), g.url) : 'Not tracked', [g && g.g30 != null ? ['30-day change', hv(g.g30 > 0 ? 'f-ok' : g.g30 < 0 ? 'f-old' : 'h0', signed(g.g30))] : null, place('fol') ? ['Your place', place('fol')] : null], g ? spark(g.series) : '') +
    kpi('Your medals', '<span class="mset big"><i class="g">' + (mine ? mine.g : 0) + '</i><i class="s">' + (mine ? mine.s : 0) + '</i><i class="z">' + (mine ? mine.z : 0) + '</i></span>', [['Medal table', mine ? hv(placeCls(md.indexOf(mine) + 1, md.length), ord(md.indexOf(mine) + 1) + ' of ' + md.length) : 'Not placed'], mine && mine.in[0] ? ['Best finish', ord(mine.in.slice().sort((a, b) => a.p - b.p)[0].p) + ', ' + mine.in.slice().sort((a, b) => a.p - b.p)[0].t.toLowerCase()] : null]) +
    '</section>';
  const price = '<div class="pane w-price"><header class="wh"><h3>Wedding pricing</h3></header>' +
    (pf.all.length && pJ ? '<div class="pw"><div class="dialw">' + dial(pct) + '<div class="dialt"><b>' + cnt(pct, '', '%') + '</b><span>of competitors start higher than you</span></div></div>' +
      '<div class="pwr">' + dotStrip('wed') + bl([['Lowest', A(money(pf.lo.prices.wed.low), priceUrl(pf.lo.prices.wed.url, pf.lo.prices.wed.low)) + ' <small>' + esc(pf.lo.name) + '</small>'], pf.med != null ? ['Median of ' + pf.peers.length, money(pf.med)] : null, ['Highest start', A(money(pf.hi.prices.wed.low), priceUrl(pf.hi.prices.wed.url, pf.hi.prices.wed.low)) + ' <small>' + esc(pf.hi.name) + '</small>'], pf.med != null ? ['You against median', '<span class="' + (pJ.low < pf.med ? 'dn' : 'up') + '">' + money(Math.abs(pJ.low - pf.med)) + (pJ.low < pf.med ? ' under' : ' over') + '</span>'] : null]) + '</div></div>' : empty('No linked wedding prices in this set.')) + '</div>';
  const rad = '<div class="pane w-radar one"><header class="wh"><h3>You against the field</h3><a class="go" href="#leaders">Open leaders</a></header>' + radar(bs) + '<p class="cap">The outer edge is first place. The center is last.</p></div>';
  return '<div class="view brief">' + head('Your Position') + kpis + '<section class="deck">' + price + rad + '</section>' + pricingBody() + '</div>';
}

function pricingBody() {
  const svc = state.svc, pf = priceFacts(svc), P = pool();
  const tabs = SERVICES.map(s => { const n = P.filter(b => b.prices[s[0]]).length; return '<button class="seg" data-svc="' + s[0] + '" aria-pressed="' + (s[0] === svc) + '"' + (n ? '' : ' disabled') + '>' + s[1] + '<small>' + n + '</small></button>'; }).join('');
  if (!pf.all.length) return '<h2 class="sec">Pricing</h2><div class="segs">' + tabs + '</div>' + empty('No linked prices for this service in this set.');
  const top = Math.max.apply(null, pf.all.map(b => b.prices[svc].high)), step = top > 6000 ? 2000 : top > 2500 ? 1000 : top > 1000 ? 250 : top > 400 ? 100 : 50;
  const max = Math.ceil(top / step) * step, x = v => (v / max * 100).toFixed(2);
  const tstep = step * Math.max(1, Math.ceil(max / step / 5)); let ticks = ''; for (let v = 0; v <= max; v += tstep) ticks += '<span style="left:' + x(v) + '%">' + money(v) + '</span>';
  const wi = state.whatIf, mineLow = pf.mine;
  const rows = pf.all.map(b => {
    const p = b.prices[svc], st = priceStale(p);
    return '<div class="pr' + (b.me ? ' me' : '') + (st ? ' stale' : '') + '">' + whoFull(b) +
      '<span class="lane"><i class="rng" style="left:' + x(p.low) + '%;width:' + (p.high > p.low ? x(p.high - p.low) : 0) + '%"></i><i class="pt" style="left:' + x(p.low) + '%"></i>' + (p.high > p.low ? '<i class="pt hi" style="left:' + x(p.high) + '%"></i>' : '') + '</span>' +
      '<b>' + A(money(p.low), priceUrl(p.url, p.low)) + (p.high > p.low ? '<small> to ' + A(money(p.high), priceUrl(p.url, p.high)) + '</small>' : '') + '</b>' +
      '<span class="chk">' + (p.checked ? 'read ' + dshort(p.checked) : 'no read date') + '</span></div>';
  }).join('');
  const lines = (pf.med != null ? '<i class="vl med" style="left:' + x(pf.med) + '%"><b>Median ' + money(pf.med) + '</b></i>' : '') +
    (wi != null && mineLow != null && wi !== mineLow ? '<i class="vl wi" style="left:' + x(wi) + '%"><b>' + money(wi) + '</b></i>' : '');
  const lowsOthers = pf.peers.map(b => b.prices[svc].low).sort((a, b) => a - b);
  const placeAt = v => lowsOthers.filter(l => l < v).length + 1;
  const cur = wi != null ? wi : mineLow, n = lowsOthers.length + 1;
  const stale = pf.all.filter(b => priceStale(b.prices[svc])).length;
  const side = '<aside class="side">' +
    '<div class="stat"><span>Lowest</span><b>' + A(money(pf.lo.prices[svc].low), priceUrl(pf.lo.prices[svc].url, pf.lo.prices[svc].low)) + '</b><small>' + esc(pf.lo.name) + '</small></div>' +
    '<div class="stat"><span>Median of ' + pf.peers.length + ' competitors</span><b>' + (pf.med != null ? money(pf.med) : 'Too few') + '</b><small>' + (pf.med != null ? 'Starting prices, yours left out' : 'Needs 5 or more linked prices') + '</small></div>' +
    '<div class="stat"><span>Highest start</span><b>' + A(money(pf.hi.prices[svc].low), priceUrl(pf.hi.prices[svc].url, pf.hi.prices[svc].low)) + '</b><small>' + esc(pf.hi.name) + '</small></div>' +
    histo(pf, svc) +
    (mineLow != null
      ? '<div class="whatif"><h3>Try a price</h3><p class="cap">Slide to see where a different starting price would put you.</p>' +
        '<output id="wi-n">' + money(cur) + '</output><input type="range" id="wi" min="' + Math.max(25, Math.floor(lowsOthers[0] * 0.6 / 25) * 25) + '" max="' + max + '" step="' + (svc === 'wed' || svc === 'wedv' ? 50 : 5) + '" value="' + cur + '" aria-label="Starting price to try">' +
        '<p id="wi-t">' + whatIfText(cur, placeAt(cur), n, pf.med, mineLow) + '</p><button class="lnk" id="wi-r"' + (wi == null || wi === mineLow ? ' hidden' : '') + '>Back to my real price</button></div>'
      : '<div class="whatif"><p class="cap">You have no linked ' + esc(SVC[svc].toLowerCase()) + ' price on record.</p></div>') +
    '</aside>';
  return '<h2 class="sec">Pricing</h2><div class="segs">' + tabs + '</div>' +
    '<div class="split"><div class="pane chart"><div class="plot" data-max="' + max + '"><div class="axis">' + ticks + '</div><div class="over">' + lines + '</div>' + rows + '</div>' +
    '<p class="foot">' + pf.all.length + ' businesses with a linked price. ' + (stale ? stale + ' shown dimmed: not re-read in the last ' + PRICE_DAYS + ' days. ' : '') + 'Elopement, hourly and add-on prices are left out.</p></div>' + side + '</div>';
}
function histo(pf, svc) {
  const lows = pf.all.map(b => b.prices[svc].low), lo = Math.min.apply(null, lows), hi = Math.max.apply(null, lows), n = 8, w = (hi - lo) / n || 1, bins = [];
  for (let k = 0; k < n; k++) bins.push([k === 0 ? money(lo) : k === n - 1 ? money(hi) : '', 0, false]);
  pf.all.forEach(b => { const k = Math.min(n - 1, Math.floor((b.prices[svc].low - lo) / w)); bins[k][1]++; if (b.me) bins[k][2] = true; });
  return '<div class="pane mini"><h3>Spread of starting prices</h3>' + vbars(bins, 'hist') + '<p class="cap">Count of businesses per price band. Yours is lit.</p></div>';
}
function whatIfText(v, place, n, med, real) {
  const d = med != null ? v - med : null;
  return (v === real ? 'Your real price is ' : 'At ' + money(v) + ' you would be ') + '<strong>' + (place === 1 ? 'the lowest' : place === n ? 'the highest' : ord(place) + ' lowest') + ' of ' + n + '</strong>' +
    (d != null ? ', ' + (d === 0 ? 'right at the median' : money(Math.abs(d)) + (d < 0 ? ' under' : ' over') + ' the median') : '') + '.';
}

/* ---------- posting charts ---------- */
function postCharts(tracked) {
  const dow = [0, 0, 0, 0, 0, 0, 0], wk = [0, 0, 0, 0, 0, 0], names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  tracked.forEach(b => Object.keys(b.ig.days).forEach(d => { const a = age(d); if (a < 0 || a >= STRIP) return; dow[(new Date(dn(d) * DAY).getUTCDay() + 6) % 7] += b.ig.days[d]; wk[5 - Math.floor(a / 7)] += b.ig.days[d]; }));
  const top = Math.max.apply(null, dow), wl = wk.map((v, k) => [dshort(iso(ASOF - (5 - k) * 7 - 6)), v, k === 5]);
  return '<div class="charts2"><div class="pane mini"><h3>Posts by weekday</h3>' + vbars(dow.map((v, k) => [names[k], v, v === top && top > 0])) + '<p class="cap">All tracked accounts, last ' + STRIP + ' days. Busiest day is lit.</p></div>' +
    '<div class="pane mini"><h3>Posts per week</h3>' + vbars(wl) + '<p class="cap">All tracked accounts. Each bar is the week starting on that date.</p></div></div>';
}
/* ---------- Leaders ---------- */
function viewLeaders() {
  const bs = boards(), md = medals(bs);
  if (!bs.length) return '<div class="view">' + head('Leaders', 'Who ranks first in each measure.') + empty('Not enough linked figures to rank anyone in this set.') + '</div>';
  const table = '<div class="pane"><h3>Medal table</h3><p class="cap">A first, second or third place in any category earns a medal. Sorted the way the Olympics does it: most firsts wins.</p><div class="mtab">' +
    md.slice(0, 10).concat(md.slice(10).filter(m => m.b.me)).map((m, i) => '<div class="mrow' + (m.b.me ? ' me' : '') + '"><span class="pos">' + (md.indexOf(m) + 1) + '</span>' + whoFull(m.b) + '<span class="mset"><i class="g">' + m.g + '</i><i class="s">' + m.s + '</i><i class="z">' + m.z + '</i></span><span class="mwhere">' + m.in.sort((a, b) => a.p - b.p).map(x => '<span class="tag p' + x.p + '">' + esc(x.t) + '</span>').join('') + '</span></div>').join('') +
    (md.some(m => m.b.me) ? '' : '<div class="mrow me"><span class="pos"></span>' + whoFull(JD) + '<span class="mset"><i class="g">0</i><i class="s">0</i><i class="z">0</i></span><span class="mwhere"><span class="tag">No top-three finish yet</span></span></div>') + '</div></div>';
  const cards = bs.map(bd => {
    const mx = Math.max.apply(null, bd.list.map(x => Math.abs(x.v))) || 1, top = bd.list.slice(0, 5), mine = bd.list.find(x => x.b.me);
    const row = x => '<div class="lr' + (x.b.me ? ' me' : '') + '"><span class="pos p' + (x.place <= 3 ? x.place : 0) + '">' + x.place + '</span>' + whoFull(x.b) + '<span class="trk"><i data-w="' + Math.max(1.5, Math.abs(x.v) / mx * 100).toFixed(1) + '"></i></span><b>' + x.html + '</b></div>';
    return '<div class="pane board"><h3>' + esc(bd.title) + '</h3><p class="cap">' + esc(bd.sub) + '</p>' + top.map(row).join('') + (mine && top.indexOf(mine) < 0 ? '<div class="gap">' + (mine.place - top[top.length - 1].place - 1 > 0 ? (bd.list.indexOf(mine) - 5) + ' more between' : '') + '</div>' + row(mine) : mine ? '' : '<div class="gap">You have no linked figure here</div>') + '<p class="foot">' + bd.list.length + ' ranked</p></div>';
  }).join('');
  return '<div class="view">' + head('Leaders', 'First place in each measure, and where you stand.') + '<div class="split lead"><div class="pane w-pod"><h3>Podium</h3>' + podium(md) + '</div>' + table + '</div><div class="boards">' + cards + '</div></div>';
}

/* ---------- Directory (Activity folded in, Nov 28) ---------- */
function viewDirectory() {
  const q = state.q.toLowerCase(), P = pool().filter(b => (!q || (b.name + ' ' + b.town).toLowerCase().indexOf(q) >= 0) && (!state.lane || b.prices[state.lane]));
  const fbOk = b => { const p = presOf(b.id), fb = p && p.facebook; return fb && fb.status === 'ok' && fb.posts90 != null ? fb : null; };
  const DS = { full: b => { const p = presOf(b.id); return p && p.last_activity ? dn(p.last_activity) : -1; }, wed: b => b.prices.wed ? b.prices.wed.low : -1, fol: b => b.ig ? b.ig.followers : -1, post: b => b.ig && b.ig.posts30 != null ? b.ig.posts30 : -1, fbp: b => fbOk(b) ? fbOk(b).posts90 : -1, rev: b => b.rev != null ? b.rev : -1 };
  const df = DS[state.dsort] || DS.full; P.sort((a, b) => df(b) - df(a) || a.name.localeCompare(b.name));
  const dth = (k, t) => '<th class="num"><button class="th" data-dsort="' + k + '" aria-pressed="' + (state.dsort === k) + '">' + t + '</button></th>';
  const dim = t => '<span class="dim">' + t + '</span>';
  const rows = P.map(b => {
    const p = presOf(b.id), fb = p && p.facebook, fbo = fbOk(b), onFb = p && p.last_channel === 'facebook';
    const last = p && p.last_activity ? hv(freshCls(p.last_activity), A(ago(p.last_activity), onFb ? (fb && fb.url) : igUrl(b.handle), 'On ' + (onFb ? 'Facebook' : 'Instagram'))) + ' <small>' + (onFb ? 'FB' : 'IG') + '</small>' : dim('None on record');
    return '<tr class="' + (b.me ? 'me' : '') + '"><td>' + whoFull(b) + '<small>' + esc(b.town) + '</small></td><td>' + presChips(b) + '</td>' +
      '<td class="num">' + last + '</td>' +
      '<td class="num">' + (b.ig && b.ig.posts30 != null ? A(fmt(b.ig.posts30), b.ig.url) : b.handle && !b.ig ? dim('Not tracked') : '') + '</td>' +
      '<td class="num">' + (fbo ? A(fmt(fbo.posts90), fbo.url) : '') + '</td>' +
      '<td class="num">' + (b.ig ? A(fmt(b.ig.followers), b.ig.url) : '') + '</td>' +
      '<td class="num">' + (b.prices.wed ? A(money(b.prices.wed.low), priceUrl(b.prices.wed.url, b.prices.wed.low)) : '') + '</td>' +
      '<td class="num">' + (b.rev != null ? A(fmt(b.rev) + (b.rating != null ? ' <small>' + b.rating.toFixed(1) + '</small>' : ''), b.rurl) : '') + '</td></tr>';
  }).join('');
  return '<div class="view">' + head('Directory', '',
    '<div class="tools"><input class="in" id="dq" type="search" placeholder="Search name or town" value="' + esc(state.q) + '" aria-label="Search"><select class="in" id="dl" aria-label="Service"><option value="">Any service</option>' + SERVICES.map(s => '<option value="' + s[0] + '"' + (state.lane === s[0] ? ' selected' : '') + '>Has ' + s[1].toLowerCase() + ' price</option>').join('') + '</select></div>') +
    '<div class="pane chart scroll"><table class="tb"><thead><tr><th>Business</th><th>Presence</th>' + dth('full', 'Last activity') + dth('post', 'IG posts, 30d') + dth('fbp', 'FB posts, 90d') + dth('fol', 'IG followers') + dth('wed', 'Wedding from') + dth('rev', 'Reviews') + '</tr></thead><tbody>' + (rows || '<tr><td colspan="8">' + empty('Nothing matches.') + '</td></tr>') + '</tbody></table><p class="foot">' + P.length + ' businesses. Click a name for its profile. Presence: W website, F Facebook, I Instagram, lit when active in the last 30 days.</p></div></div>';
}

/* ---------- Data ---------- */
function sources() {
  const mx = a => a.reduce((m, x) => x && (!m || x > m) ? x : m, null);
  const live = D.igActivity.filter(r => !CARRIED.test(r.activity || ''));
  const d = { ig: mx(live.map(r => r.date)), pricing: mx(Object.values(PP)), reviews: mx(Object.values(RP)), web: mx(D.webSweepHistory.map(s => s.date)), ai: mx(D.aiChecks.map(a => a.date)), roster: (D.builtAt || '').slice(0, 10) };
  return (D.freshness.sources || []).filter(s => d[s.id] !== undefined).map(s => { const a = age(d[s.id]); return { s, date: d[s.id], age: a, st: a == null ? 'none' : a >= s.stalled_after_days ? 'stalled' : a > s.late_after_days ? 'late' : 'ok' }; });
}
function gaps() {
  const g = [], withH = B.filter(b => b.handle), pulled = withH.filter(b => b.ig), priced = B.filter(b => Object.keys(b.prices).length);
  const stale = priced.filter(b => !b.pdate || age(b.pdate) > PRICE_DAYS), noLink = D.competitors.filter(c => c.pricing && !c.pricing_url);
  const revNoLink = D.competitors.filter(c => c.review_count != null && !c.review_url), revNoDate = B.filter(b => b.rev != null && !b.rdate), ai = D.aiChecks.filter(a => a.url).length;
  const names = l => l.map(x => clean(x.name)).join(', ') + '.';
  if (withH.length - pulled.length) g.push([withH.length - pulled.length, 'Instagram accounts not pulled daily', names(withH.filter(b => !b.ig))]);
  if (stale.length) g.push([stale.length, 'price lists over ' + PRICE_DAYS + ' days old', stale.sort((a, b) => (a.pdate || '') < (b.pdate || '') ? -1 : 1).map(b => b.name + (b.pdate ? ' (' + dshort(b.pdate) + ')' : ' (no date)')).join(', ') + '.']);
  if (noLink.length) g.push([noLink.length, 'price lists with no page link', names(noLink)]);
  if (revNoLink.length) g.push([revNoLink.length, 'review counts with no listing link', names(revNoLink)]);
  if (revNoDate.length) g.push([revNoDate.length, 'review counts with no read date', names(revNoDate)]);
  if (D.aiChecks.length && !ai) g.push([D.aiChecks.length, 'AI answers with no share link', 'None of the recorded answers has a share link to the conversation, so none is shown.']);
  if (!(D.priceHistory || []).length) g.push([0, 'price changes recorded', 'Only the latest price is stored, so nobody can see who raised or cut prices.']);
  return g;
}
function viewData() {
  const S = sources(), G = gaps(), built = (D.builtAt || '').slice(0, 16).replace('T', ' ');
  const ok = S.filter(x => x.st === 'ok').length;
  const tile = x => { const due = x.age == null ? null : x.s.late_after_days - x.age;
    return '<div class="pane src-t st-' + x.st + '"><span class="kk"><i></i>' + esc(x.s.label) + '</span><b class="big">' + (x.date ? esc(ago(x.date)) : 'No data') + '</b>' +
      '<small>' + esc(x.s.cadence) + '</small><span class="due">' + (due == null ? '' : due >= 0 ? (due ? 'Due in ' + due + plural(due, ' day') : 'Due today') : 'Late by ' + (-due) + plural(-due, ' day')) + '</span></div>'; };
  return '<div class="view">' + head('Data') +
    '<div class="dtiles dsum"><div class="pane src-t sum"><span class="kk">Sources current</span><b class="big">' + ok + ' of ' + S.length + '</b><small>' + (S.length - ok ? (S.length - ok) + ' behind schedule' : 'All on schedule') + '</small></div>' +
      '<div class="pane src-t sum"><span class="kk">Site last built</span><b class="big">' + esc(dshort(built)) + '</b><small>' + esc(built.slice(11)) + ' UTC. Rebuilds daily at about 8:30 AM ET</small></div>' +
      '<div class="pane src-t sum"><span class="kk">Businesses tracked</span><b class="big">' + fmt(B.length) + '</b><small>' + fmt(B.filter(b => b.ig).length) + ' pulled from Instagram daily</small></div></div>' +
    '<h2 class="sec">Freshness</h2><div class="dtiles">' + S.map(tile).join('') + '</div>' +
    '<h2 class="sec">Gaps</h2><div class="dtiles">' + (G.length ? G.map(g => '<details class="pane gap-t"><summary><b class="big">' + fmt(g[0]) + '</b><span>' + esc(g[1]) + '</span></summary><p>' + esc(g[2]) + '</p></details>').join('') : empty('Nothing missing today.')) + '</div></div>';
}

/* ---------- profile drawer ---------- */
function openProfile(id) {
  const b = BY[id]; if (!b) return;
  const g = b.ig, pk = Object.keys(b.prices);
  const links = [['Website', b.site], ['Pricing page', b.purl], ['Instagram', igUrl(b.handle)], ['Facebook', (fbOf(b.id) || {}).fb_url], ['Reviews', b.rurl]].filter(x => x[1]);
  const el = document.createElement('div'); el.className = 'drawer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', b.name);
  el.innerHTML = '<div class="dw"><button class="x" aria-label="Close">Close</button><h2>' + esc(b.name) + '</h2><p class="cap">' + esc(b.town) + (b.me ? ', your business' : '') + '</p>' +
    '<div class="links">' + (links.length ? links.map(l => '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + l[0] + '</a>').join('') : '<span class="cap">No links on record, so nothing about this business can be shown.</span>') + '</div>' +
    '<section><h3>Prices</h3>' + (pk.length ? '<ul class="kv">' + pk.map(k => { const p = b.prices[k]; return '<li><span>' + esc(SVC[k]) + '</span><b>' + A(money(p.low), priceUrl(p.url, p.low)) + (p.high > p.low ? ' to ' + A(money(p.high), priceUrl(p.url, p.high)) : '') + '</b></li>'; }).join('') + '</ul>' : '') +
      (b.ptext ? '<p class="quote">' + esc(clean(b.ptext)) + '</p><p class="cap">' + A('As listed on ' + esc(host(b.purl)), b.purl) + ', ' + (b.pdate ? 'read ' + dshort(b.pdate) : 'no read date') + '</p>' : '<p class="cap">' + esc((D.pricingGaps[b.id] && D.pricingGaps[b.id].reason) || 'No linked price list') + '</p>') + '</section>' +
    '<section><h3>Instagram</h3>' + (g ? '<div class="dstats"><div><b>' + A(fmt(g.followers), g.url) + '</b><span>followers</span></div><div><b>' + (g.posts30 != null ? A(fmt(g.posts30), g.url) : '') + '</b><span>posts, 30 days</span></div><div><b>' + (g.eng != null ? A(g.eng.toFixed(1) + '%', g.url) : '') + '</b><span>engagement</span></div><div><b class="' + (g.g30 > 0 ? 'up' : g.g30 < 0 ? 'dn' : '') + '">' + (g.g30 != null ? signed(g.g30) : '') + '</b><span>30-day change</span></div></div>' + spark(g.series) + '<p class="cap">Followers since ' + dshort(ROWS[b.handle][0].date) + '</p>' + strip(g, STRIP, b.me) + '<p class="cap">New posts, last ' + STRIP + ' days' + (g.lastPost ? '. Latest post ' + ago(g.lastPost) : '') + '</p>' : '<p class="cap">' + (b.handle ? '@' + esc(b.handle) + ' is on the roster but is not pulled daily.' : 'No Instagram account on record.') + '</p>') + '</section>' +
    '<section><h3>Facebook</h3>' + (() => { const f = fbOf(b.id), pr = presOf(b.id); if (!f) return '<p class="cap">No Facebook page found.</p>'; if (f.status !== 'ok' || f.followers == null) return '<p class="cap">The page on file could not be read on ' + dshort(f.date) + '.</p>'; return '<div class="dstats"><div><b>' + A(fmt(f.followers), f.fb_url) + '</b><span>followers</span></div><div><b>' + A(fmt(f.recent_posts_90d), f.fb_url) + '</b><span>posts, 90 days</span></div><div><b>' + (f.last_post_date ? A(ago(f.last_post_date), f.fb_url) : '') + '</b><span>latest post</span></div></div>' + (f.rating ? '<p class="cap">' + esc(f.rating) + ' on Facebook.</p>' : '') + (pr && pr.facebook_first ? '<p class="cap">Facebook-first: no website or Instagram on file — this page is the business.</p>' : '') + '<p class="cap">Read ' + dshort(f.date) + '</p>'; })() + '</section>' +
    '<section><h3>Reviews</h3>' + (b.rev != null ? '<div class="dstats"><div><b>' + A(fmt(b.rev), b.rurl) + '</b><span>reviews on ' + esc(({ google: 'Google', facebook: 'Facebook', weddingwire: 'WeddingWire', theknot: 'The Knot', zola: 'Zola' })[b.rsrc] || 'their listing') + '</span></div>' + (b.rating != null ? '<div><b>' + A(b.rating.toFixed(1), b.rurl) + '</b><span>average rating</span></div>' : '') + '</div><p class="cap">' + (b.rdate ? 'Read ' + dshort(b.rdate) : 'No read date') + '</p>' : '<p class="cap">No linked review count.</p>') + '</section></div>';
  document.body.appendChild(el);
  const prev = document.activeElement, close = () => { el.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); };
  const key = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', key); $('.x', el).focus();
  requestAnimationFrame(() => el.classList.add('on'));
}

/* ---------- router ---------- */
/* ---------- Activity (added by Muse 2026-11-16, muse-pages branch) ----------
   New view only: no existing function, rule or markup is modified. Assembled
   from the existing helpers (head, empty, barRow, bl, vbars, cnt, A, ago, fmt)
   and classes (.view, .stats, .stat, .pane, .charts2, .cap, .foot).
   Data: D.fbActivity rows {date, id, name, kind, fb_url, followers,
   followers_kind, delta, last_post_date, recent_posts_90d, rating, status}
   plus D.igActivity for the combined pane. Every figure is wrapped in A()
   with the page it was read from. */
function fbLatest() {
  const byId = {};
  (D.fbActivity || []).forEach(r => { if (!byId[r.id] || r.date > byId[r.id].date) byId[r.id] = r; });
  return Object.values(byId);
}
let FB_BY = null;
function fbOf(id) { if (!FB_BY) { FB_BY = {}; fbLatest().forEach(r => FB_BY[r.id] = r); } return FB_BY[id] || null; }
function presOf(id) { return ((D.presence || {}).businesses || {})[id] || null; }
/* Presence chips: W website, F Facebook, I Instagram. on = active in the
   last 30 days (or, for a website, on file), stale = exists but quiet or
   untracked, off = not found. Detail rides in data-tip. */
function presChips(b) {
  const p = presOf(b.id), chip = (L, st, tip) => '<i class="' + st + '" data-tip="' + esc(tip) + '">' + L + '</i>';
  let w, f, i;
  w = b.site ? chip('W', 'on', 'Website: ' + host(b.site)) : chip('W', 'off', 'No website on file');
  const fb = p && p.facebook;
  f = !fb ? chip('F', 'off', 'No Facebook page found')
    : fb.status !== 'ok' ? chip('F', 'stale', 'Facebook page could not be read')
    : (fb.last_post && age(fb.last_post) != null && age(fb.last_post) <= 30) ? chip('F', 'on', 'Facebook: last post ' + ago(fb.last_post))
    : chip('F', 'stale', 'Facebook: last post ' + (fb.last_post ? ago(fb.last_post) : 'never seen'));
  i = !b.handle ? chip('I', 'off', 'No Instagram account on record')
    : !b.ig ? chip('I', 'stale', 'Instagram: @' + b.handle + ' is not pulled daily')
    : (b.ig.lastPost && age(b.ig.lastPost) != null && age(b.ig.lastPost) <= 30) ? chip('I', 'on', 'Instagram: last post ' + ago(b.ig.lastPost))
    : chip('I', 'stale', 'Instagram: last post ' + (b.ig.lastPost ? ago(b.ig.lastPost) : 'never seen'));
  return '<span class="pres">' + w + f + i + '</span>';
}
function presBriefPane() {
  const p = presOf(JD_ID); if (!p) return '';
  const rows = [];
  if (p.website) rows.push(['Website', A(host(p.website.url), p.website.url) + (p.website.sweep_status ? ' <small>sweep: ' + esc(p.website.sweep_status) + '</small>' : '')]);
  if (p.instagram) rows.push(['Instagram', A(fmt(p.instagram.followers) + ' followers · ' + fmt(p.instagram.posts30) + plural(p.instagram.posts30, ' post') + ' in 30 days · last ' + (p.instagram.last_post ? ago(p.instagram.last_post) : 'unknown'), p.instagram.url)]);
  if (p.facebook) rows.push(['Facebook', A(fmt(p.facebook.followers) + ' followers · ' + fmt(p.facebook.posts90) + plural(p.facebook.posts90, ' post') + ' in 90 days · last ' + (p.facebook.last_post ? ago(p.facebook.last_post) : 'unknown'), p.facebook.url)]);
  const all = Object.values((D.presence || {}).businesses || {});
  rows.push(['Facebook-first competitors', fmt(all.filter(x => x.facebook_first).length) + ' post there with no website or Instagram']);
  rows.push(['Quiet everywhere, 90+ days', fmt(all.filter(x => x.dormant).length) + ' of ' + fmt(all.length)]);
  rows.push(['No channel at all', fmt(all.filter(x => x.dark).length)]);
  return '<div class="pane w-feed"><h3>Your presence</h3>' + bl(rows) + '<p class="cap">Every channel read as one picture. Detail on the Activity page.</p></div>';
}
/* ---------- Recommendations (added by Muse 2026-11-16, muse-pages branch) ----------
   New view only. Data: D.recommendations {generated, items:[{kind, title, body,
   evidence:[{label, value, url}]}]} — computed by scripts/build_recommendations.py
   from the Facebook, Instagram, review and roster feeds. Every figure is wrapped
   in A() with the page it can be checked on. */
const REC_KIND = { channel_mismatch: 'Channel mismatch', dormant_audience: 'Dormant audience', fb_reputation: 'Reputation', channel_gap: 'Channel gap', cadence: 'The pace', jd_standing: 'Your standing', review_gap: 'Reviews', dark_set: 'No channel', venue_outreach: 'Venues' };
function viewRecommendations() {
  const R = D.recommendations || {}, items = (R.items || []).slice(0, 10);
  if (!items.length) return '<div class="view">' + head('Recommendations') + empty('No findings yet.') + '</div>';
  const packets = items.map((it, i) => { const e = (it.evidence || [])[0];
    return '<button class="pane rec-p" data-rec="' + i + '"><span class="kk">' + esc(REC_KIND[it.kind] || 'Finding') + '</span><b class="rn">' + (i + 1) + '</b><h3>' + esc(it.title) + '</h3>' +
      (e ? '<span class="rk"><small>' + esc(e.label) + '</small>' + esc(e.value) + '</span>' : '') + '</button>'; }).join('');
  return '<div class="view">' + head('Recommendations', 'The top ' + items.length + ', generated ' + esc(R.generated || '') + '. Open one for the full finding and its sources.') + '<div class="recs">' + packets + '</div></div>';
}
function openRec(i) {
  const it = ((D.recommendations || {}).items || [])[i]; if (!it) return;
  const el = document.createElement('div'); el.className = 'drawer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', it.title);
  el.innerHTML = '<div class="dw"><button class="x" aria-label="Close">Close</button><p class="cap" style="margin-top:18px">' + esc(REC_KIND[it.kind] || 'Finding') + '</p><h2>' + esc(it.title) + '</h2><p class="quote">' + esc(it.body) + '</p><section><h3>Evidence</h3>' + bl((it.evidence || []).map(e => [esc(e.label), A(esc(e.value), e.url)])) + '</section></div>';
  document.body.appendChild(el);
  const prev = document.activeElement, close = () => { el.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); };
  const key = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', key); $('.x', el).focus();
  requestAnimationFrame(() => el.classList.add('on'));
}

/* ---------- Trends: your trajectory, three scenarios, and how much the data can bear (Nov 28) ---------- */
function trendSeries() {
  const rows = (JD.handle && ROWS[JD.handle] || []).filter(r => !CARRIED.test(r.activity || '') && r.followers != null);
  return rows.map(r => ({ d: dn(r.date), v: r.followers, date: r.date }));
}
function marketGrowth() {
  const tp = (D.trendPoints || []).filter(t => t.igTotal), med = median(tp.map(t => t.igTotal)) || 0;
  const ok = tp.filter(t => t.igTotal > med * 0.9); /* drop days where a pull failed and the total collapsed */
  if (ok.length < 2) return null;
  const last = ok[ok.length - 1], back = ok.filter(t => dn(last.date) - dn(t.date) >= 30)[0] || ok[0], days = dn(last.date) - dn(back.date);
  return days >= 14 ? { pct: (last.igTotal - back.igTotal) / back.igTotal * 100 * 30 / days, total: last.igTotal, since: back.date } : null;
}
function viewTrends() {
  const S = trendSeries(), g = JD.ig;
  if (S.length < 14 || !g) return '<div class="view">' + head('Trends') + empty('Not enough of your own history yet.') + '</div>';
  const last = S[S.length - 1], back = S.filter(p => last.d - p.d >= 30)[0] || S[0], span = last.d - back.d;
  const myPct = (last.v - back.v) / back.v * 100 * 30 / span;
  const corr = ((D.correlations || {}).analyses || []).find(a => a.id === 'ig-posting-growth');
  const slope = corr && corr.trend ? corr.trend.slope : 0.1, r = corr ? corr.pearson_disp : null, nCorr = corr ? corr.n : null;
  const P = pool(), tracked = P.filter(b => b.ig && b.ig.posts30 != null && !b.me), medPost = tracked.length >= 5 ? median(tracked.map(b => b.ig.posts30)) : 3;
  const topPost = tracked.length ? Math.max.apply(null, tracked.map(b => b.ig.posts30)) : 14, myPosts = g.posts30 || 0;
  const H = 90, rate = p => myPct + slope * (p - myPosts);
  const sc = [
    { k: 'a', name: 'Keep the current pace', posts: myPosts, cls: 'sa' },
    { k: 'b', name: 'Post like the typical competitor', posts: medPost, cls: 'sb' },
    { k: 'c', name: 'Post like the most active account', posts: topPost, cls: 'sc' }
  ].map(s => { s.rate = rate(s.posts); s.end = Math.round(last.v * Math.pow(1 + s.rate / 100, H / 30)); return s; });
  /* chart */
  const W = 1500, Ht = 400, L = 60, R = 130, T = 20, Bm = 34, iw = W - L - R, ih = Ht - T - Bm;
  const x0 = S[0].d, x1 = last.d + H, vals = S.map(p => p.v).concat(sc.map(s => s.end));
  let y0 = Math.min.apply(null, vals), y1 = Math.max.apply(null, vals); const pad = Math.max(3, (y1 - y0) * 0.12); y0 = Math.floor(y0 - pad); y1 = Math.ceil(y1 + pad);
  const X = d => L + (d - x0) / (x1 - x0) * iw, Y = v => T + ih - (v - y0) / (y1 - y0) * ih;
  let svg = '<svg class="tchart" viewBox="0 0 ' + W + ' ' + Ht + '" role="img" aria-label="Your Instagram followers, actual and projected">';
  for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, yy = Y(v); svg += '<line class="sc-g" x1="' + L + '" x2="' + (L + iw) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/><text class="sc-t" x="' + (L - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + fmt(Math.round(v)) + '</text>'; }
  for (let d = x0; d <= x1; d++) { const dt = new Date(d * DAY); if (dt.getUTCDate() === 1) svg += '<text class="sc-t" x="' + X(d).toFixed(1) + '" y="' + (Ht - 10) + '" text-anchor="middle">' + MON[dt.getUTCMonth()] + '</text><line class="sc-g" x1="' + X(d).toFixed(1) + '" x2="' + X(d).toFixed(1) + '" y1="' + T + '" y2="' + (T + ih) + '"/>'; }
  svg += '<line class="t-now" x1="' + X(last.d).toFixed(1) + '" x2="' + X(last.d).toFixed(1) + '" y1="' + T + '" y2="' + (T + ih) + '"/><text class="sc-t" x="' + (X(last.d) + 6).toFixed(1) + '" y="' + (T + 12) + '">today</text>';
  sc.forEach(s => { const pts = []; for (let k = 0; k <= H; k += 5) pts.push(X(last.d + k).toFixed(1) + ',' + Y(last.v * Math.pow(1 + s.rate / 100, k / 30)).toFixed(1));
    svg += '<polyline class="t-proj ' + s.cls + '" points="' + pts.join(' ') + '"/><text class="t-lab ' + s.cls + '" x="' + (X(x1) + 8).toFixed(1) + '" y="' + (Y(s.end) + 4).toFixed(1) + '">' + fmt(s.end) + ' · ' + s.k.toUpperCase() + '</text>'; });
  svg += '<polyline class="t-act" points="' + S.map(p => X(p.d).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ') + '"/><circle class="sc-me" cx="' + X(last.d).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '" r="5"/></svg>';
  /* labels separated when ends collide */
  const mk = marketGrowth();
  const pctTxt = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  const stats = '<div class="stats">' +
    '<div class="stat me"><span>Your followers</span><b>' + A(fmt(last.v), g.url) + '</b><small>' + signed(last.v - S[0].v) + ' since ' + dshort(S[0].date) + '</small></div>' +
    '<div class="stat"><span>Your growth, per 30 days</span><b>' + hv(myPct > (mk ? mk.pct : 0) ? 'f-ok' : 'f-late', pctTxt(myPct)) + '</b><small>' + (mk ? 'Market: ' + pctTxt(mk.pct) + ' across all tracked accounts' : 'Market figure not available') + '</small></div>' +
    '<div class="stat"><span>Your posts, 30 days</span><b>' + hv(myPosts >= medPost ? 'f-ok' : myPosts > 0 ? 'f-late' : 'f-old', fmt(myPosts)) + '</b><small>Typical competitor: ' + fmt(medPost) + '</small></div>' +
    '<div class="stat"><span>Latest post</span><b>' + (g.lastPost ? hv(freshCls(g.lastPost), ago(g.lastPost)) : 'Unknown') + '</b><small>' + (g.lastPost ? dshort(g.lastPost) : '') + '</small></div></div>';
  const cards = '<div class="scen">' + sc.map(s => '<div class="pane scn ' + s.cls + '"><span class="kk">' + s.k.toUpperCase() + '. ' + esc(s.name) + '</span><b class="big">' + fmt(s.end) + '</b><small>followers in 90 days, ' + signed(s.end - last.v) + '</small>' +
    bl([['Posts per 30 days', fmt(s.posts)], ['Posts over 90 days', fmt(s.posts * 3)], ['Growth per 30 days', pctTxt(s.rate)]]) + '</div>').join('') + '</div>';
  /* data depth: what can be trended today */
  const igDays = new Set(D.igActivity.map(r => r.date)).size, fbDays = new Set((D.fbActivity || []).map(r => r.date)).size;
  const aiRuns = new Set(D.aiChecks.map(a => a.date)).size, webRuns = D.webSweepHistory.length, priceMoves = (D.priceHistory || []).length;
  const V = { ok: ['f-ok', 'Enough'], thin: ['f-late', 'Thin'], no: ['f-old', 'Not yet'] };
  const depth = [
    ['Instagram followers', igDays + ' daily readings, ' + fmt(B.filter(b => b.ig).length) + ' accounts', igDays >= 45 ? 'ok' : 'thin', 'Good for trends and 90-day projections, with a margin.'],
    ['Instagram posting', igDays + ' days of post counts', igDays >= 45 ? 'ok' : 'thin', 'Good for pace and streaks.'],
    ['Posting vs growth link', nCorr ? nCorr + ' accounts, r = ' + r : 'Not computed', 'thin', 'A weak link. Scenarios show direction, not a promise.'],
    ['AI assistant answers', aiRuns + ' weekly runs, 2 assistants', aiRuns >= 12 ? 'ok' : 'thin', 'About 12 weekly runs are needed before a trend means much.'],
    ['Facebook', fbDays + ' days of readings', fbDays >= 45 ? 'ok' : 'no', 'Needs about 60 days.'],
    ['Reviews', 'One count per business, read monthly', 'no', 'Needs several monthly reads per business.'],
    ['Prices', priceMoves ? priceMoves + ' recorded changes' : 'Only the latest price is kept', priceMoves >= 10 ? 'thin' : 'no', 'Price trends start once each change is recorded with its date.'],
    ['Website watch', webRuns + ' weekly sweeps', 'thin', 'Shows changes, too few points for a trend.']
  ];
  const table = '<div class="pane"><h3>Is there enough data?</h3><p class="cap">Yes for your Instagram trends and these projections. Not yet for prices, reviews or Facebook.</p><table class="tb depth"><thead><tr><th>Source</th><th>What we have</th><th>Verdict</th><th>What it means</th></tr></thead><tbody>' +
    depth.map(d => '<tr><td><b>' + esc(d[0]) + '</b></td><td>' + esc(d[1]) + '</td><td>' + hv(V[d[2]][0], V[d[2]][1]) + '</td><td class="dim">' + esc(d[3]) + '</td></tr>').join('') + '</tbody></table></div>';
  return '<div class="view">' + head('Trends', 'Your Instagram trajectory and three ways the next 90 days could go.') + stats +
    '<div class="pane"><h3>Followers, actual and projected</h3><p class="cap">Solid line: daily readings since ' + dshort(S[0].date) + '. Dashed lines: the three scenarios below.</p>' + svg + '</div>' +
    cards + '<p class="foot">How the scenarios work: your own growth rate over the last ' + span + ' days, adjusted by how much faster accounts grow per extra post in this market (' + (nCorr ? nCorr + ' accounts, r = ' + r : 'market average') + '). The link is weak, so read the gap between A and C as a direction, not a forecast.</p>' +
    table + '</div>';
}

const VIEWS = { overview: viewOverview, position: viewPosition, trends: viewTrends, leaders: viewLeaders, recommendations: viewRecommendations, directory: viewDirectory, data: viewData };
const ALIAS = { brief: 'overview', posting: 'overview', pricing: 'position', activity: 'directory', correlations: 'trends' };
const stage = $('#stage');
let first = true;
function render(keep) {
  const h = (location.hash || '#overview').slice(1).split('/')[0], v = ALIAS[h] || h, name = VIEWS[v] ? v : 'overview', y = stage.scrollTop;
  stage.innerHTML = VIEWS[name]();
  $$('#nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + name ? 'page' : 'false'));
  first = false;
  stage.scrollTop = keep ? y : 0;
  const view = stage.firstChild;
  if (!keep && !REDUCED) { view.classList.add('enter'); $$('.kpis>*,.deck>*,.view>.pane,.view>.split>*,.view>.stats>*,.charts2>*,.boards>*,.recs>*,.dtiles>*,.vh', view).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 14))); }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('[data-w]', stage).forEach((el, i) => { el.style.transitionDelay = Math.min(i, 24) * 18 + 'ms'; el.style.width = el.dataset.w + '%'; });
    $$('[data-h]', stage).forEach((el, i) => { el.style.transitionDelay = Math.min(i, 24) * 30 + 'ms'; el.style.height = el.dataset.h + '%'; });
    $$('[data-off]', stage).forEach(el => { el.style.strokeDashoffset = el.dataset.off; });
    stage.classList.add('live'); view.classList.add('on');
  }));
  if (!keep && !REDUCED) $$('[data-count]', stage).forEach(el => {
    const to = +el.dataset.count, dec = +el.dataset.dec, t0 = performance.now(), dur = 900;
    const put = v => { el.textContent = el.dataset.pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + el.dataset.suf; };
    (function step(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); put(to * e); if (p < 1) requestAnimationFrame(step); })(t0);
  });
}
stage.addEventListener('pointermove', e => { const c = e.target.closest('.pane'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
if (!REDUCED) stage.addEventListener('scroll', () => document.body.style.setProperty('--sy', stage.scrollTop), { passive: true });
window.addEventListener('hashchange', () => { $$('.drawer').forEach(d => d.parentNode.removeChild(d)); render(); });

stage.addEventListener('click', e => {
  const w = e.target.closest('[data-b]'); if (w) { openProfile(w.dataset.b); return; }
  const rc = e.target.closest('[data-rec]'); if (rc) { openRec(+rc.dataset.rec); return; }
  const s = e.target.closest('[data-svc]'); if (s) { state.svc = s.dataset.svc; state.whatIf = null; render(true); return; }
  const p = e.target.closest('[data-psort]'); if (p) { state.psort = p.dataset.psort; render(true); return; }
  const ds = e.target.closest('[data-dsort]'); if (ds) { state.dsort = ds.dataset.dsort; render(true); return; }
  if (e.target.id === 'wi-r') { state.whatIf = null; render(true); }
});
stage.addEventListener('input', e => {
  if (e.target.id === 'wi') {
    const v = +e.target.value, pf = priceFacts(state.svc), lows = pf.peers.map(b => b.prices[state.svc].low), max = +$('.plot').dataset.max;
    state.whatIf = v; $('#wi-n').textContent = money(v);
    $('#wi-t').innerHTML = whatIfText(v, lows.filter(l => l < v).length + 1, lows.length + 1, pf.med, pf.mine); $('#wi-r').hidden = v === pf.mine;
    let l = $('.vl.wi'); if (!l) { l = document.createElement('i'); l.className = 'vl wi'; l.innerHTML = '<b></b>'; $('.over').appendChild(l); }
    l.style.left = (v / max * 100) + '%'; l.firstChild.textContent = money(v); l.hidden = v === pf.mine;
  }
  if (e.target.id === 'dq') { state.q = e.target.value; const pos = e.target.selectionStart; render(true); const n = $('#dq'); n.focus(); n.setSelectionRange(pos, pos); }
});
stage.addEventListener('change', e => { if (e.target.id === 'dl') { state.lane = e.target.value; render(true); } });

/* top bar: scope switch, jump-to search, freshness */
function chrome() {
  $$('#scope button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.scope === state.scope); b.onclick = () => { state.scope = b.dataset.scope; try { localStorage.setItem('bp_scope', state.scope); } catch (e) {} chrome(); render(true); }; });
  const dl = $('#names'); if (dl && !dl.children.length) dl.innerHTML = B.map(b => '<option value="' + esc(b.name) + '">').join('');
  const j = $('#jump'); if (j) j.onchange = () => { const b = B.find(x => x.name.toLowerCase() === j.value.trim().toLowerCase()); if (b) { j.value = ''; openProfile(b.id); } };
  const S = sources(), bad = S.filter(x => x.st === 'stalled').length, late = S.filter(x => x.st === 'late').length, h = $('#health');
  if (h) { h.className = 'health dot ' + (bad ? 'stalled fail' : late ? 'late' : 'ok'); h.lastElementChild.textContent = bad || late ? (bad + late) + plural(bad + late, ' source') + ' behind' : 'Data current, ' + dshort(ASOF_S); }
}
chrome(); render();
})();

/* Source mode (Atlas, 2026-11-28, JD's ask; same as the Command Center): hold Option+Shift, every card
   glows; click one to open the Business Pulse sheet tab its numbers come from. Rules: page + card title. */
(function () {
  'use strict';
  const ID = '1qoVocRUbWy10aXwubXrS6YI6NZaQk_QaDA_QKv523nk';
  const T = {ig: ['566511582', 'IG Followers'], act: ['570304817', 'IG Activity'], fb: ['882333486', 'FB Activity'], comp: ['1047117654', 'Competitors'],
    master: ['1006042862', 'Master Table'], pres: ['1188439247', 'Presence'], web: ['1032727285', 'Web Sweep'], ai: ['727881344', 'AI Visibility'],
    rec: ['2087483743', 'Recommendations'], moves: ['1641812027', 'Moves'], roster: ['664165850', 'Roster']};
  const RULES = [
    [/recommend/i, 'rec'], [/\bai\b|chatgpt|gemini|assistant/i, 'ai'], [/website|sweep|site/i, 'web'], [/facebook|\bfb\b/i, 'fb'],
    [/follower|following|growth|projected|scenario|keep the current|post like|^[abc]\.\s/i, 'ig'],
    [/post|active|silent|weekday|per week|latest|cadence|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i, 'act'],
    [/price|pricing|wedding start|try a price|spread/i, 'comp'], [/medal|podium|engagement|review|rated|against the field|radar/i, 'master'],
    [/presence|channel/i, 'pres'], [/move/i, 'moves']];
  const PAGE = {overview: 'act', position: 'comp', leaders: 'master', recommendations: 'rec', trends: 'ig', directory: 'comp', data: 'master'};
  const url = k => 'https://docs.google.com/spreadsheets/d/' + ID + '/edit#gid=' + T[k][0];
  const page = () => (location.hash.replace(/^#\/?/, '') || 'overview').split(/[/?]/)[0];
  const first = el => ((el.innerText || '').trim().split('\n')[0] || '').slice(0, 80);
  function resolve(el) {
    const t = first(el);
    for (const [re, k] of RULES) if (re.test(t)) return {url: url(k), label: 'Business Pulse › ' + T[k][1]};
    return null;
  }
  function fallback() { const k = PAGE[page()]; return k ? {url: url(k), label: 'Business Pulse › ' + T[k][1] + ' (page source)'} : {url: 'https://docs.google.com/spreadsheets/d/' + ID + '/edit', label: 'Business Pulse (whole sheet)'}; }
  function isCard(e) {
    if (e.closest('header, nav, .src-tip')) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 110 || r.height < 54 || (r.width > innerWidth * .98 && r.height > innerHeight * .9)) return false;
    const cs = getComputedStyle(e);
    return parseFloat(cs.borderTopLeftRadius) >= 6 && cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0;
  }
  let ON = false, cards = [], tip = null, hot = null;
  function scan() {
    cards = [];
    document.querySelectorAll('section, article, div, li, button, a').forEach(e => { if (cards.length < 400 && e.offsetParent && isCard(e)) cards.push(e); });
    cards.forEach(e => { e.__src = resolve(e); e.classList.add(e.__src ? 'src-on' : 'src-none'); });
  }
  function clear() { cards.forEach(e => { e.classList.remove('src-on', 'src-none', 'src-hot'); delete e.__src; }); cards = []; if (tip) tip.style.display = 'none'; hot = null; }
  function cardFor(t) { let e = t, fb = null; while (e && e !== document.body) { if (e.__src !== undefined) { if (e.__src) return {el: e, src: e.__src}; fb = fb || e; } e = e.parentElement; } return fb ? {el: fb, src: null} : null; }
  const on = () => { if (!ON) { ON = true; document.documentElement.classList.add('src-mode'); scan(); } };
  const off = () => { if (ON) { ON = false; document.documentElement.classList.remove('src-mode'); clear(); } };
  const typing = e => e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
  addEventListener('keydown', e => { if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && !typing(e)) on(); }, true);
  addEventListener('keyup', e => { if (!e.altKey || !e.shiftKey) off(); }, true);
  addEventListener('blur', off);
  addEventListener('hashchange', () => { if (ON) { clear(); setTimeout(scan, 400); } });
  document.addEventListener('mousemove', e => {
    if (!ON) return; if (!e.altKey || !e.shiftKey) return off();
    const c = cardFor(e.target); if (!c) { if (tip) tip.style.display = 'none'; return; }
    if (hot !== c.el) { if (hot) hot.classList.remove('src-hot'); hot = c.el; hot.classList.add('src-hot'); }
    if (!tip) { tip = document.createElement('div'); tip.className = 'src-tip'; document.body.appendChild(tip); }
    const s = c.src || fallback(); tip.textContent = 'Open source · ' + s.label; tip.classList.toggle('muted', !c.src);
    const r = c.el.getBoundingClientRect(); tip.style.left = Math.max(8, Math.min(innerWidth - 360, r.left)) + 'px'; tip.style.top = Math.max(8, r.top - 30) + 'px'; tip.style.display = 'block';
  }, true);
  const block = e => { if (ON) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
  document.addEventListener('mousedown', block, true); document.addEventListener('mouseup', block, true);
  document.addEventListener('click', e => { if (!ON) return; block(e); const c = cardFor(e.target); const s = (c && c.src) || fallback(); const w = window.open(s.url, '_blank'); if (w) { try { w.opener = null; } catch (x) {} } }, true);
  const st = document.createElement('style');
  st.textContent = 'html.src-mode,html.src-mode *{cursor:pointer!important}' +
    '.src-on{outline:1.5px solid color-mix(in srgb,var(--you,#a89cff) 75%,transparent)!important;outline-offset:2px;box-shadow:0 0 18px color-mix(in srgb,var(--you,#a89cff) 30%,transparent)!important}' +
    '.src-on.src-hot{outline:2px solid var(--you,#a89cff)!important;box-shadow:0 0 0 1px var(--you,#a89cff),0 0 28px color-mix(in srgb,var(--you,#a89cff) 55%,transparent)!important}' +
    '.src-none{outline:1px dashed color-mix(in srgb,var(--tx2,#8a8fa3) 55%,transparent)!important;outline-offset:2px}' +
    '.src-tip{position:fixed;z-index:2147483000;display:none;pointer-events:none;max-width:360px;padding:5px 9px;border-radius:7px;font:600 11.5px/1.3 inherit;color:#fff;background:var(--you2,#8a79ff);box-shadow:0 4px 18px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.src-tip.muted{background:#2a2d38;color:var(--tx2,#aab)}';
  document.head.appendChild(st);
  window.PulseSource = {on, off, resolve};
})();
