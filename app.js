/* Business Pulse command center — full-viewport map/bubble market view.
   Reads window.PULSE_DATA from data/data.js (built by scripts/build_data_js.py). */
(function(){
document.body.classList.add("fp"); /* entrance animations run on first paint only */
"use strict";
var D = window.PULSE_DATA || {};
var $ = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- small helpers ---------- */
/* strip emoji/ZWJ sequences so source-data emoji never reach the UI */
function deemoji(s){ return String(s==null?"":s)
  .replace(/\p{Extended_Pictographic}\uFE0F?(\u200D\p{Extended_Pictographic}\uFE0F?)*/gu,"")
  .replace(/[\u2600-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F\u200D]/gu,""); }
function esc(s){ return deemoji(String(s==null?"":s)).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function fmt(n){ if(n==null||isNaN(n)) return "—"; return n.toLocaleString("en-US"); }
function money(n){ if(n==null) return "—"; return "$"+Number(n).toLocaleString("en-US"); }
function pctStr(p){ if(p==null||!isFinite(p)) return "—"; return (p>0?"+":"")+p.toFixed(1)+"%"; }
function daysSince(ds){ if(!ds) return null; var d=new Date(ds+"T12:00:00"); if(isNaN(d)) return null;
  return Math.floor((Date.now()-d.getTime())/864e5); }
function dstr(ds){ if(!ds) return "—"; var d=new Date(ds+"T12:00:00");
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
function hashN(s){ var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
function toast(msg){ var t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(t._h); t._h=setTimeout(function(){ t.classList.remove("show"); },2600); }
function countUp(el,to,ms){ if(REDUCED||to==null){ el.textContent=fmt(to); return; }
  var from=0,t0=null; function step(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/(ms||500));
    var e=1-Math.pow(1-p,3); el.textContent=fmt(Math.round(to*e)); if(p<1)requestAnimationFrame(step); }
  requestAnimationFrame(step); }
/* first paint done: entrance stagger stops replaying on re-renders */
setTimeout(function(){ document.body.classList.remove("fp"); },1600);

/* ---------- pricing parse (from roster text) ---------- */
function priceFloors(p){
  if(!p) return {wedding:null,session:null,weddingHourly:null};
  var wedding=null, weddingHourly=null, m=/wedding[^$;]*?\$([\d,]+)(\/hr)?/i.exec(p);
  if(m){ if(m[2]) weddingHourly=+m[1].replace(/,/g,""); else wedding=+m[1].replace(/,/g,""); }
  var re=/\$([\d,]+)/g,x,big=[],small=[];
  while((x=re.exec(p))){ var v=+x[1].replace(/,/g,""),
    before=p.slice(Math.max(0,x.index-18),x.index).toLowerCase(),
    after=p.slice(x.index+x[0].length,x.index+x[0].length+10).toLowerCase();
    if(/deposit/.test(after)||/sports/.test(before)||/^\/((hr|event))/.test(after)) continue;
    (v>=1000?big:small).push(v); }
  if(wedding==null&&big.length) wedding=Math.min.apply(null,big);
  /* the wedding floor never doubles as the session floor */
  if(wedding!=null) small=small.filter(function(v){ return v!==wedding; });
  return {wedding:wedding,session:small.length?Math.min.apply(null,small):null,weddingHourly:weddingHourly};
}

/* ---------- JD Meyers Productions as a regular data point ----------
   Not in the roster file; appended here with the same fields as every
   other business. No special flags, no special rendering, no feed
   exclusions: it appears in rankings, feeds, and the map like any entry. */
(function(){
  var jdHist=(D.ownAccounts||[]).filter(function(r){return r.account==="jdmeyersproductions"&&/^\d{4}-\d{2}-\d{2}$/.test(r.date);})
    .map(function(r){return {date:r.date,count:r.follower_count};})
    .sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
  (D.igFollowersHistory=D.igFollowersHistory||{})["jdmeyersproductions"]=jdHist;
  /* latest per-handle recency + engagement from the Graph API snapshots —
     the same feed every roster business gets its last_post_date/engagement from */
  var _lmd={};
  (D.igActivity||[]).forEach(function(r){
    if(!r.handle) return;
    var p=_lmd[r.handle];
    if(!p||String(r.date||"")>String(p.date||"")) _lmd[r.handle]=r;
  });
  var _lm=_lmd["jdmeyersproductions"]||{};
  var _rs=((D.reviewsSeed||{})["jd-meyers-productions"])||{};
  var has=(D.competitors||[]).some(function(c){return c.id==="jd-meyers-productions";});
  if(!has) (D.competitors=D.competitors||[]).push({
    id:"jd-meyers-productions",name:"JD Meyers Productions",specialty:"both",town:"Potsdam, NY (SLC)",
    region:"slc",county:"St. Lawrence",website:"jdmeyersjr.com",ig_handle:"jdmeyersproductions",
    services:"Weddings, Portraits, Drone, Real Estate, Video",est_year:2016,
    pricing:"Wedding $1,400 starting",pricing_url:"https://jdmeyersjr.com",notes:"",
    status:"active",flags:[],source:"directory",source_label:"Directory",
    last_post_date:_lm.last_media_date||null,engagement:_lm.engagement||null,
    review_count:_rs.count!=null?_rs.count:null,review_rating:_rs.rating!=null?_rs.rating:null,
    review_source:_rs.source||null,review_url:_rs.url||null});
})();

/* ---------- town coords ---------- */
var TC=D.townCoords||{aliases:{},coords:{}};
function townCanon(t){ var a=TC.aliases||{}; return a[t]||t; }
function townLatLng(town){
  var c=(TC.coords||{})[townCanon(town)];
  if(c) return {lat:c.lat,lng:c.lng,real:true};
  return null; /* no fake pinpoint: unmapped towns get no map pin */
}
function jitter(id,lat,lng){ return {lat:lat,lng:lng}; } /* replaced by town spiral below */

/* ---------- enrich roster ---------- */
var IGH=D.igFollowersHistory||{};
var WI=(window.PULSE_WEBSITE_INTEL||{}).intel||{}; /* pilot website sweep, Sep 2026 */
var CONF=D.confidence||{}; /* per-business info confidence, rebuilt by scripts/score_confidence.py */
var B=(D.competitors||[]).map(function(c){
  var e=Object.assign({},c);
  e.price=priceFloors(c.pricing);
  /* roster services sometimes arrive as a raw string; the profile renderer
     calls .map on this, so normalize once here. */
  if(typeof e.services==="string")
    e.services=e.services.split(/[,;]+/).map(function(x){return x.trim();}).filter(Boolean);
  var h=c.ig_handle&&IGH[c.ig_handle];
  if(h&&h.length){ e.followHist=h.slice().sort(function(a,b){return a.date<b.date?-1:1;});
    e.followers=e.followHist[e.followHist.length-1].count; }
  else{ var fm=/\((\d{1,3}(?:,\d{3})+|\d+), verified/.exec(c.notes||"");
    e.followers=fm?+fm[1].replace(/,/g,""):null; e.followHist=[]; }
  e.postAge=daysSince(c.last_post_date);
  e.hasPrice=e.price.wedding!=null||e.price.session!=null||e.price.weddingHourly!=null;
  var tc=townLatLng(e.town);
  e._geo=!!tc; /* false = no real coordinates: no map pin, no heat contribution */
  e.lat=tc?tc.lat:null; e.lng=tc?tc.lng:null; /* spiral placement below */
  e.townShort=(e.town||"").split(",")[0];
  return e;
});
var B_BY_ID={}; B.forEach(function(c){B_BY_ID[c.id]=c;});
/* ordered golden-angle spiral per town so same-town pins read as a cluster, not noise */
(function(){
  var groups={};
  B.forEach(function(b){ var k=townCanon(b.town); (groups[k]=groups[k]||[]).push(b); });
  Object.keys(groups).forEach(function(k){
    var g=groups[k].sort(function(a,b){return (b.followers||0)-(a.followers||0);});
    var cl=townLatLng(g[0].town);
    if(!cl){ g.forEach(function(b){ b.lat=null; b.lng=null; }); return; } /* unmapped town: no pins */
    g.forEach(function(b,i){
      if(i===0){ b.lat=cl.lat; b.lng=cl.lng; return; }
      var a=i*2.39996, r=0.011*Math.sqrt(i);
      b.lat=cl.lat+Math.sin(a)*r; b.lng=cl.lng+Math.cos(a)*r*1.35;
    });
  });
})();

/* ---------- venues: separate dataset, hard-switched via S.mode ----------
   Venues never mix with the competitor roster: separate collection, separate
   stats, separate medians. C / BY_ID below always point at the ACTIVE set. */
var V=(window.PULSE_VENUES||[]).map(function(v){
  var e=Object.assign({},v);
  e.type="venue"; e.specialty="venue";
  e.followHist=[]; e.followers=(v.followers==null?null:v.followers);
  e.postAge=daysSince(v.last_post_date);
  e.price={wedding:null,session:null,weddingHourly:null}; e.hasPrice=false;
  e._geo=(v.lat!=null&&v.lng!=null);
  e.townShort=(v.town||"").split(",")[0];
  return e;
});
var V_BY_ID={}; V.forEach(function(v){V_BY_ID[v.id]=v;});
var C=B, BY_ID=B_BY_ID;

/* ---------- web-research detail enrichment (data/details-enrichment.js) ----------
   Fills only empty fields; never overwrites curated data. Businesses merge into
   the Website-intel section, venues merge onto the venue record. */
(function(){
  var DET=window.PULSE_DETAILS||{}, ids=Object.keys(DET);
  if(!ids.length) return;
  ids.forEach(function(id){
    var d=DET[id]; if(!d) return;
    var v=V_BY_ID[id];
    if(v){
      ["site_note","pricing_note","setting","season","since"].forEach(function(k){ if((v[k]==null||v[k]==="")&&d[k]!=null) v[k]=d[k]; });
      ["services","spaces","coverage"].forEach(function(k){ if((!v[k]||!v[k].length)&&d[k]&&d[k].length) v[k]=d[k].slice(); });
      return;
    }
    var b=B_BY_ID[id]; if(!b) return;
    var w=WI[id];
    if(!w){ w={}; WI[id]=w; }
    if(w.unreachable) return;
    if(d.services&&d.services.length&&(!w.services||!w.services.length)) w.services=d.services.slice();
    if(d.coverage&&d.coverage.length&&(!w.coverage||!w.coverage.length)) w.coverage=d.coverage.slice();
    if(d.platform&&!w.platform) w.platform=d.platform;
    if(d.since&&!w.since&&w.years_in_business==null) w.since=d.since;
    else if(d.years_in_business!=null&&w.years_in_business==null&&!w.since) w.years_in_business=d.years_in_business;
    var note=d.blurb||d.site_note;
    if(note&&!w.site_note) w.site_note=note;
    if(!w.fetched) w.fetched="Web research, Sep 2026";
  });
})();

/* ---------- snapshot dates ---------- */
var DATES=[]; (function(){ var s={};
  Object.keys(IGH).forEach(function(h){ IGH[h].forEach(function(r){ s[r.date]=1; }); });
  DATES=Object.keys(s).sort(); })();
if(!DATES.length) DATES=[new Date().toISOString().slice(0,10)];
function followersAt(b,di){ var h=b.followHist; if(!h||!h.length) return b.followers;
  var dt=DATES[di],best=null;
  for(var i=0;i<h.length;i++){ if(h[i].date<=dt) best=h[i].count; else break; }
  return best==null?b.followers:best; }
function pctChange(b,fromDi,toDi){ var a=followersAt(b,fromDi),c=followersAt(b,toDi);
  if(a==null||c==null||a<=0) return null; return (c-a)/a*100; }

/* ---------- momentum / recency ---------- */
function momentumOf(b,di){
  var ch=pctChange(b,Math.max(0,di-7),di);
  if(ch!=null&&ch>=3) return "gaining";
  if(ch!=null&&ch<=-3) return "slipping";
  if(b.postAge==null) return "dormant";
  if(b.postAge<=30) return "active";
  if(b.postAge<=90) return "quiet";
  return "dormant";
}
function recencyDot(b){
  if(b.postAge==null) return "#6b7484";
  if(b.postAge<=14) return "#6fd3e7";
  if(b.postAge<=45) return "#e8b34b";
  return "#e06c6c";
}
var LANE_COLOR={photo:"#e8b34b",video:"#6db3f2",both:"#b9c2cf",drone:"#6fd3e7",venue:"#d98e4a"};
var LANE_LABEL={photo:"Photo",video:"Video",both:"Photo + Video",drone:"Drone",venue:"Venue"};
var REG_LABEL={slc:"St. Lawrence Co",adjacent:"Nearby counties",unconfirmed:"Unconfirmed"};

/* ---------- state ---------- */
var S={ view:"map", mode:"businesses", tab:"explore", sortBy:"audience", shareBy:"providers", rankMode:"audience", di:DATES.length-1, q:"", lane:"", mom:"", reg:"",
        sel:null, playing:false, dsort:null, dq:"", railX:false, expanded:false, glanceX:false, lsWide:false, ptab:"overview", qx:{}, qall:{} };

/* ---------- undo / redo history (back-forward) + home ----------
   Every meaningful action pushes a full snapshot; back/forward restore it.
   pushHist is a no-op while a snapshot is being applied (HIST.busy) or while
   a programmatic map move is in flight (HIST.noPush, cleared on moveend). */
var HIST={stack:[],i:-1,busy:false,noPush:false};
function snapState(){
  var c=null; try{ if(map){ var ll=map.getCenter(); c={lat:ll.lat,lng:ll.lng}; } }catch(e){}
  return {view:S.view,mode:S.mode,tab:S.tab,sel:S.sel,q:S.q,lane:S.lane,mom:S.mom,reg:S.reg,
    rankMode:S.rankMode,rankDir:S.rankDir,dq:S.dq,railX:S.railX,dsort:S.dsort?{key:S.dsort.key,dir:S.dsort.dir}:null,
    z:map?map.getZoom():null,c:c};
}
function statesEq(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
function pushHist(){
  if(HIST.busy||!map) return;
  var s=snapState(), cur=HIST.stack[HIST.i];
  if(cur&&statesEq(cur,s)) return;
  HIST.stack=HIST.stack.slice(0,HIST.i+1);
  HIST.stack.push(s);
  if(HIST.stack.length>60) HIST.stack.shift();
  HIST.i=HIST.stack.length-1;
  updNav();
}
function updNav(){
  var b=$("#navback"), f=$("#navfwd");
  if(b) b.disabled=HIST.i<=0;
  if(f) f.disabled=HIST.i>=HIST.stack.length-1;
}
function syncChrome(){
  /* view + mode toggles */
  $$(".viewtoggle button").forEach(function(x){ var on=x.getAttribute("data-view")===S.view;
    x.classList.toggle("on",on); x.setAttribute("aria-selected",on?"true":"false"); });
  $$(".modetoggle button").forEach(function(x){ var on=x.getAttribute("data-mode")===S.mode;
    x.classList.toggle("on",on); x.setAttribute("aria-selected",on?"true":"false"); });
  /* filters */
  $("#flane").value=S.lane; $("#fmom").value=S.mom; $("#freg").value=S.reg; $("#fq").value=S.q;
  var biz=S.mode!=="venues";
  $("#flane").style.display=biz?"":"none";
  $("#fmom").style.display=biz?"":"none";
  $("#fq").setAttribute("placeholder",biz?"Search businesses…":"Search venues…");
  var bt=$(".brand-text small"); if(bt) bt.textContent=biz?"North Country photo, video & drone market":"North Country venue watch";
  document.title=biz?"Business Pulse · North Country photo, video & drone market":"Business Pulse · North Country venues";
  /* sections */
  $$(".pagenav button").forEach(function(x){ var on=x.getAttribute("data-tab")===S.tab;
    x.classList.toggle("on",on); x.setAttribute("aria-selected",on?"true":"false"); });
  var ex=S.tab==="explore", rk=ex&&S.view==="rankings";
  document.body.classList.toggle("pgmode",!ex);
  $("#page").hidden=ex;
  $("#rankings").hidden=!rk;
  $("#map").style.visibility=(ex&&!rk)?"visible":"hidden";
  syncSort();
}
function applyState(st){
  HIST.busy=true;
  try{
    S.view=st.view; S.mode=st.mode; S.tab=st.tab; S.sel=st.sel;
    S.q=st.q; S.lane=st.lane; S.mom=st.mom; S.reg=st.reg;
    S.rankMode=st.rankMode; S.rankDir=st.rankDir; S.dq=st.dq; S.railX=!!st.railX;
    S.dsort=st.dsort?{key:st.dsort.key,dir:st.dsort.dir}:null;
    C=(S.mode==="venues"?V:B); BY_ID=(S.mode==="venues"?V_BY_ID:B_BY_ID);
    computeModeStats();
    syncChrome();
    if(map&&st.c){ HIST.noPush=true; map.setView([st.c.lat,st.c.lng],st.z,{animate:false}); }
    renderPins();
    if(S.view==="rankings") renderRankings();
    renderLeft(); renderRight();
    $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
    if(S.sel){ var row=$('#leftbody .row[data-open="'+S.sel+'"]'); if(row) row.classList.add("sel"); }
  }finally{ HIST.busy=false; }
  updNav();
}
/* home: back to the map, default framing, selection + filters cleared */function goHome(){
  S.tab="explore"; S.sel=null; S.q=""; S.lane=""; S.mom=""; S.reg=""; S.view="map";
  C=(S.mode==="venues"?V:B); BY_ID=(S.mode==="venues"?V_BY_ID:B_BY_ID);
  computeModeStats();
  syncChrome();
  var pts=C.filter(function(b){return b._geo&&b.lat!=null;}).map(function(b){return [b.lat,b.lng];});
  if(map&&pts.length){ HIST.noPush=true;
    if(window.innerWidth>900) map.fitBounds(L.latLngBounds(pts),{paddingTopLeft:L.point(450,90),paddingBottomRight:L.point(380,90)});
    else map.fitBounds(L.latLngBounds(pts).pad(0.15)); }
  renderPins(); renderLeft(); renderRight();
  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
  pushHist();
  toast("Back home — selection cleared.");
}
/* history back / forward — driven by the persistent topbar arrows */
function goBack(){ if(HIST.i>0){ HIST.i--; applyState(HIST.stack[HIST.i]); } }
function goFwd(){ if(HIST.i<HIST.stack.length-1){ HIST.i++; applyState(HIST.stack[HIST.i]); } }

/* ---------- filtering ---------- */
function norm(s){ return (s||"").toLowerCase(); }
function passes(b){
  if(S.q){ var q=norm(S.q);
    if(norm(b.name).indexOf(q)<0&&norm(b.ig_handle).indexOf(q)<0&&norm(b.townShort).indexOf(q)<0&&norm(b.town).indexOf(q)<0) return false; }
  if(S.mode!=="venues"&&S.lane&&b.specialty!==S.lane) return false;
  if(S.reg&&b.region!==S.reg) return false;
  if(S.mode!=="venues"&&S.mom){ var m=momentumOf(b,S.di);
    if(S.mom==="gaining"){ if(m!=="gaining") return false; }
    else if(m!==S.mom) return false; }
  return true;
}
function filtered(){ return C.filter(passes); }
function scopeList(){ return S.tab==="explore"?filtered():C.slice(); }

/* ---------- "what changed since yesterday" ---------- */
function todayChanges(){
  var di=S.di, ydi=Math.max(0,di-1), today=DATES[di], yd=DATES[ydi];
  var out={date:today,prev:yd,newBiz:[],jumps:[],small:[],prices:[],promo:[]};
  C.forEach(function(b){
    var first=b.followHist.length?b.followHist[0].date:null;
    /* the injected JD Meyers Productions entry is a permanent anchor, never a new discovery */
    if(b.id!=="jd-meyers-productions"&&first&&first>=yd){ out.newBiz.push(b); return; }
    var ch=pctChange(b,ydi,di), from=followersAt(b,ydi), to=followersAt(b,di);
    if(ch!=null&&Math.abs(ch)>=3) out.jumps.push({b:b,ch:ch,from:from,to:to});
    /* sub-threshold moves are still moves: track them honestly instead of
       claiming the market stood still */
    else if(from!=null&&to!=null&&to!==from) out.small.push({b:b,delta:to-from,from:from,to:to});
  });
  out.jumps.sort(function(a,b2){return Math.abs(b2.ch)-Math.abs(a.ch);});
  out.small.sort(function(a,b2){return Math.abs(b2.delta)-Math.abs(a.delta);});
  /* price changes: scan latest sweep runs for price-change language */
  var runs=(D.webSweepHistory||[]).slice(-2);
  var seen={};
  runs.forEach(function(run){ Object.keys(run.pages||{}).forEach(function(pid){
    var p=run.pages[pid], note=String(p.note||"");
    if(/pric/i.test(note)&&/chang|rais|lower|cut|increas|now\s*\$|was\s*\$/i.test(note)&&!seen[pid]){
      seen[pid]=1;
      var comp=C.filter(function(c){return c.id===pid;})[0];
      if(comp) out.prices.push({b:comp,note:note,run:run.date});
    }}); });
  /* promo posts from today's activity rows */
  (D.igActivity||[]).forEach(function(r){
    if(r.date!==today) return;
    if(/promo|sale|minis|booking now|giveaway|discount|limited/i.test(r.activity||"")){
      var comp=C.filter(function(c){return c.ig_handle===r.handle;})[0];
      if(comp) out.promo.push({b:comp,note:r.activity});
    }});
  return out;
}

/* why a business is "new on the radar": usually newly tracked on Instagram,
   not a new business. Explain honestly from the record. */
function newWhy(b){
  var first=b.followHist.length?b.followHist[0].date:null, parts=[];
  if(first) parts.push("IG tracking started "+dstrShort(first));
  var m=/verified (\d{4}-\d{2}-\d{2})/.exec(b.notes||"");
  if(m&&m[1]&&first&&m[1]<first) parts.push("in our records since "+dstrShort(m[1]));
  else if(b.est_year&&first&&b.est_year<+first.slice(0,4)) parts.push("in business since "+b.est_year);
  return parts.join(" · ")||"Recently picked up";
}
/* ---------- live feed: one chronological stream of the last 7 days ---------- */
var FEED_CATS=[
  {k:"post",t:"Posts",icon:"mega",c:"#6db3f2"},
  {k:"move",t:"Moves",icon:"bolt",c:"#f5b942"},
  {k:"new",t:"New",icon:"radar",c:"#8fd18f"},
  {k:"promo",t:"Promos",icon:"tag",c:"#c9a0f2"},
  {k:"price",t:"Prices",icon:"dollar",c:"#f2d06d"}
];
function feedCat(k){ for(var i=0;i<FEED_CATS.length;i++) if(FEED_CATS[i].k===k) return FEED_CATS[i]; return FEED_CATS[0]; }
function feedEvents(){
  var di=S.di, d0=Math.max(0,di-6), lo=DATES[d0], hi=DATES[di], ev=[];
  function compByHandle(h){
    var hn=String(h||"").replace(/^@/,"").toLowerCase();
    for(var i=0;i<C.length;i++) if(String(C[i].ig_handle||"").toLowerCase()===hn) return C[i];
    return null;
  }
  function compById(id){ for(var i=0;i<C.length;i++) if(C[i].id===id) return C[i]; return null; }
  /* NOTE: follower "move" events are intentionally excluded — the Activity page
     is a general-activity feed (posts, promos, prices, new faces),
     not a follower-change ticker. Only active happenings appear here. */
  /* posts + promos from the IG activity rows */
  (D.igActivity||[]).forEach(function(r){
    if(!r.date||r.date<lo||r.date>hi) return;
    var comp=compByHandle(r.handle); if(!comp) return;
    var n=postCount(r), note=String(r.activity||"").slice(0,110);
    if(n>0) ev.push({date:r.date,kind:"post",b:comp,sub:note});
    if(/promo|sale|minis|booking now|giveaway|discount|limited/i.test(r.activity||""))
      ev.push({date:r.date,kind:"promo",b:comp,sub:note});
  });
  /* price changes from web sweep runs inside the window */
  (D.webSweepHistory||[]).forEach(function(run){
    if(!run.date||run.date<lo||run.date>hi) return;
    Object.keys(run.pages||{}).forEach(function(pid){
      var p=run.pages[pid], note=String(p.note||"");
      if(/pric/i.test(note)&&/chang|rais|lower|cut|increas|now\s*\$|was\s*\$/i.test(note)){
        var comp=compById(pid);
        if(comp) ev.push({date:run.date,kind:"price",b:comp,sub:note.slice(0,110)});
      }});
  });
  /* new on the radar */
  C.forEach(function(b){
    var first=b.followHist.length?b.followHist[0].date:null;
    if(b.id!=="jd-meyers-productions"&&first&&first>=lo&&first<=hi)
      ev.push({date:first,kind:"new",b:b,sub:newWhy(b)});
  });
  var ko={new:0,price:1,promo:2,post:3,move:4};
  ev.sort(function(a,b2){
    if(a.date!==b2.date) return a.date<b2.date?1:-1;
    return (ko[a.kind]-ko[b2.kind])||(a.b.name<b2.b.name?-1:1);
  });
  return ev;
}
function feedFresh(){
  var di=S.di, out=[["Follower data",DATES[di]]], mx=null;
  (D.igActivity||[]).forEach(function(r){ if(r.date&&(!mx||r.date>mx)) mx=r.date; });
  if(mx) out.push(["IG posts",mx]);
  var runs=D.webSweepHistory||[], lr=runs.length?runs[runs.length-1].date:null;
  if(lr) out.push(["Site sweep",lr]);
  return out;
}
function feedPillsHTML(){
  var f=S.feedf||"all", evs=feedEvents();
  var counts={}; evs.forEach(function(e){ counts[e.kind]=(counts[e.kind]||0)+1; });
  return '<div class="feed-filters"><button class="feed-pill'+(f==="all"?" on":"")+'" data-feedf="all">All · '+evs.length+'</button>'+
    FEED_CATS.map(function(c){
      if(c.k==="move") return ""; /* follower moves are excluded from this feed */
      return '<button class="feed-pill'+(f===c.k?" on":"")+'" data-feedf="'+c.k+'">'+c.t+' · '+(counts[c.k]||0)+'</button>';
    }).join("")+'</div>';
}
function feedRowsHTML(){
  var di=S.di, f=S.feedf||"all";
  var shown=feedEvents().filter(function(e){ return f==="all"||e.kind===f; }).slice(0,80);
  if(!shown.length)
    return '<div class="act-empty"><div class="act-empty-t">Nothing here.</div>'+
      '<div class="act-empty-s">No '+(f==="all"?"activity":f)+' in the last 7 days.</div></div>';
  var h="", lastDay=null;
  shown.forEach(function(e){
    if(e.date!==lastDay){ lastDay=e.date;
      var lbl=e.date===DATES[di]?"Today":(di>0&&e.date===DATES[di-1]?"Yesterday":dstrShort(e.date));
      h+='<div class="feed-day">'+lbl+' · '+dstrShort(e.date)+'</div>'; }
    var fc=feedCat(e.kind);
    h+='<div class="feed-row" data-open="'+e.b.id+'">'+
      '<span class="feed-ic" style="color:'+fc.c+'">'+actIcon(fc.icon)+'</span>'+
      '<div class="feed-nm"><b>'+esc(e.b.name)+'</b><span>'+esc(e.sub||"")+'</span></div>'+
      (e.val?'<span class="feed-val '+(e.up?"up":"dn")+'">'+esc(e.val)+'</span>':"")+
      '<span class="feed-kind" style="--acc:'+fc.c+'">'+fc.t+'</span></div>';
  });
  return h;
}
/* live-feed sidebar auto-scroll: drifts slowly, yields to the user, resumes when idle */
var feedTimer=null, feedHold=false, feedIdleT=null;
function feedAutoStop(){ if(feedTimer){ clearInterval(feedTimer); feedTimer=null; } feedHold=false; clearTimeout(feedIdleT); }
function feedUserTakeover(){ feedHold=true; clearTimeout(feedIdleT); feedIdleT=setTimeout(function(){ feedHold=false; },4000); }
var radarPlayed=false;
function radarOnce(){
  if(radarPlayed||REDUCED||!("IntersectionObserver" in window)) return;
  var t=document.querySelector('.act-tile[data-radar]');
  if(!t) return;
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ radarPlayed=true; t.classList.add("radar-on"); io.disconnect(); } });
  },{threshold:.35});
  io.observe(t);
}
function feedAutoStart(){
  feedAutoStop();
  if(REDUCED) return;
  var side=document.getElementById("feedside");
  if(!side) return;
  side.addEventListener("wheel",feedUserTakeover,{passive:true});
  side.addEventListener("touchmove",feedUserTakeover,{passive:true});
  feedTimer=setInterval(function(){
    var s=document.getElementById("feedside");
    if(!s||feedHold||document.hidden) return;
    if(s.scrollTop+s.clientHeight>=s.scrollHeight-6){
      feedHold=true; /* linger at the bottom, then loop to the top */
      setTimeout(function(){
        var s2=document.getElementById("feedside");
        if(s2&&s2.scrollTop+s2.clientHeight>=s2.scrollHeight-6) s2.scrollTop=0;
        feedHold=false;
      },2800);
    } else s.scrollTop+=1;
  },60);
}

/* ---------- week's highlights: top businesses + why ---------- */
/* The daily IG activity notes are free text from the sweep ("Pull failed — carried
   last-known count.", "last post Jul 12 ...", "6 posts in one burst", ...).
   Count explicit posts only; status notes are 0. Deliberately conservative:
   ambiguous phrasing counts as nothing rather than an invented post. */
function postCount(r){
  var t=String((r&&r.activity)||"");
  if(/quiet|no new|pull failed|not pulled|private account|carried last-known|\blast post\b/i.test(t)) return 0;
  var m=t.match(/(\d+)\s+(posts?|reels?)\b/i);
  if(m) return parseInt(m[1],10);
  if(/posted today|new post/i.test(t)) return 1;
  return 0;
}
/* ---------- Activity dashboard: icons ---------- */
function actIcon(n){
  var P={
    bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    wave:'<path d="M2 12c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4"/>',
    radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    tag:'<path d="M20.6 13.4 13.4 20.6a1 1 0 0 1-1.4 0L3 11.6V3h8.6l9 9a1 1 0 0 1 0 1.4z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/>',
    dollar:'<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M14.8 9.2c-.6-.9-1.6-1.4-2.8-1.4-1.7 0-3 .9-3 2.4 0 3.4 6 1.6 6 4.9 0 1.5-1.3 2.4-3 2.4-1.2 0-2.2-.5-2.8-1.4"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    flame:'<path d="M12 22c4 0 7-2.8 7-6.8 0-3.8-2.8-5.9-4.3-8.7C13.4 4 12 2.5 12 2.5s-.4 2.8-2.3 4.9C7.8 9.5 5 12 5 15.2 5 19.2 8 22 12 22z"/><path d="M12 22c-2 0-3.5-1.4-3.5-3.2 0-1.9 1.4-2.9 2.2-4.3.7 1.2 3.3 2.6 3.3 4.7 0 1.6-1 2.8-2 2.8z"/>',
    mega:'<path d="M4 10.5v3h3.5L14 18V6l-6.5 4.5H4z"/><path d="M17.5 9.5a4 4 0 0 1 0 5M20 7a7.5 7.5 0 0 1 0 10"/>',
    crown:'<path d="M3 8.5 7 12l5-6.5L17 12l4-3.5L19.5 18h-15L3 8.5z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    shield:'<path d="M12 2.5 4.5 5.5v6c0 4.5 3.2 7.8 7.5 10 4.3-2.2 7.5-5.5 7.5-10v-6L12 2.5z"/><path d="M9 12l2 2 4-4"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 15.2c2.6.3 4.7 1.8 5.5 4.8"/>',
    camera:'<path d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19V9.5A1.5 1.5 0 0 1 4 8z"/><circle cx="12" cy="13.5" r="3.5"/>',
    pulse:'<path d="M2 12h4l2.5-6 4 12 2.5-6H22"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||P.pulse)+'</svg>';
}

function weekHighlightCards(){
  var di=S.di, d0=Math.max(0,di-7), list=scopeList(), cards=[];
  function norm(h){ return String(h||"").replace(/^@/,"").toLowerCase(); }
  /* activity per handle over the last 7 days */
  var actBy={};
  (D.igActivity||[]).forEach(function(r){
    var n=postCount(r); if(!n) return;
    var age=(new Date(DATES[di]+"T12:00:00")-new Date((r.date||"")+"T12:00:00"))/864e5;
    if(isNaN(age)||age<0||age>7) return;
    var h=norm(r.handle); if(!h) return;
    actBy[h]=(actBy[h]||0)+n;
  });
  /* fastest growing */
  var growers=list.map(function(b){ return {b:b,ch:pctChange(b,d0,di)}; })
    .filter(function(x){ return x.ch!=null&&x.ch>=3; })
    .sort(function(a,c){ return c.ch-a.ch; });
  if(growers.length){
    var g=growers[0], from=followersAt(g.b,d0), to=followersAt(g.b,di);
    cards.push({k:"Fastest growing",icon:"flame",c:"#f5b942",b:g.b,
      stat:"+"+g.ch.toFixed(1)+"%",sub:"followers this week",
      why:(from!=null&&to!=null?fmt(from)+" → "+fmt(to):"")});
  }
  /* most active */
  var act=list.map(function(b){ var h=norm(b.ig_handle);
      return {b:b,n:(h&&actBy[h])||0}; })
    .filter(function(x){ return x.n>0; }).sort(function(a,c){ return c.n-a.n; });
  if(act.length){
    cards.push({k:"Most active",icon:"mega",c:"#6db3f2",b:act[0].b,
      stat:String(act[0].n),sub:act[0].n===1?"post in 7 days":"posts in 7 days",why:""});
  }
  /* biggest audience */
  var big=list.filter(function(b){ return followersAt(b,di)!=null; })
    .sort(function(a,c){ return followersAt(c,di)-followersAt(a,di); });
  if(big.length){
    cards.push({k:"Biggest audience",icon:"crown",c:"#c9a0f2",b:big[0],
      stat:fmt(followersAt(big[0],di)),sub:"followers · largest tracked",why:""});
  }
  /* new on the radar (first tracked inside the 7-day window) */
  var newW=list.filter(function(b){
    var first=b.followHist.length?b.followHist[0].date:null;
    return b.id!=="jd-meyers-productions"&&first&&first>=DATES[d0]&&first<=DATES[di];
  }).sort(function(a,b){ var fa=a.followHist[0].date, fb=b.followHist[0].date;
    return fa<fb?1:fa>fb?-1:0; });
  if(newW.length){
    cards.push({k:"New on the radar",icon:"radar",c:"#8fd18f",b:newW[0],
      stat:String(newW.length),sub:newW.length===1?"new business this week":"new businesses this week",
      names:newW.slice(0,3).map(function(b){ return b.name; }),
      why:newW.length>3?("+"+(newW.length-3)+" more"):""});
  }
  /* promos live */
  var seenP={}, promoN=[];
  feedEvents().forEach(function(e){
    if(e.kind!=="promo"||seenP[e.b.id]) return;
    seenP[e.b.id]=1; promoN.push(e.b.name);
  });
  if(promoN.length){
    cards.push({k:"Promos live",icon:"tag",c:"#c9a0f2",b:null,
      stat:String(promoN.length),sub:promoN.length===1?"promotion running":"promotions running",
      names:promoN.slice(0,3),
      why:promoN.length>3?("+"+(promoN.length-3)+" more"):""});
  }
  /* market output: total posts across the market in 7 days */
  var totalPosts=act.reduce(function(a,x){ return a+x.n; },0);
  if(totalPosts>0){
    cards.push({k:"Market output",icon:"pulse",c:"#6fd3e7",b:act[0].b,
      stat:String(totalPosts),sub:"posts across the market in 7 days",
      why:"Top poster: "+act[0].b.name+" ("+act[0].n+")"});
  }
  return cards;
}
function weekHighlights(){
  var cards=weekHighlightCards();
  if(!cards.length) return "";
  return '<div class="act-hl-grid">'+cards.map(function(c,i){
    var nm=c.names?c.names.map(function(n){ return '<div class="act-hl-w">'+esc(n)+'</div>'; }).join("")
      :'<div class="act-hl-n">'+esc(c.b.name)+'</div>';
    return '<div class="act-hl-card"'+(c.b?' data-open="'+c.b.id+'"':"")+
      ' style="--d:'+(0.08*i).toFixed(2)+'s;--acc:'+c.c+'">'+
      '<div class="act-hl-ic">'+actIcon(c.icon)+'</div>'+
      '<div class="act-hl-stat">'+esc(c.stat)+'</div>'+
      '<div class="act-hl-sub">'+esc(c.sub)+'</div>'+
      '<div class="act-hl-k">'+esc(c.k)+'</div>'+nm+
      (c.why?'<div class="act-hl-w">'+esc(c.why)+'</div>':"")+'</div>';
  }).join("")+"</div>";
}

/* venue-mode Today: no change history exists yet — overview instead */
function renderVenueToday(){
  var h='<div class="sec"><h3>Venue watch</h3><div class="sub">Tracking started Sep 29, 2026 · '+V.length+' venues</div>';
  var counties={};
  V.forEach(function(v){ counties[v.county]=(counties[v.county]||0)+1; });
  var ig=V.filter(function(v){return v.ig_handle;}).length;
  h+='<div class="statgrid">'+
    '<div class="stat"><div class="v">'+V.length+'</div><div class="l">Venues</div></div>'+
    '<div class="stat"><div class="v">'+Object.keys(counties).length+'</div><div class="l">Counties</div></div>'+
    '<div class="stat"><div class="v">'+ig+'</div><div class="l">On Instagram</div></div></div>';
  h+='<div class="sub" style="margin:8px 0 0">Change history builds from here — check back as daily updates accumulate.</div></div>';
  h+='<div class="sec"><h3>All venues</h3><div class="stagger">'+V.map(venueRow).join("")+"</div></div>";
  return h;
}

function renderToday(){
  if(S.mode==="venues") return '<div class="actx"><div class="actx-pad">'+renderVenueToday()+'</div></div>';
  var h='<div class="actx">';
  h+='<div class="actx-top"><h1>Activity</h1>'+
    '<p>Every post, promo and price move across the market · last 7 days</p></div>';
  h+='<section class="actx-hl"><div class="actx-hl-h"><span>Week&rsquo;s highlights</span>'+
    '<em>Top of the market · last 7 days</em></div>'+weekHighlights()+'</section>';
  h+='<section class="actx-feed"><div class="actx-feed-h"><span>The feed</span>'+
    feedPillsHTML()+'</div><div id="feedlist">'+feedRowsHTML()+'</div></section>';
  return h+'</div>';
}

/* ---------- confidence badges + price-conflict flags ---------- */
function confOf(b){ var c=CONF[b.id]; return c?c.score:null; }
function confBand(s){ return s>=70?"hi":s>=40?"mid":"lo"; }
function pcTitle(b){ var c=CONF[b.id]; if(!c||!c.conflict) return "";
  return "Price conflict — "+c.conflict.values.map(function(v){ return v.label+": "+v.text; }).join(" vs "); }
function confBadge(b){
  var s=confOf(b); if(s==null) return "";
  var cls=confBand(s);
  var t="Information confidence "+s+"% — click to see what this measures.";
  var cf=(CONF[b.id]&&CONF[b.id].conflict)?' <span class="pcflag" title="'+esc(pcTitle(b))+'">price conflict</span>':"";
  return ' <span class="cf '+cls+'" data-cf="'+b.id+'" title="'+t+'">'+s+'%</span>'+cf;
}
/* ---------- business scores: information, activity, momentum, value, reviews ---------- */
function actScore(b){
  var d=b.postAge;
  if(d==null) return {score:null,band:"Unknown",why:"No recent-post date on record."};
  var s=d<=7?100:d<=14?85:d<=30?70:d<=60?50:d<=90?30:d<=180?15:5;
  var band=s>=70?"Active":s>=30?"Cooling":"Low";
  var ago=d===0?"today":d+" day"+(d>1?"s":"")+" ago";
  return {score:s,band:band,why:"Last posted "+ago+".",days:d};
}
function momScore(b){
  var ch7=pctChange(b,Math.max(0,S.di-7),S.di), ch30=pctChange(b,Math.max(0,S.di-30),S.di);
  if(ch30==null) return {score:null,band:"Unknown",why:"No follower history to measure.",ch7:ch7,ch30:ch30};
  var s=Math.max(5,Math.min(100,Math.round(50+ch30*8)));
  var band=s>=75?"Surging":s>=60?"Gaining":s>=40?"Steady":s>=25?"Slipping":"Falling";
  return {score:s,band:band,ch7:ch7,ch30:ch30,
    why:"Followers "+(ch30>=0?"+":"")+ch30.toFixed(1)+"% over the last 30 days."};
}
var _wedArr=null;
function wedRank(b){
  if(!_wedArr) _wedArr=B.filter(function(x){return x.price.wedding!=null;})
    .sort(function(a,c){return a.price.wedding-c.price.wedding;});
  var i=_wedArr.indexOf(b); if(i<0) return null;
  var n=_wedArr.length, med=_wedArr[Math.floor(n/2)].price.wedding;
  return {rank:i+1,n:n,med:med,pct:n>1?Math.round(100*(1-i/(n-1))):50};
}
function valScore(b){
  var r=wedRank(b);
  if(!r){
    if(b.price.weddingHourly!=null) return {score:null,band:"Hourly",r:null,
      why:money(b.price.weddingHourly)+"/hr wedding rate — hourly pricing isn't ranked against package floors."};
    return {score:null,band:"Unknown",why:"No published wedding floor.",r:null};
  }
  var q=r.rank/r.n, band=q<=0.25?"Budget":q<=0.5?"Mid-market":q<=0.75?"Premium":"Luxury";
  return {score:r.pct,band:band,r:r,
    why:money(b.price.wedding)+" wedding floor — cheaper than "+r.pct+"% of "+r.n+" tracked businesses."};
}
function reviewInfo(b){
  if(b.review_count!=null) return {count:b.review_count,rating:b.review_rating||null,
    src:b.review_source?(b.review_source.charAt(0).toUpperCase()+b.review_source.slice(1)):"Google"};
  var fl=b.flags||[], txt=(fl.join?fl.join(" "):String(fl))+" "+(b.notes||"");
  var m=/(\d+)[- ]?(google|fb|facebook|yelp)[- ]reviews/i.exec(txt);
  if(!m) return null;
  var src=m[2].toLowerCase(), after=txt.slice(m.index,m.index+64), rm=/(\d)[\-.](\d)/.exec(after);
  return {count:+m[1],rating:rm?(+rm[1]+"."+ +rm[2]):null,
    src:src==="fb"||src==="facebook"?"Facebook":src==="yelp"?"Yelp":"Google"};
}
function revScore(b){
  var r=reviewInfo(b);
  if(!r) return {score:null,band:"Not researched",
    why:"Review count not yet collected — the daily deep-dive pass is gathering it from live listings.",r:null};
  var s=Math.round(100*Math.log10(1+r.count)/Math.log10(201));
  var band=s>=70?"Well reviewed":s>=40?"Some reviews":"Few reviews";
  return {score:s,band:band,r:r,
    why:r.count+" "+r.src+" reviews"+(r.rating?" · "+r.rating+" / 5":"")+"."};
}
function engScore(b){
  var e=b.engagement;
  if(!e||e.rate_pct==null) return {score:null,band:"Unknown",e:null,
    why:"No Instagram engagement data — not in the API pull roster or too few recent posts."};
  /* peer-relative: the old absolute scale saturated at 100 for many businesses.
     The top observed rate maps to 98 so scores can actually distinguish. */
  var s=Math.max(2,Math.min(98,Math.round(e.rate_pct/ENG_MAX*98)));
  var band=s>=60?"Strong":s>=35?"Solid":s>=15?"Light":"Minimal";
  var rank=ENG_RATES.filter(function(r){return r>e.rate_pct;}).length+1;
  return {score:s,band:band,e:e,rank:rank,of:ENG_RATES.length,
    why:e.posts+" recent posts · "+e.rate_pct+"% mean engagement · "+e.avg_likes+" avg likes"};
}
/* ---------- detail panel: collapsed (scan) vs expanded (study) ----------
   Raw data is the product; scores are annotations. The collapsed panel shows
   headline numbers + four small score badges. The expanded panel widens to half
   the screen with tabs: Overview / Social / Pricing / Website / Scorecard. */
/* peer-relative engagement stats: the old 0-100 saturated (many businesses hit
   100). Scores are now relative to the observed max so they can distinguish. */
var ENG_MAX=1, ENG_MED=null, ENG_RATES=[], REV_MED=null, HOURLY_N=0;
function engStats(){
  ENG_RATES=B.filter(function(b){return b.engagement&&b.engagement.rate_pct!=null;})
    .map(function(b){return b.engagement.rate_pct;}).sort(function(a,b){return a-b;});
  ENG_MAX=ENG_RATES.length?ENG_RATES[ENG_RATES.length-1]:1;
  ENG_MED=ENG_RATES.length?ENG_RATES[Math.floor(ENG_RATES.length/2)]:null;
  var rc=B.map(function(b){var r=reviewInfo(b);return r?r.count:null;})
    .filter(function(v){return v!=null;}).sort(function(a,b){return a-b;});
  REV_MED=rc.length?rc[Math.floor(rc.length/2)]:null;
  HOURLY_N=B.filter(function(b){return b.price.weddingHourly!=null;}).length;
}
function dstrShort(ds){ if(!ds) return "\u2014"; var d=new Date(ds+"T12:00:00");
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function profHead(b){
  var ini=b.name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join("");
  return '<div class="prof-head"><div class="prof-ava">'+esc(ini)+"</div>"+
    "<div><h2>"+esc(b.name)+"</h2>"+
    '<div class="sub">'+esc(b.town)+locTag(b)+" · "+(LANE_LABEL[b.specialty]||b.specialty)+
    (b.region==="slc"?" · St. Lawrence Co":"")+"</div></div></div>";
}
/* ---------- right panel: one shared header in every state ----------
   Title left, one chevron control right, same height and padding whether the
   panel shows the market glance or a business profile, collapsed or expanded.
   The chevron points where the panel edge moves: ⟨ expands left, ⟩ collapses right. */
function pheadHTML(title,px){
  var btn="";
  if(px==="glance")
    btn='<button class="pxlink" data-gexpand title="Open the full market landscape">Landscape &rarr;</button>';
  else if(px==="profile")
    btn='<button class="pxbtn" data-px="profile" title="'+(S.expanded?"Collapse the profile":"Expand the profile")+'">'+(S.expanded?"\u27E9":"\u27E8")+"</button>";
  return '<div class="phead"><span class="pt">'+title+"</span>"+btn+"</div>";
}
function pheadTitle(b){
  var ini=b.name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join("");
  return '<span class="pava">'+esc(ini)+'</span><span class="pname">'+esc(b.name)+"</span>";
}
function linkChips(b){
  var h='<div class="chiprow">';
  if(b.ig_handle) h+='<span class="chip">@'+esc(b.ig_handle)+"</span>";
  if(b.website) h+='<a class="chip extlink" href="'+esc(/^https?:/.test(b.website)?b.website:"https://"+b.website)+'" target="_blank" rel="noopener">Website ↗</a>';
  if(b.pricing_url) h+='<a class="chip extlink" href="'+esc(b.pricing_url)+'" target="_blank" rel="noopener">Pricing ↗</a>';
  return h+"</div>";
}
/* ---------- business profile: simple two-state panel ----------
   Collapsed: overview info + score bar charts, spread across the full
   vertical rail, top to bottom. Expanded: EVERYTHING at once — no tabs,
   no scrolling. One click opens, one click (⟩ Collapse or Esc) closes.
   Both states live in the same footprints as the market glance
   (348px collapsed / 700px expanded). */
/* latest IG activity row (media_count + biography) */
function latestIgAct(b){
  var best=null;
  (D.igActivity||[]).forEach(function(r){
    if(r.handle!==b.ig_handle) return;
    if(r.media_count==null&&!r.biography) return;
    if(!best||String(r.date||"")>String(best.date||"")) best=r; });
  return best;
}
function yearsStr(b){
  var w=WI[b.id]||{}, wOk=!w.unreachable;
  var yrs=wOk?(w.years_in_business!=null?w.years_in_business+" yrs":(w.since?"since "+w.since:null)):null;
  if(!yrs&&b.est_year!=null){ var yyb=new Date().getFullYear()-b.est_year;
    yrs=yyb+" yrs · est. "+b.est_year; }
  return yrs;
}
function servicesOf2(b){
  var w=WI[b.id], wOk=w&&!w.unreachable;
  if(wOk&&w.services&&w.services.length) return w.services;
  return (b.services&&b.services.length)?b.services:null;
}
function coverageOf(b){
  var w=WI[b.id];
  return (w&&!w.unreachable&&w.coverage&&w.coverage.length)?w.coverage.join(" · "):null;
}
/* headline numbers, shared by the collapsed rows and the expanded strip */
function snapData(b){
  var f=followersAt(b,S.di), ri=reviewInfo(b), s=confOf(b);
  var price=b.price.wedding!=null?money(b.price.wedding)
    :b.price.session!=null?money(b.price.session)
    :b.price.weddingHourly!=null?money(b.price.weddingHourly)+"/hr":"—";
  var lastFull=b.last_post_date?dstr(b.last_post_date):null;
  var last=lastFull?dstrShort(b.last_post_date):(b.postAge!=null?b.postAge+"d ago":"—");
  return {f:f,ri:ri,s:s,price:price,
    priceT:price!=="—"?("Starting price: "+price):"",
    last:last,
    lastT:lastFull?("Last post: "+lastFull):(b.postAge!=null?("Last post: "+b.postAge+" days ago"):""),
    lastFull:lastFull,yrs:yearsStr(b)};
}
function snapRowsHTML(b){
  var d=snapData(b);
  function row(l,v,t){ return '<div class="xkv"><span>'+l+'</span><b'+(t?' title="'+esc(t)+'"':"")+'>'+v+"</b></div>"; }
  return row("Followers",d.f!=null?fmt(d.f):"—",d.f!=null?("Followers: "+d.f):"")+
    row("Last post",esc(d.last),d.lastT)+
    row("Reviews",d.ri?fmt(d.ri.count):"—",d.ri?("Reviews: "+d.ri.count):"");
}
/* pricing summary strip for the collapsed profile: every known figure plus
   the wedding-floor rank across tracked businesses */
function priceSummaryHTML(b){
  var p=b.price, bits=[];
  if(p.wedding!=null) bits.push('Wedding <b>'+money(p.wedding)+'+</b>');
  if(p.session!=null) bits.push('Session <b>'+money(p.session)+'+</b>');
  if(p.weddingHourly!=null) bits.push('<b>'+money(p.weddingHourly)+'/hr</b>');
  var full=b.pricing?(' title="'+esc(b.pricing)+'"'):"";
  if(!bits.length)
    return '<div class="ppsum none"'+full+'>Not published</div>';
  var rank="";
  if(p.wedding!=null){
    var wArr=C.filter(function(x){return x.price.wedding!=null;});
    rank='<span class="pprank">#'+(wArr.filter(function(x){return x.price.wedding<p.wedding;}).length+1)+' of '+wArr.length+'</span>';
  }
  return '<div class="ppsum"'+full+'>'+bits.join('<i>·</i>')+rank+'</div>';
}
/* hero: the digital-footprint score as a big ring gauge at the top of the collapsed profile */
function fpHeroHTML(b){
  var s=confOf(b), pct=s==null?0:Math.max(0,Math.min(100,Math.round(s)));
  var band=s==null?"unknown":(s>=80?"strong":s>=60?"decent":s>=40?"thin":"weak");
  var col=s==null?"#8b93a3":s>=80?"#e8b34b":s>=60?"#6db3f2":s>=40?"#d08a4e":"#e05a4e";
  var r=30, c=(2*Math.PI*r).toFixed(1), fill=(c*pct/100).toFixed(1);
  return '<div class="fphero" data-cf="'+b.id+'" title="Digital footprint \u2014 '+band+' \u2014 expand for everything">'+
    '<svg class="fring" width="92" height="92" viewBox="0 0 76 76" role="img" aria-label="Digital footprint '+pct+' of 100">'+
    '<circle cx="38" cy="38" r="'+r+'" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7"/>'+
    '<circle cx="38" cy="38" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="7" stroke-linecap="round" '+
    'stroke-dasharray="'+fill+" "+c+'" transform="rotate(-90 38 38)"/>'+
    '<text x="38" y="40" text-anchor="middle" dominant-baseline="central" class="fringnum">'+(s==null?"\u2014":pct)+"</text></svg>"+
    '<div class="fphl">Digital Footprint</div>'+
    '<div class="fphb" style="color:'+col+'">'+band+"</div></div>";
}
/* how-AI-sees-it framing: the digital footprint paragraph (the score itself is the hero above) */
function footprintHTML(b){
  return '<div class="plab">How AI sees this business</div>'+
    '<div class="footprint"><p>This business\u2019s digital footprint \u2014 what AI assistants and search engines see when they look it up.</p></div>';
}
/* overview: bio, services, coverage, years */
function ovBioHTML(b){
  var igAct=latestIgAct(b), wi=WI[b.id], wOk=wi&&!wi.unreachable;
  var bio=igAct&&igAct.biography;
  var h="";
  if(bio) h+='<div class="sub bio clamp3">“'+esc(bio)+"”</div>";
  if(wOk&&wi.site_note) h+='<div class="sub clamp3">'+esc(wi.site_note)+"</div>";
  var sv=servicesOf2(b);
  if(sv) h+='<div class="chiprow">'+sv.map(function(s){return '<span class="chip">'+esc(s)+"</span>";}).join(" ")+"</div>";
  var cov=coverageOf(b), yrs=yearsStr(b);
  /* long coverage lists left-align on their own lines instead of wrapping ragged on the right */
  if(cov) h+='<div class="cov"><span>Coverage</span><b>'+esc(cov)+"</b></div>";
  if(yrs){
    h+='<dl class="kv">';
    h+="<dt>In business</dt><dd><b>"+esc(yrs)+"</b></dd>";
    h+="</dl>";
  }
  return h;
}
/* score bar charts — blue fill is data, gold band is state */
function scoreBarsHTML(b,clickable){
  var defs=[["Activity",actScore(b)],["Momentum",momScore(b)],["Engagement",engScore(b)],["Price position",valScore(b)],["Reviews",revScore(b)]];
  return '<div class="pbars">'+defs.map(function(d){
    var r=d[1], s=r.score, pct=s==null?0:Math.max(0,Math.min(100,s));
    /* hourly-only pricing isn't ranked — label it instead of showing an empty row; no pricing at all hides the row */
    if(s==null){
      if(d[0]==="Price position"&&b.price.weddingHourly!=null)
        return '<div class="pbar"><span class="pbl">Price position</span>'+
          '<span class="pbtrack"><i style="width:0%;background:rgba(255,255,255,.14)"></i></span>'+
          '<span class="pbv"><small>Hourly</small> '+money(b.price.weddingHourly)+"/hr</span></div>";
      return "";
    }
    return '<div class="pbar"'+(clickable?' data-cf="'+b.id+'" title="'+esc(r.band+(r.why?" — "+r.why:"")+" — expand for everything")+'"':"")+'>'+
      '<span class="pbl">'+d[0]+'</span>'+
      '<span class="pbtrack"><i style="width:'+pct+'%"></i></span>'+
      '<span class="pbv">'+s+' <small>'+esc(r.band)+"</small></span></div>";
  }).join("")+"</div>";
}
/* collapsed: headline numbers first, then score bars, then links — fits the rail, no scrolling */
function profileCollapsedHTML(b){
  return '<div class="pcol">'+
    fpHeroHTML(b)+
    '<div class="plab">Headline numbers</div>'+snapRowsHTML(b)+
    '<div class="plab">Pricing</div>'+priceSummaryHTML(b)+
    '<div class="pspace"></div>'+
    footprintHTML(b)+
    '<div class="plab">Scores</div>'+scoreBarsHTML(b,true)+
    '<div class="pspace"></div>'+
    linkChips(b)+
  "</div>";
}
/* ---------- expanded: everything at once, no tabs, no scrolling ---------- */
function estat6HTML(b){
  var d=snapData(b);
  function stat(v,l,t){ return '<div class="hstat"><div class="v"'+(t?' title="'+esc(t)+'"':"")+'>'+v+'</div><div class="l">'+l+"</div></div>"; }
  return '<div class="hstats6">'+
    stat(d.f!=null?fmt(d.f):"—","Followers",d.f!=null?("Followers: "+d.f):"")+
    stat(esc(d.last),"Last post",d.lastT)+
    stat(esc(d.price),"Starting price",d.priceT)+
    stat(d.ri?fmt(d.ri.count):"—","Reviews",d.ri?("Reviews: "+d.ri.count):"")+
    stat(d.s!=null?d.s+"%":"—","Confidence",d.s!=null?("Information confidence: "+d.s+"%"):"")+
    stat(d.yrs?esc(d.yrs):"—","In business",d.yrs?("In business: "+d.yrs):"")+"</div>";
}
function xsecAbout(b){
  var h=ovBioHTML(b);
  return '<section class="xsec"><h4>About</h4>'+(h||'<div class="xdim">No overview data yet.</div>')+"</section>";
}
function xsecSocial(b){
  var rows="";
  if(b.last_post_date) rows+="<dt>Last post</dt><dd><b>"+dstr(b.last_post_date)+"</b>"+(b.postAge!=null?' <span class="xdim">('+b.postAge+"d ago)</span>":"")+"</dd>";
  if(b.last_post_type) rows+="<dt>Format</dt><dd>"+esc(b.last_post_type)+"</dd>";
  if(b.last_post_topic) rows+="<dt>Topic</dt><dd>"+esc(b.last_post_topic)+"</dd>";
  var igAct=latestIgAct(b);
  if(igAct&&igAct.media_count!=null) rows+="<dt>Posts</dt><dd><b>"+fmt(igAct.media_count)+"</b></dd>";
  var ch7=pctChange(b,Math.max(0,S.di-7),S.di), ch30=pctChange(b,Math.max(0,S.di-30),S.di);
  function chRow(l,c){ return '<div class="xkv"><span>'+l+'</span><b class="pct '+(c==null?"fl":c>=0?"up":"dn")+'">'+pctStr(c)+"</b></div>"; }
  var h='<section class="xsec"><h4>Instagram'+
    (b.ig_handle?'<a class="dsrc" href="https://instagram.com/'+esc(b.ig_handle)+'" target="_blank" rel="noopener">Instagram ↗</a>':"")+"</h4>";
  if(rows) h+='<dl class="kv">'+rows+"</dl>";
  h+=chRow("7-day change",ch7)+chRow("30-day change",ch30);
  h+=(b.followHist&&b.followHist.length>=2)?sparkline(b.followHist,300,46):'<div class="xdim">Not enough history for a trend yet.</div>';
  return h+"</section>";
}
function xsecPricing(b){
  var wArr=C.filter(function(x){return x.price.wedding!=null;}).sort(function(a,c){return a.price.wedding-c.price.wedding;});
  var rW=b.price.wedding!=null?wArr.indexOf(b)+1:null;
  var rows="";
  if(b.price.wedding!=null) rows+="<dt>Wedding from</dt><dd><b>"+money(b.price.wedding)+"</b>"+(rW?' <span class="xdim">#'+rW+" of "+wArr.length+"</span>":"")+"</dd>";
  if(b.price.weddingHourly!=null) rows+="<dt>Wedding rate</dt><dd><b>"+money(b.price.weddingHourly)+"/hr</b></dd>";
  if(b.price.session!=null) rows+="<dt>Session from</dt><dd><b>"+money(b.price.session)+"</b></dd>";
  var cfd=CONF[b.id];
  if(cfd&&cfd.conflict) rows+='<dt>Price conflict</dt><dd><span class="pcflag">needs review</span><br>'+
    cfd.conflict.values.map(function(v){ return '<span class="xdim">'+esc(v.label)+":</span> <b>"+esc(v.text)+"</b>"; }).join("<br>")+"</dd>";
  var h='<section class="xsec"><h4>Pricing</h4>';
  if(rows){
    h+='<dl class="kv">'+rows+"</dl>";
    var r=wedRank(b);
    if(r) h+='<div class="xdim">Cheaper than <b>'+r.pct+'%</b> of '+r.n+" · median "+money(r.med)+".</div>";
  } else h+='<div class="xdim">No published pricing found.</div>';
  if(b.pricing_url) h+='<div class="sc-link"><a class="dsrc" href="'+esc(/^https?:/i.test(b.pricing_url)?b.pricing_url:"https://"+b.pricing_url)+'" target="_blank" rel="noopener">Pricing source ↗</a></div>';
  return h+"</section>";
}
function xsecWebsite(b){
  var wi=WI[b.id], wOk=wi&&!wi.unreachable;
  var rows="";
  if(wOk&&wi.platform) rows+="<dt>Site built on</dt><dd>"+esc(wi.platform)+"</dd>";
  var h='<section class="xsec"><h4>Website</h4>';
  if(rows){
    h+='<dl class="kv">'+rows+"</dl>";
    if(wOk&&wi.site_note) h+='<div class="xdim clamp3">'+esc(wi.site_note)+"</div>";
    h+='<div class="xdim">Checked '+esc((wi&&wi.fetched)||"Sep 2026")+"</div>";
  } else if(b.website) h+='<div class="xdim">Site not analyzed.</div>';
  else h+='<div class="xdim">No website on record.</div>';
  if(b.website) h+='<div class="sc-link"><a class="dsrc" href="'+esc(/^https?:/i.test(b.website)?b.website:"https://"+b.website)+'" target="_blank" rel="noopener">Website ↗</a></div>';
  return h+"</section>";
}
/* compact raw evidence shown inline in each expanded score row */
function scoreRaw(b,label,res){
  if(label==="Activity") return b.last_post_date?dstrShort(b.last_post_date):"no post date";
  if(label==="Momentum"){ var c=pctChange(b,Math.max(0,S.di-30),S.di);
    return c!=null?((c>=0?"+":"")+c.toFixed(1)+"% / 30d"):"no trend"; }
  if(label==="Engagement") return res.e?res.e.rate_pct+"% mean":"no data";
  if(label==="Price position")
    return b.price.wedding!=null?(money(b.price.wedding)+" floor")
      :(b.price.weddingHourly!=null?(money(b.price.weddingHourly)+"/hr hourly"):"no pricing");
  if(label==="Reviews"){ var ri=reviewInfo(b);
    return ri?(fmt(ri.count)+(ri.rating!=null?" · "+ri.rating+" / 5":"")):"not collected"; }
  return "";
}
/* expanded score bars: label, bar, and the raw figure right-aligned in the row */
function xscoreBarsHTML(b){
  var defs=[["Activity",actScore(b)],["Momentum",momScore(b)],["Engagement",engScore(b)],["Price position",valScore(b)],["Reviews",revScore(b)]];
  var rows="";
  defs.forEach(function(d){
    var r=d[1], s=r.score;
    if(s==null&&!(d[0]==="Price position"&&b.price.weddingHourly!=null)) return;
    var pct=s==null?0:Math.max(0,Math.min(100,s));
    rows+='<div class="pbar"><span class="pbl">'+d[0]+'</span>'+
      '<span class="pbtrack"><i style="width:'+pct+'%'+(s==null?";background:rgba(255,255,255,.14)":"")+'"></i></span>'+
      '<span class="pbv">'+(s==null?"—":s)+' <span class="praw">'+esc(scoreRaw(b,d[0],r))+"</span></span></div>";
  });
  return '<div class="pbars">'+rows+"</div>";
}
function xsecScores(b){
  var defs=[["Activity",actScore(b)],["Momentum",momScore(b)],["Engagement",engScore(b)],["Price position",valScore(b)],["Reviews",revScore(b)]];
  var parts=defs.filter(function(d){return d[1].score!=null;});
  var h='<section class="xsec"><h4>Scores</h4>';
  if(!parts.length) h+='<div class="xdim">No scored signals yet.</div>';
  h+=xscoreBarsHTML(b);
  return h+"</section>";
}
function xsecConf(b){
  var s=confOf(b); if(s==null) return "";
  var cfd=CONF[b.id]||{}, parts=cfd.parts||{};
  var igUrl=b.ig_handle?("https://instagram.com/"+b.ig_handle):null;
  var FACTORS=[
    ["website","Website",25,b.website,"site"],
    ["prices","Prices",15,b.pricing_url,"pricing"],
    ["services","Services",15,null,null],
    ["ig","Instagram",15,igUrl,"profile"],
    ["location","Location",10,null,null],
    ["years","History",10,null,null],
    ["corroboration","Third source",10,b.review_url,"listing"]
  ];
  var verified=0, segs="", missed="";
  FACTORS.forEach(function(f){
    var er=parts[f[0]]||0, got=er>0; if(got) verified++;
    segs+='<span class="dcseg" style="flex:'+f[2]+' 1 0%" title="'+f[1]+": "+er+"/"+f[2]+'"><i style="width:'+Math.round(100*er/f[2])+'%"></i></span>';
    if(!got) missed+='<div class="xkv missed"><span>'+f[1]+'</span><b>missing</b></div>';
  });
  var h='<section class="xsec"><h4>Information confidence</h4>'+
    '<div class="cf2-bar"><span class="dcsegs wide">'+segs+'</span></div>'+
    '<div class="xkv"><span>Score</span><b>'+s+"% · "+verified+" of "+FACTORS.length+" verified</b></div>"+missed;
  if(cfd.conflict) h+='<div class="xkv missed"><span>Price conflict</span><b>−20 penalty</b></div>';
  return h+"</section>";
}
function profileExpandedHTML(b){
  return '<div class="sec xall">'+
    estat6HTML(b)+
    '<div class="xgrid">'+xsecAbout(b)+xsecSocial(b)+xsecPricing(b)+xsecWebsite(b)+"</div>"+
    '<div class="xgrid2">'+xsecScores(b)+xsecConf(b)+"</div>"+
    linkChips(b)+"</div>";
}

/* ---------- directory ---------- */
function venueRow(b,i){
  return '<div class="row wrap'+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'"'+(i<20?' style="animation-delay:'+(i*0.03)+'s"':"")+'>'+
    '<span class="dot" style="background:'+recencyDot(b)+'"></span>'+
    '<div class="nm"><b>'+esc(b.name)+'</b>'+
    '<span>'+esc(b.townShort)+locTag(b)+' · '+(b.capacity?esc(b.capacity):"Venue")+'</span></div>'+
    '<div class="meta"><b>'+(b.capacity_num!=null?fmt(b.capacity_num):"—")+'</b><span>max guests'+
    (b.followers!=null?' · '+fmt(b.followers)+' IG':"")+'</span></div></div>';
}
function dirRow(b,i){
  if(b.type==="venue") return venueRow(b,i);
  var f=followersAt(b,S.di), ch=pctChange(b,Math.max(0,S.di-7),S.di);
  var pcls=ch==null?"fl":(ch>=0?"up":"dn");
  return '<div class="row'+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'"'+(i<20?' style="animation-delay:'+(i*0.03)+'s"':"")+'>'+
    '<span class="dot" style="background:'+recencyDot(b)+'"></span>'+
    '<div class="nm"><b>'+esc(b.name)+'</b>'+
    '<span>'+esc(b.townShort)+locTag(b)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+'</span></div>'+
    '<div class="meta"><b>'+fmt(f)+'</b><span>'+(b.hasPrice?(b.price.wedding!=null?money(b.price.wedding):(b.price.session!=null?money(b.price.session):money(b.price.weddingHourly)+"/hr")):"price n/a")+
    ' · <span class="pct '+pcls+'">'+pctStr(ch)+'</span></span>'+confBadge(b)+'</div></div>';
}
/* explicit county labeling: adjacent-county businesses are named as such everywhere */
function locTag(b){
  if(b.region==="adjacent"&&b.county) return ' <span class="adj">· '+esc(b.county)+' Co (adjacent)</span>';
  if(b.region==="unconfirmed"||(b.flags||[]).indexOf("location-unverified")>=0) return ' <span class="unv">· location unverified</span>';
  return "";
}
function sortDir(list){
  var by=S.sortBy||"audience";
  function nul(x,y,fn){ if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1; return fn(x,y); }
  var key={
    audience:function(b){return b.followers;}, capacity:function(b){return b.capacity_num;},
    growth:function(b){return pctChange(b,Math.max(0,S.di-7),S.di);},
    recent:function(b){return b.postAge;},
    price:function(b){return b.price.wedding!=null?b.price.wedding:(b.price.session!=null?b.price.session:null);},
    name:function(b){return b.name.toLowerCase();}
  }[by]||function(b){return b.followers;};
  var dir=(by==="recent"||by==="price"||by==="name")?1:-1;
  return list.slice().sort(function(a,b){
    var r=nul(key(a),key(b),function(x,y){ return (typeof x==="string"?x.localeCompare(y):(x-y))*dir; });
    return r||a.name.localeCompare(b.name);
  });
}
function renderDir(){
  var list=sortDir(filtered());
  var noun=S.mode==="venues"?"venues":"businesses";
  if(!list.length) return '<div class="empty-note">No '+noun+' match these filters.<br><button class="ghostbtn" id="clearf">Clear filters</button></div>';
  return '<div class="stagger dirlist">'+list.map(dirRow).join("")+"</div>";
}

/* ---------- data tab: every gathered data point, sortable + filterable ---------- */
var MC_MAP={}; (D.igActivity||[]).forEach(function(r){
  if(r.media_count==null||!r.handle) return;
  var p=MC_MAP[r.handle];
  if(!p||String(r.date||"")>String(p.date||"")) MC_MAP[r.handle]=r; });
function postsOf(b){ if(b.media_count!=null) return b.media_count;
  var r=b.ig_handle&&MC_MAP[b.ig_handle]; return r?r.media_count:null; }
function servicesOf(b){ var w=WI[b.id];
  if(w&&w.services&&w.services.length) return w.services.join(", ");
  return b.services||""; }
function yearsOf(b){ var w=WI[b.id]||{};
  if(w.years_in_business!=null) return w.years_in_business+" yrs";
  if(w.since) return "since "+w.since;
  if(b.est_year!=null) return "est. "+b.est_year;
  return ""; }
function townCounty(b){ return b.townShort+((b.county&&b.region==="adjacent")?" · "+b.county+" Co":""); }
/* ---------- service landscape ---------- */
var SVC_NORM={
 "weddings":"Weddings","wedding photography":"Weddings","wedding photo+video":"Weddings",
 "elopements":"Elopements",
 "engagements":"Engagements","engagement":"Engagements",
 "couples":"Couples",
 "portraits":"Portraits",
 "seniors":"Seniors","senior":"Seniors","school/team photos":"School & team",
 "families":"Families","family":"Families","family portraits":"Families","some family photography":"Families",
 "children":"Children & newborns","child photography":"Children & newborns","newborns":"Children & newborns",
 "maternity":"Maternity","boudoir":"Boudoir","events":"Events",
 "branding":"Commercial & branding","photobooth":"Photo booth","pets":"Pets","dj package":"DJ services",
 "videography":"Videography","video":"Videography","wedding videography":"Videography","memory videos":"Videography","promotional video":"Videography",
 "drone":"Drone","drone photo+video":"Drone","aerial photo/video":"Drone",
 "real estate":"Real estate","real estate/commercial aerial + ground photo/video":"Real estate"};
var LS_COUNTIES=["St. Lawrence","Essex","Franklin","Jefferson","Clinton","Lewis","Herkimer"];
var LS_CSHORT={"St. Lawrence":"St. Law.","Essex":"Essex","Franklin":"Frank.","Jefferson":"Jeff.","Clinton":"Clinton","Lewis":"Lewis","Herkimer":"Herk."};
function svcList(b){ var out=[],seen={};
  /* B normalizes services to an array at load; tolerate a raw string too. */
  var arr=Array.isArray(b.services)?b.services:String(b.services||"").split(/[,;]+/);
  arr.forEach(function(s){ s=String(s).replace(/\s*\(.*$/,"").trim().toLowerCase();
    var n=SVC_NORM[s]||null;
    if(n&&!seen[n]){ seen[n]=1; out.push(n); } });
  return out; }
/* ---------- market landscape: consolidated categories ----------
   Hundreds of raw service strings collapse into six groups. A business counts in
   every group it offers, so shares overlap; that is stated on the page. */
var SVC_GROUPS=[
  {k:"wed",label:"Weddings & couples",color:"#e8b34b"},
  {k:"port",label:"Portraits & family",color:"#b48ce8"},
  {k:"evt",label:"Events & commercial",color:"#e08bb8"},
  {k:"vid",label:"Video",color:"#6db3f2"},
  {k:"re",label:"Real estate",color:"#c7d2e0"},
  {k:"dr",label:"Drone & aerial",color:"#6fd3e7"}];
/* assistant colors + citation-tier color: applied to every business equally, data only */
var ENG_COLORS={ChatGPT:"#34d399",Gemini:"#6db3f2"};
function aiTierColor(pct){
  if(pct>=80) return "#34d399";
  if(pct>=50) return "#e8b34b";
  if(pct>=25) return "#6db3f2";
  return "#5b6472";
}
var GRP_RX=[
  ["dr",/drone|aerial|\bfaa\b|\buav\b/],
  ["re",/real estate|matterport|floor plan|inspection|street view|\b360\b|architectur|video tours/],
  ["vid",/video|cinematic|motion graphics|voiceover|vhs|\bdvd\b|\btape\b|documentary|filming|pre-production|post-production|color grading/],
  ["wed",/wedding|nuptial|elop|bridal|engage|couple|proposal|trash.{0,3}the.{0,3}dress|intimate celebration|save-the-date|second shooter/],
  ["evt",/\bevents?\b|party|parties|birthday|photo ?booth|\bdj\b|corporate|commercial|brand|business|marketing|product|social|concert|athlete|\brace\b|sports photography/],
  ["port",/portrait|senior|famil|child|newborn|infant|baby|babies|maternity|motherhood|prenatal|birth|boudoir|\bpets?\b|mini|milestone|cake smash|tween|teen|\bgrads?\b|graduation|prom\b|school|\bteam\b|headshot|lifestyle|studio|fashion|model|editorial|glamour|relationship|holiday|session/]];
function svcGroupsOf(b){
  var raw=(Array.isArray(b.services)?b.services:[]).map(String);
  var w=WI[b.id]; if(w&&!w.unreachable&&w.services) w.services.forEach(function(x){ raw.push(String(x)); });
  var out={}, listed=false;
  raw.forEach(function(x){
    var t=x.toLowerCase(), m=[];
    GRP_RX.forEach(function(p){ if(p[1].test(t)) m.push(p[0]); });
    if(!m.length) return;
    (m.indexOf("dr")>=0&&m.indexOf("re")>=0?["dr","re"]:[m[0]]).forEach(function(k){ out[k]=1; listed=true; });
  });
  if(!listed){ if(b.specialty==="video"||b.specialty==="both") out.vid=1; if(b.specialty==="drone") out.dr=1; }
  return {groups:Object.keys(out),listed:listed};
}
function hexRGB(h){ return parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16); }
function landscapeData(list){
  var g={}; SVC_GROUPS.forEach(function(x){ g[x.k]={g:x,members:[],fol:0,county:{}}; });
  var totFol=0, listed=0, none=0;
  list.forEach(function(b){
    var f=followersAt(b,S.di); if(f!=null) totFol+=f;
    var r=svcGroupsOf(b); if(r.listed) listed++;
    if(!r.groups.length){ none++; return; }
    r.groups.forEach(function(k){ var e=g[k]; e.members.push(b); if(f!=null) e.fol+=f;
      if(b.county) e.county[b.county]=(e.county[b.county]||0)+1; });
  });
  return {rows:SVC_GROUPS.map(function(x){return g[x.k];}),total:list.length,totFol:totFol,listed:listed,none:none};
}
function lsMatrixHTML(d,rows){
  var mx=1; rows.forEach(function(r){ LS_COUNTIES.forEach(function(c){ mx=Math.max(mx,r.county[c]||0); }); });
  var h='<div class="mx"><div></div>'+LS_COUNTIES.map(function(c){ return '<div class="mx-ch">'+esc(c)+'</div>'; }).join("");
  rows.forEach(function(r){
    h+='<div class="mx-lab"><i class="share-sw" style="background:'+r.g.color+'"></i>'+esc(r.g.label)+'</div>';
    LS_COUNTIES.forEach(function(c){ var v=r.county[c]||0, a=v?0.14+0.62*(v/mx):0;
      h+='<div class="mx-c" title="'+esc(r.g.label)+' \u00b7 '+esc(c)+' Co: '+v+' business'+(v===1?'':'es')+'" style="background:rgba('+hexRGB(r.g.color)+','+a.toFixed(2)+')">'+(v||'<span class="ls-zero">\u2014</span>')+'</div>'; });
  });
  return h+'</div>';
}
function landscapeHTML(list){
  var d=landscapeData(list), by=S.shareBy==="audience"?"audience":"providers";
  var val=function(r){ return by==="audience"?r.fol:r.members.length; };
  var rows=d.rows.slice().sort(function(a,b){ return val(b)-val(a); });
  var sum=rows.reduce(function(a,r){return a+val(r);},0)||1;
  var R=100, CIRC=2*Math.PI*R, off=0, segs="";
  rows.forEach(function(r){
    var frac=val(r)/sum; if(!frac) return;
    var len=Math.max(1,frac*CIRC-3);
    segs+='<circle cx="130" cy="130" r="'+R+'" fill="none" stroke="'+r.g.color+'" stroke-width="28" stroke-dasharray="'+len.toFixed(1)+' '+(CIRC-len).toFixed(1)+'" stroke-dashoffset="'+(-off*CIRC).toFixed(1)+'" transform="rotate(-90 130 130)"><title>'+esc(r.g.label)+': '+Math.round(frac*100)+'% of '+(by==="audience"?"audience reach":"service listings")+'</title></circle>';
    off+=frac;
  });
  var h='<section class="sec card sharecard"><div class="card-head"><div><h3>Market share by service</h3>'+
    '<div class="sub">Every business counts in each category it offers, so the percentages overlap. '+d.listed+' of '+d.total+' publish a services list; the rest are placed by their main lane'+(d.none?' ('+d.none+' still unclassified)':'')+'.</div></div>'+
    '<div class="seg" role="tablist" aria-label="Measure"><button data-shareby="providers" class="'+(by==="providers"?"on":"")+'">By businesses</button><button data-shareby="audience" class="'+(by==="audience"?"on":"")+'">By audience</button></div></div>'+
    '<div class="share"><div class="share-donutcol"><div class="share-donut"><svg viewBox="0 0 260 260" aria-hidden="true">'+segs+'</svg>'+
    '<div class="share-center"><b>'+d.total+'</b><span>businesses</span></div></div>'+
    '<div class="share-legend">'+rows.map(function(r){
      return '<span class="share-leg"><i style="background:'+r.g.color+'"></i>'+esc(r.g.label)+'<b>'+Math.round(val(r)/sum*100)+'%</b></span>';
    }).join("")+'</div></div><div class="share-rows">';
  rows.forEach(function(r){
    var n=r.members.length, pctB=Math.round(n/d.total*100), pctA=d.totFol?Math.round(r.fol/d.totFol*100):0;
    var big=by==="audience"?pctA:pctB, open=S.qx["g:"+r.g.k];
    h+='<div class="share-row'+(open?" open":"")+'" data-gx="'+r.g.k+'">'+
      '<i class="share-sw" style="background:'+r.g.color+'"></i>'+
      '<div class="share-name">'+esc(r.g.label)+'</div>'+
      '<div class="share-val">'+big+'%</div>'+
      '<div class="share-meta">'+(by==="audience"?fmt(r.fol)+' followers \u00b7 '+n+' businesses':n+' of '+d.total+' businesses \u00b7 '+pctA+'% of audience')+'</div>'+
      '<div class="share-track"><i style="width:'+Math.max(big?2:0,big)+'%;background:'+r.g.color+'"></i></div>';
    if(open){
      var ms=r.members.slice().sort(function(a,b){return (b.followers||0)-(a.followers||0);});
      h+='<div class="share-mem">'+ms.map(function(m){ return '<span class="share-chip" data-open="'+m.id+'">'+esc(m.name)+'</span>'; }).join("")+'</div>';
    }
    h+='</div>';
  });
  h+='</div></div></section>';
  h+='<section class="sec card"><div class="card-head"><div><h3>Where each service is offered</h3><div class="sub">Businesses per category in each county. Deeper color means deeper coverage.</div></div></div>'+lsMatrixHTML(d,rows)+'</section>';
  return h;
}
function pageHeadHTML(title,sub){
  var g=(D.meta||{}).generated_at, built="";
  if(g){ try{ built=new Date(g).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET"; }catch(e){} }
  return '<div class="pg-head"><h2>'+title+'</h2>'+(sub?'<p>'+sub+(built?' <span class="pg-fresh">Data updated '+esc(built)+'.</span>':"")+'</p>':"")+'</div>';
}
var DCOLS=[
  ["name","Name","str"],["town","Town/County","str"],["followers","Followers","num"],
  ["ch7","7d","num"],["ch30","30d","num"],["posts","Posts","num"],
  ["services","Services","str"],["price","Price range","num"],["years","Years","str"],
  ["website","Website","str"],["ig","IG handle","str"],["conf","Conf.","num"]];
function dCellVal(b,k){
  switch(k){
    case "name": return b.name;
    case "town": return townCounty(b);
    case "followers": return followersAt(b,S.di);
    case "ch7": return pctChange(b,Math.max(0,S.di-7),S.di);
    case "ch30": return pctChange(b,Math.max(0,S.di-30),S.di);
    case "posts": return postsOf(b);
    case "services": return servicesOf(b);
    case "price": return b.price.wedding!=null?b.price.wedding:(b.price.session!=null?b.price.session:null);
    case "years": return yearsOf(b);
    case "website": return b.website||"";
    case "ig": return b.ig_handle||"";
    case "conf": return confOf(b);
  } return null;
}
function dCellHTML(b,k){
  var v=dCellVal(b,k);
  switch(k){
    case "followers": return fmt(v);
    case "ch7": case "ch30": return v==null?"—":'<span class="pct '+(v>=0?"up":"dn")+'">'+pctStr(v)+"</span>";
    case "posts": return fmt(v);
    case "price": return v==null?"—":money(v);
    case "website": return v?'<a href="'+esc(/^https?:/.test(v)?v:"https://"+v)+'" target="_blank" rel="noopener">site ↗</a>':"—";
    case "ig": return v?"@"+esc(v):"—";
    case "conf": return v==null?"—":confBadge(b);
    case "name": return "<b>"+esc(v)+"</b>";
    case "town": return '<span title="'+esc(v)+'">'+esc(b.townShort||v)+"</span>";
    default: return esc(v==null||v===""?"—":v);
  }
}
function dSortRows(rows,s){
  var num=(DCOLS.filter(function(c){return c[0]===s.key;})[0]||DCOLS[2])[2]==="num";
  rows.sort(function(a,b2){
    var x=dCellVal(a,s.key), y=dCellVal(b2,s.key);
    if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1;
    var r=num?(x-y):String(x).localeCompare(String(y));
    return r*s.dir;
  });
}
function renderData(){
  var s=S.dsort||{key:"followers",dir:-1};
  var q=(S.dq||"").toLowerCase();
  var rows=B.filter(function(b){
    if(!q) return true;
    return (b.name+" "+(b.town||"")+" "+(b.ig_handle||"")+" "+(b.website||"")).toLowerCase().indexOf(q)>=0; });
  dSortRows(rows,s);
  var h='<div class="sec">'+
    '<input id="dq" class="dfilter" type="search" placeholder="Filter rows…" value="'+esc(S.dq||"")+'" aria-label="Filter data rows">';
  h+='<div class="dsub">Businesses · '+rows.length+'</div><div class="dtable-wrap"><table class="dtable">'+
    '<colgroup><col style="width:16%"><col style="width:9%"><col style="width:8%">'+
    '<col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:17%">'+
    '<col style="width:8%"><col style="width:5%"><col style="width:7%"><col style="width:11%">'+
    '<col style="width:4%"></colgroup><thead><tr>'+
    DCOLS.map(function(c){ return '<th data-dk="'+c[0]+'" class="'+(s.key===c[0]?"sorted":"")+'">'+c[1]+(s.key===c[0]?(s.dir<0?" ▼":" ▲"):"")+'</th>'; }).join("")+
    '</tr></thead><tbody>'+
    rows.map(function(b){ return '<tr data-open="'+b.id+'">'+DCOLS.map(function(c){ return "<td>"+dCellHTML(b,c[0])+"</td>"; }).join("")+"</tr>"; }).join("")+
    '</tbody></table></div>';
  var vs=V.filter(function(v){ if(!q) return true;
    return (v.name+" "+(v.town||"")+" "+(v.website||"")).toLowerCase().indexOf(q)>=0; });
  h+='<div class="dsub">Venues · '+vs.length+'</div><div class="dtable-wrap"><table class="dtable"><thead><tr>'+
    ["Name","Town/County","Type","Capacity","Website","IG"].map(function(t){ return "<th>"+t+"</th>"; }).join("")+
    '</tr></thead><tbody>'+
    vs.map(function(v){
      var site=v.website?('<a href="'+esc(/^https?:/.test(v.website)?v.website:"https://"+v.website)+'" target="_blank" rel="noopener">site ↗</a>'):"—";
      return '<tr data-open="'+v.id+'"><td><b>'+esc(v.name)+'</b></td><td>'+esc(townCounty(v))+'</td>'+
      '<td>'+esc(v.setting||"Venue")+'</td><td>'+esc(v.capacity||"—")+'</td><td>'+site+'</td>'+
      '<td>'+(v.ig_handle?"@"+esc(v.ig_handle):"—")+'</td></tr>'; }).join("")+
    '</tbody></table></div></div>';
  return h;
}
/* ---------- AI search visibility ---------- */
/* Rival-name -> roster id for the names the audit returns most often.
   Names the AIs cite that aren't here are shown as untracked. */
var RIVAL2ID={
 "McCluskey Photography":"mccluskey-photography","McCluskey Photography LLC":"mccluskey-photography",
 "Adirondack Drone":"adirondack-drone-corey-james",
 "Natalie's Studio Portrait Photography":"natalie-s-studio","Natalie's Studio":"natalie-s-studio",
 "Carey White Photography":"carey-white-photography",
 "Kathleen Chapman Photography":"kathleen-chapman-photography",
 "Frisina's Photography":"frisina-s-photography",
 "Apex Pack Media":"apex-pack-media-jay-hicks",
 "Horizon Aerial Media Services":"horizon-aerial-media-services","Horizon Aerial Media":"horizon-aerial-media-services",
 "Pamela Perrin Photography":"pamela-perrin-photography",
 "Willow Tree Images":"willow-tree-images",
 "Jordan Craig Video & Photo":"jordan-craig-media-llc",
 "Amanda Hill Photography":"amanda-hill-photography",
 "Nicole's Photography":"nicole-s-photography-nicole-charleson",
 "Heath Photography":"heath-photography",
 "Allison Lee Photography":"allison-lee-photography",
 "Julia Kia Photography":"julia-kia-photography",
 "The Video Lab":"wendy-o-brien-the-video-lab",
 "La Belle Amour Photography":"la-belle-amour-photography"
};
function aiPromptShort(p){
  if(/videographer/i.test(p)) return "Wedding videographer · St. Lawrence Co.";
  if(/drone/i.test(p)) return "Drone · real estate · North Country";
  if(/family/i.test(p)) return "Family photographer · Potsdam";
  if(/how much|cpst/i.test(p)) return "Wedding photo/video cost · SLC";
  return "Wedding photographer · Potsdam";
}
function aiMed(xs){ var a=xs.filter(function(x){return x!=null;}).sort(function(x,y){return x-y;});
  return a.length?a[Math.floor(a.length/2)]:null; }
/* ---------- AI visibility: 50/50 split explorer ---------- */
var AI={};
function computeAI(){
  /* Claude and Perplexity are cut from the tab (2026-10-02): neither offers guest
     access for neutral audits, so their legs are permanently blocked. Historical rows
     stay in ai-visibility.json and the log, but the tab only renders the two live engines. */
  var rows=(D.aiVisibility||[]).filter(function(r){return r.jd_named!=="unreachable"&&(r.engine==="ChatGPT"||r.engine==="Gemini");});
  var dates=rows.map(function(r){return r.date;}).sort();
  var engines=["ChatGPT","Gemini"];
  var engOK=engines.filter(function(e){return rows.some(function(r){return r.engine===e;});});
  var prompts=[]; rows.forEach(function(r){if(prompts.indexOf(r.prompt)<0)prompts.push(r.prompt);});
  /* rows don't carry services — join them from the prompt catalog so the
     per-lane ("By service") breakdown has real checks instead of "no checks yet" */
  var promptSvc={};
  ((D.aiPrompts||{}).prompts||[]).forEach(function(p){ promptSvc[p.text]=(p.services&&p.services.length)?p.services:["general"]; });
  var nameDays={}, nameEng={}, nameSvc={}, svcKeys={}, promptChecks={};
  var reg=function(n,id,key,eng,svcs){
    var e=nameDays[n]=nameDays[n]||{days:{},id:id};
    e.days[key]=1;
    var ne=nameEng[n]=nameEng[n]||{};
    (ne[eng]=ne[eng]||{})[key]=1;
    var ns=nameSvc[n]=nameSvc[n]||{};
    (svcs||["general"]).forEach(function(g){ (ns[g]=ns[g]||{})[key]=1; });
  };
  rows.forEach(function(r){
    var key=r.date+"|"+r.engine, hit=r.jd_named==="yes"||r.jd_named==="partial";
    var svcs=(r.services&&r.services.length)?r.services:(promptSvc[r.prompt]||["general"]);
    svcs.forEach(function(g){ (svcKeys[g]=svcKeys[g]||{})[key]=1; });
    (promptChecks[r.prompt]=promptChecks[r.prompt]||{})[key]=1;
    (r.rivals||[]).forEach(function(n){reg(n,RIVAL2ID[n]||null,key,r.engine,svcs);});
    if(hit) reg("JD Meyers Productions","jd-meyers-productions",key,r.engine,svcs);
  });
  var nChecks={}; rows.forEach(function(r){nChecks[r.date+"|"+r.engine]=1;});
  var nDays=Object.keys(nChecks).length;
  var engChecks={};
  engines.forEach(function(e){
    var ds={}; rows.forEach(function(r){if(r.engine===e)ds[r.date]=1;});
    engChecks[e]=Object.keys(ds).length;
  });
  var idDaySets={}, idEng={};
  Object.keys(nameDays).forEach(function(n){
    var e=nameDays[n], id=e.id;
    if(!id) return;
    var s=idDaySets[id]=idDaySets[id]||{};
    Object.keys(e.days).forEach(function(k){s[k]=1;});
    var ie=idEng[id]=idEng[id]||{}, ne=nameEng[n]||{};
    Object.keys(ne).forEach(function(eng){
      var se=ie[eng]=ie[eng]||{};
      Object.keys(ne[eng]).forEach(function(k){se[k]=1;});
    });
  });
  var idDays={};
  Object.keys(idDaySets).forEach(function(id){idDays[id]=Object.keys(idDaySets[id]).length;});
  var idSvc={};
  Object.keys(nameSvc).forEach(function(n){
    var nid=(nameDays[n]||{}).id; if(!nid) return;
    var is=idSvc[nid]=idSvc[nid]||{}, ns=nameSvc[n];
    Object.keys(ns).forEach(function(g){
      var sg=is[g]=is[g]||{};
      Object.keys(ns[g]).forEach(function(k){sg[k]=1;});
    });
  });
  var svcChecks={};
  Object.keys(svcKeys).forEach(function(g){svcChecks[g]=Object.keys(svcKeys[g]).length;});
  var board=B.map(function(b){return {name:b.name,id:b.id,days:idDays[b.id]||0};});
  Object.keys(nameDays).forEach(function(n){
    if(!nameDays[n].id) board.push({name:n,id:null,days:Object.keys(nameDays[n].days).length});
  });
  board.sort(function(a,b){return b.days-a.days||(a.name<b.name?-1:1);});
  /* most-cited group benchmarks */
  var topIds=board.filter(function(t){return t.id&&t.days>0;}).slice(0,10).map(function(t){return t.id;});
  var heavy=B.filter(function(b){return topIds.indexOf(b.id)>=0;});
  var pct=function(rs,f){return rs.length?Math.round(100*rs.filter(f).length/rs.length):0;};
  var rest=B.filter(function(b){return !idDays[b.id];});
  AI={rows:rows,dates:dates,cov:dates.length?dates[0]+" → "+dates[dates.length-1]:"",
    engines:engines,engOK:engOK,prompts:prompts,
    board:board,nDays:nDays,nameEng:nameEng,idEng:idEng,engChecks:engChecks,
    idSvc:idSvc,nameSvc:nameSvc,svcKeys:svcKeys,svcChecks:svcChecks,
    promptChecks:promptChecks,promptCatalog:((D.aiPrompts||{}).prompts||[]),
    webPct:pct(heavy,function(b){return !!b.website;}),
    medYrs:aiMed(heavy.map(function(b){return b.est_year?2026-b.est_year:null;})),
    medRev:aiMed(heavy.map(function(b){return b.review_count;})),
    pricePct:pct(heavy,function(b){return b.hasPrice;}),
    restWebPct:pct(rest,function(b){return !!b.website;}),
    restMedYrs:aiMed(rest.map(function(b){return b.est_year?2026-b.est_year:null;})),
    restMedRev:aiMed(rest.map(function(b){return b.review_count;})),
    restPricePct:pct(rest,function(b){return b.hasPrice;}),
    nNamed:Object.keys(nameDays).length};
}
function aiSvcLabel(g){
  if(g==="general") return "General / pricing";
  for(var i=0;i<SVC_GROUPS.length;i++) if(SVC_GROUPS[i].k===g) return SVC_GROUPS[i].label;
  return g;
}
function aiOwnLane(t){
  var b=t.id?B_BY_ID[t.id]:null; if(!b) return null;
  var groups=svcGroupsOf(b).groups; if(!groups.length) return null;
  var nk={}, ck={}, sets=AI.idSvc[t.id]||{};
  groups.forEach(function(g){
    var sg=sets[g]; if(sg) Object.keys(sg).forEach(function(k){nk[k]=1;});
    var sk=AI.svcKeys[g]; if(sk) Object.keys(sk).forEach(function(k){ck[k]=1;});
  });
  return {groups:groups,named:Object.keys(nk).length,checks:Object.keys(ck).length};
}
function aiVerdict(t){
  var share=AI.nDays?t.days/AI.nDays:0, ps=Math.round(share*100);
  var b=t.id?B_BY_ID[t.id]:null, h="";
  var lane=t.id?aiOwnLane(t):null;
  if(lane&&lane.checks){
    var lp=Math.round(100*lane.named/lane.checks);
    var lab=lane.groups.map(aiSvcLabel).join(" + ").toLowerCase();
    if(lane.named===0) h+="The assistants have not named <b>"+esc(t.name)+"</b> on any "+lab+" prompt so far — 0 of "+lane.checks+" checks in the services it offers. ";
    else h+="<b>"+esc(t.name)+"</b> is named in "+lane.named+" of "+lane.checks+" checks ("+lp+"%) on "+lab+" prompts — the services it actually offers. ";
    h+="Across all "+AI.nDays+" checks market-wide, it was named "+t.days+" time"+(t.days===1?"":"s")+" ("+ps+"%). ";
  }
  else if(t.days===0) h+="The assistants have not named <b>"+esc(t.name)+"</b> in any of the "+AI.nDays+" checks so far. ";
  else if(share>=0.5) h+="<b>"+esc(t.name)+"</b> is one of the market\u2019s most-cited businesses — named in "+t.days+" of "+AI.nDays+" checks ("+ps+"%). ";
  else h+="<b>"+esc(t.name)+"</b> is cited in "+t.days+" of "+AI.nDays+" checks ("+ps+"%) — on the assistants\u2019 radar, but well below the leaders. ";
  if(!b){ h+="It isn\u2019t in our "+B.length+"-business roster, so there\u2019s no profile data to weigh against the most-cited group."; return h; }
  var yrs=b.est_year?2026-b.est_year:null;
  var reasons=[], gaps=[];
  if(b.website) reasons.push("it has its own website ("+AI.webPct+"% of the ten most-cited businesses do)");
  else gaps.push("it has no website of its own ("+AI.webPct+"% of the ten most-cited businesses do)");
  if(yrs!=null&&AI.medYrs!=null){
    if(yrs>=AI.medYrs) reasons.push("it\u2019s an established local name at "+yrs+" years (most-cited median: "+AI.medYrs+")");
    else gaps.push("it\u2019s newer than the most-cited group ("+yrs+" vs a median "+AI.medYrs+" years)");
  }
  if(t.days===0||share<0.5){
    if(gaps.length) h+="The gap lines up with what the most-cited businesses share: "+gaps.join("; ")+". ";
    else if(reasons.length) h+="It actually shares the most-cited footprint ("+reasons.join("; ")+") — so the difference likely comes down to cumulative mentions across the local web, which build slowly. ";
    else h+="Its profile looks much like the most-cited group\u2019s — citation seems to come down to cumulative mentions across the local web, which build slowly. ";
  }else if(reasons.length){
    h+="What it shares with the most-cited group: "+reasons.join("; ")+". ";
  }
  h+="Reviews and published pricing don\u2019t separate cited from uncited businesses in this data, so they don\u2019t explain the difference either way.";
  return h;
}
/* Plain data for the selected business's AI profile. The fleshed-out detail section
   re-renders per selection; bar widths animate via aiAnimateBars() after insert. */
function aiPromptScope(){
  var p=S.aiPrompt; if(!p||!AI.rows) return null;
  var keys={}, engC={};
  AI.rows.forEach(function(r){
    if(r.prompt!==p) return;
    var k=r.date+"|"+r.engine; keys[k]=1;
    engC[r.engine]=engC[r.engine]||{}; engC[r.engine][r.date]=1;
  });
  var n=Object.keys(keys).length;
  var cites={};
  function add(nm,id,eng,key){
    var c=cites[nm]=cites[nm]||{name:nm,id:id,days:{},eng:{}};
    c.days[key]=1; (c.eng[eng]=c.eng[eng]||{})[key]=1;
  }
  AI.rows.forEach(function(r){
    if(r.prompt!==p) return;
    var key=r.date+"|"+r.engine;
    (r.rivals||[]).forEach(function(nm){ add(nm,RIVAL2ID[nm]||null,r.engine,key); });
    if(r.jd_named==="yes"||r.jd_named==="partial") add("JD Meyers Productions","jd-meyers-productions",r.engine,key);
  });
  var board=Object.keys(cites).map(function(nm){
    var c=cites[nm];
    return {name:nm,id:c.id,days:Object.keys(c.days).length,eng:c.eng};
  }).sort(function(a,b){return b.days-a.days||(a.name<b.name?-1:1);});
  var engChecks={}; Object.keys(engC).forEach(function(e){engChecks[e]=Object.keys(engC[e]).length;});
  var cat=(AI.promptCatalog||[]).filter(function(x){return x.text===p;})[0]||null;
  var byName={}; board.forEach(function(t){byName[t.name]=t;});
  return {prompt:p,n:n,board:board,byName:byName,engChecks:engChecks,
    services:cat?(cat.services||[]):[]};
}
function aiDetailData(){
  var sel=S.aiSel, t=sel?AI.board.filter(function(x){return x.name===sel;})[0]:null;
  if(!t) return null;
  var scope=aiPromptScope();
  var sc=scope?scope.byName[t.name]||null:null;
  var b=t.id?B_BY_ID[t.id]:null;
  var yrs=b&&b.est_year?2026-b.est_year:null;
  var sDays=scope?(sc?sc.days:0):t.days;
  var sN=scope?scope.n:AI.nDays;
  var citePct=sN?Math.round(100*sDays/sN):0;
  var eng=AI.engines.map(function(e){
    var ec=scope?(scope.engChecks[e]||0):(AI.engChecks[e]||0);
    var nd, se;
    if(scope){ se=sc&&sc.eng[e]; nd=se?Object.keys(se).length:0; }
    else{ var sets=t.id?(AI.idEng[t.id]||{}):(AI.nameEng[t.name]||{});
      se=sets[e]; nd=se?Object.keys(se).length:0; }
    return {e:e,nd:nd,ec:ec,color:ENG_COLORS[e]||"#6db3f2",
      label:ec===0?(scope?"no checks for this assistant":"unreachable"):nd+" of "+ec,
      pct:ec?(nd>0?Math.max(3,nd/ec*100):0):0};
  });
  var myGrps=b?svcGroupsOf(b).groups:[];
  var svc;
  if(scope){
    svc=SVC_GROUPS.map(function(g){
      var inPrompt=scope.services.indexOf(g.k)>=0;
      return {k:g.k,label:g.label,color:g.color,served:inPrompt,
        label:!inPrompt?"not in this prompt":(scope.n===0?"no checks yet":sDays+" of "+scope.n),
        pct:inPrompt&&scope.n?(sDays>0?Math.max(3,sDays/scope.n*100):0):0};
    });
  }else{
    svc=SVC_GROUPS.map(function(g){
    var served=myGrps.indexOf(g.k)>=0;
    var cc=AI.svcChecks[g.k]||0, sg=t.id&&AI.idSvc[t.id]&&AI.idSvc[t.id][g.k];
    var nd=sg?Object.keys(sg).length:0;
    return {k:g.k,label:g.label,color:g.color,served:served,
      label:!served?"not a lane":(cc===0?"no checks yet":nd+" of "+cc),
      pct:served&&cc?(nd>0?Math.max(3,nd/cc*100):0):0};
    });
  }
  var prof=null;
  if(b){
    var yn=function(v){return v?"Yes":"No";};
    prof=[
      {k:"Own website",v:yn(!!b.website),bm:AI.webPct+"% of most-cited"},
      {k:"Years in business",v:yrs!=null?String(yrs):"—",bm:"median "+(AI.medYrs||"—")},
      {k:"Google reviews",v:b.review_count!=null?String(b.review_count):"—",bm:"median "+(AI.medRev!=null?AI.medRev:"—")},
      {k:"Pricing published",v:yn(!!b.hasPrice),bm:AI.pricePct+"% of most-cited"}
    ];
  }
  var lane=t.id?aiOwnLane(t):null;
  var base=scope?citePct:(lane&&lane.checks?Math.round(100*lane.named/lane.checks):citePct);
  var scopeNote=scope?
    '<b>On this prompt:</b> '+(scope.n===0?"no checks have run yet — it joins the next audit.":
      "named in "+sDays+" of "+scope.n+" ("+citePct+"%)"+(sDays===0?" — not named once on this prompt.":""))+" ":"";
  return {t:t,b:b,
    citeSub:scope?"This prompt · named in":"AI citations · named in",
    meta:b?((b.review_count!=null?b.review_count+" Google reviews":"reviews n/a")+" · "+
      (b.hasPrice?"pricing published":"no pricing shown")+(yrs!=null?" · "+yrs+" yrs in business":""))
      :"Named by the assistants, but not in our "+B.length+"-business roster.",
    cite:{label:scope&&scope.n===0?"no checks yet":sDays+" of "+sN,
      pct:sN?(sDays>0?Math.max(3,sDays/sN*100):0):0,
      color:aiTierColor(citePct)},
    eng:eng, svc:svc, prof:prof, verdict:scopeNote+aiVerdict(t),
    tone:base>=70?"strong":(base>=30?"mixed":"weak")};
}
/* ---------- AI visibility: fleshed-out two-engine explorer (2026-10-02) ----------
   Claude and Perplexity were cut from the tab: neither offers guest access for
   neutral audits, so their legs are permanently blocked. Only ChatGPT + Gemini
   render here; historical rows stay in ai-visibility.json and the log. */

/* Selected business for the AI tab: defaults to the top-ranked business. */
function aiSelT(){
  var board=AI.board;
  if(!board.some(function(t){return t.name===S.aiSel;})) S.aiSel=board.length?board[0].name:null;
  return board.filter(function(x){return x.name===S.aiSel;})[0]||null;
}
function aiEngChecks(e){ return AI.engChecks[e]||0; }
function aiNamedDays(t,e){
  var sets=t.id?(AI.idEng[t.id]||{}):(AI.nameEng[t.name]||{});
  var se=sets[e]; return se?Object.keys(se).length:0;
}
/* latest check for one prompt + engine */
function aiLatestPrompt(prompt,e){
  var best=null;
  AI.rows.forEach(function(r){
    if(r.engine!==e||r.prompt!==prompt) return;
    if(!best||r.date>best.date) best=r;
  });
  return best;
}
function aiNamedInRow(t,r){
  if(t.id==="jd-meyers-productions") return r.jd_named==="yes"||r.jd_named==="partial";
  return (r.rivals||[]).indexOf(t.name)>=0;
}
/* animate [data-bw] bars from 0 to their target width */
function aiAnimateBars(root){
  var bars=root.querySelectorAll("[data-bw]");
  if(REDUCED) return; /* widths are already set inline */
  bars.forEach(function(b){ b.style.width="0%"; });
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    bars.forEach(function(b){ b.style.width=b.getAttribute("data-bw")+"%"; });
  }); });
}
/* two big engine hero cards for the selected business */
function aiEngineCards(t){
  var h='<div class="ai-eng2 stagger">';
  AI.engines.forEach(function(e){
    var c=ENG_COLORS[e]||"#6db3f2", ec=aiEngChecks(e), nd=aiNamedDays(t,e);
    var pct=ec?Math.round(100*nd/ec):0, last="", ones=0;
    AI.rows.forEach(function(r){
      if(r.engine!==e) return;
      if(r.date>last) last=r.date;
      if(t.id==="jd-meyers-productions"&&r.jd_rank===1) ones++;
    });
    h+='<div class="ai-eng-card" style="--eng:'+c+'">'+
      '<div class="ai-eng-top"><span class="ai-dot" style="background:'+c+'"></span><b>'+esc(e)+'</b>'+
      '<span class="ai-eng-last">'+(last?"last audit "+esc(last):"no checks yet")+'</span></div>'+
      '<div class="ai-eng-big" data-count="'+nd+'">0</div>'+
      '<div class="ai-eng-of">of '+ec+' checks · named '+pct+'% of the time</div>'+
      '<div class="ai-eng-bar"><i data-bw="'+Math.max(2,pct)+'" style="width:'+Math.max(2,pct)+'%;background:'+c+'"></i></div>'+
      (t.id==="jd-meyers-productions"?'<div class="ai-eng-ones">Ranked <b>#1</b> in '+ones+' of those checks</div>':"")+
      '</div>';
  });
  return h+'</div>';
}
/* prompt-by-prompt: latest check per assistant for each tested prompt */
function aiPromptList(t){
  var n=AI.promptCatalog.length;
  var h='<div class="ai-sec-t">Prompt by prompt — '+esc(t.name)+'</div>'+
    '<div class="sub" style="margin:-2px 0 10px">Latest check per assistant across the '+n+' tested prompts.</div>'+
    '<div class="ai-plist stagger">';
  AI.promptCatalog.forEach(function(p){
    var lanes=(p.services||[]).map(aiLaneChip).join("");
    h+='<div class="ai-prow"><div class="ai-prow-q"><div class="ai-prow-t">'+esc(p.text)+'</div>'+
      (lanes?'<div class="ai-prow-l">'+lanes+'</div>':"")+'</div>';
    AI.engines.forEach(function(e){
      var r=aiLatestPrompt(p.text,e), c=ENG_COLORS[e]||"#6db3f2", lab, cls;
      if(!r){ lab="no check"; cls="ai-miss"; }
      else if(!aiNamedInRow(t,r)){ lab="not named"; cls="ai-miss"; }
      else if(t.id==="jd-meyers-productions"&&r.jd_rank){ lab="#"+r.jd_rank+" of "+r.of_total; cls=r.jd_rank===1?"ai-win":"ai-hit"; }
      else { lab="named"; cls="ai-hit"; }
      h+='<div class="ai-pill '+cls+'" style="--eng:'+c+'"><span class="ai-pill-e">'+esc(e)+'</span><span class="ai-pill-v">'+esc(lab)+'</span></div>';
    });
    h+='</div>';
  });
  return h+'</div>';
}
/* recent audits: share of each day's prompts naming the business, per assistant */
function aiTrend(t){
  var ud=[]; AI.dates.forEach(function(d){ if(ud.indexOf(d)<0) ud.push(d); });
  ud=ud.slice(-8);
  var h='<div class="ai-sec-t">Recent audits — '+esc(t.name)+'</div>'+
    '<div class="sub" style="margin:-2px 0 10px">Share of each day\u2019s prompts naming this business, per assistant.</div>'+
    '<div class="ai-trend stagger">';
  ud.forEach(function(d){
    h+='<div class="ai-trow"><span class="ai-tdate">'+esc(d)+'</span>';
    AI.engines.forEach(function(e){
      var c=ENG_COLORS[e]||"#6db3f2", n=0, tot=0;
      AI.rows.forEach(function(r){
        if(r.date!==d||r.engine!==e) return;
        tot++; if(aiNamedInRow(t,r)) n++;
      });
      var pct=tot?Math.round(100*n/tot):0;
      h+='<div class="ai-tcell"><span class="ai-pill-e" style="color:'+c+'">'+esc(e)+'</span>'+
        '<div class="ai-tbar"><i data-bw="'+Math.max(2,pct)+'" style="width:'+Math.max(2,pct)+'%;background:'+c+'"></i></div>'+
        '<span class="ai-tv">'+(tot?n+" of "+tot:"—")+'</span></div>';
    });
    h+='</div>';
  });
  return h+'</div>';
}
/* fleshed-out detail for the selected business (reuses aiDetailData) */
/* headline block for the selected business: name + verdict up top (numbers live in the right drawer) */
function aiHead(t){
  var d=aiDetailData();
  if(!d) return '<div class="empty-note">Select a business to see its AI detail.</div>';
  var h='<div class="ai-dsec"><div class="ai-sec-t" style="margin-top:0">'+esc(d.t.name)+'</div>'+
    '<div class="sub" style="margin:-2px 0 12px">'+esc(d.meta)+'</div>';
  if(d.t.id) h+='<div style="margin:0 0 14px"><span class="ai-open" data-open="'+esc(d.t.id)+'">Open profile \u2192</span></div>';
  h+='<div class="ai-verdict tone-'+d.tone+'">'+d.verdict+'</div>';
  return h+'</div>';
}
/* right-drawer hero numbers: mega citation tile + the two engine cards */
function aiHero(t){
  var d=aiDetailData();
  if(!d) return '';
  var h='<div class="ai-mega" style="--tier:'+d.cite.color+'"><div class="ai-mega-v">'+esc(d.cite.label)+'</div>'+
    '<div class="ai-mega-l">'+esc(d.citeSub)+'</div>'+
    '<div class="ai-mega-bar"><i data-bw="'+d.cite.pct+'" style="width:'+d.cite.pct+'%;background:'+d.cite.color+'"></i></div></div>';
  h+=aiEngineCards(t);
  return h;
}
/* lane chip, color-coded by service-lane color */
function aiLaneChip(k){
  var g=null;
  for(var i=0;i<SVC_GROUPS.length;i++) if(SVC_GROUPS[i].k===k) g=SVC_GROUPS[i];
  var label=g?g.label:aiSvcLabel(k), color=g?g.color:"#6b7484";
  return '<span class="ai-lane" style="--lc:'+color+'">'+esc(label)+'</span>';
}
/* everything in the center column: headline, prompt-by-prompt, trend */
function renderAISel(){
  var t=aiSelT();
  if(!t) return '<div class="empty-note">No AI visibility data yet.</div>';
  return aiHead(t)+aiPromptList(t)+aiTrend(t);
}
function renderAIHero(){
  var t=aiSelT();
  if(!t) return '';
  return aiHero(t);
}
function aiLeaderboard(scope){
  var sBoard=scope?scope.board:AI.board, sN=scope?scope.n:AI.nDays;
  var h='<div class="ai-sec-t">'+(scope?"Businesses — ranked for this prompt":"Businesses — ranked by AI citations")+'</div>'+
    '<div class="sub" style="margin:-2px 0 10px">Select a business to inspect it.</div>';
  if(!sBoard.length) h+='<div class="empty-note">No checks have run for this prompt yet — it joins the next audit.</div>';
  h+='<div class="ai-lead stagger">';
  sBoard.forEach(function(t,i){
    var pct=sN?Math.round(t.days/sN*100):0, tier=aiTierColor(pct);
    h+='<div class="ai-row'+(S.aiSel===t.name?" sel":"")+(t.days===0?" ai-zero":"")+'" data-ai="'+esc(t.name)+'">'+
      '<span class="rk">'+(i+1)+'</span>'+
      '<div class="ai-row-bd"><div class="ai-row-top"><span class="nm">'+esc(t.name)+'</span>'+
      '<span class="ct">'+(t.days>0&&sN>0?t.days+' of '+sN+' checks ('+pct+'%)':(sN>0?'not cited':'—'))+'</span></div>'+
      '<div class="bar"><i style="width:'+Math.max(2,pct)+'%;background:'+tier+'"></i></div></div></div>';
  });
  return h+'</div>';
}
function renderAI(){
  if(S.mode==="venues")
    return '<div class="sec"><h3>AI Search</h3><div class="sub">Venue visibility</div>'+
      '<div class="empty-note">No AI visibility data for venues yet.</div></div>';
  computeAI();
  if(!AI.rows.length)
    return '<div class="ai-page"><div class="pg-head"><h2>AI Visibility</h2>'+
      '<div class="empty-note">No AI visibility data yet — the daily audit feeds this tab.</div></div>';
  var h='<div class="ai-page">';
  h+='<div class="pg-head"><h2>AI Visibility</h2><p>How AI assistants answer local search questions, and which businesses they recommend.</p></div>';
  h+='<div class="sub ai-cov">'+esc(AI.cov)+' · '+AI.engines.length+' assistants · '+AI.prompts.length+' prompts tested · '+
    'Claude and Perplexity removed — neither offers guest access for neutral audits.</div>';
  h+='<div class="ai-cols"><aside class="ai-side">';
  h+='<div class="ai-promptbar"><span class="ai-promptbar-l">Prompt</span><select id="aiPromptSel">'+
    '<option value="">All prompts · market-wide</option>'+
    AI.promptCatalog.map(function(p){
      var pc=AI.promptChecks[p.text], cc=pc?Object.keys(pc).length:0;
      return '<option value="'+esc(p.text)+'"'+(S.aiPrompt===p.text?" selected":"")+'>'+
        esc(p.text.length>64?p.text.slice(0,64)+"…":p.text)+
        (cc?" · "+cc+" checks":" · new, no history yet")+'</option>';
    }).join("")+'</select></div>';
  var scope=aiPromptScope();
  if(scope){
    h+='<div class="ai-scope"><span class="ai-scope-t">Prompt: &ldquo;'+esc(scope.prompt)+'&rdquo;</span>'+
      '<span class="ai-scope-x" data-aipx>&times; all prompts</span></div>';
  }
  h+=aiLeaderboard(scope);
  h+='</aside><div class="ai-main">';
  h+='<div id="aiSelWrap">'+renderAISel()+'</div>';
  h+='</div><aside class="ai-hero" id="aiHeroWrap">'+renderAIHero()+'</aside></div>';
  h+='</div>';
  return h;
}

/* ---------- market aggregates ---------- */
function postEvents(){
  var ev=[];
  (D.igActivity||[]).forEach(function(r){
    var n=postCount(r);
    for(var i=0;i<n;i++) ev.push({handle:r.handle,date:r.date});
  });
  return ev;
}
var EVENTS=postEvents();

/* venue-mode Market: venue-only aggregates, never business medians */
function renderVenueMarket(){
  var list=C.slice(), h='<div class="mkt mktx">'+pageHeadHTML("Venue landscape","Wedding and event venues across the North Country: size, location and reach across "+list.length+" venues.");
  var caps=list.filter(function(b){return b.capacity_num!=null;}).map(function(b){return b.capacity_num;}).sort(function(a,b){return a-b;});
  var med=caps.length?caps[Math.floor(caps.length/2)]:null;
  var ig=list.filter(function(b){return b.ig_handle;}).length;
  var counties={}; list.forEach(function(b){ counties[b.county]=1; });
  h+='<div class="statgrid">'+
    '<div class="stat"><div class="v" data-count="'+list.length+'">0</div><div class="l">Venues</div></div>'+
    '<div class="stat"><div class="v" data-count="'+(med||0)+'">0</div><div class="l">Median max guests</div></div>'+
    '<div class="stat"><div class="v">'+ig+'</div><div class="l">On Instagram</div></div>'+
    '<div class="stat"><div class="v">'+Object.keys(counties).length+'</div><div class="l">Counties</div></div></div>';
  h+='<div class="cardgrid">'+marketGlanceHTML(true)+'</div></div>';
  return h;
}

function renderMarket(){
  if(S.mode==="venues") return renderVenueMarket();
  var list=C.slice(), h='<div class="mkt mktx">'+pageHeadHTML("Market landscape",null);

  h+=landscapeHTML(list);
  h+='<div class="cardgrid">'+marketGlanceHTML(true);

  /* post-type mix */
  var types={};
  list.forEach(function(b){ if(b.last_post_type) types[b.last_post_type]=(types[b.last_post_type]||0)+1; });
  var tkeys=Object.keys(types);
  if(tkeys.length){
    var ttot=tkeys.reduce(function(a,k){return a+types[k];},0);
    var tcols={carousel:"#e8b34b",photo:"#6db3f2",reel:"#b48ce8"};
    var circ=2*Math.PI*34, off=0, segs="";
    tkeys.forEach(function(k){ var frac=types[k]/ttot;
      segs+='<circle cx="42" cy="42" r="34" fill="none" stroke="'+(tcols[k]||"#6fd3e7")+'" stroke-width="14" '+
        'stroke-dasharray="'+(frac*circ).toFixed(1)+' '+circ.toFixed(1)+'" stroke-dashoffset="'+(-off*circ).toFixed(1)+'" transform="rotate(-90 42 42)"/>';
      off+=frac; });
    h+='<div class="sec"><h3>Post-type mix</h3><div class="sub">Latest known post format</div><div class="donutwrap">'+
      '<svg class="donut" width="84" height="84" viewBox="0 0 84 84">'+segs+
      '<text x="42" y="47" text-anchor="middle" fill="#ece9e2" font-size="15" font-weight="700">'+ttot+'</text></svg>'+
      '<div class="dlegend">'+tkeys.map(function(k){ return '<div><i style="background:'+(tcols[k]||"#6fd3e7")+'"></i>'+
        esc(k)+' <b>'+types[k]+'</b></div>'; }).join("")+'</div></div></div>';
  }

  /* cadence heatmap: weekday x week from accumulated post events */
  var weeks={}; /* weekStart -> [7 counts] */
  EVENTS.forEach(function(e){
    var d=new Date(e.date+"T12:00:00"); if(isNaN(d)) return;
    var dow=(d.getDay()+6)%7, ws=new Date(d); ws.setDate(ws.getDate()-dow);
    var key=ws.toISOString().slice(0,10);
    weeks[key]=weeks[key]||[0,0,0,0,0,0,0]; weeks[key][dow]++;
  });
  var wkeys=Object.keys(weeks).sort().slice(-10);
  if(wkeys.length){
    var maxc=1; wkeys.forEach(function(k){weeks[k].forEach(function(v){if(v>maxc)maxc=v;});});
    var dows=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    h+='<div class="sec"><h3>Posting cadence</h3><div class="sub">Posts per weekday × week, from accumulated daily data</div>'+
      '<div class="hm" style="--hmcols:'+wkeys.length+'">'+
      dows.map(function(dn,di2){
        return '<div class="hmr"><span class="dow">'+dn+'</span>'+wkeys.map(function(k){
          var v=weeks[k][di2], a=v?0.15+0.85*v/maxc:0;
          return '<span class="cell" style="background:rgba(232,179,75,'+a.toFixed(2)+')" title="'+v+' posts"></span>';
        }).join("")+'</div>';
      }).join("")+
      '<div class="hmr"><span></span>'+wkeys.map(function(k){ var d=new Date(k+"T12:00:00");
        return '<span class="wk">'+(d.getMonth()+1)+'/'+d.getDate()+'</span>'; }).join("")+'</div>'+
      '</div></div>';
  }
  h+="</div></div>";
  return h;
}

/* ---------- sparkline (indexed to 100, padded scale, no overlap) ---------- */
function sparkline(hist, w, h){
  w=w||320; h=h||64;
  if(!hist||hist.length<2) return '<div class="empty-note">Not enough history for a trend yet.</div>';
  var pts=hist.map(function(r){return r.count||0;});
  var dMn=Math.min.apply(null,pts), dMx=Math.max.apply(null,pts);
  var d0=hist[0].date||null, d1=hist[hist.length-1].date||null;
  var X=function(i){return 6+i*(w-12)/(pts.length-1);};
  function albl(yv,txt){ return '<text class="al" x="6" y="'+yv+'">'+esc(txt)+'</text>'; }
  function xlbl(xv,txt,anchor){ return '<text class="sx" x="'+xv+'" y="'+(h-3)+'"'+(anchor?' text-anchor="'+anchor+'"':"")+'>'+esc(txt)+'</text>'; }
  function xaxis(){ return (d0?xlbl(6,dstrShort(d0)):"")+(d1?xlbl(w-6,dstrShort(d1),"end"):""); }
  if(dMx===dMn){
    var Y0=Math.round(h/2);
    return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
      '<line x1="6" y1="'+Y0+'" x2="'+(w-6)+'" y2="'+Y0+'" stroke="#e8b34b" stroke-width="2"/>'+
      '<circle cx="'+(w-6)+'" cy="'+Y0+'" r="3.5" fill="#e8b34b"/>'+albl(12,fmt(dMx)+" (flat)")+xaxis()+'</svg>';
  }
  var pad=(dMx-dMn)*0.15, mn=dMn-pad, mx=dMx+pad;
  var Y=function(v){return h-18-(v-mn)/(mx-mn)*(h-32);};
  var d="M"+pts.map(function(v,i){return X(i).toFixed(1)+" "+Y(v).toFixed(1);}).join(" L");
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
    '<path d="'+d+'" fill="none" stroke="#e8b34b" stroke-width="2"/>'+
    '<circle cx="'+X(pts.length-1).toFixed(1)+'" cy="'+Y(pts[pts.length-1]).toFixed(1)+'" r="3.5" fill="#e8b34b"/>'+
    albl(12,fmt(dMx))+xaxis()+'</svg>';
}

/* ---------- glance-card charts: compact SVGs that fill the card's whitespace ---------- */
function histSVG(labels,counts,colors){
  var w=300,h=78,n=counts.length;
  var max=Math.max.apply(null,counts.concat([1]));
  var gap=8,bw=(w-gap*(n-1))/n,s="";
  for(var i=0;i<n;i++){
    var c=counts[i],bh=Math.round(c/max*(h-24)),x=(gap+bw)*i;
    s+='<rect x="'+x.toFixed(1)+'" y="'+(h-18-bh)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(bh,2)+
      '" rx="3" fill="'+(colors[i]||"#6db3f2")+'"><title>'+esc(labels[i]+": "+c)+"</title></rect>"+
      '<text x="'+(x+bw/2).toFixed(1)+'" y="'+(h-18-bh-4)+'" text-anchor="middle" class="qhnum">'+c+"</text>"+
      '<text x="'+(x+bw/2).toFixed(1)+'" y="'+(h-5)+'" text-anchor="middle" class="qhlab">'+esc(labels[i])+"</text>";
  }
  return '<svg class="qhist" viewBox="0 0 '+w+" "+h+'" preserveAspectRatio="xMidYMid meet" role="img">'+s+"</svg>";
}
function donutSVG(parts){
  var size=88,total=0,i;
  for(i=0;i<parts.length;i++) total+=parts[i].val;
  total=total||1;
  var r=32,C=2*Math.PI*r,off=0,s="";
  for(i=0;i<parts.length;i++){
    var f=parts[i].val/total;
    if(f<=0) continue;
    s+='<circle cx="44" cy="44" r="'+r+'" fill="none" stroke="'+parts[i].color+'" stroke-width="13"'+
      ' stroke-dasharray="'+(f*C).toFixed(1)+" "+C.toFixed(1)+'" stroke-dashoffset="'+(-off*C).toFixed(1)+'"'+
      ' transform="rotate(-90 44 44)"><title>'+esc(parts[i].label+": "+parts[i].val)+"</title></circle>";
    off+=f;
  }
  s+='<text x="44" y="50" text-anchor="middle" class="qdnum">'+total+"</text>";
  var leg=parts.map(function(p){
    return '<div><i style="background:'+p.color+'"></i>'+esc(p.label)+"<b>"+p.val+"</b></div>";
  }).join("");
  return '<div class="qdonutwrap"><svg class="qdonut" viewBox="0 0 '+size+" "+size+'" width="'+size+'" height="'+size+'" role="img">'+s+
    '</svg><div class="qdleg">'+leg+"</div></div>";
}
/* ---------- right panel ---------- */
function rankOf(b,key,desc){
  var arr=C.filter(function(x){return x[key]!=null;}).sort(function(a,c){return desc?c[key]-a[key]:a[key]-c[key];});
  var i=arr.indexOf(b); return i<0?null:{rank:i+1,of:arr.length};
}
/* venue detail panel: capacity, setting, spaces, services — no business comparisons */
function venueProfileHTML(b){
  var ini=b.name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join("");
  var h='<div class="sec"><div class="prof-head"><div class="prof-ava">'+esc(ini)+'</div>'+
    '<div><h2>'+esc(b.name)+'</h2>'+
    '<div class="sub">'+esc(b.town)+locTag(b)+' · Venue</div></div></div>';
  h+='<div class="chiprow">';
  if(b.ig_handle) h+='<span class="chip">@'+esc(b.ig_handle)+'</span>';
  if(b.website) h+='<a class="chip extlink" href="'+esc(/^https?:/.test(b.website)?b.website:"https://"+b.website)+'" target="_blank" rel="noopener">Website ↗</a>';
  h+='</div>';
  var rows="";
  if(b.capacity) rows+='<dt>Capacity</dt><dd><b>'+esc(b.capacity)+'</b></dd>';
  if(b.price_note) rows+='<dt>Pricing note</dt><dd>'+esc(b.price_note)+'</dd>';
  if(b.setting) rows+='<dt>Setting</dt><dd>'+esc(b.setting)+'</dd>';
  if(b.season) rows+='<dt>Season</dt><dd>'+esc(b.season)+'</dd>';
  if(b.spaces&&b.spaces.length) rows+='<dt>Spaces</dt><dd>'+b.spaces.map(function(s){return '<span class="chip">'+esc(s)+'</span>';}).join(" ")+'</dd>';
  if(b.services&&b.services.length) rows+='<dt>Services</dt><dd>'+b.services.map(function(s){return '<span class="chip">'+esc(s)+'</span>';}).join(" ")+'</dd>';
  if(b.coverage&&b.coverage.length) rows+='<dt>Coverage</dt><dd>'+esc(b.coverage.join(" · "))+'</dd>';
  if(b.platform) rows+='<dt>Site built on</dt><dd>'+esc(b.platform)+'</dd>';
  if(b.since) rows+='<dt>Since</dt><dd><b>'+esc(b.since)+'</b></dd>';
  if(b.address) rows+='<dt>Address</dt><dd>'+esc(b.address)+'</dd>';
  if(rows) h+='<h3>Venue</h3><dl class="kv">'+rows+'</dl>';
  if(b.site_note) h+='<div class="sub">'+esc(b.site_note)+'</div>';
  var f=b.followers, igRows="";
  if(b.ig_handle&&(b.followHist.length||f!=null||b.postAge!=null)){
    if(f!=null) igRows+='<dt>Followers</dt><dd><b>'+fmt(f)+'</b></dd>';
    if(b.last_post_date) igRows+='<dt>Last post</dt><dd><b>'+dstr(b.last_post_date)+'</b>'+(b.postAge!=null?' <span style="color:var(--dim)">('+b.postAge+'d ago)</span>':"")+'</dd>';
    if(b.last_post_type) igRows+='<dt>Format</dt><dd>'+esc(b.last_post_type)+'</dd>';
    if(b.last_post_topic) igRows+='<dt>Topic</dt><dd>'+esc(b.last_post_topic)+'</dd>';
  }
  /* latest IG activity row may carry media_count + biography — show only when present */
  var igAct=null;
  (D.igActivity||[]).forEach(function(r){
    if(r.handle!==b.ig_handle) return;
    if(r.media_count==null&&!r.biography) return;
    if(!igAct||String(r.date||"")>String(igAct.date||"")) igAct=r; });
  if(igAct&&igAct.media_count!=null) igRows+='<dt>Posts</dt><dd><b>'+fmt(igAct.media_count)+'</b></dd>';
  if(igRows){ h+='<h3>Instagram</h3><dl class="kv">'+igRows+'</dl>';
    if(igAct&&igAct.biography) h+='<div class="sub" style="margin-top:2px">“'+esc(igAct.biography)+'”</div>'; }
  h+='<div class="sub" style="opacity:.65">Researched Sep 29, 2026</div>';
  h+='</div>';
  return h;
}
function yearsNum(b){ var w=WI[b.id]||{}, Y=new Date().getFullYear();
  if(w.years_in_business!=null) return w.years_in_business;
  if(w.since) return Y-w.since;
  if(b.est_year!=null) return Y-b.est_year;
  return null; }
function marketGlanceHTML(full){
  /* The questions our data answers best, as roomy cards in a no-scroll grid.
     Every bucket row expands inline to list the businesses inside it.
     Collapsed state: each question also records a one-line glance stat for the
     slim sidebar (stat + label), collected in parallel with the cards.
     Bar rule, everywhere: length is relative to the card's biggest bucket.
     Color rule: one blue hue for plain counts; gold/red reserved for status
     (Active/strong, Low/weak/declining); no-data buckets are muted and
     always shown as the last row so the buckets add up to the total. */
  var glances=[];
  function qCardG(q,sub,bars,ci,g,chart){
    glances.push(g||null);
    return qCard(q,sub,bars,ci,chart);
  }
  function qCard(q,sub,bars,ci,chart){
    var showAll=S.qall[ci];
    var visCount=0;
    var rows=bars.map(function(r,oi){
      if(!showAll&&oi>=4&&!r.nodata) return "";
      visCount++;
      var key=ci+":"+oi, open=S.qx[key];
      var attrs=r.id?' data-open="'+r.id+'"':(r.members?' data-qx="'+key+'"':"");
      var h='<div class="qrow'+(r.members?" qx":"")+(r.nodata?" nodata":"")+'"'+attrs+'>'+
        '<span class="qn"'+(r.full?' title="'+esc(r.full)+'"':"")+'>'+esc(r.label)+'</span>'+
        '<span class="qv"'+(r.vcol?' style="color:'+r.vcol+'"':"")+'>'+r.val+"</span>"+
        '<span class="qtrack"><i style="width:'+r.pct+"%;background:"+r.color+'"></i></span></div>';
      if(r.members&&open){
        var ms=r.members.slice(0,12);
        h+='<div class="qmem">'+ms.map(function(m){
          return '<div class="qmemrow" data-open="'+m.id+'" title="'+esc(m.name)+'">'+
            '<span class="qn">'+esc(m.name)+'</span><span class="qv">'+esc(m.sub||"")+"</span></div>";
        }).join("")+(r.members.length>12?'<div class="qmore">+'+(r.members.length-12)+" more in this bucket</div>":"")+"</div>";
      }
      return h;
    }).join("");
    if(bars.length>visCount||showAll){
      rows+='<div class="qmore" data-qall="'+ci+'">'+(showAll?"Show fewer \u25B4":"Show all "+bars.length+" rows \u25B8")+"</div>";
    }
    var QICONS=S.mode==="venues"?
      [["radar","#6db3f2"],["users","#f2d06d"],["camera","#e08bb8"],["tag","#c9a0f2"]]:
      [["pulse","#6fd3e7"],["crown","#c9a0f2"],["dollar","#f2d06d"],["flame","#f5b942"],["clock","#8fd18f"],["shield","#6db3f2"]];
    var qi=QICONS[ci]||["pulse","#6fd3e7"];
    return '<div class="sec qcard"><div class="qcard-top"><span class="qcard-ic" style="color:'+qi[1]+'">'+actIcon(qi[0])+'</span><h3>'+q+'</h3></div><div class="sub">'+sub+'</div><div class="qbars">'+
      rows+"</div>"+(chart?'<div class="qchart">'+chart+"</div>":"")+"</div>";
  }
  /* members: sorted business/venue list backing an expandable bucket row */
  function bmem(arr,sortFn,subFn){
    return arr.slice().sort(sortFn).map(function(x){ return {id:x.id,name:x.name,sub:subFn(x)}; });
  }
  function byName(a,b){ return a.name<b.name?-1:(a.name>b.name?1:0); }
  if(S.mode==="venues"){
    var cards=[];
    /* Q1: where are the venues? */
    var co={},com={};
    V.forEach(function(v){ var c=v.county||"Unknown"; co[c]=(co[c]||0)+1; (com[c]=com[c]||[]).push(v); });
    var ckeys=Object.keys(co).sort(function(a,b){return co[b]-co[a];});
    var cmax=co[ckeys[0]]||1;
    cards.push(qCardG("Locations","All "+V.length+" venues by county",
      ckeys.map(function(k,i){ return {label:k,full:k,val:co[k],pct:Math.round(co[k]/cmax*100),color:"#6db3f2",
        members:bmem(com[k],byName,function(v){return v.town||""})}; }),
      0,
      {stat:(co["St. Lawrence"]||0)+" of "+V.length,label:"venues in St. Lawrence Co",frac:(co["St. Lawrence"]||0)/V.length,color:"#6db3f2"}));
    /* Q2: how big are they? */
    var cb=[["Up to 100",[],"#6db3f2"],["101\u2013200",[],"#6db3f2"],["201\u2013300",[],"#6db3f2"],["300+",[],"#6db3f2"],["Unknown",[],"#3a4353"]];
    V.forEach(function(v){ var c=v.capacity_num,bi=c==null?4:(c<=100?0:(c<=200?1:(c<=300?2:3))); cb[bi][1].push(v); });
    var bmax=Math.max.apply(null,cb.map(function(x){return x[1].length;}))||1;
    cards.push(qCardG("Capacity","Max guest capacity, "+(V.length-cb[4][1].length)+" of "+V.length+" known",
      cb.map(function(x,i){ return {label:x[0]+" guests",val:x[1].length,pct:Math.round(x[1].length/bmax*100),color:x[2],nodata:i===4,
        members:bmem(x[1],function(a,b){return (b.capacity_num||0)-(a.capacity_num||0);},
          function(v){return v.capacity_num?v.capacity_num+" guests":"";})}; }),
      1,
      {stat:(V.length-cb[4][1].length)+" of "+V.length,label:"venues with known capacity",frac:(V.length-cb[4][1].length)/V.length,color:"#6db3f2"},
      '<div class="qchartlab">Distribution</div>'+
      histSVG(["\u2264100","101\u2013200","201\u2013300","300+","Unknown"],
        cb.map(function(x){return x[1].length;}),cb.map(function(x){return x[2];}))));
    /* Q3: are they on Instagram? */
    var ia=[],idm=[],inone=[];
    V.forEach(function(v){ if(!v.ig_handle){ inone.push(v); return; }
      var a=v.last_post_date?Math.floor((Date.now()-new Date(v.last_post_date+"T12:00:00"))/864e5):1e9;
      (a<=90?ia:idm).push(v); });
    var imax=Math.max(ia.length,idm.length,inone.length,1);
    function vsub(v){ return v.ig_handle?"@"+v.ig_handle:""; }
    cards.push(qCardG("Instagram","Verified venue accounts only \u2014 never guessed",
      [{label:"Posted \u226490d",val:ia.length,pct:Math.round(ia.length/imax*100),color:"#e8b34b",vcol:"#e8b34b",members:bmem(ia,byName,vsub)},
       {label:"Last post 90d+ ago",val:idm.length,pct:Math.round(idm.length/imax*100),color:"#e06c6c",vcol:"#e06c6c",members:bmem(idm,byName,vsub)},
       {label:"No verified account",val:inone.length,pct:Math.round(inone.length/imax*100),color:"#3a4353",nodata:true,members:bmem(inone,byName,vsub)}],
      2,
      {stat:inone.length+" of "+V.length,label:"venues with no verified Instagram",frac:(ia.length+idm.length)/V.length,color:"#6db3f2"},
      '<div class="qchartlab">Share of venues</div>'+
      donutSVG([{label:"Active",val:ia.length,color:"#e8b34b"},
        {label:"90d+ ago",val:idm.length,color:"#e06c6c"},
        {label:"No account",val:inone.length,color:"#3a4353"}])));
    /* Q4: what style of venue? */
    var st={},stm={};
    V.forEach(function(v){ var s=v.setting||"Unknown"; st[s]=(st[s]||0)+1; (stm[s]=stm[s]||[]).push(v); });
    var skeys=Object.keys(st).sort(function(a,b){return st[b]-st[a];}).slice(0,7);
    var smax=st[skeys[0]]||1;
    var stop5=skeys.slice(0,5);
    function shortLab(s){ return s.length>8?s.slice(0,8)+"\u2026":s; }
    cards.push(qCardG("Settings","Venue style, as listed",
      skeys.map(function(k,i){ return {label:k,full:k,val:st[k],pct:Math.round(st[k]/smax*100),color:"#6db3f2",
        members:bmem(stm[k],byName,function(v){return v.town||""})}; }),
      3,
      {stat:skeys.length+" styles",label:"across "+V.length+" venues",frac:smax/V.length,color:"#6db3f2"},
      '<div class="qchartlab">Top styles</div>'+
      histSVG(stop5.map(shortLab),stop5.map(function(k){return st[k];}),
        ["#6db3f2","#6db3f2","#6db3f2","#6db3f2","#6db3f2"])));
    var vHero=V.reduce(function(a,v){return a+(v.followers||0);},0);
    return full?cards.join(""):pheadHTML("Market glance","glance")+(S.glanceX?cards.join(""):gheroHTML(fmt(vHero),"total venue followers","combined Instagram audience \u00b7 "+V.length+" North Country venues")+glanceCollapsedHTML(glances));
  }
  var list=C, cards=[];
  /* Q1: who is actually posting? */
  var ab=[["\u226430 days",[],"#e8b34b","#e8b34b"],["31\u201390 days",[],"#6db3f2"],["91\u2013180 days",[],"#6db3f2"],["180+ days",[],"#e06c6c","#e06c6c"],["No post data",[],"#3a4353"]];
  list.forEach(function(b){ var a=b.postAge,bi=a==null?4:(a<=30?0:(a<=90?1:(a<=180?2:3))); ab[bi][1].push(b); });
  var amax=Math.max.apply(null,ab.map(function(x){return x[1].length;}))||1;
  cards.push(qCardG("Posting activity","Last post recency across "+list.length+" businesses",
    ab.map(function(x,i){ return {label:x[0],val:x[1].length,pct:Math.round(x[1].length/amax*100),color:x[2],vcol:x[3]||null,nodata:i===4,
      members:bmem(x[1],
        function(a,b){return (a.postAge==null?1e9:a.postAge)-(b.postAge==null?1e9:b.postAge);},
        function(b){return b.postAge!=null?b.postAge+"d ago":"";})}; }),
    0,
    {stat:ab[0][1].length+" of "+list.length,label:"posted in the last 30 days",frac:ab[0][1].length/list.length,color:"#e8b34b"},
    '<div class="qchartlab">Share of the market</div>'+
    donutSVG([["\u226430d",0],["31\u201390d",1],["91\u2013180d",2],["180+d",3],["No data",4]].map(function(x){
      return {label:x[0],val:ab[x[1]][1].length,color:ab[x[1]][2]}; }))));
  /* Q2: where does the audience sit? */
  var aud=list.filter(function(b){return b.followers!=null;})
    .sort(function(a,b){return b.followers-a.followers;}).slice(0,6);
  var totAud=list.reduce(function(s,b){return s+(b.followers||0);},0);
  var topAud=aud.reduce(function(s,b){return s+b.followers;},0);
  var fmax=aud.length?aud[0].followers:1;
  var abins=[["<500",0,500],["500\u2013999",500,1000],["1k\u20132.5k",1000,2500],["2.5k\u20135k",2500,5000],["5k+",5000,1e12]];
  var acounts=abins.map(function(bn){ var n=0;
    list.forEach(function(b){ if(b.followers!=null&&b.followers>=bn[1]&&b.followers<bn[2]) n++; });
    return n; });
  cards.push(qCardG("Audience","Top 6 by Instagram followers",
    aud.map(function(b,i){ return {label:b.name,full:b.name,val:fmt(b.followers),id:b.id,
      pct:Math.round(b.followers/fmax*100),color:"#6db3f2"}; }),
    1,
    {stat:(totAud?Math.round(topAud/totAud*100):0)+"%",label:"of "+fmt(totAud)+" followers sit in the top 6",frac:totAud?topAud/totAud:0,color:"#6db3f2"},
    '<div class="qchartlab">Follower distribution</div>'+
    histSVG(abins.map(function(bn){return bn[0];}),acounts,["#6db3f2","#6db3f2","#6db3f2","#6db3f2","#6db3f2"])));
  /* Q3: what does it cost? */
  var pb=[["Under $1k",[],"#6db3f2"],["$1k\u2013$2k",[],"#6db3f2"],["$2k\u2013$3.5k",[],"#6db3f2"],
          ["$3.5k+",[],"#6db3f2"],["Not published",[],"#3a4353"]];
  list.forEach(function(b){ var w=b.price.wedding,bi=w==null?4:(w<1000?0:(w<2000?1:(w<3500?2:3))); pb[bi][1].push(b); });
  var pmax=Math.max.apply(null,pb.map(function(x){return x[1].length;}))||1;
  var pub=pb[0][1].length+pb[1][1].length+pb[2][1].length+pb[3][1].length;
  cards.push(qCardG("Cost","Starting wedding price, where published",
    pb.map(function(x,i){ return {label:x[0],val:x[1].length,pct:Math.round(x[1].length/pmax*100),color:x[2],nodata:i===4,
      members:bmem(x[1],function(a,b){return (a.price.wedding||1e9)-(b.price.wedding||1e9);},
        function(b){return b.price.wedding!=null?money(b.price.wedding):"";})}; }),
    2,
    {stat:pub+" of "+list.length,label:"publish a starting wedding price",frac:pub/list.length,color:"#6db3f2"},
    '<div class="qchartlab">Price distribution</div>'+
    histSVG(["<$1k","$1\u20132k","$2\u20133.5k","$3.5k+"],
      [pb[0][1].length,pb[1][1].length,pb[2][1].length,pb[3][1].length],
      ["#6db3f2","#6db3f2","#6db3f2","#6db3f2"])));
  /* Q4: who's gaining followers? */
  var grAll=list.map(function(b){ return pctChange(b,Math.max(0,S.di-30),S.di); }).filter(function(c){return c!=null;});
  var posFrac=grAll.length?grAll.filter(function(c){return c>0;}).length/grAll.length:0;
  var gr=list.map(function(b){ return {b:b,ch:pctChange(b,Math.max(0,S.di-30),S.di)}; })
    .filter(function(x){return x.ch!=null;}).sort(function(a,b){return b.ch-a.ch;}).slice(0,6);
  if(gr.length){
    var gmax=Math.max.apply(null,gr.map(function(x){return Math.abs(x.ch);}).concat([0.1]));
    var gm=gr[0];
    var mhist=[];
    for(var tdi=0;tdi<=S.di;tdi++){ var tot=0;
      list.forEach(function(b){ tot+=followersAt(b,tdi)||0; });
      mhist.push({date:DATES[tdi],count:tot}); }
    cards.push(qCardG("Follower growth","30-day follower change, top movers",
      gr.map(function(x){ return {id:x.b.id,full:x.b.name,label:x.b.name,val:(x.ch>=0?"+":"")+x.ch.toFixed(1)+"%",
        pct:Math.min(100,Math.round(Math.abs(x.ch)/gmax*100)),color:x.ch>=0?"#6db3f2":"#e06c6c",vcol:x.ch>=0?null:"#e06c6c"}; }),
      3,
      {stat:(gm.ch>=0?"+":"")+gm.ch.toFixed(1)+"%",label:"best 30-day mover · "+gm.b.name,frac:posFrac,color:"#6db3f2"},
      '<div class="qchartlab">Total market followers</div>'+sparkline(mhist,300,72)));
  }
  /* Q5: how long have they been around? */
  var yb=[["Under 3 yrs",[],"#6db3f2"],["3\u20135 yrs",[],"#6db3f2"],["6\u201310 yrs",[],"#6db3f2"],
          ["10+ yrs",[],"#6db3f2"],["Unknown",[],"#3a4353"]];
  list.forEach(function(b){ var y=yearsNum(b),bi=y==null?4:(y<3?0:(y<=5?1:(y<=10?2:3))); yb[bi][1].push(b); });
  var ymax=Math.max.apply(null,yb.map(function(x){return x[1].length;}))||1,
      yk=yb[0][1].length+yb[1][1].length+yb[2][1].length+yb[3][1].length;
  cards.push(qCardG("Years in business","Track record, "+yk+" of "+list.length+" known",
    yb.map(function(x,i){ return {label:x[0],val:x[1].length,pct:Math.round(x[1].length/ymax*100),color:x[2],nodata:i===4,
      members:bmem(x[1],function(a,b){return (yearsNum(b)||0)-(yearsNum(a)||0);},
        function(b){var y=yearsNum(b);return y!=null?y+" yrs":"";})}; }),
    4,
    {stat:String(yb[3][1].length),label:"businesses at 10+ years",frac:yb[3][1].length/list.length,color:"#e8b34b"},
    '<div class="qchartlab">Distribution</div>'+
    histSVG(["<3","3\u20135","6\u201310","10+","Unknown"],
      [yb[0][1].length,yb[1][1].length,yb[2][1].length,yb[3][1].length,yb[4][1].length],
      ["#6db3f2","#6db3f2","#6db3f2","#6db3f2","#3a4353"])));
  /* Q6: how solid is each profile? */
  var sb=[["80\u2013100 \u00b7 strong",[],"#e8b34b","#e8b34b"],["60\u201379 \u00b7 decent",[],"#6db3f2"],["40\u201359 \u00b7 thin",[],"#6db3f2"],
          ["Under 40 \u00b7 weak",[],"#e06c6c","#e06c6c"],["Unknown",[],"#3a4353"]];
  list.forEach(function(b){ var s=confOf(b); if(s==null){ sb[4][1].push(b); return; }
    var bi=s>=80?0:(s>=60?1:(s>=40?2:3)); sb[bi][1].push(b); });
  var smax2=Math.max.apply(null,sb.map(function(x){return x[1].length;}))||1;
  cards.push(qCardG("Profile strength","Information confidence across "+list.length+" businesses",
    sb.map(function(x,i){ return {label:x[0],val:x[1].length,pct:Math.round(x[1].length/smax2*100),color:x[2],vcol:x[3]||null,nodata:i===4,
      members:bmem(x[1],function(a,b){return (confOf(b)||0)-(confOf(a)||0);},
        function(b){var s=confOf(b);return s!=null?s+"%":"";})}; }),
    5,
    {stat:sb[0][1].length+" of "+list.length,label:"profiles score 80+ (strong)",frac:sb[0][1].length/list.length,color:"#e8b34b"},
    '<div class="qchartlab">Distribution</div>'+
    histSVG(["80+","60\u201379","40\u201359","<40","Unknown"],
      [sb[0][1].length,sb[1][1].length,sb[2][1].length,sb[3][1].length,sb[4][1].length],
      ["#e8b34b","#6db3f2","#6db3f2","#e06c6c","#3a4353"])));
    var bHero=list.reduce(function(a,b){return a+(b.followers||0);},0);
    return full?cards.join(""):pheadHTML("Market glance","glance")+(S.glanceX?cards.join(""):gheroHTML(fmt(bHero),"total market followers","combined Instagram audience \u00b7 "+list.length+" photo, video & drone businesses")+glanceCollapsedHTML(glances));
}
/* collapsed market glance: one glanceable row per question, each expanding
   the full view on tap */
/* collapsed glance hero: one big number for the whole market */
function gheroHTML(num,label,sub){
  return '<div class="ghero"><div class="ghnum">'+num+'</div>'+
    '<div class="ghlab">'+label+'</div><div class="ghsub">'+sub+"</div></div>";
}
function glanceCollapsedHTML(glances){
  return '<div class="gqrows">'+glances.map(function(g){
    if(!g) return "";
    return '<button class="gqrow" data-gexpand title="'+esc(g.stat+" \u00b7 "+g.label+" \u2014 open the full market view")+'">'+
      '<span class="gqtop"><span class="gqstat">'+esc(g.stat)+'</span>'+
      '<span class="gqlabel" title="'+esc(g.label)+'">'+esc(g.label)+'</span>'+
      '<span class="gqchev">\u25B8</span></span>'+
      (g.frac!=null?'<span class="gqmeter"><i style="width:'+Math.round(Math.max(0,Math.min(1,g.frac))*100)+'%;background:'+(g.color||"#6db3f2")+'"></i></span>':"")+
      "</button>";
  }).join("")+"</div>";
}
function renderRight(){
  var el=$("#rightbody");
  var b=S.sel&&BY_ID[S.sel];
  $("#right").classList.toggle("wide",!S.sel&&S.glanceX);
  $("#right").classList.toggle("expanded",!!(S.expanded&&b));
  $("#right").classList.toggle("hassel",!!b);
  $("#right").classList.toggle("showgfoot",!b&&!S.glanceX);
  document.body.classList.toggle("panelexp",!!(S.expanded&&b));
  el.innerHTML=(window.innerWidth<=900?'<button class="mclose" data-mclose>Close</button>':"")+
    (b?(b.type==="venue"?venueProfileHTML(b)
        :pheadHTML(pheadTitle(b),"profile")+(S.expanded?profileExpandedHTML(b):profileCollapsedHTML(b)))
      :marketGlanceHTML());
  $$("[data-count]",el).forEach(function(n){
    var to=+n.getAttribute("data-count"), mon=n.getAttribute("data-money")==="1";
    if(REDUCED){ n.textContent=mon?money(to):fmt(to); return; }
    var t0=null; (function step(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/800), e=1-Math.pow(1-p,3);
      n.textContent=mon?money(Math.round(to*e)):fmt(Math.round(to*e)); if(p<1)requestAnimationFrame(step); })(performance.now());
  });
  if(window.innerWidth<=900&&S.sel) $("#right").classList.add("open");
}

