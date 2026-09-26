/* Business Pulse dashboard — dark cyber-military HUD theme.
   Renders window.PULSE_DATA (injected via data/data.js). No green anywhere, no emojis. */
(function(){
"use strict";
var D = window.PULSE_DATA || null;

/* ---------- navigation: grouped information architecture ---------- */
var NAV = [
  {group:"command", label:"Command", views:[
    {id:"overview", label:"Overview"},
    {id:"signals",  label:"Signals"},
    {id:"recency",  label:"Recency"}]},
  {group:"market", label:"Market", views:[
    {id:"voice",       label:"Share of Voice"},
    {id:"ig",          label:"Competitor IG Trends"},
    {id:"jd",          label:"JD vs Competitors"},
    {id:"pricing",     label:"Pricing"},
    {id:"directory",   label:"Directory"},
    {id:"entrants",    label:"New Entrants"},
    {id:"connections", label:"Connections"}]},
  {group:"intel", label:"Intel", views:[
    {id:"sweep",     label:"Website Sweeps"},
    {id:"ai",        label:"AI Visibility"},
    {id:"aiprompts", label:"AI by Prompt"}]},
  {group:"add", label:"Add", views:[
    {id:"add", label:"Competitor Intake"}]}
];
var VIEW_GROUP={};
NAV.forEach(function(g){ g.views.forEach(function(v){ VIEW_GROUP[v.id]=g.group; }); });

/* ---------- helpers ---------- */
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function pill(t, cls){ return '<span class="pill '+cls+'">'+esc(t)+"</span>"; }
function fmtN(n){ return Number(n).toLocaleString("en-US"); }
function deltaPill(n){
  if(n==null) return pill("n/a","gray");
  if(n>0) return '<span class="delta-up">+'+fmtN(n)+"</span>";
  if(n<0) return '<span class="delta-dn">'+fmtN(n)+"</span>";
  return '<span class="delta-0">0</span>';
}
function shortDate(d){ if(!d) return "—"; var p=String(d).slice(0,10).split("-"); var m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return m[+p[1]-1]+" "+(+p[2]); }
function shortTick(d){ var p=String(d).slice(0,10).split("-"); return (+p[1])+"/"+(+p[2]); }
function daysAgo(d){
  if(!d) return null;
  var a=new Date(String(d).slice(0,10)+"T12:00:00"), b=new Date();
  return Math.round((b-a)/86400000);
}
function siteLink(url){
  if(!url) return "";
  return '<a href="https://'+esc(url)+'" target="_blank" rel="noopener">Website</a>';
}
function igLink(handle){
  if(!handle) return "";
  return '<a href="https://instagram.com/'+esc(handle)+'" target="_blank" rel="noopener">Instagram</a>';
}
/* "verified as of" chip — every number on the dashboard carries its provenance */
function srcChip(dateStr, label){
  return '<div class="src"><span class="sdot"></span>As of '+esc(dateStr?shortDate(dateStr):"—")+" · "+esc(label)+"</div>";
}

var SOURCE_COLORS={
  "Web search":"blue","Instagram":"tan","Facebook":"blue","Referral":"amber",
  "AI audit":"red","Client mention":"amber","Other":"gray"
};
function sourcePill(label){ return pill(label||"Other", SOURCE_COLORS[label]||"gray"); }

var CHART_COLORS=["#7dd3fc","#f59e0b","#d8b98a","#f87171","#94a3b8","#38bdf8","#fbbf24","#e2e8f0"];
var GRID="rgba(139,152,169,.12)", TICK="#8b98a9";

/* ---------- count-up animation ---------- */
function countUp(el, target, suffix){
  suffix=suffix||"";
  var dur=950, t0=null;
  function fmt(n){ return Math.round(n).toLocaleString("en-US")+suffix; }
  function step(t){
    if(!t0) t0=t;
    var p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
    el.textContent=fmt(target*e);
    if(p<1) requestAnimationFrame(step); else el.textContent=fmt(target);
  }
  if(target===0){ el.textContent=fmt(0); return; }
  requestAnimationFrame(step);
}

/* ---------- Chart.js theme + fallback ---------- */
var HAS_CHART = (typeof Chart!=="undefined");
if(HAS_CHART){
  Chart.defaults.color=TICK;
  Chart.defaults.font.family='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  Chart.defaults.animation.duration=900;
  Chart.defaults.animation.easing="easeOutQuart";
}
function baseOptions(ymin, ymax){
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:"index",intersect:false},
    plugins:{legend:{labels:{color:TICK,boxWidth:12,usePointStyle:true,pointStyle:"line",font:{size:11}}},
             tooltip:{backgroundColor:"#141d2e",borderColor:"#26344a",borderWidth:1,titleColor:"#e8eef6",bodyColor:"#8b98a9",padding:10}},
    scales:{
      x:{grid:{color:GRID},ticks:{color:TICK,font:{size:10,maxTicksLimit:8}}},
      y:{grid:{color:GRID},ticks:{color:TICK,font:{size:10,callback:function(v){return Number(v).toLocaleString("en-US");}}},
         min:ymin, max:ymax}
    }
  };
}
function svgLine(series){
  var W=760,H=300,padL=52,padR=8,padT=14,padB=30;
  var xs=[],seen={};
  series.forEach(function(s){s.points.forEach(function(p){if(!seen[p.x]){seen[p.x]=1;xs.push(p.x);}});});
  xs.sort();
  var ys=series.reduce(function(a,s){return a.concat(s.points.map(function(p){return p.y;}));},[]);
  if(!xs.length||!ys.length) return '<p class="chartfallback">No data yet.</p>';
  var ymin=Math.min.apply(null,ys),ymax=Math.max.apply(null,ys);
  if(ymin===ymax){ymin-=1;ymax+=1;}
  var pad=(ymax-ymin)*0.15; ymin-=pad; ymax+=pad;
  function X(i){return xs.length===1?padL+(W-padL-padR)/2:padL+i*(W-padL-padR)/(xs.length-1);}
  function Y(v){return padT+(1-(v-ymin)/(ymax-ymin))*(H-padT-padB);}
  var xi={}; xs.forEach(function(x,i){xi[x]=i;});
  var s='<svg viewBox="0 0 '+W+" "+H+'" style="width:100%;height:auto;display:block" role="img">';
  for(var g=0;g<=4;g++){var gy=Y(ymin+(ymax-ymin)*g/4);
    s+='<line x1="'+padL+'" y1="'+gy.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+gy.toFixed(1)+'" stroke="rgba(139,152,169,.15)"/>';}
  series.forEach(function(sr,si){
    var col=sr.color||CHART_COLORS[si%CHART_COLORS.length];
    var pts=sr.points.map(function(p){return X(xi[p.x]).toFixed(1)+","+Y(p.y).toFixed(1);}).join(" ");
    s+='<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="'+(sr.bold?2.6:1.6)+'"'+(sr.dashed?' stroke-dasharray="6,4"':"")+"/>";
  });
  return s+"</svg>";
}
function makeLineChart(canvasId, series, opts){
  opts=opts||{};
  var host=document.getElementById(canvasId);
  if(!host) return null;
  if(!HAS_CHART){ host.outerHTML='<div class="chartfallback">'+svgLine(series)+'<p>Live animations need network access for Chart.js.</p></div>'; return null; }
  var labels=[],seen={};
  series.forEach(function(s){s.points.forEach(function(p){if(!seen[p.x]){seen[p.x]=1;labels.push(p.x);}});});
  labels.sort();
  var li={}; labels.forEach(function(l,i){li[l]=i;});
  var ymin=Infinity,ymax=-Infinity;
  series.forEach(function(s){s.points.forEach(function(p){if(p.y<ymin)ymin=p.y;if(p.y>ymax)ymax=p.y;});});
  if(!isFinite(ymin)){ymin=0;ymax=1;}
  if(ymin===ymax){ymin-=1;ymax+=1;}
  var pad=(ymax-ymin)*(opts.padPct!=null?opts.padPct:0.15); ymin-=pad; ymax+=pad;
  if(opts.min!=null) ymin=opts.min; if(opts.max!=null) ymax=opts.max;
  var datasets=series.map(function(s,i){
    var col=s.color||CHART_COLORS[i%CHART_COLORS.length];
    return {label:s.label, data:labels.map(function(l){var f=s.points.filter(function(p){return p.x===l;})[0];return f?f.y:null;}),
      borderColor:col, backgroundColor:s.fill?col+"2e":"rgba(0,0,0,0)", borderWidth:s.bold?3:2, pointRadius:s.bold?3:2,
      pointBackgroundColor:col, tension:0.28, spanGaps:true,
      borderDash:s.dashed?[7,5]:[], fill:s.fill?"origin":false};
  });
  var o=baseOptions(ymin,ymax);
  if(opts.yTick) o.scales.y.ticks.callback=opts.yTick;
  var chart=new Chart(host.getContext("2d"),{type:"line",data:{labels:labels.map(shortTick),datasets:datasets},options:o});
  return chart;
}

/* ---------- shared lookups ---------- */
var compByHandle={}, compById={};
(D?D.competitors:[]).forEach(function(c){ compById[c.id]=c; if(c.ig_handle) compByHandle[c.ig_handle]=c; });
function handleName(h){ return compByHandle[h]?compByHandle[h].name:"@"+h; }
function compName(id){ return compById[id]?compById[id].name:id; }

