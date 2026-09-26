/* Business Pulse dashboard — renders window.PULSE_DATA (injected via data/data.js) */
(function(){
"use strict";
var D = window.PULSE_DATA || null;
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function pill(t, cls){ return '<span class="pill '+cls+'">'+esc(t)+"</span>"; }
function deltaPill(n){
  if(n==null) return pill("n/a","gray");
  if(n>0) return '<span class="delta-up">+'+n+"</span>";
  if(n<0) return '<span class="delta-dn">'+n+"</span>";
  return '<span class="delta-0">0</span>';
}
function shortDate(d){ var p=String(d).split("-"); var m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return m[+p[1]-1]+" "+(+p[2]); }
function shortTick(d){ var p=String(d).split("-"); return (+p[1])+"/"+(+p[2]); }

var PALETTE=["#1d4ed8","#15803d","#b91c1c","#b45309","#6d28d9","#0891b2","#be185d","#4d7c0f","#0f766e","#a16207","#334155","#7c2d12"];

function lineChart(series, opts){
  opts=opts||{};
  var W=760,H=300,padL=54,padR=110,padT=16,padB=32;
  var xs=[], seen={};
  series.forEach(function(s){ s.points.forEach(function(p){ if(!seen[p.x]){seen[p.x]=1;xs.push(p.x);} }); });
  xs.sort();
  var ys=series.reduce(function(a,s){return a.concat(s.points.map(function(p){return p.y;}));},[]);
  if(!xs.length||!ys.length) return '<p class="hint">No data yet.</p>';
  var ymin=Math.min.apply(null,ys), ymax=Math.max.apply(null,ys);
  if(ymin===ymax){ymin-=1;ymax+=1;}
  var pad=(ymax-ymin)*0.15; ymin-=pad; ymax+=pad;
  function X(i){ return xs.length===1 ? padL+(W-padL-padR)/2 : padL+i*(W-padL-padR)/(xs.length-1); }
  function Y(v){ return padT+(1-(v-ymin)/(ymax-ymin))*(H-padT-padB); }
  var xi={}; xs.forEach(function(x,i){xi[x]=i;});
  var s='<svg viewBox="0 0 '+W+" "+H+'" role="img">';
  for(var g=0;g<=4;g++){
    var gv=ymin+(ymax-ymin)*g/4, gy=Y(gv);
    s+='<line x1="'+padL+'" y1="'+gy.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+gy.toFixed(1)+'" stroke="#e4e9ef" stroke-width="1"/>'
      +'<text x="'+(padL-6)+'" y="'+(gy+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="#667085">'+Math.round(gv).toLocaleString()+"</text>";
  }
  xs.forEach(function(x,i){ if(xs.length>8 && i%2===1) return;
    s+='<text x="'+X(i).toFixed(1)+'" y="'+(H-10)+'" text-anchor="middle" font-size="10" fill="#667085">'+shortTick(x)+"</text>"; });
  series.forEach(function(sr,si){
    var pts=sr.points.map(function(p){return X(xi[p.x]).toFixed(1)+","+Y(p.y).toFixed(1);}).join(" ");
    var col=sr.color||PALETTE[si%PALETTE.length];
    var w=sr.bold?3:1.8, dash=sr.dashed?' stroke-dasharray="5,3"':"";
    s+='<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="'+w+'"'+dash+'/>';
    sr.points.forEach(function(p){ s+='<circle cx="'+X(xi[p.x]).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+'" r="'+(sr.bold?3.4:2.6)+'" fill="'+col+'"/>'; });
    var last=sr.points[sr.points.length-1];
    s+='<text x="'+(X(xi[last.x])+6)+'" y="'+(Y(last.y)+4)+'" font-size="11" font-weight="700" fill="'+col+'">'+esc(sr.label)+" "+last.y.toLocaleString()+"</text>";
  });
  s+="</svg>";
  var leg=series.map(function(sr,si){var col=sr.color||PALETTE[si%PALETTE.length];
    return '<span><span class="sw" style="background:'+col+'"></span>'+esc(sr.label)+"</span>";}).join("");
  return '<div class="chartbox">'+s+'<div class="legend">'+leg+"</div></div>";
}

/* ---------- shared lookups ---------- */
var compByHandle={};
(D?D.competitors:[]).forEach(function(c){ if(c.ig_handle) compByHandle[c.ig_handle]=c; });
function handleName(h){ return compByHandle[h]?compByHandle[h].name:"@"+h; }

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
    ["Competitors tracked", comps.length, "across SLC + North Country"],
    ["SLC-confirmed", slc, "St. Lawrence County"],
    ["With verified IG", withIG, "in the follower tracker"],
    ["New entrants", newEntrants.length, "added since first sweep"],
    ["Latest web sweep", latestSweep?shortDate(latestSweep.date):"—", latestSweep?("fetched "+latestSweep.fetched+" of "+latestSweep.of_total+" pages"):""],
    ["AI visibility", latestAI?latestAI.pct+"%":"—", latestAI?("prompts naming JD · "+shortDate(latestAI.date)):""]
  ];
  var h='<div class="grid">'+statCards.map(function(s){
    return '<div class="stat"><div class="k">'+esc(s[0])+'</div><div class="v">'+esc(s[1])+'</div><div class="d">'+esc(s[2])+"</div></div>"; }).join("")+"</div>";

  // latest changes
  h+='<div class="card"><h2>Latest changes</h2><p class="hint">What moved most recently across every routine.</p><ul class="plain">';
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

  // JD rank snapshot
  if(latestAI){
    h+='<div class="card"><h2>JD rank snapshot — '+shortDate(latestAI.date)+'</h2><p class="hint">AI audit, latest run.</p><div class="tablewrap"><table class="rows"><tr><th>Engine</th><th>Prompts naming JD</th><th class="num">Best rank</th><th>Weakest prompt</th></tr>';
    latestAI.engines.forEach(function(e){
      h+="<tr><td><b>"+esc(e.engine)+"</b></td><td>"+esc(e.namedLabel)+"</td><td class=\"num\">"+(e.bestRank==null?"—":"#"+e.bestRank)+"</td><td>"+esc(e.weakest||"—")+"</td></tr>";
    });
    h+="</table></div></div>";
  }

  // IG movers
  var movers=Object.keys(D.igFollowersHistory).map(function(handle){
    var pts=D.igFollowersHistory[handle]; var first=pts[0], last=pts[pts.length-1];
    return {handle:handle, from:first.count, to:last.count, delta:last.count-first.count, ndays:pts.length};
  }).sort(function(a,b){return b.delta-a.delta;});
  h+='<div class="card"><h2>IG movers</h2><p class="hint">Follower change, first to latest snapshot.</p><div class="tablewrap"><table class="rows"><tr><th>Handle</th><th class="num">Then</th><th class="num">Now</th><th class="num">Delta</th></tr>';
  movers.forEach(function(m){
    h+="<tr><td><b>"+esc(handleName(m.handle))+"</b><br><span style='color:var(--muted);font-size:11px'>@"+esc(m.handle)+"</span></td>"
      +'<td class="num">'+m.from.toLocaleString()+'</td><td class="num">'+m.to.toLocaleString()+'</td><td class="num">'+deltaPill(m.delta)+"</td></tr>";
  });
  h+="</table></div></div>";

  el.innerHTML=h;
}

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

/* ---------- IG TRENDS ---------- */
function renderIG(){
  var el=document.getElementById("view-ig");
  var hist=D.igFollowersHistory;
  var handles=Object.keys(hist).sort(function(a,b){
    var la=hist[a][hist[a].length-1].count, lb=hist[b][hist[b].length-1].count; return lb-la; });
  var top5=handles.slice(0,5);

  var h='<div class="card"><h2>Follower trends</h2><p class="hint">Toggle handles to compare. More snapshots accumulate with each daily sync.</p><div class="controls" id="igChecks">'
    +handles.map(function(x,i){ return '<label class="chk"><input type="checkbox" value="'+esc(x)+'"'+(top5.indexOf(x)>=0?" checked":"")+"> @"+esc(x)+"</label>"; }).join("")
    +'</div><div id="igChart"></div></div>';

  h+='<div class="card"><h2>30-day delta table</h2><p class="hint">First to latest snapshot per handle, with latest activity notes.</p><div class="tablewrap"><table class="rows"><tr><th>Competitor</th><th class="num">Followers</th><th class="num">Delta</th><th>Latest activity</th></tr>';
  var latestAct={};
  D.igActivity.forEach(function(a){ if(!latestAct[a.handle]||latestAct[a.handle].date<a.date) latestAct[a.handle]=a; });
  handles.forEach(function(x){
    var pts=hist[x], first=pts[0], last=pts[pts.length-1], d=last.count-first.count;
    var act=latestAct[x]?latestAct[x].activity:"—";
    h+="<tr><td><b>"+esc(handleName(x))+"</b><br><span style='color:var(--muted);font-size:11px'>@"+esc(x)+"</span></td>"
      +'<td class="num">'+last.count.toLocaleString()+'</td><td class="num">'+deltaPill(d)+"</td><td>"+esc(act)+"</td></tr>";
  });
  h+="</table></div></div>";
  el.innerHTML=h;

  function draw(){
    var sel=[].slice.call(document.querySelectorAll("#igChecks input:checked")).map(function(c){return c.value;});
    var series=sel.map(function(x,i){ return {label:"@"+x, color:PALETTE[i%PALETTE.length], bold:true,
      points:hist[x].map(function(p){return {x:p.date,y:p.count};})}; });
    document.getElementById("igChart").innerHTML=lineChart(series);
  }
  el.querySelectorAll("#igChecks input").forEach(function(c){ c.addEventListener("change",draw); });
  draw();
}

/* ---------- JD VS COMPETITORS ---------- */
function renderJD(){
  var el=document.getElementById("view-jd");
  var byAcct={};
  D.ownAccounts.forEach(function(r){ (byAcct[r.account]=byAcct[r.account]||[]).push({x:r.date,y:r.follower_count}); });
  Object.keys(byAcct).forEach(function(a){ byAcct[a].sort(function(p,q){return p.x<q.x?-1:1;}); });
  var acctColors={jdmeyers_:"#6d28d9",jdmeyersproductions:"#1d4ed8",fourierxform:"#0891b2"};
  var acctLabels={jdmeyers_:"JD personal",jdmeyersproductions:"JD Productions",fourierxform:"FourierXForm"};
  var series=Object.keys(byAcct).sort().map(function(a){
    return {label:"JD · "+(acctLabels[a]||a), color:acctColors[a]||"#111", bold:true, points:byAcct[a]}; });
  var rivals=["juliakiaphotos","emilymurphy_photo","allisonleephotographyny","laurawellsphotography"];
  rivals.forEach(function(x,i){
    var pts=D.igFollowersHistory[x]; if(!pts) return;
    series.push({label:"@"+x, color:["#94a3b8","#cbd5e1","#94a3b8","#cbd5e1"][i%4], dashed:true,
      points:pts.map(function(p){return {x:p.date,y:p.count};})});
  });
  var h='<div class="card"><h2>JD vs top competitors</h2><p class="hint">JD\u2019s three accounts (bold) against the four largest tracked competitor handles (dashed).</p>'
    +lineChart(series)+"</div>";
  h+='<div class="card"><h2>Latest counts</h2><div class="tablewrap"><table class="rows"><tr><th>Account</th><th class="num">Followers</th><th class="num">Delta</th></tr>';
  Object.keys(byAcct).sort().forEach(function(a){
    var pts=byAcct[a], last=pts[pts.length-1], d=last.y-pts[0].y;
    h+="<tr><td><b>JD · "+esc(acctLabels[a]||a)+"</b><br><span style='color:var(--muted);font-size:11px'>@"+esc(a)+"</span></td>"
      +'<td class="num">'+last.y.toLocaleString()+'</td><td class="num">'+deltaPill(d)+"</td></tr>";
  });
  rivals.forEach(function(x){
    var pts=D.igFollowersHistory[x]; if(!pts) return;
    var last=pts[pts.length-1], d=last.count-pts[0].count;
    h+="<tr><td><b>"+esc(handleName(x))+"</b><br><span style='color:var(--muted);font-size:11px'>@"+esc(x)+"</span></td>"
      +'<td class="num">'+last.count.toLocaleString()+'</td><td class="num">'+deltaPill(d)+"</td></tr>";
  });
  h+="</table></div></div>";
  el.innerHTML=h;
}

/* ---------- WEB SWEEPS ---------- */
function renderSweep(){
  var el=document.getElementById("view-sweep");
  var sweeps=D.webSweepHistory.slice().sort(function(a,b){return a.date<b.date?1:-1;});
  var statusPill={baseline:["Baseline","gray"],unchanged:["Unchanged","green"],changed:["Changed","amber"],unreachable:["Unreachable","red"],"not-fetched":["Not fetched","gray"]};
  var h="";
  sweeps.forEach(function(s){
    var slugs=Object.keys(s.pages||{});
    var counts={}; slugs.forEach(function(sl){ var st=(s.pages[sl]||{}).status||"unchanged"; counts[st]=(counts[st]||0)+1; });
    h+='<div class="card"><div class="timeline-item"><div class="dt">'+shortDate(s.date)+'</div><div class="lbl">'+esc(s.run_label)+"</div>"
      +'<div style="margin:6px 0">'+(s.fetched!=null?pill("Fetched "+s.fetched+" of "+s.of_total,"blue"):"")+" "
      +Object.keys(counts).map(function(st){ var p=statusPill[st]||[st,"gray"]; return pill(counts[st]+" "+p[0],p[1]); }).join(" ")+"</div>"
      +(s.summary?'<p class="hint">'+esc(s.summary)+"</p>":"");
    if((s.new_entrants||[]).length) h+="<p>"+s.new_entrants.map(function(n){return pill("New: "+n,"blue");}).join(" ")+"</p>";
    if((s.roster_corrections||[]).length) h+='<ul class="plain">'+s.roster_corrections.map(function(c){return "<li>"+esc(c)+"</li>";}).join("")+"</ul>";
    if(slugs.length){
      var order={changed:0,unreachable:1,baseline:2,"not-fetched":3,unchanged:4};
      slugs.sort(function(a,b){ var sa=(s.pages[a]||{}).status, sb=(s.pages[b]||{}).status; return (order[sa]==null?5:order[sa])-(order[sb]==null?5:order[sb]); });
      h+='<div class="tablewrap"><table class="rows"><tr><th>Page</th><th>Status</th><th>Note</th></tr>';
      slugs.forEach(function(sl){
        var p=s.pages[sl]||{}, st=p.status||"unchanged", sp=statusPill[st]||[st,"gray"];
        h+="<tr><td><b>"+esc(sl)+"</b></td><td>"+pill(sp[0],sp[1])+"</td><td>"+esc(p.note||"—")+"</td></tr>";
      });
      h+="</table></div>";
    }
    h+="</div></div>";
  });
  el.innerHTML=h||'<div class="card"><p class="hint">No sweep runs yet.</p></div>';
}

/* ---------- AI VISIBILITY ---------- */
var ENGINES=["ChatGPT","Claude","Gemini","Perplexity"];
var PROMPTS={
  P1:"Wedding video · SLC", P2:"Wedding photo · Potsdam", P3:"Drone real estate · N. Country",
  P4:"Cost of photo+video · SLC", P5:"Family photo · Potsdam"};
function renderAI(){
  var el=document.getElementById("view-ai");
  var rows=D.aiVisibility;
  var runs={};
  rows.forEach(function(r){ var k=runKey(r); (runs[k]=runs[k]||{date:r.date,run:r.run,label:shortDate(r.date)+(r.run==="daily"?"":(" · "+r.run.replace("daily-",""))),rows:[]}).rows.push(r); });
  var runKeys=Object.keys(runs).sort();

  // trend chart: % prompts naming JD per engine per run
  var engSeries=ENGINES.map(function(e,ei){
    var pts=runKeys.map(function(k){
      var rs=runs[k].rows.filter(function(r){return r.engine===e && r.jd_named!=="unreachable";});
      if(!rs.length) return null;
      var sc=rs.reduce(function(a,r){return a+(r.jd_named==="yes"?1:r.jd_named==="partial"?0.5:0);},0);
      return {x:runs[k].date+" "+k.split(" ")[1], y:Math.round(100*sc/rs.length)};
    }).filter(Boolean);
    return {label:e, color:PALETTE[ei%PALETTE.length], bold:true, points:pts};
  }).filter(function(s){return s.points.length;});

  var h='<div class="card"><h2>JD named — % of prompts, by engine</h2><p class="hint">Share of reachable prompts per run where JD was named (partial = half credit).</p>'
    +lineChart(engSeries)+"</div>";

  // scorecard table
  h+='<div class="card"><h2>Engine scorecard</h2><p class="hint">Every run, every engine: prompts naming JD and best rank.</p><div class="tablewrap"><table class="rows"><tr><th>Run</th>'
    +ENGINES.map(function(e){return "<th>"+esc(e)+"</th>";}).join("")+"</tr>";
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
      var cell=pill(yes+"/"+reach.length+(part?" +"+part+"p":""), yes>=3?"green":yes>=1?"amber":"red");
      if(ranks.length) cell+=' <span class="num" style="font-size:11px">best #'+Math.min.apply(null,ranks)+"</span>";
      h+="<td>"+cell+"</td>";
    });
    h+="</tr>";
  });
  h+="</table></div></div>";

  // latest prompt detail
  var lastK=runKeys[runKeys.length-1], last=runs[lastK];
  h+='<div class="card"><h2>Latest run detail — '+esc(last.label)+'</h2><div class="tablewrap"><table class="rows"><tr><th>Prompt</th>'
    +ENGINES.map(function(e){return "<th>"+esc(e)+"</th>";}).join("")+"</tr>";
  Object.keys(PROMPTS).forEach(function(pk){
    h+="<tr><td><b>"+pk+"</b> "+esc(PROMPTS[pk])+"</td>";
    ENGINES.forEach(function(e){
      var r=last.rows.filter(function(x){return x.engine===e && x.prompt===pk;})[0];
      if(!r){ h+="<td>—</td>"; return; }
      var cell;
      if(r.jd_named==="yes") cell=pill("JD #"+r.jd_rank+(r.of_total?" of "+r.of_total:""), r.jd_rank===1?"green":"blue");
      else if(r.jd_named==="partial") cell=pill("Partial","amber");
      else if(r.jd_named==="unreachable") cell=pill("Unreachable","gray");
      else cell=pill("Not named","red");
      h+="<td>"+cell+"</td>";
    });
    h+="</tr>";
  });
  h+="</table></div></div>";

  // rival frequency
  var freq={}, engSeen={};
  rows.forEach(function(r){ (r.rivals||[]).forEach(function(rv){
    freq[rv]=(freq[rv]||0)+1; (engSeen[rv]=engSeen[rv]||{})[r.engine]=1; }); });
  var rivals=Object.keys(freq).sort(function(a,b){return freq[b]-freq[a];}).slice(0,30);
  h+='<div class="card"><h2>Rival frequency</h2><p class="hint">Competitors named by AI engines instead of / alongside JD, across all runs.</p><div class="tablewrap"><table class="rows"><tr><th>Rival</th><th class="num">Mentions</th><th>Engines</th></tr>';
  rivals.forEach(function(rv){
    h+="<tr><td><b>"+esc(rv)+"</b></td><td class=\"num\">"+freq[rv]+"</td><td>"+esc(Object.keys(engSeen[rv]).join(", "))+"</td></tr>";
  });
  h+="</table></div></div>";
  el.innerHTML=h;
}