/* ---------- map ---------- */
var map=null, pinLayer=null, pinById={}, heatLayer=null;
function initMap(){
  map=L.map("map",{zoomControl:false,attributionControl:true}).setView([44.55,-74.9],9);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {maxZoom:19,opacity:0.9,
     attribution:"© OpenStreetMap contributors"}).addTo(map);
  /* heatmap: concentrated where the big, active pages are; dissolves as you zoom in */
  if(L.heatLayer){
    heatLayer=L.heatLayer([],{minOpacity:0.3,maxZoom:12,radius:40,blur:30,
      gradient:{0:"rgba(0,0,0,0)",0.35:"rgba(146,106,32,0.55)",0.65:"#e8b34b",1:"#ffe6a8"}}).addTo(map);
    if(heatLayer._canvas){ heatLayer._canvas.style.transition="opacity .3s ease"; }
  }
  pinLayer=L.layerGroup().addTo(map);
  map.on("zoomend",refreshLabels);
  map.on("zoom",refreshHeat); map.on("zoomend",refreshHeat); map.on("moveend",refreshHeat);
  map.on("moveend",function(){
    if(HIST.busy||HIST.noPush){ HIST.noPush=false; return; } /* programmatic move: skip */
    pushHist(); /* user panned/zoomed: record it */
  });
  map.on("click",function(e){ /* click-away on empty map deselects */
    var t=e.originalEvent&&e.originalEvent.target;
    if(t&&t.closest&&t.closest(".leaflet-marker-icon")) return;
    clearSel();
  });
  renderPins();
}
/* heat intensity: bigger follower counts weigh more, recent activity adds more */
var _maxLogF=1;
/* heat weights always describe the ACTIVE collection — recomputed on mode switch */
function computeModeStats(){
  _maxLogF=1;
  C.forEach(function(b){ var f=b.followers; if(f!=null) _maxLogF=Math.max(_maxLogF,Math.log10(f+1)); });
  engStats();
}
computeModeStats();
function heatWeight(b){
  var f=followersAt(b,S.di), w;
  if(f!=null) w=0.2+0.8*(Math.log10(f+1)/_maxLogF);
  else w=0.12;
  if(b.postAge!=null&&b.postAge<=30) w=Math.min(1,w+0.2);
  return w;
}
/* zoomed out: everyone contributes. Zooming in: the cutoff ramps up, so only the
   biggest business in the current view keeps radiating. All the way in: one hot spot. */
