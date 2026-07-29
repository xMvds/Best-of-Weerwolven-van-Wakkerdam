const screenTestMode = new URLSearchParams(location.search).has("screenTest");
const socket = io({autoConnect:!screenTestMode});
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
let roleInfoOpen = false;
let roleInfoAutoCloseTimer = null;
let lastLoverHeartToken = "";
let loverHeartTimer = null;
let playerRenderFrame = null;
let lastActionMarkup = "";
let selectedWitchSave = null;
let selectedWitchPoison = null;
let lastPlayerStateAt = 0;
let foregroundSyncTimer = null;
let foregroundSyncRequestAt = 0;
let foregroundSyncSequence = 0;
let selectionLimitHint = "";

const ROLE_ART = {
  villager: [
    { src: "/assets/cards/burger_1.png", title: "Burger" },
    { src: "/assets/cards/burger_2.png", title: "Burger" },
    { src: "/assets/cards/burger_3.png", title: "Burger" },
    { src: "/assets/cards/burger_4.png", title: "Burger" }
  ],
  cupid: [{ src: "/assets/cards/cupido.png", title: "Cupido" }],
  seer: [{ src: "/assets/cards/Ziener.png", title: "Ziener" }],
  piper: [{ src: "/assets/cards/fluitspeler.png", title: "Fluitspeler" }],
  werewolf: [{ src: "/assets/cards/weerwolf.png", title: "Weerwolf" }],
  big_bad_wolf: [{ src: "/assets/cards/grote_boze_wolf.png", title: "Grote Boze Wolf" }],
  witch: [{ src: "/assets/cards/Heks.png", title: "Heks" }],
  hunter: [{ src: "/assets/cards/jager.png", title: "Jager" }]
};

const preloadedRoleArt = [];
function preloadRoleArt(){
  const sources = [...new Set(Object.values(ROLE_ART).flat().map(item=>item.src))];
  for(const src of sources){
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    image.decode?.().catch(()=>{});
    preloadedRoleArt.push(image);
  }
}
preloadRoleArt();

