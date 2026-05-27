const socket=io();
const $=(id)=>document.getElementById(id);
let lastDeathIds="";
let lastMayorResultKey="";
let lastDayResultKey="";
let lastWinnerKey="";
let lastNonWinnerState=null;
let winnerTransitionKey="";
let winnerTransitionTimer=null;
let dayVoteRefreshTimer=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
const ROLE_ART = {
  "Burger": ["/assets/cards/Burger1.png", "/assets/cards/Burger2.png", "/assets/cards/burger4.png"],
  "Weerwolf": ["/assets/cards/Weerwolf.png"],
  "Ziener": ["/assets/cards/Ziener.png"],
  "Fluitspeler": ["/assets/cards/fluitspeler.png"]
};
function stableHash(str){ let h=0; str=String(str||""); for(let i=0;i<str.length;i++) h=((h<<5)-h+str.charCodeAt(i))|0; return Math.abs(h); }
function pickRoleArt(roleName, seed, variantIndex=null){
  const artList = ROLE_ART[roleName] || [];
  if(!artList.length) return null;
  const variant = Number.isFinite(Number(variantIndex)) ? Number(variantIndex) : stableHash(seed || roleName);
  return artList[Math.abs(Math.floor(variant)) % artList.length];
}
function deathVisual(d){
  const src = pickRoleArt(d.roleName, d.key||d.name, d.roleArtVariant);
  if(src){
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
function winnerKeyForState(s){
  return s?.winner ? `${s.winner.team || ""}:${s.winner.title || ""}:${s.winner.text || ""}` : "";
}
function dayVoteVisualRevealUntil(s){
  return Number(s?.dayVote?.result?.visualRevealUntil || s?.dayVote?.result?.revealUntil || 0);
}
function scheduleDayVoteRevealRefresh(s){
  clearTimeout(dayVoteRefreshTimer);
  const result = s?.dayVote?.result || null;
  if(!result) return;
  const now = Date.now();
  const revealUntil = Number(result.revealUntil || 0);
  const cardAt = revealUntil ? revealUntil + 650 : 0;
  const visualUntil = dayVoteVisualRevealUntil(s);
  const times = [revealUntil, cardAt, visualUntil].filter(t => t && now < t).sort((a,b)=>a-b);
  if(times.length){
    dayVoteRefreshTimer = setTimeout(()=>render(s), Math.max(60, times[0] - now + 60));
  }
}

function fitResponsiveTileGrids(){
  const grids = [
    ...document.querySelectorAll(".viewerPlayers, .infoCandidatesCentral, .infoVoters")
  ];
  requestAnimationFrame(()=>{
    grids.forEach(grid=>{
      if(!grid || !grid.children.length) return;
      const isBottomViewerPlayers = grid.classList.contains("viewerPlayers") && grid.closest(".infoScreen");
      grid.style.height = "";
      grid.style.transformOrigin = "top center";
      if(isBottomViewerPlayers){
        // Infoscherm-spelerstatus wordt apart gepositioneerd in de vrije ruimte onder de hoofdcontent.
        // Niet met scale() aan deze container sleutelen; wrap/gap/font-size houden de groep stabiel.
        return;
      }
      grid.style.transform = "";
      const rect = grid.getBoundingClientRect();
      const availableHeight = Math.max(90, window.innerHeight - rect.top - 22);
      const availableWidth = Math.max(240, window.innerWidth - 28);
      const scale = Math.min(1, availableHeight / Math.max(1, grid.scrollHeight), availableWidth / Math.max(1, grid.scrollWidth));
      if(scale < .995){
        const safe = Math.max(.42, scale);
        grid.style.transform = `scale(${safe})`;
        grid.style.height = `${Math.ceil(grid.scrollHeight * safe)}px`;
      }
    });
    positionViewerPlayers();
  });
}
window.addEventListener("resize", fitResponsiveTileGrids);
window.addEventListener("resize", ()=>requestAnimationFrame(positionViewerPlayers));

function setHeroBaseClass(hero, baseClass){
  if(!hero) return;
  const keep = ["winnerFadeToBlack", "winnerFadeFromBlack"].filter(c=>hero.classList.contains(c));
  if(hero.dataset.baseClass !== baseClass){
    hero.className = [baseClass, ...keep].join(" ").trim();
    hero.dataset.baseClass = baseClass;
  }
}

function updateViewerPlayers(s){
  const root = $("viewerPlayers");
  if(!root) return;
  const players = s.players || [];
  const revealUntil = dayVoteVisualRevealUntil(s);
  const dayVoteRevealPending = !!(revealUntil && Date.now() < revealUntil);
  const pendingEliminatedKey = s.dayVote?.result?.eliminatedKey || null;
  const existing = new Map([...root.children].map(el=>[el.dataset.key || "", el]));
  const wanted = new Set();
  players.forEach((p, index)=>{
    const key = p.key || `idx-${index}`;
    wanted.add(key);
    const visuallyDead = !p.alive || (!!pendingEliminatedKey && !dayVoteRevealPending && p.key === pendingEliminatedKey);
    let el = existing.get(key);
    if(!el){
      el = document.createElement("span");
      el.dataset.key = key;
      el.className = "viewerPlayer";
      root.appendChild(el);
    }
    const text = `${p.name || ""}${p.isMayor?' 👑':''}${p.enchanted?' 🎵':''}`;
    if(el.textContent !== text) el.textContent = text;
    el.classList.toggle("mayor", !!p.isMayor);
    el.classList.toggle("dead", !!visuallyDead);
  });
  [...root.children].forEach(el=>{ if(!wanted.has(el.dataset.key || "")) el.remove(); });
  scheduleDayVoteRevealRefresh(s);
}

function positionViewerPlayers(){
  const hero = $("hero");
  const root = $("viewerPlayers");
  if(!hero || !root || !root.children.length){ return; }
  const heroRect = hero.getBoundingClientRect();
  if(!heroRect.height) return;

  // The status tiles are a floating composition layer. Place the full group roughly
  // halfway between the bottom of the current main content and the bottom of the viewport.
  const contentNodes = [$("bigStatus"), $("subStatus"), $("deaths")].filter(Boolean);
  let mainBottom = heroRect.top + Math.min(heroRect.height * .58, heroRect.height - 180);
  contentNodes.forEach(node=>{
    if(node === root) return;
    const rect = node.getBoundingClientRect();
    if(rect.width > 0 && rect.height > 0) mainBottom = Math.max(mainBottom, rect.bottom);
  });

  const rootRect = root.getBoundingClientRect();
  const rootHeight = Math.max(24, rootRect.height || root.scrollHeight || 24);
  const topPad = Math.max(14, Math.min(38, heroRect.height * .025));
  const bottomPad = Math.max(28, Math.min(72, heroRect.height * .06));
  const freeTop = Math.max(topPad, mainBottom - heroRect.top + topPad);
  const freeBottom = heroRect.height - bottomPad - rootHeight;
  let y;
  if(freeBottom > freeTop){
    y = freeTop + (freeBottom - freeTop) * .50;
  } else {
    y = Math.max(topPad, Math.min(freeTop, freeBottom));
  }
  root.style.position = "absolute";
  root.style.left = "50%";
  root.style.right = "auto";
  root.style.bottom = "auto";
  root.style.top = `${Math.round(y)}px`;
  root.style.transform = "translateX(-50%)";
}

function startWinnerTransition(s, wk){
  winnerTransitionKey = wk;
  clearTimeout(winnerTransitionTimer);
  const before = lastNonWinnerState || { ...s, winner:null, phase:"day" };
  renderNow(before);
  const hero = $("hero");
  hero?.classList.remove("winnerFadeFromBlack");
  hero?.classList.add("winnerFadeToBlack");
  winnerTransitionTimer = setTimeout(()=>{
    renderNow(s);
    lastWinnerKey = wk;
    winnerTransitionKey = "";
    const h = $("hero");
    h?.classList.remove("winnerFadeToBlack");
    h?.classList.add("winnerFadeFromBlack");
    setTimeout(()=>h?.classList.remove("winnerFadeFromBlack"), 1700);
  }, 1500);
}

socket.emit("register_viewer");
socket.on("connect",()=>socket.emit("register_viewer"));
socket.on("state",render);
function render(s){
  const wk = winnerKeyForState(s);
  if(!wk){
    lastNonWinnerState = s;
    renderNow(s);
    return;
  }
  if(wk !== lastWinnerKey && wk !== winnerTransitionKey){
    startWinnerTransition(s, wk);
    return;
  }
  if(wk === winnerTransitionKey && wk !== lastWinnerKey) return;
  renderNow(s);
}
function renderNow(s){
  if($("version")) $("version").textContent=`v${s.version}`;
  const hero=$("hero");
  const infoClass = getInfoPhaseClass(s);
  setHeroBaseClass(hero, `viewerHero ${infoClass}`);
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
    title=s.dayVote?.result ? "Dagstemming" : "Dag";
    if(s.dayVote?.result) sub="dit is de uitslag van de open dagstemming";
    else sub=(s.lastDeaths||[]).length ? "deze spelers hebben de avond niet overleefd" : "Het is dag. Het dorp wordt wakker.";
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

  const deathsRoot = $("deaths");
  if(deathsRoot){
    deathsRoot.classList.toggle("winnerOutput", !!s.winner);
    deathsRoot.classList.toggle("dayVoteOutput", !s.winner && s.dayVote?.result && s.phase === "day");
  }

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

  if(s.winner){
    if($("viewerPlayers").children.length) $("viewerPlayers").innerHTML="";
  } else {
    updateViewerPlayers(s);
  }
  fitResponsiveTileGrids();
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
  $(id).innerHTML = rows.length
    ? `<div class="candidateList infoCandidatesCentral">${rows.map((r,i)=>`<div class="candidateCard popCandidate" style="--pop-index:${i}"><h3>${esc(r.name)}</h3></div>`).join("")}</div>`
    : '<p class="muted infoCenterText">Nog geen kandidaten.</p>';
}

function renderMayorVotingHidden(id, voters){
  const total = voters.length || 0;
  const done = voters.filter(v=>v.voted).length;
  $(id).innerHTML = `<div class="infoCenterText"><h3>${done}/${total} spelers hebben gestemd</h3><div class="infoVoters">${voters.map((v,i)=>`<span class="candidatePill ${v.voted?'voted':''}" style="--pop-index:${i}">${esc(v.name)}${v.voted?' ✓':''}</span>`).join("")}</div></div>`;
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
    animateCountUps($(id), reveal, { revealUntil: result.revealUntil, duration: 5000 });
  } else {
    $(id).querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
    $(id).querySelectorAll(".mayorBarFill").forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; });
    reveal();
  }
}