var RUN_ORDER={baseline:0,daily:1,"daily-evening":2,"daily-midday":3};
function runKey(r){ return r.date+" "+(RUN_ORDER[r.run]||0); }
function aiRuns(){
  var runs={};
  D.aiVisibility.forEach(function(r){ var k=runKey(r); (runs[k]=runs[k]||{date:r.date,run:r.run,rows:[]}).rows.push(r); });
  var keys=Object.keys(runs).sort();
  keys.forEach(function(k){ var r0=runs[k].rows[0];
    runs[k].label=shortDate(runs[k].date)+(r0.run==="daily"?"":(" · "+r0.run.replace("daily-",""))); });
  return {runs:runs, keys:keys};
}
function latestAIRun(){
  var rows=D.aiVisibility; if(!rows.length) return null;
  var rr=aiRuns(), keys=rr.keys; if(!keys.length) return null;
  var last=rr.runs[keys[keys.length-1]];
  var byEng={};
  last.rows.forEach(function(r){ (byEng[r.engine]=byEng[r.engine]||[]).push(r); });
  var engines=Object.keys(byEng).map(function(e){
    var rs=byEng[e], reach=rs.filter(function(r){return r.jd_named!=="unreachable";});
    var yes=reach.filter(function(r){return r.jd_named==="yes";}).length;
    var part=reach.filter(function(r){return r.jd_named==="partial";}).length;
    var ranks=reach.filter(function(r){return r.jd_rank!=null;}).map(function(r){return r.jd_rank;});
    return {engine:e, namedLabel:yes+"/"+reach.length+(part?" (+"+part+" partial)":""),
      bestRank:ranks.length?Math.min.apply(null,ranks):null,
      score:reach.length?(yes+0.5*part)/reach.length:null};
  });
  var sc=engines.filter(function(e){return e.score!=null;}).map(function(e){return e.score;});
  var pct=sc.length?Math.round(100*sc.reduce(function(a,b){return a+b;},0)/sc.length):null;
  return {date:last.date, label:last.label, engines:engines, pct:pct};
}
var PROMPTS=[
  "best wedding videographer St. Lawrence County NY",
  "best wedding photographer Potsdam NY",
  "drone photographer for real estate North Country NY",
  "how much does wedding photography and videography cost in St. Lawrence County NY",
  "family photographer Potsdam NY"
];
var PROMPT_SHORT=["Wedding video · SLC","Wedding photo · Potsdam","Drone real estate · N. Country","Cost photo+video · SLC","Family photo · Potsdam"];
var ENGINES=["ChatGPT","Claude","Gemini","Perplexity"];
var ENGINE_COLORS={ChatGPT:"#7dd3fc",Claude:"#f59e0b",Gemini:"#d8b98a",Perplexity:"#f87171"};
function metaDate(){ return (D&&D.meta&&D.meta.generated_at||"").slice(0,10); }
function latestHistDate(){
  var mx=null;
  Object.keys(D.igFollowersHistory).forEach(function(h){
    D.igFollowersHistory[h].forEach(function(p){ if(!mx||p.date>mx) mx=p.date; });
  });
  return mx;
}
function latestOwnDate(){
  var mx=null;
  D.ownAccounts.forEach(function(r){ if(!mx||r.date>mx) mx=r.date; });
  return mx;
}
function latestSweep(){
  var s=D.webSweepHistory.slice().sort(function(a,b){return a.date<b.date?-1:1;});
  return s[s.length-1]||null;
}

/* ---------- SIGNALS (shared by KPI deck + Signals view) ---------- */
function computeSignals(){
  var signals=[];
  D.competitors.forEach(function(c){
    if(!c.discovered_date) return;
    var d=daysAgo(c.discovered_date);
    if(d!=null && d<=14){
      signals.push({date:c.discovered_date, cls:"blue", type:"New entrant",
        html:"<b>"+esc(c.name)+"</b> joined the roster — "+esc(c.town)+". Source: "+esc(c.source_label)+"."});
    }
  });
  var movers=Object.keys(D.igFollowersHistory).map(function(handle){
    var pts=D.igFollowersHistory[handle]; var first=pts[0], last=pts[pts.length-1];
    return {handle:handle, delta:last.count-first.count, date:last.date};
  }).sort(function(a,b){return b.delta-a.delta;});
  if(movers.length){
    var top=movers[0], bot=movers[movers.length-1];
    if(top.delta>0) signals.push({date:top.date, cls:"blue", type:"IG surge",
      html:"<b>"+esc(handleName(top.handle))+"</b> gained <b>+"+fmtN(top.delta)+"</b> followers since first snapshot."});
    if(bot.delta<0) signals.push({date:bot.date, cls:"red", type:"IG slide",
      html:"<b>"+esc(handleName(bot.handle))+"</b> lost <b>"+fmtN(bot.delta)+"</b> followers since first snapshot."});
  }
  var latest=latestSweep();
  if(latest){
    Object.keys(latest.pages||{}).forEach(function(sl){
      var p=latest.pages[sl]||{};
      if(p.status==="changed") signals.push({date:latest.date, cls:"amber", type:"Site changed",
        html:"<b>"+esc(sl)+"</b> changed on the latest sweep — "+esc(p.note||"no note")+"."});
    });
    var unreachCount=Object.keys(latest.pages||{}).filter(function(sl){return (latest.pages[sl]||{}).status==="unreachable";}).length;
    if(unreachCount) signals.push({date:latest.date, cls:"red", type:"Unreachable",
      html:"<b>"+unreachCount+"</b> sweep pages unreachable on "+shortDate(latest.date)+" — see Website Sweeps."});
  }
  var lastAI=latestAIRun();
  if(lastAI){
    lastAI.engines.forEach(function(e){
      if(e.score===0) signals.push({date:lastAI.date, cls:"red", type:"AI blind spot",
        html:"<b>"+esc(e.engine)+"</b> named JD on 0 prompts in the latest audit."});
    });
  }
  var priced=D.competitors.filter(function(c){return c.pricing_url;});
  if(priced.length) signals.push({date:metaDate(), cls:"tan", type:"Pricing intel",
    html:"<b>"+priced.length+"</b> competitors now have linked pricing pages — see Pricing."});
  signals.sort(function(a,b){ return a.date<b.date?1:a.date>b.date?-1:0; });
  return signals;
}
function renderSignals(){
  var el=document.getElementById("view-signals");
  var signals=computeSignals();
  var h='<div class="card"><h2>Change <span class="accent">signals</span></h2><p class="hint">'
    +signals.length+' active signals across roster, IG, sweeps, pricing, and AI visibility.</p>'
    +srcChip(metaDate(),"All routines")+'<ul class="plain">';
  signals.forEach(function(s){
    h+="<li>"+pill(s.type,s.cls)+" "+s.html+' <span class="subtle">'+shortDate(s.date)+"</span></li>";
  });
  h+="</ul></div>";
  el.innerHTML=h;
}

