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
  if(c) return {lat:c.lat,lng:c.lng};
  return {lat:44.6699,lng:-74.9813}; /* Potsdam fallback */
}
function jitter(id,lat,lng){ return {lat:lat,lng:lng}; } /* replaced by town spiral below */

/* ---------- enrich roster ---------- */
var IGH=D.igFollowersHistory||{};
var C=(D.competitors||[]).map(function(c){
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
  e.lat=tc.lat; e.lng=tc.lng; /* spiral placement below */
  e.townShort=(e.town||"").split(",")[0];
  return e;
});
var BY_ID={}; C.forEach(function(c){BY_ID[c.id]=c;});
/* ordered golden-angle spiral per town so same-town pins read as a cluster, not noise */
(function(){
  var groups={};
  C.forEach(function(b){ var k=townCanon(b.town); (groups[k]=groups[k]||[]).push(b); });
  Object.keys(groups).forEach(function(k){
    var g=groups[k].sort(function(a,b){return (b.followers||0)-(a.followers||0);});
    var cl=townLatLng(g[0].town);
    g.forEach(function(b,i){
      if(i===0){ b.lat=cl.lat; b.lng=cl.lng; return; }
      var a=i*2.39996, r=0.011*Math.sqrt(i);
      b.lat=cl.lat+Math.sin(a)*r; b.lng=cl.lng+Math.cos(a)*r*1.35;
    });
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
var LANE_COLOR={photo:"#e8b34b",video:"#6db3f2",both:"#b48ce8",drone:"#5fd0b5"};
var LANE_LABEL={photo:"Photo",video:"Video",both:"Photo + Video",drone:"Drone"};
var MOM_LABEL={gaining:"Gaining",slipping:"Slipping",active:"Active",quiet:"Quiet",dormant:"Dormant"};
var REG_LABEL={slc:"St. Lawrence Co",adjacent:"Nearby counties",unconfirmed:"Unconfirmed"};

/* ---------- state ---------- */
var S={ view:"map", tab:"today", di:DATES.length-1, q:"", lane:"", mom:"", reg:"",
        sel:null, playing:false };

/* ---------- filtering ---------- */
function norm(s){ return (s||"").toLowerCase(); }
function passes(b){
  if(S.q){ var q=norm(S.q);
    if(norm(b.name).indexOf(q)<0&&norm(b.ig_handle).indexOf(q)<0&&norm(b.townShort).indexOf(q)<0&&norm(b.town).indexOf(q)<0) return false; }
  if(S.lane&&b.specialty!==S.lane) return false;
  if(S.reg&&b.region!==S.reg) return false;
  if(S.mom){ var m=momentumOf(b,S.di);
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

function renderToday(){
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
function dirRow(b,i){
  var f=followersAt(b,S.di), ch=pctChange(b,Math.max(0,S.di-7),S.di);
  var pcls=ch==null?"fl":(ch>=0?"up":"dn");
  return '<div class="row'+(b.you?" you":"")+(S.sel===b.id?" sel":"")+'" data-open="'+b.id+'"'+(i<20?' style="animation-delay:'+(i*0.03)+'s"':"")+'>'+
    '<span class="dot" style="background:'+(b.you?"#e8b34b":recencyDot(b))+'"></span>'+
    '<div class="nm"><b>'+esc(b.name)+(b.you?'<span class="youbadge">You</span>':"")+'</b>'+
    '<span>'+esc(b.townShort)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+'</span></div>'+
    '<div class="meta"><b>'+fmt(f)+'</b><span>'+(b.hasPrice?money(b.price.wedding||b.price.session):"price n/a")+
    ' · <span class="pct '+pcls+'">'+pctStr(ch)+'</span></span></div></div>';
}
function renderDir(){
  var list=filtered().slice().sort(function(a,b){return (b.you?1:0)-(a.you?1:0)||((b.followers||0)-(a.followers||0));});
  var h='<div class="sec"><h3>Directory</h3><div class="sub">'+list.length+' of '+C.length+' businesses</div>';
  if(!list.length) return h+'<div class="empty-note">No businesses match these filters.</div></div>';
  h+='<div class="stagger">'+list.map(dirRow).join("")+"</div></div>";
  return h;
}

/* ---------- AI search visibility ---------- */
function renderAI(){
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

function renderMarket(){
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
function profileHTML(b){
  var f=followersAt(b,S.di), ch7=pctChange(b,Math.max(0,S.di-7),S.di), ch30=pctChange(b,Math.max(0,S.di-30),S.di);
  var ini=b.name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join("");
  var h='<div class="sec"><div class="prof-head"><div class="prof-ava'+(b.you?" you":"")+'">'+esc(ini)+'</div>'+
    '<div><h2>'+esc(b.name)+(b.you?'<span class="youbadge">You</span>':"")+'</h2>'+
    '<div class="sub">'+esc(b.town)+' · '+(LANE_LABEL[b.specialty]||b.specialty)+' · '+(REG_LABEL[b.region]||"")+'</div></div></div>';

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
  h+='<dl class="kv">'+
    '<dt>Followers</dt><dd><b>'+fmt(f)+'</b>'+(rF?' <span style="color:var(--dim)">#'+rF.rank+' of '+rF.of+'</span>':"")+'</dd>'+
    '<dt>vs median</dt><dd>'+(f!=null&&mF!=null?(f>=mF?'<b style="color:var(--green)">'+pctStr((f-mF)/mF*100)+' above</b>':'<b style="color:var(--red)">'+pctStr((f-mF)/mF*100)+' below</b>'):"—")+'</dd>'+
    '<dt>Wedding from</dt><dd><b>'+money(b.price.wedding)+'</b>'+(rW?' <span style="color:var(--dim)">#'+rW+' of '+wArr.length+'</span>':"")+'</dd>'+
    '<dt>Session from</dt><dd><b>'+money(b.price.session)+'</b></dd>'+
    '<dt>Last post</dt><dd><b>'+dstr(b.last_post_date)+'</b>'+(b.postAge!=null?' <span style="color:var(--dim)">('+b.postAge+'d ago)</span>':"")+'</dd>'+
    (b.last_post_type?'<dt>Format</dt><dd>'+esc(b.last_post_type)+'</dd>':"")+
    (b.last_post_topic?'<dt>Topic</dt><dd>'+esc(b.last_post_topic)+'</dd>':"")+
  '</dl>';

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
var map=null, pinLayer=null, pinById={};
function initMap(){
  map=L.map("map",{zoomControl:false,attributionControl:true}).setView([44.55,-74.9],9);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {maxZoom:19,opacity:0.9,
     attribution:"© OpenStreetMap contributors"}).addTo(map);
  pinLayer=L.layerGroup().addTo(map);
  map.on("zoomend",refreshLabels);
  map.on("click",function(e){ /* click-away on empty map deselects */
    var t=e.originalEvent&&e.originalEvent.target;
    if(t&&t.closest&&t.closest(".leaflet-marker-icon")) return;
    clearSel();
  });
  renderPins();
}
/* readable labels: top businesses always labeled, everything labeled when zoomed into a town */
var topIds={}, pinMode="dots";
C.slice().sort(function(a,b){return (b.followers||0)-(a.followers||0);}).slice(0,12)
  .forEach(function(b){ topIds[b.id]=1; });
function labelFor(b){
  var f=followersAt(b,S.di);
  return "<b>"+esc(b.name)+"</b>"+(b.you?' <span style="color:#e8b34b">(you)</span>':"")+
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
  var newIds={};
  list.forEach(function(b){ var first=b.followHist.length?b.followHist[0].date:null;
    if(first&&first>=DATES[Math.max(0,S.di-1)]) newIds[b.id]=1; });
  list.forEach(function(b){
    var f=followersAt(b,S.di);
    var r=f!=null?Math.max(9,Math.min(26,6+Math.sqrt(f)/6)):9;
    var hollow=f==null||!b.hasPrice;
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
  if(!map._fitDone){ map._fitDone=true;
    var pts=list.map(function(b){return [b.lat,b.lng];});
    if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.12)); }
}
function flyTo(b){ if(map) map.flyTo([b.lat,b.lng],Math.max(map.getZoom(),11),{duration:REDUCED?0:1.1}); }

/* ---------- bubble field (canvas) ---------- */
var cv=$("#bubbles"), ctx=cv.getContext("2d"), bub=[], bubAnim=null, hovId=null;
var bubLab={}, bubYT=0, bubYB=0;
var bubX={padL:64,padR:40,lmn:1,lmx:3}, bubHeadY=100;
function sizeCanvas(){ var dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=innerWidth*dpr; cv.height=innerHeight*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
function layoutBubbles(){
  var list=filtered();
  var fs=list.map(function(b){return followersAt(b,S.di);}).filter(function(f){return f!=null;});
  var mn=Math.min.apply(null,fs.concat([10])), mx=Math.max.apply(null,fs.concat([100]));
  var lmn=Math.log10(Math.max(1,mn)), lmx=Math.log10(Math.max(1,mx));
  if(lmx-lmn<1) lmx=lmn+1;
  var W=innerWidth,H=innerHeight;
  var wide=W>900;
  var padL=wide?404:58, padR=wide?380:16, padT=wide?172:176, padB=126;
  bubHeadY=wide?100:132;
  var yT=padT, yB=H-padB; bubYT=yT; bubYB=yB;
  bubX={padL:padL,padR:padR,lmn:lmn,lmx:lmx};
  function yForAge(age){ age=age==null?120:Math.min(120,age); return yB-(yB-yT)*(1-age/120); }
  function xForF(f){ var l=Math.log10(Math.max(1,f));
    return padL+(l-lmn)/(lmx-lmn)*(W-padL-padR); }
  bub=list.map(function(b){
    var f=followersAt(b,S.di);
    var x=(f==null?padL+14:xForF(f))+(hashN(b.id+"x")%1000/1000-0.5)*26;
    var y=yForAge(b.postAge)+(hashN(b.id+"y")%1000/1000-0.5)*30;
    if(f==null) y=Math.min(y,bubYB-40); /* keep no-data marks clear of the x-axis labels */
    var l=f==null?0:(Math.log10(Math.max(1,f))-lmn)/(lmx-lmn);
    var r=f!=null?9+Math.sqrt(l)*24:9;
    return {b:b,x:x,y:y,r:r,tx:x,ty:y,tr:r,hollow:f==null};
  });
  bubLab={};
  list.slice().sort(function(a,b2){return (followersAt(b2,S.di)||0)-(followersAt(a,S.di)||0);})
    .slice(0,10).forEach(function(b){ bubLab[b.id]=1; });
}
function fmtAxisF(f){ return f>=1000?(f/1000)+"k":String(f); }
function drawBubbles(){
  if(S.view!=="bubbles") return;
  var W=innerWidth,H=innerHeight;
  var padL=bubX.padL,padR=bubX.padR;
  ctx.clearRect(0,0,W,H);
  /* x gridlines: powers of 10 followers */
  ctx.font="600 10px Hanken Grotesk"; ctx.textAlign="center";
  var p;
  for(p=Math.ceil(bubX.lmn); p<=Math.floor(bubX.lmx); p++){
    var f=Math.pow(10,p);
    var x=padL+(p-bubX.lmn)/(bubX.lmx-bubX.lmn)*(W-padL-padR);
    ctx.strokeStyle="rgba(255,255,255,.06)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,bubYT-8); ctx.lineTo(x,bubYB+8); ctx.stroke();
    ctx.fillStyle="rgba(107,116,132,.95)";
    ctx.fillText(fmtAxisF(f)+" followers",Math.max(x,padL+56),bubYB+22);
  }
  /* y-axis: posting recency */
  ctx.textAlign="left";
  [["Posting now",0],["A month ago",30],["3+ months quiet",100]].forEach(function(row){
    var y=bubYB-(bubYB-bubYT)*(1-Math.min(120,row[1])/120);
    ctx.fillStyle="rgba(107,116,132,.95)";
    ctx.fillText(row[0],padL+8,y+3);
    ctx.strokeStyle="rgba(255,255,255,.07)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR+16,y); ctx.stroke();
  });
  /* title + how-to-read + lane legend */
  (function(){
    var lx=padL+8, hy=bubHeadY;
    ctx.textAlign="left";
    ctx.fillStyle="rgba(236,233,226,.95)"; ctx.font="700 16px Hanken Grotesk";
    ctx.fillText("Size vs. activity",lx,hy);
    ctx.fillStyle="rgba(154,163,178,.9)"; ctx.font="500 11px Hanken Grotesk";
    ctx.fillText("Bigger = more followers · higher = posted more recently · click a bubble for detail",lx,hy+18);
    var ly=hy+42;
    ctx.font="600 10px Hanken Grotesk";
    Object.keys(LANE_COLOR).forEach(function(k){
      ctx.fillStyle=LANE_COLOR[k];
      ctx.beginPath(); ctx.arc(lx,ly-3,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="rgba(154,163,178,.9)";
      var t=LANE_LABEL[k]||k; ctx.fillText(t,lx+10,ly);
      lx+=10+ctx.measureText(t).width+18;
    });
    ctx.fillStyle="rgba(107,116,132,.9)";
    ctx.fillText("○ no follower data",lx+4,ly);
  })();
  /* bubbles */
  bub.forEach(function(p){
    var b=p.b, sel=S.sel===b.id, hov=hovId===b.id, dim=S.sel&&!sel;
    ctx.globalAlpha=dim?0.15:1;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    if(p.hollow){ ctx.setLineDash([5,4]); ctx.strokeStyle=sel||hov?"#e8b34b":"rgba(255,255,255,.45)";
      ctx.lineWidth=sel||hov?2.5:1.5; ctx.stroke(); ctx.setLineDash([]); }
    else{ ctx.fillStyle=LANE_COLOR[b.specialty]||"#999"; ctx.globalAlpha=(dim?0.15:0.85);
      ctx.fill(); ctx.globalAlpha=dim?0.15:1;
      ctx.lineWidth=sel||hov?3:1.2; ctx.strokeStyle=sel||hov?"#e8b34b":"rgba(0,0,0,.4)"; ctx.stroke(); }
    if(b.you){ ctx.beginPath(); ctx.arc(p.x,p.y,p.r+6,0,Math.PI*2);
      ctx.strokeStyle="rgba(232,179,75,.7)"; ctx.lineWidth=2; ctx.stroke(); }
    if(sel||hov){ ctx.beginPath(); ctx.arc(p.x,p.y,p.r+9,0,Math.PI*2);
      ctx.strokeStyle="rgba(232,179,75,.4)"; ctx.lineWidth=2; ctx.stroke(); }
    ctx.globalAlpha=1;
  });
  /* labels: biggest bubbles first, width-aware declutter, flip below near the top bar */
  var labCands=bub.filter(function(p){ return bubLab[p.b.id]||S.sel===p.b.id||hovId===p.b.id; })
    .sort(function(a,b){ return b.r-a.r; });
  var placed=[];
  ctx.font="600 11px Hanken Grotesk"; ctx.textAlign="center";
  labCands.forEach(function(p){
    var b=p.b, sel=S.sel===b.id, hov=hovId===b.id;
    var nm=b.name.length>22?b.name.slice(0,21)+"…":b.name;
    var tw=ctx.measureText(nm).width;
    var below=(p.y-p.r-30)<104;
    var ly=below?p.y+p.r+12:p.y-p.r-12;
    var clash=placed.some(function(q){ return Math.abs(q.x-p.x)<(q.w+tw)/2+12&&Math.abs(q.y-ly)<22; });
    if(clash) return;
    placed.push({x:p.x,y:ly,w:tw});
    /* keep the label pill clear of the side panels */
    var maxLx0=W-padR-8-(tw+14);
    var lx0=Math.min(p.x-tw/2-7,maxLx0); lx0=Math.max(lx0,padL+8);
    var cx=lx0+tw/2+7, ly0=below?ly+8:ly-26;
    ctx.fillStyle="rgba(10,14,20,.88)";
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(lx0,ly0,tw+14,18,6); else ctx.rect(lx0,ly0,tw+14,18);
    ctx.fill();
    ctx.fillStyle=sel||hov?"#e8b34b":"rgba(236,233,226,.95)";
    ctx.fillText(nm,cx,ly0+13);
  });
}
function tickBubbles(){
  var done=true;
  bub.forEach(function(p){ ["x","y","r"].forEach(function(k){
    var t=p["t"+k], v=p[k], d=(t-v)*0.12;
    if(Math.abs(d)>0.15){ p[k]=v+d; done=false; } else p[k]=t; }); });
  drawBubbles();
  if(!done&&S.view==="bubbles") bubAnim=requestAnimationFrame(tickBubbles);
  else bubAnim=null;
}
function renderBubbles(){
  cancelAnimationFrame(bubAnim); bubAnim=null;
  layoutBubbles();
  if(REDUCED){ bub.forEach(function(p){p.x=p.tx;p.y=p.ty;p.r=p.tr;}); drawBubbles(); }
  else tickBubbles();
}
cv.addEventListener("click",function(e){
  var mx=e.clientX,my=e.clientY,best=null,bd=1e9;
  bub.forEach(function(p){ var d=Math.hypot(p.x-mx,p.y-my);
    if(d<p.r+6&&d<bd){bd=d;best=p.b;} });
  if(best) select(best.id,{fly:false});
  else clearSel(); /* click empty canvas space to deselect */
});
cv.addEventListener("mousemove",function(e){
  var mx=e.clientX,my=e.clientY,best=null,bd=1e9;
  bub.forEach(function(p){ var d=Math.hypot(p.x-mx,p.y-my);
    if(d<p.r+8&&d<bd){bd=d;best=p.b.id;} });
  if(best!==hovId){ hovId=best; cv.style.cursor=best?"pointer":"default"; drawBubbles(); }
});
cv.addEventListener("mouseleave",function(){ if(hovId){ hovId=null; drawBubbles(); } });

/* ---------- selection: highlight everywhere + fly ---------- */
function clearSel(){
  if(!S.sel) return;
  S.sel=null;
  renderPins(); renderRight();
  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
  if(S.view==="bubbles") drawBubbles();
}
function select(id,opts){
  opts=opts||{};
  S.sel=id;
  var b=BY_ID[id];
  renderPins(); renderRight();
  if(S.view==="bubbles") drawBubbles();  $$("#leftbody .row.sel").forEach(function(r){r.classList.remove("sel");});
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
  if(S.view==="bubbles") renderBubbles();
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
  var bubbles=v==="bubbles";
  cv.hidden=!bubbles;
  $("#map").style.visibility=bubbles?"hidden":"visible";
  if(bubbles){ sizeCanvas(); renderBubbles(); }
}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-open]");
  if(t){ select(t.getAttribute("data-open")); return; }
  var vt=e.target.closest(".viewtoggle button");
  if(vt){ setView(vt.getAttribute("data-view")); return; }
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
function refreshFiltered(){ renderPins(); if(S.view==="bubbles") renderBubbles(); renderLeft(); }
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
window.addEventListener("resize",function(){ if(S.view==="bubbles"){ sizeCanvas(); renderBubbles(); } });

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