function renderDayVotingHidden(id, voters){
  const total = voters.length || 0;
  const done = voters.filter(v=>v.voted).length;
  $(id).innerHTML = `<div class="infoCenterText"><h3>${done}/${total} spelers hebben gestemd</h3><div class="infoVoters">${voters.map((v,i)=>`<span class="candidatePill ${v.voted?'voted':''}" style="--pop-index:${i}">${esc(v.name)}${v.voted?' ✓':''}</span>`).join("")}</div></div>`;
}

function revealExistingDayVoteResult(id){
  const root = $(id);
  const stage = root?.querySelector(".dayVoteResultStage");
  if(!stage) return;
  const revealUntil = Number(stage.dataset.revealUntil || 0);
  const cardAt = Number(stage.dataset.cardAt || 0);
  const now = Date.now();
  root.querySelectorAll(".countUp").forEach(el=>el.textContent=el.dataset.final||"0");
  root.querySelectorAll(".mayorBarFill").forEach(bar=>{ bar.style.height = `${Number(bar.dataset.height || 10)}%`; bar.style.animation = "none"; });
  if(!revealUntil || now >= revealUntil){
    root.querySelector(".voteFinalText")?.classList.remove("hidden");
    root.querySelectorAll(".willEliminate").forEach(el=>el.classList.add("eliminatedBar"));
    stage.classList.add("revealReady");
  }
  if(!cardAt || now >= cardAt){
    stage.classList.add("cardReady");
    root.querySelector(".dayElimReveal")?.classList.remove("hidden");
  }
}

