const socket=io();
const $=(id)=>document.getElementById(id);
let lastDeathIds="";
let lastMayorResultKey="";
let lastDayResultKey="";
let lastWinnerKey="";
let displayedState=null;
let winnerTransitionTimer=null;
const acknowledgedRevealTokens=new Set();
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function acknowledgeReveal(kind, token){
  if(!token || acknowledgedRevealTokens.has(token)) return;
  acknowledgedRevealTokens.add(token);
  socket.emit("viewer_reveal_ack", { kind, token });
}
const ROLE_ART = {
  "Burger": ["/assets/cards/burger_man.png", "/assets/cards/burger_woman.png"],
  "Weerwolf": ["/assets/cards/weerwolf.png"],
  "Ziener": ["/assets/cards/Ziener.png"],
  "Fluitspeler": ["/assets/cards/fluitspeler.png"],
  "Heks": ["/assets/cards/Heks.png"]
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

function topVoteRows(rows, limit=5, includeZero=false){
  // Eerst de relevante top bepalen, daarna alfabetisch tonen zodat de winnaar niet meteen links verklapt wordt.
  return (rows || [])
    .filter(r => includeZero ? true : (r.votes || 0) > 0)
    .sort((a,b)=>(b.votes||0)-(a.votes||0)||String(a.name||'').localeCompare(String(b.name||'')))
    .slice(0, limit)
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
function runoffText(names){
  const list = (names || []).filter(Boolean);
  if(list.length <= 1) return list[0] || "";
  if(list.length === 2) return `${list[0]} en ${list[1]}`;
  return `${list.slice(0,-1).join(", ")} en ${list[list.length-1]}`;
}
function finalMayorText(result){
  if(result?.winnerName) return `de nieuwe burgemeester is ${result.winnerName}`;
  if(result?.runoffPending) return `gelijke stand — herstemming tussen ${runoffText(result.runoffNames || [])}`;
  if(result?.tied) return 'geen burgemeester gekozen door gelijke score';
  return 'geen burgemeester gekozen';
}
socket.emit("register_viewer");
socket.on("connect",()=>socket.emit("register_viewer"));
socket.on("state",s=>{
  const startsWinner = !!s?.winner && !s?.winnerPublicRevealed && (!displayedState || !displayedState.winner);
  if(!startsWinner){
    displayedState=s;
    render(s);
    return;
  }
  clearTimeout(winnerTransitionTimer);
  document.body.classList.remove("winnerTransitionBlack");
  void document.body.offsetWidth;
  document.body.classList.add("winnerTransitionBlack");
  winnerTransitionTimer=setTimeout(()=>{
    displayedState=s;
    render(s);
    acknowledgeReveal("winner", s.winnerRevealToken);
  },840);
  setTimeout(()=>document.body.classList.remove("winnerTransitionBlack"),1650);
});
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
  let title="Lobby", sub="Wacht op spelers.";
  if(s.winner){ title=s.winner.title; sub=s.winner.text; lastWinnerKey = `${s.winner.team || ""}:${s.winner.title || ""}`; }
  else if(s.phase==="night"){ title="Nacht"; sub="Iedereen slaapt."; }
  else if(s.phase==="day"){
    title="Dag";
    sub=(s.lastDeaths||[]).length ? "Deze spelers hebben de nacht niet overleefd." : "Het dorp wordt wakker.";
  }
  else if(s.phase==="mayor"){
    title = "Burgemeester";
    sub = mayorStage === "candidates" ? "Wie stelt zich kandidaat?" : "De stemmen worden geteld.";
  }
  else if(s.phase==="voting"){ title="Stemming"; sub="Er wordt gestemd."; }
  else if(s.phase==="hunter"){
    title="Dag";
    sub=(s.lastDeaths||[]).length ? "Deze spelers hebben de nacht niet overleefd." : "De Jager kiest een slachtoffer.";
  }
  else if(s.phase==="ended"){ title=s.winner?.title||"Einde"; sub=s.winner?.text||"Het spel is afgelopen."; }
  $("bigStatus").textContent=title;
  $("subStatus").textContent=sub || "";
  $("subStatus").classList.toggle("hidden", !sub);

  if(s.winner){
    renderWinnerCentral("deaths", s);
  } else if(mayorActive){
    // Burgemeesterfase neemt het centrale podium over: geen oude eliminatiekaarten tonen.
    if(mayorStage === "candidates") renderCandidatesCentral("deaths", s.mayorElection?.candidates||[]);
    else if(mayorStage === "voting") renderMayorVotingHidden("deaths", s.mayorElection?.voters||[]);
    else if(mayorStage === "result") renderMayorResultCentral("deaths", s.mayorElection?.result || {}, s.mayorElection?.candidates||[]);
    else renderCandidatesCentral("deaths", s.mayorElection?.candidates||[]);
  } else if(voteActive){
    renderDayVotingHidden("deaths", s.dayVote?.voters || []);
  } else if(s.dayVote?.result && s.phase === "day"){
    // Dagstemming-uitslag moet ook als grafiek/reveal worden getoond wanneer de stem iemand elimineert.
    // Eerder wonnen lastDeaths/deathCards deze render-tak, waardoor de dagstemgrafiek niet verscheen.
    renderDayVoteResultCentral("deaths", s.dayVote.result);
  } else {
    $("deaths").innerHTML=(s.lastDeaths||[]).map(d=>{
      const visual = deathVisual(d);
      return `<div class="deathCard deathCardWithArt"><h3>${esc(d.name)}</h3>${visual.html}${visual.hasArt ? "" : `<p class="muted">${esc(d.roleName)}</p>`}</div>`;
    }).join("");
  }

  const playerList = $("viewerPlayers");
  if(s.winner){
    playerList.className="viewerPlayers";
    playerList.innerHTML="";
  } else {
    const players = s.players || [];
    const density = players.length > 48 ? "ultraDense" : players.length > 24 ? "veryDense" : players.length > 12 ? "dense" : "";
    playerList.className=`viewerPlayers ${density}`.trim();
    playerList.style.setProperty("--info-player-count", String(Math.max(1, players.length)));
    playerList.innerHTML=players.map(p=>`<span class="viewerPlayer ${p.isMayor?'mayor':''} ${p.alive?'':'dead'}" title="${esc(p.name)}">${esc(p.name)}${p.isMayor?' 👑':''}${p.enchanted?' 🎵':''}</span>`).join("");
  }
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
  if(s?.phase === "mayor") return "day mayor";
  if(s?.phase === "voting") return "day voting";
  if(["day","hunter"].includes(s?.phase)) return "day";
  return "lobby";
}

function renderCandidatesCentral(id, rows){
  const density = rows.length > 16 ? "veryDense" : rows.length > 8 ? "dense" : "";
  $(id).innerHTML = rows.length
    ? `<div class="candidateList infoCandidatesCentral ${density}" style="--candidate-count:${Math.max(1, rows.length)}">${rows.map((r,i)=>`<div class="candidateCard popCandidate" style="--pop-index:${i}"><h3>${esc(r.name)}</h3></div>`).join("")}</div>`
    : '<p class="muted infoCenterText">Nog geen kandidaten.</p>';
}

function renderMayorVotingHidden(id, voters){
  const total = voters.length || 0;
  const done = voters.filter(v=>v.voted).length;
  $(id).innerHTML = `<div class="infoCenterText"><h3>${done}/${total} spelers hebben gestemd</h3><div class="infoVoters">${voters.map((v,i)=>`<span class="candidatePill ${v.voted?'voted':''}" style="--pop-index:${i};--voter-font-size:${Math.max(11,22-Math.max(0,String(v.name||"").length-10)*.55).toFixed(1)}px" title="${esc(v.name)}">${esc(v.name)}${v.voted?' ✓':''}</span>`).join("")}</div></div>`;
}

function renderMayorResultCentral(id, result, fallbackRows){
  const finalText = finalMayorText(result);
  if(result?.automaticSingleCandidate){
    $(id).innerHTML = `<div class="infoMayorResult singleMayorResult"><h3 class="voteFinalText">${esc(finalText)}</h3></div>`;
    lastMayorResultKey = `single:${result?.winnerKey||result?.winnerName||''}`;
    return;
  }
  let rows = topVoteRows(result.counts || fallbackRows || [], 5, true);
  if(!rows.length && result?.winnerName){ rows = [{ key: result.winnerKey, name: result.winnerName, votes: 1 }]; }
  const max = Math.max(1, ...rows.map(r=>r.votes||0));
  const resultKey = JSON.stringify(rows.map(r=>[r.key||r.name,r.votes||0])) + ':' + (result?.winnerName||'') + ':' + (result?.tied?'tie':'');
  $(id).innerHTML = `<div class="infoMayorResult"><h3 class="voteFinalText hidden">${esc(finalText)}</h3><div class="mayorResultBars">${rows.map((r,i)=>`<div class="mayorResultBar" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div>`;
  const reveal = () => $(id).querySelector(".voteFinalText")?.classList.remove("hidden");
  if(resultKey !== lastMayorResultKey){
    lastMayorResultKey = resultKey;
    animateCountUps($(id), ()=>{
      reveal();
      acknowledgeReveal("mayor", result.revealToken);
    }, result);
  } else {
    $(id).querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
    $(id).querySelectorAll(".mayorBarFill").forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; });
    reveal();
  }
}


function renderDayVotingHidden(id, voters){
  const total = voters.length || 0;
  const done = voters.filter(v=>v.voted).length;
  $(id).innerHTML = `<div class="infoCenterText"><h3>${done}/${total} spelers hebben gestemd</h3><div class="infoVoters">${voters.map((v,i)=>`<span class="candidatePill ${v.voted?'voted':''}" style="--pop-index:${i};--voter-font-size:${Math.max(11,22-Math.max(0,String(v.name||"").length-10)*.55).toFixed(1)}px" title="${esc(v.name)}">${esc(v.name)}${v.voted?' ✓':''}</span>`).join("")}</div></div>`;
}

function renderDayVoteResultCentral(id, result){
  const rows = topVoteRows(result.counts || [], 5);
  const max = Math.max(1, ...rows.map(r=>r.votes||0));
  const finalText = result.eliminatedName?`${result.eliminatedName} is geëlimineerd.`:result.tied?'gelijke stand':'geen speler geëlimineerd';
  const resultKey = JSON.stringify(rows.map(r=>[r.key||r.name,r.votes||0])) + ':' + (result?.eliminatedKey||'') + ':' + (result?.tied?'tie':'');
  const eliminatedVisual = result.eliminatedName ? deathVisual({ key: result.eliminatedKey, name: result.eliminatedName, roleName: result.eliminatedRoleName, roleEmoji: result.eliminatedRoleEmoji }) : null;
  const revealCard = eliminatedVisual ? `<div class="dayElimReveal hidden"><div class="deathCard deathCardWithArt"><h3>${esc(result.eliminatedName)}</h3>${eliminatedVisual.html}${eliminatedVisual.hasArt ? "" : `<p class="muted">${esc(result.eliminatedRoleName || '')}</p>`}</div></div>` : "";
  $(id).innerHTML = `<div class="dayVoteResultStage ${eliminatedVisual?'hasReveal':''}"><div class="dayVoteRevealColumn">${revealCard}</div><div class="infoMayorResult dayVoteGraphColumn"><h3 class="voteFinalText hidden">${esc(finalText)}</h3><div class="mayorResultBars dayResultBars">${rows.map((r,i)=>`<div class="mayorResultBar ${result.eliminatedKey===r.key?'willEliminate':''}" data-key="${esc(r.key||'')}" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div></div>`;
  const reveal = () => {
    const stage = $(id).querySelector(".dayVoteResultStage");
    $(id).querySelector(".voteFinalText")?.classList.remove("hidden");
    $(id).querySelectorAll(".willEliminate").forEach(el=>el.classList.add("eliminatedBar"));
    stage?.classList.add("revealReady");
    $(id).querySelector(".dayElimReveal")?.classList.remove("hidden");
  };
  if(resultKey !== lastDayResultKey){
    lastDayResultKey = resultKey;
    animateCountUps($(id), ()=>{
      reveal();
      acknowledgeReveal("day_vote", result.revealToken);
    }, result);
  } else {
    $(id).querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
    $(id).querySelectorAll(".mayorBarFill").forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; bar.style.animation = "none"; });
    reveal();
  }
}

function animateCountUps(root, done, timing={}){
  const els = [...root.querySelectorAll(".countUp")];
  const bars = [...root.querySelectorAll(".mayorBarFill")];
  const finals = els.map(el => Number(el.dataset.final || 0));
  const start = performance.now();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const duration = reduceMotion ? 120 : Math.max(1000, Number(timing.revealDurationMs || 6500));
  bars.forEach(bar=>{ bar.style.height = "0%"; bar.style.animation = "none"; bar.style.transform = "none"; });
  function frame(now){
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    // Lineair oplopen voorkomt dat de balk al visueel stilstaat terwijl het
    // laatste stemcijfer nog moet verschijnen.
    const eased = progress;
    els.forEach((el, i)=>{
      const final = finals[i] || 0;
      el.textContent = String(progress >= 1 ? final : Math.floor(final * eased));
    });
    bars.forEach((bar, i)=>{
      const final = finals[i] || 0;
      const finalHeight = Number(bar.dataset.height || 10);
      bar.style.height = `${Math.max(final > 0 ? 1 : 0, finalHeight * eased)}%`;
    });
    if(elapsed < duration) requestAnimationFrame(frame);
    else {
      els.forEach(el=>el.textContent = el.dataset.final || "0");
      bars.forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; });
      if(typeof done === "function") done();
    }
  }
  requestAnimationFrame(frame);
}