function stableHash(str){
  const s = String(str || "");
  let h = 0;
  for(let i=0;i<s.length;i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getRoleArt(roleId, seed, cardVariant=null){
  let list = ROLE_ART[roleId];
  if(!list && ["infectious_wolf","white_wolf"].includes(roleId)) list = ROLE_ART.werewolf;
  if(!list || !list.length) return null;
  if(roleId === "villager" && Number(cardVariant) >= 1 && Number(cardVariant) <= list.length){
    return list[Number(cardVariant)-1];
  }
  return list[stableHash(seed) % list.length];
}

function renderPlayerIdentity(person, className=""){
  if(!person) return "";
  const roleId = person.cardRoleId || "villager";
  const art = getRoleArt(roleId, person.key || person.name || roleId, person.cardVariant);
  const revealedClass = person.cardRevealed ? "revealed" : "public";
  if(art){
    const preserveKey = `${person.key || person.name || roleId}:${roleId}:${art.src}:${className}`;
    return `<span class="playerIdentityCard ${revealedClass} ${className}"><img src="${esc(art.src)}" alt="${esc(person.cardRoleName || art.title || "Spelerkaart")}" data-preserve-key="${esc(preserveKey)}" draggable="false" loading="eager" decoding="async"></span>`;
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
function schedulePlayerRender(){
  if(playerRenderFrame !== null) return;
  playerRenderFrame = requestAnimationFrame(()=>{
    playerRenderFrame = null;
    render();
  });
}

function storedPlayerKey(){
  return playerKey
    || sessionStorage.getItem("wakkerdam_player_key")
    || localStorage.getItem("wakkerdam_last_player_key")
    || (lastLobbyId ? localStorage.getItem(lobbyKey(lastLobbyId)) : "")
    || "";
}

function requestForegroundSync(reason="resume"){
  const key = storedPlayerKey();
  if(!key) return;
  playerKey = key;
  const sequence = ++foregroundSyncSequence;
  clearTimeout(foregroundSyncTimer);
  const send = ()=>{
    if(sequence !== foregroundSyncSequence) return;
    if(!socket.connected){
      socket.connect();
      foregroundSyncTimer = setTimeout(send, 320);
      return;
    }
    foregroundSyncRequestAt = Date.now();
    socket.emit("player_sync", { playerKey:key, lobbyId:lastLobbyId || null, reason });
    foregroundSyncTimer = setTimeout(()=>{
      if(sequence !== foregroundSyncSequence || lastPlayerStateAt >= foregroundSyncRequestAt) return;
      // Een mobiele browser kan na sluimerstand een ogenschijnlijk verbonden,
      // maar bevroren transport vasthouden. Alleen als de expliciete sync niet
      // antwoordt, bouwen we de Socket.IO-verbinding opnieuw op.
      socket.disconnect();
      socket.connect();
    },1500);
  };
  send();
}

function resumePlayerScreen(reason){
  if(document.visibilityState === "hidden") return;
  requestAnimationFrame(()=>requestForegroundSync(reason));
}

function actionImageKey(image){
  return image?.dataset?.preserveKey
    || [image?.getAttribute("src") || "", image?.getAttribute("alt") || "", image?.className || ""].join("|");
}

function syncElementAttributes(current,next){
  [...current.attributes].forEach(attribute=>{
    if(!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  });
  [...next.attributes].forEach(attribute=>{
    if(current.getAttribute(attribute.name)!==attribute.value) current.setAttribute(attribute.name,attribute.value);
  });
}

function patchStableSelectionState(box,fragment){
  const currentRoot=box.querySelector("[data-action-key]");
  const nextRoot=fragment.querySelector("[data-action-key]");
  if(!currentRoot || !nextRoot || currentRoot.dataset.actionKey!==nextRoot.dataset.actionKey) return false;
  const currentTargets=[...currentRoot.querySelectorAll("[data-target]")];
  const nextTargets=[...nextRoot.querySelectorAll("[data-target]")];
  const currentKeys=currentTargets.map(node=>node.dataset.target).join("|");
  const nextKeys=nextTargets.map(node=>node.dataset.target).join("|");
  if(currentKeys!==nextKeys) return false;

  const currentByKey=new Map(currentTargets.map(node=>[node.dataset.target,node]));
  for(const nextTarget of nextTargets){
    const currentTarget=currentByKey.get(nextTarget.dataset.target);
    if(!currentTarget) return false;
    syncElementAttributes(currentTarget,nextTarget);
    const currentMarks=currentTarget.querySelector(".wolfTargetMeta");
    const nextMarks=nextTarget.querySelector(".wolfTargetMeta");
    if(currentMarks && nextMarks && currentMarks.innerHTML!==nextMarks.innerHTML) currentMarks.innerHTML=nextMarks.innerHTML;
    else if(currentMarks && !nextMarks) currentMarks.remove();
    else if(!currentMarks && nextMarks) currentTarget.append(nextMarks.cloneNode(true));
  }

  for(const id of ["confirmSingleBtn","wolfConfirmBtn","submitMulti","submitWitch"]){
    const currentButton=currentRoot.querySelector(`#${id}`);
    const nextButton=nextRoot.querySelector(`#${id}`);
    if(currentButton && nextButton){
      syncElementAttributes(currentButton,nextButton);
      currentButton.textContent=nextButton.textContent;
    }
  }

  const currentHint=currentRoot.querySelector(".selectionLimitHint");
  const nextHint=nextRoot.querySelector(".selectionLimitHint");
  if(currentHint && nextHint) currentHint.textContent=nextHint.textContent;
  else if(currentHint && !nextHint) currentHint.remove();
  else if(!currentHint && nextHint){
    const grid=currentRoot.querySelector(".playerChoices");
    grid?.insertAdjacentElement("afterend",nextHint.cloneNode(true));
  }

  const currentInputs=[...currentRoot.querySelectorAll(".witchChoiceTile input")];
  const nextInputs=[...nextRoot.querySelectorAll(".witchChoiceTile input")];
  if(currentInputs.length===nextInputs.length && currentInputs.length){
    for(const nextInput of nextInputs){
      const currentInput=currentInputs.find(input=>input.name===nextInput.name && input.value===nextInput.value);
      if(!currentInput) continue;
      currentInput.checked=nextInput.checked;
      const currentTile=currentInput.closest(".witchChoiceTile");
      const nextTile=nextInput.closest(".witchChoiceTile");
      if(currentTile && nextTile) syncElementAttributes(currentTile,nextTile);
    }
  }
  return true;
}

function commitActionHtml(box, markup){
  if(markup === lastActionMarkup && box.childNodes.length) return false;

  // Hergebruik reeds gedecodeerde PNG-nodes. De omringende actie-HTML mag
  // veranderen, maar de kaart zelf wordt binnen dezelfde paint verplaatst en
  // verdwijnt daardoor niet twee frames op tragere apparaten.
  const preserved = new Map();
  box.querySelectorAll("img").forEach(image=>{
    const key = actionImageKey(image);
    const bucket = preserved.get(key) || [];
    bucket.push(image);
    preserved.set(key, bucket);
  });

  const template = document.createElement("template");
  template.innerHTML = markup;
  if(patchStableSelectionState(box,template.content)){
    lastActionMarkup=markup;
    return false;
  }
  template.content.querySelectorAll("img").forEach(nextImage=>{
    const bucket = preserved.get(actionImageKey(nextImage));
    const currentImage = bucket?.shift();
    if(!currentImage) return;
    [...currentImage.attributes].forEach(attribute=>{
      if(!nextImage.hasAttribute(attribute.name)) currentImage.removeAttribute(attribute.name);
    });
    [...nextImage.attributes].forEach(attribute=>{
      // Laat een identieke src ongemoeid: zo blijft de reeds gedecodeerde
      // bitmap gegarandeerd aan dezelfde DOM-node gekoppeld.
      if(currentImage.getAttribute(attribute.name) !== attribute.value) {
        currentImage.setAttribute(attribute.name, attribute.value);
      }
    });
    nextImage.replaceWith(currentImage);
  });

  box.replaceChildren(template.content);
  lastActionMarkup = markup;
  return true;
}

$("joinForm")?.addEventListener("submit", e=>{ e.preventDefault(); join(); });
$("nameInput").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); join(); } });
window.addEventListener("load",()=>setTimeout(()=>$('nameInput')?.focus(),80));

// Verborgen debug: uitsluitend vijf losse D-toetsen kort na elkaar.
let debugDPresses = [];
let playerDebugAutoHideTimer = null;
function showPlayerDebug(){
  $("playerDebugFab")?.classList.remove("hidden");
  clearTimeout(playerDebugAutoHideTimer);
  playerDebugAutoHideTimer = setTimeout(hidePlayerDebug, 5000);
}
function hidePlayerDebug(){ $("playerDebugFab")?.classList.add("hidden"); clearTimeout(playerDebugAutoHideTimer); }
window.addEventListener("keydown", (e)=>{
  if(e.repeat) return;
  if(String(e.key||"").toLowerCase() !== "d") return;
  const now = Date.now();
  debugDPresses = debugDPresses.filter(t => now - t < 1200);
  debugDPresses.push(now);
  if(debugDPresses.length >= 5){
    debugDPresses = [];
    showPlayerDebug();
  }
});
$("playerDebugClose")?.addEventListener("click", hidePlayerDebug);
$("openInfoFromPlayer")?.addEventListener("click", ()=>window.open("/info", "_blank"));
$("openHostFromPlayer")?.addEventListener("click", ()=>{
  const code = prompt("Hostcode");
  if(code === "0909") window.open("/host", "_blank");
  else if(code !== null) toast("Onjuiste hostcode.");
});
$("roleInfoFab")?.addEventListener("click", ()=>{
  roleInfoOpen = !roleInfoOpen;
  clearTimeout(roleInfoAutoCloseTimer);
  if(roleInfoOpen){
    roleInfoAutoCloseTimer = setTimeout(()=>{
      roleInfoOpen = false;
      renderRoleInfo();
    },7000);
  }
  renderRoleInfo();
});
$("roleInfoClose")?.addEventListener("click", ()=>{
  roleInfoOpen = false;
  clearTimeout(roleInfoAutoCloseTimer);
  renderRoleInfo();
});


function join(){ socket.emit("join", { name: $("nameInput").value, playerKey }); }

socket.on("connect", ()=>{
  if(storedPlayerKey()) socket.emit("join", { playerKey:storedPlayerKey() });
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
socket.on("player_state", s=>{
  lastPlayerStateAt = Date.now();
  clearTimeout(foregroundSyncTimer);
  const prev=state;
  state=s;
  maybeVibrateForAction(prev,s);
  schedulePlayerRender();
});
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
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible") resumePlayerScreen("visibility");
});
window.addEventListener("pageshow", ()=>resumePlayerScreen("pageshow"));
window.addEventListener("focus", ()=>resumePlayerScreen("focus"));
window.addEventListener("online", ()=>resumePlayerScreen("online"));

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
    selectionLimitHint = "";
    selectedWitchSave = null;
    selectedWitchPoison = null;
    clearTimeout(candidateConfirmTimer);
    clearTimeout(finalConfirmTimer);
    lastActionKey = actionKey;
    const preview = state.action?.preview || null;
    if(Array.isArray(preview?.targetKeys)){
      preview.targetKeys.forEach(key=>selectedTargets.add(key));
    }
    selectedSingle = preview?.targetKey || state.action?.selectedTargetKey || null;
    if(state.action?.kind === "witch"){
      selectedWitchSave = preview?.saveKey || null;
      selectedWitchPoison = preview?.poisonKey || null;
    }
  }
  document.body.classList.add("inGame");
  document.body.classList.toggle("playerDead", !state.me.alive && state.phase !== "hunter");
  $("joinCard").classList.add("hidden");
  $("gameUI").classList.remove("hidden");
  renderAction();
  renderLoverHeartPulse();
  renderRoleInfo();
}