function renderDayVoteResultCentral(id, result){
  const rows = topVoteRows(result.counts || [], 5);
  const max = Math.max(1, ...rows.map(r=>r.votes||0));
  const finalText = result.eliminatedName
    ? `${result.eliminatedName} is geëlimineerd.`
    : result.tied
      ? `gelijke stand — er komt een herstemming${(result.runoffNames||[]).length ? ` tussen ${runoffText(result.runoffNames)}` : ""}`
      : 'geen speler geëlimineerd';
  const resultKey = JSON.stringify(rows.map(r=>[r.key||r.name,r.votes||0])) + ':' + (result?.eliminatedKey||'') + ':' + (result?.tied?'tie':'');
  const existingStage = $(id).querySelector(".dayVoteResultStage");
  if(existingStage?.dataset?.resultKey === resultKey){
    // Een latere statusupdate, zoals het rood worden van de spelerlijst onderin, mag de reveal niet opnieuw opbouwen of animeren.
    revealExistingDayVoteResult(id);
    fitResponsiveTileGrids();
    return;
  }
  const eliminatedVisual = result.eliminatedName ? deathVisual({ key: result.eliminatedKey, name: result.eliminatedName, roleName: result.eliminatedRoleName, roleArtVariant: result.eliminatedRoleArtVariant, roleEmoji: result.eliminatedRoleEmoji }) : null;
  const revealCard = eliminatedVisual ? `<div class="dayElimReveal hidden"><div class="deathCard deathCardWithArt"><h3>${esc(result.eliminatedName)}</h3>${eliminatedVisual.html}${eliminatedVisual.hasArt ? "" : `<p class="muted">${esc(result.eliminatedRoleName || '')}</p>`}</div></div>` : "";
  const revealUntil = Number(result.revealUntil || 0);
  const cardAt = revealUntil ? revealUntil + 650 : 0;
  $(id).innerHTML = `<div class="dayVoteResultStage ${eliminatedVisual?'hasReveal':''}" data-result-key="${esc(resultKey)}" data-reveal-until="${revealUntil}" data-card-at="${cardAt}"><div class="dayVoteRevealColumn">${revealCard}</div><div class="infoMayorResult dayVoteGraphColumn"><h3 class="voteFinalText hidden">${esc(finalText)}</h3><div class="mayorResultBars dayResultBars">${rows.map((r,i)=>`<div class="mayorResultBar ${result.eliminatedKey===r.key?'willEliminate':''}" data-key="${esc(r.key||'')}" style="--bar-height:${Math.max(10,Math.round(((r.votes||0)/max)*100))}%;--pop-index:${i}"><span class="mayorBarFill" data-height="${Math.max(10,Math.round(((r.votes||0)/max)*100))}"></span><strong>${esc(r.name)}</strong><small class="countUp" data-final="${r.votes||0}">0</small></div>`).join("")}</div></div></div>`;
  const reveal = () => {
    const stage = $(id).querySelector(".dayVoteResultStage");
    $(id).querySelector(".voteFinalText")?.classList.remove("hidden");
    $(id).querySelectorAll(".willEliminate").forEach(el=>el.classList.add("eliminatedBar"));
    stage?.classList.add("revealReady");
    const showCard = () => {
      const currentStage = $(id).querySelector(".dayVoteResultStage");
      currentStage?.classList.add("cardReady");
      $(id).querySelector(".dayElimReveal")?.classList.remove("hidden");
      fitResponsiveTileGrids();
    };
    const delay = Math.max(0, Number(stage?.dataset.cardAt || 0) - Date.now());
    if(delay > 30) setTimeout(showCard, delay); else showCard();
    fitResponsiveTileGrids();
  };
  lastDayResultKey = resultKey;
  animateCountUps($(id), reveal, { revealUntil: result.revealUntil, duration: 5000 });
}

