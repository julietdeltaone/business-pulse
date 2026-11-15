/* Business Pulse — front end. One file, no dependencies, works from file://.
   Design owner: Claude. Data owner: Muse (daily refresh).

   ======================= NOTES FOR MUSE (read before every refresh) =======================
   Your job is the DATA. This page (index.html, styles.css, app.js, fonts/) is the design and is
   maintained separately. Before each sync, copy these four from the repo's main branch into your
   workspace site/ folder so your sync does not overwrite them with an older copy. Only touch:
   the files in data/, the <meta name="build"> line, and the ?v= tags in index.html.

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
const state = { scope: 'all', svc: 'wed', whatIf: null, psort: 'posts30', q: '', lane: '', dsort: 'full' };
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
    const cls = 'c' + Math.min(k, 3) + (dn(d) < dn(ig.date) - ig.span ? ' na' : '');
    h += k && ig.links[d] ? '<a class="' + cls + '" href="' + esc(ig.links[d]) + '" target="_blank" rel="noopener" data-tip="' + tip + '"></a>' : '<i class="' + cls + '" data-tip="' + tip + '"></i>';
  }
  return '<span class="cells' + (me ? ' me' : '') + '" style="--n:' + n + '">' + h + '</span>';
}
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
function viewBrief() {
  const pf = priceFacts('wed'), P = pool(), ig = P.filter(b => b.ig && b.ig.posts30 != null);
  const peersIg = ig.filter(b => !b.me), medPost = peersIg.length >= 5 ? median(peersIg.map(b => b.ig.posts30)) : null;
  const top = ig.slice().sort((a, b) => b.ig.posts30 - a.ig.posts30)[0];
  const bs = boards(), md = medals(bs), lead = md[0], mine = md.find(m => m.b.me);
  const pJ = JD.prices.wed, link = (v, t) => '<a class="go" href="#' + v + '">' + t + '</a>';
  const q1 = pf.med != null && pJ
    ? 'Wedding photography starts at a median of <em>' + money(pf.med) + '</em> across ' + pf.peers.length + ' competitors. You start at ' + A('<em class="me">' + money(pJ.low) + '</em>', priceUrl(pJ.url, pJ.low)) + ', ' + (pf.pos === 1 ? 'the lowest' : ord(pf.pos) + ' lowest') + ' of ' + pf.all.length + '.'
    : 'Not enough linked wedding prices in this set to place you yet.';
  const q2 = medPost != null && JD.ig && JD.ig.posts30 != null && top
    ? 'A typical competitor posted <em>' + fmt(medPost) + plural(medPost, ' time') + '</em> in the last 30 days. You posted ' + A('<em class="me">' + (JD.ig.posts30 === 0 ? 'nothing' : JD.ig.posts30 === 1 ? 'once' : JD.ig.posts30 + ' times') + '</em>', JD.ig.url) + '. ' + esc(top.name) + ' posted ' + A('<em>' + top.ig.posts30 + '</em>', top.ig.url) + '.'
    : 'Not enough tracked Instagram accounts in this set to compare posting yet.';
  const q3 = lead
    ? esc(lead.b.me ? 'You lead' : lead.b.name + ' leads') + ' <em>' + lead.g + '</em> of ' + bs.length + ' categories' + (lead.g ? ': ' + lead.in.filter(x => x.p === 1).map(x => x.t.toLowerCase()).join(', ') : '') + '. ' + (lead.b.me ? '' : mine ? 'You place in the top three for ' + mine.in.map(x => x.t.toLowerCase()).join(' and ') + '.' : 'You are outside the top three in every category.')
    : 'Not enough linked figures to rank anyone yet.';
  /* this week */
  const posted = P.filter(b => b.ig && b.ig.posts7).sort((a, b) => b.ig.posts7 - a.ig.posts7).slice(0, 7);
  const movers = P.filter(b => b.ig && b.ig.g7).sort((a, b) => Math.abs(b.ig.g7) - Math.abs(a.ig.g7)).slice(0, 7);
  const moves = (D.priceHistory || []).filter(h => BY[h.id] && age(h.date) != null && age(h.date) <= 30 && h.url).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 7);
  const reread = P.filter(b => b.pdate && age(b.pdate) <= 7 && Object.keys(b.prices).length).sort((a, b) => a.pdate < b.pdate ? 1 : -1).slice(0, 7);
  const li = (l, r) => '<li><span>' + l + '</span><b>' + r + '</b></li>';
  const near = pf.all.length ? (() => { const i = Math.max(0, pf.pos - 1), s = Math.max(0, Math.min(pf.all.length - 7, i - 3)); return pf.all.slice(s, s + 7); })() : [];
  const mx = near.length ? Math.max.apply(null, near.map(b => b.prices.wed.low)) : 1;
  return '<div class="view brief">' +
    '<section class="hero">' +
      '<article><h2>How much is everyone charging?</h2><p>' + q1 + '</p>' + link('pricing', 'Open pricing') + '</article>' +
      '<article><h2>How often are people posting?</h2><p>' + q2 + '</p>' + link('posting', 'Open posting') + '</article>' +
      '<article><h2>Who is the most successful?</h2><p>' + q3 + '</p>' + link('leaders', 'Open leaders') + '</article>' +
    '</section>' +
    '<section class="trio">' +
      '<div class="pane"><h3>Your price neighbors</h3><p class="cap">Wedding photography starting prices closest to yours</p><div class="bars">' + (near.length ? near.map(b => barRow(b, b.prices.wed.low / mx * 100, A(money(b.prices.wed.low), priceUrl(b.prices.wed.url, b.prices.wed.low)))).join('') : empty('No linked prices yet.')) + '</div></div>' +
      '<div class="pane"><h3>Posting, last two weeks</h3><p class="cap">One square per day. Lit squares had new posts.</p><div class="mini-grid">' + (ig.length ? ig.slice().sort((a, b) => b.ig.posts30 - a.ig.posts30).filter((b, i) => i < 6 || b.me).map(b => '<div class="mg' + (b.me ? ' me' : '') + '">' + whoFull(b) + strip(b.ig, 14, b.me) + '</div>').join('') : empty('No tracked accounts yet.')) + '</div></div>' +
      '<div class="pane"><h3>Medal table</h3><p class="cap">First, second and third places across ' + bs.length + ' categories</p><ol class="medals">' + (md.length ? md.slice(0, 6).concat(mine && md.indexOf(mine) >= 6 ? [mine] : []).map(m => '<li' + (m.b.me ? ' class="me"' : '') + '>' + whoFull(m.b) + '<span class="mset"><i class="g">' + m.g + '</i><i class="s">' + m.s + '</i><i class="z">' + m.z + '</i></span></li>').join('') : empty('No rankings yet.')) + '</ol></div>' +
    '</section>' +
    '<section class="week"><h3>This week</h3><div class="wk">' +
      '<div><h4>Posted in the last 7 days</h4><ul class="kv">' + (posted.length ? posted.map(b => li(whoFull(b), A(b.ig.posts7 + plural(b.ig.posts7, ' post'), b.ig.url))).join('') : '<li class="none">No new posts seen.</li>') + '</ul></div>' +
      '<div><h4>Follower moves, 7 days</h4><ul class="kv">' + (movers.length ? movers.map(b => li(whoFull(b), A('<span class="' + (b.ig.g7 > 0 ? 'up' : 'dn') + '">' + signed(b.ig.g7) + '</span>', b.ig.url))).join('') : '<li class="none">No movement.</li>') + '</ul></div>' +
      (moves.length
        ? '<div><h4>Price moves, 30 days</h4><ul class="kv">' + moves.map(h => li(whoFull(BY[h.id]) + ' <small>' + esc(SVC[h.service] || '') + '</small>', A(money(h.old) + ' to ' + money(h.new), priceUrl(h.url, h.new)))).join('') + '</ul></div>'
        : '<div><h4>Prices re-read this week</h4><ul class="kv">' + (reread.length ? reread.map(b => { const k = Object.keys(b.prices)[0], p = b.prices[k]; return li(whoFull(b) + ' <small>' + esc(SVC[k]) + '</small>', A('from ' + money(p.low), priceUrl(p.url, p.low))); }).join('') : '<li class="none">No price pages were re-read.</li>') + '</ul></div>') +
    '</div></section></div>';
}