/* ---------- KPI command deck (Overview) ---------- */
function aiPromptScores(){
  var rr=aiRuns(), keys=rr.keys; if(!keys.length) return [];
  var last=rr.runs[keys[keys.length-1]];
  return PROMPTS.map(function(p,pi){
    var rs=last.rows.filter(function(r){return r.prompt===p && r.jd_named!=="unreachable";});
    if(!rs.length) return {short:PROMPT_SHORT[pi], pct:null};
    var sc=rs.reduce(function(a,r){return a+(r.jd_named==="yes"?1:r.jd_named==="partial"?0.5:0);},0);
    return {short:PROMPT_SHORT[pi], pct:Math.round(100*sc/rs.length)};
  });
}
function pricingStats(){
  var withP=D.competitors.filter(function(c){return c.pricing;});
  var linked=D.competitors.filter(function(c){return c.pricing_url;});
  var amounts=[];
  withP.forEach(function(c){
    var m=String(c.pricing).match(/\$[\d,]+/g);
    if(m) m.forEach(function(x){ var v=parseInt(x.replace(/[$,]/g,""),10); if(v>50) amounts.push(v); });
  });
  amounts.sort(function(a,b){return a-b;});
  return {count:withP.length, linked:linked.length,
    range:amounts.length?"$"+fmtN(amounts[0])+" – $"+fmtN(amounts[amounts.length-1]):"—"};
}
function recencyBands(){
  var counts={Active:0,Quiet:0,Dormant:0,Unknown:0};
  D.competitors.forEach(function(c){
    var d=daysAgo(c.last_post_date);
    if(d==null) counts.Unknown++;
    else if(d<7) counts.Active++;
    else if(d<=30) counts.Quiet++;
    else counts.Dormant++;
  });
  return counts;
}
function sovStats(){
  var byAcct={};
  D.ownAccounts.forEach(function(r){ (byAcct[r.account]=byAcct[r.account]||[]).push(r); });
  var jdNow=0, jdFirst=0;
  Object.keys(byAcct).forEach(function(a){
    var pts=byAcct[a].sort(function(p,q){return p.date<q.date?-1:1;});
    jdNow+=pts[pts.length-1].follower_count; jdFirst+=pts[0].follower_count;
  });
  var compNow=0;
  Object.keys(D.igFollowersHistory).forEach(function(h){
    var pts=D.igFollowersHistory[h]; compNow+=pts[pts.length-1].count;
  });
  var total=jdNow+compNow;
  return {jd:jdNow, delta:jdNow-jdFirst, share:total?Math.round(100*jdNow/total):0, n:3+Object.keys(D.igFollowersHistory).length};
}
function topMovers(){
  return Object.keys(D.igFollowersHistory).map(function(handle){
    var pts=D.igFollowersHistory[handle].slice().sort(function(a,b){return a.date<b.date?-1:1;});
    var last=pts[pts.length-1], cutoff=new Date(new Date(last.date+"T12:00:00").getTime()-7*86400000);
    var ref=pts[0];
    for(var i=pts.length-1;i>=0;i--){ if(new Date(pts[i].date+"T12:00:00")<=cutoff){ ref=pts[i]; break; } }
    return {handle:handle, delta:last.count-ref.count, now:last.count};
  }).sort(function(a,b){return b.delta-a.delta;});
}
function connHub(){
  var deg={};
  (D.connections||[]).forEach(function(k){
    deg[k.a]=(deg[k.a]||0)+1; deg[k.b]=(deg[k.b]||0)+1;
  });
  var names=Object.keys(deg).sort(function(a,b){return deg[b]-deg[a];});
  return {count:(D.connections||[]).length, hub:names[0]||null, hubN:names.length?deg[names[0]]:0};
}
function kpiTile(o){
  return '<button class="kpi fam-'+o.fam+'" data-goto="'+o.goto+'" aria-label="'+esc(o.label)+' — open '+esc(o.gotoLabel||o.goto)+'">'
    +'<span class="kpi-label">'+esc(o.label)+'</span>'
    +'<span class="kpi-num"'+(o.num!=null?' data-count="'+o.num+'" data-suffix="'+(o.suffix||"")+'"':"")+'>'
    +(o.num!=null?"0":esc(o.text||"—"))+"</span>"
    +(o.sub?'<span class="kpi-sub">'+o.sub+"</span>":"")
    +(o.delta?'<span class="kpi-delta '+(o.deltaCls||"")+'">'+o.delta+"</span>":"")
    +srcChip(o.asof,o.source)
    +'<span class="kpi-go" aria-hidden="true">›</span></button>';
}
function renderOverview(){
  var el=document.getElementById("view-overview");
  var comps=D.competitors, md=metaDate();
  var slc=comps.filter(function(c){return c.region==="slc";}).length;
  var adj=comps.filter(function(c){return c.region==="adjacent";}).length;
  var unc=comps.length-slc-adj;
  var entr7=comps.filter(function(c){var d=daysAgo(c.discovered_date);return d!=null&&d<=7;});
  var sigs=computeSignals();
  var sigTypes={}; sigs.forEach(function(s){sigTypes[s.type]=(sigTypes[s.type]||0)+1;});
  var sov=sovStats();
  var bands=recencyBands();
  var ps=pricingStats();
  var lai=latestAIRun();
  var psc=aiPromptScores().filter(function(p){return p.pct!=null;});
  var best=psc.slice().sort(function(a,b){return b.pct-a.pct;})[0];
  var worst=psc.slice().sort(function(a,b){return a.pct-b.pct;})[0];
  var sw=latestSweep();
  var swChanged=0, swUnreach=0;
  if(sw){ Object.keys(sw.pages||{}).forEach(function(sl){var st=(sw.pages[sl]||{}).status;
    if(st==="changed")swChanged++; if(st==="unreachable")swUnreach++; }); }
  var hub=connHub();
  var movers=topMovers();
  var m0=movers[0];

  var tiles=[
    kpiTile({fam:"ice",goto:"directory",gotoLabel:"Directory",label:"Competitors tracked",num:comps.length,
      sub:slc+" SLC · "+adj+" adjacent · "+unc+" unconfirmed",asof:md,source:"Roster"}),
    kpiTile({fam:"ice",goto:"entrants",gotoLabel:"New Entrants",label:"New entrants · 7 days",num:entr7.length,
      sub:entr7.length?esc(entr7.slice(0,3).map(function(c){return c.name;}).join(" · "))+(entr7.length>3?" · +"+(entr7.length-3)+" more":""):"No new entrants this week",
      asof:md,source:"Roster"}),
    kpiTile({fam:"amber",goto:"signals",gotoLabel:"Signals",label:"Active signals",num:sigs.length,
      sub:Object.keys(sigTypes).slice(0,3).map(function(t){return sigTypes[t]+" "+t.toLowerCase();}).join(" · ")||"All quiet",
      asof:md,source:"All routines"}),
    kpiTile({fam:"ice",goto:"voice",gotoLabel:"Share of Voice",label:"JD combined audience",num:sov.jd,
      sub:sov.share+"% of "+sov.n+" tracked accounts",
      delta:(sov.delta>=0?"+":"")+fmtN(sov.delta)+" since first snapshot",deltaCls:sov.delta>=0?"up":"dn",
      asof:latestOwnDate(),source:"IG snapshots"}),
    kpiTile({fam:"tan",goto:"recency",gotoLabel:"Recency",label:"Posting now · active",num:bands.Active,
      sub:bands.Quiet+" quiet · "+bands.Dormant+" dormant · "+bands.Unknown+" unknown",
      asof:md,source:"IG reads"}),
    kpiTile({fam:"amber",goto:"pricing",gotoLabel:"Pricing",label:"Pricing coverage",num:Math.round(100*ps.count/comps.length),suffix:"%",
      sub:ps.count+" of "+comps.length+" publish · "+ps.linked+" linked pages · range "+ps.range,
      asof:md,source:"Site research"}),
    kpiTile({fam:"ice",goto:"ai",gotoLabel:"AI Visibility",label:"AI visibility · JD named",num:lai?lai.pct:null,suffix:"%",text:lai?null:"—",
      sub:lai?("Best: "+best.short+" "+best.pct+"% · Worst: "+worst.short+" "+worst.pct+"%"):"No audit data",
      asof:lai?lai.date:null,source:"AI audit"}),
    kpiTile({fam:"tan",goto:"sweep",gotoLabel:"Website Sweeps",label:"Site changes · latest sweep",num:swChanged,
      sub:swUnreach+" unreachable · "+(sw&&sw.fetched!=null?sw.fetched+" of "+sw.of_total+" fetched":""),
      asof:sw?sw.date:null,source:"Web sweep"}),
    kpiTile({fam:"amber",goto:"connections",gotoLabel:"Connections",label:"Verified connections",num:hub.count,
      sub:hub.hub?("Hub: "+hub.hub+" ("+hub.hubN+" links)"):"No connections yet",
      asof:md,source:"Field intel"}),
    kpiTile({fam:"ice",goto:"ig",gotoLabel:"IG Trends",label:"Top IG mover · 7 days",num:m0?m0.delta:null,text:m0?null:"—",
      sub:m0?("@"+m0.handle+" → "+fmtN(m0.now)+" followers"+(movers[1]?" · @"+movers[1].handle+" "+(movers[1].delta>=0?"+":"")+fmtN(movers[1].delta):"")):"No snapshot data",
      delta:m0?((m0.delta>=0?"+":"")+fmtN(m0.delta)+" followers"):"",deltaCls:m0&&m0.delta>=0?"up":"dn",
      asof:latestHistDate(),source:"IG snapshots"})
  ];

  var h='<div class="deckhead"><h2>// Command <span class="accent">deck</span></h2>'
    +srcChip(md,"Morning sync · all routines")+"</div>"
    +'<div class="kpideck">'+tiles.join("")+"</div>";

  h+='<div class="card"><h2>Latest <span class="accent">changes</span></h2><p class="hint">What moved most recently. Full detail lives under Signals.</p><ul class="plain">';
  sigs.slice(0,6).forEach(function(s){
    h+="<li>"+pill(s.type,s.cls)+" "+s.html+' <span class="subtle">'+shortDate(s.date)+"</span></li>";
  });
  if(!sigs.length) h+="<li>All quiet — no material changes.</li>";
  h+="</ul></div>";

  el.innerHTML=h;
  el.querySelectorAll(".kpi-num[data-count]").forEach(function(n){
    countUp(n, +n.dataset.count, n.dataset.suffix||"");
  });
  el.querySelectorAll(".kpi[data-goto]").forEach(function(b){
    b.addEventListener("click",function(){ gotoView(b.dataset.goto); });
  });
}
function gotoView(id){
  var g=VIEW_GROUP[id]||"command";
  showGroup(g);
  showView(id);
}

/* ---------- RECENCY: last-post tracking with activity bands ---------- */
function bandFor(d){
  if(d==null) return {label:"Unknown", cls:"gray"};
  if(d<7) return {label:"Active", cls:"blue"};
  if(d<=30) return {label:"Quiet", cls:"tan"};
  return {label:"Dormant", cls:"red"};
}
function renderRecency(){
  var el=document.getElementById("view-recency");
  var rows=D.competitors.map(function(c){
    var d=daysAgo(c.last_post_date);
    return {c:c, days:d, band:bandFor(d)};
  });
  rows.sort(function(a,b){
    if(a.days==null && b.days==null) return a.c.name<b.c.name?-1:1;
    if(a.days==null) return 1;
    if(b.days==null) return -1;
    return a.days-b.days;
  });
  var counts={Active:0,Quiet:0,Dormant:0,Unknown:0};
  rows.forEach(function(r){ counts[r.band.label]++; });
  var tot=rows.length||1;

  var h='<div class="card"><h2>Posting <span class="accent">recency</span></h2><p class="hint">'
    +'Days since each competitor\u2019s last Instagram post. Bands: Active &lt; 7 days · Quiet 7–30 · Dormant &gt; 30 · Unknown = not yet collected.</p>'
    +srcChip(metaDate(),"IG reads")
    +'<div class="bandbar">'
    +[["Active","blue"],["Quiet","tan"],["Dormant","red"],["Unknown","gray"]].map(function(b){
      var w=Math.max(1.5,100*counts[b[0]]/tot);
      return '<div class="bandseg '+b[1]+'" style="width:'+w.toFixed(1)+'%" title="'+b[0]+": "+counts[b[0]]+'"></div>';
    }).join("")+"</div>"
    +'<div class="controls">'
    +pill(counts.Active+" Active","blue")+pill(counts.Quiet+" Quiet","tan")
    +pill(counts.Dormant+" Dormant","red")+pill(counts.Unknown+" Unknown","gray")
    +"</div>"
    +'<div class="tablewrap"><table class="rows"><thead><tr><th>Competitor</th><th>Last post</th><th class="num">Days ago</th><th>Type</th><th>Topic</th><th>Band</th></tr></thead><tbody>';
  rows.forEach(function(r){
    var c=r.c;
    h+="<tr><td><b>"+esc(c.name)+"</b>"+(c.ig_handle?'<br><span class="subtle">@'+esc(c.ig_handle)+"</span>":"")+"</td>"
      +"<td>"+(c.last_post_date?shortDate(c.last_post_date):"—")+'</td><td class="num">'
      +(r.days==null?"—":r.days)+"</td><td>"+esc(c.last_post_type||"—")+"</td>"
      +"<td>"+esc(c.last_post_topic||"—")+"</td><td>"+pill(r.band.label,r.band.cls)+"</td></tr>";
  });
  h+="</tbody></table></div></div>";
  el.innerHTML=h;
}