function roleCard(compact=false){
  const r=state?.me?.role;
  if(!r) return "";
  const tags=[];
  if(state.me.infected) tags.push("besmet");
  if(state.me.wolfDogChoice) tags.push(state.me.wolfDogChoice==="wolf"?"wolvenkant":"burgerkant");
  if(state.me.wildChildTurned) tags.push("nu wolfachtig");
  const art = getRoleArt(r.id, state.me.key || playerKey || r.id, state.me.cardVariant);
  const visual = art
    ? `<div class="roleArtWrap"><img class="roleArtImage" src="${esc(art.src)}" alt="${esc(art.title || r.name)}" data-preserve-key="own-role:${esc(state.me.key || playerKey || r.id)}:${esc(art.src)}" draggable="false"></div>`
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
    commitActionHtml(box, `<div class="playerCenter"><h1>${esc(winnerTitle)}</h1><p>${esc(winnerText)}</p>${roleCard(true)}</div>`);
    return;
  }

  const dayVoteRevealPending = state?.dayVote?.result?.revealed === false
    || state?.dayVote?.result?.publicRevealed === false;
  if(dayVoteRevealPending){
    commitActionHtml(box, `<div class="playerCenter revealWaiting"><h1>De stemmen worden geteld</h1><p>Wacht op de onthulling op het Infoscherm.</p>${roleCard(true)}</div>`);
    return;
  }

  const ownEliminationPending = state?.dayVote?.result?.eliminatedKey === state?.me?.key
    && (state.dayVote.result.revealed === false || state.dayVote.result.publicRevealed === false);
  if(!state.me.alive && ownEliminationPending){
    commitActionHtml(box, `<div class="playerCenter"><h1>De stemmen worden geteld</h1>${roleCard(true)}</div>`);
    return;
  }

  const hunterActionVisible = !!a && ["hunter_shot","hunter_wait"].includes(a.kind);
  if(state.publicDeathPending && !hunterActionVisible){
    const text = state.phase === "hunter" ? "De Jager maakt zijn laatste keuze." : "Het Infoscherm onthult wat er is gebeurd.";
    commitActionHtml(box, `<div class="playerCenter revealWaiting"><h1>De uitslag wordt onthuld</h1><p>${esc(text)}</p>${roleCard(true)}</div>`);
    return;
  }

  if(!state.me.alive && !hunterActionVisible){
    commitActionHtml(box, `<div class="deadScreen"><div class="deadMark">✖</div><h1>Je bent uitgeschakeld</h1>${roleCard(true)}</div>`);
    return;
  }

  if(!a){
    const hunterStage = state.hunterSequence?.stage || "";
    const title = state.phase === "night" ? "Nacht" : state.phase === "day" || (state.phase === "hunter" && hunterStage === "summary") ? "Je hebt de nacht overleefd" : state.phase === "hunter" ? "Het laatste schot" : state.phase === "lobby" ? "Lobby" : "Wacht";
    const sub = state.phase === "night" ? "Je slaapt." : state.phase === "hunter" && hunterStage !== "summary" ? "De uitslag wordt op het Infoscherm onthuld." : (state.phase === "lobby" ? "Wacht op de host." : "");
    commitActionHtml(box, `<div class="playerCenter"><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:""}${roleCard(true)}</div>`);
    return;
  }

  if(a.waitingOnly){
    commitActionHtml(box, `<div class="playerCenter hunterPlayerWaiting"><h1>${esc(a.title)}</h1>${a.text?`<p>${esc(a.text)}</p>`:""}${roleCard(true)}</div>`);
    return;
  }

  if(a.kind === "mayor_result_wait"){
    if(!a.revealed){
      commitActionHtml(box, `<div class="playerCenter"><h1>De stemmen worden geteld</h1>${roleCard(true)}</div>`);
    } else {
      commitActionHtml(box, `<div class="playerCenter"><h1>${titleHtml(a.finalTitle || "de burgemeester is bekend")}</h1>${roleCard(true)}</div>`);
    }
    return;
  }

  if(a.submitted){
    const voteAction = a.kind === "mayor_vote" || a.kind === "day_vote";
    const submittedTitle = voteAction
      ? a.title
      : a.kind === "lovers_info"
        ? "Je hebt je geliefden gezien"
        : "Je koos";
    const sleepRole = a.actorRoleName || state.me.role?.name || "rol";
    const sleepMessage = voteAction ? "" : `<p class="sleepStatus">${esc(a.sleepMessage || `De ${sleepRole} gaat weer slapen.`)}</p>`;
    commitActionHtml(box, `<div class="playerCenter submitted"><h1>${esc(submittedTitle)}</h1>${renderSubmittedResult(a)}${sleepMessage}</div>`);
    return;
  }

  const completeClass = a.kind === "witch" && !a.canSave && !a.canPoison ? " actionComplete" : "";
  let html=`<div class="playerCenter active action-${esc(a.kind)}${completeClass}" data-action-key="${esc(a.id || a.kind)}:${esc(a.kind)}"><h1>${esc(a.title)}</h1>${!["wolves","lovers_info"].includes(a.kind) && a.text?`<p>${esc(a.text)}</p>`:""}`;

  if(a.kind === "wolves"){
    html += renderWolfAction(a);
  } else if(a.kind === "wolf_hound"){
    html += renderChoiceButtons(a.choices || [], a.kind);
  } else if(["wild_child","seer","big_bad_wolf","white_wolf","fox","hunter_shot","mayor_vote","day_vote"].includes(a.kind)){
    html += renderSingleTargetAction(a);
  } else if(a.kind === "cupid"){
    html += `<p class="small muted">Kies twee spelers.</p>${renderChoiceButtonsAsTargets(a.options||[], "multi", 2)}${renderSelectionLimitHint()}<button class="btn primary confirmBtn" id="submitMulti">Bevestigen</button>`;
  } else if(a.kind === "lovers_info"){
    html += renderLoversInfo(a);
  } else if(a.kind === "enchanted_info"){
    html += renderEnchantedInfo(a);
  } else if(a.kind === "enchantment_broken"){
    html += renderEnchantmentBroken(a);
  } else if(a.infoOnly || a.kind === "sisters_info"){
    html += `<button class="btn primary confirmBtn" id="readyBtn">Klaar</button>`;
  } else if(a.kind === "infectious_wolf"){
    html += renderChoiceButtons(a.choices || [], a.kind);
  } else if(a.kind === "witch"){
    html += renderWitch(a);
  } else if(a.kind === "piper"){
    html += `<p class="small muted">Kies maximaal twee spelers.</p>${renderChoiceButtonsAsTargets(a.options||[], "multi", 2)}${renderSelectionLimitHint()}<button class="btn primary confirmBtn" id="submitMulti">Bevestig betovering</button>`;
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
  if(commitActionHtml(box, html)) bindActionButtons(a);
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

function renderSelectionLimitHint(){
  return selectionLimitHint ? `<p class="selectionLimitHint" role="status">${esc(selectionLimitHint)}</p>` : "";
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
  const grid = choiceGridMetrics(options.length);
  return `<div class="choices playerChoices ${grid.className}" style="${grid.style}">${options.map(o=>{
    const isSelected = mode === "multi" ? selectedTargets.has(o.key) : selected === o.key;
    const wolfData = mode === "wolf" ? wolfTargetData(o.key) : { html:"", className:"", styleVars:"" };
    const nameLength = String(o.name || "").length;
    const nameFontSize = Math.max(14, 22 - Math.max(0, nameLength - 12) * .45).toFixed(1);
    const styleVars = [wolfData.styleVars, `--choice-font-size:${nameFontSize}px`].filter(Boolean).join(";");
    return `<button class="choice playerTargetChoice ${isSelected?"selected":""} ${wolfData.className}" style="${styleVars}" data-target="${esc(o.key)}" data-mode="${mode}" data-max="${max}"><span class="targetName">${esc(o.name)}${o.isMayor?" 👑":""}</span>${renderPlayerIdentity(o,"choiceIdentity")}${wolfData.html}</button>`;
  }).join("")}</div>`;
}

function choiceGridMetrics(count){
  const safeCount = Math.max(1, Number(count) || 1);
  const desktopCols = safeCount <= 2 ? safeCount : safeCount <= 4 ? 2 : safeCount <= 8 ? 4 : Math.min(10, Math.ceil(Math.sqrt(safeCount * 1.55)));
  const mobileCols = safeCount <= 2 ? safeCount : safeCount <= 6 ? 2 : safeCount <= 18 ? 3 : 4;
  const desktopRows = Math.ceil(safeCount / desktopCols);
  const mobileRows = Math.ceil(safeCount / mobileCols);
  const desktopCardVh = Math.max(7, Math.min(27, 64 / desktopRows));
  const mobileCardVh = Math.max(4.2, Math.min(20, 58 / mobileRows));
  const desktopMax = Math.max(205, desktopCols * 210 + (desktopCols - 1) * 10);
  const className = safeCount > 24 ? "ultraDenseChoices" : safeCount > 12 ? "veryDenseChoices" : safeCount > 8 ? "denseChoices" : "";
  return {
    className,
    desktopRows,
    mobileRows,
    style:`--choice-count:${safeCount};--choice-cols:${desktopCols};--choice-rows:${desktopRows};--choice-mobile-cols:${mobileCols};--choice-mobile-rows:${mobileRows};--choice-card-vh:${desktopCardVh.toFixed(2)}svh;--choice-mobile-card-vh:${mobileCardVh.toFixed(2)}svh;--choice-grid-max:${desktopMax}px`,
  };
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
      if(selectedTargets.has(key)){
        selectedTargets.delete(key);
        selectionLimitHint="";
      }else if(selectedTargets.size<max){
        selectedTargets.add(key);
        selectionLimitHint="";
      }else{
        selectionLimitHint=`Maximaal ${max} gekozen — deselecteer eerst iemand.`;
        renderAction();
        return;
      }
      socket.emit("player_preview", { kind:a.kind, targetKeys:[...selectedTargets] });
      renderAction();
    } else if(mode === "wolf"){
      if(a.wolfLocked || a.wolfConsensus?.locked){ return; }
      selectedSingle = key;
      socket.emit("player_preview", { kind:"wolves", targetKey:key });
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
    const saveKey=selectedWitchSave;
    const poisonKey=selectedWitchPoison;
    socket.emit("player_action", { kind:"witch", saveKey: saveKey==="none"?null:saveKey, poisonKey: poisonKey==="none"?null:poisonKey });
  });
  const emitWitchPreview=()=>{
    socket.emit("player_preview", {
      kind:"witch",
      saveKey: selectedWitchSave==="none"?null:selectedWitchSave,
      poisonKey: selectedWitchPoison==="none"?null:selectedWitchPoison
    });
  };
  box.querySelectorAll("input[name=saveKey],input[name=poisonKey]").forEach(input=>input.addEventListener("change", ()=>{
    if(input.name === "saveKey") selectedWitchSave = input.value || null;
    if(input.name === "poisonKey") selectedWitchPoison = input.value || null;
    emitWitchPreview();
    renderAction();
  }));
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
  selectionLimitHint="";
}

