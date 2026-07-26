const socket = io();
const $ = (id) => document.getElementById(id);
let state=null;
let rolesDetailsTouched=false;
let rolesDetailsProgrammatic=false;
let lastActiveGame = false;
let forceWolfNextArmed = false;
let pendingKickKey = null;
let pendingKickTimer = null;
window.__hostConsole = [];
(function captureConsole(){
  const push=(level,args)=>{
    try { window.__hostConsole.push({at:new Date().toISOString(), level, text:[...args].map(a=>typeof a==="string"?a:JSON.stringify(a)).join(" ")}); window.__hostConsole=window.__hostConsole.slice(-200); } catch(e) {}
  };
  ["log","warn","error"].forEach(level=>{
    const original=console[level].bind(console);
    console[level]=(...args)=>{ push(level,args); original(...args); };
  });
  window.addEventListener("error", e=>push("error", [e.message, e.filename, e.lineno, e.colno]));
  window.addEventListener("unhandledrejection", e=>push("error", ["Unhandled promise", e.reason]));
})();
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function initials(name){return String(name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();}
function toast(text){const el=$("toast");el.textContent=text;el.classList.remove("hidden");clearTimeout(window.__t);window.__t=setTimeout(()=>el.classList.add("hidden"),2600);}

socket.emit("register_host");
socket.on("connect",()=>socket.emit("register_host"));
socket.on("host_state", s=>{state=s;render();});
socket.on("host_error", toast);

const bind=(id,event)=>$(id).addEventListener("click",()=>socket.emit(event));
bind("startBtn","host_start_game");
$("nextStepBtn").addEventListener("click",()=>{
  if(state?.phase === "night" && state?.currentStep?.kind === "wolves" && !state.currentStep.ready){
    const ok = confirm("de wolven hebben nog geen gezamenlijk slachtoffer gekozen, weet je het zeker?");
    if(!ok) return;
    socket.emit("host_next_step", { force:true });
    return;
  }
  socket.emit("host_next_step");
});
bind("resolveNightBtn","host_resolve_night"); bind("mayorBtn","host_open_mayor"); bind("startMayorVoteBtn","host_start_mayor_vote"); bind("closeMayorBtn","host_close_mayor"); bind("voteBtn","host_open_day_vote"); bind("closeVoteBtn","host_close_day_vote"); bind("nextNightBtn","host_start_next_night"); bind("resetBtn","host_reset");
document.addEventListener("click", (e)=>{
  const btn = e.target.closest?.("[data-host-event]");
  if(!btn) return;
  const event = btn.dataset.hostEvent;
  if(event) socket.emit(event);
});
document.querySelectorAll("[data-preset]").forEach(b=>b.addEventListener("click",()=>socket.emit("host_apply_preset", {preset:b.dataset.preset})));
$("rolesCard")?.addEventListener("toggle", () => { if(!rolesDetailsProgrammatic) rolesDetailsTouched = true; });
$("debugToggle").addEventListener("click",()=>$("debugPanel").classList.toggle("hidden"));
$("addTestPlayerBtn").addEventListener("click",()=>socket.emit("host_add_test_player"));
$("copyConsoleBtn").addEventListener("click",()=>copyText(JSON.stringify(window.__hostConsole||[], null, 2), "Console gekopieerd."));
$("copyDebugBtn").addEventListener("click",()=>socket.emit("host_debug_snapshot"));
socket.on("host_debug_snapshot", snap=>{
  const payload={
    copiedAt:new Date().toISOString(),
    location:location.href,
    userAgent:navigator.userAgent,
    clientConsole:window.__hostConsole||[],
    snapshot:snap,
    lastHostState:state
  };
  copyText(JSON.stringify(payload,null,2), "Debug gekopieerd.");
});

async function copyText(text, ok="Gekopieerd."){
  try{
    await navigator.clipboard.writeText(text);
    toast(ok);
  }catch(err){
    console.error("Kopiëren mislukt", err);
    toast("Kopiëren mislukt; check browserrechten.");
  }
}
function showButton(id, show){ $(id).classList.toggle("hidden", !show); }
function hasRemainingNightStep(){ return (state.nightSteps||[]).some(x=>!x.done&&!x.skipped); }

function render(){
  if(!state) return;
  const activeGame = !!state.started && state.phase !== "lobby";
  document.body.classList.toggle("gameActive", activeGame);
  const rolesCard = $("rolesCard");
  // Bij overgang naar actief spel altijd eerst standaard inklappen.
  if(activeGame && !lastActiveGame) rolesDetailsTouched = false;
  if(!activeGame) rolesDetailsTouched = false;
  if(rolesCard && !rolesDetailsTouched) {
    const shouldOpen = !activeGame;
    if(rolesCard.open !== shouldOpen){
      rolesDetailsProgrammatic = true;
      rolesCard.open = shouldOpen;
      setTimeout(()=>{ rolesDetailsProgrammatic = false; }, 0);
    }
  }
  lastActiveGame = activeGame;
  $("version").textContent=`v${state.version}`;
  renderPhase(); renderStep(); renderPlayers(); renderRoles(); renderVotes();
}
function renderPhase(){
  const total=state.selectedRoleTotal, players=state.players.length;
  let phaseLabel={lobby:"Lobby",night:"Nacht",day:"Dag",mayor:"Burgemeester",voting:"Stemming",hunter:"Jager",ended:"Einde"}[state.phase]||state.phase;
  if(state.phase === "mayor") phaseLabel = state.mayorElection?.stage === "candidates" ? "Burgemeester: kandidaatstelling" : "Burgemeester: stemmen";
  const phaseTone = state.phase==='night' ? 'red' : state.phase==='day' ? 'green' : state.phase==='ended' ? 'gold' : '';
  const pills = [`<span class="pill ${phaseTone}">${esc(phaseLabel)}</span>`];
  if(state.phase === "lobby"){
    pills.push(`<span class="pill ${total===players?'green':'red'}">${total}/${players} rollen</span>`);
  } else {
    if(["night","day","mayor","voting","hunter"].includes(state.phase)) pills.push(`<span class="pill">Nacht ${state.nightNumber}</span>`);
    pills.push(`<span class="pill">${state.aliveCount}/${players} levend</span>`);
  }
  if(state.specialPowersDisabled) pills.push('<span class="pill red">Burgerkrachten verzwakt</span>');
  $("phasePills").innerHTML=pills.join("");

  const inLobby=state.phase==="lobby";
  const inNight=state.phase==="night";
  const inDay=state.phase==="day";
  const inMayor=state.phase==="mayor";
  const inVoting=state.phase==="voting";
  const ended=state.phase==="ended";
  const hasLivingMayor=(state.players||[]).some(p=>p.alive && p.isMayor);
  const dayAftermath=!!state.dayAftermath?.active;
  const pendingWinner=!!state.pendingWinner;
  const remaining=hasRemainingNightStep();
  const isWolfStep=inNight && state.currentStep?.kind === "wolves";
  const canAdvanceNight=inNight && (!state.currentStep || state.currentStep.ready || isWolfStep);
  const noActiveStep=inNight && !state.currentStep;

  $("startBtn").disabled=state.started || total!==players || players<3;
  $("startBtn").title = players<3 ? "Minimaal 3 spelers nodig" : (total!==players ? `Kies precies ${players} rollen/tegels` : "Start het spel");
  showButton("startBtn", true);
  showButton("resetBtn", true);
  showButton("nextStepBtn", inNight);
  $("nextStepBtn").disabled=!canAdvanceNight;
  const unfinishedSteps = (state.nightSteps||[]).filter(x=>!x.done&&!x.skipped);
  const currentIsFinalNightStep = !!state.currentStep && state.currentStep.ready && unfinishedSteps.length === 1 && unfinishedSteps[0].id === state.currentStep.id;
  $("nextStepBtn").textContent=noActiveStep ? (remaining ? "Start volgende nachtstap" : "Maak het dag") : (currentIsFinalNightStep ? "Maak het dag" : (state.currentStep?.ready ? "Volgende nachtstap" : (isWolfStep ? "Volgende stap forceren" : "Wacht op speler")));
  showButton("resolveNightBtn", false);
  $("resolveNightBtn").disabled=true;
  const mayorStage = state.mayorElection?.stage || "idle";
  const candidateCount = (state.mayorElection?.candidates || []).length;
  const mayorRunoffReady = !!(state.started && inMayor && mayorStage === "result" && state.mayorElection?.result?.runoffPending);
  const mayorResultReady = !!(state.started && inMayor && mayorStage === "result" && !state.dayVote?.open && !mayorRunoffReady);
  const dayRunoffReady = !!(!pendingWinner && state.started && inDay && !ended && !state.dayVote?.open && state.dayVote?.result?.runoffPending);
  const normalDayVoteReady = !!(!pendingWinner && state.started && inDay && !ended && !state.dayVote?.open && !state.dayVote?.result && ((state.players||[]).filter(p=>p.alive).length >= 2));
  showButton("mayorBtn", !pendingWinner && state.started && inDay && !state.mayorElection?.open && !hasLivingMayor);
  showButton("startMayorVoteBtn", (inMayor && mayorStage === "candidates") || mayorRunoffReady);
  $("startMayorVoteBtn").disabled = !(((inMayor && mayorStage === "candidates" && candidateCount > 0) || mayorRunoffReady));
  $("startMayorVoteBtn").textContent = mayorRunoffReady ? "Start herstemming" : "Laat spelers stemmen";
  showButton("closeMayorBtn", inMayor && mayorStage === "voting");
  if(inMayor && mayorStage === "voting") $("closeMayorBtn").textContent = "Burgemeester afronden";
  // Hotfix v0.3.28: na de burgemeesteruitslag moet deze knop altijd zichtbaar zijn in het controlepaneel.
  showButton("voteBtn", mayorResultReady || normalDayVoteReady || dayRunoffReady);
  $("voteBtn").disabled = !(mayorResultReady || normalDayVoteReady || dayRunoffReady);
  $("voteBtn").textContent = dayRunoffReady ? "Start herstemming" : "Open dagstemming";
  $("voteBtn").classList.toggle("majorDayVoteBtn", mayorResultReady || dayRunoffReady);
  showButton("closeVoteBtn", inVoting);
  if(inVoting) $("closeVoteBtn").textContent = "Stemming afronden";
  showButton("nextNightBtn", pendingWinner || (state.started && inDay && !ended && !dayAftermath && !state.dayVote?.open && !dayRunoffReady));
  $("nextNightBtn").disabled=!(pendingWinner || (state.started && inDay && !ended && !dayAftermath && !state.dayVote?.open && !dayRunoffReady));
  $("nextNightBtn").textContent = pendingWinner ? "Toon winnaar" : "Start volgende nacht";

  if ($("voteCard")) $("voteCard").classList.add("hidden");
}
function renderStep(){
  const timeline=renderTimeline();
  const mayorStage = state.mayorElection?.stage || "idle";
  if(state.phase === "mayor"){
    $("currentStep").innerHTML = renderHostMayorStep(mayorStage);
    return;
  }
  if(state.phase === "voting"){
    $("currentStep").innerHTML = renderHostDayVoteStep();
    return;
  }
  const s=state.currentStep;
  if(!s){
    const next=(state.nightSteps||[]).find(x=>!x.done&&!x.skipped);
    if(state.pendingWinner){ $("currentStep").innerHTML=`<h3>Winnaar klaar</h3><p class="muted">Toon de winnaar na de eliminaties.</p>`; return; }
    $("currentStep").innerHTML=state.phase==="night"?`${timeline}<p class="muted">Hierna: ${next?esc(next.label):"dag"}</p>`:(state.phase==="day"&&state.dayAftermath?.active?`<h3>Dag</h3><p class="muted">Ga door naar de burgemeester of dagstemming.</p>`:`<p class="muted">Geen actieve stap.</p>`);
    return;
  }

  if(s.kind === "wolves"){
    const sub = formatHostWolfConsensus(s);
    $("currentStep").innerHTML=`${timeline}<h3 class="wolfStepTitle"><span>${esc(s.label)}</span></h3>${sub}`;
    return;
  }

  $("currentStep").innerHTML=`${timeline}<div class="roleStepHeading"><h3>${esc(s.label)}</h3></div>${s.help?`<p class="roleStepHelp">${esc(s.help)}</p>`:""}${renderHostRoleChoices(s)}`;
}

function renderHostRoleChoices(step){
  const actors = step.actors || [];
  if(!actors.length) return '<p class="muted">Geen speler voor deze stap.</p>';
  return `<div class="hostRoleChoices">${actors.map(actor=>{
    const submission = step.submissions?.[actor.key] || null;
    const preview = step.previews?.[actor.key] || null;
    const confirmed = !!submission;
    const hasPreview = !!preview && Object.keys(preview).length > 0;
    const status = confirmed ? "Bevestigd" : hasPreview ? "Wordt gekozen" : "Wacht op keuze";
    const statusClass = confirmed ? "confirmed" : hasPreview ? "choosing" : "waiting";
    return `<article class="hostRoleActor ${statusClass}"><header><strong>${esc(actor.name)}</strong><span>${status}</span></header>${renderRoleDecisionGrid(step.kind, submission, preview)}</article>`;
  }).join("")}</div>`;
}

function roleDecision(label, value, tone=""){
  return `<div class="roleDecision ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function roleCardPath(roleId){
  if(["infectious_wolf","big_bad_wolf","white_wolf"].includes(roleId)) return "/assets/cards/weerwolf.png";
  return ({
    villager:"/assets/cards/burger_man.png",
    werewolf:"/assets/cards/weerwolf.png",
    seer:"/assets/cards/Ziener.png",
    witch:"/assets/cards/Heks.png",
    piper:"/assets/cards/fluitspeler.png"
  })[roleId] || null;
}

function roleTargetDecision(label, value, tone=""){
  const src = value.targetRoleId ? roleCardPath(value.targetRoleId) : null;
  const card = !value.targetName ? "" : src
    ? `<img class="hostTargetRoleCard" src="${esc(src)}" alt="${esc(value.targetRoleName || "")}">`
    : value.targetRoleName
      ? `<div class="hostTargetRoleFallback"><span>${esc(value.targetRoleEmoji || "🃏")}</span><strong>${esc(value.targetRoleName)}</strong></div>`
      : "";
  return `<div class="roleDecision roleTargetDecision ${tone}"><span>${esc(label)}</span><strong>${esc(value.targetName || "Nog niemand gekozen")}</strong>${card}</div>`;
}

function renderRoleDecisionGrid(kind, submission, preview){
  const value = submission || preview || {};
  let cards = [];
  if(kind === "witch"){
    cards = [
      roleDecision("Levensdrank", `Redt ${value.saveName || "niemand"}`, value.saveName ? "save" : ""),
      roleDecision("Gifdrank", `Vergiftigt ${value.poisonName || "niemand"}`, value.poisonName ? "poison" : "")
    ];
  } else if(kind === "cupid"){
    const names = submission?.lovers || preview?.targetNames || [];
    cards = [
      roleDecision("Geliefde 1", names[0] || "Nog niet gekozen", names[0] ? "love" : ""),
      roleDecision("Geliefde 2", names[1] || "Nog niet gekozen", names[1] ? "love" : "")
    ];
  } else if(kind === "piper"){
    const names = submission?.targets || preview?.targetNames || [];
    cards = [roleDecision("Betovering", names.length ? names.join(" + ") : "Nog niemand gekozen", names.length ? "magic" : "")];
  } else if(kind === "seer"){
    cards = [submission
      ? roleTargetDecision("Bekijkt", value)
      : roleDecision("Bekijkt", value.targetName || "Nog niemand gekozen")];
  } else if(kind === "wild_child"){
    cards = [roleDecision("Rolmodel", value.targetName || "Nog niemand gekozen", value.targetName ? "choice" : "")];
  } else if(kind === "big_bad_wolf" || kind === "white_wolf"){
    cards = [roleDecision("Slachtoffer", value.targetName || "Nog niemand gekozen", value.targetName ? "poison" : "")];
  } else if(kind === "fox"){
    cards = [roleDecision("Controleert", value.targetName || "Nog niemand gekozen")];
  } else if(kind === "wolf_hound"){
    cards = [roleDecision("Kant", value.choice === "wolf" ? "Wolvenkant" : value.choice === "village" ? "Burgerkant" : "Nog niet gekozen", value.choice ? "choice" : "")];
  } else if(kind === "infectious_wolf"){
    cards = [roleDecision("Besmetting", value.infect ? `Besmet ${value.targetName || "slachtoffer"}` : submission ? "Besmet niemand" : "Nog niet gekozen", value.infect ? "poison" : "")];
  } else if(value.targetName){
    cards = [roleDecision("Keuze", value.targetName, "choice")];
  } else if(value.ready){
    cards = [roleDecision("Status", "Klaar")];
  } else {
    cards = [roleDecision("Keuze", "Nog niet gekozen")];
  }
  return `<div class="roleDecisionGrid ${cards.length > 1 ? "split" : ""}">${cards.join("")}</div>`;
}
function renderHostMayorStep(stage){
  if(stage === "candidates"){
    const rows = state.mayorElection?.candidates || [];
    const responses = state.mayorElection?.candidateResponses || [];
    const responseRows = responses.length ? `<div class="candidateResponseGrid">${responses.map(r=>{
      const label = r.response === "yes" ? "wil burgemeester worden" : r.response === "no" ? "wil niet" : "wacht";
      const cls = r.response === "yes" ? "green" : r.response === "no" ? "ghost" : "gold";
      return `<div class="candidateResponse ${cls}"><strong>${esc(r.name)}</strong><span>${label}</span></div>`;
    }).join("")}</div>` : "";
    return `<h3>Kandidaatstelling</h3>${renderCandidateListHtml(rows)}${responseRows}`;
  }
  if(stage === "voting"){
    const voters = state.mayorElection?.voters || [];
    const voted = voters.filter(v=>v.voted).length;
    const rows = state.mayorElection?.liveCounts || state.mayorElection?.candidates || [];
    return `<h3>Burgemeester stemmen</h3><div class="voteProgressText">${voted}/${voters.length} spelers hebben gestemd</div>${renderVoteBarsHtml(rows, "burgemeester")}`;
  }
  if(stage === "result"){
    const result = state.mayorElection?.result;
    const winner = result?.winnerName;
    const counts = result?.counts || state.mayorElection?.candidates || [];
    const tieText = result?.runoffPending ? `gelijke stand — herstemming tussen ${esc((result.runoffNames||[]).join(" en "))}` : (result?.tied ? "geen burgemeester gekozen door gelijke score" : "Geen burgemeester gekozen");
    return `<h3>Burgemeester uitslag</h3>${winner?`<div class="resultBox wolfConsensusGood"><div class="resultBig"><strong>${esc(winner)}</strong> is burgemeester</div></div>`:`<div class="resultBox wolfConsensusBad"><div class="resultBig">${tieText}</div></div>`}<div class="hostMayorBars">${renderVoteBarsHtml(counts, "burgemeester")}</div>`;
  }
  return `<p class="muted">Burgemeesterfase.</p>`;
}

function renderCandidateListHtml(rows){
  return rows.length
    ? `<div class="candidateList">${rows.map(r=>`<span class="candidatePill">${esc(r.name)}</span>`).join('')}</div>`
    : '<p class="muted">Nog niemand heeft zich kandidaat gesteld.</p>';
}
function renderHostDayVoteStep(){
  const voters = state.dayVote?.voters || state.players.filter(p=>p.alive).map(p=>({name:p.name, voted: !!state.dayVote?.votes?.[p.key]}));
  const done = voters.filter(v=>v.voted).length;
  const rows = state.dayVote?.liveCounts || state.dayVote?.counts || [];
  const title = state.dayVote?.runoffCandidates?.length ? "Open dagstemming — herstemming" : "Open dagstemming";
  return `<h3>${title}</h3><div class="voteProgressText">${done}/${voters.length} spelers hebben gestemd</div>${renderVoteBarsHtml(rows, "dagstemming")}`;
}


function renderHostVotingRows(voters, type){
  const rows = (voters || []).map(v=>{
    const target = v.targetName || v.confirmedTargetName || null;
    const status = v.voted ? 'bevestigd' : (target ? 'geselecteerd' : 'wacht');
    const cls = v.voted ? 'green' : (target ? 'gold' : 'ghost');
    const targetHtml = target ? `<div class="hostVoteTarget">→ ${esc(target)}</div>` : '<div class="hostVoteTarget muted">nog geen keuze</div>';
    return `<div class="hostVoteRow ${cls}"><strong>${esc(v.name)}</strong>${targetHtml}<span class="pill ${cls}">${status}${v.voted?' ✓':''}</span></div>`;
  }).join('');
  return `<div class="hostVoteLiveList">${rows}</div>`;
}
function renderVoteBarsHtml(rows, type="stemming"){
  const sorted = (rows || []).slice().sort((a,b)=>(b.votes||0)-(a.votes||0)||String(a.name||"").localeCompare(String(b.name||"")));
  const max=Math.max(1,...sorted.map(r=>r.votes||0));
  const leadText = type === "burgemeester" ? "Live stand burgemeester" : "Live stand dagstemming";
  return sorted.length?`<div class="liveVoteBars"><div class="resultLabel">${leadText}</div>${sorted.map((r,i)=>`<div class="voteBar liveRank ${i===0&&r.votes>0?'leader':''}"><div class="voteBarTop"><strong>${esc(r.name)}</strong><span>${r.votes||0}</span></div><div class="progress"><div class="voteFill" style="width:${Math.max(3,Math.round((r.votes||0)/max*100))}%"></div></div></div>`).join('')}</div>`:'<p class="muted">Nog geen stemmen.</p>';
}
function renderTimeline(){
  const steps=state.nightSteps||[];
  if(state.phase!=="night" || !steps.length) return "";
  return `<div class="stepTimeline">${steps.map((st,i)=>`${i?'<span class="stepTimelineArrow">→</span>':''}<span class="stepTimelineItem ${st.done?'done':''} ${st.active?'active':''}"><span>${esc(st.emoji||stepEmoji(st.kind))}</span><span>${esc(shortStepLabel(st.label))}</span></span>`).join("")}</div>`;
}
function stepEmoji(kind){
  return ({wolf_hound:"🐕",wild_child:"🧒",cupid:"💘",lovers_info:"💞",seer:"🔮",sisters_info:"👭",wolves:"🐺",infectious_wolf:"🩸",big_bad_wolf:"🌕",white_wolf:"🤍",witch:"🧪",fox:"🦊",piper:"🎵",enchanted_info:"✨"})[kind]||"🃏";
}
function shortStepLabel(label){ return String(label||"").replace("Weerwolven kiezen slachtoffer","Wolven").replace("Ziener onderzoekt","Ziener").replace("Heks gebruikt drankjes","Heks").replace("Besmettelijke Oerwolf beslist over besmetting","Oerwolf").replace("Grote Boze Wolf kiest extra slachtoffer","Grote Wolf").replace("Witte Weerwolf slaat toe","Witte Wolf").replace("Fluitspeler betovert","Fluitspeler"); }
function formatHostWolfConsensus(s){
  const rows=s.wolfConsensus?.rows||[];
  if(!rows.length) return `<p class="muted">Geen levende wolven actief.</p>`;
  const locked = !!(s.wolfConsensus?.locked || s.wolfConsensus?.allConfirmedSame);
  const targetCounts = new Map();
  rows.forEach(w=>{ if(w.targetKey) targetCounts.set(w.targetKey, (targetCounts.get(w.targetKey)||0)+1); });
  const confirmedTargets = [...new Set(rows.filter(w=>w.confirmed && w.targetKey).map(w=>w.targetKey))];
  const votedTargets = [...targetCounts.keys()];
  const maxVotes = votedTargets.length ? Math.max(...votedTargets.map(k=>targetCounts.get(k)||0)) : 0;
  const leadingTargets = votedTargets.filter(k=>(targetCounts.get(k)||0)===maxVotes);
  const uniqueLeader = leadingTargets.length === 1 ? leadingTargets[0] : null;
  const mismatch = confirmedTargets.length > 1 || votedTargets.length > 1;
  const cardClass = (w)=>{
    if(locked) return "good";
    if(!w.targetKey) return "empty";
    if(!uniqueLeader) return "bad";
    if(w.targetKey === uniqueLeader) return "good";
    return "bad";
  };
  const cards=rows.map(w=>`<div class="wolfRow wolfColor${w.colorIndex} wolfHostCard ${cardClass(w)}"><span class="wolfMarker">${w.marker}</span><div><strong>${esc(w.name)}</strong><div class="roleName">${w.targetName?`kiest ${esc(w.targetName)}`:'nog geen keuze'} · ${w.confirmed?'bevestigd':'niet bevestigd'}</div></div></div>`).join("");
  let verdict;
  if(locked && s.wolfConsensus?.consensusTargetName){
    verdict = `<div class="resultBox wolfConsensusResult wolfConsensusGood wolfLockedResultName"><div class="resultBig"><strong>${esc(s.wolfConsensus.consensusTargetName)}</strong></div></div>`;
  } else if(mismatch){
    verdict = `<div class="resultBox wolfConsensusResult wolfConsensusBad"><div class="resultBig">de wolven zijn aan het kiezen.</div></div>`;
  } else {
    verdict = `<div class="resultBox wolfConsensusResult wolfConsensusNeutral"><div class="resultBig">de wolven zijn aan het kiezen.</div></div>`;
  }
  return `${verdict}<div class="hostWolfConsensus">${cards}</div>`;
}

function renderPlayers(){
  $("players").innerHTML=(state.players||[]).map(p=>{
    const armed = pendingKickKey === p.key;
    const status = [p.roleSummary||p.roleName, p.alive ? "" : "dood", p.isBot ? "test" : (p.connected ? "" : "offline")].filter(Boolean).join(" · ");
    return `<div class="playerRow ${p.alive?'':'dead'}"><div class="playerMain"><div class="avatar">${esc(p.roleEmoji||initials(p.name))}</div><div class="playerIdentity"><strong>${esc(p.name)}${p.isMayor?' 👑':''}</strong><div class="roleName">${esc(status)}</div></div></div><div class="btnrow playerActions"><button class="btn danger smallBtn ${armed?'pulseConfirm':''}" title="Verwijder speler" data-kick="${esc(p.key)}">${armed?'Bevestig':'Kick'}</button></div></div>`;
  }).join("") || '<p class="muted">Geen spelers.</p>';
  document.querySelectorAll("[data-kick]").forEach(b=>b.addEventListener("click",()=>{
    const key = b.dataset.kick;
    if(pendingKickKey === key){
      clearTimeout(pendingKickTimer);
      pendingKickKey = null;
      socket.emit("host_kick_player", {key});
      return;
    }
    pendingKickKey = key;
    clearTimeout(pendingKickTimer);
    pendingKickTimer = setTimeout(()=>{ pendingKickKey = null; renderPlayers(); }, 5000);
    renderPlayers();
  }));
}
function renderRoles(){
  const playerCount=state.players.length;
  $("roleTotal").textContent=`${state.selectedRoleTotal}/${playerCount} rollen`;
  $("roles").innerHTML=(state.roles||[]).map(r=>{
    const count=state.selectedRoleCounts[r.id]||0;
    return `<div class="roleTile"><div class="roleTop"><div><span class="roleEmoji">${esc(r.emoji)}</span><strong> ${esc(r.name)}</strong><div class="roleName">${esc(r.group)} · max ${r.max}</div></div><div class="counter"><button class="btn ghost" data-role-dec="${esc(r.id)}">−</button><span class="num">${count}</span><button class="btn ghost" data-role-inc="${esc(r.id)}">+</button></div></div><p class="muted small">${esc(r.desc)}</p></div>`;
  }).join("");
  document.querySelectorAll("[data-role-inc]").forEach(b=>b.addEventListener("click",()=>setRole(b.dataset.roleInc, (state.selectedRoleCounts[b.dataset.roleInc]||0)+1)));
  document.querySelectorAll("[data-role-dec]").forEach(b=>b.addEventListener("click",()=>setRole(b.dataset.roleDec, (state.selectedRoleCounts[b.dataset.roleDec]||0)-1)));
}
function setRole(roleId,count){ if(state.started) return; socket.emit("host_set_role_count", {roleId,count}); }
function renderVotes(){
  const mayorStage = state.mayorElection?.stage || "idle";
  if ($("mayorPanelTitle")) $("mayorPanelTitle").textContent = mayorStage === "candidates" ? "Kandidaten burgemeester" : "Stemmen burgemeester";
  if (mayorStage === "candidates") renderCandidateList("mayorBars", state.mayorElection?.candidates||[]);
  else renderVoteBars("mayorBars", state.mayorElection?.candidates||[]);
  renderVoteBars("voteBars", state.dayVote?.counts||[]);
}
function renderCandidateList(id, rows){
  $(id).innerHTML = rows.length
    ? `<div class="candidateList">${rows.map(r=>`<span class="candidatePill">${esc(r.name)}</span>`).join("")}</div>`
    : '<p class="muted">Nog niemand heeft zich kandidaat gesteld.</p>';
}
function renderVoteBars(id, rows){
  const max=Math.max(1,...rows.map(r=>r.votes||0));
  $(id).innerHTML=rows.length?rows.map(r=>`<div class="voteBar"><div class="voteBarTop"><strong>${esc(r.name)}</strong><span>${r.votes||0}</span></div><div class="progress"><div class="voteFill" style="width:${Math.round((r.votes||0)/max*100)}%"></div></div></div>`).join(""):'<p class="muted">Nog geen stemmen.</p>';
}
function renderLog(){ /* log panel removed in v0.3.23 */ }