/* ---------- SHARE OF VOICE ---------- */
function renderVoice(){
  var el=document.getElementById("view-voice");
  var ents=[];
  var byAcct={};
  D.ownAccounts.forEach(function(r){ (byAcct[r.account]=byAcct[r.account]||[]).push(r); });
  var acctLabels={jdmeyers_:"JD · personal",jdmeyersproductions:"JD · Productions",fourierxform:"JD · FourierXForm"};
  Object.keys(byAcct).forEach(function(a){
    var pts=byAcct[a].sort(function(p,q){return p.date<q.date?-1:1;});
    ents.push({name:acctLabels[a]||("JD · "+a), handle:"@"+a, count:pts[pts.length-1].follower_count, jd:true});
  });
  Object.keys(D.igFollowersHistory).forEach(function(handle){
    var pts=D.igFollowersHistory[handle];
    ents.push({name:handleName(handle), handle:"@"+handle, count:pts[pts.length-1].count, jd:false});
  });
  var total=ents.reduce(function(a,e){return a+e.count;},0);
  ents.forEach(function(e){ e.share=total?100*e.count/total:0; });
  ents.sort(function(a,b){return b.count-a.count;});
  var jdTotal=ents.filter(function(e){return e.jd;}).reduce(function(a,e){return a+e.count;},0);
  var top5=ents.filter(function(e){return !e.jd;}).slice(0,5);
  var top5Total=top5.reduce(function(a,e){return a+e.count;},0);

  var h='<div class="card"><h2>Share of <span class="accent">voice</span></h2><p class="hint">'
    +'Follower share across '+ents.length+' tracked accounts (JD\u2019s 3 + '+Object.keys(D.igFollowersHistory).length+' competitors).</p>'
    +srcChip(latestOwnDate(),"IG snapshots")
    +'<div class="sov-duel">'
    +'<div class="sov-side jd"><div class="sov-big" data-count="'+jdTotal+'">0</div><div class="sov-cap">JD combined audience</div></div>'
    +'<div class="sov-vs">VS</div>'
    +'<div class="sov-side"><div class="sov-big gray" data-count="'+top5Total+'">0</div><div class="sov-cap">Top 5 competitors combined</div></div>'
    +"</div>";
  ents.forEach(function(e){
    var w=Math.max(2,e.share);
    h+='<div class="sovrow"><div class="sovhead"><span class="sovname">'+(e.jd?'<b class="jdmark">'+esc(e.name)+"</b>":esc(e.name))
      +'</span><span class="sovmeta">'+esc(e.handle)+" · "+fmtN(e.count)+" · "+e.share.toFixed(1)+'%</span></div>'
      +'<div class="sovbar"><div class="sovfill'+(e.jd?" jd":"")+'" style="width:'+w.toFixed(1)+'%"></div></div></div>';
  });
  h+="</div>";
  el.innerHTML=h;
  el.querySelectorAll(".sov-big[data-count]").forEach(function(n){ countUp(n,+n.dataset.count,""); });
}

/* ---------- IG TRENDS ---------- */
var igChart=null;
function renderIG(){
  var el=document.getElementById("view-ig");
  var hist=D.igFollowersHistory;
  var handles=Object.keys(hist).sort(function(a,b){
    var la=hist[a][hist[a].length-1].count, lb=hist[b][hist[b].length-1].count; return lb-la; });
  var top5=handles.slice(0,5);

  var h='<div class="card"><h2>Follower <span class="accent">trends</span></h2><p class="hint">Toggle handles to compare. More snapshots accumulate with each daily sync.</p>'
    +srcChip(latestHistDate(),"IG snapshots")
    +'<div class="controls" id="igChecks">'
    +handles.map(function(x){ return '<label class="chk'+(top5.indexOf(x)>=0?" on":"")+'"><input type="checkbox" class="vh" value="'+esc(x)+'"'+(top5.indexOf(x)>=0?" checked":"")+"> @"+esc(x)+"</label>"; }).join("")
    +'</div><div class="chartwrap"><canvas id="igCanvas"></canvas></div></div>';

  h+='<div class="card"><h2>Snapshot <span class="accent">delta</span> table</h2><p class="hint">First to latest snapshot per handle, with latest activity notes.</p><div class="tablewrap"><table class="rows"><thead><tr><th>Competitor</th><th class="num">Followers</th><th class="num">Delta</th><th>Latest activity</th></tr></thead><tbody>';
  var latestAct={};
  D.igActivity.forEach(function(a){ if(!latestAct[a.handle]||latestAct[a.handle].date<a.date) latestAct[a.handle]=a; });
  handles.forEach(function(x){
    var pts=hist[x], first=pts[0], last=pts[pts.length-1], d=last.count-first.count;
    var act=latestAct[x]?latestAct[x].activity:"—";
    h+="<tr><td><b>"+esc(handleName(x))+'</b><br><span class="subtle">@'+esc(x)+"</span></td>"
      +'<td class="num">'+fmtN(last.count)+'</td><td class="num">'+deltaPill(d)+"</td><td>"+esc(act)+"</td></tr>";
  });
  h+="</tbody></table></div></div>";
  el.innerHTML=h;
}
function initIGChart(){
  if(igChart) { igChart.resize(); return; }
  var hist=D.igFollowersHistory;
  var boxes=[].slice.call(document.querySelectorAll("#igChecks .chk"));
  var series=boxes.map(function(box,i){
    var x=box.querySelector("input").value;
    return {label:"@"+x, color:CHART_COLORS[i%CHART_COLORS.length], bold:true,
      points:hist[x].map(function(p){return {x:p.date,y:p.count};}), _box:box, _i:i};
  });
  igChart=makeLineChart("igCanvas", series);
  if(!igChart) return;
  boxes.forEach(function(box,i){
    var input=box.querySelector("input");
    if(!input.checked) igChart.setDatasetVisibility(i,false);
    input.addEventListener("change",function(){
      box.classList.toggle("on",input.checked);
      igChart.setDatasetVisibility(i,input.checked);
      igChart.update();
    });
  });
  igChart.update();
}

/* ---------- JD VS COMPETITORS ---------- */
var jdChart=null;
function renderJD(){
  var el=document.getElementById("view-jd");
  var h='<div class="card"><h2>JD <span class="accent">vs</span> top competitors</h2><p class="hint">JD\u2019s three accounts (solid) against the four largest tracked competitor handles (dashed).</p>'
    +srcChip(latestHistDate(),"IG snapshots")
    +'<div class="chartwrap tall"><canvas id="jdCanvas"></canvas></div></div>';
  h+='<div class="card"><h2>Latest <span class="accent">counts</span></h2><div class="tablewrap"><table class="rows"><thead><tr><th>Account</th><th class="num">Followers</th><th class="num">Delta</th></tr></thead><tbody>';
  var byAcct={};
  D.ownAccounts.forEach(function(r){ (byAcct[r.account]=byAcct[r.account]||[]).push({x:r.date,y:r.follower_count}); });
  Object.keys(byAcct).forEach(function(a){ byAcct[a].sort(function(p,q){return p.x<q.x?-1:1;}); });
  var acctLabels={jdmeyers_:"JD personal",jdmeyersproductions:"JD Productions",fourierxform:"FourierXForm"};
  Object.keys(byAcct).sort().forEach(function(a){
    var pts=byAcct[a], last=pts[pts.length-1], d=last.y-pts[0].y;
    h+="<tr><td><b>JD · "+esc(acctLabels[a]||a)+'</b><br><span class="subtle">@'+esc(a)+"</span></td>"
      +'<td class="num">'+fmtN(last.y)+'</td><td class="num">'+deltaPill(d)+"</td></tr>";
  });
  ["juliakiaphotos","emilymurphy_photo","allisonleephotographyny","laurawellsphotography"].forEach(function(x){
    var pts=D.igFollowersHistory[x]; if(!pts) return;
    var last=pts[pts.length-1], d=last.count-pts[0].count;
    h+="<tr><td><b>"+esc(handleName(x))+'</b><br><span class="subtle">@'+esc(x)+"</span></td>"
      +'<td class="num">'+fmtN(last.count)+'</td><td class="num">'+deltaPill(d)+"</td></tr>";
  });
  h+="</tbody></table></div></div>";
  el.innerHTML=h;
}
function initJDChart(){
  if(jdChart){ jdChart.resize(); return; }
  var byAcct={};
  D.ownAccounts.forEach(function(r){ (byAcct[r.account]=byAcct[r.account]||[]).push({x:r.date,y:r.follower_count}); });
  Object.keys(byAcct).forEach(function(a){ byAcct[a].sort(function(p,q){return p.x<q.x?-1:1;}); });
  var acctColors={jdmeyers_:"#7dd3fc",jdmeyersproductions:"#f59e0b",fourierxform:"#d8b98a"};
  var acctLabels={jdmeyers_:"JD personal",jdmeyersproductions:"JD Productions",fourierxform:"FourierXForm"};
  var series=Object.keys(byAcct).sort().map(function(a){
    return {label:"JD · "+(acctLabels[a]||a), color:acctColors[a]||"#7dd3fc", bold:true, points:byAcct[a], fill:true}; });
  var grays=["#64748b","#475569","#94a3b8","#334155"];
  ["juliakiaphotos","emilymurphy_photo","allisonleephotographyny","laurawellsphotography"].forEach(function(x,i){
    var pts=D.igFollowersHistory[x]; if(!pts) return;
    series.push({label:"@"+x, color:grays[i%grays.length], dashed:true,
      points:pts.map(function(p){return {x:p.date,y:p.count};})});
  });
  jdChart=makeLineChart("jdCanvas", series, {padPct:0.25});
}