function refreshHeat(){
  if(!heatLayer||!map) return;
  var z=map.getZoom(), bounds=map.getBounds();
  var t=Math.max(0,Math.min(1,(z-9)/3.5)); /* 0 at z<=9, 1 at z>=12.5 */
  var vis=filtered().filter(function(b){ return b._geo&&bounds.contains([b.lat,b.lng]); });
  var maxW=0;
  vis.forEach(function(b){ maxW=Math.max(maxW,heatWeight(b)); });
  var cutoff=maxW*t*0.92, pts=[];
  vis.forEach(function(b){ var w=heatWeight(b); if(w>0&&w>=cutoff) pts.push([b.lat,b.lng,w]); });
  heatLayer.setLatLngs(pts);
  heatLayer.setOptions({radius:Math.max(20,Math.round(58-z*2.6))});
  var op=z<=10?0.9:Math.max(0.5,0.9-(z-10)*0.1);
  if(heatLayer._canvas) heatLayer._canvas.style.opacity=op;
}
/* readable labels: top businesses always labeled, everything labeled when zoomed into a town */
var pinMode="dots";
function labelFor(b){
  var f=followersAt(b,S.di);
  var loc=b.townShort+((b.region==="adjacent"&&b.county)?" · "+b.county+" Co (adjacent)":
    ((b.region==="unconfirmed"||(b.flags||[]).indexOf("location-unverified")>=0)?" · location unverified":""));
  return "<b>"+esc(b.name)+"</b>"+
    '<br><span style="color:#9aa3b2;font-weight:400">'+esc(loc)+"</span>"+
    (f!=null?'<br><span style="color:#9aa3b2;font-weight:400">'+fmt(f)+" followers</span>":"");
}
function rowEl(id){ return $('#leftbody .row[data-open="'+id+'"]'); }
function refreshLabels(){
  if(!map) return;
  var z=map.getZoom(), wantPills=z>=11, pills=pinMode==="pills";
  if(wantPills!==pills){ pinMode=wantPills?"pills":"dots"; renderPins(); return; }
  if(pills) return; /* pill mode declutters itself inside renderPins */
  /* permanent labels: selected first, then top businesses by followers.
     Bind every candidate, then measure the REAL tooltip boxes on screen and
     hide lower-priority labels that would overlap — priority-based declutter
     that stays correct no matter how wide a label renders. */
  var cands=[], seen={};
  function cand(b){ if(b&&b._geo&&!seen[b.id]){ seen[b.id]=1; cands.push(b); } }
  cand(S.sel&&BY_ID[S.sel]);
  C.slice().sort(function(a,b){ return (followersAt(b,S.di)||0)-(followersAt(a,S.di)||0); })
    .slice(0,12).forEach(cand);
  Object.keys(pinById).forEach(function(id){
    var m=pinById[id]; if(!m) return;
    if(seen[id]){ var b=BY_ID[id]; if(!b) return;
      m.unbindTooltip();
      m.bindTooltip(labelFor(b),{permanent:true,direction:"top",offset:[0,-13],
        opacity:.97,className:"mklabel"});
    } else if(m.getTooltip()) m.unbindTooltip();
  });
  var shown=[];
  cands.forEach(function(b){
    var m=pinById[b.id]; if(!m) return;
    var tt=m.getTooltip(), el=tt&&tt.getElement(); if(!el) return;
    var r=el.getBoundingClientRect(), pad=7;
    var clash=shown.some(function(q){
      return r.left<q.right+pad&&r.right>q.left-pad&&r.top<q.bottom+4&&r.bottom>q.top-4; });
    el.style.display=clash?"none":"";
    if(!clash) shown.push({left:r.left,top:r.top,right:r.right,bottom:r.bottom});
  });
}
function postedOn(b,di){ /* did this business post on/around the scrub date? */
  if(!b.last_post_date) return false;
  var dt=DATES[di], d=new Date(dt+"T12:00:00"), p=new Date(b.last_post_date+"T12:00:00");
  if(isNaN(d)||isNaN(p)) return false;
  return Math.abs((d-p)/864e5)<=1.5;
}
function renderPins(){
  if(!map) return;
  pinLayer.clearLayers(); pinById={};
  var list=filtered(), selId=S.sel;
  var geoList=list.filter(function(b){return b._geo&&b.lat!=null;}); /* unmapped: no pin, still in directory/rankings */
  var newIds={};
  list.forEach(function(b){ var first=b.followHist.length?b.followHist[0].date:null;
    if(first&&first>=DATES[Math.max(0,S.di-1)]) newIds[b.id]=1; });
  /* pill-mode label collision: priority order (selected, then followers desc).
     A lower-priority pill whose label box would overlap an already-placed one
     renders as a plain dot instead of a colliding pill. */
  var pillOk={};
  if(pinMode==="pills"){
    var ordered=geoList.slice().sort(function(a,b){
      if(a.id===selId) return -1; if(b.id===selId) return 1;
      return (followersAt(b,S.di)||0)-(followersAt(a,S.di)||0); });
    var boxes=[];
    ordered.forEach(function(b){
      var pt=map.latLngToContainerPoint([b.lat,b.lng]), w=116, hgt=32;
      var box={l:pt.x-w/2,t:pt.y-hgt/2,r:pt.x+w/2,b:pt.y+hgt/2};
      var clash=boxes.some(function(q){
        return box.l<q.r+4&&box.r>q.l-4&&box.t<q.b+3&&box.b>q.t-3; });
      pillOk[b.id]=!clash; if(!clash) boxes.push(box);
    });
  }
  geoList.forEach(function(b){
    var f=followersAt(b,S.di);
    var r=f!=null?Math.max(9,Math.min(26,6+Math.sqrt(f)/6)):9;
    var hollow=b.type==="venue"?false:(f==null||!b.hasPrice);
    var dim=(selId&&b.id!==selId)?" dim":"";
    var live=postedOn(b,S.di)?" live":"";
    var sel=b.id===selId?" sel":"";
    var html, icon;
    if(pinMode==="pills"&&pillOk[b.id]){
      var txt=f!=null?fmt(f):"—";
      html='<div class="zpin'+sel+live+dim+'" style="--lc:'+(LANE_COLOR[b.specialty]||"#888")+'">'+
        "<i></i><span>"+txt+"</span></div>";
      icon=L.divIcon({className:"zwrap",html:html});
    }else{
      var cls="mkpin"+(hollow?" hollow":"")+sel+live+dim;
      html='<div class="'+cls+'" style="width:'+(r*2)+'px;height:'+(r*2)+'px;'+
        (hollow?"":"background:"+LANE_COLOR[b.specialty]+";")+
        (newIds[b.id]?"opacity:0;":"")+'"></div>';
      icon=L.divIcon({className:"",html:html,iconSize:[r*2,r*2],iconAnchor:[r,r]});
    }
    var m=L.marker([b.lat,b.lng],{icon:icon,keyboard:false});
    m.on("click",function(){ select(b.id,{fly:false}); });
    m.on("mouseover",function(){ var rw=rowEl(b.id); if(rw) rw.classList.add("hot");
      var el=m.getElement(); if(el&&el.firstChild) el.firstChild.classList.add("hot"); });
    m.on("mouseout",function(){ var rw=rowEl(b.id); if(rw) rw.classList.remove("hot");
      var el=m.getElement(); if(el&&el.firstChild) el.firstChild.classList.remove("hot"); });
    m.addTo(pinLayer); pinById[b.id]=m;
    if(newIds[b.id]){ /* fade-in for new entrants */
      var el=m.getElement(); if(el){ var d=el.firstChild;
        setTimeout(function(){ d.style.transition="opacity .8s"; d.style.opacity="1"; },60); }
    }
  });
  refreshLabels();
  refreshHeat();
  if(!map._fitDone){ map._fitDone=true;
    var pts=geoList.map(function(b){return [b.lat,b.lng];});
    if(pts.length){ HIST.noPush=true; map.fitBounds(L.latLngBounds(pts).pad(0.12)); } }
}
function flyTo(b){ if(map&&b.lat!=null){ HIST.noPush=true; map.flyTo([b.lat,b.lng],Math.max(map.getZoom(),11),{duration:REDUCED?0:1.1}); } }

