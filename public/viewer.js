const screenTestMode=new URLSearchParams(location.search).has("screenTest");
const socket=io({autoConnect:!screenTestMode});
const $=(id)=>document.getElementById(id);
let lastDeathIds="";
let lastMayorResultKey="";
let lastDayResultKey="";
let lastWinnerKey="";
let displayedState=null;
let winnerTransitionTimer=null;
let hunterTransitionTimer=null;
let hunterTransitionEndTimer=null;
let hunterTransitionPendingKey="";
let viewerRenderFrame=null;
let queuedRenderState=null;
let viewerPlayersKey="";
let centralSceneKey="";
const acknowledgedRevealTokens=new Set();
const revealMemoryKey="wakkerdam_seen_reveals_v0351";
function loadSeenRevealTokens(){
  try{
    const stored=JSON.parse(sessionStorage.getItem(revealMemoryKey) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  }catch(_error){
    sessionStorage.removeItem(revealMemoryKey);
    return new Set();
  }
}
const seenRevealTokens=loadSeenRevealTokens();
let resizeTimer=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function hunterBullseye(className=""){
  return `<span class="hunterBullseyeIcon ${className}" aria-hidden="true"></span>`;
}
function scheduleViewerRender(s){
  queuedRenderState=s;
  if(viewerRenderFrame!==null) return;
  viewerRenderFrame=requestAnimationFrame(()=>{
    viewerRenderFrame=null;
    const next=queuedRenderState;
    queuedRenderState=null;
    if(next) render(next);
  });
}
function runHunterBlackTransition(s){
  const transitionKey=`${s?.phase||""}:${s?.hunterSequence?.stage||""}:${s?.hunterSequence?.hunterKey||""}`;
  if(hunterTransitionPendingKey===transitionKey) return;
  hunterTransitionPendingKey=transitionKey;
  clearTimeout(hunterTransitionTimer);
  clearTimeout(hunterTransitionEndTimer);
  document.body.classList.remove("hunterTransitionBlack");
  void document.body.offsetWidth;
  document.body.classList.add("hunterTransitionBlack");
  hunterTransitionTimer=setTimeout(()=>{
    displayedState=s;
    scheduleViewerRender(s);
  },840);
  hunterTransitionEndTimer=setTimeout(()=>{
    document.body.classList.remove("hunterTransitionBlack");
    hunterTransitionPendingKey="";
  },1650);
}
function hasSeenReveal(token){ return !!token && seenRevealTokens.has(token); }
function acknowledgeReveal(kind, token){
  if(!token || acknowledgedRevealTokens.has(token)) return;
  acknowledgedRevealTokens.add(token);
  seenRevealTokens.add(token);
  sessionStorage.setItem(revealMemoryKey, JSON.stringify([...seenRevealTokens].slice(-80)));
  socket.emit("viewer_reveal_ack", { kind, token });
}
const ROLE_ART = {
  "Burger": ["/assets/cards/burger_1.png", "/assets/cards/burger_2.png", "/assets/cards/burger_3.png", "/assets/cards/burger_4.png"],
  "Weerwolf": ["/assets/cards/weerwolf.png"],
  "Grote Boze Wolf": ["/assets/cards/grote_boze_wolf.png"],
  "Cupido": ["/assets/cards/cupido.png"],
  "Ziener": ["/assets/cards/Ziener.png"],
  "Fluitspeler": ["/assets/cards/fluitspeler.png"],
  "Heks": ["/assets/cards/Heks.png"],
  "Jager": ["/assets/cards/jager.png"]
};
const preloadedViewerArt=[];
for(const src of [...new Set(Object.values(ROLE_ART).flat())]){
  const image=new Image();
  image.decoding="async";
  image.src=src;
  image.decode?.().catch(()=>{});
  preloadedViewerArt.push(image);
}
function stableHash(str){ let h=0; str=String(str||""); for(let i=0;i<str.length;i++) h=((h<<5)-h+str.charCodeAt(i))|0; return Math.abs(h); }
function deathVisual(d){
  const artList = ROLE_ART[d.roleName] || [];
  if(artList.length){
    const variantIndex = d.roleName === "Burger" && Number(d.cardVariant) >= 1 && Number(d.cardVariant) <= artList.length
      ? Number(d.cardVariant) - 1
      : stableHash(d.key||d.name)%artList.length;
    const src = artList[variantIndex];
    return { html:`<img class="deathRoleCard" src="${esc(src)}" alt="${esc(d.roleName)}">`, hasArt:true };
  }
  return { html:`<span class="emoji">${esc(d.roleEmoji)}</span>`, hasArt:false };
}
function deathCardHtml(d, className=""){
  const visual = deathVisual(d);
  const causeMark = d.cause === "hunter" ? `<span class="deathCauseMark hunterCause" aria-label="Uitgeschakeld door de Jager">${hunterBullseye("hunterBullseyeMini")}</span>` : "";
  return `<div class="deathCard deathCardWithArt ${className} ${d.cause==="hunter"?"hunterDeathCard":""}"><h3>${esc(d.name)}</h3>${visual.html}${visual.hasArt ? "" : `<p class="muted">${esc(d.roleName || "")}</p>`}${causeMark}</div>`;
}
function linkedDeathHtml(primary, linkedDeaths=[]){
  const linked = (linkedDeaths || []).filter(d => d?.cause === "love" && d.linkedToKey === primary?.key);
  if(!linked.length) return deathCardHtml(primary);
  return `<div class="linkedDeathReveal">${deathCardHtml(primary,"primaryDeathCard")}<div class="loverDeathStack">${linked.map(d=>`${deathCardHtml(d,"loverDeathCard")}<span class="brokenHeartMark" aria-label="Overleden door liefdesverdriet">💔</span>`).join("")}</div></div>`;
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
function centralKeyForState(s, mayorActive, voteActive, mayorStage){
  if(s.winner){
    return `winner:${s.winner.team||""}:${(s.players||[]).map(p=>`${p.key}:${p.alive?1:0}:${p.enchanted?1:0}:${p.roleName||""}`).join("|")}`;
  }
  if(s.phase === "hunter" && s.hunterSequence){
    const h=s.hunterSequence;
    return `hunter:${h.stage||""}:${h.hunterKey||""}:${(h.shotDeaths||[]).map(d=>`${d.key}:${d.cause}`).join("|")}`;
  }
  if(mayorActive){
    const voters=(s.mayorElection?.voters||[]).map(v=>`${v.key}:${v.voted?1:0}`).join("|");
    const result=s.mayorElection?.result||{};
    return `mayor:${mayorStage}:${voters}:${(result.counts||[]).map(r=>`${r.key}:${r.votes}`).join("|")}:${result.winnerKey||""}`;
  }
  if(voteActive){
    return `voting:${(s.dayVote?.voters||[]).map(v=>`${v.key}:${v.voted?1:0}`).join("|")}`;
  }
  if(s.dayVote?.result && s.phase === "day"){
    const result=s.dayVote.result;
    return `day-result:${(result.counts||[]).map(r=>`${r.key}:${r.votes}`).join("|")}:${result.eliminatedKey||""}:${result.tied?1:0}`;
  }
  return `deaths:${s.phase}:${(s.lastDeaths||[]).map(d=>`${d.key}:${d.cause}:${d.linkedToKey||""}`).join("|")}`;
}
if(!screenTestMode) socket.emit("register_viewer");
socket.on("connect",()=>{if(!screenTestMode) socket.emit("register_viewer");});
window.addEventListener("resize",()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{
    if(!displayedState?.winner) return;
    centralSceneKey="";
    render(displayedState);
  },120);
});
socket.on("state",s=>{
  const startsWinner = !!s?.winner && !s?.winnerPublicRevealed && (!displayedState || !displayedState.winner);
  const startsHunterEvent = !startsWinner
    && displayedState?.phase === "hunter"
    && displayedState?.hunterSequence?.stage === "announcement"
    && s?.phase === "hunter"
    && s?.hunterSequence?.stage === "choosing";
  const returnsFromHunter = !startsWinner
    && displayedState?.phase === "hunter"
    && displayedState?.hunterSequence?.stage === "summary"
    && s?.phase !== "hunter";
  if(startsHunterEvent){
    runHunterBlackTransition(s);
    return;
  }
  if(returnsFromHunter){
    runHunterBlackTransition(s);
    return;
  }
  if(!startsWinner){
    displayedState=s;
    scheduleViewerRender(s);
    return;
  }
  clearTimeout(winnerTransitionTimer);
  document.body.classList.remove("winnerTransitionBlack","winnerTransitionVillage","winnerTransitionWolves","winnerTransitionPiper","winnerTransitionOther");
  void document.body.offsetWidth;
  const winnerTone = s.winner?.team === "village"
    ? "winnerTransitionVillage"
    : s.winner?.team === "wolves"
      ? "winnerTransitionWolves"
      : s.winner?.team === "piper"
        ? "winnerTransitionPiper"
      : "winnerTransitionOther";
  document.body.classList.add("winnerTransitionBlack", winnerTone);
  winnerTransitionTimer=setTimeout(()=>{
    displayedState=s;
    scheduleViewerRender(s);
    acknowledgeReveal("winner", s.winnerRevealToken);
  },1120);
  setTimeout(()=>document.body.classList.remove("winnerTransitionBlack",winnerTone),2700);
});
function render(s){
  if($("version")) $("version").textContent=`v${s.version}`;
  const hero=$("hero");
  const infoClass = getInfoPhaseClass(s);
  const transientHeroClasses=["deathPulse","hunterImpact"].filter(className=>hero.classList.contains(className));
  hero.className=`viewerHero ${infoClass}`;
  if(s.winner?.team === "piper") hero.classList.add("piperWinner");
  transientHeroClasses.forEach(className=>hero.classList.add(className));
  const mayorActive = s.phase === "mayor" && !!s.mayorElection?.open;
  const voteActive = s.phase === "voting" && !!s.dayVote?.open;
  const mayorStage = s.mayorElection?.stage || "idle";
  const deathIds=(s.lastDeaths||[]).map(d=>d.key+':'+d.cause).join('|');
  const hunterShotBuilding = s.phase === "hunter" && s.hunterSequence?.stage === "shot_suspense";
  if(!mayorActive && !hunterShotBuilding && deathIds && deathIds!==lastDeathIds){ hero.classList.add('deathPulse'); setTimeout(()=>hero.classList.remove('deathPulse'),1200); }
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
    const hunterStage = s.hunterSequence?.stage || "announcement";
    if(hunterStage === "announcement"){
      title="De Jager is uitgeschakeld";
      sub="De Jager lost nog één laatste schot.";
    } else if(hunterStage === "choosing"){
      title="Het laatste schot";
      sub="";
    } else if(hunterStage === "shot_suspense"){
      title="Het laatste schot";
      sub="Wie neemt de Jager mee?";
    } else {
      title="Jager-overzicht";
      sub="Dit zijn de gevolgen van het laatste schot.";
    }
  }
  else if(s.phase==="ended"){ title=s.winner?.title||"Einde"; sub=s.winner?.text||"Het spel is afgelopen."; }
  $("bigStatus").textContent=title;
  $("subStatus").textContent=sub || "";
  $("subStatus").classList.toggle("hidden", !sub);

  const nextCentralSceneKey=centralKeyForState(s,mayorActive,voteActive,mayorStage);
  if(nextCentralSceneKey!==centralSceneKey){
    centralSceneKey=nextCentralSceneKey;
    if(s.winner){
      renderWinnerCentral("deaths", s);
    } else if(s.phase === "hunter" && s.hunterSequence){
      renderHunterCentral("deaths", s);
    } else if(mayorActive){
      // Burgemeesterfase neemt het centrale podium over: geen oude eliminatiekaarten tonen.
      if(mayorStage === "candidates") renderCandidatesCentral("deaths", s.mayorElection?.candidates||[]);
      else if(mayorStage === "voting") renderMayorVotingHidden("deaths", s.mayorElection?.voters||[]);
      else if(mayorStage === "result") renderMayorResultCentral("deaths", s.mayorElection?.result || {}, s.mayorElection?.candidates||[]);
      else renderCandidatesCentral("deaths", s.mayorElection?.candidates||[]);
    } else if(voteActive){
      renderDayVotingHidden("deaths", s.dayVote?.voters || []);
    } else if(s.dayVote?.result && s.phase === "day"){
      renderDayVoteResultCentral("deaths", s.dayVote.result);
    } else {
      const deaths = s.lastDeaths || [];
      const linkedKeys = new Set(deaths.filter(d=>d.cause==="love" && d.linkedToKey).map(d=>d.key));
      $("deaths").innerHTML=deaths.filter(d=>!linkedKeys.has(d.key)).map(d=>linkedDeathHtml(d,deaths)).join("");
      if(s.deathRevealToken && !s.deathPublicRevealed){
        const delay = hasSeenReveal(s.deathRevealToken) ? 0 : 1800;
        setTimeout(()=>acknowledgeReveal("deaths",s.deathRevealToken),delay);
      }
    }
  }

  const playerList = $("viewerPlayers");
  if(s.winner){
    if(viewerPlayersKey!=="winner"){
      viewerPlayersKey="winner";
      playerList.className="viewerPlayers";
      playerList.innerHTML="";
    }
  } else {
    const players = s.players || [];
    const density = players.length > 48 ? "ultraDense" : players.length > 24 ? "veryDense" : players.length > 12 ? "dense" : "";
    const nextPlayersKey=`${density}:${players.map(p=>`${p.key}:${p.name}:${p.alive?1:0}:${p.isMayor?1:0}`).join("|")}`;
    if(nextPlayersKey!==viewerPlayersKey){
      viewerPlayersKey=nextPlayersKey;
      playerList.className=`viewerPlayers ${density}`.trim();
      playerList.style.setProperty("--info-player-count", String(Math.max(1, players.length)));
      playerList.innerHTML=players.map(p=>`<span class="viewerPlayer ${p.isMayor?'mayor':''} ${p.alive?'':'dead'}" title="${esc(p.name)}">${esc(p.name)}${p.isMayor?' 👑':''}</span>`).join("");
    }
  }
  // Burgemeester-informatie wordt centraal op het Infoscherm getoond, niet in een extra onderpaneel.
  $("infoVotePanels").classList.add("hidden");
  $("mayorInfoCard").classList.add("hidden");
  $("dayVoteInfoCard").classList.add("hidden");
  $("mayorBars").innerHTML = "";
  $("voteBars").innerHTML = "";
}

