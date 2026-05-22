const socket=io();
const $=(id)=>document.getElementById(id);
let lastDeathIds="";
let lastMayorResultKey="";
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
const ROLE_ART = {
  "Burger": ["/assets/cards/burger_man.png", "/assets/cards/burger_woman.png"],
  "Weerwolf": ["/assets/cards/weerwolf.png"],
  "Fluitspeler": ["/assets/cards/fluitspeler.png"]
};
function stableHash(str){ let h=0; str=String(str||""); for(let i=0;i<str.length;i++) h=((h<<5)-h+str.charCodeAt(i))|0; return Math.abs(h); }
function deathVisual(d){
  const artList = ROLE_ART[d.roleName] || [];
  if(artList.length){
    const src = artList[stableHash(d.key||d.name)%artList.length];
    return { html:`<img class="deathRoleCard" src="${esc(src)}" alt="${esc(d.roleName)}">`, hasArt:true };
  }
  return { html:`<span class="emoji">${esc(d.roleEmoji)}</span>`, hasArt:false };
}
socket.emit("register_viewer");
socket.on("connect",()=>socket.emit("register_viewer"));
socket.on("state",render);
function render(s){
  if($("version")) $("version").textContent=`v${s.version}`;
  const hero=$("hero");
  const infoClass = getInfoPhaseClass(s);
  hero.className=`viewerHero ${infoClass}`;
  const mayorActive = s.phase === "mayor" && !!s.mayorElection?.open;
  const voteActive = s.phase === "voting" && !!s.dayVote?.open;
  const mayorStage = s.mayorElection?.stage || "idle";
  const deathIds=(s.lastDeaths||[]).map(d=>d.key+':'+d.cause).join('|');
  if(!mayorActive && deathIds && deathIds!==lastDeathIds){ hero.classList.add('deathPulse'); setTimeout(()=>hero.classList.remove('deathPulse'),1200); }
  lastDeathIds=deathIds;
  let title="Lobby", sub="Wacht tot iedereen joined.";
  if(s.winner){ title=s.winner.title; sub=s.winner.text; }
  else if(s.phase==="night"){ title="Nacht"; sub="Het is nacht. Iedereen slaapt."; }
  else if(s.phase==="day"){
    title="Dag";
    sub=(s.lastDeaths||[]).length ? "deze spelers hebben de avond niet overleefd" : "Het is dag. Het dorp wordt wakker.";
  }
  else if(s.phase==="mayor"){
    title = "Burgemeester";
    sub = mayorStage === "candidates" ? "wie stelt zich kandidaat?" : "de stemmen worden geteld";
  }
  else if(s.phase==="voting"){ title="Stemming"; sub="de spelers brengen hun stem uit"; }
  else if(s.phase==="hunter"){
    title="Dag";
    sub=(s.lastDeaths||[]).length ? "deze spelers hebben de avond niet overleefd" : "De Jager kiest een laatste slachtoffer.";
  }
  else if(s.phase==="ended"){ title=s.winner?.title||"Einde"; sub=s.winner?.text||"Het spel is afgelopen."; }
  $("bigStatus").textContent=title;
  $("subStatus").textContent=sub;

  if(mayorActive){
    // Burgemeesterfase neemt het centrale podium over: geen oude eliminatiekaarten tonen.
    if(mayorStage === "candidates") renderCandidatesCentral("deaths", s.mayorElection?.candidates||[]);
    else if(mayorStage === "voting") renderMayorVotingHidden("deaths", s.mayorElection?.voters||[]);
    else if(mayorStage === "result") renderMayorResultCentral("deaths", s.mayorElection?.result || {}, s.mayorElection?.candidates||[]);
    else renderCandidatesCentral("deaths", s.mayorElection?.candidates||[]);
  } else if(voteActive){
    renderDayVotingHidden("deaths", s.dayVote?.voters || []);
  } else if(s.dayVote?.result && s.phase === "day" && !(s.lastDeaths||[]).length){
    renderDayVoteResultCentral("deaths", s.dayVote.result);
  } else {
    $("deaths").innerHTML=(s.lastDeaths||[]).map(d=>{
      const visual = deathVisual(d);
      return `<div class="deathCard deathCardWithArt"><h3>${esc(d.name)}</h3>${visual.html}${visual.hasArt ? "" : `<p class="muted">${esc(d.roleName)}</p>`}</div>`;
    }).join("");
  }

  $("viewerPlayers").innerHTML=(s.players||[]).map(p=>`<span class="viewerPlayer ${p.isMayor?'mayor':''} ${p.alive?'':'dead'}">${esc(p.name)}${p.isMayor?' 👑':''}${p.enchanted?' 🎵':''}</span>`).join("");
  // Burgemeester-informatie wordt centraal op het Infoscherm getoond, niet in een extra onderpaneel.
  $("infoVotePanels").classList.add("hidden");
  $("mayorInfoCard").classList.add("hidden");
  $("dayVoteInfoCard").classList.add("hidden");
  $("mayorBars").innerHTML = "";
  $("voteBars").innerHTML = "";
}
function getInfoPhaseClass(s){
  if(s?.winner || s?.phase === "ended") return "ended";
  if(s?.phase === "night") return "night";
  if(["day","mayor","voting","hunter"].includes(s?.phase)) return "day";
  return "lobby";
}