/* ---------- rankings: stupid-simple leaderboard (replaces the old bubble field) ---------- */
var RANK_MODES=[{id:"audience",label:"Audience"},{id:"activity",label:"Activity"},{id:"momentum",label:"Momentum"},
  {id:"price",label:"Price"},{id:"reviews",label:"Reviews"},{id:"strength",label:"Profile strength"}];
/* composite profile score: mean of the signals that report */
function ageStr(age){
  if(age==null) return "—";
  if(age<=0) return "posted today";
  if(age===1) return "posted yesterday";
  if(age<30) return "posted "+age+"d ago";
  if(age<60) return "posted ~1mo ago";
  return "posted ~"+Math.round(age/30)+"mo ago";
}
function renderRankings(){
  var el=$("#rankings"); if(!el) return;
  var mode=S.rankMode||"audience", dir=S.rankDir||"desc", list=filtered();
  var rows=list.map(function(b){
    var key,val,frac,cls="",nodata=false;
    if(mode==="audience"){ var f=followersAt(b,S.di);
      key=f==null?-1:f; val=f==null?"\u2014":fmt(f); frac=f==null?0:1; nodata=f==null; }
    else if(mode==="activity"){ var a=b.postAge;
      key=a==null?1e9:a; val=ageStr(a); frac=a==null?0:Math.max(0.05,1-Math.min(a,120)/120); nodata=a==null; }
    else if(mode==="momentum"){ var ch=pctChange(b,Math.max(0,S.di-7),S.di);
      key=ch==null?-1e9:ch; val=ch==null?"\u2014":pctStr(ch); frac=ch==null?0:1;
      cls=ch==null?"":(ch>=0?"up":"dn"); nodata=ch==null; }
    else if(mode==="price"){ var w=b.price?b.price.wedding:null;
      key=w==null?0:w; val=w==null?"\u2014":money(w); frac=w==null?0:1; nodata=w==null; }
    else if(mode==="reviews"){ var ri=reviewInfo(b);
      key=!ri?0:ri.count; val=!ri?"\u2014":(ri.count+(!ri.rating?"":" \u00b7 "+ri.rating+"/5")); frac=!ri?0:1; nodata=!ri; }
    else { var cs=confOf(b); /* one score only: the Digital Footprint score */
      key=cs==null?0:cs; val=cs==null?"\u2014":String(Math.round(cs)); frac=cs==null?0:cs/100; nodata=cs==null; }
    return {b:b,key:key,val:val,frac:frac,cls:cls,nodata:nodata};
  });
  var mx=0; rows.forEach(function(r){ if(r.nodata) return;
    if(mode==="momentum") mx=Math.max(mx,Math.abs(r.key)); else mx=Math.max(mx,mode==="activity"?r.frac:r.key); });
  if(mx<=0) mx=1;
  rows.sort(function(a,b){
    if(a.nodata&&b.nodata) return 0;
    if(a.nodata) return 1;
    if(b.nodata) return -1;
    var d=mode==="activity"?a.key-b.key:b.key-a.key; /* desc = current order */
    return dir==="asc"?-d:d;
  });
  var h='<div class="rk-head"><div><h2>Rankings</h2>'+
    '<div class="rk-sub">Who leads the North Country photo, video & drone market right now · '+esc(dstr(DATES[S.di]))+'</div></div>'+
    '<div class="rk-modes" role="tablist">'+RANK_MODES.map(function(m){
      return '<button data-rank="'+m.id+'" class="'+(m.id===mode?"on":"")+'" role="tab" aria-selected="'+(m.id===mode)+'">'+m.label+'</button>'; }).join("")+
    '<button data-rankdir class="'+(dir==="asc"?"on":"")+'" title="Flip sort direction">'+(dir==="asc"?"&#8593; Low to high":"&#8595; High to low")+'</button></div></div>';
  var hint=mode==="audience"?"Ranked by follower count.":
    mode==="activity"?"Ranked by how recently they posted.":
    mode==="momentum"?"Ranked by follower growth over the last 7 days.":
    mode==="price"?"Ranked by starting wedding price, where published.":
    mode==="reviews"?"Ranked by review count.":
    "Ranked by Digital Footprint score.";
  h+='<div class="rk-hint">'+hint+' Click a row for detail.</div>';
  h+='<div class="rk-list">'+rows.map(function(r,i){
    var b=r.b, w;
    if(mode==="momentum") w=r.frac?Math.max(3,Math.abs(r.key)/mx*100):0;
    else w=r.frac?(mode==="audience"?(r.key/mx*100):r.frac*100):0;
    return '<div class="rk-row'+(b.type==="venue"?" wrap":"")+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'">'+
      '<span class="rk-rank">'+(i+1)+'</span>'+
      '<span class="rk-dot" style="background:'+(LANE_COLOR[b.specialty]||"#888")+'"></span>'+
      '<div class="rk-main"><div class="rk-top"><b>'+esc(b.name)+'</b>'+
      '<span class="rk-val '+r.cls+'">'+esc(r.val)+'</span></div>'+
      '<div class="rk-bar"><i style="width:'+w.toFixed(1)+'%;background:'+(LANE_COLOR[b.specialty]||"#888")+'"></i></div>'+
      '<div class="rk-sub">'+esc(b.townShort)+locTag(b)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+
      (mode!=="activity"?' · <span class="rk-age">'+esc(ageStr(b.postAge))+'</span>':"")+confBadge(b)+'</div></div></div>';
  }).join("")+'</div>';
  el.innerHTML=h;
}