/* ---------- Pricing ---------- */
function viewPricing() {
  const svc = state.svc, pf = priceFacts(svc), P = pool();
  const tabs = SERVICES.map(s => { const n = P.filter(b => b.prices[s[0]]).length; return '<button class="seg" data-svc="' + s[0] + '" aria-pressed="' + (s[0] === svc) + '"' + (n ? '' : ' disabled') + '>' + s[1] + '<small>' + n + '</small></button>'; }).join('');
  if (!pf.all.length) return '<div class="view">' + head('Pricing', 'Starting price and top listed price for each business, read from their own pricing page.') + '<div class="segs">' + tabs + '</div>' + empty('No linked prices for this service in this set.') + '</div>';
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
    (mineLow != null
      ? '<div class="whatif"><h3>Try a price</h3><p class="cap">Slide to see where a different starting price would put you.</p>' +
        '<output id="wi-n">' + money(cur) + '</output><input type="range" id="wi" min="' + Math.max(25, Math.floor(lowsOthers[0] * 0.6 / 25) * 25) + '" max="' + max + '" step="' + (svc === 'wed' || svc === 'wedv' ? 50 : 5) + '" value="' + cur + '" aria-label="Starting price to try">' +
        '<p id="wi-t">' + whatIfText(cur, placeAt(cur), n, pf.med, mineLow) + '</p><button class="lnk" id="wi-r"' + (wi == null || wi === mineLow ? ' hidden' : '') + '>Back to my real price</button></div>'
      : '<div class="whatif"><p class="cap">You have no linked ' + esc(SVC[svc].toLowerCase()) + ' price on record.</p></div>') +
    '</aside>';
  return '<div class="view">' + head('Pricing', 'Starting price and top listed price for each business, read from their own pricing page. Click any amount to open that page.') +
    '<div class="segs">' + tabs + '</div>' +
    '<div class="split"><div class="pane chart"><div class="plot" data-max="' + max + '"><div class="axis">' + ticks + '</div><div class="over">' + lines + '</div>' + rows + '</div>' +
    '<p class="foot">' + pf.all.length + ' businesses with a linked price. ' + (stale ? stale + ' shown dimmed: not re-read in the last ' + PRICE_DAYS + ' days. ' : '') + 'Elopement, hourly and add-on prices are left out.</p></div>' + side + '</div></div>';
}
function whatIfText(v, place, n, med, real) {
  const d = med != null ? v - med : null;
  return (v === real ? 'Your real price is ' : 'At ' + money(v) + ' you would be ') + '<strong>' + (place === 1 ? 'the lowest' : place === n ? 'the highest' : ord(place) + ' lowest') + ' of ' + n + '</strong>' +
    (d != null ? ', ' + (d === 0 ? 'right at the median' : money(Math.abs(d)) + (d < 0 ? ' under' : ' over') + ' the median') : '') + '.';
}