function renderHunterCentral(id, s){
  const sequence = s.hunterSequence || {};
  const allDeaths = sequence.allDeaths || s.lastDeaths || [];
  const hunterDeath = sequence.hunterDeath || allDeaths.find(d=>d.key===sequence.hunterKey);
  if(sequence.stage === "announcement"){
    $(id).innerHTML = `<div class="hunterAnnouncement hunterCenteredScene"><div class="hunterLastShotSeal">${hunterBullseye("hunterBullseyeSeal")}<strong>Laatste schot</strong></div>${hunterDeath?deathCardHtml(hunterDeath,"hunterPrimaryCard"):""}</div>`;
    return;
  }
  if(sequence.stage === "choosing"){
    $(id).innerHTML = `<div class="hunterChoiceSuspense hunterCenteredScene">${hunterBullseye("hunterCrosshair")}<strong>De Jager kiest…</strong><small>Het dorp houdt zijn adem in.</small></div>`;
    return;
  }
  if(sequence.stage === "shot_suspense"){
    const shotDeaths = sequence.shotDeaths || [];
    const showShot = ()=>{
      const linkedKeys = new Set(shotDeaths.filter(d=>d.cause==="love"&&d.linkedToKey).map(d=>d.key));
      $(id).innerHTML = `<div class="hunterShotReveal hunterCenteredScene"><div class="hunterShotCopy"><strong>Het schot is gelost</strong><small>Het dorp ziet wie er is geraakt.</small></div><div class="hunterShotCards">${shotDeaths.filter(d=>!linkedKeys.has(d.key)).map(d=>linkedDeathHtml(d,shotDeaths)).join("")}</div></div>`;
      const hero=$("hero");
      hero?.classList.remove("hunterImpact");
      if(hero) void hero.offsetWidth;
      hero?.classList.add("hunterImpact");
      setTimeout(()=>hero?.classList.remove("hunterImpact"),1100);
      acknowledgeReveal("hunter_shot",sequence.shotToken);
    };
    $(id).innerHTML = `<div class="hunterChoiceSuspense hunterCenteredScene shotFired">${hunterBullseye("hunterCrosshair")}<strong>Het schot klinkt…</strong><small>Wie is geraakt?</small></div>`;
    setTimeout(showShot,hasSeenReveal(sequence.shotToken)?0:3600);
    return;
  }
  const shotDeaths = sequence.shotDeaths || [];
  const linkedKeys = new Set(shotDeaths.filter(d=>d.cause==="love"&&d.linkedToKey).map(d=>d.key));
  $(id).innerHTML = `<div class="hunterRoundSummary hunterCenteredScene"><div class="hunterShotCards">${shotDeaths.filter(d=>!linkedKeys.has(d.key)).map(d=>linkedDeathHtml(d,shotDeaths)).join("")}</div></div>`;
}
function getInfoPhaseClass(s){
  if(s?.winner || s?.phase === "ended"){
    const team=String(s?.winner?.team||"other").replace(/[^a-z0-9_-]/gi,"");
    return `ended winner-${team}`;
  }
  if(s?.phase === "night") return "night";
  if(s?.phase === "mayor") return "day mayor";
  if(s?.phase === "voting") return "day voting";
  if(s?.phase === "hunter") return "day hunter";
  if(s?.phase === "day") return "day";
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
    if(result.publicRevealed === false){
      setTimeout(()=>acknowledgeReveal("mayor",result.revealToken),hasSeenReveal(result.revealToken)?0:900);
    }
    return;
  }
  let rows = topVoteRows(result.counts || fallbackRows || [], 5, true);
  if(!rows.length && result?.winnerName){ rows = [{ key: result.winnerKey, name: result.winnerName, votes: 1 }]; }
  const max = Math.max(1, ...rows.map(r=>r.votes||0));
  const resultKey = JSON.stringify(rows.map(r=>[r.key||r.name,r.votes||0])) + ':' + (result?.winnerName||'') + ':' + (result?.tied?'tie':'');
  $(id).innerHTML = `<div class="infoMayorResult"><h3 class="voteFinalText hidden">${esc(finalText)}</h3><div class="mayorResultBars">${rows.map((r,i)=>`<div class="mayorResultBar" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div>`;
  const reveal = (animate=true) => {
    const text = $(id).querySelector(".voteFinalText");
    if(!animate) text?.classList.add("noReplay");
    text?.classList.remove("hidden");
  };
  const alreadyRevealed = result.publicRevealed !== false || hasSeenReveal(result.revealToken);
  if(alreadyRevealed) $(id).querySelector(".infoMayorResult")?.classList.add("noReplay");
  if(resultKey !== lastMayorResultKey && !alreadyRevealed){
    lastMayorResultKey = resultKey;
    animateCountUps($(id), ()=>{
      reveal();
      acknowledgeReveal("mayor", result.revealToken);
    }, result);
  } else {
    lastMayorResultKey = resultKey;
    $(id).querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
    $(id).querySelectorAll(".mayorBarFill").forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; bar.style.setProperty("--graph-progress","1"); });
    reveal(false);
    if(result.publicRevealed === false) acknowledgeReveal("mayor",result.revealToken);
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
  const eliminatedVisual = result.eliminatedName ? deathVisual({ key: result.eliminatedKey, name: result.eliminatedName, roleName: result.eliminatedRoleName, roleEmoji: result.eliminatedRoleEmoji, cardVariant:result.eliminatedCardVariant }) : null;
  const eliminatedDeath = result.eliminatedName ? { key:result.eliminatedKey, name:result.eliminatedName, roleName:result.eliminatedRoleName, roleEmoji:result.eliminatedRoleEmoji, cardVariant:result.eliminatedCardVariant, cause:"vote" } : null;
  const revealCard = eliminatedVisual ? `<div class="dayElimReveal hidden">${linkedDeathHtml(eliminatedDeath,result.linkedDeaths||[])}</div>` : "";
  $(id).innerHTML = `<div class="dayVoteResultStage ${eliminatedVisual?'hasReveal':''}"><div class="dayVoteRevealColumn">${revealCard}</div><div class="infoMayorResult dayVoteGraphColumn"><h3 class="voteFinalText hidden">${esc(finalText)}</h3><div class="mayorResultBars dayResultBars">${rows.map((r,i)=>`<div class="mayorResultBar ${result.eliminatedKey===r.key?'willEliminate':''}" data-key="${esc(r.key||'')}" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div></div>`;
  const reveal = (animate=true) => {
    const stage = $(id).querySelector(".dayVoteResultStage");
    const text = $(id).querySelector(".voteFinalText");
    if(!animate) text?.classList.add("noReplay");
    text?.classList.remove("hidden");
    $(id).querySelectorAll(".willEliminate").forEach(el=>el.classList.add("eliminatedBar"));
    const card = $(id).querySelector(".dayElimReveal");
    if(!animate){
      card?.classList.add("noReplay");
      stage?.classList.add("graphShifted","revealReady");
      card?.classList.remove("hidden");
      return;
    }
    stage?.classList.add("graphShifted");
    setTimeout(()=>{
      stage?.classList.add("revealReady");
      card?.classList.remove("hidden");
      acknowledgeReveal("day_vote", result.revealToken);
    },card?320:180);
  };
  const alreadyRevealed = result.publicRevealed !== false || hasSeenReveal(result.revealToken);
  if(alreadyRevealed) $(id).querySelector(".infoMayorResult")?.classList.add("noReplay");
  if(resultKey !== lastDayResultKey && !alreadyRevealed){
    lastDayResultKey = resultKey;
    animateCountUps($(id), ()=>{
      reveal();
    }, result);
  } else {
    lastDayResultKey = resultKey;
    $(id).querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
    $(id).querySelectorAll(".mayorBarFill").forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; bar.style.animation = "none"; bar.style.setProperty("--graph-progress","1"); });
    reveal(false);
    if(result.publicRevealed === false) acknowledgeReveal("day_vote",result.revealToken);
  }
}

