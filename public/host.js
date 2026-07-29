const socket = io();
const $ = (id) => document.getElementById(id);
let state=null;
let rolesDetailsTouched=false;
let rolesDetailsProgrammatic=false;
let lastActiveGame = false;
let forceAdvanceTimer = null;
let forceAdvanceSeconds = 0;
let forceAdvanceReady = false;
let forceAdvanceContext = "";
let forceAdvanceButtonId = "";
let pendingKickKey = null;
let pendingKickTimer = null;
let renderFrame = null;
let playersMarkup = "";
let rolesMarkup = "";
let currentStepMarkup = "";
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
function hunterBullseye(className=""){
  return `<span class="hunterBullseyeIcon ${className}" aria-hidden="true"></span>`;
}
function initials(name){return String(name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();}
function toast(text){const el=$("toast");el.textContent=text;el.classList.remove("hidden");clearTimeout(window.__t);window.__t=setTimeout(()=>el.classList.add("hidden"),2600);}
function scheduleRender(){
  if(renderFrame !== null) return;
  renderFrame = requestAnimationFrame(()=>{
    renderFrame = null;
    render();
  });
}
function setCurrentStep(markup){
  if(markup===currentStepMarkup) return;
  currentStepMarkup=markup;
  $("currentStep").innerHTML=markup;
}

socket.emit("register_host");
socket.on("connect",()=>socket.emit("register_host"));
socket.on("host_state", s=>{state=s;scheduleRender();});
socket.on("peek_host_state", peek=>{
  if(!state) return;
  state.peek=peek;
  if(state.currentStep?.kind==="wolves") renderStep();
});
socket.on("host_error", toast);

const bind=(id,event)=>$(id).addEventListener("click",()=>socket.emit(event));
bind("startBtn","host_start_game");
$("nextStepBtn").addEventListener("click",()=>{
  const hunterStage = state?.hunterSequence?.stage || "";
  const forceNeeded = (state?.phase === "night" && !!state.currentStep && !state.currentStep.ready)
    || (state?.phase === "hunter" && ["choosing","shot_suspense"].includes(hunterStage));
  const context = state.phase === "hunter" ? `hunter:${hunterStage}` : `night:${state.currentStep?.id || ""}`;
  requestHostAction({buttonId:"nextStepBtn",context,forceNeeded,event:"host_next_step"});
});
bind("resolveNightBtn","host_resolve_night"); bind("mayorBtn","host_open_mayor"); bind("voteBtn","host_open_day_vote"); bind("nextNightBtn","host_start_next_night"); bind("resetBtn","host_reset");
$("startMayorVoteBtn").addEventListener("click",()=>{
  requestHostAction({
    buttonId:"startMayorVoteBtn",
    context:"mayor:candidates",
    forceNeeded:missingCandidateResponses() > 0,
    event:"host_start_mayor_vote"
  });
});
$("closeMayorBtn").addEventListener("click",()=>{
  requestHostAction({
    buttonId:"closeMayorBtn",
    context:"mayor:voting",
    forceNeeded:missingMayorVotes() > 0,
    event:"host_close_mayor"
  });
});
$("closeVoteBtn").addEventListener("click",()=>{
  requestHostAction({
    buttonId:"closeVoteBtn",
    context:"day:voting",
    forceNeeded:missingDayVotes() > 0,
    event:"host_close_day_vote"
  });
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
$("openScreenTestBtn").addEventListener("click",()=>window.open("/screen-test.html","_blank"));
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
function missingCandidateResponses(){
  const responses = new Map((state?.mayorElection?.candidateResponses || []).map(row=>[row.key,row.response]));
  return (state?.players || []).filter(player=>player.alive && !responses.get(player.key)).length;
}
function missingMayorVotes(){
  return (state?.mayorElection?.voters || []).filter(voter=>!voter.voted).length;
}
function missingDayVotes(){
  return (state?.dayVote?.voters || []).filter(voter=>!voter.voted).length;
}
function activeForceContext(){
  const hunterStage = state?.hunterSequence?.stage || "";
  if(state?.phase === "hunter" && ["choosing","shot_suspense"].includes(hunterStage)) return `hunter:${hunterStage}`;
  if(state?.phase === "night" && state.currentStep && !state.currentStep.ready) return `night:${state.currentStep.id || ""}`;
  if(state?.phase === "mayor" && state.mayorElection?.stage === "candidates" && missingCandidateResponses()) return "mayor:candidates";
  if(state?.phase === "mayor" && state.mayorElection?.stage === "voting" && missingMayorVotes()) return "mayor:voting";
  if(state?.phase === "voting" && missingDayVotes()) return "day:voting";
  return "";
}
function clearForceAdvance(){
  clearInterval(forceAdvanceTimer);
  if(forceAdvanceButtonId){
    const previousButton = $(forceAdvanceButtonId);
    previousButton?.classList.remove("forceArming","forceReady");
    if(previousButton) previousButton.disabled = false;
  }
  forceAdvanceTimer = null;
  forceAdvanceSeconds = 0;
  forceAdvanceReady = false;
  forceAdvanceContext = "";
  forceAdvanceButtonId = "";
}
function requestHostAction({buttonId,context,forceNeeded,event}){
  if(!forceNeeded){
    clearForceAdvance();
    socket.emit(event);
    return;
  }
  if(forceAdvanceReady && forceAdvanceContext === context && forceAdvanceButtonId === buttonId){
    clearForceAdvance();
    socket.emit(event, {force:true});
    return;
  }
  armForceAdvance(context,buttonId);
}
function armForceAdvance(context,buttonId){
  if(forceAdvanceContext && forceAdvanceContext !== context) clearForceAdvance();
  if(forceAdvanceTimer || forceAdvanceReady) return;
  forceAdvanceContext = context;
  forceAdvanceButtonId = buttonId;
  forceAdvanceSeconds = 1;
  const btn = $(buttonId);
  if(!btn) return;
  btn.classList.remove("forceReady");
  btn.classList.add("forceArming");
  btn.disabled = true;
  const startedAt = performance.now();
  btn.textContent = "Forceren over 1,0 s";
  forceAdvanceTimer = setInterval(()=>{
    const remaining = Math.max(0,1000-(performance.now()-startedAt));
    forceAdvanceSeconds = remaining / 1000;
    if(remaining > 0){
      btn.textContent = `Forceren over ${(remaining/1000).toFixed(1).replace(".",",")} s`;
      return;
    }
    clearInterval(forceAdvanceTimer);
    forceAdvanceTimer = null;
    forceAdvanceReady = true;
    btn.disabled = false;
    btn.classList.remove("forceArming");
    btn.classList.add("forceReady");
    btn.textContent = "Nu forceren";
  },50);
}
function restoreForceButton(){
  if(!forceAdvanceButtonId) return;
  const btn=$(forceAdvanceButtonId);
  if(!btn) return;
  btn.classList.toggle("forceArming",!!forceAdvanceTimer);
  btn.classList.toggle("forceReady",!!forceAdvanceReady);
  btn.disabled=!!forceAdvanceTimer;
  if(forceAdvanceTimer){
    btn.textContent=`Forceren over ${Math.max(0,forceAdvanceSeconds).toFixed(1).replace(".",",")} s`;
  }else if(forceAdvanceReady){
    btn.textContent="Nu forceren";
  }
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
  restoreForceButton();
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
  const inHunter=state.phase==="hunter";
  const ended=state.phase==="ended";
  const hasLivingMayor=(state.players||[]).some(p=>p.alive && p.isMayor);
  const dayAftermath=!!state.dayAftermath?.active;
  const pendingWinner=!!state.pendingWinner;
  const hunterFlowActive=inHunter || !!state.hunterSequence;
  const remaining=hasRemainingNightStep();
  const isWolfStep=inNight && state.currentStep?.kind === "wolves";
  const noActiveStep=inNight && !state.currentStep;

  $("startBtn").disabled=state.started || total!==players || players<3;
  $("startBtn").title = players<3 ? "Minimaal 3 spelers nodig" : (total!==players ? `Kies precies ${players} rollen/tegels` : "Start het spel");
  showButton("startBtn", true);
  showButton("resetBtn", true);
  showButton("nextStepBtn", inNight || inHunter);
  const unfinishedSteps = (state.nightSteps||[]).filter(x=>!x.done&&!x.skipped);
  const currentIsFinalNightStep = !!state.currentStep && state.currentStep.ready && unfinishedSteps.length === 1 && unfinishedSteps[0].id === state.currentStep.id;
  const hunterStage = state.hunterSequence?.stage || "";
  const forceContext = activeForceContext();
  if(forceAdvanceContext && forceAdvanceContext !== forceContext) clearForceAdvance();
  // Zet dit pas ná het wisselen van de force-context. Anders kan de knop na
  // shot_suspense → summary één render lang (en daarna blijvend) disabled blijven.
  $("nextStepBtn").disabled=forceAdvanceButtonId === "nextStepBtn" && !!forceAdvanceTimer;
  if(!forceAdvanceTimer && !forceAdvanceReady){
    $("nextStepBtn").textContent = inHunter
      ? (hunterStage === "summary" ? "Naar volledig dagoverzicht" : hunterStage === "announcement" ? "Laat de Jager kiezen" : hunterStage === "choosing" ? "Forceer Jagerkeuze" : hunterStage === "shot_suspense" ? "Forceer onthulling" : "Volgende Jagerstap")
      : noActiveStep
        ? (remaining ? "Start volgende nachtstap" : "Maak het dag")
        : currentIsFinalNightStep
          ? "Maak het dag"
          : state.currentStep?.ready
            ? "Volgende nachtstap"
            : "Forceer deze stap";
  }
  showButton("resolveNightBtn", false);
  $("resolveNightBtn").disabled=true;
  const mayorStage = state.mayorElection?.stage || "idle";
  const candidateCount = (state.mayorElection?.candidates || []).length;
  const mayorRunoffReady = !!(state.started && inMayor && mayorStage === "result" && state.mayorElection?.result?.runoffPending);
  const mayorResultReady = !!(state.started && inMayor && mayorStage === "result" && !state.dayVote?.open && !mayorRunoffReady);
  const dayRunoffReady = !!(!pendingWinner && state.started && inDay && !ended && !state.dayVote?.open && state.dayVote?.result?.runoffPending);
  const normalDayVoteReady = !!(!pendingWinner && state.started && inDay && !ended && !state.dayVote?.open && !state.dayVote?.result && ((state.players||[]).filter(p=>p.alive).length >= 2));
  showButton("mayorBtn", !hunterFlowActive && !pendingWinner && state.started && inDay && !state.mayorElection?.open && !hasLivingMayor);
  showButton("startMayorVoteBtn", !hunterFlowActive && ((inMayor && mayorStage === "candidates") || mayorRunoffReady));
  $("startMayorVoteBtn").disabled = hunterFlowActive || !(((inMayor && mayorStage === "candidates") || mayorRunoffReady));
  $("startMayorVoteBtn").textContent = mayorRunoffReady
    ? "Start herstemming"
    : missingCandidateResponses()
      ? "Forceer kandidaatstelling"
      : candidateCount > 0
        ? "Laat spelers stemmen"
        : "Ga door zonder kandidaat";
  showButton("closeMayorBtn", !hunterFlowActive && inMayor && mayorStage === "voting");
  if(inMayor && mayorStage === "voting") $("closeMayorBtn").textContent = missingMayorVotes() ? "Forceer burgemeesterstemming" : "Burgemeester afronden";
  // Hotfix v0.3.28: na de burgemeesteruitslag moet deze knop altijd zichtbaar zijn in het controlepaneel.
  showButton("voteBtn", !hunterFlowActive && (mayorResultReady || normalDayVoteReady || dayRunoffReady));
  $("voteBtn").disabled = hunterFlowActive || !(mayorResultReady || normalDayVoteReady || dayRunoffReady);
  $("voteBtn").textContent = dayRunoffReady ? "Start herstemming" : "Open dagstemming";
  $("voteBtn").classList.toggle("majorDayVoteBtn", mayorResultReady || dayRunoffReady);
  showButton("closeVoteBtn", !hunterFlowActive && inVoting);
  if(inVoting) $("closeVoteBtn").textContent = missingDayVotes() ? "Forceer stemming" : "Stemming afronden";
  showButton("nextNightBtn", !hunterFlowActive && (pendingWinner || (state.started && inDay && !ended && !dayAftermath && !state.dayVote?.open && !dayRunoffReady)));
  $("nextNightBtn").disabled=hunterFlowActive || !(pendingWinner || (state.started && inDay && !ended && !dayAftermath && !state.dayVote?.open && !dayRunoffReady));
  $("nextNightBtn").textContent = pendingWinner ? "Toon winnaar" : "Start volgende nacht";

  if ($("voteCard")) $("voteCard").classList.add("hidden");
}
function renderStep(){
  const timeline=renderTimeline();
  const mayorStage = state.mayorElection?.stage || "idle";
  if(state.phase === "mayor"){
    setCurrentStep(renderHostMayorStep(mayorStage));
    return;
  }
  if(state.phase === "voting"){
    setCurrentStep(renderHostDayVoteStep());
    return;
  }
  if(state.phase === "hunter"){
    setCurrentStep(renderHostHunterStep());
    return;
  }
  if(state.phase === "day" && state.dayAftermath?.active && (state.lastDeaths||[]).length){
    setCurrentStep(`<div class="hostEliminationOverview"><h3>Overzicht uitgeschakelde spelers</h3><div class="hunterHostOverview">${state.lastDeaths.map(renderHostDeathCard).join("")}</div></div>`);
    return;
  }
  const s=state.currentStep;
  if(!s){
    const next=(state.nightSteps||[]).find(x=>!x.done&&!x.skipped);
    if(state.pendingWinner){ setCurrentStep(`<h3>Winnaar klaar</h3><p class="muted">Toon de winnaar na de eliminaties.</p>`); return; }
    setCurrentStep(state.phase==="night"?`${timeline}<p class="muted">Hierna: ${next?esc(next.label):"dag"}</p>`:(state.phase==="day"&&state.dayAftermath?.active?`<h3>Dag</h3><p class="muted">Ga door naar de burgemeester of dagstemming.</p>`:`<p class="muted">Geen actieve stap.</p>`));
    return;
  }

  if(s.kind === "wolves"){
    const sub = formatHostWolfConsensus(s);
    setCurrentStep(`${timeline}<h3 class="wolfStepTitle"><span>${esc(s.label)}</span></h3>${renderHostPeekStatus()}${sub}`);
    return;
  }

  setCurrentStep(`${timeline}<div class="roleStepHeading"><h3>${esc(s.label)}</h3></div>${s.help?`<p class="roleStepHelp">${esc(s.help)}</p>`:""}${renderHostRoleChoices(s)}`);
}

function renderHostPeekStatus(){
  const peek=state?.peek;
  const session=peek?.session;
  if(!peek?.enabled || !session) return "";
  const girl=state.players?.find(player=>player.key===session.girlKey);
  let label="Spiekfase actief";
  if(session.status==="instruction") label="Uitleg wordt bekeken";
  else if(session.status==="finished" || session.status==="cancelled") label="Spiekfase afgelopen";
  else if(session.detectionLevel!=="none") label="Betrapt";
  else if(session.risk>=82) label="Bijna betrapt";
  else if(session.risk>=55) label="Risico loopt op";
  else label="Voorzichtig aan het spieken";
  const risk=Math.max(0,Math.min(100,Number(session.risk||0)));
  return `<section class="hostPeekStatus risk-${session.detectionLevel!=="none"?"caught":risk>=82?"high":risk>=55?"mid":"safe"}">
    <header><div><span>Spiekende Meisje · optie ${esc(session.modeNumber)}</span><strong>${esc(girl?.name||"Onbekend")} — ${esc(session.modeLabel)}</strong></div><b>${esc(label)}</b></header>
    <div class="hostPeekMeter"><i style="width:${risk}%"></i></div>
    <small>${session.mode==="eyelids"?`${Math.max(0,Number(session.remainingPeekMs||0)/1000).toFixed(1)} s spiektijd over`:session.mode==="fog"?`${session.fogActionsRemaining} veegbewegingen over`:`Weerkaatsingsrisico ${Math.round(risk)}%`}</small>
  </section>`;
}

function renderHostHunterStep(){
  const sequence = state.hunterSequence || {};
  const hunterName = sequence.hunterName || "De Jager";
  const hunterCard = sequence.hunterDeath
    ? `<div class="hunterHostHunterCard">${renderHostDeathCard(sequence.hunterDeath)}</div>`
    : "";
  if(sequence.stage === "awaiting_vote_reveal"){
    return `<div class="hunterHostStep"><h3>Jager uitgeschakeld</h3><p>De dagstemuitslag wordt eerst op het Infoscherm onthuld.</p>${hunterCard}<strong>${esc(hunterName)}</strong></div>`;
  }
  if(sequence.stage === "announcement"){
    return `<div class="hunterHostStep"><span class="hunterHostEmblem">${hunterBullseye("hunterBullseyeHost")}</span><h3>De Jager is uitgeschakeld</h3><p>Laat de Jager kiezen wanneer het aankondigingsscherm rustig gelezen is. Zonder klik gaat dit na tien seconden automatisch.</p>${hunterCard}<strong>${esc(hunterName)}</strong></div>`;
  }
  if(sequence.stage === "choosing"){
    return `<div class="hunterHostStep suspense"><h3>Laatste schot</h3><p>De keuze wordt gemaakt. De Host kan na de beveiligingstimer een willekeurig geldig doel forceren.</p>${hunterCard}<strong>${esc(hunterName)}</strong></div>`;
  }
  if(sequence.stage === "shot_suspense"){
    const deaths = sequence.shotDeaths || [];
    return `<div class="hunterHostStep suspense hunterHostSummary"><h3>Laatste schot bevestigd</h3><p>De Host ziet de uitslag direct; het Infoscherm bouwt de openbare onthulling nog op.</p><div class="hunterHostShotPair">${hunterCard}${deaths.map(renderHostDeathCard).join("")}</div></div>`;
  }
  if(sequence.stage === "summary"){
    const deaths = sequence.shotDeaths || [];
    return `<div class="hunterHostStep hunterHostSummary"><h3>Jager-overzicht</h3><p>De Jager en de directe gevolgen van het laatste schot.</p><div class="hunterHostShotPair">${hunterCard}${deaths.map(renderHostDeathCard).join("")}</div></div>`;
  }
  return `<p class="muted">De Jager-sequentie wordt voorbereid.</p>`;
}

function renderHostRoleChoices(step){
  const actors = step.actors || [];
  if(!actors.length) return '<p class="muted">Geen speler voor deze stap.</p>';
  if(step.kind === "enchanted_info"){
    return `<div class="hostEnchantedOverview"><div class="hunterHostOverview">${actors.map(actor=>`<article class="hostHunterDeathCard enchantedHostCard"><strong>${esc(actor.name)}</strong><img src="${esc(roleCardPath("villager",actor.cardVariant))}" alt="Burgerkaart"></article>`).join("")}</div></div>`;
  }
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

function roleCardPath(roleId, cardVariant=null){
  if(["infectious_wolf","white_wolf"].includes(roleId)) return "/assets/cards/weerwolf.png";
  return ({
    villager:`/assets/cards/burger_${Math.max(1,Math.min(4,Number(cardVariant||1)))}.png`,
    werewolf:"/assets/cards/weerwolf.png",
    big_bad_wolf:"/assets/cards/grote_boze_wolf.png",
    cupid:"/assets/cards/cupido.png",
    seer:"/assets/cards/Ziener.png",
    witch:"/assets/cards/Heks.png",
    hunter:"/assets/cards/jager.png",
    piper:"/assets/cards/fluitspeler.png"
  })[roleId] || null;
}

function roleTargetDecision(label, value, tone=""){
  const target = value?.targetCard || value || {};
  const targetName = value?.targetName || target?.name || null;
  const targetRoleId = value?.targetRoleId || target?.cardRoleId || null;
  const targetRoleName = value?.targetRoleName || target?.cardRoleName || "";
  const targetRoleEmoji = value?.targetRoleEmoji || target?.cardRoleEmoji || "🃏";
  const targetCardVariant = value?.targetCardVariant || target?.cardVariant || null;
  const src = targetRoleId ? roleCardPath(targetRoleId, targetCardVariant) : null;
  const card = !targetName ? "" : src
    ? `<img class="hostTargetRoleCard" src="${esc(src)}" alt="${esc(targetRoleName || "Spelerkaart")}">`
    : targetRoleName
      ? `<div class="hostTargetRoleFallback"><span>${esc(targetRoleEmoji)}</span><strong>${esc(targetRoleName)}</strong></div>`
      : "";
  return `<div class="roleDecision roleTargetDecision ${tone}"><span>${esc(label)}</span><strong>${esc(targetName || "Nog niemand gekozen")}</strong>${card}</div>`;
}

function hostDeathRoleId(roleName){
  return ({
    "Burger":"villager","Weerwolf":"werewolf","Grote Boze Wolf":"big_bad_wolf",
    "Cupido":"cupid","Ziener":"seer","Heks":"witch","Jager":"hunter","Fluitspeler":"piper"
  })[roleName] || null;
}
function renderHostDeathCard(death){
  const roleId = hostDeathRoleId(death.roleName);
  const src = roleId ? roleCardPath(roleId, death.cardVariant) : null;
  const hunterMark = death.cause === "hunter" ? `<span class="hostHunterCause" title="Uitgeschakeld door de Jager">${hunterBullseye("hunterBullseyeMini")}</span>` : "";
  const cause = deathCauseLabel(death);
  const visual = src
    ? `<img src="${esc(src)}" alt="${esc(death.roleName || "Rol")}">`
    : `<span class="hostDeathFallback">${esc(death.roleEmoji || "🃏")}</span>`;
  return `<article class="hostHunterDeathCard ${death.cause === "hunter" ? "hunterShotVictim" : ""}"><strong>${esc(death.name)}</strong>${visual}${hunterMark}<small class="hostDeathCause">${esc(cause)}</small></article>`;
}

function deathCauseLabel(death){
  return ({
    wolves:"Gedood door de Weerwolven",
    big_bad_wolf:"Gedood door de Grote Boze Wolf",
    white_wolf:"Gedood door de Witte Weerwolf",
    witch_poison:"Vergiftigd door de Heks",
    love:"Overleden uit liefdesverdriet",
    vote:"Weggestemd door het dorp",
    hunter:"Geraakt door het laatste schot",
    rusty_sword:"Overleden door het roestige zwaard",
    manual:"Uitgeschakeld door de Host",
  })[death?.cause] || death?.publicReason || "Uitgeschakeld";
}

function renderRoleDecisionGrid(kind, submission, preview){
  const value = submission || preview || {};
  let cards = [];
  if(kind === "witch"){
    cards = [
      value.saveTarget
        ? roleTargetDecision("Levensdrank · redt", value.saveTarget, "save")
        : roleDecision("Levensdrank", "Niemand gered", ""),
      value.poisonTarget
        ? roleTargetDecision("Gifdrank · vergiftigt", value.poisonTarget, "poison")
        : roleDecision("Gifdrank", "Niemand vergiftigd", "")
    ];
  } else if(kind === "cupid"){
    const names = submission?.lovers || preview?.targetNames || [];
    const people = submission?.people || preview?.people || [];
    cards = [
      people[0] ? roleTargetDecision("Geliefde 1", people[0], "love") : roleDecision("Geliefde 1", names[0] || "Nog niet gekozen", names[0] ? "love" : ""),
      people[1] ? roleTargetDecision("Geliefde 2", people[1], "love") : roleDecision("Geliefde 2", names[1] || "Nog niet gekozen", names[1] ? "love" : "")
    ];
  } else if(kind === "piper"){
    const names = submission?.targets || preview?.targetNames || [];
    const people = submission?.people || preview?.people || [];
    cards = people.length
      ? people.map((person, index)=>roleTargetDecision(`Betovering ${index + 1}`, person, "magic"))
      : [roleDecision("Betovering", names.length ? names.join(" + ") : "Nog niemand gekozen", names.length ? "magic" : "")];
  } else if(kind === "seer"){
    cards = [value.targetName ? roleTargetDecision("Bekijkt", value) : roleDecision("Bekijkt", "Nog niemand gekozen")];
  } else if(kind === "wild_child"){
    cards = [value.targetName ? roleTargetDecision("Rolmodel", value, "choice") : roleDecision("Rolmodel", "Nog niemand gekozen")];
  } else if(kind === "big_bad_wolf" || kind === "white_wolf"){
    cards = [value.targetName ? roleTargetDecision("Slachtoffer", value, "poison") : roleDecision("Slachtoffer", "Nog niemand gekozen")];
  } else if(kind === "fox"){
    cards = [value.targetName ? roleTargetDecision("Controleert", value, "vision") : roleDecision("Controleert", "Nog niemand gekozen")];
  } else if(kind === "wolf_hound"){
    cards = [roleDecision("Kant", value.choice === "wolf" ? "Wolvenkant" : value.choice === "village" ? "Burgerkant" : "Nog niet gekozen", value.choice ? "choice" : "")];
  } else if(kind === "infectious_wolf"){
    cards = [roleDecision("Besmetting", value.infect ? `Besmet ${value.targetName || "slachtoffer"}` : submission ? "Besmet niemand" : "Nog niet gekozen", value.infect ? "poison" : "")];
  } else if(value.targetName){
    cards = [roleTargetDecision("Keuze", value, "choice")];
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
  const toneClass = type === "burgemeester" ? " mayorVoteBars" : "";
  return sorted.length?`<div class="liveVoteBars${toneClass}"><div class="resultLabel">${leadText}</div>${sorted.map((r,i)=>`<div class="voteBar liveRank ${i===0&&r.votes>0?'leader':''}"><div class="voteBarTop"><strong>${esc(r.name)}</strong><span>${r.votes||0}</span></div><div class="progress"><div class="voteFill" style="width:${Math.max(3,Math.round((r.votes||0)/max*100))}%"></div></div></div>`).join('')}</div>`:'<p class="muted">Nog geen stemmen.</p>';
}
function renderTimeline(){
  const steps=state.nightSteps||[];
  if(state.phase!=="night" || !steps.length) return "";
  return `<div class="stepTimeline">${steps.map((st,i)=>`${i?'<span class="stepTimelineArrow">→</span>':''}<span class="stepTimelineItem ${st.done?'done':''} ${st.active?'active':''}"><span>${esc(st.emoji||stepEmoji(st.kind))}</span><span>${esc(shortStepLabel(st.label))}</span></span>`).join("")}</div>`;
}
function stepEmoji(kind){
  return ({wolf_hound:"🐕",wild_child:"🧒",cupid:"💘",lovers_info:"💞",seer:"🔮",sisters_info:"👭",wolves:"🐺",infectious_wolf:"🩸",big_bad_wolf:"🌕",white_wolf:"🤍",witch:"🧪",fox:"🦊",piper:"🎵",enchanted_info:"✨",enchantment_broken:"◇"})[kind]||"🃏";
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
  const cards=rows.map(w=>{
    const status = w.confirmed ? "Bevestigd" : w.targetKey ? "Live geselecteerd" : "Nog geen keuze";
    const target = w.targetCard || (w.targetName ? { name:w.targetName, cardRoleId:"villager", cardRoleName:"Burger" } : null);
    const decision = target
      ? roleTargetDecision("Kiest", target, w.confirmed ? "wolfChoiceConfirmed" : "wolfChoiceLive")
      : roleDecision("Kiest", "Nog niemand gekozen");
    return `<article class="wolfHostChoiceCard wolfColor${w.colorIndex} ${cardClass(w)}"><header><span class="wolfMarker">${w.marker}</span><div><strong>${esc(w.name)}</strong><small>${esc(status)}</small></div></header>${decision}</article>`;
  }).join("");
  let verdict;
  if(locked && s.wolfConsensus?.consensusTargetName){
    const target = s.wolfConsensus.consensusTargetCard || { name:s.wolfConsensus.consensusTargetName, cardRoleId:"villager", cardRoleName:"Burger" };
    verdict = `<section class="wolfLockedVictim"><h4>Daadwerkelijk slachtoffer</h4>${roleTargetDecision("Uitgeschakeld door de wolven", target, "actualWolfVictim")}</section>`;
  } else if(mismatch){
    verdict = `<div class="resultBox wolfConsensusResult wolfConsensusBad"><div class="resultBig">de wolven zijn aan het kiezen.</div></div>`;
  } else {
    verdict = `<div class="resultBox wolfConsensusResult wolfConsensusNeutral"><div class="resultBig">de wolven zijn aan het kiezen.</div></div>`;
  }
  return `<div class="wolfConsensusCardStage">${verdict}<div class="hostWolfConsensus">${cards}</div></div>`;
}

function renderPlayers(){
  const nextMarkup=(state.players||[]).map(p=>{
    const armed = pendingKickKey === p.key;
    const status = [p.roleSummary||p.roleName, p.alive ? "" : "dood", p.isBot ? "test" : (p.connected ? "" : "offline")].filter(Boolean).join(" · ");
    const links = (p.persistentLinks || []).map(link=>`<span class="persistentLinkBadge ${esc(link.kind)}" title="${esc(link.label)}">${esc(link.icon)}</span>`).join("");
    const roleOptions = !state.started ? `<label class="preassignRole"><span>Volgende rol</span><select data-assigned-role="${esc(p.key)}"><option value="">Geen rol</option>${(state.roles||[]).filter(r=>Number(state.selectedRoleCounts?.[r.id]||0)>0).map(r=>{
      const used = Number(state.preassignedRoleCounts?.[r.id]||0);
      const available = Number(state.selectedRoleCounts?.[r.id]||0);
      const selected = p.assignedRoleId === r.id;
      const disabled = !selected && used >= available;
      return `<option value="${esc(r.id)}" ${selected?"selected":""} ${disabled?"disabled":""}>${esc(r.name)}${disabled?" — bezet":""}</option>`;
    }).join("")}</select></label>` : "";
    const avatar = p.roleId === "hunter" ? hunterBullseye("hunterBullseyeAvatar") : esc(p.roleEmoji||initials(p.name));
    return `<div class="playerRow ${p.alive?'':'dead'}">${links?`<div class="persistentLinkBadges">${links}</div>`:""}<div class="playerMain"><div class="avatar">${avatar}</div><div class="playerIdentity"><strong>${esc(p.name)}${p.isMayor?' 👑':''}</strong><div class="roleName">${esc(status)}</div>${roleOptions}</div></div><div class="btnrow playerActions"><button class="btn danger smallBtn ${armed?'pulseConfirm':''}" title="Verwijder speler" data-kick="${esc(p.key)}">${armed?'Bevestig':'Kick'}</button></div></div>`;
  }).join("") || '<p class="muted">Geen spelers.</p>';
  if(nextMarkup === playersMarkup) return;
  playersMarkup = nextMarkup;
  $("players").innerHTML=nextMarkup;
  document.querySelectorAll("[data-assigned-role]").forEach(select=>select.addEventListener("change",()=>{
    socket.emit("host_assign_role", { playerKey:select.dataset.assignedRole, roleId:select.value || null });
  }));
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
  const nextMarkup=(state.roles||[]).map(r=>{
    const count=state.selectedRoleCounts[r.id]||0;
    const roleIcon = r.id === "hunter" ? hunterBullseye("hunterBullseyeRole") : esc(r.emoji);
    return `<div class="roleTile"><div class="roleTop"><div><span class="roleEmoji">${roleIcon}</span><strong> ${esc(r.name)}</strong><div class="roleName">${esc(r.group)} · max ${r.max}</div></div><div class="counter"><button class="btn ghost" data-role-dec="${esc(r.id)}">−</button><span class="num">${count}</span><button class="btn ghost" data-role-inc="${esc(r.id)}">+</button></div></div><p class="muted small">${esc(r.desc)}</p></div>`;
  }).join("");
  if(nextMarkup === rolesMarkup) return;
  rolesMarkup = nextMarkup;
  $("roles").innerHTML=nextMarkup;
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