function renderSubmittedResult(a){
  const sub = a.submission || {};
  if(a.kind === "seer" && sub.result){
    const art = getRoleArt(sub.targetRoleId, sub.targetKey || sub.targetName || sub.targetRoleId, sub.targetCardVariant);
    const visual = art
      ? `<div class="seenRoleArtWrap"><img class="seenRoleArt" src="${esc(art.src)}" alt="${esc(sub.targetRoleName || sub.result)}"></div>`
      : `<div class="seenRoleFallback"><span>${esc(sub.targetRoleEmoji || "🃏")}</span><strong>${esc(sub.result)}</strong></div>`;
    return `<div class="seerRevealResult"><h2>${esc(sub.targetName || "Speler")} is de</h2>${visual}${art?"":`<p>${esc(sub.result)}</p>`}</div>`;
  }
  if(a.kind === "cupid" && sub.people?.length) return renderResultPeople("Te koppelen aan", sub.people, "love");
  if(a.kind === "piper" && sub.people?.length) return renderResultPeople("Te betoveren", sub.people, "magic");
  if(a.kind === "witch"){
    const parts = [];
    if(sub.saveTarget) parts.push(renderResultPeople("Te redden", [sub.saveTarget], "save"));
    if(sub.poisonTarget) parts.push(renderResultPeople("Te vergiftigen", [sub.poisonTarget], "poison"));
    if(!sub.saveTarget && !sub.poisonTarget) parts.push(`<div class="resultBox compactResult"><div class="resultBig">Geen drankje te gebruiken</div></div>`);
    if(parts.length) return `<div class="submittedPeopleGroups">${parts.join("")}</div>`;
  }
  if(a.kind === "fox" && sub.checked) return `${sub.targetCard?renderResultPeople("Te onderzoeken", [sub.targetCard]):""}<div class="resultBox compactResult"><div class="resultLabel">Vos-resultaat</div><div class="resultBig">${sub.foundWolfLike?"Minstens één wolfachtige gevonden":"Geen wolfachtige gevonden"}</div><p class="small muted">Gecheckt: ${esc((sub.checked||[]).join(", "))}</p></div>`;
  if(sub.targetCard) return renderResultPeople(submittedActionLabel(a.kind), [sub.targetCard]);
  if(a.kind === "mayor_vote" && sub.targetName) return `<div class="resultBox"><div class="resultBig">Je hebt gestemd op <strong>${esc(sub.targetName)}</strong> om burgemeester te worden.</div></div>`;
  if(a.kind === "day_vote" && sub.targetName) return `<div class="resultBox"><div class="resultBig">Je hebt gestemd op <strong>${esc(sub.targetName)}</strong>.</div></div>`;
  if(sub.targetName) return `<div class="resultBox"><div class="resultLabel">${esc(submittedActionLabel(a.kind))}</div><div class="resultBig">${esc(sub.targetName)}</div></div>`;
  if(sub.targets) return `<div class="resultBox"><div class="resultLabel">Keuze</div><div class="resultBig">${esc((sub.targets||[]).join(", "))}</div></div>`;
  if(sub.lovers) return `<div class="resultBox"><div class="resultLabel">Geliefden</div><div class="resultBig">${esc((sub.lovers||[]).join(" + "))}</div></div>`;
  if(sub.choice) return `<div class="resultBox"><div class="resultLabel">Keuze</div><div class="resultBig">${esc(sub.choice)}</div></div>`;
  return "";
}