function renderCandidatesCentral(id, rows){
  $(id).innerHTML = rows.length
    ? `<div class="candidateList infoCandidatesCentral">${rows.map((r,i)=>`<div class="candidateCard popCandidate" style="--pop-index:${i}"><h3>${esc(r.name)}</h3></div>`).join("")}</div>`
    : '<p class="muted infoCenterText">Nog geen kandidaten.</p>';
}

function renderMayorVotingHidden(id, voters){
  const total = voters.length || 0;
  const done = voters.filter(v=>v.voted).length;
  $(id).innerHTML = `<div class="infoCenterText"><h3>${done}/${total} spelers hebben gestemd</h3><div class="infoVoters">${voters.map((v,i)=>`<span class="candidatePill ${v.voted?'voted':''}" style="--pop-index:${i}">${esc(v.name)}${v.voted?' ✓':''}</span>`).join("")}</div><p class="muted">De stemmen worden pas na afronden bekendgemaakt.</p></div>`;
}

function renderMayorResultCentral(id, result, fallbackRows){
  const rows = result.counts || fallbackRows || [];
  const max = Math.max(1, ...rows.map(r=>r.votes||0));
  const resultKey = JSON.stringify(rows.map(r=>[r.key||r.name,r.votes||0]));
  $(id).innerHTML = `<div class="infoMayorResult"><h3>${result.winnerName?`${esc(result.winnerName)} is burgemeester`:'Geen burgemeester gekozen'}</h3><div class="mayorResultBars">${rows.map((r,i)=>`<div class="mayorResultBar" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div>`;
  if(resultKey !== lastMayorResultKey){
    lastMayorResultKey = resultKey;
    animateCountUps($(id));
  } else {
    $(id).querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
  }
}


function renderDayVotingHidden(id, voters){
  const total = voters.length || 0;
  const done = voters.filter(v=>v.voted).length;
  $(id).innerHTML = `<div class="infoCenterText"><h3>${done}/${total} spelers hebben gestemd</h3><div class="infoVoters">${voters.map((v,i)=>`<span class="candidatePill ${v.voted?'voted':''}" style="--pop-index:${i}">${esc(v.name)}${v.voted?' ✓':''}</span>`).join("")}</div><p class="muted">De uitslag wordt pas na het afronden bekendgemaakt.</p></div>`;
}

function renderDayVoteResultCentral(id, result){
  const rows = result.counts || [];
  const max = Math.max(1, ...rows.map(r=>r.votes||0));
  $(id).innerHTML = `<div class="infoMayorResult"><h3>${result.eliminatedName?`${esc(result.eliminatedName)} wordt uitgeschakeld`:result.tied?'Gelijke stand':'Geen speler uitgeschakeld'}</h3><div class="mayorResultBars dayResultBars">${rows.map((r,i)=>`<div class="mayorResultBar" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div>`;
  animateCountUps($(id));
}

function animateCountUps(root){
  const els = [...root.querySelectorAll(".countUp")];
  const bars = [...root.querySelectorAll(".mayorBarFill")];
  const start = performance.now();
  const duration = 5000;
  bars.forEach(bar=>{ bar.style.height = "0%"; bar.style.transform = "none"; });
  function frame(now){
    const t = Math.min(1, (now - start) / duration);
    els.forEach(el=>{
      const final = Number(el.dataset.final || 0);
      el.textContent = String(Math.floor(final * t));
    });
    bars.forEach(bar=>{
      const finalHeight = Number(bar.dataset.height || 10);
      bar.style.height = `${Math.max(1, finalHeight * t)}%`;
    });
    if(t < 1) requestAnimationFrame(frame);
    else {
      els.forEach(el=>el.textContent = el.dataset.final || "0");
      bars.forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; });
    }
  }
  requestAnimationFrame(frame);
}

function renderMayorVoteCentral(id, rows){
  renderMayorResultCentral(id, { counts: rows }, rows);
}

function renderCandidates(id, rows){
  $(id).innerHTML = rows.length
    ? `<div class="candidateList infoCandidates">${rows.map(r=>`<span class="candidatePill">${esc(r.name)}</span>`).join("")}</div>`
    : '<p class="muted">Nog geen kandidaten.</p>';
}
function renderVoteBars(id, rows){
  const max=Math.max(1,...rows.map(r=>r.votes||0));
  $(id).innerHTML=rows.length?rows.map(r=>`<div class="voteBar"><div class="voteBarTop"><strong>${esc(r.name)}</strong><span>${r.votes||0}</span></div><div class="progress"><div class="voteFill" style="width:${Math.round((r.votes||0)/max*100)}%"></div></div></div>`).join(""):'<p class="muted">Nog geen stemmen.</p>';
}