/* ---------- Posting ---------- */
function viewPosting() {
  const P = pool(), ig = P.filter(b => b.ig), tracked = ig.filter(b => b.ig.posts30 != null), handles = P.filter(b => b.handle).length;
  if (!ig.length) return '<div class="view">' + head('Posting', 'How often each competitor posts on Instagram.') + empty('No Instagram accounts are being tracked in this set.') + '</div>';
  const peers = tracked.filter(b => !b.me), med = peers.length >= 5 ? median(peers.map(b => b.ig.posts30)) : null;
  const top = tracked.slice().sort((a, b) => b.ig.posts30 - a.ig.posts30)[0], quiet = tracked.filter(b => b.ig.posts30 === 0).length;
  const sorts = { posts30: b => b.ig.posts30 == null ? -1 : b.ig.posts30, last: b => b.ig.lastPost ? dn(b.ig.lastPost) : 0, eng: b => b.ig.eng == null ? -1 : b.ig.eng, fol: b => b.ig.followers, g30: b => b.ig.g30 == null ? -1e9 : b.ig.g30 };
  const f = sorts[state.psort] || sorts.posts30, list = ig.slice().sort((a, b) => f(b) - f(a) || a.name.localeCompare(b.name));
  const th = (k, t) => '<button class="th num" data-psort="' + k + '" aria-pressed="' + (state.psort === k) + '">' + t + '</button>';
  let wk = ''; for (let i = STRIP - 1; i >= 0; i--) { const n = ASOF - i, d = new Date(n * DAY); wk += '<span>' + (d.getUTCDay() === 1 ? dshort(iso(n)) : '') + '</span>'; }
  const rows = list.map(b => { const g = b.ig; return '<div class="po' + (b.me ? ' me' : '') + '">' + whoFull(b) + strip(g, STRIP, b.me) +
    '<b class="num">' + (g.posts30 != null ? A(fmt(g.posts30), g.url) : '<small>tracking</small>') + '</b>' +
    '<span class="num">' + (g.lastPost ? A(ago(g.lastPost), g.url, 'Latest post ' + dshort(g.lastPost)) : '') + '</span>' +
    '<span class="num">' + (g.eng != null ? A(g.eng.toFixed(1) + '%', g.url) : '') + '</span>' +
    '<span class="num">' + A(fmt(g.followers), g.url) + '</span>' +
    '<span class="num ' + (g.g30 > 0 ? 'up' : g.g30 < 0 ? 'dn' : '') + '">' + (g.g30 != null ? A(signed(g.g30), g.url) : '') + '</span></div>'; }).join('');
  return '<div class="view">' + head('Posting', 'New Instagram posts per account over the last ' + STRIP + ' days. Click an account\'s numbers to open its profile.') +
    '<div class="stats">' +
      '<div class="stat"><span>Most active</span><b>' + (top ? A(top.ig.posts30 + ' posts', top.ig.url) : '') + '</b><small>' + (top ? esc(top.name) + ', last 30 days' : '') + '</small></div>' +
      '<div class="stat"><span>Typical competitor</span><b>' + (med != null ? fmt(med) + plural(med, ' post') : 'Too few') + '</b><small>Median over 30 days, ' + peers.length + ' accounts</small></div>' +
      '<div class="stat me"><span>You</span><b>' + (JD.ig && JD.ig.posts30 != null ? A(JD.ig.posts30 + plural(JD.ig.posts30, ' post'), JD.ig.url) : 'Not tracked') + '</b><small>' + (JD.ig && JD.ig.lastPost ? 'Latest post ' + ago(JD.ig.lastPost) : '') + '</small></div>' +
      '<div class="stat"><span>Silent for 30 days</span><b>' + quiet + ' of ' + tracked.length + '</b><small>Accounts with no new post</small></div>' +
    '</div>' +
    '<div class="pane chart scroll"><div class="pgrid"><div class="po hd"><span></span><span class="cells wkd" style="--n:' + STRIP + '">' + wk + '</span>' + th('posts30', 'Posts, 30 days') + th('last', 'Latest post') + th('eng', 'Engagement') + th('fol', 'Followers') + th('g30', '30-day change') + '</div>' + rows + '</div>' +
    '<p class="foot"><span class="key"><i class="c0"></i>none<i class="c1"></i>1<i class="c2"></i>2<i class="c3"></i>3 or more</span>' + ig.length + ' of ' + handles + ' known Instagram accounts in this set are pulled daily. Posts are counted from the change in each profile\'s post total between daily pulls, so a deleted post can hide a new one. Stories are not counted.</p></div></div>';
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
  return '<div class="view">' + head('Leaders', 'Who ranks first in each measure, and where you place. Every value opens the page it was read from.') + table + '<div class="boards">' + cards + '</div></div>';
}

