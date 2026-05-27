const socket = io();
const $ = (id) => document.getElementById(id);
let state=null;
let rolesDetailsTouched=false;
let rolesDetailsProgrammatic=false;
let lastActiveGame = false;
let forceWolfNextArmed = false;
let forceWolfNextTimer = null;
let resetArmed = false;
let resetTimer = null;
let clearLobbyArmed = false;
let clearLobbyTimer = null;
let hostRevealUnlockTimer = null;
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
    if(!forceWolfNextArmed){
      armTemporaryConfirm("forceWolf");
      return;
    }
    clearButtonArm("forceWolf");
    socket.emit("host_next_step", { force:true });
    return;
  }
  clearButtonArm("forceWolf");
  socket.emit("host_next_step");
});
bind("resolveNightBtn","host_resolve_night"); bind("mayorBtn","host_open_mayor"); bind("startMayorVoteBtn","host_start_mayor_vote"); bind("closeMayorBtn","host_close_mayor"); bind("voteBtn","host_open_day_vote"); bind("closeVoteBtn","host_close_day_vote"); bind("nextNightBtn","host_start_next_night");
$("resetBtn").addEventListener("click",()=>{
  if(!resetArmed){ armTemporaryConfirm("reset"); return; }
  clearButtonArm("reset");
  socket.emit("host_reset");
});
$("clearLobbyBtn")?.addEventListener("click",()=>{
  if(state?.started) return;
  if(!clearLobbyArmed){ armTemporaryConfirm("clearLobby"); return; }
  clearButtonArm("clearLobby");
  socket.emit("host_clear_lobby");
});
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
function currentHostRevealLockUntil(){
  const times = [];
  if(state?.revealLockUntil) times.push(Number(state.revealLockUntil));
  const mayorResult = state?.mayorElection?.stage === "result" ? state?.mayorElection?.result : null;
  if(mayorResult?.revealUntil) times.push(Number(mayorResult.revealUntil));
  const dayResult = state?.dayVote?.result || null;
  if(dayResult?.visualRevealUntil || dayResult?.revealUntil) times.push(Number(dayResult.visualRevealUntil || dayResult.revealUntil));
  return Math.max(0, ...times.filter(t=>Number.isFinite(t) && t > Date.now()));
}
function hostRevealLocked(){ return currentHostRevealLockUntil() > Date.now(); }
function scheduleHostRevealUnlock(){
  clearTimeout(hostRevealUnlockTimer);
  const until = currentHostRevealLockUntil();
  if(until > Date.now()) hostRevealUnlockTimer = setTimeout(()=>renderPhase(), Math.max(80, until - Date.now() + 60));
}
function clearButtonArm(timerName){
  if(timerName === "forceWolf"){ clearTimeout(forceWolfNextTimer); forceWolfNextArmed = false; forceWolfNextTimer = null; }
  if(timerName === "reset"){ clearTimeout(resetTimer); resetArmed = false; resetTimer = null; }
  if(timerName === "clearLobby"){ clearTimeout(clearLobbyTimer); clearLobbyArmed = false; clearLobbyTimer = null; }
}
function armTemporaryConfirm(kind, timeout=5000){
  clearButtonArm(kind);
  if(kind === "forceWolf"){ forceWolfNextArmed = true; forceWolfNextTimer = setTimeout(()=>{ forceWolfNextArmed = false; renderPhase(); }, timeout); }
  if(kind === "reset"){ resetArmed = true; resetTimer = setTimeout(()=>{ resetArmed = false; renderPhase(); }, timeout); }
  if(kind === "clearLobby"){ clearLobbyArmed = true; clearLobbyTimer = setTimeout(()=>{ clearLobbyArmed = false; renderPhase(); }, timeout); }
  renderPhase();
}

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
  $("phasePills").innerHTML=`<span class="pill ${state.phase==='night'?'red':state.phase==='day'?'green':state.phase==='ended'?'gold':''}">${esc(phaseLabel)}</span><span class="pill">Nacht ${state.nightNumber}</span><span class="pill ${total===players?'green':'red'}">rollen ${total}/${players}</span><span class="pill">Levend: ${state.aliveCount} van ${state.players.length}</span>${state.specialPowersDisabled?'<span class="pill red">burgerkrachten verzwakt</span>':''}`;

  const inLobby=state.phase==="lobby";
  const inNight=state.phase==="night";
  const inDay=state.phase==="day";
  const inMayor=state.phase==="mayor";
  const inVoting=state.phase==="voting";
  const ended=state.phase==="ended";
  const hasLivingMayor=(state.players||[]).some(p=>p.alive && p.isMayor);
  const dayAftermath=!!state.dayAftermath?.active;
  const pendingWinner=!!state.pendingWinner;
  const revealLocked=hostRevealLocked();
  scheduleHostRevealUnlock();
  const remaining=hasRemainingNightStep();
  const isWolfStep=inNight && state.currentStep?.kind === "wolves";
  const canAdvanceNight=inNight && (!state.currentStep || state.currentStep.ready || isWolfStep);
  const noActiveStep=inNight && !state.currentStep;

  $("startBtn").disabled=state.started || total!==players || players<3;
  $("startBtn").title = players<3 ? "Minimaal 3 spelers nodig" : (total!==players ? `Kies precies ${players} rollen` : "Start het spel");
  showButton("startBtn", true);
  showButton("clearLobbyBtn", inLobby && !state.started && players > 0);
  showButton("resetBtn", true);
  showButton("nextStepBtn", inNight);
  $("nextStepBtn").disabled=!canAdvanceNight;
  const unfinishedSteps = (state.nightSteps||[]).filter(x=>!x.done&&!x.skipped);
  const currentIsFinalNightStep = !!state.currentStep && state.currentStep.ready && unfinishedSteps.length === 1 && unfinishedSteps[0].id === state.currentStep.id;
  $("nextStepBtn").textContent=noActiveStep ? (remaining ? "Start volgende nachtstap" : "Maak het dag") : (currentIsFinalNightStep ? "Maak het dag" : (state.currentStep?.ready ? "Volgende nachtstap" : (isWolfStep ? "Forceer / volgende nachtstap" : "Wacht op speleractie")));
  if(forceWolfNextArmed && isWolfStep && !state.currentStep?.ready){
    $("nextStepBtn").textContent = "Weet je het zeker?";
    $("nextStepBtn").classList.add("pulseConfirm");
  } else {
    $("nextStepBtn").classList.remove("pulseConfirm");
    if(forceWolfNextArmed && (!isWolfStep || state.currentStep?.ready)) clearButtonArm("forceWolf");
  }
  showButton("resolveNightBtn", false);
  $("resolveNightBtn").disabled=true;
  const mayorStage = state.mayorElection?.stage || "idle";
  const candidateCount = (state.mayorElection?.candidates || []).length;
  const mayorRunoffReady = !!(state.started && inMayor && mayorStage === "result" && state.mayorElection?.result?.runoffPending);
  const mayorResultReady = !!(hasLivingMayor && state.started && inMayor && mayorStage === "result" && !state.dayVote?.open && !mayorRunoffReady);
  const dayRunoffReady = !!(hasLivingMayor && !pendingWinner && state.started && inDay && !ended && !state.dayVote?.open && state.dayVote?.result?.runoffPending);
  const normalDayVoteReady = !!(hasLivingMayor && !pendingWinner && state.started && inDay && !ended && !state.dayVote?.open && !state.dayVote?.result && ((state.players||[]).filter(p=>p.alive).length >= 2));
  const completedDayVoteReadyForNight = !!(state.dayVote?.result && !state.dayVote?.result?.runoffPending);
  showButton("mayorBtn", !pendingWinner && state.started && inDay && !state.mayorElection?.open && !hasLivingMayor);
  $("mayorBtn").disabled = revealLocked;
  $("mayorBtn").title = revealLocked ? "Wacht tot de reveal/animatie klaar is" : "";
  showButton("startMayorVoteBtn", (inMayor && mayorStage === "candidates") || mayorRunoffReady);
  $("startMayorVoteBtn").disabled = revealLocked || !(((inMayor && mayorStage === "candidates" && candidateCount > 0) || mayorRunoffReady));
  $("startMayorVoteBtn").title = revealLocked ? "Wacht tot de reveal/animatie klaar is" : "";
  $("startMayorVoteBtn").textContent = mayorRunoffReady ? "Start herstemming" : "Laat spelers stemmen";
  showButton("closeMayorBtn", inMayor && mayorStage === "voting");
  if(inMayor && mayorStage === "voting") $("closeMayorBtn").textContent = "Forceer / rond burgemeester af";
  // Hotfix v0.3.28: na de burgemeesteruitslag moet deze knop altijd zichtbaar zijn in het controlepaneel.
  showButton("voteBtn", mayorResultReady || normalDayVoteReady || dayRunoffReady);
  $("voteBtn").disabled = revealLocked || !(mayorResultReady || normalDayVoteReady || dayRunoffReady);
  $("voteBtn").title = revealLocked ? "Wacht tot de reveal/animatie klaar is" : "";
  $("voteBtn").textContent = dayRunoffReady ? "Start herstemming" : "Open dagstemming";
  $("voteBtn").classList.toggle("majorDayVoteBtn", mayorResultReady || dayRunoffReady);
  showButton("closeVoteBtn", inVoting);
  if(inVoting) $("closeVoteBtn").textContent = "Forceer / rond dagstemming af";
  showButton("nextNightBtn", pendingWinner || (state.started && inDay && !ended && !dayAftermath && !state.dayVote?.open && completedDayVoteReadyForNight && !dayRunoffReady));
  $("nextNightBtn").disabled=revealLocked || !(pendingWinner || (state.started && inDay && !ended && !dayAftermath && !state.dayVote?.open && completedDayVoteReadyForNight && !dayRunoffReady));
  $("nextNightBtn").title = revealLocked ? "Wacht tot de reveal/animatie klaar is" : "";
  $("nextNightBtn").textContent = pendingWinner ? "Toon winnaar" : "Start volgende nacht";

  ["mayorBtn","startMayorVoteBtn","voteBtn","nextNightBtn"].forEach(id=>$(id)?.classList.toggle("revealLocked", revealLocked));

  if(resetArmed){
    $("resetBtn").textContent = "Weet je het zeker?";
    $("resetBtn").classList.add("pulseConfirm");
  } else {
    $("resetBtn").textContent = "Reset";
    $("resetBtn").classList.remove("pulseConfirm");
  }
  if(clearLobbyArmed && inLobby && !state.started && players > 0){
    $("clearLobbyBtn").textContent = "Weet je het zeker?";
    $("clearLobbyBtn").classList.add("pulseConfirm");
  } else {
    $("clearLobbyBtn").textContent = "Clear lobby";
    $("clearLobbyBtn").classList.remove("pulseConfirm");
    if(clearLobbyArmed && (!inLobby || state.started || players <= 0)) clearButtonArm("clearLobby");
  }

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
    if(state.pendingWinner){ $("currentStep").innerHTML=`<h3>Winnaar klaar</h3><p class="muted">Het Infoscherm toont nu eerst wie de avond niet heeft overleefd. Klik op “Toon winnaar” om het eindscherm te tonen.</p>`; return; }
    $("currentStep").innerHTML=state.phase==="night"?`${timeline}<h3>Nacht actief</h3><p class="muted">Volgende stap: ${next?esc(next.label):"nacht oplossen"}</p>`:(state.phase==="day"&&state.dayAftermath?.active?`<h3>Dag</h3><p class="muted">Het Infoscherm toont nu eerst wie de avond niet heeft overleefd. Klik daarna door naar burgemeesterverkiezing of dagstemming.</p>`:`<p class="muted">Geen nachtstap actief.</p>`);
    return;
  }

  if(s.kind === "wolves"){
    const sub = formatHostWolfConsensus(s);
    $("currentStep").innerHTML=`${timeline}<h3 class="wolfStepTitle"><span>${esc(s.label)}</span></h3>${sub}`;
    return;
  }

  const pct=s.expectedCount?Math.min(100,Math.round((s.submissionCount/s.expectedCount)*100)):100;
  const actors=s.actors.map(a=>`<span class="pill ${a.isBot?'gold':(s.submissions[a.key]?'green':'red')}">${esc(a.name)} · ${esc(a.roleName)} ${actorStatus(a.key,s)}</span>`).join(" ");
  const sub=Object.entries(s.submissions||{}).map(([k,v])=>`<div class="hostSubmission"><div class="resultLabel">${esc(state.players.find(p=>p.key===k)?.name||k)}</div>${formatSubmission(s.kind,v)}</div>`).join("") || `<p class="muted">Nog geen keuze ingestuurd.</p>`;
  const preview=s.nightPreview?formatNightPreview(s.nightPreview):"";
  $("currentStep").innerHTML=`${timeline}<h3>${esc(s.label)} ${s.ready?'✅':'⏳'}</h3>${s.help?`<p>${esc(s.help)}</p>`:""}<div class="btnrow">${actors||'<span class="pill">geen actors</span>'}</div><div class="progress" style="margin:12px 0"><div class="bar" style="width:${pct}%"></div></div>${preview}<h3 style="margin-top:14px">Huidige keuzes / resultaat</h3><div class="hostSubmissions">${sub}</div>`;
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
    return `<h3>Burgemeester kandidaatstelling</h3>${renderCandidateListHtml(rows)}${responseRows}<p class="muted small">Als iemand te lang wacht, klik je op “Laat spelers stemmen”. Niet-reageerders worden dan geen kandidaat.</p>`;
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
  return `<div class="hostVoteLiveList">${rows}</div><p class="muted small">Je ziet hier live wie een keuze selecteert en wie definitief bevestigd heeft. Het Infoscherm toont de uitslag pas na afronden.</p>`;
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
function actorStatus(key,s){
  if(s.kind === "wolves"){
    const row=(s.wolfConsensus?.rows||[]).find(r=>r.key===key);
    return row?.confirmed ? `OK → ${row.targetName||'?'}` : row?.targetName ? `kiest ${row.targetName}` : 'wacht';
  }
  const a=s.actors.find(x=>x.key===key);
  return a?.isBot ? 'test' : (s.submissions[key]?'klaar':'wacht');
}
function wolfActorClass(key,s){
  const row=(s.wolfConsensus?.rows||[]).find(r=>r.key===key);
  return row?.confirmed ? 'green' : row?.targetName ? 'gold' : 'red';
}
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

