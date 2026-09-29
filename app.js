/* Business Pulse command center — full-viewport map/bubble market view.
   Reads window.PULSE_DATA from data/data.js (built by scripts/build_data_js.py). */
(function(){
"use strict";
var D = window.PULSE_DATA || {};
var $ = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var ADMIN = false;
try{ ADMIN = sessionStorage.getItem("pulse_admin")==="1"; }catch(e){}

/* ---------- small helpers ---------- */
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
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

/* ---------- JD injection (permanent "You") ---------- */
var JD_ID="jd-meyers-productions";
(function(){
  var jdHist=(D.ownAccounts||[]).filter(function(r){return r.account==="jdmeyersproductions"&&/^\d{4}-\d{2}-\d{2}$/.test(r.date);})
    .map(function(r){return {date:r.date,count:r.follower_count};})
    .sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
  (D.igFollowersHistory=D.igFollowersHistory||{})["jdmeyersproductions"]=jdHist;
  var has=(D.competitors||[]).some(function(c){return c.id===JD_ID;});
  if(!has) (D.competitors=D.competitors||[]).push({
    id:JD_ID,name:"JD Meyers Productions",specialty:"both",town:"Potsdam, NY (SLC)",
    region:"slc",county:"St. Lawrence",website:"jdmeyersjr.com",ig_handle:"jdmeyersproductions",
    pricing:"Wedding $1,400 starting",pricing_url:"https://jdmeyersjr.com",notes:"",
    status:"active",flags:[],source:"directory",source_label:"Directory",you:true});
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
var B=(D.competitors||[]).map(function(c){
  var e=Object.assign({},c);
  e.price=priceFloors(c.pricing);
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
  if(b.postAge<=14) return "#7dc98f";
  if(b.postAge<=45) return "#e8b34b";
  return "#e06c6c";
}
var LANE_COLOR={photo:"#e8b34b",video:"#6db3f2",both:"#b48ce8",drone:"#5fd0b5",venue:"#d98e4a"};
var LANE_LABEL={photo:"Photo",video:"Video",both:"Photo + Video",drone:"Drone",venue:"Venue"};
var MOM_LABEL={gaining:"Gaining",slipping:"Slipping",active:"Active",quiet:"Quiet",dormant:"Dormant"};
var REG_LABEL={slc:"St. Lawrence Co",adjacent:"Nearby counties",unconfirmed:"Unconfirmed"};

/* ---------- state ---------- */
var S={ view:"map", mode:"businesses", tab:"today", rankMode:"audience", di:DATES.length-1, q:"", lane:"", mom:"", reg:"",
        sel:null, playing:false };

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
  var out={date:today,prev:yd,newBiz:[],jumps:[],prices:[],promo:[],quiet:[]};
  C.forEach(function(b){
    if(b.you) return; /* JD never appears in the change feed */
    var first=b.followHist.length?b.followHist[0].date:null;
    if(first&&first>=yd){ out.newBiz.push(b); return; }
    var ch=pctChange(b,ydi,di);
    if(ch!=null&&Math.abs(ch)>=3) out.jumps.push({b:b,ch:ch,
      from:followersAt(b,ydi),to:followersAt(b,di)});
  });
  out.jumps.sort(function(a,b2){return Math.abs(b2.ch)-Math.abs(a.ch);});
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
      if(comp&&!comp.you) out.promo.push({b:comp,note:r.activity});
    }});
  /* gone quiet: last post exactly 30 or 90 days ago */
  var d30=new Date(today+"T12:00:00"), d90=new Date(today+"T12:00:00");
  d30.setDate(d30.getDate()-30); d90.setDate(d90.getDate()-90);
  function iso(d){ return d.toISOString().slice(0,10); }
  C.forEach(function(b){ if(b.you) return;
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
  /* your week */
  var you=list.filter(function(b){ return b.you; })[0];
  if(you){
    var ych=pctChange(you,d0,di), yfrom=followersAt(you,d0), yto=followersAt(you,di);
    var yh=norm(you.ig_handle), yn=yh&&actBy[yh]?actBy[yh].length:0;
    var parts=[];
    if(ych!=null) parts.push((ych>=0?"+":"")+ych.toFixed(1)+"% ("+fmt(yfrom)+" → "+fmt(yto)+")");
    parts.push(yn+(yn===1?" post":" posts")+" in 7 days");
    cards.push({k:"Your week",b:you,you:true,why:parts.join(" · ")});
  }
  if(!cards.length) return "";
  return '<div class="sec"><h3>Week\'s highlights</h3><div class="sub">Top of the market · last 7 days</div>'+
    '<div class="hl-grid">'+cards.map(function(c){
      return '<div class="hl-card'+(c.you?" you":"")+'" data-open="'+c.b.id+'">'+
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
  h+='<div class="sub" style="margin:8px 0 0">Change history builds from here — check back as snapshots accumulate.</div></div>';
  h+='<div class="sec"><h3>All venues</h3><div class="stagger">'+V.map(venueRow).join("")+"</div></div>";
  return h;
}

function renderToday(){
  if(S.mode==="venues") return renderVenueToday();
  var ch=todayChanges(), h=weekHighlights();
  h+='<div class="sec"><h3>What changed</h3><div class="sub">Since '+esc(dstr(ch.prev))+' · '+esc(dstr(ch.date))+'</div>';
  function rows(list,fn){ return '<div class="stagger">'+list.slice(0,8).map(fn).join("")+"</div>"; }
  if(ch.jumps.length){
    h+='<div class="chgcat"><h4>Follower jumps <span class="cnt">'+ch.jumps.length+'</span></h4>'+
      rows(ch.jumps,function(j){
        var cls=j.ch>=0?"up":"dn";
        return '<div class="row" data-open="'+j.b.id+'"><span class="dot" style="background:'+recencyDot(j.b)+'"></span>'+
          '<div class="nm"><b>'+esc(j.b.name)+'</b><span>'+esc(j.b.townShort)+' · '+fmt(j.from)+' → '+fmt(j.to)+'</span></div>'+
          '<div class="meta"><span class="pct '+cls+'">'+pctStr(j.ch)+'</span></div></div>';})+'</div>';
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
  if(!ch.jumps.length&&!ch.newBiz.length&&!ch.promo.length&&!ch.prices.length&&!ch.quiet.length)
    h+='<div class="empty-note">Nothing moved since yesterday. The market is holding its breath.</div>';
  h+="</div>";
  return h;
}

/* ---------- directory ---------- */
function venueRow(b,i){
  return '<div class="row'+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'"'+(i<20?' style="animation-delay:'+(i*0.03)+'s"':"")+'>'+
    '<span class="dot" style="background:'+recencyDot(b)+'"></span>'+
    '<div class="nm"><b>'+esc(b.name)+'</b>'+
    '<span>'+esc(b.townShort)+locTag(b)+' · '+(b.capacity?esc(b.capacity.split("(")[0].trim()):"Venue")+'</span></div>'+
    '<div class="meta"><b>'+(b.capacity_num!=null?fmt(b.capacity_num):"—")+'</b><span>max guests'+
    (b.followers!=null?' · '+fmt(b.followers)+' IG':"")+'</span></div></div>';
}
function dirRow(b,i){
  if(b.type==="venue") return venueRow(b,i);
  var f=followersAt(b,S.di), ch=pctChange(b,Math.max(0,S.di-7),S.di);
  var pcls=ch==null?"fl":(ch>=0?"up":"dn");
  return '<div class="row'+(b.you?" you":"")+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'"'+(i<20?' style="animation-delay:'+(i*0.03)+'s"':"")+'>'+
    '<span class="dot" style="background:'+(b.you?"#e8b34b":recencyDot(b))+'"></span>'+
    '<div class="nm"><b>'+esc(b.name)+(b.you?'<span class="youbadge">You</span>':"")+'</b>'+
    '<span>'+esc(b.townShort)+locTag(b)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+'</span></div>'+
    '<div class="meta"><b>'+fmt(f)+'</b><span>'+(b.hasPrice?money(b.price.wedding||b.price.session):"price n/a")+
    ' · <span class="pct '+pcls+'">'+pctStr(ch)+'</span></span></div></div>';
}
/* explicit county labeling: adjacent-county businesses are named as such everywhere */
function locTag(b){
  if(b.region==="adjacent"&&b.county) return ' <span class="adj">· '+esc(b.county)+' Co (adjacent)</span>';
  if(b.region==="unconfirmed"||(b.flags||[]).indexOf("location-unverified")>=0) return ' <span class="unv">· location unverified</span>';
  return "";
}
function renderDir(){
  var list=filtered().slice().sort(function(a,b){return (b.you?1:0)-(a.you?1:0)||((b.followers||0)-(a.followers||0));});
  var noun=S.mode==="venues"?"venues":"businesses";
  var h='<div class="sec"><h3>Directory</h3><div class="sub">'+list.length+' of '+C.length+' '+noun+'</div>';
  if(!list.length) return h+'<div class="empty-note">No '+noun+' match these filters.</div></div>';
  h+='<div class="stagger">'+list.map(dirRow).join("")+"</div></div>";
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
  var tot=list.length||1, cols=["#5fd0b5","#6db3f2","#e8b34b","#e06c6c"];
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
    '<div class="stat"><div class="v">'+C.filter(function(b){return b.you;}).length+'</div><div class="l">That\'s you</div></div>'+
  '</div>';

  /* pricing transparency bar */
  var buckets=[["< $1k",0],["$1–2k",0],["$2–3.5k",0],["$3.5k+",0],["Hidden",0]];
  w.forEach(function(v){ if(v<1000)buckets[0][1]++; else if(v<2000)buckets[1][1]++;
    else if(v<3500)buckets[2][1]++; else buckets[3][1]++; });
  buckets[4][1]=list.length-withPrice;
  var tot=list.length||1, cols=["#5fd0b5","#6db3f2","#e8b34b","#e06c6c","#3a4353"];
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
        (x.b.you?'<span class="youbadge">You</span>':"")+'</span><span class="lb-v">+'+x.ch.toFixed(1)+'%</span>'+
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
      segs+='<circle cx="42" cy="42" r="34" fill="none" stroke="'+(tcols[k]||"#5fd0b5")+'" stroke-width="14" '+
        'stroke-dasharray="'+(frac*circ).toFixed(1)+' '+circ.toFixed(1)+'" stroke-dashoffset="'+(-off*circ).toFixed(1)+'" transform="rotate(-90 42 42)"/>';
      off+=frac; });
    h+='<div class="sec"><h3>Post-type mix</h3><div class="sub">Latest known post format</div><div class="donutwrap">'+
      '<svg class="donut" width="84" height="84" viewBox="0 0 84 84">'+segs+
      '<text x="42" y="47" text-anchor="middle" fill="#ece9e2" font-size="15" font-weight="700">'+ttot+'</text></svg>'+
      '<div class="dlegend">'+tkeys.map(function(k){ return '<div><i style="background:'+(tcols[k]||"#5fd0b5")+'"></i>'+
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
    h+='<div class="sec"><h3>Posting cadence</h3><div class="sub">Posts per weekday × week, from accumulated snapshots</div>'+
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
  var base=hist[0].count||1, pts=hist.map(function(r){return r.count/base*100;});
  var mn=Math.min.apply(null,pts), mx=Math.max.apply(null,pts), pad=(mx-mn)*0.15||2;
  mn-=pad; mx+=pad;
  var X=function(i){return 6+i*(w-12)/(pts.length-1);}, Y=function(v){return h-14-(v-mn)/(mx-mn)*(h-26);};
  var d="M"+pts.map(function(v,i){return X(i).toFixed(1)+" "+Y(v).toFixed(1);}).join(" L");
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
    '<path d="'+d+'" fill="none" stroke="#e8b34b" stroke-width="2"/>'+
    '<circle cx="'+X(pts.length-1).toFixed(1)+'" cy="'+Y(pts[pts.length-1]).toFixed(1)+'" r="3.5" fill="#e8b34b"/>'+
    '<text class="al" x="6" y="10">'+mx.toFixed(0)+'</text>'+
    '<text class="al" x="6" y="'+(h-4)+'">'+mn.toFixed(0)+'</text></svg>';
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
  if(igRows) h+='<h3>Instagram</h3><dl class="kv">'+igRows+'</dl>';
  h+='<div class="sub" style="opacity:.65">Researched Sep 29, 2026</div>';
  h+='</div>';
  return h;
}
function profileHTML(b){
  if(b.type==="venue") return venueProfileHTML(b);
  var f=followersAt(b,S.di), ch7=pctChange(b,Math.max(0,S.di-7),S.di), ch30=pctChange(b,Math.max(0,S.di-30),S.di);
  var ini=b.name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join("");
  var h='<div class="sec"><div class="prof-head"><div class="prof-ava'+(b.you?" you":"")+'">'+esc(ini)+'</div>'+
    '<div><h2>'+esc(b.name)+(b.you?'<span class="youbadge">You</span>':"")+'</h2>'+
    '<div class="sub">'+esc(b.town)+locTag(b)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+(b.region==="slc"?" · St. Lawrence Co":"")+'</div></div></div>';

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
  h+='</div>';
  /* Instagram section — only rendered when there's actually IG data (no more dash rows) */
  var hasIG=!!(b.ig_handle&&(b.followHist.length||f!=null||b.postAge!=null));
  var igRows="";
  if(hasIG){
    if(f!=null) igRows+='<dt>Followers</dt><dd><b>'+fmt(f)+'</b>'+(rF?' <span style="color:var(--dim)">#'+rF.rank+' of '+rF.of+'</span>':"")+'</dd>';
    if(f!=null&&mF!=null) igRows+='<dt>vs median</dt><dd>'+(f>=mF?'<b style="color:var(--green)">'+pctStr((f-mF)/mF*100)+' above</b>':'<b style="color:var(--red)">'+pctStr((f-mF)/mF*100)+' below</b>')+'</dd>';
    if(b.last_post_date) igRows+='<dt>Last post</dt><dd><b>'+dstr(b.last_post_date)+'</b>'+(b.postAge!=null?' <span style="color:var(--dim)">('+b.postAge+'d ago)</span>':"")+'</dd>';
    if(b.last_post_type) igRows+='<dt>Format</dt><dd>'+esc(b.last_post_type)+'</dd>';
    if(b.last_post_topic) igRows+='<dt>Topic</dt><dd>'+esc(b.last_post_topic)+'</dd>';
  }
  if(igRows) h+='<h3>Instagram</h3><dl class="kv">'+igRows+'</dl>';
  /* Pricing — from the earlier web sweep */
  var priceRows="";
  if(b.price.wedding!=null) priceRows+='<dt>Wedding from</dt><dd><b>'+money(b.price.wedding)+'</b>'+(rW?' <span style="color:var(--dim)">#'+rW+' of '+wArr.length+'</span>':"")+'</dd>';
  if(b.price.session!=null) priceRows+='<dt>Session from</dt><dd><b>'+money(b.price.session)+'</b></dd>';
  if(priceRows) h+='<h3>Pricing</h3><dl class="kv">'+priceRows+'</dl>';
  /* Website intel — pilot sweep, Sep 2026 */
  var wi=WI[b.id], wrows="";
  if(wi&&!wi.unreachable){
    if(wi.services&&wi.services.length) wrows+='<dt>Services</dt><dd>'+wi.services.map(function(s){return '<span class="chip">'+esc(s)+'</span>';}).join(" ")+'</dd>';
    var yrs=wi.years_in_business!=null?wi.years_in_business+" yrs":(wi.since?"since "+wi.since:null);
    if(yrs) wrows+='<dt>In business</dt><dd><b>'+esc(yrs)+'</b></dd>';
    if(wi.coverage&&wi.coverage.length) wrows+='<dt>Coverage</dt><dd>'+esc(wi.coverage.join(" · "))+'</dd>';
    if(wi.platform) wrows+='<dt>Site built on</dt><dd>'+esc(wi.platform)+'</dd>';
  }
  if(wrows){
    h+='<h3>Website</h3><dl class="kv">'+wrows+'</dl>';
    if(wi.site_note) h+='<div class="sub">'+esc(wi.site_note)+'</div>';
    h+='<div class="sub" style="opacity:.65">Checked '+esc(wi.fetched||"Sep 2026")+'</div>';
  }
  if(!igRows&&!priceRows&&!wrows) h+='<div class="sub">No public stats tracked yet.</div>';

  if(ADMIN){
    h+='<h3>Trend</h3>';
    h+='<div class="trendgrid"><div class="stat"><div class="v pct '+(ch7==null?"fl":ch7>=0?"up":"dn")+'">'+pctStr(ch7)+'</div><div class="l">7-day</div></div>'+
       '<div class="stat"><div class="v pct '+(ch30==null?"fl":ch30>=0?"up":"dn")+'">'+pctStr(ch30)+'</div><div class="l">30-day</div></div></div>';
    h+=sparkline(b.followHist);
    h+='<div class="sub" style="margin-top:6px">Indexed to 100 at first tracked point · '+b.followHist.length+' snapshots</div>';
    if(b.followHist.length){
      h+='<div class="sub">History</div><div style="font-size:12px;color:var(--mut)">'+
        b.followHist.slice(-8).map(function(r){return dstr(r.date)+' — <b style="color:var(--txt)">'+fmt(r.count)+'</b>';}).join("<br>")+'</div>';
    }
  } else {
    h+='<div class="locknote">Per-business trend history is private. Sign in as admin to see follower trends.</div>';
  }
  h+='</div>';
  return h;
}
function marketGlanceHTML(){
  if(S.mode==="venues"){
    var caps=V.filter(function(b){return b.capacity_num!=null;}).map(function(b){return b.capacity_num;}).sort(function(a,b){return a-b;});
    var vmed=caps.length?caps[Math.floor(caps.length/2)]:null;
    return '<div class="sec"><h3>Venues at a glance</h3><div class="sub">Researched Sep 29, 2026</div>'+
      '<div class="statgrid">'+
      '<div class="stat"><div class="v" data-count="'+V.length+'">0</div><div class="l">Venues</div></div>'+
      '<div class="stat"><div class="v" data-count="'+(vmed||0)+'">0</div><div class="l">Median max guests</div></div>'+
      '<div class="stat"><div class="v">'+V.filter(function(b){return b.ig_handle;}).length+'</div><div class="l">On Instagram</div></div></div>'+
      '<div class="sub">Pick any venue — here, on the map, or in the directory — to open its profile.</div></div>';
  }
  var h='<div class="sec"><h3>Market at a glance</h3><div class="sub">As of '+esc(dstr(DATES[S.di]))+'</div>';
  var f=C.filter(function(b){return b.followers!=null;}).map(function(b){return b.followers;}).sort(function(a,b){return a-b;});
  var mF=f.length?f[Math.floor(f.length/2)]:null;
  h+='<div class="statgrid">'+
    '<div class="stat"><div class="v" data-count="'+C.length+'">0</div><div class="l">Businesses</div></div>'+
    '<div class="stat"><div class="v" data-count="'+(mF||0)+'">0</div><div class="l">Median followers</div></div>'+
    '<div class="stat"><div class="v">'+C.filter(function(b){return b.postAge!=null&&b.postAge<=30;}).length+'</div><div class="l">Posted ≤30d</div></div></div>';
  var you=BY_ID[JD_ID];
  if(you){
    h+='<div class="sec"><h3 style="font-size:17px">Your position</h3>'+
      '<div class="rankline"><span>Price rank</span><span class="rk">'+(you.price.wedding!=null?"#"+(C.filter(function(x){return x.price.wedding!=null;}).sort(function(a,b){return a.price.wedding-b.price.wedding;}).indexOf(you)+1):"—")+'</span></div>'+
      '<div class="rankline"><span>Follower rank</span><span class="rk">'+(you.followers!=null?"#"+(C.filter(function(x){return x.followers!=null;}).sort(function(a,b){return b.followers-a.followers;}).indexOf(you)+1):"—")+'</span></div>'+
      '<div class="rankline" style="border:0"><span>Posting cadence</span><span class="rk" style="font-size:15px">'+(you.postAge!=null?you.postAge+"d since post":"—")+'</span></div></div>';
  }
  h+='<div class="sub">Pick any business — here, on the map, or in the directory — to open its profile.</div></div>';
  return h;
}
function renderRight(){
  var el=$("#rightbody");
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
var map=null, pinLayer=null, pinById={}, heatLayer=null, covLayer=null, covOn=false;
function buildCoverage(){
  /* 25-mile radius circles for EVERY business and venue with real coordinates,
     regardless of the active Businesses/Venues mode — overlaps show intersecting coverage. */
  covLayer=L.layerGroup();
  var seen={};
  B.concat(V).forEach(function(b){
    if(!b._geo||b.lat==null||b.lng==null||seen[b.id]) return; seen[b.id]=1;
    var col=b.type==="venue"?"#ff9a3c":"#e8b34b";
    L.circle([b.lat,b.lng],{radius:40234,color:col,weight:1.5,opacity:.55,
      fillColor:col,fillOpacity:.06,interactive:false}).addTo(covLayer);
  });
}
function toggleCoverage(){
  if(!map||!covLayer) return;
  covOn=!covOn;
  if(covOn) covLayer.addTo(map); else map.removeLayer(covLayer);
  var t=$("#covtoggle"); if(t) t.classList.toggle("on",covOn);
}
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
  buildCoverage();
  map.on("zoomend",refreshLabels);
  map.on("zoom",refreshHeat); map.on("zoomend",refreshHeat); map.on("moveend",refreshHeat);
  map.on("click",function(e){ /* click-away on empty map deselects */
    var t=e.originalEvent&&e.originalEvent.target;
    if(t&&t.closest&&t.closest(".leaflet-marker-icon")) return;
    clearSel();
  });
  renderPins();
}
/* heat intensity: bigger follower counts weigh more, recent activity adds more */
var _maxLogF=1, topIds={};
/* heat/weight/label stats always describe the ACTIVE collection — recomputed on mode switch */
function computeModeStats(){
  _maxLogF=1; topIds={};
  C.forEach(function(b){ var f=b.followers; if(f!=null) _maxLogF=Math.max(_maxLogF,Math.log10(f+1)); });
  C.slice().sort(function(a,b){return (b.followers||0)-(a.followers||0);}).slice(0,12)
    .forEach(function(b){ topIds[b.id]=1; });
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
  return "<b>"+esc(b.name)+"</b>"+(b.you?' <span style="color:#e8b34b">(you)</span>':"")+
    '<br><span style="color:#9aa3b2;font-weight:400">'+esc(loc)+"</span>"+
    (f!=null?'<br><span style="color:#9aa3b2;font-weight:400">'+fmt(f)+" followers</span>":"");
}
function rowEl(id){ return $('#leftbody .row[data-open="'+id+'"]'); }
function refreshLabels(){
  if(!map) return;
  var z=map.getZoom(), wantPills=z>=11, pills=pinMode==="pills";
  if(wantPills!==pills){ pinMode=wantPills?"pills":"dots"; renderPins(); return; }
  /* permanent labels: selected first, then top businesses, skipping any that would overlap */
  var showMap={}, placed=[];
  var cands=[];
  if(S.sel&&BY_ID[S.sel]) cands.push(BY_ID[S.sel]);
  Object.keys(topIds).forEach(function(id){ if(id!==S.sel&&BY_ID[id]) cands.push(BY_ID[id]); });
  cands.forEach(function(b){
    var pt=map.latLngToContainerPoint([b.lat,b.lng]);
    var clash=placed.some(function(q){ return Math.abs(q.x-pt.x)<78&&Math.abs(q.y-pt.y)<42; });
    if(!clash){ showMap[b.id]=true; placed.push(pt); }
  });
  Object.keys(pinById).forEach(function(id){
    var m=pinById[id], b=BY_ID[id]; if(!b||!m) return;
    var show=pills?false:!!showMap[id];
    if(m._lbl===show) return; m._lbl=show;
    m.unbindTooltip();
    m.bindTooltip(labelFor(b),{permanent:show,direction:"top",offset:pills?[0,-16]:[0,-13],
      opacity:.97,className:"mklabel"+(b.you?" you":"")});
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
  geoList.forEach(function(b){
    var f=followersAt(b,S.di);
    var r=f!=null?Math.max(9,Math.min(26,6+Math.sqrt(f)/6)):9;
    var hollow=b.type==="venue"?false:(f==null||!b.hasPrice);
    var dim=(selId&&b.id!==selId)?" dim":"";
    var live=postedOn(b,S.di)?" live":"";
    var sel=b.id===selId?" sel":"", you=b.you?" you":"";
    var html, icon;
    if(pinMode==="pills"){
      var txt=f!=null?fmt(f):"—";
      html='<div class="zpin'+sel+you+live+dim+'" style="--lc:'+(LANE_COLOR[b.specialty]||"#888")+'">'+
        "<i></i><span>"+txt+"</span></div>";
      icon=L.divIcon({className:"zwrap",html:html});
    }else{
      var cls="mkpin"+(hollow?" hollow":"")+sel+you+live+dim;
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
    if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.12)); }
}
function flyTo(b){ if(map&&b.lat!=null) map.flyTo([b.lat,b.lng],Math.max(map.getZoom(),11),{duration:REDUCED?0:1.1}); }

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
    return '<div class="rk-row'+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'">'+
      '<span class="rk-rank">'+(i+1)+'</span>'+
      '<span class="rk-dot" style="background:'+(LANE_COLOR[b.specialty]||"#888")+'"></span>'+
      '<div class="rk-main"><div class="rk-top"><b>'+esc(b.name)+(b.you?'<span class="youbadge">You</span>':"")+'</b>'+
      '<span class="rk-val '+r.cls+'">'+esc(r.val)+'</span></div>'+
      '<div class="rk-bar"><i style="width:'+w.toFixed(1)+'%;background:'+(LANE_COLOR[b.specialty]||"#888")+'"></i></div>'+
      '<div class="rk-sub">'+esc(b.townShort)+locTag(b)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+
      (mode!=="activity"?' · <span class="rk-age">'+esc(ageStr(b.postAge))+'</span>':"")+'</div></div></div>';
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
}

/* ---------- left body ---------- */
function renderLeft(){
  var el=$("#leftbody");
  el.innerHTML=S.tab==="today"?renderToday():S.tab==="dir"?renderDir():S.tab==="ai"?renderAI():renderMarket();
  $$("[data-count]",el).forEach(function(n){
    var to=+n.getAttribute("data-count"), mon=n.getAttribute("data-money")==="1";
    if(REDUCED){ n.textContent=mon?money(to):fmt(to); return; }
    var t0=null; (function step(t){ if(!t0)t0=t; var p=Math.min(1,(t-t0)/800), e=1-Math.pow(1-p,3);
      n.textContent=mon?money(Math.round(to*e)):fmt(Math.round(to*e)); if(p<1)requestAnimationFrame(step); })(performance.now());
  });
}

/* ---------- scrubber ---------- */
var timeEl=$("#time");
function renderScrub(){
  timeEl.min=0; timeEl.max=DATES.length-1; timeEl.value=S.di;
  timeEl.style.setProperty("--fill",(DATES.length>1?S.di/(DATES.length-1)*100:100)+"%");
  $("#timelabel").innerHTML=dstr(DATES[S.di])+"<small>"+DATES.length+" daily snapshots</small>";
  $("#datelabel").innerHTML="Data as of <b>"+dstr(DATES[S.di])+"</b>";
  $("#freshnote").textContent="History from "+dstr(DATES[0]);
}
var playTimer=null;
function setPlaying(on){
  S.playing=on;
  $("#playbtn").textContent=on?"⏸":"▶";
  $("#playbtn").setAttribute("aria-label",on?"Pause replay":"Replay daily snapshots");
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

/* ---------- admin ---------- */
function askAdmin(){
  if(ADMIN){ setAdmin(false); return; }
  var back=document.createElement("div"); back.className="mback";
  back.innerHTML='<div class="modal"><h2>Admin</h2><p>Per-business trend detail is private. Enter the admin password to unlock it on this device.</p>'+
    '<input type="password" id="apw" placeholder="Password" autocomplete="off">'+
    '<div class="mrow"><button class="btn ghost" id="acancel">Cancel</button><button class="btn" id="aok">Unlock</button></div></div>';
  document.body.appendChild(back);
  var inp=$("#apw",back); inp.focus();
  function close(){ back.remove(); }
  $("#acancel",back).onclick=close; back.onclick=function(e){ if(e.target===back) close(); };
  $("#aok",back).onclick=function(){
    if(inp.value==="admin"){ setAdmin(true); close(); }
    else { inp.value=""; inp.placeholder="Try again"; inp.focus(); }
  };
  inp.onkeydown=function(e){ if(e.key==="Enter") $("#aok",back).click(); };
}
function setAdmin(on){
  ADMIN=on;
  try{ sessionStorage.setItem("pulse_admin",on?"1":"0"); }catch(e){}
  $("#adminBtn").classList.toggle("on",on);
  $("#adminBtn").textContent=on?"Admin ✓":"Admin";
  renderRight(); renderLeft();
  toast(on?"Admin mode on — trend detail unlocked.":"Admin mode off.");
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
  var ct=$("#covtoggle"); if(ct) ct.style.visibility=rk?"hidden":"visible";
  if(rk) renderRankings();
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
    /* account for the fixed side panels so edge pins (e.g. Altona) don't sit underneath them */
    if(window.innerWidth>900) map.fitBounds(L.latLngBounds(pts), {paddingTopLeft:L.point(400,90), paddingBottomRight:L.point(380,90)});
    else map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }
  if(S.view==="rankings") renderRankings();
  renderLeft(); renderRight();
}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-open]");
  if(t){ select(t.getAttribute("data-open")); return; }
  var vt=e.target.closest(".viewtoggle button");
  if(vt){ setView(vt.getAttribute("data-view")); return; }
  var mt=e.target.closest(".modetoggle button");
  if(mt){ setMode(mt.getAttribute("data-mode")); return; }
  var rb=e.target.closest("[data-rank]");
  if(rb){ S.rankMode=rb.getAttribute("data-rank"); renderRankings(); return; }
  if(e.target.closest("#covtoggle")){ toggleCoverage(); return; }
  var tb=e.target.closest(".tabs button");
  if(tb){ S.tab=tb.getAttribute("data-tab");
    $$(".tabs button").forEach(function(b){ var on=b===tb;
      b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); });
    renderLeft(); return; }
});
var fqT=null;
$("#fq").addEventListener("input",function(e){
  clearTimeout(fqT); fqT=setTimeout(function(){ S.q=e.target.value.trim(); refreshFiltered(); },160);
});
[["#flane","lane"],["#fmom","mom"],["#freg","reg"]].forEach(function(p){
  $(p[0]).addEventListener("change",function(e){ S[p[1]]=e.target.value; refreshFiltered(); });
});
function refreshFiltered(){ renderPins(); if(S.view==="rankings") renderRankings(); renderLeft(); }
timeEl.addEventListener("input",function(){ setPlaying(false); S.di=+timeEl.value; onScrub(); });
$("#playbtn").addEventListener("click",function(){ setPlaying(!S.playing); });
$("#adminBtn").addEventListener("click",askAdmin);
$("#rightclose").addEventListener("click",function(){ $("#right").classList.remove("open"); S.sel=null; renderPins(); renderRight(); });
$("#sheetgrab").addEventListener("click",function(){ $("#left").classList.toggle("open"); });
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){ setPlaying(false);
    if(window.innerWidth<=900){ $("#right").classList.remove("open"); }
    else if(S.sel){ S.sel=null; renderPins(); renderRight(); } }
  if(e.key==="/"&&document.activeElement!==$("#fq")){ e.preventDefault(); $("#fq").focus(); }
});
window.addEventListener("resize",function(){ /* rankings view flows with layout */ });

/* ---------- init ---------- */
try{ if(typeof L==="undefined") throw new Error("leaflet");
  initMap();
}catch(err){
  $("#map").innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7484;font-size:13px">Map tiles unavailable — switch to Bubbles view.</div>';
}
if(ADMIN){ $("#adminBtn").classList.add("on"); $("#adminBtn").textContent="Admin ✓"; }
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
renderScrub(); renderLeft(); renderRight();
})();