/* ---------- Directory ---------- */
function viewDirectory() {
  const q = state.q.toLowerCase(), P = pool().filter(b => (!q || (b.name + ' ' + b.town).toLowerCase().indexOf(q) >= 0) && (!state.lane || b.prices[state.lane]));
  const DS = { full: b => Object.keys(b.prices).length + (b.ig ? 2 : 0) + (b.rev != null ? 1 : 0), wed: b => b.prices.wed ? b.prices.wed.low : -1, portrait: b => b.prices.portrait ? b.prices.portrait.low : -1, family: b => b.prices.family ? b.prices.family.low : -1, fol: b => b.ig ? b.ig.followers : -1, post: b => b.ig && b.ig.posts30 != null ? b.ig.posts30 : -1, rev: b => b.rev != null ? b.rev : -1 };
  const df = DS[state.dsort] || DS.full; P.sort((a, b) => df(b) - df(a) || a.name.localeCompare(b.name));
  const dth = (k, t) => '<th class="num"><button class="th" data-dsort="' + k + '" aria-pressed="' + (state.dsort === k) + '">' + t + '</button></th>';
  const cell = (b, k) => b.prices[k] ? A(money(b.prices[k].low), priceUrl(b.prices[k].url, b.prices[k].low)) : '';
  const rows = P.map(b => '<tr class="' + (b.me ? 'me' : '') + '"><td>' + whoFull(b) + '<small>' + esc(b.town) + '</small></td><td class="num">' + cell(b, 'wed') + '</td><td class="num">' + cell(b, 'portrait') + '</td><td class="num">' + cell(b, 'family') + '</td><td class="num">' + (b.ig ? A(fmt(b.ig.followers), b.ig.url) : '') + '</td><td class="num">' + (b.ig && b.ig.posts30 != null ? A(fmt(b.ig.posts30), b.ig.url) : '') + '</td><td class="num">' + (b.rev != null ? A(fmt(b.rev) + (b.rating != null ? ' <small>' + b.rating.toFixed(1) + '</small>' : ''), b.rurl) : '') + '</td></tr>').join('');
  return '<div class="view">' + head('Directory', 'Everyone on the roster. Click a name for the full profile, or a column to sort by it. A blank cell means there is no linked figure.',
    '<div class="tools"><input class="in" id="dq" type="search" placeholder="Search name or town" value="' + esc(state.q) + '" aria-label="Search"><select class="in" id="dl" aria-label="Service"><option value="">Any service</option>' + SERVICES.map(s => '<option value="' + s[0] + '"' + (state.lane === s[0] ? ' selected' : '') + '>Has ' + s[1].toLowerCase() + ' price</option>').join('') + '</select></div>') +
    '<div class="pane chart scroll"><table class="tb"><thead><tr><th>Business</th>' + dth('wed', 'Wedding from') + dth('portrait', 'Portrait from') + dth('family', 'Family from') + dth('fol', 'Followers') + dth('post', 'Posts, 30 days') + dth('rev', 'Reviews') + '</tr></thead><tbody>' + (rows || '<tr><td colspan="7">' + empty('Nothing matches.') + '</td></tr>') + '</tbody></table><p class="foot">' + P.length + ' businesses</p></div></div>';
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
  const stale = priced.filter(b => !b.pdate || age(b.pdate) > PRICE_DAYS), noLink = D.competitors.filter(c => c.pricing && !c.pricing_url).length;
  const revNoLink = D.competitors.filter(c => c.review_count != null && !c.review_url).length, revNoDate = B.filter(b => b.rev != null && !b.rdate).length, ai = D.aiChecks.filter(a => a.url).length;
  if (withH.length - pulled.length) g.push([withH.length - pulled.length + ' Instagram accounts are not pulled daily', 'Their followers and posting are blank. Names: ' + withH.filter(b => !b.ig).slice(0, 8).map(b => b.name).join(', ') + (withH.length - pulled.length > 8 ? ' and more.' : '.')]);
  if (stale.length) g.push([stale.length + ' price lists have not been re-read in ' + PRICE_DAYS + ' days', 'They still show, dimmed. Oldest first: ' + stale.sort((a, b) => (a.pdate || '') < (b.pdate || '') ? -1 : 1).slice(0, 6).map(b => b.name + (b.pdate ? ' (' + dshort(b.pdate) + ')' : ' (no date)')).join(', ') + '.']);
  if (noLink) g.push([noLink + ' price lists have no pricing page link', 'They are left off until the page they came from is recorded.']);
  if (revNoLink) g.push([revNoLink + ' review counts have no listing link', 'They are left off.']);
  if (revNoDate) g.push([revNoDate + ' review counts have no read date of their own', 'They show, but nobody can tell how old they are.']);
  if (D.aiChecks.length && !ai) g.push(['AI assistant answers are not used', 'None of the ' + D.aiChecks.length + ' recorded answers has a share link to the conversation.']);
  if (!(D.priceHistory || []).length) g.push(['Price changes are not recorded', 'Only the latest price is stored, so the Brief cannot show who raised or cut prices.']);
  return g;
}
function viewData() {
  const S = sources(), G = gaps();
  return '<div class="view">' + head('Data', 'How fresh each source is, and what is missing. Built ' + esc((D.builtAt || '').slice(0, 16).replace('T', ' ')) + ' UTC.') +
    '<div class="split even"><div class="pane"><h3>Freshness</h3><p class="cap">The mark on each bar is the day the source counts as late.</p>' +
    S.map(x => '<div class="fr st-' + x.st + '"><span>' + esc(x.s.label) + '<small>' + esc(x.s.cadence) + '</small></span><span class="trk"><i data-w="' + Math.max(1.5, Math.min(100, (x.age || 0) / (2 * x.s.late_after_days) * 100)).toFixed(1) + '"></i></span><b>' + (x.date ? esc(dshort(x.date)) + '<small>' + esc(ago(x.date)) + '</small>' : 'No data') + '</b></div>').join('') + '</div>' +
    '<div class="pane"><h3>Gaps</h3><p class="cap">What would make this page more complete.</p>' + (G.length ? G.map(g => '<div class="gp"><b>' + esc(g[0]) + '</b><p>' + esc(g[1]) + '</p></div>').join('') : empty('Nothing missing today.')) + '</div></div></div>';
}