function submittedActionLabel(kind){
  return ({
    wolves:"Te doden",
    big_bad_wolf:"Te doden",
    white_wolf:"Te doden",
    hunter_shot:"Te raken",
    wild_child:"Als rolmodel te kiezen",
    fox:"Te onderzoeken",
    seer:"Te zien",
    cupid:"Te koppelen aan",
    piper:"Te betoveren",
  })[kind] || "Voor";
}

function renderResultPeople(title, people, tone=""){
  const rows = (people || []).filter(Boolean);
  if(!rows.length) return "";
  return `<section class="submittedPeople ${tone}">${title?`<h2>${esc(title)}</h2>`:""}<div class="submittedPeopleGrid">${rows.map(person=>`<article><strong>${esc(person.name || "Speler")}</strong>${renderPlayerIdentity(person,"submittedIdentity")}</article>`).join("")}</div></section>`;
}

function renderRoleInfo(){
  const fab = $("roleInfoFab");
  const panel = $("roleInfoPanel");
  const info = state?.roleInfo;
  const visible = !!(state?.started && info);
  fab?.classList.toggle("hidden", !visible);
  if(!visible){
    roleInfoOpen = false;
    clearTimeout(roleInfoAutoCloseTimer);
    panel?.classList.add("hidden");
    return;
  }
  fab?.setAttribute("aria-expanded", roleInfoOpen ? "true" : "false");
  panel?.classList.toggle("hidden", !roleInfoOpen);
  if(!roleInfoOpen) return;
  const facts = (info.facts || []).map(fact=>{
    if(fact.kind === "people"){
      return `<section class="roleInfoFact"><h3>${esc(fact.title)}</h3><div class="roleInfoPeople">${(fact.people||[]).map(person=>`<article><strong>${esc(person.name)}</strong>${renderPlayerIdentity(person,"roleInfoIdentity")}</article>`).join("")}</div></section>`;
    }
    return `<section class="roleInfoFact"><h3>${esc(fact.title)}</h3>${(fact.texts||[]).map(item=>`<div class="roleInfoText"><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></div>`).join("")}</section>`;
  }).join("");
  $("roleInfoContent").innerHTML = `<p class="roleInfoEyebrow">Jouw rol</p><h2>${esc(info.roleName)}</h2><p class="roleObjective">${esc(info.objective)}</p>${facts || '<p class="muted">Je hebt nog geen extra informatie verzameld.</p>'}`;
}