/* ---------- WEB SWEEPS ---------- */
function renderSweep(){
  var el=document.getElementById("view-sweep");
  var sweeps=D.webSweepHistory.slice().sort(function(a,b){return a.date<b.date?1:-1;});
  var statusPill={baseline:["Baseline","gray"],unchanged:["Unchanged","blue"],changed:["Changed","amber"],unreachable:["Unreachable","red"],"not-fetched":["Not fetched","gray"]};
  var h="";
  sweeps.forEach(function(s){
    var slugs=Object.keys(s.pages||{});
    var counts={}; slugs.forEach(function(sl){ var st=(s.pages[sl]||{}).status||"unchanged"; counts[st]=(counts[st]||0)+1; });
    h+='<div class="card"><div class="timeline"><div class="dt">'+shortDate(s.date)+'</div><div class="lbl">'+esc(s.run_label)+"</div>"
      +'<div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap">'+(s.fetched!=null?pill("Fetched "+s.fetched+" of "+s.of_total,"blue"):"")
      +Object.keys(counts).map(function(st){ var p=statusPill[st]||[st,"gray"]; return pill(counts[st]+" "+p[0],p[1]); }).join("")+"</div>"
      +(s.summary?'<p class="hint">'+esc(s.summary)+"</p>":"");
    if((s.new_entrants||[]).length) h+="<p>"+s.new_entrants.map(function(n){return pill("New: "+n,"blue");}).join(" ")+"</p>";
    if((s.roster_corrections||[]).length) h+='<ul class="plain">'+s.roster_corrections.map(function(c){return "<li>"+esc(c)+"</li>";}).join("")+"</ul>";
    if(slugs.length){
      var order={changed:0,unreachable:1,baseline:2,"not-fetched":3,unchanged:4};
      slugs.sort(function(a,b){ var sa=(s.pages[a]||{}).status, sb=(s.pages[b]||{}).status; return (order[sa]==null?5:order[sa])-(order[sb]==null?5:order[sb]); });
      h+='<div class="tablewrap"><table class="rows"><thead><tr><th>Page</th><th>Status</th><th>Note</th></tr></thead><tbody>';
      slugs.forEach(function(sl){
        var p=s.pages[sl]||{}, st=p.status||"unchanged", sp=statusPill[st]||[st,"gray"];
        h+="<tr><td><b>"+esc(sl)+"</b></td><td>"+pill(sp[0],sp[1])+"</td><td>"+esc(p.note||"—")+"</td></tr>";
      });
      h+="</tbody></table></div>";
    }
    h+="</div></div>";
  });
  el.innerHTML=h||'<div class="card"><p class="hint">No sweep runs yet.</p></div>';
}

/* ---------- AI VISIBILITY ---------- */
var aiChart=null;
function renderAI(){
  var el=document.getElementById("view-ai");
  var rr=aiRuns(), runs=rr.runs, runKeys=rr.keys;

  var h='<div class="card"><h2>JD named — <span class="accent">% of prompts</span>, by engine</h2><p class="hint">Share of reachable prompts per run where JD was named (partial = half credit).</p>'
    +srcChip(runKeys.length?runs[runKeys[runKeys.length-1]].date:null,"AI audit")
    +'<div class="chartwrap"><canvas id="aiCanvas"></canvas></div></div>';

  h+='<div class="card"><h2>Engine <span class="accent">scorecard</span></h2><p class="hint">Every run, every engine: prompts naming JD and best rank.</p><div class="tablewrap"><table class="rows"><thead><tr><th>Run</th>'
    +ENGINES.map(function(e){return "<th>"+esc(e)+"</th>";}).join("")+"</tr></thead><tbody>";
  runKeys.slice().reverse().forEach(function(k){
    h+="<tr><td><b>"+esc(runs[k].label)+"</b></td>";
    ENGINES.forEach(function(e){
      var rs=runs[k].rows.filter(function(r){return r.engine===e;});
      if(!rs.length){ h+="<td>—</td>"; return; }
      var reach=rs.filter(function(r){return r.jd_named!=="unreachable";});
      if(!reach.length){ h+="<td>"+pill("Unreachable","gray")+"</td>"; return; }
      var yes=reach.filter(function(r){return r.jd_named==="yes";}).length;
      var part=reach.filter(function(r){return r.jd_named==="partial";}).length;
      var ranks=reach.filter(function(r){return r.jd_rank!=null;}).map(function(r){return r.jd_rank;});
      var cell=pill(yes+"/"+reach.length+(part?" +"+part+"p":""), yes>=3?"blue":yes>=1?"amber":"red");
      if(ranks.length) cell+=' <span class="num" style="font-size:11px">best #'+Math.min.apply(null,ranks)+"</span>";
      h+="<td>"+cell+"</td>";
    });
    h+="</tr>";
  });
  h+="</tbody></table></div></div>";

  var lastK=runKeys[runKeys.length-1], last=runs[lastK];
  h+='<div class="card"><h2>Latest run <span class="accent">detail</span> — '+esc(last.label)+'</h2><div class="tablewrap"><table class="rows"><thead><tr><th>Prompt</th>'
    +ENGINES.map(function(e){return "<th>"+esc(e)+"</th>";}).join("")+"</tr></thead><tbody>";
  PROMPTS.forEach(function(ptext,pi){
    h+="<tr><td><b>P"+(pi+1)+"</b> "+esc(PROMPT_SHORT[pi]||ptext)+"</td>";
    ENGINES.forEach(function(e){
      var r=last.rows.filter(function(x){return x.engine===e && x.prompt===ptext;})[0];
      if(!r){ h+="<td>—</td>"; return; }
      var cell;
      if(r.jd_named==="yes") cell=pill("JD #"+r.jd_rank+(r.of_total?" of "+r.of_total:""), r.jd_rank===1?"blue":"tan");
      else if(r.jd_named==="partial") cell=pill("Partial","amber");
      else if(r.jd_named==="unreachable") cell=pill("Unreachable","gray");
      else cell=pill("Not named","red");
      h+="<td>"+cell+"</td>";
    });
    h+="</tr>";
  });
  h+="</tbody></table></div></div>";

  var freq={}, engSeen={};
  D.aiVisibility.forEach(function(r){ (r.rivals||[]).forEach(function(rv){
    freq[rv]=(freq[rv]||0)+1; (engSeen[rv]=engSeen[rv]||{})[r.engine]=1; }); });
  var rivals=Object.keys(freq).sort(function(a,b){return freq[b]-freq[a];}).slice(0,30);
  h+='<div class="card"><h2>Rival <span class="accent">frequency</span></h2><p class="hint">Competitors named by AI engines instead of / alongside JD, across all runs.</p><div class="tablewrap"><table class="rows"><thead><tr><th>Rival</th><th class="num">Mentions</th><th>Engines</th></tr></thead><tbody>';
  rivals.forEach(function(rv){
    h+="<tr><td><b>"+esc(rv)+'</b></td><td class="num">'+freq[rv]+"</td><td>"+esc(Object.keys(engSeen[rv]).join(", "))+"</td></tr>";
  });
  h+="</tbody></table></div></div>";
  el.innerHTML=h;
}
function initAIChart(){
  if(aiChart){ aiChart.resize(); return; }
  var rr=aiRuns(), runs=rr.runs, runKeys=rr.keys;
  var series=ENGINES.map(function(e){
    var pts=runKeys.map(function(k){
      var rs=runs[k].rows.filter(function(r){return r.engine===e && r.jd_named!=="unreachable";});
      if(!rs.length) return null;
      var sc=rs.reduce(function(a,r){return a+(r.jd_named==="yes"?1:r.jd_named==="partial"?0.5:0);},0);
      return {x:runs[k].label, y:Math.round(100*sc/rs.length)};
    }).filter(Boolean);
    return {label:e, color:ENGINE_COLORS[e]||"#94a3b8", bold:true, points:pts};
  }).filter(function(s){return s.points.length;});
  aiChart=makeLineChart("aiCanvas", series, {min:0, max:100, padPct:0.05,
    yTick:function(v){return v+"%";}});
}

/* ---------- AI BY PROMPT: per-prompt trend + rivals ---------- */
var aipCharts=[];
function renderAIByPrompt(){
  var el=document.getElementById("view-aiprompts");
  var rr=aiRuns(), runs=rr.runs, runKeys=rr.keys;
  var lastK=runKeys[runKeys.length-1];
  var h="";
  PROMPTS.forEach(function(ptext,pi){
    var pts=runKeys.map(function(k){
      var rs=runs[k].rows.filter(function(r){return r.prompt===ptext && r.jd_named!=="unreachable";});
      if(!rs.length) return null;
      var sc=rs.reduce(function(a,r){return a+(r.jd_named==="yes"?1:r.jd_named==="partial"?0.5:0);},0);
      return {x:runs[k].label, y:Math.round(100*sc/rs.length)};
    }).filter(Boolean);
    var rivals={}, ranks=[];
    runs[lastK].rows.filter(function(r){return r.prompt===ptext;}).forEach(function(r){
      (r.rivals||[]).forEach(function(rv){ rivals[rv]=(rivals[rv]||[]).concat([r.engine]); });
      if(r.jd_named==="yes"&&r.jd_rank!=null) ranks.push(r.engine+" #"+r.jd_rank);
    });
    var rnames=Object.keys(rivals);
    h+='<div class="card"><h2>P'+(pi+1)+" — "+esc(PROMPT_SHORT[pi]||ptext)+'</h2>'
      +'<p class="hint">'+esc(ptext)+"</p>"
      +'<div class="chartwrap" style="height:200px"><canvas id="aipCanvas-'+pi+'"></canvas></div>'
      +'<div class="rowline">'
      +(ranks.length?pill("JD: "+ranks.join(", "),"blue"):pill("JD not named","red"))
      +"</div>"
      +(rnames.length?'<p class="hint" style="margin:8px 0 0">Rivals named latest run: '+rnames.map(function(rv){return "<b>"+esc(rv)+"</b> ("+esc(rivals[rv].join(", "))+")";}).join("; ")+"</p>"
        :'<p class="hint" style="margin:8px 0 0">No rivals named on the latest run.</p>')
      +"</div>";
  });
  el.innerHTML=h||'<div class="card"><p class="hint">No AI audit data yet.</p></div>';
  aipCharts=runKeys.map(function(){return null;});
}
function initAIByPromptCharts(){
  var rr=aiRuns(), runs=rr.runs, runKeys=rr.keys;
  PROMPTS.forEach(function(ptext,pi){
    if(aipCharts[pi]){ aipCharts[pi].resize(); return; }
    var pts=runKeys.map(function(k){
      var rs=runs[k].rows.filter(function(r){return r.prompt===ptext && r.jd_named!=="unreachable";});
      if(!rs.length) return null;
      var sc=rs.reduce(function(a,r){return a+(r.jd_named==="yes"?1:r.jd_named==="partial"?0.5:0);},0);
      return {x:runs[k].label, y:Math.round(100*sc/rs.length)};
    }).filter(Boolean);
    aipCharts[pi]=makeLineChart("aipCanvas-"+pi, [{label:"JD named %", color:"#7dd3fc", bold:true, points:pts}],
      {min:0, max:100, padPct:0.08, yTick:function(v){return v+"%";}});
  });
}