function roleArtForName(roleName, seed){
  const artList = ROLE_ART[roleName] || [];
  return artList.length ? artList[stableHash(seed||roleName)%artList.length] : null;
}
function winnerPlayerCard(p, defeated=false){
  const src = roleArtForName(p.roleName, p.key || p.name);
  const visual = src ? `<img class="winnerRoleCard" src="${esc(src)}" alt="${esc(p.roleName || '')}">` : `<span class="emoji winnerEmoji">${esc(p.roleEmoji || '🃏')}</span><p class="muted">${esc(p.roleName || '')}</p>`;
  return `<div class="winnerPlayerCard ${p.alive?'alive':'dead'} ${defeated?'defeated':''}"><h3>${esc(p.name)}</h3>${visual}</div>`;
}
function renderWinnerCentral(id, s){
  const players = s.players || [];
  let main = [];
  let defeated = [];
  if(s.winner?.team === 'wolves') {
    main = players.filter(p=>p.wolfLike);
    defeated = [];
  } else if(s.winner?.team === 'village') {
    main = players.filter(p=>!p.wolfLike);
    defeated = players.filter(p=>p.wolfLike);
  } else {
    main = players;
  }
  const winnerColumns = Math.min(Math.max(1, main.length), Math.max(2, Math.ceil(Math.sqrt(Math.max(1, main.length) * 1.6))));
  const winnerRows = Math.max(1, Math.ceil(Math.max(1, main.length) / winnerColumns));
  const winnerSizing = `--winner-count:${Math.max(1, main.length)};--winner-cols:${winnerColumns};--winner-rows:${winnerRows};--winner-card-width:clamp(62px,${(72 / winnerColumns).toFixed(2)}vw,170px);--winner-card-art-height:clamp(58px,${(52 / winnerRows).toFixed(2)}svh,220px)`;
  const defeatedWidth = Math.min(500, Math.max(210, 90 + defeated.length * 135));
  const defeatedHtml = defeated.length?`<aside class="defeatedWolves" style="--defeated-count:${defeated.length};--defeated-panel-width:${defeatedWidth}px"><h4>Verslagen wolven</h4><div class="winnerCards small">${defeated.map(p=>winnerPlayerCard(p,true)).join('')}</div></aside>`:'';
  const groupTitle = s.winner?.team === "village" ? "Het Dorp" : s.winner?.team === "wolves" ? "De Weerwolven" : "";
  $(id).innerHTML = `<div class="winnerStage ${defeated.length?'hasDefeated':''}" style="${winnerSizing}"><h3>${esc(s.winner?.title || 'Einde')}</h3><div class="winnerLayout"><section class="winnerMainGroup">${groupTitle?`<h3 class="winnerGroupTitle">${esc(groupTitle)}</h3>`:""}<div class="winnerCards winnerMainCards">${main.map(p=>winnerPlayerCard(p,false)).join('')}</div></section>${defeatedHtml}</div></div>`;
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