function renderLoverHeartPulse(){
  const pulse = state?.me?.loverHeartPulse || null;
  const remaining = pulse ? Number(pulse.until || 0) - Date.now() : 0;
  let heart = document.getElementById("loverHeartPulse");
  if(!pulse?.token || remaining <= 0){
    heart?.remove();
    clearTimeout(loverHeartTimer);
    loverHeartTimer = null;
    return;
  }
  if(pulse.token !== lastLoverHeartToken){
    heart?.remove();
    heart = document.createElement("div");
    heart.id = "loverHeartPulse";
    heart.className = "loverHeartPulse";
    heart.setAttribute("role", "status");
    heart.setAttribute("aria-label", "Je geliefde heeft bevestigd");
    heart.textContent = "♥";
    document.body.appendChild(heart);
    lastLoverHeartToken = pulse.token;
  }
  clearTimeout(loverHeartTimer);
  loverHeartTimer = setTimeout(()=>{
    document.getElementById("loverHeartPulse")?.remove();
    loverHeartTimer = null;
  }, Math.max(0, remaining));
}

function renderLoversInfo(a){
  const lover = a.lover || null;
  const loverCard = lover
    ? `<div class="loverReveal"><h2>${esc(lover.name)}</h2>${renderPlayerIdentity(lover,"loverIdentity")}</div>`
    : `<p class="muted">Je geliefde kon niet worden gevonden.</p>`;
  return `<div class="loversInfo">${loverCard}<p class="loverSpotText">Kijk om je heen om je geliefde te spotten.</p></div><button class="btn primary confirmBtn" id="readyBtn">Klaar</button>`;
}

