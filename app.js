/* Business Pulse command center — full-viewport map/bubble market view.
   Reads window.PULSE_DATA from data/data.js (built by scripts/build_data_js.py). */
(function(){
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
  var from=0,t0=null; function step(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/(ms||900));
    var e=1-Math.pow(1-p,3); el.textContent=fmt(Math.round(to*e)); if(p<1)requestAnimationFrame(step); }
  requestAnimationFrame(step); }

/* ---------- pricing parse (from roster text) ---------- */
function priceFloors(p){
  if(!p) return {wedding:null,session:null};
  var wedding=null, m=/wedding[^$;]*?\$([\d,]+)(\/hr)?/i.exec(p);
  if(m && !m[2]) wedding=+m[1].replace(/,/g,"");
  var re=/\$([\d,]+)/g,x,big=[],small=[];
  while((x=re.exec(p))){ var v=+x[1].replace(/,/g,""),
    before=p.slice(Math.max(0,x.index-18),x.index).toLowerCase(),
    after=p.slice(x.index+x[0].length,x.index+x[0].length+10).toLowerCase();
    if(/deposit/.test(after)||/sports/.test(before)||/^\/((hr|event))/.test(after)) continue;
    (v>=1000?big:small).push(v); }
  if(wedding==null&&big.length) wedding=Math.min.apply(null,big);
  return {wedding:wedding,session:small.length?Math.min.apply(null,small):null};
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
  e.hasPrice=e.price.wedding!=null||e.price.session!=null;
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
  e.price={wedding:null,session:null}; e.hasPrice=false;
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
var MOM_LABEL={gaining:"Gaining",slipping:"Slipping",active:"Active",quiet:"Quiet",dormant:"Dormant"};
var REG_LABEL={slc:"St. Lawrence Co",adjacent:"Nearby counties",unconfirmed:"Unconfirmed"};

/* ---------- state ---------- */
var S={ view:"map", mode:"businesses", tab:"today", rankMode:"audience", di:DATES.length-1, q:"", lane:"", mom:"", reg:"",
        sel:null, playing:false, dsort:null, dq:"", railX:false };

/* ---------- undo / redo history (back-forward) + home ----------
   Every meaningful action pushes a full snapshot; back/forward restore it.
   pushHist is a no-op while a snapshot is being applied (HIST.busy) or while
   a programmatic map move is in flight (HIST.noPush, cleared on moveend). */
var HIST={stack:[],i:-1,busy:false,noPush:false};
function snapState(){
  var c=null; try{ if(map){ var ll=map.getCenter(); c={lat:ll.lat,lng:ll.lng}; } }catch(e){}
  return {view:S.view,mode:S.mode,tab:S.tab,sel:S.sel,q:S.q,lane:S.lane,mom:S.mom,reg:S.reg,
    rankMode:S.rankMode,dq:S.dq,railX:S.railX,dsort:S.dsort?{key:S.dsort.key,dir:S.dsort.dir}:null,
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
  var bt=$(".brand-text small"); if(bt) bt.textContent=biz?"North Country photo market":"North Country venue watch";
  document.title=biz?"Business Pulse · North Country photo market":"Business Pulse · North Country venues";
  /* tabs */
  $$(".tabs button").forEach(function(x){ var on=x.getAttribute("data-tab")===S.tab;
    x.classList.toggle("on",on); x.setAttribute("aria-selected",on?"true":"false"); });
  /* rankings vs map visibility */
  var rk=S.view==="rankings";
  $("#rankings").hidden=!rk;
  $("#map").style.visibility=rk?"hidden":"visible";
}
function applyState(st){
  HIST.busy=true;
  try{
    S.view=st.view; S.mode=st.mode; S.tab=st.tab; S.sel=st.sel;
    S.q=st.q; S.lane=st.lane; S.mom=st.mom; S.reg=st.reg;
    S.rankMode=st.rankMode; S.dq=st.dq; S.railX=!!st.railX;
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
/* home: back to the map, default framing, selection + filters cleared */
function goHome(){
  S.sel=null; S.q=""; S.lane=""; S.mom=""; S.reg=""; S.view="map";
  C=(S.mode==="venues"?V:B); BY_ID=(S.mode==="venues"?V_BY_ID:B_BY_ID);
  computeModeStats();
  syncChrome();
  var pts=C.filter(function(b){return b._geo&&b.lat!=null;}).map(function(b){return [b.lat,b.lng];});
  if(map&&pts.length){ HIST.noPush=true;
    if(window.innerWidth>900) map.fitBounds(L.latLngBounds(pts),{paddingTopLeft:L.point(400,90),paddingBottomRight:L.point(380,90)});
    else map.fitBounds(L.latLngBounds(pts).pad(0.15)); }
  renderPins(); renderLeft(); renderRight();
  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
  pushHist();
  toast("Back home — selection cleared.");
}

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

/* ---------- "what changed since yesterday" ---------- */
function todayChanges(){
  var di=S.di, ydi=Math.max(0,di-1), today=DATES[di], yd=DATES[ydi];
  var out={date:today,prev:yd,newBiz:[],jumps:[],small:[],prices:[],promo:[],quiet:[]};
  C.forEach(function(b){
    var first=b.followHist.length?b.followHist[0].date:null;
    if(first&&first>=yd){ out.newBiz.push(b); return; }
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
  /* gone quiet: last post exactly 30 or 90 days ago */
  var d30=new Date(today+"T12:00:00"), d90=new Date(today+"T12:00:00");
  d30.setDate(d30.getDate()-30); d90.setDate(d90.getDate()-90);
  function iso(d){ return d.toISOString().slice(0,10); }
  C.forEach(function(b){
    if(b.last_post_date===iso(d30)) out.quiet.push({b:b,band:"30 days"});
    else if(b.last_post_date===iso(d90)) out.quiet.push({b:b,band:"90 days"});
  });
  return out;
}

/* ---------- week's highlights: top businesses + why ---------- */
function weekHighlights(){
  var di=S.di, d0=Math.max(0,di-7), list=filtered(), cards=[];
  function norm(h){ return String(h||"").replace(/^@/,"").toLowerCase(); }
  /* activity per handle over the last 7 days */
  var actBy={};
  (D.igActivity||[]).forEach(function(r){
    if(/quiet|no new/i.test(r.activity||"")) return;
    var age=(new Date(DATES[di]+"T12:00:00")-new Date((r.date||"")+"T12:00:00"))/864e5;
    if(isNaN(age)||age<0||age>7) return;
    var h=norm(r.handle); if(!h) return;
    (actBy[h]=actBy[h]||[]).push(r);
  });
  var byHandle={};
  list.forEach(function(b){ var h=norm(b.ig_handle); if(h) byHandle[h]=b; });
  /* fastest growing */
  var growers=list.map(function(b){ return {b:b,ch:pctChange(b,d0,di)}; })
    .filter(function(x){ return x.ch!=null&&x.ch>=3; })
    .sort(function(a,c){ return c.ch-a.ch; });
  if(growers.length){
    var g=growers[0], from=followersAt(g.b,d0), to=followersAt(g.b,di);
    cards.push({k:"Fastest growing",b:g.b,
      why:"+"+g.ch.toFixed(1)+"% followers this week"+(from!=null&&to!=null?" · "+fmt(from)+" → "+fmt(to):"")});
  }
  /* most active */
  var act=list.map(function(b){ var h=norm(b.ig_handle);
      return {b:b,n:h&&actBy[h]?actBy[h].length:0}; })
    .filter(function(x){ return x.n>0; }).sort(function(a,c){ return c.n-a.n; });
  if(act.length){
    cards.push({k:"Most active",b:act[0].b,
      why:act[0].n+(act[0].n===1?" post":" posts")+" in the last 7 days"});
  }
  /* biggest audience */
  var big=list.filter(function(b){ return followersAt(b,di)!=null; })
    .sort(function(a,c){ return followersAt(c,di)-followersAt(a,di); });
  if(big.length){
    cards.push({k:"Biggest audience",b:big[0],
      why:fmt(followersAt(big[0],di))+" followers — largest audience tracked"});
  }
  if(!cards.length) return "";
  return '<div class="sec"><h3>Week\'s highlights</h3><div class="sub">Top of the market · last 7 days</div>'+
    '<div class="hl-grid">'+cards.map(function(c){
      return '<div class="hl-card" data-open="'+c.b.id+'">'+
        '<div class="hl-k">'+esc(c.k)+'</div><div class="hl-n">'+esc(c.b.name)+'</div>'+
        '<div class="hl-w">'+esc(c.why)+'</div></div>';
    }).join("")+"</div></div>";
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
  if(S.mode==="venues") return renderVenueToday();
  var ch=todayChanges(), h=weekHighlights();
  h+='<div class="sec"><h3>What changed</h3><div class="sub">Since '+esc(dstr(ch.prev))+' · '+esc(dstr(ch.date))+'</div>';
  function rows(list,fn){ return '<div class="stagger">'+list.slice(0,8).map(fn).join("")+"</div>"; }
  if(ch.jumps.length){
    h+='<div class="chgcat"><h4>Follower jumps <span class="cnt">'+ch.jumps.length+'</span> <span class="thr">≥3% daily</span></h4>'+
      rows(ch.jumps,function(j){
        var cls=j.ch>=0?"up":"dn";
        return '<div class="row" data-open="'+j.b.id+'"><span class="dot" style="background:'+recencyDot(j.b)+'"></span>'+
          '<div class="nm"><b>'+esc(j.b.name)+'</b><span>'+esc(j.b.townShort)+' · '+fmt(j.from)+' → '+fmt(j.to)+'</span></div>'+
          '<div class="meta"><span class="pct '+cls+'">'+pctStr(j.ch)+'</span></div></div>';})+'</div>';
  }
  if(ch.small.length){
    h+='<div class="chgcat"><h4>Smaller moves <span class="cnt">'+ch.small.length+'</span> <span class="thr">under 3%</span></h4>'+
      rows(ch.small,function(s){
        var cls=s.delta>0?"up":"dn", sign=s.delta>0?"+":"\u2212";
        return '<div class="row" data-open="'+s.b.id+'"><span class="dot" style="background:'+recencyDot(s.b)+'"></span>'+
          '<div class="nm"><b>'+esc(s.b.name)+'</b><span>'+esc(s.b.townShort)+' · '+fmt(s.from)+' → '+fmt(s.to)+'</span></div>'+
          '<div class="meta"><span class="pct '+cls+'">'+sign+fmt(Math.abs(s.delta))+'</span></div></div>';})+'</div>';
  }
  if(ch.newBiz.length){
    h+='<div class="chgcat"><h4>New on the radar <span class="cnt">'+ch.newBiz.length+'</span></h4>'+
      rows(ch.newBiz,function(b){
        return '<div class="row" data-open="'+b.id+'"><span class="dot" style="background:#6db3f2"></span>'+
          '<div class="nm"><b>'+esc(b.name)+'</b><span>'+esc(b.townShort)+' · '+LANE_LABEL[b.specialty]+'</span></div>'+
          '<div class="meta"><span>new</span></div></div>';})+'</div>';
  }
  if(ch.promo.length){
    h+='<div class="chgcat"><h4>Promotional posts <span class="cnt">'+ch.promo.length+'</span></h4>'+
      rows(ch.promo,function(p){
        return '<div class="row" data-open="'+p.b.id+'"><span class="dot" style="background:'+recencyDot(p.b)+'"></span>'+
          '<div class="nm"><b>'+esc(p.b.name)+'</b><span>'+esc(p.note).slice(0,72)+'</span></div>'+
          '<div class="meta"><span>promo</span></div></div>';})+'</div>';
  }
  if(ch.prices.length){
    h+='<div class="chgcat"><h4>Price changes <span class="cnt">'+ch.prices.length+'</span></h4>'+
      rows(ch.prices,function(p){
        return '<div class="row" data-open="'+p.b.id+'"><span class="dot" style="background:'+recencyDot(p.b)+'"></span>'+
          '<div class="nm"><b>'+esc(p.b.name)+'</b><span>'+esc(p.note).slice(0,72)+'</span></div>'+
          '<div class="meta"><span>'+esc(p.run)+'</span></div></div>';})+'</div>';
  }
  if(ch.quiet.length){
    h+='<div class="chgcat"><h4>Gone quiet <span class="cnt">'+ch.quiet.length+'</span></h4>'+
      rows(ch.quiet,function(q){
        return '<div class="row" data-open="'+q.b.id+'"><span class="dot" style="background:#e06c6c"></span>'+
          '<div class="nm"><b>'+esc(q.b.name)+'</b><span>'+esc(q.b.townShort)+'</span></div>'+
          '<div class="meta"><span>silent '+q.band+'</span></div></div>';})+'</div>';
  }
  if(!ch.jumps.length&&!ch.small.length&&!ch.newBiz.length&&!ch.promo.length&&!ch.prices.length&&!ch.quiet.length)
    h+='<div class="empty-note">Nothing moved since yesterday. The market is holding its breath.</div>';
  h+="</div>";
  return h;
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
/* profile meter: color-coded bar, full-width row under the header (never near the X).
   Highlighted as the governing score — every other score is only as reliable as this one. */
function confMeter(b){
  var s=confOf(b); if(s==null) return "";
  var cls=confBand(s);
  return '<button class="cfmeter hero '+cls+'" data-cf="'+b.id+'" aria-label="Information confidence '+s+' percent — tap for the full scorecard">'+
    '<span class="cfl">Information confidence</span>'+
    '<span class="cfbar"><i style="width:'+Math.max(3,s)+'%"></i></span>'+
    '<span class="cfv">'+s+'%</span><span class="cfaq">?</span></button>';
}
/* ---------- business scores: information, activity, momentum, value, reviews ---------- */
function actScore(b){
  var d=b.postAge;
  if(d==null) return {score:null,band:"Unknown",why:"No recent-post date on record."};
  var s=d<=7?100:d<=14?85:d<=30?70:d<=60?50:d<=90?30:d<=180?15:5;
  var band=s>=70?"Active":s>=30?"Cooling":"Dormant";
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
  if(!r) return {score:null,band:"Unknown",why:"No published wedding floor.",r:null};
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
  if(!e||e.rate_pct==null) return {score:null,band:"Unknown",
    why:"No Instagram engagement data — not in the API pull roster or too few recent posts."};
  var s=Math.max(2,Math.min(100,Math.round(e.rate_pct/5*100)));
  var band=s>=60?"Strong":s>=30?"Solid":s>=12?"Quiet":"Faint";
  return {score:s,band:band,e:e,
    why:e.posts+" recent posts · "+e.rate_pct+"% mean engagement · "+e.avg_likes+" avg likes"};
}
/* compact score strip under the profile header: information meter (governing, highlighted)
   + five chips. Clicking any of them opens the full scorecard. */
function scoreStrip(b){
  var a=actScore(b), m=momScore(b), e=engScore(b), v=valScore(b), r=revScore(b);
  function chip(label,val,res){
    var cls=res&&res.score!=null?confBand(res.score):"unk";
    var disp=(res&&res.score!=null)?val:"—";
    var title=res?esc(res.band+" — "+res.why+" Tap for the full scorecard."):"";
    return '<button class="schip '+cls+'" data-cf="'+b.id+'" title="'+title+'">'+
      '<span class="scl">'+label+'</span><span class="scv">'+disp+'</span></button>';
  }
  var mv=m.score!=null?((m.ch30>=0?"+":"")+m.ch30.toFixed(1)+"%"):"";
  var ev=e.score!=null?(e.e.rate_pct+"%"):"";
  var vv=v.score!=null?money(b.price.wedding):"";
  var rv=r.r?fmt(r.r.count):"";
  return confMeter(b)+'<div class="scorerow" role="group" aria-label="Business scores">'+
    chip("Activity",a.band,a)+chip("Momentum",mv,m)+chip("Engagement",ev,e)+chip("Price position",vv,v)+chip("Reviews",rv,r)+'</div>';
}
/* clickable explainer: what the percentage measures, in plain language */
function openScoreDash(id){
  var b=BY_ID[id]||B_BY_ID[id]||V_BY_ID[id]; if(!b||b.type==="venue") return;
  var s=confOf(b); if(s==null) return;
  var cfd=CONF[id], cls=confBand(s);
  var a=actScore(b), m=momScore(b), e=engScore(b), v=valScore(b), r=revScore(b);
  var MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function dstr(ds){ if(!ds) return "—"; var d=new Date(ds+"T12:00:00"); return isNaN(d)?ds:MO[d.getMonth()]+" "+d.getDate(); }
  function pill(res){
    if(res.score==null) return '<span class="dpill unk">'+esc(res.band)+"</span>";
    return '<span class="dpill '+confBand(res.score)+'">'+res.score+" · "+esc(res.band)+"</span>";
  }
  function ext(url,label){
    if(!url) return "";
    var u=/^https?:/i.test(url)?url:"https://"+url;
    return '<a class="dsrc" href="'+esc(u)+'" target="_blank" rel="noopener">'+label+" ↗</a>";
  }
  function gradeBar(score){
    if(score==null) return "";
    return '<div class="dgrade"><i data-w="'+score+'"></i></div>';
  }
  function engBars(en){
    if(!en||!en.bars||!en.bars.length) return "";
    var mx=Math.max.apply(null,en.bars.concat([1]));
    var bars=en.bars.map(function(x,i){
      return '<span class="dbar" style="--d:'+(i*55)+'ms" title="'+x+'% engagement on this post"><i style="height:'+Math.max(5,Math.round(x/mx*100))+'%"></i></span>';
    }).join("");
    return '<div class="dgraph"><div class="dbars">'+bars+'</div>'+
      '<div class="dscale-lbl"><span>oldest</span><span>per-post engagement</span><span>latest</span></div></div>';
  }
  var _wi=0;
  function svgIcon(path){
    return '<svg class="dico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'+
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+"</svg>";
  }
  var WICON={
    activity:svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    momentum:svgIcon('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    engagement:svgIcon('<path d="M12 21C12 21 4 15.5 4 9.5 4 7 6 5 8.5 5c1.7 0 3 .9 3.5 2.3C12.5 5.9 13.8 5 15.5 5 18 5 20 7 20 9.5c0 6-8 11.5-8 11.5z"/>'),
    price:svgIcon('<path d="M3 3h7l11 11-7 7L3 10V3z"/><circle cx="8" cy="8" r="1.5"/>'),
    reviews:svgIcon('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.8-5.4 2.8 1-6.1L3.2 9.5l6.1-.9L12 3z"/>')
  };
  function wdg(key,label,res,measures,graph,detail,link){
    var i=_wi++;
    var bc=res.score!=null?confBand(res.score):"unk";
    var bcol=bc==="hi"?"#6db3f2":bc==="mid"?"#e8b34b":bc==="lo"?"#e06c6c":"#6b7484";
    return '<section class="dwidget" style="--d:'+(i*70)+'ms">'+
      '<div class="dhead"><span class="dico" style="color:'+bcol+'">'+WICON[key]+"</span>"+
      '<span class="dlabel" title="'+esc(measures)+'">'+label+"</span>"+pill(res)+"</div>"+
      (res.score!=null?'<div class="dscore"><span class="dnum" data-n="'+res.score+'">0</span><span class="dmax">/100</span></div>':"")+
      gradeBar(res.score)+(graph||"")+
      (detail?'<div class="dnums">'+detail+"</div>":"")+
      (link?'<div class="dlink">'+link+"</div>":"")+"</section>";
  }
  var igUrl=b.ig_handle?("https://instagram.com/"+b.ig_handle):null;
  /* ---- information factors: compact segmented bar; full breakdown expands upward ---- */
  var parts=(cfd&&cfd.parts)||{};
  var FACTORS=[
    ["website","Website",25,"the business site loads and was actually read","site never loaded in a sweep",b.website,"site"],
    ["prices","Prices",15,"a starting price was parsed from their published pricing","no starting price found",b.pricing_url,"pricing"],
    ["services","Services",15,"their service list is on record","no service list found",null,null],
    ["ig","Instagram",15,"the handle resolves to a tracked profile","no tracked Instagram handle",igUrl,"profile"],
    ["location","Location",10,"town/county corroborated beyond the roster","location not corroborated",null,null],
    ["years","History",10,"years in business known","years in business unknown",null,null],
    ["corroboration","Third source",10,"at least one source beyond their own site","no outside source found yet",b.review_url,"listing"]
  ];
  var verified=0, frows="", segs="";
  FACTORS.forEach(function(f){
    var er=parts[f[0]]||0, got=er>0; if(got) verified++;
    segs+='<span class="dcseg" style="flex:'+f[2]+' 1 0%" title="'+f[1]+": "+er+"/"+f[2]+'"><i data-w="'+Math.round(100*er/f[2])+'"></i></span>';
    var fmark=got?'<svg class="dfmi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>'
      :'<svg class="dfmi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12h7"/></svg>';
    frows+='<div class="dfactor'+(got?"":" missed")+'"><span class="dfm '+(got?"ok":"no")+'">'+fmark+"</span>"+
      '<div class="dffull"><div class="dfrow"><b>'+f[1]+'</b><span class="dfpts">'+er+"/"+f[2]+"</span>"+
      (got&&f[5]?ext(f[5],f[6]):"")+"</div>"+
      (got?'<div class="dfbar"><i style="width:'+Math.round(100*er/f[2])+'%"></i></div>':"")+
      "<span>"+(got?f[3]:"Not verified — "+f[4])+"</span></div></div>";
  });
  var conflictRow=(cfd&&cfd.conflict)?'<div class="dfactor full missed"><span class="dfm no"><svg class="dfmi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.8" r="0.4" fill="currentColor"/></svg></span><div class="dffull"><div class="dfrow"><b>Price conflict · −20</b></div><span>'+
    cfd.conflict.values.map(function(x){ return esc(x.label)+": "+esc(x.text); }).join(" vs ")+
    " — flagged for human review</span></div></div>":"";
  /* ---- activity: recency bracket scale ---- */
  var aBrk=a.days!=null?(a.days<=7?"≤ 7":a.days<=14?"≤ 14":a.days<=30?"≤ 30":a.days<=60?"≤ 60":a.days<=90?"≤ 90":"180+")+" days":null;
  var aGraph="", aDetail=esc(a.why);
  if(a.days!=null){
    aGraph='<div class="dgraph"><div class="dscale"><em class="dmark" style="left:'+Math.min(100,a.days/180*100).toFixed(1)+'%"></em></div>'+
      '<div class="dscale-lbl"><span>today</span><span>90d</span><span>180d+</span></div></div>';
    aDetail="Last post "+dstr(b.last_post_date)+" ("+a.days+(a.days===1?" day":" days")+" ago) · bracket "+aBrk+" → "+a.score+" pts";
  }
  /* ---- momentum: real follower line graph + 7d/30d sub-scores ---- */
  var mGraph="", mDetail=esc(m.why);
  (function(){
    var cut=new Date(DATES[S.di]+"T12:00:00"); cut.setDate(cut.getDate()-90);
    var cutS=cut.getFullYear()+"-"+("0"+(cut.getMonth()+1)).slice(-2)+"-"+("0"+cut.getDate()).slice(-2);
    var hist=(b.followHist||[]).filter(function(r){ return r.date>=cutS; });
    if(hist.length>1) mGraph='<div class="dgraph">'+sparkline(hist,300,96)+"</div>";
  })();
  if(m.ch30!=null){
    var s7=Math.max(5,Math.min(100,Math.round(50+(m.ch7||0)*8)));
    var f0=followersAt(b,Math.max(0,S.di-30)), f1=followersAt(b,S.di);
    mDetail="7-day "+(m.ch7>=0?"+":"")+m.ch7.toFixed(1)+"% → "+s7+" pts · 30-day "+(m.ch30>=0?"+":"")+m.ch30.toFixed(1)+"% → "+m.score+" pts"+
      (f0!=null&&f1!=null?" · "+fmt(f0)+" → "+fmt(f1)+" followers":"");
  }
  /* ---- engagement: per-post bars + averages ---- */
  var eGraph=engBars(e.e), eDetail=esc(e.why);
  /* ---- price position: market scale with median tick + rank granularity ---- */
  var pGraph="", pDetail=esc(v.why);
  if(v.r){
    var arr=_wedArr, mn=arr[0].price.wedding, mx=arr[arr.length-1].price.wedding, sp=Math.max(1,mx-mn);
    pGraph='<div class="dgraph"><div class="dscale"><i class="dmed" style="left:'+((v.r.med-mn)/sp*100).toFixed(1)+'%"></i>'+
      '<em class="dmark" style="left:'+((b.price.wedding-mn)/sp*100).toFixed(1)+'%"></em></div>'+
      '<div class="dscale-lbl"><span>'+money(mn)+"</span><span>median "+money(v.r.med)+"</span><span>"+money(mx)+"</span></div></div>";
    pDetail="Floor "+money(b.price.wedding)+" · #"+v.r.rank+" of "+v.r.n+" tracked · cheaper than "+v.r.pct+"% of the market";
  }
  /* ---- reviews: log-scale position + live listing link ---- */
  var rGraph="", rDetail=esc(r.why);
  if(r.r){
    rGraph='<div class="dgraph"><div class="dscale"><em class="dmark" style="left:'+(100*Math.log10(1+r.r.count)/Math.log10(201)).toFixed(1)+'%"></em></div>'+
      '<div class="dscale-lbl"><span>0</span><span>log scale · cap 200</span><span>200</span></div></div>';
    rDetail=r.r.count+" "+r.r.src+" reviews"+(r.r.rating?" · "+r.r.rating+" / 5":"")+" → "+r.score+" pts";
  }
  var h='<div class="mback" id="cfback"><div class="modal fulldash" role="dialog" aria-label="Scorecard">'+
    '<div class="dash-head"><div><div class="dtitle">Scorecard</div>'+
    '<div class="dsub">'+esc(b.name)+(b.services&&b.services.length?" · "+esc(b.services.slice(0,3).join(" · ")):"")+"</div></div>"+
    '<button class="dbtn-x" id="cfx" aria-label="Close scorecard">✕</button></div>'+
    '<div class="dash-body">'+
    '<div class="dash-widgets">'+
    wdg("activity","Activity",a,"How recently they posted — an active competitor is a different animal than a dormant one.",aGraph,aDetail,ext(igUrl,"Instagram"))+
    wdg("momentum","Momentum",m,"Week-to-month follower movement — who is gaining and who is slipping.",mGraph,mDetail,ext(igUrl,"Instagram"))+
    wdg("engagement","Engagement",e,"Whether their audience actually responds — mean likes and comments per post.",eGraph,eDetail,ext(igUrl,"Instagram"))+
    wdg("price","Price position",v,"Where their wedding floor sits against the market, by published prices.",pGraph,pDetail,ext(b.pricing_url,"Pricing"))+
    wdg("reviews","Reviews",r,"Social proof — review counts and ratings from live listings.",rGraph,rDetail,ext(b.review_url,"Live listing"))+
    "</div>"+
    '<section class="dconf2" aria-label="Information confidence">'+
    '<div class="dcs-head"><span class="dcl">Information confidence</span>'+
    '<span class="dcnum '+cls+'">'+s+'%</span>'+
    '<span class="dcsegs">'+segs+"</span>"+
    '<span class="dcver">'+verified+" of "+FACTORS.length+" verified</span></div>"+
    '<div class="dfactors">'+frows+conflictRow+"</div>"+
    '<p class="dnote">The governing score — every score above is only as reliable as the data behind it. Tap a source link to open the confirming page. A rotating deep-dive pass re-researches every business weekly to raise these scores.</p>'+
    "</section>"+
    "</div></div></div>";
  document.body.insertAdjacentHTML("beforeend",h);
  requestAnimationFrame(function(){
    var root=document.getElementById("cfback"); if(!root) return;
    root.querySelectorAll(".dgrade i").forEach(function(el){ el.style.width=el.getAttribute("data-w")+"%"; });
    root.querySelectorAll(".dcseg i").forEach(function(el){ el.style.width=el.getAttribute("data-w")+"%"; });
    root.querySelectorAll(".dnum").forEach(function(el){
      var target=+el.getAttribute("data-n"), t0=null;
      function tick(t){ if(t0==null) t0=t; var p=Math.min(1,(t-t0)/850), ez=1-Math.pow(1-p,3);
        el.textContent=Math.round(target*ez); if(p<1) requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    });
  });
  function close(){ var m=$("#cfback"); if(m) m.remove(); document.removeEventListener("keydown",onKey); }
  function onKey(e){ if(e.key==="Escape") close(); }
  document.addEventListener("keydown",onKey);
  $("#cfback").addEventListener("click",function(ev){
    if(ev.target.id==="cfback"||ev.target.id==="cfx") close();
  });
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
    '<div class="meta"><b>'+fmt(f)+'</b><span>'+(b.hasPrice?money(b.price.wedding||b.price.session):"price n/a")+
    ' · <span class="pct '+pcls+'">'+pctStr(ch)+'</span></span>'+confBadge(b)+'</div></div>';
}
/* explicit county labeling: adjacent-county businesses are named as such everywhere */
function locTag(b){
  if(b.region==="adjacent"&&b.county) return ' <span class="adj">· '+esc(b.county)+' Co (adjacent)</span>';
  if(b.region==="unconfirmed"||(b.flags||[]).indexOf("location-unverified")>=0) return ' <span class="unv">· location unverified</span>';
  return "";
}
function renderDir(){
  var list=filtered().slice().sort(function(a,b){return (b.followers||0)-(a.followers||0);});
  var noun=S.mode==="venues"?"venues":"businesses";
  var h='<div class="sec"><h3>Directory</h3><div class="sub">'+list.length+' of '+C.length+' '+noun+'</div>';
  if(!list.length) return h+'<div class="empty-note">No '+noun+' match these filters.</div></div>';
  h+='<div class="stagger">'+list.map(dirRow).join("")+"</div></div>";
  return h;
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
var DCOLS=[
  ["name","Name","str"],["town","Town/County","str"],["followers","IG followers","num"],
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
  var h='<div class="sec"><h3>Data</h3><div class="sub">Every gathered data point · secondary view · click a column header to sort · click a row to open the profile</div>'+
    '<input id="dq" class="dfilter" type="search" placeholder="Filter rows…" value="'+esc(S.dq||"")+'" aria-label="Filter data rows">';
  h+='<div class="dsub">Businesses · '+rows.length+'</div><div class="dtable-wrap"><table class="dtable"><thead><tr>'+
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
function renderAI(){
  if(S.mode==="venues")
    return '<div class="sec"><h3>AI Search</h3><div class="sub">Venue visibility</div>'+
      '<div class="empty-note">No AI visibility data for venues yet.</div></div>';
  var rows=(D.aiVisibility||[]).filter(function(r){ return r.jd_named!=="unreachable"; });
  var h='<div class="sec"><h3>AI Search</h3><div class="sub">Are the AI assistants recommending you?</div>';
  if(!rows.length)
    return h+'<div class="empty-note">No AI visibility data yet — the daily audit feeds this tab.</div></div>';
  var dates=rows.map(function(r){return r.date;}).sort();
  var cov=dates[0]+" → "+dates[dates.length-1];
  var named=rows.filter(function(r){return r.jd_named==="yes"||r.jd_named==="partial";}).length;
  var rate=Math.round(named/rows.length*100);
  var ranked=rows.filter(function(r){return r.jd_rank!=null;});
  var avgRank=ranked.length?(ranked.reduce(function(s,r){return s+r.jd_rank;},0)/ranked.length):null;
  h+='<div class="statgrid">'+
    '<div class="stat"><div class="v">'+rate+'%</div><div class="l">Mention rate</div></div>'+
    '<div class="stat"><div class="v">'+(avgRank!=null?"#"+avgRank.toFixed(1):"—")+'</div><div class="l">Avg rank when named</div></div>'+
    '<div class="stat"><div class="v">'+rows.length+'</div><div class="l">Checks run</div></div>'+
  '</div>';
  h+='<div class="sub" style="margin:10px 0 0">'+esc(cov)+' · '+
    new Set(rows.map(function(r){return r.engine;})).size+' engines · '+
    new Set(rows.map(function(r){return r.prompt;})).size+' prompts</div>';
  /* per-engine bars */
  var eng={};
  rows.forEach(function(r){
    (eng[r.engine]=eng[r.engine]||{n:0,hit:0});
    eng[r.engine].n++; if(r.jd_named==="yes"||r.jd_named==="partial") eng[r.engine].hit++;
  });
  h+='<div class="sec"><h3>By assistant</h3><div class="stagger">'+
    Object.keys(eng).sort().map(function(e){
      var p=Math.round(eng[e].hit/eng[e].n*100);
      return '<div class="lb-row"><span class="lb-nm">'+esc(e)+'</span>'+
        '<span class="lb-v">'+p+'%</span>'+
        '<span class="lb-bar"><i style="width:'+Math.max(4,p)+'%"></i></span></div>';
    }).join("")+"</div></div>";
  /* per-prompt rows */
  var pr={};
  rows.forEach(function(r){
    (pr[r.prompt]=pr[r.prompt]||{n:0,hit:0,best:null});
    pr[r.prompt].n++; if(r.jd_named==="yes"||r.jd_named==="partial") pr[r.prompt].hit++;
    if(r.jd_rank!=null&&(pr[r.prompt].best==null||r.jd_rank<pr[r.prompt].best)) pr[r.prompt].best=r.jd_rank;
  });
  h+='<div class="sec"><h3>By search prompt</h3><div class="stagger">'+
    Object.keys(pr).map(function(p){
      var r=Math.round(pr[p].hit/pr[p].n*100);
      return '<div class="ai-prow"><div class="nm"><b>'+esc(p)+'</b>'+
        '<span>'+r+'% mentioned'+(pr[p].best!=null?' · best rank #'+pr[p].best:" · never ranked")+'</span></div>'+
        '<div class="ai-pbar"><i style="width:'+Math.max(3,r)+'%"></i></div></div>';
    }).join("")+"</div></div>";
  /* rivals named most */
  var rc={};
  rows.forEach(function(r){ (r.rivals||[]).forEach(function(n){ rc[n]=(rc[n]||0)+1; }); });
  var topR=Object.keys(rc).sort(function(a,b){return rc[b]-rc[a];}).slice(0,6);
  if(topR.length){
    h+='<div class="sec"><h3>Rivals the AIs name most</h3><div class="stagger">'+
      topR.map(function(n){
        return '<div class="lb-row"><span class="lb-nm">'+esc(n)+'</span>'+
          '<span class="lb-v">'+rc[n]+'×</span>'+
          '<span class="lb-bar"><i style="width:'+Math.max(4,rc[n]/rc[topR[0]]*100)+'%"></i></span></div>';
      }).join("")+"</div></div>";
  }
  h+="</div>";
  return h;
}

/* ---------- market aggregates ---------- */
function postEvents(){
  var ev=[];
  (D.igActivity||[]).forEach(function(r){
    if(/quiet|no new/i.test(r.activity||"")) return;
    ev.push({handle:r.handle,date:r.date});
  });
  return ev;
}
var EVENTS=postEvents();

/* venue-mode Market: venue-only aggregates, never business medians */
function renderVenueMarket(){
  var list=filtered(), h='<div class="sec"><h3>Market</h3><div class="sub">Aggregates across '+list.length+' venues</div>';
  var caps=list.filter(function(b){return b.capacity_num!=null;}).map(function(b){return b.capacity_num;}).sort(function(a,b){return a-b;});
  var med=caps.length?caps[Math.floor(caps.length/2)]:null;
  var ig=list.filter(function(b){return b.ig_handle;}).length;
  var counties={}; list.forEach(function(b){ counties[b.county]=1; });
  h+='<div class="statgrid">'+
    '<div class="stat"><div class="v" data-count="'+list.length+'">0</div><div class="l">Venues</div></div>'+
    '<div class="stat"><div class="v" data-count="'+(med||0)+'">0</div><div class="l">Median max guests</div></div>'+
    '<div class="stat"><div class="v">'+ig+'</div><div class="l">On Instagram</div></div>'+
    '<div class="stat"><div class="v">'+Object.keys(counties).length+'</div><div class="l">Counties</div></div></div>';
  var buckets=[["≤ 200 guests",0],["201–300",0],["301+",0],["Not published",0]];
  list.forEach(function(b){ var v=b.capacity_num;
    if(v==null) buckets[3][1]++; else if(v<=200) buckets[0][1]++; else if(v<=300) buckets[1][1]++; else buckets[2][1]++; });
  var tot=list.length||1, cols=["#6fd3e7","#6db3f2","#e8b34b","#e06c6c"];
  h+='<div class="sec"><h3>Capacity spread</h3><div class="sub">Largest published guest count per venue</div><div class="bar">'+
    buckets.map(function(bk,i){ return '<i style="width:'+(bk[1]/tot*100)+'%;background:'+cols[i]+'" title="'+bk[0]+': '+bk[1]+'"></i>'; }).join("")+
    '</div><div class="barlbl">'+buckets.map(function(bk,i){return '<span><b style="color:'+cols[i]+'">'+bk[1]+'</b> '+bk[0]+'</span>';}).join("")+'</div></div>';
  h+="</div>";
  return h;
}

function renderMarket(){
  if(S.mode==="venues") return renderVenueMarket();
  var list=filtered(), h='<div class="sec"><h3>Market</h3><div class="sub">Aggregates across '+list.length+' businesses</div>';
  var f=list.filter(function(b){return b.followers!=null;}).map(function(b){return b.followers;});
  f.sort(function(a,b){return a-b;});
  function med(a){ return a.length?a[Math.floor(a.length/2)]:null; }
  var w=list.filter(function(b){return b.price.wedding!=null;}).map(function(b){return b.price.wedding;});
  var withPrice=list.filter(function(b){return b.hasPrice;}).length;
  var active=list.filter(function(b){return b.postAge!=null&&b.postAge<=30;}).length;
  h+='<div class="statgrid">'+
    '<div class="stat"><div class="v" data-count="'+list.length+'">0</div><div class="l">Businesses</div></div>'+
    '<div class="stat"><div class="v" data-count="'+(med(f)||0)+'">0</div><div class="l">Median followers</div></div>'+
    '<div class="stat"><div class="v" data-count="'+(med(w)||0)+'" data-money="1">0</div><div class="l">Median wedding $</div></div>'+
    '<div class="stat"><div class="v">'+(list.length?Math.round(withPrice/list.length*100):0)+'%</div><div class="l">Show pricing</div></div>'+
    '<div class="stat"><div class="v">'+(list.length?Math.round(active/list.length*100):0)+'%</div><div class="l">Posted ≤30d</div></div>'+
  '</div>';

  /* pricing transparency bar */
  var buckets=[["< $1k",0],["$1–2k",0],["$2–3.5k",0],["$3.5k+",0],["Hidden",0]];
  w.forEach(function(v){ if(v<1000)buckets[0][1]++; else if(v<2000)buckets[1][1]++;
    else if(v<3500)buckets[2][1]++; else buckets[3][1]++; });
  buckets[4][1]=list.length-withPrice;
  var tot=list.length||1, cols=["#6fd3e7","#6db3f2","#e8b34b","#e06c6c","#3a4353"];
  h+='<div class="sec"><h3>Wedding price spread</h3><div class="sub">Starting wedding price, where published</div><div class="bar">'+
    buckets.map(function(bk,i){ return '<i style="width:'+(bk[1]/tot*100)+'%;background:'+cols[i]+'" title="'+bk[0]+': '+bk[1]+'"></i>'; }).join("")+
    '</div><div class="barlbl">'+buckets.map(function(bk,i){return '<span><b style="color:'+cols[i]+'">'+bk[1]+'</b> '+bk[0]+'</span>';}).join("")+'</div></div>';

  /* growth leaderboard (7-day percent) */
  var lb=list.map(function(b){return {b:b,ch:pctChange(b,Math.max(0,S.di-7),S.di)};})
    .filter(function(x){return x.ch!=null&&x.ch>=3;})
    .sort(function(a,b2){return b2.ch-a.ch;}).slice(0,8);
  if(lb.length){
    var mx=lb[0].ch;
    h+='<div class="sec"><h3>Growth leaderboard</h3><div class="sub">7-day follower change, ≥3%</div><div class="stagger">'+
      lb.map(function(x){ return '<div class="lb-row" data-open="'+x.b.id+'"><span class="lb-nm">'+esc(x.b.name)+
        '</span><span class="lb-v">+'+x.ch.toFixed(1)+'%</span>'+
        '<span class="lb-bar"><i style="width:'+Math.max(4,x.ch/mx*100)+'%"></i></span></div>'; }).join("")+
      '</div></div>';
  }

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
  h+="</div>";
  return h;
}

/* ---------- sparkline (indexed to 100, padded scale, no overlap) ---------- */
function sparkline(hist, w, h){
  w=w||320; h=h||64;
  if(!hist||hist.length<2) return '<div class="empty-note">Not enough history for a trend yet.</div>';
  var pts=hist.map(function(r){return r.count||0;});
  var dMn=Math.min.apply(null,pts), dMx=Math.max.apply(null,pts);
  var X=function(i){return 6+i*(w-12)/(pts.length-1);};
  function albl(yv,txt){ return '<text class="al" x="6" y="'+yv+'">'+esc(txt)+'</text>'; }
  if(dMx===dMn){
    var Y0=Math.round(h/2);
    return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
      '<line x1="6" y1="'+Y0+'" x2="'+(w-6)+'" y2="'+Y0+'" stroke="#e8b34b" stroke-width="2"/>'+
      '<circle cx="'+(w-6)+'" cy="'+Y0+'" r="3.5" fill="#e8b34b"/>'+albl(12,fmt(dMx)+" (flat)")+'</svg>';
  }
  var pad=(dMx-dMn)*0.15, mn=dMn-pad, mx=dMx+pad;
  var Y=function(v){return h-14-(v-mn)/(mx-mn)*(h-26);};
  var d="M"+pts.map(function(v,i){return X(i).toFixed(1)+" "+Y(v).toFixed(1);}).join(" L");
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
    '<path d="'+d+'" fill="none" stroke="#e8b34b" stroke-width="2"/>'+
    '<circle cx="'+X(pts.length-1).toFixed(1)+'" cy="'+Y(pts[pts.length-1]).toFixed(1)+'" r="3.5" fill="#e8b34b"/>'+
    albl(12,fmt(dMx))+albl(h-4,fmt(dMn))+'</svg>';
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
function profileHTML(b){
  if(b.type==="venue") return venueProfileHTML(b);
  var f=followersAt(b,S.di), ch7=pctChange(b,Math.max(0,S.di-7),S.di), ch30=pctChange(b,Math.max(0,S.di-30),S.di);
  var ini=b.name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join("");
  var h='<div class="sec"><div class="prof-head"><div class="prof-ava">'+esc(ini)+'</div>'+
    '<div><h2>'+esc(b.name)+'</h2>'+
    '<div class="sub">'+esc(b.town)+locTag(b)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+(b.region==="slc"?" · St. Lawrence Co":"")+'</div></div></div>'+
    scoreStrip(b);

  /* You vs market median — always visible */
  var medF=C.map(function(x){return x.followers;}).filter(function(v){return v!=null;}).sort(function(a,c){return a-c;});
  var medW=C.map(function(x){return x.price.wedding;}).filter(function(v){return v!=null;}).sort(function(a,c){return a-c;});
  var mF=medF.length?medF[Math.floor(medF.length/2)]:null, mW=medW.length?medW[Math.floor(medW.length/2)]:null;
  var rF=b.followers!=null?rankOf(b,"followers",true):null;
  var wArr=C.filter(function(x){return x.price.wedding!=null;}).sort(function(a,c){return a.price.wedding-c.price.wedding;});
  var rW=b.price.wedding!=null?wArr.indexOf(b)+1:null;
  h+='<div class="chiprow">';
  if(b.ig_handle) h+='<span class="chip">@'+esc(b.ig_handle)+'</span>';
  if(b.website) h+='<a class="chip extlink" href="'+esc(/^https?:/.test(b.website)?b.website:"https://"+b.website)+'" target="_blank" rel="noopener">Website ↗</a>';
  if(b.pricing_url) h+='<a class="chip extlink" href="'+esc(b.pricing_url)+'" target="_blank" rel="noopener">Pricing ↗</a>';
  h+='</div>';
  /* Instagram section — only rendered when there's actually IG data (no more dash rows) */
  var hasIG=!!(b.ig_handle&&(b.followHist.length||f!=null||b.postAge!=null));
  var igRows="";
  if(hasIG){
    if(f!=null) igRows+='<dt>Followers</dt><dd><b>'+fmt(f)+'</b>'+(rF?' <span style="color:var(--dim)">#'+rF.rank+' of '+rF.of+'</span>':"")+'</dd>';
    if(f!=null&&mF!=null) igRows+='<dt>vs median</dt><dd>'+(f>=mF?'<b style="color:var(--up)">'+pctStr((f-mF)/mF*100)+' above</b>':'<b style="color:var(--red)">'+pctStr((f-mF)/mF*100)+' below</b>')+'</dd>';
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
  /* Pricing — from the earlier web sweep */
  var priceRows="";
  if(b.price.wedding!=null) priceRows+='<dt>Wedding from</dt><dd><b>'+money(b.price.wedding)+'</b>'+(rW?' <span style="color:var(--dim)">#'+rW+' of '+wArr.length+'</span>':"")+'</dd>';
  if(b.price.session!=null) priceRows+='<dt>Session from</dt><dd><b>'+money(b.price.session)+'</b></dd>';
  var cfd=CONF[b.id];
  if(cfd&&cfd.conflict) priceRows+='<dt>Price conflict</dt><dd><span class="pcflag">needs review</span><br>'+
    cfd.conflict.values.map(function(v){ return '<span style="color:var(--dim)">'+esc(v.label)+':</span> <b>'+esc(v.text)+'</b>'; }).join('<br>')+'</dd>';
  if(priceRows) h+='<h3>Pricing</h3><dl class="kv">'+priceRows+'</dl>';
  /* Website intel — pilot sweep, Sep 2026, with roster-level fallbacks */
  var wi=WI[b.id], wrows="", wOk=wi&&!wi.unreachable;
  var services=(wOk&&wi.services&&wi.services.length)?wi.services:
    ((b.services&&b.services.length)?b.services:null);
  if(services) wrows+='<dt>Services</dt><dd>'+services.map(function(s){return '<span class="chip">'+esc(s)+'</span>';}).join(" ")+'</dd>';
  var yrs=wOk?(wi.years_in_business!=null?wi.years_in_business+" yrs":(wi.since?"since "+wi.since:null)):null;
  if(!yrs&&b.est_year!=null){ var yyb=new Date().getFullYear()-b.est_year;
    yrs=yyb+" yrs · est. "+b.est_year; }
  if(yrs) wrows+='<dt>In business</dt><dd><b>'+esc(yrs)+'</b></dd>';
  if(wOk){
    if(wi.coverage&&wi.coverage.length) wrows+='<dt>Coverage</dt><dd>'+esc(wi.coverage.join(" · "))+'</dd>';
    if(wi.platform) wrows+='<dt>Site built on</dt><dd>'+esc(wi.platform)+'</dd>';
  }
  if(wrows){
    h+='<h3>Website</h3><dl class="kv">'+wrows+'</dl>';
    if(wi&&wi.site_note) h+='<div class="sub">'+esc(wi.site_note)+'</div>';
    h+='<div class="sub" style="opacity:.65">Checked '+esc((wi&&wi.fetched)||"Sep 2026")+'</div>';
  }
  if(!igRows&&!priceRows&&!wrows) h+='<div class="sub">No public stats tracked yet.</div>';

  h+='<h3>Follower trend</h3>';
  h+='<div class="trendgrid"><div class="stat"><div class="v pct '+(ch7==null?"fl":ch7>=0?"up":"dn")+'">'+pctStr(ch7)+'</div><div class="l">7-day</div></div>'+
     '<div class="stat"><div class="v pct '+(ch30==null?"fl":ch30>=0?"up":"dn")+'">'+pctStr(ch30)+'</div><div class="l">30-day</div></div></div>';
  h+=sparkline(b.followHist);
  h+='<div class="sub" style="margin-top:6px;opacity:.65">Public Instagram follower counts, updated daily.</div>';
  h+='</div>';
  return h;
}
function yearsNum(b){ var w=WI[b.id]||{}, Y=new Date().getFullYear();
  if(w.years_in_business!=null) return w.years_in_business;
  if(w.since) return Y-w.since;
  if(b.est_year!=null) return Y-b.est_year;
  return null; }
function marketGlanceHTML(){
  /* The questions our data answers best, as full-height cards. */
  function qCard(q,sub,bars,answer){
    return '<div class="sec qcard"><h3>'+q+'</h3><div class="sub">'+sub+'</div><div class="qbars">'+
      bars.map(function(r){ return '<div class="qrow"'+(r.id?' data-open="'+r.id+'"':"")+'>'+
        '<span class="qn">'+esc(r.label)+'</span><span class="qv">'+r.val+'</span>'+
        '<span class="qtrack"><i style="width:'+r.pct+'%;background:'+r.color+'"></i></span></div>'; }).join("")+
      '</div><div class="qans">'+answer+'</div></div>';
  }
  if(S.mode==="venues"){
    var cards=[];
    /* Q1: where are the venues? */
    var co={}; V.forEach(function(v){ var c=v.county||"Unknown"; co[c]=(co[c]||0)+1; });
    var ckeys=Object.keys(co).sort(function(a,b){return co[b]-co[a];});
    var cmax=co[ckeys[0]]||1, ccols=["#e8b34b","#6db3f2","#6fd3e7","#b48ce8","#e06c6c","#8a94a6"];
    cards.push(qCard("Locations","All "+V.length+" venues by county",
      ckeys.map(function(k,i){ return {label:k,val:co[k],pct:Math.round(co[k]/cmax*100),color:ccols[i%ccols.length]}; }),
      "St. Lawrence County holds <b>"+(co["St. Lawrence"]||0)+"</b> of "+V.length+" — the rest spread across "+(ckeys.length-1)+" nearby counties."));
    /* Q2: how big are they? */
    var cb=[["Up to 100",0],["101–200",0],["201–300",0],["300+",0],["Unknown",0]];
    V.forEach(function(v){ var c=v.capacity_num;
      if(c==null)cb[4][1]++; else if(c<=100)cb[0][1]++; else if(c<=200)cb[1][1]++; else if(c<=300)cb[2][1]++; else cb[3][1]++; });
    var bmax=Math.max.apply(null,cb.map(function(x){return x[1];}))||1;
    var bcols=["#6fd3e7","#6db3f2","#e8b34b","#e06c6c","#3a4353"];
    cards.push(qCard("Capacity","Max guest capacity, "+(V.length-cb[4][1])+" of "+V.length+" known",
      cb.map(function(x,i){ return {label:x[0]+" guests",val:x[1],pct:Math.round(x[1]/bmax*100),color:bcols[i]}; }),
      "The sweet spot is <b>101–300 guests</b> — mid-size barns dominate the market."));
    /* Q3: are they on Instagram? */
    var ia=0,idm=0,inone=0;
    V.forEach(function(v){ if(!v.ig_handle)inone++;
      else{ var a=v.last_post_date?Math.floor((Date.now()-new Date(v.last_post_date+"T12:00:00"))/864e5):1e9;
        if(a<=90)ia++; else idm++; } });
    var imax=Math.max(ia,idm,inone,1);
    cards.push(qCard("Instagram","Verified venue accounts only — never guessed",
      [{label:"Active (posted ≤90d)",val:ia,pct:Math.round(ia/imax*100),color:"#e8b34b"},
       {label:"Dormant",val:idm,pct:Math.round(idm/imax*100),color:"#6db3f2"},
       {label:"No verified account",val:inone,pct:Math.round(inone/imax*100),color:"#3a4353"}],
      "<b>"+inone+" of "+V.length+"</b> venues have no verified Instagram — the outreach gap is wide open."));
    if(S.railX){
      var st={}; V.forEach(function(v){ var s=v.setting||"Unknown"; st[s]=(st[s]||0)+1; });
      var skeys=Object.keys(st).sort(function(a,b){return st[b]-st[a];}).slice(0,7);
      var smax=st[skeys[0]]||1, scols=["#e8b34b","#6db3f2","#6fd3e7","#b9c2cf","#e06c6c","#8a94a6","#3a4353"];
      cards.push(qCard("Settings","Venue style, as listed",
        skeys.map(function(k,i){ return {label:k,val:st[k],pct:Math.round(st[k]/smax*100),color:scols[i%scols.length]}; }),
        "Settings vary — <b>"+skeys.length+"</b> distinct styles across "+V.length+" venues"+(st[skeys[0]]>1?"; <b>"+skeys[0]+"</b> leads ("+st[skeys[0]]+")":"; no single style dominates")+"."));
    }
    return railHead()+cards.join("");
  }
  var list=C, cards=[];
  /* Q1: who is actually posting? */
  var ab=[["Active · ≤30 days",0,"#e8b34b"],["Steady · 31–90 days",0,"#6db3f2"],
          ["Quiet · 91–180 days",0,"#6fd3e7"],["Dormant · 180+ days",0,"#e06c6c"],["Unknown",0,"#3a4353"]];
  list.forEach(function(b){ var a=b.postAge;
    if(a==null)ab[4][1]++; else if(a<=30)ab[0][1]++; else if(a<=90)ab[1][1]++;
    else if(a<=180)ab[2][1]++; else ab[3][1]++; });
  var amax=Math.max.apply(null,ab.map(function(x){return x[1];}))||1;
  var knownPosters=ab[0][1]+ab[1][1];
  cards.push(qCard("Posting activity","Last post recency across "+list.length+" businesses",
    ab.map(function(x){ return {label:x[0],val:x[1],pct:Math.round(x[1]/amax*100),color:x[2]}; }),
    "<b>"+ab[0][1]+" of "+list.length+"</b> posted in the last 30 days — a small active set carries the market's feed."));
  /* Q2: where does the audience sit? */
  var aud=list.filter(function(b){return b.followers!=null;})
    .sort(function(a,b){return b.followers-a.followers;}).slice(0,8);
  var totAud=list.reduce(function(s,b){return s+(b.followers||0);},0);
  var topAud=aud.reduce(function(s,b){return s+b.followers;},0);
  var fmax=aud.length?aud[0].followers:1;
  var acols=["#e8b34b","#6db3f2","#6fd3e7","#b48ce8","#8a94a6"];
  cards.push(qCard("Audience","Top 8 by Instagram followers",
    aud.map(function(b,i){ return {label:b.name,val:fmt(b.followers),id:b.id,
      pct:Math.round(b.followers/fmax*100),color:acols[i%acols.length]}; }),
    "The top 8 hold <b>"+(totAud?Math.round(topAud/totAud*100):0)+"%</b> of all "+fmt(totAud)+" tracked followers."));
  /* Q3: what does it cost? */
  var pb=[["Under $1k",0,"#6fd3e7"],["$1k–$2k",0,"#6db3f2"],["$2k–$3.5k",0,"#e8b34b"],
          ["$3.5k+",0,"#e06c6c"],["Not published",0,"#3a4353"]];
  list.forEach(function(b){ var w=b.price.wedding;
    if(w==null)pb[4][1]++; else if(w<1000)pb[0][1]++; else if(w<2000)pb[1][1]++;
    else if(w<3500)pb[2][1]++; else pb[3][1]++; });
  var pmax=Math.max.apply(null,pb.map(function(x){return x[1];}))||1;
  var pub=pb[0][1]+pb[1][1]+pb[2][1]+pb[3][1];
  cards.push(qCard("Cost","Starting wedding price, where published",
    pb.map(function(x){ return {label:x[0],val:x[1],pct:Math.round(x[1]/pmax*100),color:x[2]}; }),
    "<b>"+pub+" of "+list.length+"</b> publish a starting wedding price — "+pb[4][1]+" keep it hidden."));
  if(S.railX){
    /* Q4: who's gaining followers? */
    var gr=list.map(function(b){ return {b:b,ch:pctChange(b,Math.max(0,S.di-30),S.di)}; })
      .filter(function(x){return x.ch!=null;}).sort(function(a,b){return b.ch-a.ch;}).slice(0,8);
    if(gr.length){
      var gmax=Math.max.apply(null,gr.map(function(x){return Math.abs(x.ch);} ).concat([0.1]));
      cards.push(qCard("Follower growth","30-day follower change, top movers",
        gr.map(function(x){ return {id:x.b.id,label:x.b.name,val:(x.ch>=0?"+":"")+x.ch.toFixed(1)+"%",
          pct:Math.min(100,Math.round(Math.abs(x.ch)/gmax*100)),color:x.ch>=0?"#6db3f2":"#e06c6c"}; }),
        "Tap a row to open the profile."));
    }
    /* Q5: how long have they been around? */
    var yb=[["Under 3 yrs",0,"#6fd3e7"],["3–5 yrs",0,"#6db3f2"],["6–10 yrs",0,"#e8b34b"],
            ["10+ yrs",0,"#b9c2cf"],["Unknown",0,"#3a4353"]];
    list.forEach(function(b){ var y=yearsNum(b);
      if(y==null)yb[4][1]++; else if(y<3)yb[0][1]++; else if(y<=5)yb[1][1]++; else if(y<=10)yb[2][1]++; else yb[3][1]++; });
    var ymax=Math.max.apply(null,yb.map(function(x){return x[1];}))||1, yk=yb[0][1]+yb[1][1]+yb[2][1]+yb[3][1];
    cards.push(qCard("Years in business","Track record, "+yk+" of "+list.length+" known",
      yb.map(function(x){ return {label:x[0],val:x[1],pct:Math.round(x[1]/ymax*100),color:x[2]}; }),
      "The market skews <b>established</b> — "+yb[3][1]+" businesses are 10+ years in."));
    /* Q6: how solid is each profile? */
    var sb=[["80–100 · strong",0,"#6db3f2"],["60–79 · decent",0,"#6fd3e7"],["40–59 · thin",0,"#e8b34b"],
            ["Under 40 · weak",0,"#e06c6c"]];
    list.forEach(function(b){ var s=confOf(b); if(s==null)return;
      if(s>=80)sb[0][1]++; else if(s>=60)sb[1][1]++; else if(s>=40)sb[2][1]++; else sb[3][1]++; });
    var smax2=Math.max.apply(null,sb.map(function(x){return x[1];}))||1;
    cards.push(qCard("Profile strength","Information confidence across "+list.length+" businesses",
      sb.map(function(x){ return {label:x[0],val:x[1],pct:Math.round(x[1]/smax2*100),color:x[2]}; }),
      "<b>"+sb[0][1]+" of "+list.length+"</b> profiles score 80+ — the deep-dive pass keeps raising the rest."));
  }
  return railHead()+cards.join("");
}
function railHead(){
  return '<div class="railhead"><span>Market glance</span>'+
    '<button id="railx" class="rxbtn" aria-expanded="'+(S.railX?"true":"false")+'">'+
    (S.railX?"Collapse ▸":"Expand ◂")+'</button></div>';
}
function renderRight(){
  var el=$("#rightbody");
  $("#right").classList.toggle("wide",!!S.railX&&!S.sel);
  el.innerHTML=S.sel&&BY_ID[S.sel]?profileHTML(BY_ID[S.sel]):marketGlanceHTML();
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
var RANK_MODES=[{id:"audience",label:"Audience"},{id:"activity",label:"Activity"},{id:"momentum",label:"Momentum"}];
function ageStr(age){
  if(age==null) return "no recent posts";
  if(age<=0) return "posted today";
  if(age===1) return "posted yesterday";
  if(age<30) return "posted "+age+"d ago";
  if(age<60) return "posted ~1mo ago";
  return "quiet "+Math.round(age/30)+"mo+";
}
function renderRankings(){
  var el=$("#rankings"); if(!el) return;
  var mode=S.rankMode||"audience", list=filtered();
  var rows=list.map(function(b){
    var key,val,frac,cls="";
    if(mode==="audience"){ var f=followersAt(b,S.di);
      key=f==null?-1:f; val=f==null?"\u2014":fmt(f); frac=f==null?0:1; }
    else if(mode==="activity"){ var a=b.postAge;
      key=a==null?1e9:a; val=ageStr(a); frac=a==null?0:Math.max(0.05,1-Math.min(a,120)/120); }
    else { var ch=pctChange(b,Math.max(0,S.di-7),S.di);
      key=ch==null?-1e9:ch; val=ch==null?"\u2014":pctStr(ch); frac=ch==null?0:1;
      cls=ch==null?"":(ch>=0?"up":"dn"); }
    return {b:b,key:key,val:val,frac:frac,cls:cls};
  });
  var mx=0; rows.forEach(function(r){ if(mode==="momentum") mx=Math.max(mx,Math.abs(r.key)); else if(r.frac) mx=Math.max(mx,r.key); });
  if(mode==="audience"&&mx<=0) mx=1; if(mode==="momentum"&&mx<=0) mx=1;
  rows.sort(function(a,b){ return mode==="activity"?a.key-b.key:b.key-a.key; });
  var h='<div class="rk-head"><div><h2>Rankings</h2>'+
    '<div class="rk-sub">Who leads the North Country market right now · '+esc(dstr(DATES[S.di]))+'</div></div>'+
    '<div class="rk-modes" role="tablist">'+RANK_MODES.map(function(m){
      return '<button data-rank="'+m.id+'" class="'+(m.id===mode?"on":"")+'" role="tab" aria-selected="'+(m.id===mode)+'">'+m.label+'</button>'; }).join("")+'</div></div>';
  h+='<div class="rk-hint">'+(mode==="audience"?"Ranked by follower count.":
    mode==="activity"?"Ranked by how recently they posted.":
    "Ranked by follower growth over the last 7 days.")+' Click a row for detail.</div>';
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
  S.sel=id;
  var b=BY_ID[id];
  renderPins(); renderRight();
  if(S.view==="rankings") renderRankings();  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
  var row=$('#leftbody .row[data-open="'+id+'"]'); if(row) row.classList.add("sel");
  if(b&&opts.fly!==false&&S.view==="map") flyTo(b);
  if(b&&window.innerWidth<=900){ $("#right").classList.add("open"); }
  pushHist();
}

/* ---------- left body ---------- */
function renderLeft(){
  var el=$("#leftbody");
  el.innerHTML=S.tab==="today"?renderToday():S.tab==="dir"?renderDir():S.tab==="ai"?renderAI():S.tab==="data"?renderData():renderMarket();
  $$("[data-count]",el).forEach(function(n){
    var to=+n.getAttribute("data-count"), mon=n.getAttribute("data-money")==="1";
    if(REDUCED){ n.textContent=mon?money(to):fmt(to); return; }
    var t0=null; (function step(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/800), e=1-Math.pow(1-p,3);
      n.textContent=mon?money(Math.round(to*e)):fmt(Math.round(to*e)); if(p<1)requestAnimationFrame(step); })(performance.now());
  });
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
  var el=$("#fresh"); if(!el) return;
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
  el.innerHTML='<span class="frow">'+src("IG",igD,"6:40 AM","06:40")+
    src("Web",webD,"morning","08:00")+src("AI",aiD,"morning","08:00")+'</span>'+
    '<span class="frow dim">Built '+esc(built)+
    ' · next IG pull ~6:40 AM '+nextET("06:40")+' · site sync ~7:54 AM '+nextET("07:54")+'</span>';
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
  if(S.tab==="today") renderLeft();
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
  S.mode=m;
  C=(m==="venues"?V:B); BY_ID=(m==="venues"?V_BY_ID:B_BY_ID);
  S.sel=null; S.lane=""; S.mom="";
  $("#flane").value=""; $("#fmom").value="";
  computeModeStats();
  $$(".modetoggle button").forEach(function(b){ var on=b.getAttribute("data-mode")===m;
    b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); });
  var biz=m!=="venues";
  $("#flane").style.display=biz?"":"none";
  $("#fmom").style.display=biz?"":"none";
  $("#fq").setAttribute("placeholder",biz?"Search businesses…":"Search venues…");
  var bt=$(".brand-text small"); if(bt) bt.textContent=biz?"North Country photo market":"North Country venue watch";
  document.title=biz?"Business Pulse · North Country photo market":"Business Pulse · North Country venues";
  renderPins();
  var pts=C.filter(function(b){return b._geo&&b.lat!=null;}).map(function(b){return [b.lat,b.lng];});
  if(pts.length&&map){
    HIST.noPush=true; /* programmatic reframe: not a user move */
    /* account for the fixed side panels so edge pins (e.g. Altona) don't sit underneath them */
    if(window.innerWidth>900) map.fitBounds(L.latLngBounds(pts), {paddingTopLeft:L.point(400,90), paddingBottomRight:L.point(380,90)});
    else map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }
  if(S.view==="rankings") renderRankings();
  renderLeft(); renderRight();
  pushHist();
}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
  var rx=e.target.closest("#railx");
  if(rx){ S.railX=!S.railX; renderRight(); pushHist(); return; }
  var cf=e.target.closest("[data-cf]");
  if(cf){ openScoreDash(cf.getAttribute("data-cf")); return; }
  var t=e.target.closest("[data-open]");
  if(t){ select(t.getAttribute("data-open")); return; }
  var vt=e.target.closest(".viewtoggle button");
  if(vt){ setView(vt.getAttribute("data-view")); return; }
  var mt=e.target.closest(".modetoggle button");
  if(mt){ setMode(mt.getAttribute("data-mode")); return; }
  var rb=e.target.closest("[data-rank]");
  if(rb){ S.rankMode=rb.getAttribute("data-rank"); renderRankings(); pushHist(); return; }
  var th=e.target.closest("th[data-dk]");
  if(th){ var k=th.getAttribute("data-dk"), s2=S.dsort||{key:"followers",dir:-1};
    if(s2.key===k) s2.dir=-s2.dir;
    else s2={key:k,dir:/^(followers|ch7|ch30|posts|conf)$/.test(k)?-1:1};
    S.dsort=s2; renderLeft(); pushHist(); return; }
  var tb=e.target.closest(".tabs button");
  if(tb){ S.tab=tb.getAttribute("data-tab");
    $$(".tabs button").forEach(function(b){ var on=b===tb;
      b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); });
    renderLeft(); pushHist(); return; }
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
[["#flane","lane"],["#fmom","mom"],["#freg","reg"]].forEach(function(p){
  $(p[0]).addEventListener("change",function(e){ S[p[1]]=e.target.value; refreshFiltered(); pushHist(); });
});
/* persistent nav: back / forward / home */
$("#navback").addEventListener("click",function(){ if(HIST.i>0){ HIST.i--; applyState(HIST.stack[HIST.i]); } });
$("#navfwd").addEventListener("click",function(){ if(HIST.i<HIST.stack.length-1){ HIST.i++; applyState(HIST.stack[HIST.i]); } });
$("#navhome").addEventListener("click",goHome);
function refreshFiltered(){ renderPins(); if(S.view==="rankings") renderRankings(); renderLeft(); }
timeEl.addEventListener("input",function(){ setPlaying(false); S.di=+timeEl.value; onScrub(); });
$("#playbtn").addEventListener("click",function(){ setPlaying(!S.playing); });
$("#rightclose").addEventListener("click",function(){ $("#right").classList.remove("open"); clearSel(); });
$("#sheetgrab").addEventListener("click",function(){ $("#left").classList.toggle("open"); });
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){ setPlaying(false);
    if(window.innerWidth<=900){ $("#right").classList.remove("open"); }
    else clearSel(); }
  if(e.key==="/"&&document.activeElement!==$("#fq")){ e.preventDefault(); $("#fq").focus(); }
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
renderScrub(); renderLeft(); renderRight(); buildFresh();
pushHist(); /* seed undo history with the initial view */
})();