/* ---------- selection: highlight everywhere + fly ---------- */
function clearSel(){
  if(!S.sel) return;
  S.sel=null;
  renderPins(); renderRight();
  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
  if(S.view==="rankings") renderRankings();
  pushHist();
}
function select(id,opts){
  opts=opts||{};
  S.sel=id; S.expanded=false;
  var b=BY_ID[id];
  renderPins(); renderRight();
  if(S.view==="rankings") renderRankings();  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
  var row=$('#leftbody .row[data-open="'+id+'"]'); if(row) row.classList.add("sel");
  if(b&&opts.fly!==false&&S.view==="map") flyTo(b);
  if(b&&window.innerWidth<=900){ $("#right").classList.add("open"); }
  pushHist();
}

/* ============================================================
   NETWORK tab: who follows who on Instagram (verified edges only).
   Ported from site-legacy-20260929/app.js; businesses-only (built from B).
   ============================================================ */
var FG = D.followGraph || {edges:[], status:{}, note:""};
var JD_ACCOUNTS = ["jdmeyersproductions"];

/* restored: shared follow-graph foundation */
function normHandle(h){ return String(h||"").toLowerCase().replace(/^@/,"").trim(); }

var FGN = (function(){
  var nodes=[], byKey={};
  function add(n){ if(!byKey[n.key]){ byKey[n.key]=n; nodes.push(n); } return byKey[n.key]; }
  JD_ACCOUNTS.forEach(function(u){ add({key:"jd:"+u, kind:"jd", label:"@"+u, handle:u}); });
  B.forEach(function(c){ var h=normHandle(c.ig_handle); if(c.ig_handle&&JD_ACCOUNTS.indexOf(h)<0) add({key:"ig:"+h, kind:"comp", label:c.name.replace(/ \(.*\)/,""), comp:c, handle:h}); });
  function keyOf(e){ var h=normHandle(e); return JD_ACCOUNTS.indexOf(h)>=0 ? "jd:"+h : "ig:"+h; }
  var pairs={}, follows={}, followedBy={};
  (FG.edges||[]).forEach(function(e){
    var a=keyOf(e.from), b=keyOf(e.to);
    if(!byKey[a]||!byKey[b]||a===b) return;
    (follows[a]=follows[a]||[]).push(b);
    (followedBy[b]=followedBy[b]||[]).push(a);
    var k=[a,b].sort().join("|");
    var p=pairs[k]||(pairs[k]={a:a,b:b,mutual:false});
    if((follows[b]||[]).indexOf(a)>=0) p.mutual=true;
  });
  nodes.forEach(function(n){
    n.follows=(follows[n.key]||[]).map(function(k){return byKey[k];});
    n.followedBy=(followedBy[n.key]||[]).map(function(k){return byKey[k];});
    n.deg=n.follows.length+n.followedBy.length;
  });
  return {nodes:nodes, byKey:byKey, pairs:Object.keys(pairs).map(function(k){return pairs[k];})};
})();

