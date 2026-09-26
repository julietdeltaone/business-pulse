/* Business Pulse dashboard — dark theme, Chart.js animated charts.
   Renders window.PULSE_DATA (injected via data/data.js). */
(function(){
"use strict";
var D = window.PULSE_DATA || null;

/* ---------- helpers ---------- */
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function pill(t, cls){ return '<span class="pill '+cls+'">'+esc(t)+"</span>"; }
function deltaPill(n){
  if(n==null) return pill("n/a","gray");
  if(n>0) return '<span class="delta-up">+'+n.toLocaleString("en-US")+"</span>";
  if(n<0) return '<span class="delta-dn">'+n.toLocaleString("en-US")+"</span>";
  return '<span class="delta-0">0</span>';
}
function shortDate(d){ var p=String(d).split("-"); var m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return m[+p[1]-1]+" "+(+p[2]); }
function shortTick(d){ var p=String(d).split("-"); return (+p[1])+"/"+(+p[2]); }

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
/* minimal static SVG fallback when the Chart.js CDN is unreachable */
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
  // gradient fill for filled datasets
  var o=baseOptions(ymin,ymax);
  if(opts.yTick) o.scales.y.ticks.callback=opts.yTick;
  var chart=new Chart(host.getContext("2d"),{type:"line",data:{labels:labels.map(shortTick),datasets:datasets},options:o});
  return chart;
}

/* ---------- shared lookups ---------- */
var compByHandle={};
(D?D.competitors:[]).forEach(function(c){ if(c.ig_handle) compByHandle[c.ig_handle]=c; });
function handleName(h){ return compByHandle[h]?compByHandle[h].name:"@"+h; }

var RUN_ORDER={baseline:0,daily:1,"daily-evening":2,"daily-midday":3};
function runKey(r){ return r.date+" "+(RUN_ORDER[r.run]||0); }
function latestAIRun(){
  var rows=D.aiVisibility; if(!rows.length) return null;
  var runs={};
  rows.forEach(function(r){ var k=runKey(r); (runs[k]=runs[k]||{date:r.date,run:r.run,rows:[]}).rows.push(r); });
  var keys=Object.keys(runs).sort(); var last=runs[keys[keys.length-1]];
  var byEng={};
  last.rows.forEach(function(r){ (byEng[r.engine]=byEng[r.engine]||[]).push(r); });
  var engines=Object.keys(byEng).map(function(e){
    var rs=byEng[e], reach=rs.filter(function(r){return r.jd_named!=="unreachable";});
    var yes=reach.filter(function(r){return r.jd_named==="yes";}).length;
    var part=reach.filter(function(r){return r.jd_named==="partial";}).length;
    var ranks=reach.filter(function(r){return r.jd_rank!=null;}).map(function(r){return r.jd_rank;});
    var missed=reach.filter(function(r){return r.jd_named==="no";}).map(function(r){return r.prompt;});
    return {engine:e, namedLabel:yes+"/"+reach.length+(part?" (+"+part+" partial)":""),
      bestRank:ranks.length?Math.min.apply(null,ranks):null, weakest:missed[0]||null,
      score:reach.length?(yes+0.5*part)/reach.length:null};
  });
  var sc=engines.filter(function(e){return e.score!=null;}).map(function(e){return e.score;});
  var pct=sc.length?Math.round(100*sc.reduce(function(a,b){return a+b;},0)/sc.length):null;
  return {date:last.date, engines:engines, pct:pct};
}

/* ---------- OVERVIEW ---------- */
function renderOverview(){
  var el=document.getElementById("view-overview");
  var comps=D.competitors, sweeps=D.webSweepHistory.slice().sort(function(a,b){return a.date<b.date?-1:1;});
  var slc=comps.filter(function(c){return c.region==="slc";}).length;
  var withIG=comps.filter(function(c){return c.ig_handle;}).length;
  var newEntrants=[]; sweeps.forEach(function(s){ (s.new_entrants||[]).forEach(function(n){newEntrants.push({date:s.date,name:n});}); });
  var latestSweep=sweeps[sweeps.length-1]||null;
  var latestAI=latestAIRun();

  var statCards=[
    {k:"Competitors tracked", v:comps.length, d:"across SLC + North Country", num:true},
    {k:"SLC-confirmed", v:slc, d:"St. Lawrence County", num:true},
    {k:"With verified IG", v:withIG, d:"in the follower tracker", num:true},
    {k:"New entrants", v:newEntrants.length, d:"added since first sweep", num:true},
    {k:"Latest web sweep", v:latestSweep?shortDate(latestSweep.date):"—", d:latestSweep?("fetched "+latestSweep.fetched+" of "+latestSweep.of_total+" pages"):"", num:false},
    {k:"AI visibility", v:latestAI?latestAI.pct:"—", d:latestAI?("prompts naming JD · "+shortDate(latestAI.date)):"", num:!!latestAI, suffix:"%"}
  ];
  var h='<div class="grid">'+statCards.map(function(s,i){
    return '<div class="stat"><div class="k">'+esc(s.k)+'</div><div class="v"'+(s.num?' data-count="'+s.v+'" data-suffix="'+(s.suffix||"")+'" id="stat-'+i+'"':"")+'>'
      +(s.num?"0":esc(String(s.v)))+'</div><div class="d">'+esc(s.d)+"</div></div>"; }).join("")+"</div>";

  h+='<div class="card"><h2><span class="accent">Latest</span> changes</h2><p class="hint">What moved most recently across every routine.</p><ul class="plain">';
  newEntrants.slice(-5).reverse().forEach(function(n){
    h+="<li>"+pill("New entrant","blue")+" <b>"+esc(n.name)+"</b> — added "+shortDate(n.date)+"</li>"; });
  var changed=[], unreach=[];
  if(latestSweep){ Object.keys(latestSweep.pages||{}).forEach(function(sl){
    var p=latestSweep.pages[sl];
    if(p.status==="changed") changed.push({slug:sl,note:p.note});
    if(p.status==="unreachable") unreach.push({slug:sl,note:p.note});
  });}
  changed.forEach(function(c){ h+="<li>"+pill("Changed","amber")+" <b>"+esc(c.slug)+"</b> — "+esc(c.note||"")+"</li>"; });
  unreach.slice(0,6).forEach(function(u){ h+="<li>"+pill("Unreachable","red")+" <b>"+esc(u.slug)+"</b> — "+esc(u.note||"")+"</li>"; });
  if(!changed.length && !unreach.length && latestSweep) h+="<li>No page changes on the latest sweep ("+shortDate(latestSweep.date)+").</li>";
  h+="</ul></div>";

  if(latestAI){
    h+='<div class="card"><h2>JD rank snapshot — <span class="accent">'+shortDate(latestAI.date)+'</span></h2><p class="hint">AI audit, latest run.</p><div class="tablewrap"><table class="rows"><thead><tr><th>Engine</th><th>Prompts naming JD</th><th class="num">Best rank</th><th>Weakest prompt</th></tr></thead><tbody>';
    latestAI.engines.forEach(function(e){
      h+="<tr><td><b>"+esc(e.engine)+"</b></td><td>"+esc(e.namedLabel)+'</td><td class="num">'+(e.bestRank==null?"—":"#"+e.bestRank)+"</td><td>"+esc(e.weakest||"—")+"</td></tr>";
    });
    h+="</tbody></table></div></div>";
  }

  var movers=Object.keys(D.igFollowersHistory).map(function(handle){
    var pts=D.igFollowersHistory[handle]; var first=pts[0], last=pts[pts.length-1];
    return {handle:handle, from:first.count, to:last.count, delta:last.count-first.count};
  }).sort(function(a,b){return b.delta-a.delta;});
  h+='<div class="card"><h2>IG <span class="accent">movers</span></h2><p class="hint">Follower change, first to latest snapshot.</p><div class="tablewrap"><table class="rows"><thead><tr><th>Handle</th><th class="num">Then</th><th class="num">Now</th><th class="num">Delta</th></tr></thead><tbody>';
  movers.forEach(function(m){
    h+="<tr><td><b>"+esc(handleName(m.handle))+'</b><br><span class="subtle">@'+esc(m.handle)+"</span></td>"
      +'<td class="num">'+m.from.toLocaleString("en-US")+'</td><td class="num">'+m.to.toLocaleString("en-US")+'</td><td class="num">'+deltaPill(m.delta)+"</td></tr>";
  });
  h+="</tbody></table></div></div>";

  el.innerHTML=h;
  statCards.forEach(function(s,i){
    if(s.num){ var n=document.getElementById("stat-"+i); if(n) countUp(n, s.v, s.suffix||""); }
  });
}

/* ---------- IG TRENDS ---------- */
var igChart=null;
function renderIG(){
  var el=document.getElementById("view-ig");
  var hist=D.igFollowersHistory;
  var handles=Object.keys(hist).sort(function(a,b){
    var la=hist[a][hist[a].length-1].count, lb=hist[b][hist[b].length-1].count; return lb-la; });
  var top5=handles.slice(0,5);

  var h='<div class="card"><h2>Follower <span class="accent">trends</span></h2><p class="hint">Toggle handles to compare. More snapshots accumulate with each daily sync.</p><div class="controls" id="igChecks">'
    +handles.map(function(x){ return '<label class="chk'+(top5.indexOf(x)>=0?" on":"")+'"><input type="checkbox" class="vh" value="'+esc(x)+'"'+(top5.indexOf(x)>=0?" checked":"")+"> @"+esc(x)+"</label>"; }).join("")
    +'</div><div class="chartwrap"><canvas id="igCanvas"></canvas></div></div>';

  h+='<div class="card"><h2>30-day <span class="accent">delta</span> table</h2><p class="hint">First to latest snapshot per handle, with latest activity notes.</p><div class="tablewrap"><table class="rows"><thead><tr><th>Competitor</th><th class="num">Followers</th><th class="num">Delta</th><th>Latest activity</th></tr></thead><tbody>';
  var latestAct={};
  D.igActivity.forEach(function(a){ if(!latestAct[a.handle]||latestAct[a.handle].date<a.date) latestAct[a.handle]=a; });
  handles.forEach(function(x){
    var pts=hist[x], first=pts[0], last=pts[pts.length-1], d=last.count-first.count;
    var act=latestAct[x]?latestAct[x].activity:"—";
    h+="<tr><td><b>"+esc(handleName(x))+'</b><br><span class="subtle">@'+esc(x)+"</span></td>"
      +'<td class="num">'+last.count.toLocaleString("en-US")+'</td><td class="num">'+deltaPill(d)+"</td><td>"+esc(act)+"</td></tr>";
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
    +'<div class="chartwrap tall"><canvas id="jdCanvas"></canvas></div></div>';
  h+='<div class="card"><h2>Latest <span class="accent">counts</span></h2><div class="tablewrap"><table class="rows"><thead><tr><th>Account</th><th class="num">Followers</th><th class="num">Delta</th></tr></thead><tbody>';
  var byAcct={};
  D.ownAccounts.forEach(function(r){ (byAcct[r.account]=byAcct[r.account]||[]).push({x:r.date,y:r.follower_count}); });
  Object.keys(byAcct).forEach(function(a){ byAcct[a].sort(function(p,q){return p.x<q.x?-1:1;}); });
  var acctLabels={jdmeyers_:"JD personal",jdmeyersproductions:"JD Productions",fourierxform:"FourierXForm"};
  Object.keys(byAcct).sort().forEach(function(a){
    var pts=byAcct[a], last=pts[pts.length-1], d=last.y-pts[0].y;
    h+="<tr><td><b>JD · "+esc(acctLabels[a]||a)+'</b><br><span class="subtle">@'+esc(a)+"</span></td>"
      +'<td class="num">'+last.y.toLocaleString("en-US")+'</td><td class="num">'+deltaPill(d)+"</td></tr>";
  });
  ["juliakiaphotos","emilymurphy_photo","allisonleephotographyny","laurawellsphotography"].forEach(function(x){
    var pts=D.igFollowersHistory[x]; if(!pts) return;
    var last=pts[pts.length-1], d=last.count-pts[0].count;
    h+="<tr><td><b>"+esc(handleName(x))+'</b><br><span class="subtle">@'+esc(x)+"</span></td>"
      +'<td class="num">'+last.count.toLocaleString("en-US")+'</td><td class="num">'+deltaPill(d)+"</td></tr>";
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
var ENGINES=["ChatGPT","Claude","Gemini","Perplexity"];
var ENGINE_COLORS={ChatGPT:"#7dd3fc",Claude:"#f59e0b",Gemini:"#d8b98a",Perplexity:"#f87171"};
var PROMPT_SHORT=["Wedding video · SLC","Wedding photo · Potsdam","Drone real estate · N. Country","Cost photo+video · SLC","Family photo · Potsdam"];
var aiChart=null;
function aiRuns(){
  var runs={};
  D.aiVisibility.forEach(function(r){ var k=runKey(r); (runs[k]=runs[k]||{date:r.date,run:r.run,rows:[]}).rows.push(r); });
  var keys=Object.keys(runs).sort();
  keys.forEach(function(k){ var r0=runs[k].rows[0];
    runs[k].label=shortDate(runs[k].date)+(r0.run==="daily"?"":(" · "+r0.run.replace("daily-",""))); });
  return {runs:runs, keys:keys};
}
function renderAI(){
  var el=document.getElementById("view-ai");
  var rr=aiRuns(), runs=rr.runs, runKeys=rr.keys;
  var PROMPTS=[];
  D.aiVisibility.forEach(function(r){ if(PROMPTS.indexOf(r.prompt)<0) PROMPTS.push(r.prompt); });

  var h='<div class="card"><h2>JD named — <span class="accent">% of prompts</span>, by engine</h2><p class="hint">Share of reachable prompts per run where JD was named (partial = half credit).</p>'
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

/* ---------- DIRECTORY ---------- */
function renderDirectory(){
  var el=document.getElementById("view-directory");
  var h='<div class="card"><h2>Competitor <span class="accent">directory</span></h2><p class="hint">'+D.competitors.length+' tracked competitors. Search and filter the full roster.</p>'
    +'<div class="controls"><input type="text" id="dirQ" placeholder="Search name, town, notes…">'
    +'<select id="dirRegion"><option value="">All regions</option><option value="slc">SLC-confirmed</option><option value="neighboring">Neighboring</option><option value="unconfirmed">Unconfirmed</option></select>'
    +'<select id="dirSpec"><option value="">All specialties</option><option value="photo">Photo</option><option value="video">Video</option><option value="both">Photo + Video</option><option value="drone">Drone</option></select>'
    +'<select id="dirStatus"><option value="">Any status</option><option value="active">Active</option><option value="uncertain">Uncertain</option></select>'
    +'<label class="chk"><input type="checkbox" class="vh" id="dirPrice"> Has pricing</label></div>'
    +'<div id="dirList"></div></div>'
    +'<details class="excl"><summary>Deliberately excluded ('+D.excluded.length+')</summary><ul class="plain">'
    +D.excluded.map(function(x){return "<li><b>"+esc(x.name)+"</b> — "+esc(x.reason)+"</li>";}).join("")
    +"</ul></details>";
  el.innerHTML=h;

  var specPill={photo:["Photo","blue"],video:["Video","tan"],both:["Photo+Video","tan"],drone:["Drone","amber"]};
  var regPill={slc:["SLC","blue"],neighboring:["Neighboring","tan"],unconfirmed:["Unconfirmed","gray"]};
  function draw(){
    var q=document.getElementById("dirQ").value.toLowerCase(),
        rg=document.getElementById("dirRegion").value,
        sp=document.getElementById("dirSpec").value,
        st=document.getElementById("dirStatus").value,
        pr=document.getElementById("dirPrice").checked;
    var list=D.competitors.filter(function(c){
      if(rg&&c.region!==rg) return false;
      if(sp&&c.specialty!==sp) return false;
      if(st&&c.status!==st) return false;
      if(pr&&!c.pricing) return false;
      if(q){ var blob=(c.name+" "+c.town+" "+(c.notes||"")+" "+(c.ig_handle||"")).toLowerCase(); if(blob.indexOf(q)<0) return false; }
      return true;
    });
    var out='<p class="hint">'+list.length+" of "+D.competitors.length+" shown</p>";
    out+=list.map(function(c){
      var sp2=specPill[c.specialty]||[c.specialty,"gray"], rp=regPill[c.region]||[c.region,"gray"];
      var links=[];
      if(c.website) links.push('<a href="https://'+esc(c.website)+'" target="_blank" rel="noopener">Website</a>');
      if(c.ig_handle) links.push('<a href="https://instagram.com/'+esc(c.ig_handle)+'" target="_blank" rel="noopener">Instagram</a>');
      return '<div class="dir-card"><div class="name">'+esc(c.name)+'</div><div class="meta">'+esc(c.town)+"</div>"
        +'<div class="rowline">'+pill(sp2[0],sp2[1])+pill(rp[0],rp[1])+pill(c.status==="active"?"Active":"Uncertain",c.status==="active"?"blue":"amber")
        +(c.pricing?'<span class="pricing">'+esc(c.pricing)+"</span>":"")
        +(c.may2026_web_score!=null?pill("May 2026 score: "+c.may2026_web_score,"gray"):"")+"</div>"
        +(links.length?'<div class="rowline">'+links.join(" · ")+"</div>":"")
        +(c.notes?'<div class="notes">'+esc(c.notes)+"</div>":"")
        +((c.flags||[]).length?'<div class="rowline">'+c.flags.map(function(f){return pill(f,"gray");}).join("")+"</div>":"")
        +"</div>";
    }).join("");
    document.getElementById("dirList").innerHTML=out;
  }
  ["dirQ","dirRegion","dirSpec","dirStatus"].forEach(function(id){
    document.getElementById(id).addEventListener(id==="dirQ"?"input":"change",draw);
  });
  var priceBox=document.getElementById("dirPrice"), priceLbl=priceBox.parentElement;
  priceBox.addEventListener("change",function(){ priceLbl.classList.toggle("on",priceBox.checked); draw(); });
  draw();
}

/* ---------- header: current date + data badge ---------- */
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

/* ---------- boot ---------- */
var chartInits={ig:initIGChart, jd:initJDChart, ai:initAIChart};
function boot(){
  document.getElementById("loading").style.display="none";
  renderHeader();
  try{
    renderOverview(); renderIG(); renderJD(); renderSweep(); renderAI(); renderDirectory();
  }catch(err){
    document.getElementById("view-overview").innerHTML='<div class="card"><h2>Render error</h2><p class="hint">'+esc(err.message)+"</p></div>";
    return;
  }
  initIGChart();
  var tabs=document.querySelectorAll(".tab");
  tabs.forEach(function(t){ t.addEventListener("click",function(){
    tabs.forEach(function(x){x.classList.remove("active");});
    t.classList.add("active");
    document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
    var v=document.getElementById("view-"+t.dataset.view);
    v.classList.add("active");
    if(chartInits[t.dataset.view]) chartInits[t.dataset.view]();
    window.scrollTo(0,0);
  });});
}
if(!D){
  document.getElementById("loading").innerHTML="Pulse data not found (data/data.js missing).";
}else{ boot(); }
})();
