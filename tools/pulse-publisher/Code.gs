/**
 * Pulse Publisher — builds the Business Pulse dashboard data from the Business Pulse sheet
 * and publishes it as ONE file (data/data.js) to julietdeltaone/business-pulse.
 *
 * Owner: Atlas. Bound to the Business Pulse sheet (1qoVocRUbWy10aXwubXrS6YI6NZaQk_QaDA_QKv523nk).
 *
 * What it never does:
 *   - read or write index.html, styles.css, app.js or fonts/ (Claude's design stays exactly as it is)
 *   - write to the Business Pulse sheet (the CC Competitor Watch card keeps reading Roster + Moves)
 *   - publish a partial build: any failed check stops the run and the live site keeps its last good data
 *
 * Modes (Script Properties, key MODE):
 *   dry-run (default)  builds and saves pulse-preview-data.js in Drive. Nothing goes to GitHub.
 *   live               builds and writes data/data.js to GitHub (needs GITHUB_TOKEN). Turned on only with JD's go.
 *
 * Script Properties:
 *   MODE            dry-run | live
 *   GITHUB_TOKEN    fine-grained token, repo julietdeltaone/business-pulse only, Contents: read and write
 *   FOLDER_ID       Drive folder for pulse-base.json and the preview (default: COMMAND CENTER > Business Data)
 *   ADMIN_DATA_ID   Admin Data sheet for RunLog rows (default below)
 */

var PP = {
  REPO: 'julietdeltaone/business-pulse',
  BRANCH: 'main',
  PATH: 'data/data.js',
  PAGES_URL: 'https://julietdeltaone.github.io/business-pulse/data/data.js',
  FOLDER_ID: '1CdvqAaNt4QSVz39WufAISn94I2f24x4H',
  ADMIN_DATA_ID: '1_CstkGl_8mQStmX2r2dIZNJ29CHKFpQApFlS0kIJrxA',
  BASE_FILE: 'pulse-base.json',
  PREVIEW_FILE: 'pulse-preview-data.js',
  ROUTINE: 'Pulse Publisher',
  ROUTINE_ID: 'pulse-publisher',
  WRITER: 'atlas',
  MIN_COMPETITORS: 80,
  MAX_SHRINK: 0.30,
  // Blocks the sheet holds. Everything else in PULSE_DATA comes from pulse-base.json.
  SHEET_TABS: ['Competitors', 'IG Followers', 'IG Activity', 'FB Activity', 'Presence', 'Web Sweep']
};

/* ============================== BUILD (pure, no Google services) ============================== */

function ppRows_(table) {
  // table: [[header...], [row...], ...] of display strings -> array of {header: string}
  if (!table || table.length < 2) return [];
  var h = table[0].map(function (x) { return String(x).trim(); });
  var out = [];
  for (var i = 1; i < table.length; i++) {
    var r = table[i] || [];
    var blank = true, o = {};
    for (var j = 0; j < h.length; j++) {
      if (!h[j]) continue;
      var v = r[j] === undefined || r[j] === null ? '' : String(r[j]);
      if (v !== '') blank = false;
      o[h[j]] = v;
    }
    if (!blank) out.push(o);
  }
  return out;
}

function ppStr_(v) { v = v === undefined ? '' : String(v); return v === '' ? null : v; }
function ppReq_(v) { return v === undefined || v === null ? '' : String(v); }
function ppNum_(v) {
  if (v === undefined || v === null) return null;
  var s = String(v).replace(/[,\s$]/g, '');
  if (s === '') return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}
function ppJson_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}
function ppBool_(v) { return String(v).trim().toUpperCase() === 'TRUE'; }
function ppList_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  var s = String(v).trim();
  if (s.charAt(0) === '[') return ppJson_(s);
  return s.split(/\s*,\s*/).filter(function (x) { return x !== ''; });
}
function ppByDate_(arr) {
  // stable ascending sort on .date, so the tab can be sorted newest-first without changing the output
  return arr.map(function (x, i) { return [x, i]; })
    .sort(function (a, b) { return a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1]; })
    .map(function (p) { return p[0]; });
}