function netName(n){ return n.kind==="jd" ? "JD Meyers Productions" : n.label; }
function igURL(n){ return n.handle ? "https://www.instagram.com/"+encodeURIComponent(n.handle)+"/" : null; }
var BY_HANDLE = {};
FGN.nodes.forEach(function(n){ if(n.handle) BY_HANDLE[n.handle.toLowerCase()] = n; });
function nodeForHandle(h){ return BY_HANDLE[String(h||"").toLowerCase().replace(/^@/,"")] || null; }
function netChip(n){
  if(!n) return "";
  if(n.kind==="jd") return '<span class="chip"><span class="dot"></span>'+esc(netName(n))+'</span>';
  return '<button class="chip" data-open="'+esc(n.comp.id)+'"><span class="dot"></span>'+esc(n.label)+'</button>';
}

function netDetailHTML(n){
  var s='<div class="nd-head"><b style="font-size:18px">'+esc(netName(n))+'</b>';
  if(n.kind==="comp"){
    s+=' <button class="linkish" data-open="'+esc(n.comp.id)+'">full profile \u2192</button>';
    if(n.comp.town) s+='<span class="muted"> \u2014 '+esc(n.comp.town)+'</span>';
  }
  if(igURL(n)) s+=' <a class="tbtn" href="'+igURL(n)+'" target="_blank" rel="noopener">Instagram \u2197</a>';
  s+='</div>';
  s+='<div class="grid g-2" style="margin-top:10px">';
  s+='<div><p class="hint" style="margin:0 0 6px">Follows ('+n.follows.length+') <span class="muted">\u2014 who they pay attention to</span></p>'
    +'<div class="chips">'+(n.follows.length?n.follows.map(netChip).join(""):'<span class="muted">None verified.</span>')+'</div></div>';
  s+='<div><p class="hint" style="margin:0 0 6px">Followed by ('+n.followedBy.length+') <span class="muted">\u2014 who pays attention to them</span></p>'
    +'<div class="chips">'+(n.followedBy.length?n.followedBy.map(netChip).join(""):'<span class="muted">None verified.</span>')+'</div></div>';
  s+='</div>';
  return s;
}