/* ---------- DIRECTORY ---------- */
function renderDirectory(){
  var el=document.getElementById("view-directory");
  var h='<div class="card"><h2>Competitor directory</h2><p class="hint">'+D.competitors.length+' tracked competitors. Search and filter the full roster.</p>'
    +'<div class="controls"><input type="text" id="dirQ" placeholder="Search name, town, notes…">'
    +'<select id="dirRegion"><option value="">All regions</option><option value="slc">SLC-confirmed</option><option value="neighboring">Neighboring</option><option value="unconfirmed">Unconfirmed</option></select>'
    +'<select id="dirSpec"><option value="">All specialties</option><option value="photo">Photo</option><option value="video">Video</option><option value="both">Photo + Video</option><option value="drone">Drone</option></select>'
    +'<select id="dirStatus"><option value="">Any status</option><option value="active">Active</option><option value="uncertain">Uncertain</option></select>'
    +'<label class="chk"><input type="checkbox" id="dirPrice"> Has pricing</label></div>'
    +'<div id="dirList"></div></div>'
    +'<details class="excl"><summary>Deliberately excluded ('+D.excluded.length+')</summary><ul class="plain">'
    +D.excluded.map(function(x){return "<li><b>"+esc(x.name)+"</b> — "+esc(x.reason)+"</li>";}).join("")
    +"</ul></details>";
  el.innerHTML=h;

  var specPill={photo:["Photo","blue"],video:["Video","purple"],both:["Photo+Video","purple"],drone:["Drone","amber"]};
  var regPill={slc:["SLC","green"],neighboring:["Neighboring","blue"],unconfirmed:["Unconfirmed","gray"]};
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
        +'<div class="rowline">'+pill(sp2[0],sp2[1])+pill(rp[0],rp[1])+pill(c.status==="active"?"Active":"Uncertain",c.status==="active"?"green":"amber")
        +(c.pricing?'<span class="pricing">'+esc(c.pricing)+"</span>":"")
        +(c.may2026_web_score!=null?pill("May 2026 score: "+c.may2026_web_score,"gray"):"")+"</div>"
        +(links.length?'<div class="rowline">'+links.join(" · ")+"</div>":"")
        +(c.notes?'<div class="notes">'+esc(c.notes)+"</div>":"")
        +((c.flags||[]).length?'<div class="rowline">'+c.flags.map(function(f){return pill(f,"gray");}).join("")+"</div>":"")
        +"</div>";
    }).join("");
    document.getElementById("dirList").innerHTML=out;
  }
  ["dirQ","dirRegion","dirSpec","dirStatus","dirPrice"].forEach(function(id){
    document.getElementById(id).addEventListener(id==="dirQ"?"input":"change",draw);
  });
  draw();
}

/* ---------- boot ---------- */
function boot(){
  document.getElementById("loading").style.display="none";
  try{
    document.getElementById("generatedAt").textContent="Data synced "+(D.meta?D.meta.generated_at:"");
    renderOverview(); renderIG(); renderJD(); renderSweep(); renderAI(); renderDirectory();
  }catch(err){
    document.getElementById("view-overview").innerHTML='<div class="card"><h2>Render error</h2><p class="hint">'+esc(err.message)+"</p></div>";
  }
  var tabs=document.querySelectorAll(".tab");
  tabs.forEach(function(t){ t.addEventListener("click",function(){
    tabs.forEach(function(x){x.classList.remove("active");});
    t.classList.add("active");
    document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
    document.getElementById("view-"+t.dataset.view).classList.add("active");
    window.scrollTo(0,0);
  });});
}
if(!D){
  document.getElementById("loading").textContent="Pulse data not found (data/data.js missing).";
}else{ boot(); }
})();