function renderEnchantedInfo(a){
  const people = a.people || [];
  const cards = people.length
    ? renderResultPeople("", people, "magic enchantedGroup")
    : `<p class="muted">Er zijn geen andere levende betoverden.</p>`;
  return `<div class="enchantedInfo"><div class="enchantedSelfNotice"><strong>Je bent betoverd!</strong><span>De Betoverde</span></div>${cards}<p class="hostControlledNotice">De Host gaat verder wanneer iedereen elkaar heeft gezien.</p></div>`;
}

function renderEnchantmentBroken(){
  return `<div class="enchantmentBrokenNotice"><span class="brokenMagicMark" aria-hidden="true">◇</span><strong>De betovering is verbroken</strong><p>De Fluitspeler is dood. Je bent vanaf nu niet meer betoverd.</p><small>De Host gaat verder.</small></div>`;
}

function renderWitch(a){
  const pending=a.pendingVictims||[];
  const all=a.allTargets||[];
  const selectedSave=pending.some(o=>o.key===selectedWitchSave) ? selectedWitchSave : (selectedWitchSave === "none" ? "none" : null);
  const selectedPoison=all.some(o=>o.key===selectedWitchPoison) ? selectedWitchPoison : (selectedWitchPoison === "none" ? "none" : null);
  const saveGrid = choiceGridMetrics(1 + pending.length);
  const poisonGrid = choiceGridMetrics(1 + all.length);
  const combinedMobileRows = saveGrid.mobileRows + poisonGrid.mobileRows;
  const maxDesktopRows = Math.max(saveGrid.desktopRows, poisonGrid.desktopRows);
  const sharedDesktopVh = Math.max(6, Math.min(24, 58 / maxDesktopRows));
  const sharedMobileVh = Math.max(4.4, Math.min(14, 52 / combinedMobileRows));
  const witchGridStyle = grid => `${grid.style};--choice-card-vh:${sharedDesktopVh.toFixed(2)}svh;--choice-mobile-card-vh:${sharedMobileVh.toFixed(2)}svh`;
  const witchChoice=(action,key,name,selected,tone,person=null)=>`<label class="witchChoiceTile ${tone} ${selected===key?"selected":""}"><input type="radio" name="${action}Key" value="${esc(key)}" ${selected===key?"checked":""}><span class="witchChoiceName">${esc(name)}</span>${person?renderPlayerIdentity(person,"witchIdentity"):`<span class="witchNoActionIcon" aria-hidden="true">∅</span>`}</label>`;
  let html="<div class=\"witchPanel\">";
  html += `<h3>Levensdrank ${a.canSave?"":"(al gebruikt)"}</h3>`;
  if(!a.canSave) html += `<p class="muted">Je levensdrank is al gebruikt.</p>`;
  else {
    html += `<div class="witchChoices saveChoices ${saveGrid.className}" style="${witchGridStyle(saveGrid)}">${witchChoice("save","none","Niemand redden",selectedSave,"none")}${pending.map(o=>witchChoice("save",o.key,o.name,selectedSave,"save",o)).join("")}</div>${pending.length?"":`<p class="muted">Er is momenteel geen slachtoffer om te redden.</p>`}`;
  }
  html += `<h3>Gifdrank ${a.canPoison?"":"(al gebruikt)"}</h3>`;
  if(!a.canPoison) html += `<p class="muted">Je gifdrank is al gebruikt.</p>`;
  else {
    html += `<div class="witchChoices poisonChoices ${poisonGrid.className}" style="${witchGridStyle(poisonGrid)}">${witchChoice("poison","none","Niemand vergiftigen",selectedPoison,"none")}${all.map(o=>witchChoice("poison",o.key,`${o.name}${o.isMayor?" 👑":""}`,selectedPoison,"poison",o)).join("")}</div>`;
  }
  html += `</div><button id="submitWitch" class="btn primary confirmBtn">Bevestigen</button>`;
  return html;
}

if(screenTestMode){
  document.body.classList.add("screenTestEmbedded");
  window.addEventListener("message",event=>{
    if(event.data?.type!=="wakkerdam-screen-test" || event.data.surface!=="player") return;
    state=event.data.state;
    playerKey=state?.me?.key || "screen_test_player";
    lastActionKey="";
    lastActionMarkup="";
    selectedTargets.clear();
    selectedSingle=null;
    selectedWitchSave=null;
    selectedWitchPoison=null;
    selectionLimitHint="";
    render();
  });
  window.parent?.postMessage({type:"wakkerdam-screen-test-ready",surface:"player"},"*");
}