/* ============================================================
   NETWORK — one page: hub-spoke by connectivity.
   Market anchors at the center, independents at the edge.
   ============================================================ */
function hubTiers(){
  var nodes=FGN.nodes.filter(function(n){ return n.deg>0; })
    .sort(function(a,b){ return b.deg-a.deg || netName(a).localeCompare(netName(b)); });
  var q=Math.max(1,Math.ceil(nodes.length/5));
  return {
    anchors: nodes.slice(0,q),
    strong: nodes.slice(q,q*2),
    connected: nodes.slice(q*2,q*3),
    light: nodes.slice(q*3,q*4),
    independent: nodes.slice(q*4),
    all: nodes
  };
}
function renderNetworkHTML(){
  var h='<div class="page-head"><h1>Network</h1></div>';
  h+='<div class="hub-wrap"><div class="hub-stage">'
    +'<svg class="hubsvg" id="hubSvg" viewBox="0 0 920 920" role="img" aria-label="Businesses arranged by connectivity: most connected at the center"></svg>'
    +'</div></div>';
  var iso=FGN.nodes.filter(function(n){ return n.deg===0; });
  if(iso.length){
    h+='<p class="hint" style="margin-top:14px">No verified links yet \u2014 '+iso.length+' businesses:</p>'
      +'<div class="chips" style="margin-bottom:18px">'+iso.map(netChip).join("")+'</div>';
  }
  return h;
}
/* post-render wiring: hub-spoke interactions */
function networkInit(){
  var T=hubTiers();
  var svg=$("#hubSvg"); if(!svg||!T.all.length) return;
  var NS="http://www.w3.org/2000/svg";
  var cx=460, cy=460;
  var tiers=[
    {key:"anchors",     color:"var(--rel-mutual)",    r:120},
    {key:"strong",      color:"var(--rel-fan)",       r:185},
    {key:"connected",   color:"var(--rel-following)", r:250},
    {key:"light",       color:"var(--rel-mid)",       r:315},
    {key:"independent", color:"var(--rel-none)",      r:380}
  ];
  function el(tag,attrs){ var e=document.createElementNS(NS,tag); for(var k in attrs) e.setAttribute(k,attrs[k]); return e; }
  function title(t){ var x=el("title",{}); x.textContent=t; return x; }
  tiers.forEach(function(t){
    svg.appendChild(el("circle",{cx:cx,cy:cy,r:t.r,fill:"none",stroke:t.color,"stroke-opacity":".3","stroke-width":1.5}));
  });
  var gE=el("g",{}), gL=el("g",{}), gN=el("g",{});
  svg.appendChild(gE); svg.appendChild(gL); svg.appendChild(gN);
  var labInfos=[];
  tiers.forEach(function(t){
    var list=T[t.key], n=list.length;
    list.forEach(function(m,i){
      var ang=-Math.PI/2 + (n? i/n*Math.PI*2 : 0);
      var x=cx+Math.cos(ang)*t.r, y=cy+Math.sin(ang)*t.r;
      var rr=6+Math.min(10,Math.sqrt(m.deg)*1.8);
      var g=el("g",{"class":"hub-node","data-nk":m.key,tabindex:"0",role:"button",
        "aria-label":netName(m)+", "+m.deg+" verified links"});
      var dot=el("circle",{cx:x.toFixed(1),cy:y.toFixed(1),r:rr.toFixed(1),fill:t.color});
      dot.appendChild(title(netName(m)+" \u2014 "+m.deg+" verified links"));
      g.appendChild(dot);
      var cA=Math.cos(ang), sA=Math.sin(ang);
      var anc=cA>0.35?"start":(cA<-0.35?"end":"middle");
      var off=rr+16, lx0=x+cA*off, ly0=y+sA*off;
      var tx=el("text",{x:lx0.toFixed(1), y:ly0.toFixed(1),
        "class":"hub-name","text-anchor":anc,
        dy: anc==="middle" ? (sA>0?"1.1em":"-0.5em") : "0.35em"});
      tx.textContent=netName(m); g.appendChild(tx);
      labInfos.push({tx:tx,lx:lx0,ly:ly0,dx:x,dy:y,dr:rr});
      gN.appendChild(g);
      m._hub={x:x,y:y,g:g};
      g.addEventListener("mouseenter",function(){ if(!pinned) isolate(m); });
      g.addEventListener("mouseleave",function(){ if(!pinned) clearIso(); });
      g.addEventListener("focus",function(){ if(!pinned) isolate(m); });
      g.addEventListener("blur",function(){ if(!pinned) clearIso(); });
      g.addEventListener("click",function(e){ e.stopPropagation(); pinned=m; isolate(m); showDetail(m); });
      g.addEventListener("keydown",function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pinned=m; isolate(m); showDetail(m); } });
    });
  });
  /* label layout: 2D de-collision (label-label + label-dot), clamped to the canvas, then leaders */
  function setL(L){ L.tx.setAttribute("x",L.lx.toFixed(1)); L.tx.setAttribute("y",L.ly.toFixed(1)); }
  function clampL(L){
    var b=L.tx.getBBox(), sx=0, sy=0;
    if(b.x<8) sx=8-b.x; else if(b.x+b.width>912) sx=912-(b.x+b.width);
    if(b.y<10) sy=10-b.y; else if(b.y+b.height>910) sy=910-(b.y+b.height);
    if(sx||sy){ L.lx+=sx; L.ly+=sy; setL(L); return true; }
    return false;
  }
  function ctr(b){ return [b.x+b.width/2, b.y+b.height/2]; }
  labInfos.forEach(function(L){ clampL(L); });
  for(var li=0; li<40; li++){
    var moved=false;
    var boxes=labInfos.map(function(L){ return L.tx.getBBox(); });
    for(var ai=0; ai<labInfos.length; ai++){
      for(var bi=ai+1; bi<labInfos.length; bi++){
        var A=labInfos[ai], B=labInfos[bi];
        var ba=boxes[ai], bb=boxes[bi];
        var ca=ctr(ba), cb=ctr(bb), p=5;
        var ox=(ba.width+bb.width)/2+p-Math.abs(cb[0]-ca[0]);
        var oy=(ba.height+bb.height)/2+p-Math.abs(cb[1]-ca[1]);
        if(ox>0&&oy>0){
          var s;
          if(ox<oy){ s=(ox/2+1)*((cb[0]-ca[0])>=0?1:-1); A.lx-=s; B.lx+=s; }
          else{ s=(oy/2+1)*((cb[1]-ca[1])>=0?1:-1); A.ly-=s; B.ly+=s; }
          setL(A); setL(B); clampL(A); clampL(B);
          boxes[ai]=A.tx.getBBox(); boxes[bi]=B.tx.getBBox();
          moved=true;
        }
      }
      var L0=labInfos[ai];
      for(var di=0; di<labInfos.length; di++){
        if(di===ai) continue;
        var D=labInfos[di], bl=L0.tx.getBBox(), p2=3;
        var dcx=(bl.x+bl.width/2)-D.dx, dcy=(bl.y+bl.height/2)-D.dy;
        var ox2=bl.width/2+D.dr+p2-Math.abs(dcx), oy2=bl.height/2+D.dr+p2-Math.abs(dcy);
        if(ox2>0&&oy2>0){
          if(ox2<oy2) L0.lx+=(ox2+1)*(dcx>=0?1:-1); else L0.ly+=(oy2+1)*(dcy>=0?1:-1);
          setL(L0); clampL(L0); moved=true;
        }
      }
      boxes[ai]=labInfos[ai].tx.getBBox();
    }
    if(!moved) break;
  }
  labInfos.forEach(function(L){ clampL(L); });
  labInfos.forEach(function(L){
    gL.appendChild(el("line",{x1:L.dx.toFixed(1),y1:L.dy.toFixed(1),
      x2:L.lx.toFixed(1),y2:L.ly.toFixed(1),"class":"hub-leader"}));
  });
  var pinned=null;
  function nbrsOf(n){
    var s={}, out=[];
    n.follows.concat(n.followedBy).forEach(function(m){ if(m.deg>0&&!s[m.key]){ s[m.key]=1; out.push(m); } });
    return out;
  }
  function isolate(n){
    clearIso();
    var lit={}; lit[n.key]=1;
    nbrsOf(n).forEach(function(m){
      lit[m.key]=1;
      var b=m._hub; if(!b) return;
      var mut=n.follows.indexOf(m)>=0&&n.followedBy.indexOf(m)>=0;
      gE.appendChild(el("line",{x1:n._hub.x.toFixed(1),y1:n._hub.y.toFixed(1),
        x2:b.x.toFixed(1),y2:b.y.toFixed(1),"class":"hub-spoke"+(mut?" mut":"")}));
    });
    Array.prototype.forEach.call(gN.childNodes,function(g){
      var k=g.getAttribute("data-nk"); if(k&&lit[k]) g.classList.add("lit");
    });
    svg.classList.add("has-spokes");
  }
  function clearIso(){
    gE.innerHTML=""; svg.classList.remove("has-spokes");
    Array.prototype.forEach.call(gN.childNodes,function(g){ g.classList.remove("lit"); });
  }
  function showDetail(n){ /* side panels removed 2026-10-06: names now label every dot */ }
  svg.addEventListener("click",function(){ pinned=null; clearIso(); });
}
/* ---------- left body ---------- */
var PAGE_HEADS={
  today:["Activity",null],
  ai:["AI Visibility","How AI assistants answer local search questions, and which businesses they recommend."],
  data:["Data","Every gathered data point, sortable. Click a column to sort and a row to open the full profile."]};