/* ---------- profile drawer ---------- */
function openProfile(id) {
  const b = BY[id]; if (!b) return;
  const g = b.ig, pk = Object.keys(b.prices);
  const links = [['Website', b.site], ['Pricing page', b.purl], ['Instagram', igUrl(b.handle)], ['Reviews', b.rurl]].filter(x => x[1]);
  const el = document.createElement('div'); el.className = 'drawer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', b.name);
  el.innerHTML = '<div class="dw"><button class="x" aria-label="Close">Close</button><h2>' + esc(b.name) + '</h2><p class="cap">' + esc(b.town) + (b.me ? ', your business' : '') + '</p>' +
    '<div class="links">' + (links.length ? links.map(l => '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + l[0] + '</a>').join('') : '<span class="cap">No links on record, so nothing about this business can be shown.</span>') + '</div>' +
    '<section><h3>Prices</h3>' + (pk.length ? '<ul class="kv">' + pk.map(k => { const p = b.prices[k]; return '<li><span>' + esc(SVC[k]) + '</span><b>' + A(money(p.low), priceUrl(p.url, p.low)) + (p.high > p.low ? ' to ' + A(money(p.high), priceUrl(p.url, p.high)) : '') + '</b></li>'; }).join('') + '</ul>' : '') +
      (b.ptext ? '<p class="quote">' + esc(clean(b.ptext)) + '</p><p class="cap">' + A('As listed on ' + esc(host(b.purl)), b.purl) + ', ' + (b.pdate ? 'read ' + dshort(b.pdate) : 'no read date') + '</p>' : '<p class="cap">' + esc((D.pricingGaps[b.id] && D.pricingGaps[b.id].reason) || 'No linked price list') + '</p>') + '</section>' +
    '<section><h3>Instagram</h3>' + (g ? '<div class="dstats"><div><b>' + A(fmt(g.followers), g.url) + '</b><span>followers</span></div><div><b>' + (g.posts30 != null ? A(fmt(g.posts30), g.url) : '') + '</b><span>posts, 30 days</span></div><div><b>' + (g.eng != null ? A(g.eng.toFixed(1) + '%', g.url) : '') + '</b><span>engagement</span></div><div><b class="' + (g.g30 > 0 ? 'up' : g.g30 < 0 ? 'dn' : '') + '">' + (g.g30 != null ? signed(g.g30) : '') + '</b><span>30-day change</span></div></div>' + spark(g.series) + '<p class="cap">Followers since ' + dshort(ROWS[b.handle][0].date) + '</p>' + strip(g, STRIP, b.me) + '<p class="cap">New posts, last ' + STRIP + ' days' + (g.lastPost ? '. Latest post ' + ago(g.lastPost) : '') + '</p>' : '<p class="cap">' + (b.handle ? '@' + esc(b.handle) + ' is on the roster but is not pulled daily.' : 'No Instagram account on record.') + '</p>') + '</section>' +
    '<section><h3>Reviews</h3>' + (b.rev != null ? '<div class="dstats"><div><b>' + A(fmt(b.rev), b.rurl) + '</b><span>reviews on ' + esc(({ google: 'Google', facebook: 'Facebook', weddingwire: 'WeddingWire', theknot: 'The Knot', zola: 'Zola' })[b.rsrc] || 'their listing') + '</span></div>' + (b.rating != null ? '<div><b>' + A(b.rating.toFixed(1), b.rurl) + '</b><span>average rating</span></div>' : '') + '</div><p class="cap">' + (b.rdate ? 'Read ' + dshort(b.rdate) : 'No read date') + '</p>' : '<p class="cap">No linked review count.</p>') + '</section></div>';
  document.body.appendChild(el);
  const prev = document.activeElement, close = () => { el.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); };
  const key = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', key); $('.x', el).focus();
  requestAnimationFrame(() => el.classList.add('on'));
}