/* ---------- PRICING TRACKER ---------- */
function renderPricing(){
  var el=document.getElementById("view-pricing");
  var list=D.competitors.filter(function(c){return c.pricing;})
    .sort(function(a,b){return a.name<b.name?-1:1;});
  var ps=pricingStats();
  var h='<div class="card"><h2>Pricing <span class="accent">tracker</span></h2><p class="hint">'
    +list.length+' of '+D.competitors.length+' competitors publish pricing ('+Math.round(100*list.length/D.competitors.length)+'%). '
    +'“View pricing” opens the verified pricing page. Intel captured from public sites and IG bio links. Observed range: <b>'+esc(ps.range)+'</b>.</p>'
    +srcChip(metaDate(),"Site research")
    +'<div class="tablewrap"><table class="rows"><thead><tr><th>Competitor</th><th>Location</th><th>Pricing</th><th>Source page</th></tr></thead><tbody>';
  list.forEach(function(c){
    h+="<tr><td><b>"+esc(c.name)+"</b>"+(c.ig_handle?'<br><span class="subtle">@'+esc(c.ig_handle)+"</span>":"")+"</td>"
      +"<td>"+esc(c.town)+"</td><td>"+esc(c.pricing)+"</td><td>"
      +(c.pricing_url?'<a href="'+esc(c.pricing_url)+'" target="_blank" rel="noopener">View pricing</a>':"<span class=\"subtle\">—</span>")
      +"</td></tr>";
  });
  h+="</tbody></table></div></div>";
  el.innerHTML=h;
}

/* ---------- DIRECTORY: SLC / adjacent / unconfirmed subsections ---------- */
function renderDirectory(){
  var el=document.getElementById("view-directory");
  var h='<div class="card"><h2>Competitor <span class="accent">directory</span></h2><p class="hint">'+D.competitors.length+' tracked competitors. Search and filter the full roster.</p>'
    +srcChip(metaDate(),"Roster")
    +'<div class="controls"><input type="text" id="dirQ" placeholder="Search name, town, county, notes…">'
    +'<select id="dirSpec"><option value="">All specialties</option><option value="photo">Photo</option><option value="video">Video</option><option value="both">Photo + Video</option><option value="drone">Drone</option></select>'
    +'<select id="dirStatus"><option value="">Any status</option><option value="active">Active</option><option value="uncertain">Uncertain</option></select>'
    +'<label class="chk"><input type="checkbox" class="vh" id="dirPrice"> Has pricing</label></div>'
    +'<div id="dirList"></div></div>'
    +'<details class="excl"><summary>Deliberately excluded ('+D.excluded.length+')</summary><ul class="plain">'
    +D.excluded.map(function(x){return "<li><b>"+esc(x.name)+"</b> — "+esc(x.reason)+"</li>";}).join("")
    +"</ul></details>";
  el.innerHTML=h;

  var specPill={photo:["Photo","blue"],video:["Video","tan"],both:["Photo+Video","tan"],drone:["Drone","amber"]};
  function card(c){
    var sp=specPill[c.specialty]||[c.specialty,"gray"];
    var links=[];
    if(c.website) links.push(siteLink(c.website));
    if(c.ig_handle) links.push(igLink(c.ig_handle));
    if(c.pricing_url) links.push('<a href="'+esc(c.pricing_url)+'" target="_blank" rel="noopener">Pricing</a>');
    return '<div class="dir-card"><div class="name">'+esc(c.name)+'</div>'
      +'<div class="meta">'+esc(c.town)+(c.county&&c.county!=="unknown"?' <span class="subtle">· '+esc(c.county)+" Co.</span>":"")+"</div>"
      +'<div class="rowline">'+pill(sp[0],sp[1])
      +pill(c.status==="active"?"Active":"Uncertain",c.status==="active"?"blue":"amber")
      +sourcePill(c.source_label)
      +(c.pricing?'<span class="pricing">'+esc(c.pricing)+"</span>":"")
      +(c.may2026_web_score!=null?pill("May 2026 score: "+c.may2026_web_score,"gray"):"")+"</div>"
      +(links.length?'<div class="rowline">'+links.join(" · ")+"</div>":"")
      +(c.notes?'<div class="notes">'+esc(c.notes)+"</div>":"")
      +((c.flags||[]).length?'<div class="rowline">'+c.flags.map(function(f){return pill(f,"gray");}).join("")+"</div>":"")
      +"</div>";
  }
  var SECTIONS=[
    {region:"slc", title:"St. Lawrence County", sub:"Confirmed in-county operators"},
    {region:"adjacent", title:"Adjacent counties", sub:"Franklin · Jefferson · Lewis · Clinton · Essex · Hamilton · Herkimer"},
    {region:"unconfirmed", title:"Location unconfirmed", sub:"Kept on the roster without guessing a county"}
  ];
  function draw(){
    var q=document.getElementById("dirQ").value.toLowerCase(),
        sp=document.getElementById("dirSpec").value,
        st=document.getElementById("dirStatus").value,
        pr=document.getElementById("dirPrice").checked;
    function match(c){
      if(sp&&c.specialty!==sp) return false;
      if(st&&c.status!==st) return false;
      if(pr&&!c.pricing) return false;
      if(q){ var blob=(c.name+" "+c.town+" "+c.county+" "+(c.notes||"")+" "+(c.ig_handle||"")).toLowerCase(); if(blob.indexOf(q)<0) return false; }
      return true;
    }
    var total=0, out="";
    SECTIONS.forEach(function(sec){
      var list=D.competitors.filter(function(c){return c.region===sec.region && match(c);})
        .sort(function(a,b){return a.name<b.name?-1:1;});
      total+=list.length;
      out+='<h3 class="dirsec">'+esc(sec.title)+' <span class="pill blue">'+list.length+"</span></h3>"
        +'<p class="hint">'+esc(sec.sub)+"</p>"
        +(list.length?list.map(card).join(""):'<p class="hint">No matches in this section.</p>');
    });
    document.getElementById("dirList").innerHTML='<p class="hint">'+total+" of "+D.competitors.length+" shown</p>"+out;
  }
  ["dirQ","dirSpec","dirStatus"].forEach(function(id){
    document.getElementById(id).addEventListener(id==="dirQ"?"input":"change",draw);
  });
  var priceBox=document.getElementById("dirPrice"), priceLbl=priceBox.parentElement;
  priceBox.addEventListener("change",function(){ priceLbl.classList.toggle("on",priceBox.checked); draw(); });
  draw();
}

/* ---------- NEW ENTRANTS ---------- */
function renderEntrants(){
  var el=document.getElementById("view-entrants");
  var list=D.competitors.filter(function(c){return c.discovered_date;})
    .sort(function(a,b){return a.discovered_date<b.discovered_date?1:-1;});
  var h='<div class="card"><h2>New <span class="accent">entrants</span></h2><p class="hint">'
    +list.length+' competitors with a recorded discovery date, newest first.</p>'
    +srcChip(metaDate(),"Roster")
    +'<div class="tablewrap"><table class="rows"><thead><tr><th>Competitor</th><th>Location</th><th>Discovered</th><th>Source</th><th>Specialty</th></tr></thead><tbody>';
  var specName={photo:"Photo",video:"Video",both:"Photo+Video",drone:"Drone"};
  list.forEach(function(c){
    h+="<tr><td><b>"+esc(c.name)+"</b>"+(c.ig_handle?'<br><span class="subtle">@'+esc(c.ig_handle)+"</span>":"")+"</td>"
      +"<td>"+esc(c.town)+"</td><td>"+shortDate(c.discovered_date)+"</td>"
      +"<td>"+sourcePill(c.source_label)+"</td><td>"+esc(specName[c.specialty]||c.specialty)+"</td></tr>";
  });
  h+="</tbody></table></div></div>";
  el.innerHTML=h;
}

/* ---------- CONNECTIONS: animated node graph + grouped list ---------- */
var CONN_COLORS={"second-shooter":"blue","styled-shoot":"tan","co-tagged":"amber","referral":"red"};
var CONN_LABELS={"second-shooter":"Second shooter","styled-shoot":"Styled shoot","co-tagged":"Co-tagged","referral":"Referral"};
var EDGE_STYLE={
  "second-shooter":{color:"#7dd3fc",dash:[],width:2.2},
  "co-tagged":{color:"#f59e0b",dash:[6,4],width:1.6},
  "styled-shoot":{color:"#d8b98a",dash:[],width:1.6},
  "referral":{color:"#f87171",dash:[],width:1.6}
};
var NODE_REGION_COLOR={slc:"#7dd3fc",adjacent:"#f59e0b",unconfirmed:"#94a3b8",unknown:"#d8b98a"};
var graph={nodes:[],edges:[],raf:0,running:false,hover:null,pinned:null,W:0,H:0,bound:false};