function ppCompetitors_(rows) {
  return rows.filter(function (r) { return r.id; }).map(function (r) {
    return {
      id: ppReq_(r.id), name: ppReq_(r.name), specialty: ppReq_(r.specialty), town: ppReq_(r.town),
      region: ppReq_(r.region), county: ppReq_(r.county), website: ppStr_(r.website),
      ig_handle: ppStr_(r.ig_handle), pricing: ppStr_(r.pricing), pricing_url: ppStr_(r.pricing_url),
      services: ppList_(r.services), est_year: ppNum_(r.est_year), media_count: ppNum_(r.media_count),
      biography: ppStr_(r.biography), status: ppReq_(r.status), source_label: ppReq_(r.source_label),
      discovered_date: ppStr_(r.discovered_date), last_post_date: ppStr_(r.last_post_date),
      last_post_type: ppStr_(r.last_post_type), review_count: ppNum_(r.review_count),
      review_rating: ppNum_(r.review_rating), review_source: ppStr_(r.review_source),
      review_url: ppStr_(r.review_url), coverage: ppList_(r.coverage), engagement: ppJson_(r.engagement)
    };
  });
}

function ppIgFollowers_(rows) {
  var out = {};
  ppByDate_(rows.filter(function (r) { return r.handle && r.date; })).forEach(function (r) {
    (out[r.handle] = out[r.handle] || []).push({ date: r.date, count: ppNum_(r.count) });
  });
  return out;
}

function ppIgActivity_(rows) {
  return ppByDate_(rows.filter(function (r) { return r.handle && r.date; }).map(function (r) {
    return {
      date: r.date, handle: r.handle, followers: ppNum_(r.followers), delta: ppNum_(r.delta),
      activity: ppStr_(r.activity), media_count: ppNum_(r.media_count),
      last_media_date: ppStr_(r.last_media_date), engagement: ppJson_(r.engagement)
    };
  }));
}

function ppFbActivity_(rows) {
  return ppByDate_(rows.filter(function (r) { return r.id && r.date; }).map(function (r) {
    return {
      date: r.date, id: r.id, name: ppReq_(r.name), kind: ppReq_(r.kind), fb_url: ppReq_(r.fb_url),
      followers: ppNum_(r.followers), followers_kind: ppStr_(r.followers_kind), delta: ppNum_(r.delta),
      last_post_date: ppStr_(r.last_post_date), recent_posts_90d: ppNum_(r.recent_posts_90d),
      rating: ppStr_(r.rating), status: ppReq_(r.status)
    };
  }));
}

function ppPresence_(rows, generated) {
  return {
    generated: generated,
    businesses: rows.filter(function (r) { return r.id; }).reduce(function (acc, r) {
      acc[r.id] = {
        id: r.id, name: ppReq_(r.name), website: ppJson_(r.website), instagram: ppJson_(r.instagram),
        facebook: ppJson_(r.facebook), last_activity: ppStr_(r.last_activity),
        last_channel: ppStr_(r.last_channel), facebook_first: ppBool_(r.facebook_first),
        dark: ppBool_(r.dark), dormant: ppBool_(r.dormant), shifted: ppJson_(r.shifted)
      };
      return acc;
    }, {})
  };
}

function ppWebSweep_(rows) {
  // one row per page in the sheet -> one entry per run (date + run_label), first-seen order
  var runs = [], idx = {};
  ppByDate_(rows.filter(function (r) { return r.date; })).forEach(function (r) {
    var k = r.date + '\u0000' + r.run_label;
    if (!(k in idx)) {
      idx[k] = runs.length;
      runs.push({ date: r.date, run_label: ppReq_(r.run_label), fetched: ppNum_(r.fetched), of_total: ppNum_(r.of_total), pages: {} });
    }
    if (r.page) runs[idx[k]].pages[r.page] = { status: ppStr_(r.status), note: ppStr_(r.note) };
  });
  return runs;
}

/**
 * tabs: { tabName: [[header...], [row...]] } as display strings.
 * base: the last full PULSE_DATA (blocks the sheet does not hold yet are carried from it).
 * Returns { ok, data, text, problems[], stats }.
 */