/* ---------- router ---------- */
const VIEWS = { brief: viewBrief, pricing: viewPricing, posting: viewPosting, leaders: viewLeaders, directory: viewDirectory, data: viewData };
const stage = $('#stage');
let first = true;
function render(keep) {
  const v = (location.hash || '#brief').slice(1).split('/')[0], name = VIEWS[v] ? v : 'brief', y = stage.scrollTop;
  stage.innerHTML = VIEWS[name]();
  $$('#nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + name ? 'page' : 'false'));
  if (first && name === 'brief' && !REDUCED) stage.firstChild.classList.add('intro');
  first = false;
  stage.scrollTop = keep ? y : 0;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-w]', stage).forEach((el, i) => { el.style.transitionDelay = Math.min(i, 24) * 18 + 'ms'; el.style.width = el.dataset.w + '%'; })));
}
window.addEventListener('hashchange', () => render());

stage.addEventListener('click', e => {
  const w = e.target.closest('[data-b]'); if (w) { openProfile(w.dataset.b); return; }
  const s = e.target.closest('[data-svc]'); if (s) { state.svc = s.dataset.svc; state.whatIf = null; render(true); return; }
  const p = e.target.closest('[data-psort]'); if (p) { state.psort = p.dataset.psort; render(true); return; }
  const ds = e.target.closest('[data-dsort]'); if (ds) { state.dsort = state.dsort === ds.dataset.dsort ? 'full' : ds.dataset.dsort; render(true); return; }
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
  if (h) { h.className = 'health ' + (bad ? 'stalled' : late ? 'late' : 'ok'); h.lastElementChild.textContent = bad || late ? (bad + late) + plural(bad + late, ' source') + ' behind' : 'Data current, ' + dshort(ASOF_S); }
}
chrome(); render();
})();