function normName(s){
  return String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ")
    .replace(/\b(photography|photographer|photo|films|film|media|studio|studios|llc|co|productions|production)\b/g," ")
    .replace(/\s+/g," ").trim();
}
function matchCompetitor(name){
  var n=normName(name), best=null, bestLen=0;
  if(!n) return null;
  D.competitors.forEach(function(c){
    var cn=normName(c.name);
    if(!cn) return;
    if(cn===n||cn.indexOf(n)===0||n.indexOf(cn)===0){
      if(cn.length>bestLen){ best=c; bestLen=cn.length; }
    }
  });
  return best;
}
function graphBuild(){
  var map={}, edges=[];
  (D.connections||[]).forEach(function(k){
    [k.a,k.b].forEach(function(nm){
      if(!map[nm]){
        var comp=matchCompetitor(nm);
        map[nm]={name:nm, comp:comp, region:comp?comp.region:"unknown", degree:0, x:0, y:0, vx:0, vy:0};
      }
    });
    map[k.a].degree++; map[k.b].degree++;
    edges.push({a:map[k.a], b:map[k.b], type:k.type, evidence:k.evidence, date:k.date});
  });
  return {nodes:Object.keys(map).map(function(k){return map[k];}), edges:edges};
}
function graphTick(){
  var nodes=graph.nodes, edges=graph.edges, i, j, a, b, dx, dy, d, f;
  for(i=0;i<nodes.length;i++){ a=nodes[i];
    for(j=i+1;j<nodes.length;j++){ b=nodes[j];
      dx=a.x-b.x; dy=a.y-b.y; d=Math.sqrt(dx*dx+dy*dy)||1;
      f=Math.min(9000/(d*d),2.4);
      dx/=d; dy/=d;
      a.vx+=dx*f; a.vy+=dy*f; b.vx-=dx*f; b.vy-=dy*f;
    }
    a.vx+=(graph.W/2-a.x)*0.012; a.vy+=(graph.H/2-a.y)*0.012;
  }
  edges.forEach(function(e){
    a=e.a; b=e.b; dx=b.x-a.x; dy=b.y-a.y; d=Math.sqrt(dx*dx+dy*dy)||1;
    f=(d-150)*0.02; dx/=d; dy/=d;
    a.vx+=dx*f; a.vy+=dy*f; b.vx-=dx*f; b.vy-=dy*f;
  });
  var max=0;
  nodes.forEach(function(n){
    n.vx*=0.82; n.vy*=0.82;
    n.x+=n.vx; n.y+=n.vy;
    n.x=Math.max(40,Math.min(graph.W-40,n.x));
    n.y=Math.max(26,Math.min(graph.H-26,n.y));
    max=Math.max(max,Math.abs(n.vx)+Math.abs(n.vy));
  });
  return max;
}
function trunc(s,n){ s=String(s); return s.length>n?s.slice(0,n-1)+"…":s; }
function graphFocus(){ return graph.pinned||graph.hover; }
function graphDim(n){
  var f=graphFocus();
  if(!f) return 1;
  if(n===f) return 1;
  for(var i=0;i<graph.edges.length;i++){var e=graph.edges[i];
    if((e.a===f&&e.b===n)||(e.b===f&&e.a===n)) return 1;}
  return 0.12;
}
function graphDraw(t){
  var cv=document.getElementById("connCanvas");
  if(!cv) return;
  var ctx=cv.getContext("2d");
  if(!ctx) return;
  var W=graph.W, H=graph.H;
  ctx.clearRect(0,0,W,H);
  var hub=null, hd=-1;
  graph.nodes.forEach(function(n){ if(n.degree>hd){hd=n.degree;hub=n;} });
  graph.edges.forEach(function(e){
    var st=EDGE_STYLE[e.type]||EDGE_STYLE["co-tagged"];
    var al=Math.min(graphDim(e.a),graphDim(e.b));
    ctx.save(); ctx.globalAlpha=Math.max(0.06,al);
    ctx.strokeStyle=st.color; ctx.lineWidth=st.width;
    if(st.dash&&st.dash.length) ctx.setLineDash(st.dash);
    ctx.beginPath(); ctx.moveTo(e.a.x,e.a.y); ctx.lineTo(e.b.x,e.b.y); ctx.stroke();
    ctx.restore();
  });
  graph.nodes.forEach(function(n){
    var r=7+n.degree*2.5, al=graphDim(n), col=NODE_REGION_COLOR[n.region]||"#d8b98a";
    var f=graphFocus();
    ctx.save(); ctx.globalAlpha=al;
    if(n===hub && !window.matchMedia("(prefers-reduced-motion: reduce)").matches){
      var pr=r+7+3*Math.sin((t||0)/380);
      ctx.globalAlpha=0.45*al; ctx.strokeStyle=col; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(n.x,n.y,pr,0,6.2832); ctx.stroke();
      ctx.globalAlpha=al;
    }
    if(n===f){ ctx.shadowColor=col; ctx.shadowBlur=16; }
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,6.2832); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle="#0a0e14";
    ctx.font="700 9px ui-monospace,Menlo,monospace";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(String(n.degree),n.x,n.y+0.5);
    ctx.fillStyle="rgba(232,238,246,"+(0.9*al).toFixed(2)+")";
    ctx.font="11px -apple-system,'Segoe UI',Roboto,sans-serif";
    ctx.fillText(trunc(n.name,20),n.x,n.y+r+13);
    ctx.restore();
  });
}
function graphNodeAt(x,y){
  var best=null,bd=1e9;
  graph.nodes.forEach(function(n){
    var r=7+n.degree*2.5+10;
    var d=Math.hypot(n.x-x,n.y-y);
    if(d<r&&d<bd){bd=d;best=n;}
  });
  return best;
}
function regionLabel(r){ return r==="slc"?"St. Lawrence Co.":r==="adjacent"?"Adjacent county":r==="unconfirmed"?"Unconfirmed":"Not on roster"; }
function graphTip(n,x,y){
  var tip=document.getElementById("graphTip");
  if(!tip) return;
  if(!n){ tip.style.display="none"; return; }
  var links=graph.edges.filter(function(e){return e.a===n||e.b===n;}).map(function(e){
    var o=e.a===n?e.b:e.a;
    return '<div class="gt-link">'+pill(CONN_LABELS[e.type]||e.type,CONN_COLORS[e.type]||"gray")
      +' <b>'+esc(o.name)+"</b>"
      +(e.date?' <span class="subtle">'+shortDate(e.date)+"</span>":"")+"</div>";
  }).join("");
  tip.innerHTML='<div class="gt-name">'+esc(n.name)+"</div>"
    +'<div class="gt-sub">'+esc(regionLabel(n.region))+" · "+n.degree+" link"+(n.degree===1?"":"s")+"</div>"+links;
  tip.style.display="block";
  var wrap=document.getElementById("graphWrap");
  var ww=wrap?wrap.clientWidth:400;
  tip.style.left=Math.min(Math.max(8,x+16),Math.max(8,ww-200))+"px";
  tip.style.top=Math.max(8,y-12)+"px";
}
function graphPos(ev,cv){
  var r=cv.getBoundingClientRect();
  var t=ev.touches&&ev.touches[0]?ev.touches[0]:ev;
  return {x:t.clientX-r.left, y:t.clientY-r.top};
}
function sizeGraph(){
  var wrap=document.getElementById("graphWrap"), cv=document.getElementById("connCanvas");
  if(!wrap||!cv) return;
  var w=wrap.clientWidth, h=wrap.clientHeight, dpr=window.devicePixelRatio||1;
  if(!w||!h) return;
  cv.width=w*dpr; cv.height=h*dpr;
  cv.style.width=w+"px"; cv.style.height=h+"px";
  var ctx=cv.getContext("2d");
  if(ctx) ctx.setTransform(dpr,0,0,dpr,0,0);
  graph.W=w; graph.H=h;
}
function graphLoop(t){
  if(!graph.running) return;
  graphTick();
  graphDraw(t||0);
  graph.raf=requestAnimationFrame(graphLoop);
}
function startGraph(){
  var cv=document.getElementById("connCanvas");
  if(!cv||!cv.getContext||!cv.getContext("2d")) return;
  if(!graph.nodes.length){
    var b=graphBuild();
    graph.nodes=b.nodes; graph.edges=b.edges;
  }
  sizeGraph();
  var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  graph.nodes.forEach(function(n){
    n.x=graph.W*0.2+Math.random()*graph.W*0.6;
    n.y=graph.H*0.2+Math.random()*graph.H*0.6;
    n.vx=0; n.vy=0;
  });
  if(reduced){ for(var i=0;i<250;i++) graphTick(); }
  graph.hover=null; graph.pinned=null;
  graph.running=true;
  cancelAnimationFrame(graph.raf);
  graph.raf=requestAnimationFrame(graphLoop);
  if(!graph.bound){
    graph.bound=true;
    cv.addEventListener("mousemove",function(ev){
      var p=graphPos(ev,cv), n=graphNodeAt(p.x,p.y);
      graph.hover=n; graphTip(n,p.x,p.y);
      cv.style.cursor=n?"pointer":"default";
    });
    cv.addEventListener("mouseleave",function(){ graph.hover=null; graphTip(null); });
    cv.addEventListener("click",function(ev){
      var p=graphPos(ev,cv), n=graphNodeAt(p.x,p.y);
      graph.pinned=(n&&graph.pinned!==n)?n:null;
      if(n) graphTip(n,p.x,p.y); else graphTip(null);
    });
    cv.addEventListener("touchstart",function(ev){
      var p=graphPos(ev,cv), n=graphNodeAt(p.x,p.y);
      graph.pinned=(n&&graph.pinned!==n)?n:null;
      graph.hover=n;
      if(n) graphTip(n,p.x,p.y); else graphTip(null);
    },{passive:true});
    window.addEventListener("resize",function(){
      if(!graph.running) return;
      sizeGraph();
    });
  }
}
function stopGraph(){
  graph.running=false;
  cancelAnimationFrame(graph.raf);
  var tip=document.getElementById("graphTip");
  if(tip) tip.style.display="none";
}
function renderConnections(){
  var el=document.getElementById("view-connections");
  var conns=D.connections||[];
  var byName={};
  conns.forEach(function(k){
    [k.a,k.b].forEach(function(n){ (byName[n]=byName[n]||[]).push(k); });
  });
  var names=Object.keys(byName).sort();
  var typeCounts={};
  conns.forEach(function(k){ typeCounts[k.type]=(typeCounts[k.type]||0)+1; });

  var h='<div class="card"><h2>Collaboration <span class="accent">network</span></h2><p class="hint">'
    +conns.length+' verified connection'+(conns.length===1?"":"s")+' across '+names.length+' photographers. '
    +'Node color = region · edge style = connection type · node number = link count. '
    +'Hover or tap a node to inspect; click to isolate its network. Nothing is recorded without evidence.</p>'
    +srcChip(metaDate(),"Field intel");
  if(!conns.length){
    h+='<p class="hint">No verified connections yet. New ones found in the field go through Competitor Intake (or paste them to Luna) and land here after the next sync.</p>';
  }else{
    h+='<div class="graphwrap" id="graphWrap"><canvas id="connCanvas"></canvas><div class="graphtip" id="graphTip" style="display:none"></div></div>'
      +'<div class="graphlegend">'
      +Object.keys(CONN_LABELS).map(function(t){
        var st=EDGE_STYLE[t];
        return '<span class="gleg"><span class="gline" style="border-top:'+st.width+'px '+(st.dash&&st.dash.length?"dashed":"solid")+' '+st.color+'"></span>'
          +esc(CONN_LABELS[t])+' <span class="subtle">'+(typeCounts[t]||0)+"</span></span>";
      }).join("")
      +'<span class="gleg"><span class="gnode" style="background:#7dd3fc"></span>SLC</span>'
      +'<span class="gleg"><span class="gnode" style="background:#f59e0b"></span>Adjacent</span>'
      +'<span class="gleg"><span class="gnode" style="background:#94a3b8"></span>Unconfirmed</span>'
      +'<span class="gleg"><span class="gnode" style="background:#d8b98a"></span>Not on roster</span>'
      +"</div>";
  }
  h+="</div>";

  if(conns.length){
    h+='<div class="card"><h2>Connection <span class="accent">detail</span></h2><p class="hint">Every link, grouped by photographer, with its evidence.</p>';
    names.forEach(function(n){
      var ks=byName[n];
      h+='<div class="dir-card"><div class="name">'+esc(n)+' <span class="pill blue">'+ks.length+"</span></div>";
      ks.forEach(function(k){
        var other=k.a===n?k.b:k.a;
        h+='<div class="rowline">'+pill(CONN_LABELS[k.type]||k.type,CONN_COLORS[k.type]||"gray")
          +'<span>with <b>'+esc(other)+"</b></span>"
          +(k.date?'<span class="subtle">'+shortDate(k.date)+"</span>":"")
          +"</div>"
          +(k.evidence?'<div class="notes">'+esc(k.evidence)+"</div>":"");
      });
      h+="</div>";
    });
    h+="</div>";
  }
  el.innerHTML=h;
}