function ppBuild(tabs, base, nowIso) {
  var problems = [];
  base = base || {};
  PP.SHEET_TABS.forEach(function (t) { if (!tabs[t] || tabs[t].length < 2) problems.push('Tab "' + t + '" is missing or empty.'); });
  if (problems.length) return { ok: false, problems: problems };

  var built = {
    competitors: ppCompetitors_(ppRows_(tabs['Competitors'])),
    igFollowersHistory: ppIgFollowers_(ppRows_(tabs['IG Followers'])),
    igActivity: ppIgActivity_(ppRows_(tabs['IG Activity'])),
    fbActivity: ppFbActivity_(ppRows_(tabs['FB Activity'])),
    presence: ppPresence_(ppRows_(tabs['Presence']), (base.presence && base.presence.generated) || nowIso.slice(0, 10)),
    webSweepHistory: ppWebSweep_(ppRows_(tabs['Web Sweep']))
  };

  // Guard rails
  if (built.competitors.length < PP.MIN_COMPETITORS) problems.push('Only ' + built.competitors.length + ' competitors (need ' + PP.MIN_COMPETITORS + ').');
  if (!built.igActivity.length) problems.push('IG Activity produced no rows.');
  if (!built.fbActivity.length) problems.push('FB Activity produced no rows.');
  if (!Object.keys(built.igFollowersHistory).length) problems.push('IG Followers produced no history.');
  if (!Object.keys(built.presence.businesses).length) problems.push('Presence produced no businesses.');
  var bad = built.igActivity.filter(function (r) { return r.followers === null; }).length;
  if (bad > built.igActivity.length * 0.05) problems.push(bad + ' IG Activity rows have no follower count.');
  ['competitors', 'igActivity', 'fbActivity', 'webSweepHistory'].forEach(function (k) {
    var was = base[k] ? base[k].length : 0, now = built[k].length;
    if (was && now < was * (1 - PP.MAX_SHRINK)) problems.push(k + ' shrank from ' + was + ' to ' + now + '.');
  });
  var ids = {};
  built.competitors.forEach(function (c) { if (ids[c.id]) problems.push('Duplicate competitor id ' + c.id + '.'); ids[c.id] = 1; });

  // Assemble in the same key order as the base so the file diff stays readable
  var data = {}, order = Object.keys(base).length ? Object.keys(base) : Object.keys(built);
  order.forEach(function (k) { data[k] = (k in built) ? built[k] : base[k]; });
  Object.keys(built).forEach(function (k) { if (!(k in data)) data[k] = built[k]; });
  data.meta = Object.assign({}, base.meta || {}, { generated_at: nowIso, publisher: PP.ROUTINE_ID });
  delete data.builtAt;
  data.builtAt = nowIso; // keep builtAt last, as the old sync did

  var text = 'window.PULSE_DATA = ' + JSON.stringify(data) + ';\n';
  var stats = {
    competitors: built.competitors.length, igActivity: built.igActivity.length,
    fbActivity: built.fbActivity.length, igHandles: Object.keys(built.igFollowersHistory).length,
    webRuns: built.webSweepHistory.length, bytes: text.length,
    latestIg: built.igActivity.length ? built.igActivity[built.igActivity.length - 1].date : null
  };
  return { ok: problems.length === 0, data: data, text: text, problems: problems, stats: stats };
}

/* ============================== APPS SCRIPT RUNTIME ============================== */

function ppProp_(k, d) { var v = PropertiesService.getScriptProperties().getProperty(k); return v === null || v === '' ? d : v; }

function ppFolder_() { return DriveApp.getFolderById(ppProp_('FOLDER_ID', PP.FOLDER_ID)); }

function ppReadFile_(name) {
  var it = ppFolder_().getFilesByName(name);
  return it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : null;
}

function ppWriteFile_(name, text, mime) {
  var f = ppFolder_(), it = f.getFilesByName(name);
  if (it.hasNext()) { it.next().setContent(text); return; }
  f.createFile(name, text, mime || 'text/plain');
}

function ppReadTabs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), tabs = {};
  PP.SHEET_TABS.forEach(function (t) {
    var sh = ss.getSheetByName(t);
    tabs[t] = sh ? sh.getDataRange().getDisplayValues() : null;
  });
  return tabs;
}

function ppLog_(status, count, note) {
  try {
    var sh = SpreadsheetApp.openById(ppProp_('ADMIN_DATA_ID', PP.ADMIN_DATA_ID)).getSheetByName('RunLog');
    var now = Utilities.formatDate(new Date(), 'America/New_York', "yyyy-MM-dd'T'HH:mm:ssXXX");
    sh.appendRow([PP.ROUTINE, now, status, count, PP.WRITER, note || '', '', PP.ROUTINE_ID]);
  } catch (e) { console.log('RunLog write failed: ' + e); }
}

function ppFetch_(url, opt, tries) {
  var last;
  for (var i = 0; i < (tries || 3); i++) {
    try {
      var r = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opt || {}));
      var c = r.getResponseCode();
      if (c < 500 && c !== 429) return r;
      last = 'HTTP ' + c + ': ' + r.getContentText().slice(0, 200);
    } catch (e) { last = String(e); }
    Utilities.sleep(2000 * Math.pow(2, i));
  }
  throw new Error('GitHub request failed after retries: ' + last);
}

