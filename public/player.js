const socket = io();
const $ = (id) => document.getElementById(id);
let state = null;
let playerKey = sessionStorage.getItem("wakkerdam_player_key") || "";
let triedStartedReconnect = false;
let selectedTargets = new Set();
let selectedSingle = null;
let lastActionKey = "";
let lastWakeActionId = "";
let lastLobbyId = "";
let pendingCandidateConfirm = false;
let pendingCandidateChoice = null;
let candidateConfirmTimer = null;
let pendingFinalConfirm = null;
let finalConfirmTimer = null;

const ROLE_ART = {
  villager: [
    { src: "/assets/cards/burger_man.png", title: "Burger" },
    { src: "/assets/cards/burger_woman.png", title: "Burger" }
  ],
  seer: [{ src: "/assets/cards/Ziener.png", title: "Ziener" }],
  piper: [{ src: "/assets/cards/fluitspeler.png", title: "Fluitspeler" }],
  werewolf: [{ src: "/assets/cards/weerwolf.png", title: "Weerwolf" }],
  witch: [{ src: "/assets/cards/Heks.png", title: "Heks" }]
};

function stableHash(str){
  const s = String(str || "");
  let h = 0;
  for(let i=0;i<s.length;i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getRoleArt(roleId, seed){
  let list = ROLE_ART[roleId];
  if(!list && ["infectious_wolf","big_bad_wolf","white_wolf"].includes(roleId)) list = ROLE_ART.werewolf;
  if(!list || !list.length) return null;
  return list[stableHash(seed) % list.length];
}

function renderPlayerIdentity(person, className=""){
  if(!person) return "";
  const roleId = person.cardRoleId || "villager";
  const art = getRoleArt(roleId, person.key || person.name || roleId);
  const revealedClass = person.cardRevealed ? "revealed" : "public";
  if(art){
    return `<span class="playerIdentityCard ${revealedClass} ${className}"><img src="${esc(art.src)}" alt="${esc(person.cardRoleName || art.title || "Spelerkaart")}"></span>`;
  }
  return `<span class="playerIdentityCard fallback ${revealedClass} ${className}"><span class="playerIdentityEmoji">${esc(person.cardRoleEmoji || "🃏")}</span><span class="playerIdentityRole">${esc(person.cardRoleName || "Rol")}</span></span>`;
}


function lobbyKey(id){ return `wakkerdam_player_key_${id || "unknown"}`; }
function clearStoredKeys(){
  sessionStorage.removeItem("wakkerdam_player_key");
  localStorage.removeItem("wakkerdam_last_player_key");
  if(lastLobbyId) localStorage.removeItem(lobbyKey(lastLobbyId));
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function toast(text){
  const el=$("toast"); if(!el) return;
  el.textContent=text; el.classList.remove("hidden");
  clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>el.classList.add("hidden"),2300);
}
function nameOf(key){ return (state?.players||[]).find(p=>p.key===key)?.name || "—"; }
function titleHtml(text){ return esc(text).replace(/\n/g, "<br>"); }

$("joinBtn")?.addEventListener("click", join);
$("nameInput").addEventListener("keydown", e=>{ if(e.key==="Enter") join(); });
window.addEventListener("load",()=>setTimeout(()=>$('nameInput')?.focus(),80));

// Join-scherm debug: D spammen of woord "in" lang indrukken.
let debugDPresses = [];
let playerDebugAutoHideTimer = null;
function showPlayerDebug(){
  $("playerDebugFab")?.classList.remove("hidden");
  clearTimeout(playerDebugAutoHideTimer);
  playerDebugAutoHideTimer = setTimeout(hidePlayerDebug, 5000);
}
function hidePlayerDebug(){ $("playerDebugFab")?.classList.add("hidden"); clearTimeout(playerDebugAutoHideTimer); }
window.addEventListener("keydown", (e)=>{
  if(document.body.classList.contains("inGame")) return;
  if(String(e.key||"").toLowerCase() !== "d") return;
  const now = Date.now();
  debugDPresses = debugDPresses.filter(t => now - t < 1600);
  debugDPresses.push(now);
  if(debugDPresses.length >= 5) showPlayerDebug();
});
(function setupJoinDebugHold(){
  const hold = $("joinDebugHold");
  let timer = null;
  const start = (e)=>{ if(document.body.classList.contains("inGame")) return; clearTimeout(timer); timer = setTimeout(showPlayerDebug, 850); };
  const stop = ()=>{ clearTimeout(timer); timer = null; };
  hold?.addEventListener("pointerdown", start);
  hold?.addEventListener("pointerup", stop);
  hold?.addEventListener("pointerleave", stop);
  hold?.addEventListener("pointercancel", stop);
})();
$("playerDebugHotspot")?.addEventListener("click", showPlayerDebug);
$("playerDebugHotspot")?.addEventListener("pointerdown", ()=>{ clearTimeout(window.__debugHotspotHold); window.__debugHotspotHold = setTimeout(showPlayerDebug, 450); });
$("playerDebugHotspot")?.addEventListener("pointerup", ()=>clearTimeout(window.__debugHotspotHold));
$("playerDebugHotspot")?.addEventListener("pointercancel", ()=>clearTimeout(window.__debugHotspotHold));
$("playerDebugHotspot")?.addEventListener("pointerleave", ()=>clearTimeout(window.__debugHotspotHold));
$("playerDebugClose")?.addEventListener("click", hidePlayerDebug);
$("openInfoFromPlayer")?.addEventListener("click", ()=>window.open("/info", "_blank"));
$("openHostFromPlayer")?.addEventListener("click", ()=>{
  const code = prompt("Hostcode");
  if(code === "0909") window.open("/host", "_blank");
  else if(code !== null) toast("Onjuiste hostcode.");
});


function join(){ socket.emit("join", { name: $("nameInput").value, playerKey }); }

socket.on("connect", ()=>{
  if(playerKey) socket.emit("join", { playerKey });
  else setTimeout(()=>$('nameInput')?.focus(),80);
});
socket.on("join_denied", msg=>{
  toast(msg || "Joinen lukte niet.");
  clearStoredKeys();
  playerKey = "";
  state = null;
  document.body.classList.remove("inGame","playerDead");
  $("gameUI").classList.add("hidden");
  $("joinCard").classList.remove("hidden");
  setTimeout(()=>$('nameInput')?.focus(),80);
});
socket.on("joined", data=>{
  playerKey=data.playerKey;
  sessionStorage.setItem("wakkerdam_player_key", playerKey);
  localStorage.setItem("wakkerdam_last_player_key", playerKey);
  if(data.lobbyId){ lastLobbyId = data.lobbyId; localStorage.setItem(lobbyKey(data.lobbyId), playerKey); }
  document.body.classList.add("inGame");
  $("joinCard").classList.add("hidden");
  $("gameUI").classList.remove("hidden");
});
socket.on("player_state", s=>{ const prev=state; state=s; maybeVibrateForAction(prev,s); render(); });
socket.on("state", s=>{
  lastLobbyId = s.lobbyId || lastLobbyId;
  if(!state){
    const oldKey = (s.lobbyId && localStorage.getItem(lobbyKey(s.lobbyId))) || "";
    if(s.started && oldKey && !triedStartedReconnect && !playerKey){
      triedStartedReconnect = true;
      socket.emit("join", { playerKey: oldKey });
    }
  }
});

function maybeVibrateForAction(prev,next){
  const a=next?.action;
  if(!a || a.submitted) { lastWakeActionId = ""; return; }
  const id = `${a.id || a.kind}:${a.kind}`;
  const prevId = prev?.action && !prev.action.submitted ? `${prev.action.id || prev.action.kind}:${prev.action.kind}` : "";
  if(id !== prevId && id !== lastWakeActionId){
    lastWakeActionId = id;
    if(navigator.vibrate) navigator.vibrate([180,70,180]);
  }
}

function render(){
  if(!state) return;
  const actionKey = state.action ? `${state.action.id}:${state.action.kind}` : "idle";
  if(actionKey !== lastActionKey){
    selectedTargets.clear();
    selectedSingle = null;
    pendingCandidateConfirm = false;
    pendingCandidateChoice = null;
    pendingFinalConfirm = null;
    clearTimeout(candidateConfirmTimer);
    clearTimeout(finalConfirmTimer);
    lastActionKey = actionKey;
    const preview = state.action?.preview || null;
    if(Array.isArray(preview?.targetKeys)){
      preview.targetKeys.forEach(key=>selectedTargets.add(key));
    }
    selectedSingle = preview?.targetKey || state.action?.selectedTargetKey || null;
  }
  document.body.classList.add("inGame");
  document.body.classList.toggle("playerDead", !state.me.alive && state.phase !== "hunter");
  $("joinCard").classList.add("hidden");
  $("gameUI").classList.remove("hidden");
  renderAction();
}

function roleCard(compact=false){
  const r=state?.me?.role;
  if(!r) return "";
  const tags=[];
  if(state.me.infected) tags.push("besmet");
  if(state.me.wolfDogChoice) tags.push(state.me.wolfDogChoice==="wolf"?"wolvenkant":"burgerkant");
  if(state.me.wildChildTurned) tags.push("nu wolfachtig");
  if(state.me.loverName) tags.push(`geliefde: ${state.me.loverName}`);
  if(state.me.enchanted) tags.push("betoverd");
  const art = getRoleArt(r.id, state.me.key || playerKey || r.id);
  const visual = art
    ? `<div class="roleArtWrap"><img class="roleArtImage" src="${esc(art.src)}" alt="${esc(art.title || r.name)}"></div>`
    : `<div class="roleArtFallback"><div class="bigEmoji">${esc(r.emoji)}</div></div>`;
  const metaParts = [];
  if(!art) metaParts.push(`<h2>${esc(r.name)}</h2>`);
  if(!compact && !art) metaParts.push(`<p>${esc(r.desc)}</p>`);
  if(tags.length) metaParts.push(`<div class="btnrow roleTags">${tags.map(t=>`<span class="pill gold">${esc(t)}</span>`).join("")}</div>`);
  return `<div class="minimalRole cardMode ${compact?'compact':''} ${art?'hasRoleArt':''}">${visual}${metaParts.length?`<div class="roleMeta">${metaParts.join("")}</div>`:""}</div>`;
}
function renderAction(){
  const a=state.action;
  const box=$("actionBox");
  if(state.winner){
    const isWolfLoss = state.winner.team === "village" && state.me.wolfLike;
    const winnerTitle = isWolfLoss ? "Het dorp wint..." : state.winner.title;
    const winnerText = isWolfLoss ? "helaas, het wolvenras is uitgeroeid." : (state.winner.text || "");
    box.innerHTML = `<div class="playerCenter"><h1>${esc(winnerTitle)}</h1><p>${esc(winnerText)}</p>${roleCard(true)}</div>`;
    return;
  }

  const deathRevealUntil = state?.dayVote?.result?.eliminatedKey === state?.me?.key ? Number(state.dayVote.result.revealUntil || 0) : 0;
  if(!state.me.alive && deathRevealUntil && Date.now() < deathRevealUntil){
    clearTimeout(window.__deathRevealTimer); window.__deathRevealTimer = setTimeout(render, Math.max(60, deathRevealUntil - Date.now() + 80));
    box.innerHTML = `<div class="playerCenter"><h1>De stemmen worden geteld</h1>${roleCard(true)}</div>`;
    return;
  }

  if(!state.me.alive && !(a && a.kind === "hunter_shot")){
    box.innerHTML = `<div class="deadScreen"><div class="deadMark">✖</div><h1>Je bent uitgeschakeld</h1>${roleCard(true)}</div>`;
    return;
  }

  if(!a){
    const title = state.phase === "night" ? "Nacht" : state.phase === "day" ? "Je hebt de nacht overleefd" : state.phase === "lobby" ? "Lobby" : "Wacht";
    const sub = state.phase === "night" ? "Je slaapt." : (state.phase === "lobby" ? "Wacht op de host." : "");
    box.innerHTML = `<div class="playerCenter"><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:""}${roleCard(true)}</div>`;
    return;
  }

  if(a.kind === "mayor_result_wait"){
    const revealUntil = Number(a.revealUntil || 0);
    if(revealUntil && Date.now() < revealUntil){
      clearTimeout(window.__mayorRevealTimer); window.__mayorRevealTimer = setTimeout(render, Math.max(60, revealUntil - Date.now() + 80));
      box.innerHTML = `<div class="playerCenter"><h1>De stemmen worden geteld</h1>${roleCard(true)}</div>`;
    } else {
      box.innerHTML = `<div class="playerCenter"><h1>${titleHtml(a.finalTitle || "de burgemeester is bekend")}</h1>${roleCard(true)}</div>`;
    }
    return;
  }

  if(a.submitted){
    const voteAction = a.kind === "mayor_vote" || a.kind === "day_vote";
    const submittedTitle = voteAction ? a.title : "Je antwoord is doorgevoerd";
    const sleepRole = a.actorRoleName || state.me.role?.name || "rol";
    const sleepMessage = voteAction ? "" : `<p class="sleepStatus">De ${esc(sleepRole)} gaat weer slapen.</p>`;
    const ownCard = a.kind === "seer" ? "" : roleCard(true);
    box.innerHTML = `<div class="playerCenter submitted"><h1>${esc(submittedTitle)}</h1>${renderSubmittedResult(a)}${sleepMessage}${ownCard}</div>`;
    return;
  }

  let html=`<div class="playerCenter active action-${esc(a.kind)}"><h1>${esc(a.title)}</h1>${!["wolves","lovers_info"].includes(a.kind) && a.text?`<p>${esc(a.text)}</p>`:""}`;

  if(a.kind === "wolves"){
    html += renderWolfAction(a);
  } else if(a.kind === "wolf_hound"){
    html += renderChoiceButtons(a.choices || [], a.kind);
  } else if(["wild_child","seer","big_bad_wolf","white_wolf","fox","hunter_shot","mayor_vote","day_vote"].includes(a.kind)){
    html += renderSingleTargetAction(a);
  } else if(a.kind === "cupid"){
    html += `<p class="small muted">Kies twee spelers.</p>${renderChoiceButtonsAsTargets(a.options||[], "multi", 2)}<button class="btn primary confirmBtn" id="submitMulti">Bevestigen</button>`;
  } else if(a.kind === "lovers_info"){
    html += renderLoversInfo(a);
  } else if(a.infoOnly || ["sisters_info","enchanted_info"].includes(a.kind)){
    html += `<button class="btn primary confirmBtn" id="readyBtn">Klaar</button>`;
  } else if(a.kind === "infectious_wolf"){
    html += renderChoiceButtons(a.choices || [], a.kind);
  } else if(a.kind === "witch"){
    html += renderWitch(a);
  } else if(a.kind === "piper"){
    html += `<p class="small muted">Kies maximaal twee spelers.</p>${renderChoiceButtonsAsTargets(a.options||[], "multi", 2)}<button class="btn primary confirmBtn" id="submitMulti">Bevestig betovering</button>`;
  } else if(a.kind === "mayor_candidate"){
    html += `<div class="mayorExplain"><p>De burgemeester heeft bij dagstemmingen een dubbele stem.</p></div>`;
    if(a.candidateResponse === "yes" || a.selfCandidate){
      html += `<div class="resultBox"><div class="resultBig">Je hebt je kandidaat gesteld.</div></div>`;
    } else if(a.candidateResponse === "no"){
      html += `<div class="resultBox"><div class="resultBig">Je stelt je niet kandidaat.</div></div>`;
    } else if(pendingCandidateConfirm){
      const yes = pendingCandidateChoice === "yes";
      const label = yes ? "Bevestig kandidaatstelling" : "Bevestigen";
      html += `<button id="candidateConfirmBtn" class="btn primary confirmBtn pulseConfirm" data-candidate-choice="${yes?'yes':'no'}">${label}</button>`;
    } else {
      html += `<div class="btnrow mayorCandidateChoices"><button id="candidateYesBtn" class="btn primary confirmBtn">Ik stel mij kandidaat</button><button id="candidateNoBtn" class="btn ghost confirmBtn">Nee, ik wil geen burgemeester worden</button></div>`;
    }
  }

  html += `</div>`;
  box.innerHTML=html;
  bindActionButtons(a);
}

function renderWolfAction(a){
  const consensus=a.wolfConsensus || {rows:[]};
  const locked = !!(a.wolfLocked || consensus.locked);
  let html = renderWolfLegend(consensus.rows || []);
  html += renderWolfStatus(consensus, a);
  html += renderChoiceButtonsAsTargets(a.options||[], "wolf", 1, a.ownSelection);
  if(!locked){
    html += `<div class="btnrow wolfControls"><button id="wolfConfirmBtn" class="btn primary" ${a.ownSelection?"":"disabled"}>${a.ownConfirmed?"Bevestigd ✓":"Bevestigen"}</button></div>`;
  }
  return html;
}

function renderWolfLegend(rows){
  if(!rows || !rows.length) return "";
  return `<div class="wolfLegend">${rows.map(w=>`<span class="wolfLegendItem wolfColor${w.colorIndex}"><span class="wolfMarker">${w.marker}</span><span class="wolfLegendName">${esc(w.name)}</span></span>`).join("")}</div>`;
}

function renderWolfStatus(consensus, a){
  const rows = consensus.rows || [];
  if(!rows.length) return "";
  const groups = [];
  const byTarget = new Map();
  for(const w of rows){
    if(!w.targetKey) continue;
    if(!byTarget.has(w.targetKey)) byTarget.set(w.targetKey, { key:w.targetKey, name:w.targetName || "?", wolves:[], confirmed:0 });
    const g = byTarget.get(w.targetKey);
    g.wolves.push(w);
    if(w.confirmed) g.confirmed += 1;
  }
  for(const g of byTarget.values()) groups.push(g);
  groups.sort((a,b)=>b.wolves.length-a.wolves.length || b.confirmed-a.confirmed || a.name.localeCompare(b.name));

  let text = "de wolven zijn aan het kiezen.";
  let tone = "neutral";
  if((consensus.locked || consensus.allConfirmedSame) && consensus.consensusTargetName){
    text = `${consensus.consensusTargetName}`;
    tone = "good locked";
  } else if(groups.length === 0){
    text = "Kies een slachtoffer.";
  } else if(groups.length === 1){
    const g = groups[0];
    if(g.wolves.length === rows.length){
      text = `Bevestig ${g.name}.`;
      tone = "almost";
    } else {
      text = "Kies samen hetzelfde doelwit.";
    }
  } else {
    text = "Kies samen hetzelfde doelwit.";
    tone = "warn";
  }
  return `<div class="wolfStatusText ${tone}">${esc(text)}</div>`;
}

function renderChoiceButtons(choices, kind){
  return `<div class="choices bigChoices">${choices.map(c=>`<button class="choice" data-choice="${esc(c.value)}" data-kind="${esc(kind)}">${esc(c.label)}</button>`).join("")}</div>`;
}

function renderSingleTargetAction(a){
  const needsFinal = a.kind === "day_vote" || a.kind === "mayor_vote";
  const samePending = needsFinal && pendingFinalConfirm && pendingFinalConfirm.kind === a.kind && pendingFinalConfirm.targetKey === selectedSingle;
  let label = selectedSingle ? `Bevestig ${esc(nameOf(selectedSingle))}` : "Bevestig keuze";
  let extra = "";
  let cls = "";
  if(samePending){
    label = "Definitief bevestigen";
    cls = " pulseConfirm";
    const targetName = esc(nameOf(selectedSingle));
    extra = `<p class="small muted confirmWarning">Definitieve stem: ${targetName}.</p>`;
  }
  return `${renderChoiceButtonsAsTargets(a.options||[], "single", 1)}${extra}<button id="confirmSingleBtn" class="btn primary confirmBtn${cls}" ${selectedSingle?"":"disabled"}>${label}</button>`;
}

function renderChoiceButtonsAsTargets(options, mode, max=1, serverSelected=null){
  if(!options.length) return `<p class="muted">Geen geldige opties.</p>`;
  const selected = serverSelected || selectedSingle;
  return `<div class="choices playerChoices">${options.map(o=>{
    const isSelected = mode === "multi" ? selectedTargets.has(o.key) : selected === o.key;
    const wolfData = mode === "wolf" ? wolfTargetData(o.key) : { html:"", className:"", styleVars:"" };
    const nameLength = String(o.name || "").length;
    const nameFontSize = Math.max(14, 22 - Math.max(0, nameLength - 12) * .45).toFixed(1);
    const styleVars = [wolfData.styleVars, `--choice-font-size:${nameFontSize}px`].filter(Boolean).join(";");
    return `<button class="choice playerTargetChoice ${isSelected?"selected":""} ${wolfData.className}" style="${styleVars}" data-target="${esc(o.key)}" data-mode="${mode}" data-max="${max}"><span class="targetName">${esc(o.name)}${o.isMayor?" 👑":""}</span>${renderPlayerIdentity(o,"choiceIdentity")}${wolfData.html}</button>`;
  }).join("")}</div>`;
}

function wolfTargetData(targetKey){
  const rows = state?.action?.wolfConsensus?.rows || [];
  const hits = rows.filter(w=>w.targetKey===targetKey).sort((a,b)=>Number(a.marker||0)-Number(b.marker||0));
  if(!hits.length) return { html:"", className:"", styleVars:"" };
  const colors = ["rgba(228,59,79,.38)","rgba(107,168,255,.38)","rgba(240,201,90,.42)","rgba(85,211,138,.36)","rgba(180,124,255,.36)","rgba(255,159,67,.36)"];
  const glow = colors[hits[0].colorIndex % colors.length] || "rgba(240,201,90,.36)";
  const segments = hits.map(w=>`<span class="wolfTargetSegment wolfColor${w.colorIndex} ${w.confirmed?"confirmed":""}" title="${esc(w.name)}"><span>${w.marker}${w.confirmed?"✓":""}</span></span>`).join("");
  const html = `<span class="wolfTargetMeta"><span class="wolfTargetBar" style="--wolf-count:${hits.length}">${segments}</span></span>`;
  return { html, className:`wolfHasMarks ${hits.some(w=>w.confirmed)?"wolfHasConfirmed":""}`, styleVars:`--wolf-glow:${glow};--wolf-count:${hits.length}` };
}

function renderWolfMarks(targetKey){
  return wolfTargetData(targetKey).html;
}

function bindActionButtons(a){
  const box=$("actionBox");
  box.querySelectorAll("[data-choice]").forEach(btn=>btn.addEventListener("click",()=>{
    socket.emit("player_action", { kind:btn.dataset.kind || a.kind, choice:btn.dataset.choice });
  }));
  box.querySelectorAll("[data-target]").forEach(btn=>btn.addEventListener("click",()=>{
    const key=btn.dataset.target;
    const mode=btn.dataset.mode;
    if(mode === "multi"){
      const max=Number(btn.dataset.max||2);
      if(selectedTargets.has(key)) selectedTargets.delete(key);
      else if(selectedTargets.size<max) selectedTargets.add(key);
      socket.emit("player_preview", { kind:a.kind, targetKeys:[...selectedTargets] });
      renderAction();
    } else if(mode === "wolf"){
      if(a.wolfLocked || a.wolfConsensus?.locked){ return; }
      selectedSingle = key;
      socket.emit("player_action", { kind:"wolves", targetKey:key });
    } else {
      selectedSingle = selectedSingle === key ? null : key;
      if(!selectedSingle && pendingFinalConfirm?.kind === a.kind){
        clearTimeout(finalConfirmTimer);
        pendingFinalConfirm = null;
      }
      socket.emit("player_preview", { kind:a.kind, targetKey:selectedSingle });
      renderAction();
    }
  }));
  const confirmSingle=$("confirmSingleBtn"); if(confirmSingle) confirmSingle.addEventListener("click",()=>{
    if(!selectedSingle){ toast("Kies eerst een speler."); return; }
    submitTarget(a, selectedSingle);
  });
  const wolfConfirm=$("wolfConfirmBtn"); if(wolfConfirm) wolfConfirm.addEventListener("click",()=>{
    const key = selectedSingle || a.ownSelection;
    if(!key){ toast("Kies eerst een slachtoffer."); return; }
    socket.emit("player_action", { kind:"wolves", targetKey:key, confirm:true });
  });
  const ready=$("readyBtn"); if(ready) ready.addEventListener("click",()=>socket.emit("player_action", { kind:a.kind, ready:true }));
  const submitMulti=$("submitMulti"); if(submitMulti) submitMulti.addEventListener("click",()=>submitMultiTargets(a));
  const startCandidateConfirm=(choice)=>{
    pendingCandidateConfirm = true;
    pendingCandidateChoice = choice;
    clearTimeout(candidateConfirmTimer);
    candidateConfirmTimer = setTimeout(()=>{ pendingCandidateConfirm = false; pendingCandidateChoice = null; renderAction(); }, 5000);
    renderAction();
  };
  const candidateYes=$("candidateYesBtn"); if(candidateYes) candidateYes.addEventListener("click",()=>startCandidateConfirm("yes"));
  const candidateNo=$("candidateNoBtn"); if(candidateNo) candidateNo.addEventListener("click",()=>startCandidateConfirm("no"));
  const candidateConfirm=$("candidateConfirmBtn"); if(candidateConfirm) candidateConfirm.addEventListener("click",()=>{
    candidateConfirm.classList.add("pulseAccepted");
    clearTimeout(candidateConfirmTimer);
    const wantsCandidate = (candidateConfirm.dataset.candidateChoice || pendingCandidateChoice) !== "no";
    socket.emit("player_action", { kind:"mayor_candidate", isCandidate:wantsCandidate });
  });
  const submitWitch=$("submitWitch"); if(submitWitch) submitWitch.addEventListener("click",()=>{
    const saveKey=(document.querySelector("input[name=saveKey]:checked")||{}).value || null;
    const poisonKey=(document.querySelector("input[name=poisonKey]:checked")||{}).value || null;
    socket.emit("player_action", { kind:"witch", saveKey: saveKey==="none"?null:saveKey, poisonKey: poisonKey==="none"?null:poisonKey });
  });
  const emitWitchPreview=()=>{
    const saveKey=(document.querySelector("input[name=saveKey]:checked")||{}).value || null;
    const poisonKey=(document.querySelector("input[name=poisonKey]:checked")||{}).value || null;
    socket.emit("player_preview", {
      kind:"witch",
      saveKey: saveKey==="none"?null:saveKey,
      poisonKey: poisonKey==="none"?null:poisonKey
    });
  };
  box.querySelectorAll("input[name=saveKey],input[name=poisonKey]").forEach(input=>input.addEventListener("change", emitWitchPreview));
}

function submitTarget(a,key){
  if(a.kind==="mayor_vote" || a.kind==="day_vote") {
    if(!pendingFinalConfirm || pendingFinalConfirm.kind !== a.kind || pendingFinalConfirm.targetKey !== key){
      pendingFinalConfirm = { kind:a.kind, targetKey:key };
      clearTimeout(finalConfirmTimer);
      finalConfirmTimer = setTimeout(()=>{ pendingFinalConfirm = null; renderAction(); }, 5000);
      renderAction();
      return;
    }
    clearTimeout(finalConfirmTimer);
    pendingFinalConfirm = null;
    socket.emit("player_action", { kind:a.kind, targetKey:key });
    return;
  }
  socket.emit("player_action", { kind:a.kind, targetKey:key });
}
function submitMultiTargets(a){
  const keys=[...selectedTargets];
  if(a.kind==="cupid" && keys.length!==2){toast("Kies precies twee spelers.");return;}
  if(a.kind==="piper" && keys.length<1){toast("Kies minimaal één speler.");return;}
  socket.emit("player_action", { kind:a.kind, targetKeys:keys });
  selectedTargets.clear();
}

function renderSubmittedResult(a){
  const sub = a.submission || {};
  if(a.kind === "seer" && sub.result){
    const art = getRoleArt(sub.targetRoleId, sub.targetKey || sub.targetName || sub.targetRoleId);
    const visual = art
      ? `<div class="seenRoleArtWrap"><img class="seenRoleArt" src="${esc(art.src)}" alt="${esc(sub.targetRoleName || sub.result)}"></div>`
      : `<div class="seenRoleFallback"><span>${esc(sub.targetRoleEmoji || "🃏")}</span><strong>${esc(sub.result)}</strong></div>`;
    return `<div class="seerRevealResult"><h2>${esc(sub.targetName || "Gekozen speler")}</h2>${visual}${art?"":`<p>${esc(sub.result)}</p>`}</div>`;
  }
  if(a.kind === "fox" && sub.checked) return `<div class="resultBox"><div class="resultLabel">Vos-resultaat</div><div class="resultBig">${sub.foundWolfLike?"Minstens één wolfachtige gevonden":"Geen wolfachtige gevonden"}</div><p class="small muted">Gecheckt: ${esc((sub.checked||[]).join(", "))}</p></div>`;
  if(a.kind === "wolves" && sub.targetName) return `<div class="resultBox"><div class="resultLabel">Jouw wolvenkeuze</div><div class="resultBig">${esc(sub.targetName)}${sub.confirmed?" ✓":""}</div></div>`;
  if(a.kind === "mayor_vote" && sub.targetName) return `<div class="resultBox"><div class="resultBig">Je hebt gestemd op <strong>${esc(sub.targetName)}</strong> om burgemeester te worden.</div></div>`;
  if(a.kind === "day_vote" && sub.targetName) return `<div class="resultBox"><div class="resultBig">Je hebt gestemd op <strong>${esc(sub.targetName)}</strong>.</div></div>`;
  if(sub.targetName) return `<div class="resultBox"><div class="resultLabel">Keuze</div><div class="resultBig">${esc(sub.targetName)}</div></div>`;
  if(sub.targets) return `<div class="resultBox"><div class="resultLabel">Keuze</div><div class="resultBig">${esc((sub.targets||[]).join(", "))}</div></div>`;
  if(sub.lovers) return `<div class="resultBox"><div class="resultLabel">Geliefden</div><div class="resultBig">${esc((sub.lovers||[]).join(" + "))}</div></div>`;
  if(sub.choice) return `<div class="resultBox"><div class="resultLabel">Keuze</div><div class="resultBig">${esc(sub.choice)}</div></div>`;
  return "";
}

function renderLoversInfo(a){
  const lover = a.lover || null;
  const loverCard = lover
    ? `<div class="loverReveal"><h2>${esc(lover.name)}</h2>${renderPlayerIdentity(lover,"loverIdentity")}</div>`
    : `<p class="muted">Je geliefde kon niet worden gevonden.</p>`;
  return `<div class="loversInfo">${loverCard}<p class="loverSpotText">Kijk om je heen om je geliefde te spotten.</p></div><button class="btn primary confirmBtn" id="readyBtn">Klaar</button>`;
}

function renderWitch(a){
  const pending=a.pendingVictims||[];
  const all=a.allTargets||[];
  const preview=a.preview||{};
  const selectedSave=pending.some(o=>o.key===preview.saveKey) ? preview.saveKey : "none";
  const selectedPoison=all.some(o=>o.key===preview.poisonKey) ? preview.poisonKey : "none";
  const witchChoice=(action,key,name,selected,tone,person=null)=>`<label class="witchChoiceTile ${tone} ${selected===key?"selected":""}"><input type="radio" name="${action}Key" value="${esc(key)}" ${selected===key?"checked":""}><span class="witchChoiceName">${esc(name)}</span>${person?renderPlayerIdentity(person,"witchIdentity"):""}</label>`;
  let html="<div class=\"witchPanel\">";
  html += `<h3>Levensdrank ${a.canSave?"":"(al gebruikt)"}</h3>`;
  if(!a.canSave) html += `<p class="muted">Je levensdrank is al gebruikt.</p>`;
  else html += `<div class="witchChoices saveChoices">${witchChoice("save","none","Niemand redden",selectedSave,"none")}${pending.map(o=>witchChoice("save",o.key,o.name,selectedSave,"save",o)).join("")}</div>${pending.length?"":`<p class="muted">Er is momenteel geen slachtoffer om te redden.</p>`}`;
  html += `<h3>Gifdrank ${a.canPoison?"":"(al gebruikt)"}</h3>`;
  if(!a.canPoison) html += `<p class="muted">Je gifdrank is al gebruikt.</p>`;
  else html += `<div class="witchChoices poisonChoices">${witchChoice("poison","none","Niemand vergiftigen",selectedPoison,"none")}${all.map(o=>witchChoice("poison",o.key,`${o.name}${o.isMayor?" 👑":""}`,selectedPoison,"poison",o)).join("")}</div>`;
  html += `</div><button id="submitWitch" class="btn primary confirmBtn">Bevestigen</button>`;
  return html;
}