/* ---------- ADD: competitor intake pipeline ---------- */
var QUEUE_KEY="pulse_intake_queue";
function getQueue(){
  try{ return JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]"); }catch(e){ return []; }
}
function setQueue(q){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }catch(e){} }
function rosterLine(e){
  var bits=["- "+(e.name||"Unnamed").trim(),
    (e.specialty||"photo").trim(),
    (e.town||"TBD").trim(),
    (e.website||"TBD").trim(),
    e.ig?("@"+e.ig.trim().replace(/^@/,"")):"IG: TBD"];
  var tail=[];
  if(e.source) tail.push("source: "+e.source);
  if(e.collab) tail.push("collaborated with: "+e.collab);
  if(e.notes) tail.push(e.notes.trim());
  if(tail.length) bits.push(tail.join("; "));
  return bits.join(" | ");
}
function renderAdd(){
  var el=document.getElementById("view-add");
  var h='<div class="card"><h2>Competitor <span class="accent">intake</span></h2>'
    +'<p class="hint">Queue a new competitor here. The queue lives in this browser only — '
    +'nothing is published until Luna adds it to the roster on the next sync. Use “Copy as text” and paste the lines to Luna.</p>'
    +'<div class="formgrid">'
    +'<label class="field"><span>Name *</span><input type="text" id="inName" placeholder="e.g. Jane Doe Photography"></label>'
    +'<label class="field"><span>Specialty</span><select id="inSpec"><option value="photo">Photo</option><option value="video">Video</option><option value="both">Photo + Video</option><option value="drone">Drone</option></select></label>'
    +'<label class="field"><span>Town</span><input type="text" id="inTown" placeholder="e.g. Potsdam, NY"></label>'
    +'<label class="field"><span>Website</span><input type="text" id="inWeb" placeholder="example.com"></label>'
    +'<label class="field"><span>IG handle</span><input type="text" id="inIG" placeholder="@handle"></label>'
    +'<label class="field"><span>Source *</span><select id="inSource"><option>Web search</option><option>Facebook</option><option>Instagram</option><option>Referral</option><option>AI audit</option><option>Client mention</option><option>Other</option></select></label>'
    +'<label class="field full"><span>Collaborated with (names, comma-separated)</span><input type="text" id="inCollab" placeholder="e.g. Jane Smith, North Country Films"></label>'
    +'<label class="field full"><span>Notes</span><textarea id="inNotes" rows="2" placeholder="Anything relevant: pricing seen, status, how they were found…"></textarea></label>'
    +"</div>"
    +'<div class="controls"><button class="btn" id="inQueue">Queue competitor</button>'
    +'<button class="btn ghost" id="inCopy">Copy as text</button></div>'
    +'<div id="queueList"></div></div>';
  el.innerHTML=h;

  function drawQueue(){
    var q=getQueue();
    var host=document.getElementById("queueList");
    if(!host) return;
    if(!q.length){ host.innerHTML='<p class="hint">Queue is empty.</p>'; return; }
    host.innerHTML='<h3 class="dirsec">Queued ('+q.length+')</h3>'+q.map(function(e,i){
      return '<div class="queueitem"><div><b>'+esc(e.name)+'</b> <span class="subtle">'+esc(e.town||"")+"</span><br>"
        +sourcePill(e.source)+' <span class="subtle">queued '+esc(e.queued_at)+"</span></div>"
        +'<button class="btn ghost sm" data-rm="'+i+'">Remove</button></div>';
    }).join("");
    host.querySelectorAll("[data-rm]").forEach(function(b){
      b.addEventListener("click",function(){
        var qq=getQueue(); qq.splice(+b.dataset.rm,1); setQueue(qq); drawQueue();
      });
    });
  }
  document.getElementById("inQueue").addEventListener("click",function(){
    var e={
      name:document.getElementById("inName").value.trim(),
      specialty:document.getElementById("inSpec").value,
      town:document.getElementById("inTown").value.trim(),
      website:document.getElementById("inWeb").value.trim(),
      ig:document.getElementById("inIG").value.trim(),
      source:document.getElementById("inSource").value,
      collab:document.getElementById("inCollab").value.trim(),
      notes:document.getElementById("inNotes").value.trim(),
      queued_at:new Date().toISOString().slice(0,10)
    };
    if(!e.name){ document.getElementById("inName").focus(); return; }
    var q=getQueue(); q.push(e); setQueue(q); drawQueue();
    ["inName","inTown","inWeb","inIG","inCollab","inNotes"].forEach(function(id){document.getElementById(id).value="";});
  });
  document.getElementById("inCopy").addEventListener("click",function(){
    var q=getQueue();
    var txt=q.map(rosterLine).join("\n")||"(queue is empty)";
    function done(ok){
      var b=document.getElementById("inCopy");
      if(!b) return;
      b.textContent=ok?"Copied":"Copy failed — select manually";
      setTimeout(function(){b.textContent="Copy as text";},1800);
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){done(true);},function(){done(false);});
    }else{
      var ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta);
      ta.select(); try{ document.execCommand("copy"); done(true);}catch(e){done(false);} document.body.removeChild(ta);
    }
  });
  drawQueue();
}

/* ---------- header ---------- */
function renderHeader(){
  var now=new Date();
  document.getElementById("todayDate").textContent=
    now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  var badge=document.getElementById("dataBadge");
  var gen=(D&&D.meta&&D.meta.generated_at)?new Date(D.meta.generated_at):null;
  if(gen&&!isNaN(gen)){
    var s=gen.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
      +" · "+gen.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    badge.textContent="Data updated "+s;
    if(Date.now()-gen.getTime()>36*3600*1000) badge.classList.add("stale");
  }else{
    badge.textContent="Data timestamp unavailable";
    badge.classList.add("stale");
  }
}

/* ---------- boot: navigation + view lifecycle ---------- */
var RENDERERS={
  overview:renderOverview, signals:renderSignals, recency:renderRecency,
  voice:renderVoice, ig:renderIG, jd:renderJD, pricing:renderPricing,
  directory:renderDirectory, entrants:renderEntrants, connections:renderConnections,
  sweep:renderSweep, ai:renderAI, aiprompts:renderAIByPrompt, add:renderAdd
};
var VIEW_START={ig:initIGChart, jd:initJDChart, ai:initAIChart, aiprompts:initAIByPromptCharts, connections:startGraph};
var VIEW_STOP={connections:stopGraph};
var viewStarted={}, currentView=null;

function showView(id){
  if(currentView && VIEW_STOP[currentView]){ try{ VIEW_STOP[currentView](); }catch(e){} }
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var v=document.getElementById("view-"+id);
  if(v) v.classList.add("active");
  document.querySelectorAll(".navview").forEach(function(b){b.classList.toggle("active",b.dataset.view===id);});
  currentView=id;
  if(VIEW_START[id]){
    if(!viewStarted[id]){ viewStarted[id]=true; VIEW_START[id](); }
    else if(id==="connections"){ startGraph(); }
    else { VIEW_START[id](); }
  }
  window.scrollTo(0,0);
}
function showGroup(g){
  document.querySelectorAll(".navgroup").forEach(function(b){b.classList.toggle("active",b.dataset.group===g);});
  var grp=NAV.filter(function(x){return x.group===g;})[0];
  var host=document.getElementById("navViews");
  host.innerHTML=grp.views.map(function(v){
    return '<button class="navview" data-view="'+v.id+'">'+esc(v.label)+"</button>";
  }).join("");
  host.querySelectorAll(".navview").forEach(function(b){
    b.addEventListener("click",function(){ showView(b.dataset.view); });
  });
  showView(grp.views[0].id);
}
function boot(){
  document.getElementById("loading").style.display="none";
  renderHeader();
  try{
    Object.keys(RENDERERS).forEach(function(id){ RENDERERS[id](); });
  }catch(err){
    document.getElementById("view-overview").innerHTML='<div class="card"><h2>Render error</h2><p class="hint">'+esc(err.message)+"</p></div>";
  }
  var gh=document.getElementById("navGroups");
  gh.innerHTML=NAV.map(function(x){
    return '<button class="navgroup" data-group="'+x.group+'">'+esc(x.label)+"</button>";
  }).join("");
  gh.querySelectorAll(".navgroup").forEach(function(b){
    b.addEventListener("click",function(){ showGroup(b.dataset.group); });
  });
  showGroup("command");
  showView("overview");
}
if(!D){
  document.getElementById("loading").innerHTML="Pulse data not found (data/data.js missing).";
}else{ boot(); }
})();