function ppGitBlobSha_(text) {
  var bytes = Utilities.newBlob(text).getBytes();
  var head = Utilities.newBlob('blob ' + bytes.length + '\u0000').getBytes();
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, head.concat(bytes));
  return d.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function ppPublishGithub_(text, stats) {
  var token = ppProp_('GITHUB_TOKEN', '');
  if (!token) throw new Error('MODE is live but GITHUB_TOKEN is not set.');
  var api = 'https://api.github.com/repos/' + PP.REPO + '/contents/';
  var h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  // Directory listing gives the current blob sha without downloading the 1 MB file.
  var dir = ppFetch_(api + 'data?ref=' + PP.BRANCH, { headers: h });
  if (dir.getResponseCode() !== 200) throw new Error('Could not list data/: HTTP ' + dir.getResponseCode());
  var cur = JSON.parse(dir.getContentText()).filter(function (f) { return f.path === PP.PATH; })[0];
  if (cur && cur.sha === ppGitBlobSha_(text)) return 'unchanged';
  var body = {
    message: 'pulse publish: data/data.js (' + stats.competitors + ' competitors, IG through ' + stats.latestIg + ')',
    content: Utilities.base64Encode(Utilities.newBlob(text).getBytes()),
    branch: PP.BRANCH
  };
  if (cur) body.sha = cur.sha;
  var put = ppFetch_(api + PP.PATH, { method: 'put', headers: h, contentType: 'application/json', payload: JSON.stringify(body) });
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('GitHub write refused: HTTP ' + put.getResponseCode() + ' ' + put.getContentText().slice(0, 200));
  }
  return 'published';
}

/** The scheduled entry point. */
function publishPulse() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.log('Another run is in progress.'); return; }
  try {
    var baseText = ppReadFile_(PP.BASE_FILE);
    if (!baseText) { ppLog_('stopped', 0, 'No ' + PP.BASE_FILE + ' in Drive. Run seedBase once.'); return; }
    var base = JSON.parse(baseText);
    var res = ppBuild(ppReadTabs_(), base, new Date().toISOString());
    if (!res.ok) {
      ppLog_('stopped', 0, res.problems.join(' ').slice(0, 450));
      console.log('Stopped, nothing published:\n' + res.problems.join('\n'));
      return;
    }
    var mode = ppProp_('MODE', 'dry-run');
    ppWriteFile_(PP.PREVIEW_FILE, res.text, 'application/javascript');
    if (mode !== 'live') {
      ppLog_('dry-run', res.stats.competitors, 'Preview saved to Drive, ' + res.stats.bytes + ' bytes, IG through ' + res.stats.latestIg);
      console.log('Dry run OK: ' + JSON.stringify(res.stats));
      return;
    }
    var outcome = ppPublishGithub_(res.text, res.stats);
    ppLog_('ok', res.stats.competitors, outcome + ', ' + res.stats.bytes + ' bytes, IG through ' + res.stats.latestIg);
    console.log(outcome + ': ' + JSON.stringify(res.stats));
  } catch (e) {
    ppLog_('error', 0, String(e).slice(0, 450));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Run ONCE by hand. Reads the live data.js from the published site and saves it to Drive as
 * pulse-base.json, the source for the blocks the sheet does not hold yet. It is the only time
 * the Publisher reads anything from GitHub, and it is not part of the scheduled run.
 */
function seedBase() {
  var r = ppFetch_(PP.PAGES_URL + '?t=' + Date.now(), {}, 4);
  if (r.getResponseCode() !== 200) throw new Error('Could not read live data.js: HTTP ' + r.getResponseCode());
  var js = r.getContentText('UTF-8');
  var json = js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1);
  var data = JSON.parse(json);
  if (!data.competitors || data.competitors.length < PP.MIN_COMPETITORS) throw new Error('Live data.js looks wrong; base not saved.');
  ppWriteFile_(PP.BASE_FILE, JSON.stringify(data), 'application/json');
  console.log('Saved ' + PP.BASE_FILE + ' (' + json.length + ' bytes, built ' + data.builtAt + ').');
}

/** Daily at 08:30 ET, after the old 07:54 sync, so the two can be compared during dry-run. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'publishPulse') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('publishPulse').timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone('America/New_York').create();
  console.log('Daily trigger set for about 08:30 ET.');
}