function animateCountUps(root, done, timing={}){
  const els = [...root.querySelectorAll(".countUp")];
  const bars = [...root.querySelectorAll(".mayorBarFill")];
  const finals = els.map(el => Number(el.dataset.final || 0));
  const maxFinal = Math.max(1, ...finals);
  const duration = Number(timing.duration || 5000);
  const revealUntil = Number(timing.revealUntil || 0);
  const startWall = revealUntil ? (revealUntil - duration) : Date.now();
  bars.forEach(bar=>{ bar.style.height = "0%"; bar.style.animation = "none"; bar.style.transform = "none"; });
  function draw(elapsed){
    // Eén globale stem-progressie: alle balken stijgen met dezelfde visuele snelheid per stem.
    // Lage scores stoppen eerder, hoge scores lopen langer door; zo wordt de uitslag minder vroeg verklapt.
    const t = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed) / duration);
    const voteProgress = maxFinal * t;
    els.forEach((el, i)=>{
      const final = finals[i] || 0;
      const visibleVotes = Math.min(final, voteProgress);
      el.textContent = String(t >= 1 || visibleVotes >= final ? final : Math.floor(visibleVotes));
    });
    bars.forEach((bar, i)=>{
      const final = finals[i] || 0;
      const visibleVotes = Math.min(final, voteProgress);
      const height = maxFinal <= 0 ? 0 : (visibleVotes / maxFinal) * 100;
      bar.style.height = `${Math.max(final > 0 && visibleVotes > 0 ? 1 : 0, height)}%`;
    });
  }
  function finish(){
    els.forEach(el=>el.textContent = el.dataset.final || "0");
    bars.forEach((bar, i)=>{
      const final = finals[i] || 0;
      bar.style.height = `${Math.max(final > 0 ? 1 : 0, (final / maxFinal) * 100)}%`;
    });
    if(typeof done === "function") done();
  }
  function frame(){
    const elapsed = Date.now() - startWall;
    if(elapsed >= duration){ finish(); return; }
    draw(elapsed);
    requestAnimationFrame(frame);
  }
  if(Date.now() >= startWall + duration){ finish(); }
  else requestAnimationFrame(frame);
}