function animateCountUps(root, done, timing={}){
  const els = [...root.querySelectorAll(".countUp")];
  const bars = [...root.querySelectorAll(".mayorBarFill")];
  const finals = els.map(el => Number(el.dataset.final || 0));
  const travelRatios = bars.map(bar => Math.max(.1, Math.min(1, Number(bar.dataset.height || 10) / 100)));
  // Elke nieuwe lokale onthulling krijgt zijn volledige drie seconden. Zo kan
  // een terugkerend Infoscherm de grafiek niet overslaan doordat de serverklok
  // al verder liep terwijl het tabblad geen frames tekende.
  const duration = 3000;
  const start = performance.now();
  bars.forEach(bar=>{
    bar.style.height = `${Number(bar.dataset.height || 10)}%`;
    bar.style.animation = "none";
    bar.style.transition = "none";
    bar.style.transformOrigin = "bottom";
    bar.style.setProperty("--graph-progress","0","important");
  });
  function frame(now){
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    els.forEach((el, i)=>{
      const final = finals[i] || 0;
      const localProgress = Math.min(1, progress / (travelRatios[i] || 1));
      el.textContent = String(localProgress >= 1 ? final : Math.floor(final * localProgress));
    });
    bars.forEach((bar, i)=>{
      const localProgress = Math.min(1, progress / (travelRatios[i] || 1));
      bar.style.setProperty("--graph-progress",String(localProgress),"important");
    });
    if(elapsed < duration) requestAnimationFrame(frame);
    else {
      els.forEach(el=>el.textContent = el.dataset.final || "0");
      bars.forEach(bar=>{
        bar.style.height = `${Number(bar.dataset.height || 10)}%`;
        bar.style.setProperty("--graph-progress","1","important");
      });
      if(typeof done === "function") done();
    }
  }
  requestAnimationFrame(frame);
}