function playerName(key){ return state.players.find(p=>p.key===key)?.name || key || "—"; }
function formatSubmission(kind,v){
  if(!v) return `<div class="resultBig">—</div>`;
  if(kind==="seer") return `<div class="resultBig">${esc(v.targetName || playerName(v.targetKey))}: ${esc(v.result || "?")}${v.wolfLike?" · wolfachtig":""}</div>`;
  if(kind==="fox") return `<div class="resultBig">${v.foundWolfLike?"Minstens één wolfachtige gevonden":"Geen wolfachtige gevonden"}</div><p class="muted small">Gecheckt: ${esc((v.checked||[]).join(", "))}</p>`;
  if(kind==="witch") return `<div class="resultBig">Redt: ${esc(v.saveName || "niemand")} · Vergiftigt: ${esc(v.poisonName || "niemand")}</div>`;
  if(kind==="wolf_hound") return `<div class="resultBig">${v.choice==="wolf"?"Wolvenkant":"Burgerkant"}</div>`;
  if(kind==="infectious_wolf") return `<div class="resultBig">${v.infect?`Besmet ${esc(v.targetName||"")}`:"Niet besmetten"}</div>`;
  if(v.targetName) return `<div class="resultBig">${esc(v.targetName)}</div>`;
  if(v.targets) return `<div class="resultBig">${esc((v.targets||[]).join(", "))}</div>`;
  if(v.lovers) return `<div class="resultBig">${esc((v.lovers||[]).join(" + "))}</div>`;
  if(v.ready) return `<div class="resultBig">Klaar</div>`;
  return `<div class="resultBig">${esc(JSON.stringify(v))}</div>`;
}
function formatNightPreview(n){
  const rows=[];
  if(n.wolfVictimKey) rows.push(`Wolven: ${esc(playerName(n.wolfVictimKey))}`);
  if(n.bigBadVictimKey) rows.push(`Grote Boze Wolf: ${esc(playerName(n.bigBadVictimKey))}`);
  if(n.whiteWolfVictimKey) rows.push(`Witte Wolf: ${esc(playerName(n.whiteWolfVictimKey))}`);
  if(n.witchSaveKey) rows.push(`Heks redt: ${esc(playerName(n.witchSaveKey))}`);
  if(n.witchPoisonKey) rows.push(`Heks vergiftigt: ${esc(playerName(n.witchPoisonKey))}`);
  if(n.infectedKey) rows.push(`Besmet: ${esc(playerName(n.infectedKey))}`);
  if(n.piperTargets?.length) rows.push(`Fluitspeler: ${n.piperTargets.map(playerName).map(esc).join(", ")}`);
  return rows.length ? `<div class="nightPreview"><div class="resultLabel">Nachtpreview</div>${rows.map(r=>`<span class="pill red">${r}</span>`).join(" ")}</div>` : "";
}
function renderPlayers(){
  $("players").innerHTML=(state.players||[]).map(p=>{
    const armed = pendingKickKey === p.key;
    return `<div class="playerRow ${p.alive?'':'dead'}"><div class="playerMain"><div class="avatar">${esc(p.roleEmoji||initials(p.name))}</div><div><strong>${esc(p.name)}${p.isMayor?' 👑':''}</strong><div class="roleName">${esc(p.roleSummary||p.roleName)} · ${p.alive?'levend':'dood'} · ${p.isBot?'testspeler':(p.connected?'online':'offline')}</div></div></div><div class="btnrow playerActions"><button class="btn danger smallBtn ${armed?'pulseConfirm':''}" title="Verwijder speler uit lobby/game" data-kick="${esc(p.key)}">${armed?'Klik nog een keer':'Kick'}</button></div></div>`;
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
  const total=state.selectedRoleTotal || 0;
  const full = playerCount > 0 && total >= playerCount;
  $("roleTotal").textContent=`${total} van de ${playerCount} rollen geselecteerd`;
  $("roleTotal").classList.toggle("green", total === playerCount && playerCount > 0);
  $("roleTotal").classList.toggle("red", total !== playerCount || playerCount <= 0);
  $("roles").innerHTML=(state.roles||[]).map(r=>{
    const count=state.selectedRoleCounts[r.id]||0;
    const incDisabled = state.started || full || count >= r.max;
    const decDisabled = state.started || count <= 0;
    return `<div class="roleTile"><div class="roleTop"><div><span class="roleEmoji">${esc(r.emoji)}</span><strong> ${esc(r.name)}</strong><div class="roleName">${esc(r.group)} · max ${r.max}</div></div><div class="counter"><button class="btn ghost" data-role-dec="${esc(r.id)}" ${decDisabled?'disabled':''}>−</button><span class="num">${count}</span><button class="btn ghost" data-role-inc="${esc(r.id)}" ${incDisabled?'disabled title="Aantal rollen is gelijk aan aantal spelers"':''}>+</button></div></div><p class="muted small">${esc(r.desc)}</p></div>`;
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
    ? `<div class="candidateList">${rows.map(r=>`<span class="candidatePill">${esc(r.name)}</span>`).join("")}</div><p class="muted small">Deze spelers hebben zich beschikbaar gesteld. Klik daarna op “Laat spelers stemmen”.</p>`
    : '<p class="muted">Nog niemand heeft zich kandidaat gesteld.</p>';
}
function renderVoteBars(id, rows){
  const max=Math.max(1,...rows.map(r=>r.votes||0));
  $(id).innerHTML=rows.length?rows.map(r=>`<div class="voteBar"><div class="voteBarTop"><strong>${esc(r.name)}</strong><span>${r.votes||0}</span></div><div class="progress"><div class="voteFill" style="width:${Math.round((r.votes||0)/max*100)}%"></div></div></div>`).join(""):'<p class="muted">Nog geen stemmen.</p>';
}
function renderLog(){ /* log panel removed in v0.3.23 */ }