function roleArtForName(roleName, seed, variantIndex=null){
  return pickRoleArt(roleName, seed, variantIndex);
}
function winnerPlayerCard(p, defeated=false){
  const src = roleArtForName(p.roleName, p.key || p.name, p.roleArtVariant);
  const visual = src ? `<img class="winnerRoleCard" src="${esc(src)}" alt="${esc(p.roleName || '')}">` : `<span class="emoji winnerEmoji">${esc(p.roleEmoji || '🃏')}</span><p class="muted">${esc(p.roleName || '')}</p>`;
  return `<div class="winnerPlayerCard ${p.alive?'alive':'dead'} ${defeated?'defeated':''}"><h3>${esc(p.name)}</h3>${visual}</div>`;
}
function winnerCardVars(count, defeated=false){
  const n = Math.max(1, Number(count || 1));
  const w = defeated
    ? (n > 18 ? 48 : n > 12 ? 58 : n > 6 ? 74 : 98)
    : (n > 70 ? 38 : n > 55 ? 44 : n > 40 ? 54 : n > 28 ? 64 : n > 18 ? 78 : n > 12 ? 98 : 148);
  const gap = n > 70 ? 3 : n > 50 ? 4 : n > 35 ? 5 : n > 22 ? 7 : n > 12 ? 9 : 14;
  const font = n > 70 ? 7 : n > 55 ? 8 : n > 40 ? 9 : n > 28 ? 10 : n > 18 ? 11 : n > 12 ? 13 : 18;
  let extra = "";
  if(defeated){
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const pad = n > 6 ? 14 : 18;
    const cardH = Math.round(w * 1.58 + Math.max(18, font + 8));
    const panelW = Math.max(150, Math.round((cols * w) + ((cols - 1) * gap) + (pad * 2)));
    const panelH = Math.max(190, Math.round((rows * cardH) + ((rows - 1) * gap) + (pad * 2)));
    extra = `--defeated-cols:${cols};--defeated-panel-w:${panelW}px;--defeated-panel-h:${panelH}px;--defeated-pad:${pad}px;`;
  }
  return `--winner-count:${n};--winner-card-w:${w}px;--winner-card-gap:${gap}px;--winner-name-size:${font}px;${extra}`;
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
  const sectionTitle = s.winner?.team === 'village' ? 'Het Dorp' : (s.winner?.title || 'Einde');
  const mainVars = winnerCardVars(main.length,false);
  const defeatedModule = defeated.length
    ? `<aside class="winnerDefeatedModule" style="${winnerCardVars(defeated.length,true)}"><h4 class="winnerDefeatedHeading">Verslagen wolven</h4><div class="defeatedWolves"><div class="winnerCards small">${defeated.map(p=>winnerPlayerCard(p,true)).join('')}</div></div></aside>`
    : '';
  $(id).innerHTML = `<div class="winnerStage ${defeated.length?'hasDefeated':''}" style="${mainVars}"><section class="winnerVillageSection"><h3>${esc(sectionTitle)}</h3><div class="winnerCards mainWinnerCards">${main.map(p=>winnerPlayerCard(p,false)).join('')}</div></section>${defeatedModule}</div>`;
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