function roleArtForName(roleName, seed, cardVariant=null){
  const artList = ROLE_ART[roleName] || [];
  if(!artList.length) return null;
  if(roleName === "Burger" && Number(cardVariant) >= 1 && Number(cardVariant) <= artList.length) return artList[Number(cardVariant)-1];
  return artList[stableHash(seed||roleName)%artList.length];
}
function winnerPlayerCard(p, defeated=false, extraClass=""){
  const src = roleArtForName(p.roleName, p.key || p.name, p.cardVariant);
  const visual = src ? `<img class="winnerRoleCard" src="${esc(src)}" alt="${esc(p.roleName || '')}">` : `<span class="emoji winnerEmoji">${esc(p.roleEmoji || '🃏')}</span><p class="muted">${esc(p.roleName || '')}</p>`;
  return `<div class="winnerPlayerCard ${p.alive?'alive':'dead'} ${defeated?'defeated':''} ${extraClass}"><h3>${esc(p.name)}</h3>${visual}</div>`;
}
function renderWinnerCentral(id, s){
  const players = s.players || [];
  if(s.winner?.team === "piper"){
    const piper = players.find(p=>p.roleName === "Fluitspeler") || players.find(p=>p.team === "solo_piper") || null;
    const enchanted = players.filter(p=>p.enchanted && p.key !== piper?.key);
    const viewportWidth = Math.max(320, window.innerWidth || 1280);
    const availableWidth = Math.min(1540, viewportWidth * .9);
    const enchantedCardWidth = Math.max(72, Math.min(156, Math.floor(availableWidth / Math.max(1, enchanted.length))));
    const overflowWidth = Math.max(0, enchantedCardWidth * enchanted.length - availableWidth);
    const piperOverlap = enchanted.length > 1 ? Math.min(20, Math.ceil(overflowWidth / (enchanted.length - 1))) : 0;
    const enchantedStyle = `--piper-enchanted-count:${Math.max(1,enchanted.length)};--piper-enchanted-card-width:${enchantedCardWidth}px;--piper-overlap:${piperOverlap}px`;
    $(id).innerHTML = `<div class="winnerStage piperWinnerStage"><h3>${esc(s.winner?.title || "De Fluitspeler wint!")}</h3><section class="piperWinnerLead">${piper?winnerPlayerCard(piper,false,"piperLeadCard"):""}</section><section class="piperEnchantedGroup"><h3 class="winnerGroupTitle">De Betoverden</h3><div class="piperEnchantedScroller"><div class="piperEnchantedCards" style="${enchantedStyle}">${enchanted.map(p=>winnerPlayerCard(p,false,"piperEnchantedCard")).join("")}</div></div></section></div>`;
    return;
  }
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
  const viewportWidth = Math.max(320, window.innerWidth || 1280);
  const maxColumns = viewportWidth <= 600 ? 4 : viewportWidth <= 900 ? 6 : viewportWidth <= 1300 ? 8 : 10;
  const winnerColumns = Math.min(Math.max(1, main.length), maxColumns, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, main.length) * (viewportWidth > 900 ? 1.65 : 1.2)))));
  const winnerRows = Math.max(1, Math.ceil(Math.max(1, main.length) / winnerColumns));
  const minArt = viewportWidth <= 600 ? 44 : viewportWidth <= 900 ? 50 : 58;
  const availableHeight = viewportWidth <= 600 ? 35 : viewportWidth <= 900 ? 44 : 52;
  const winnerSizing = `--winner-count:${Math.max(1, main.length)};--winner-cols:${winnerColumns};--winner-rows:${winnerRows};--winner-card-width:clamp(54px,${(82 / winnerColumns).toFixed(2)}vw,170px);--winner-card-art-height:clamp(${minArt}px,${(availableHeight / winnerRows).toFixed(2)}svh,220px)`;
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

if(screenTestMode){
  document.body.classList.add("screenTestEmbedded");
  window.addEventListener("message",event=>{
    if(event.data?.type!=="wakkerdam-screen-test" || event.data.surface!=="info") return;
    displayedState=event.data.state;
    centralSceneKey="";
    viewerPlayersKey="";
    lastMayorResultKey="";
    lastDayResultKey="";
    render(displayedState);
  });
  window.parent?.postMessage({type:"wakkerdam-screen-test-ready",surface:"info"},"*");
}