function pageHTML(){
  if(S.tab==="market") return renderMarket();
  if(S.tab==="ai") return renderAI();
  if(S.tab==="network") return renderNetworkHTML();
  if(S.tab==="today") return '<div class="actdash">'+renderToday()+'</div>';
  var hd=PAGE_HEADS[S.tab];
  return '<div class="datax">'+pageHeadHTML(hd[0],hd[1])+renderData()+'</div>';
}
function animateCounts(el){
  $$("[data-count]",el).forEach(function(n){
    var to=+n.getAttribute("data-count"), mon=n.getAttribute("data-money")==="1";
    if(REDUCED){ n.textContent=mon?money(to):fmt(to); return; }
    var t0=null; (function step(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/800), e=1-Math.pow(1-p,3);
      n.textContent=mon?money(Math.round(to*e)):fmt(Math.round(to*e)); if(p<1)requestAnimationFrame(step); })(performance.now());
  });
}
function renderLeft(){
  feedAutoStop();
  var ex=S.tab==="explore", el=ex?$("#leftbody"):$("#page");
  if(ex){
    el.innerHTML=renderDir();
    var lc=$("#lcount"); if(lc) lc.textContent=filtered().length+" of "+C.length+" "+(S.mode==="venues"?"venues":"businesses");
  }else{
    var sc=el.scrollTop;
    el.innerHTML='<div class="pg pg-'+S.tab+'">'+pageHTML()+'</div>';
    el.scrollTop=sc;
  }
  animateCounts(el);
  if(S.tab==="ai"){ var pg=$("#page"); if(pg) aiAnimateBars(pg); }
  if(S.tab==="network") networkInit();
}
function setTab(t,opts){
  opts=opts||{};
  if(S.tab===t) return;
  S.tab=t;
  if(t!=="explore") setPlaying(false);
  syncChrome(); renderLeft(); renderRight();
  var pg=$("#page"); if(pg) pg.scrollTop=0;
  if(t==="explore"&&map){ setTimeout(function(){ try{ map.invalidateSize(); }catch(e){} },60); }
  if(!opts.noPush) pushHist();
}
function refreshCards(){ if(S.tab==="explore") renderRight(); else renderLeft(); }
/* directory sort options follow the dataset */
function syncSort(){
  var el=$("#fsort"); if(!el) return;
  var biz=S.mode!=="venues";
  var opts=biz?[["audience","Sort: Audience"],["growth","Sort: Growth"],["recent","Sort: Recent post"],["price","Sort: Price"],["name","Sort: A to Z"]]
              :[["capacity","Sort: Capacity"],["name","Sort: A to Z"]];
  var want=biz?"b":"v";
  if(el.getAttribute("data-set")!==want){
    el.innerHTML=opts.map(function(o){ return '<option value="'+o[0]+'">'+o[1]+'</option>'; }).join("");
    el.setAttribute("data-set",want);
  }
  if(!opts.some(function(o){return o[0]===S.sortBy;})) S.sortBy=opts[0][0];
  el.value=S.sortBy;
}

function dshort(ds){ if(!ds) return "—"; var d=new Date(ds+"T12:00:00");
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
/* ---------- per-source freshness header ----------
   Dates come from the data itself: newest ig-YYYY-MM-DD.json in meta.sources,
   last entry dates of webSweepHistory / aiVisibility, meta.generated_at for the
   build. Times are approximate schedule labels ("~"), shown only for sources
   with a completed recent run; anything older than 36h is marked stale. */
function newestIgDate(){
  var ds=((D.meta||{}).sources||[]).map(function(s){
    var m=/^ig-(\d{4}-\d{2}-\d{2})\.json$/.exec(s); return m?m[1]:null; })
    .filter(Boolean).sort();
  return ds.length?ds[ds.length-1]:null;
}
function lastDate(rows,key){
  var best=null;
  rows.forEach(function(r){ if(r[key]&&(best==null||r[key]>best)) best=r[key]; });
  return best;
}
/* wall-clock ET datetime for ds at "HH:MM", returned as a real Date */
function etStamp(ds,hm){
  var y=+ds.slice(0,4), mo=+ds.slice(5,7)-1, da=+ds.slice(8,10);
  var probe=new Date(Date.UTC(y,mo,da,12));
  var etWall=new Date(probe.toLocaleString("en-US",{timeZone:"America/New_York"}));
  var offMin=-Math.round((etWall-probe)/60000); /* minutes to add to ET wall time -> UTC */
  return new Date(Date.UTC(y,mo,da,+hm.slice(0,2),+hm.slice(3,5))+offMin*60000);
}
/* "today" or "tomorrow" for the next daily HH:MM ET occurrence */
function nextET(hm){
  var now=new Date(new Date().toLocaleString("en-US",{timeZone:"America/New_York"}));
  var n=new Date(now); n.setHours(+hm.slice(0,2),+hm.slice(3,5),0,0);
  var today=n>now; if(!today) n.setDate(n.getDate()+1);
  return today?"today":"tomorrow";
}
function buildFresh(){
  var el=$("#glancefoot"); if(!el) return;
  var igD=newestIgDate(), webD=lastDate(D.webSweepHistory||[],"date"),
      aiD=lastDate(D.aiVisibility||[],"date");
  function src(label,d,approx,nom){
    var stale=!d||(Date.now()-etStamp(d,nom)>36*36e5);
    var tip=label+": "+(d?dshort(d)+(approx?" ~"+approx+" ET":""):"no data yet")+
      (stale?" — STALE, over 36h old":"");
    return '<span class="fsrc" title="'+esc(tip)+'"><i class="fdot'+(stale?" stale":"")+'"></i>'+
      '<span class="fl">'+esc(label)+'</span> <b>'+(d?esc(dshort(d)):"—")+'</b>'+
      (d&&approx?'<span class="fap">~'+esc(approx)+'</span>':"")+
      (stale?'<span class="fstale">stale</span>':"")+'</span>';
  }
  var g=(D.meta||{}).generated_at, built="—";
  if(g){ try{ built=new Date(g).toLocaleString("en-US",{timeZone:"America/New_York",
    month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET"; }catch(e){} }
  var bh=((el.dataset&&el.dataset.build)||"").replace(/^build /,"").split(" ")[0];
  el.innerHTML='<div class="frow">'+src("IG",igD,"6:40 AM","06:40")+
    src("Web",webD,"morning","08:00")+src("AI",aiD,"morning","08:00")+"</div>"+
    '<div class="fmeta">Data built '+esc(built)+' · next sync ~7:54 AM ET'+
    (bh?' · <span class="fbuild" title="Deployed build">build '+esc(bh)+"</span>":"")+"</div>";
}

/* ---------- scrubber ---------- */
var timeEl=$("#time");
function renderScrub(){
  timeEl.min=0; timeEl.max=DATES.length-1; timeEl.value=S.di;
  timeEl.style.setProperty("--fill",(DATES.length>1?S.di/(DATES.length-1)*100:100)+"%");
  $("#timelabel").innerHTML=dstr(DATES[S.di])+"<small>"+DATES.length+" daily updates</small>";
  $("#freshnote").textContent="History from "+dstr(DATES[0]);
}
var playTimer=null;
function setPlaying(on){
  S.playing=on;
  $("#playbtn").textContent=on?"⏸":"▶";
  $("#playbtn").setAttribute("aria-label",on?"Pause replay":"Replay daily updates");
  clearInterval(playTimer); playTimer=null;
  if(on){
    if(REDUCED){ toast("Replay is off with reduced motion — drag the slider instead."); setPlaying(false); return; }
    playTimer=setInterval(function(){
      if(S.di>=DATES.length-1){ setPlaying(false); return; }
      S.di++; timeEl.value=S.di; onScrub();
    },900);
  }
}
function onScrub(){
  renderScrub(); renderPins();
  if(S.view==="rankings") renderRankings();
  renderLeft();
  renderRight();
}

/* ---------- view toggle ---------- */
function setView(v){
  S.view=v;
  $$(".viewtoggle button").forEach(function(b){
    var on=b.getAttribute("data-view")===v;
    b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); });
  var rk=v==="rankings";
  $("#rankings").hidden=!rk;
  $("#map").style.visibility=rk?"hidden":"visible";
  if(rk) renderRankings();
  pushHist();
}

/* ---------- businesses / venues hard switch ----------
   Re-points the active collection, clears business-only filters, rebuilds every
   view. Venue stats never touch business medians, rankings, or heat weights. */
function setMode(m){
  if(S.mode===m) return;
  S.mode=m; S.qx={}; S.qall={};
  C=(m==="venues"?V:B); BY_ID=(m==="venues"?V_BY_ID:B_BY_ID);
  S.sel=null; S.lane=""; S.mom=""; S.qx={}; S.qall={}; S.sortBy=(m==="venues"?"capacity":"audience"); syncSort();
  $("#flane").value=""; $("#fmom").value="";
  computeModeStats();
  $$(".modetoggle button").forEach(function(b){ var on=b.getAttribute("data-mode")===m;
    b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); });
  var biz=m!=="venues";
  $("#flane").style.display=biz?"":"none";
  $("#fmom").style.display=biz?"":"none";
  $("#fq").setAttribute("placeholder",biz?"Search businesses…":"Search venues…");
  var bt=$(".brand-text small"); if(bt) bt.textContent=biz?"North Country photo, video & drone market":"North Country venue watch";
  document.title=biz?"Business Pulse · North Country photo, video & drone market":"Business Pulse · North Country venues";
  renderPins();
  var pts=C.filter(function(b){return b._geo&&b.lat!=null;}).map(function(b){return [b.lat,b.lng];});
  if(pts.length&&map){
    HIST.noPush=true; /* programmatic reframe: not a user move */
    /* account for the fixed side panels so edge pins (e.g. Altona) don't sit underneath them */
    if(window.innerWidth>900) map.fitBounds(L.latLngBounds(pts), {paddingTopLeft:L.point(450,90), paddingBottomRight:L.point(380,90)});
    else map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }
  if(S.view==="rankings") renderRankings();
  renderLeft(); renderRight();
  pushHist();
}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
  var pxb=e.target.closest("[data-px]");
  if(pxb){ var k=pxb.getAttribute("data-px");
    if(k==="glance") S.glanceX=!S.glanceX; else S.expanded=!S.expanded;
    renderRight(); pushHist(); return; }
  var apx=e.target.closest("[data-aipx]");
  if(apx){ S.aiPrompt=null; renderLeft(); return; }
  var ar=e.target.closest("[data-ai]");
  if(ar){ S.aiSel=ar.getAttribute("data-ai");
    var sw=$("#aiSelWrap");
    if(sw){ sw.innerHTML=renderAISel(); aiAnimateBars(sw); animateCounts(sw); }
    var hw=$("#aiHeroWrap");
    if(hw){ hw.innerHTML=renderAIHero(); aiAnimateBars(hw); animateCounts(hw); }
    $$(".ai-row").forEach(function(r){ r.classList.toggle("sel",r.getAttribute("data-ai")===S.aiSel); });
    return; }
  var mc=e.target.closest("[data-mclose]");
  if(mc){ $("#right").classList.remove("open"); clearSel(); return; }
  var gx=e.target.closest("[data-gexpand]");
  if(gx){ setTab("market"); return; }
  var sb=e.target.closest("[data-shareby]");
  if(sb){ S.shareBy=sb.getAttribute("data-shareby"); renderLeft(); return; }
  var sg=e.target.closest("[data-gx]");
  if(sg&&!e.target.closest("[data-open]")){ var gk="g:"+sg.getAttribute("data-gx"); S.qx[gk]=!S.qx[gk]; renderLeft(); return; }
  var cf=e.target.closest("[data-cf]");
  if(cf){ var id=cf.getAttribute("data-cf");
    if(id!==S.sel) select(id,{fly:false});
    S.expanded=true; renderRight(); pushHist(); return; }
  var t=e.target.closest("[data-open]");
  if(t){ var oid=t.getAttribute("data-open");
    if(S.tab!=="explore"){ S.tab="explore"; syncChrome(); renderLeft(); }
    select(oid); return; }
  var qx=e.target.closest("[data-qx]");
  if(qx){ var k=qx.getAttribute("data-qx"); S.qx[k]=!S.qx[k]; refreshCards(); return; }
  var qall=e.target.closest("[data-qall]");
  if(qall){ var ka=qall.getAttribute("data-qall"); S.qall[ka]=!S.qall[ka]; refreshCards(); return; }
  var vt=e.target.closest(".viewtoggle button");
  if(vt){ setView(vt.getAttribute("data-view")); return; }
  var mt=e.target.closest(".modetoggle button");
  if(mt){ setMode(mt.getAttribute("data-mode")); return; }
  var rb=e.target.closest("[data-rank]");
  if(rb){ S.rankMode=rb.getAttribute("data-rank"); renderRankings(); pushHist(); return; }
  var rd=e.target.closest("[data-rankdir]");
  if(rd){ S.rankDir=S.rankDir==="asc"?"desc":"asc"; renderRankings(); pushHist(); return; }
  var th=e.target.closest("th[data-dk]");
  if(th){ var k=th.getAttribute("data-dk"), s2=S.dsort||{key:"followers",dir:-1};
    if(s2.key===k) s2.dir=-s2.dir;
    else s2={key:k,dir:/^(followers|ch7|ch30|posts|conf)$/.test(k)?-1:1};
    S.dsort=s2; renderLeft(); pushHist(); return; }
  var cfb=e.target.closest("#clearf");
  if(cfb){ S.q=""; S.lane=""; S.mom=""; S.reg=""; syncChrome(); refreshFiltered(); pushHist(); return; }
  var ff=e.target.closest("[data-feedf]");
  if(ff){ S.feedf=ff.getAttribute("data-feedf");
    var fl=document.getElementById("feedlist");
    if(fl){ fl.innerHTML=feedRowsHTML();
      var ph=ff.closest(".feed-filters");
      if(ph) ph.querySelectorAll(".feed-pill").forEach(function(p){ p.classList.toggle("on",p.getAttribute("data-feedf")===S.feedf); });
    } else renderLeft();
    return; }
  var tb=e.target.closest(".pagenav button");
  if(tb){ setTab(tb.getAttribute("data-tab")); return; }
});
document.addEventListener("change",function(e){
  if(e.target&&e.target.id==="aiPromptSel"){
    S.aiPrompt=e.target.value||null; renderLeft();
  }
});
var fqT=null;
$("#fq").addEventListener("input",function(e){
  clearTimeout(fqT); fqT=setTimeout(function(){ S.q=e.target.value.trim(); refreshFiltered(); pushHist(); },160);
});
var dqT=null;
document.addEventListener("input",function(e){
  if(e.target&&e.target.id==="dq"){
    clearTimeout(dqT); dqT=setTimeout(function(){ S.dq=e.target.value.trim(); renderLeft(); pushHist();
      var n=$("#dq"); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } },160);
  }
});
$("#fsort").addEventListener("change",function(e){ S.sortBy=e.target.value; renderLeft(); });
[["#flane","lane"],["#fmom","mom"],["#freg","reg"]].forEach(function(p){
  $(p[0]).addEventListener("change",function(e){ S[p[1]]=e.target.value; refreshFiltered(); pushHist(); });
});
/* persistent nav buttons were removed from the top bar in the redesign;
   history is still tracked via pushHist for state restore. */
function refreshFiltered(){ renderPins(); if(S.view==="rankings") renderRankings(); renderLeft(); }
timeEl.addEventListener("input",function(){ setPlaying(false); S.di=+timeEl.value; onScrub(); });
$("#playbtn").addEventListener("click",function(){ setPlaying(!S.playing); });

$("#sheetgrab").addEventListener("click",function(){ $("#left").classList.toggle("open"); });
$("#navback").addEventListener("click",goBack);
$("#navfwd").addEventListener("click",goFwd);
$("#navhome").addEventListener("click",goHome);
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){
    if(S.expanded){ S.expanded=false; renderRight(); pushHist(); return; }
    setPlaying(false);
    if(window.innerWidth<=900){ $("#right").classList.remove("open"); }
    else clearSel(); }
  var tg=(document.activeElement&&document.activeElement.tagName)||"";
  if(e.key==="/"&&document.activeElement!==$("#fq")&&tg!=="INPUT"&&tg!=="SELECT"){ e.preventDefault(); if(S.tab!=="explore") setTab("explore"); $("#fq").focus(); }
});
window.addEventListener("resize",function(){ /* rankings view flows with layout */ });

/* ---------- init ---------- */
try{ if(typeof L==="undefined") throw new Error("leaflet");
  initMap();
}catch(err){
  $("#map").innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7484;font-size:13px">Map tiles unavailable — switch to Bubbles view.</div>';
}
/* Airbnb-style hover sync between directory rows and map pins */
$("#leftbody").addEventListener("mouseover",function(e){
  var row=e.target.closest?e.target.closest(".row"):null; if(!row||!row.dataset.open) return;
  var m=pinById[row.dataset.open], el=m&&m.getElement();
  if(el&&el.firstChild) el.firstChild.classList.add("hot");
});
$("#leftbody").addEventListener("mouseout",function(e){
  var row=e.target.closest?e.target.closest(".row"):null; if(!row||!row.dataset.open) return;
  var m=pinById[row.dataset.open], el=m&&m.getElement();
  if(el&&el.firstChild) el.firstChild.classList.remove("hot");
});
syncSort(); renderScrub(); renderLeft(); renderRight(); buildFresh();
pushHist(); /* seed undo history with the initial view */
})();
