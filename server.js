const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const VERSION = "0.3.50";
const PORT = process.env.PORT || 3000;
const VOTE_REVEAL_MS = 3000;
const RESULT_REVEAL_FALLBACK_MS = 5000;
const WINNER_REVEAL_FALLBACK_MS = 8000;
const DEATH_REVEAL_FALLBACK_MS = 6000;
const HUNTER_INTRO_FALLBACK_MS = 10000;
const HUNTER_SHOT_FALLBACK_MS = 6200;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/player", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/host", (_req, res) => res.sendFile(path.join(__dirname, "public", "host.html")));
app.get("/viewer", (_req, res) => res.redirect("/info"));
app.get("/info", (_req, res) => res.sendFile(path.join(__dirname, "public", "viewer.html")));

const ROLES = {
  villager: {
    id: "villager",
    name: "Burger",
    short: "Burger",
    group: "Burgers",
    team: "village",
    max: 50,
    emoji: "🟡",
    order: 10,
    desc: "Geen nachtactie. Overleef, praat mee en probeer de weerwolven via discussie en stemming te vinden."
  },
  werewolf: {
    id: "werewolf",
    name: "Weerwolf",
    short: "Wolf",
    group: "Weerwolven",
    team: "wolf",
    wolfLike: true,
    max: 3,
    emoji: "🐺",
    order: 20,
    desc: "Wordt 's nachts samen met de andere wolven wakker en kiest één slachtoffer. Overdag doe je alsof je burger bent."
  },
  infectious_wolf: {
    id: "infectious_wolf",
    name: "Besmettelijke Oerwolf",
    short: "Oerwolf",
    group: "Weerwolven",
    team: "wolf",
    wolfLike: true,
    max: 1,
    emoji: "🩸",
    order: 21,
    desc: "Speelt mee met de wolven. Eén keer per spel kan het wolvenslachtoffer besmet worden in plaats van gedood. Die speler wordt dan wolfachtig en behoudt zijn/haar kracht."
  },
  big_bad_wolf: {
    id: "big_bad_wolf",
    name: "Grote Boze Wolf",
    short: "Grote Wolf",
    group: "Weerwolven",
    team: "wolf",
    wolfLike: true,
    max: 1,
    emoji: "🌕",
    order: 22,
    desc: "Speelt mee met de wolven. Zolang er nog geen wolfachtige speler gestorven is, mag hij 's nachts een extra slachtoffer kiezen."
  },
  white_wolf: {
    id: "white_wolf",
    name: "Witte Weerwolf",
    short: "Witte Wolf",
    group: "Eenlingen",
    team: "solo_white_wolf",
    wolfLike: true,
    max: 1,
    emoji: "🤍",
    order: 23,
    desc: "Wordt met de wolven wakker maar speelt uiteindelijk alleen. Om de nacht mag hij een andere wolfachtige speler uitschakelen."
  },
  cupid: {
    id: "cupid",
    name: "Cupido",
    short: "Cupido",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "💘",
    order: 30,
    desc: "Kiest in de eerste nacht twee geliefden. Als één geliefde sterft, sterft de ander ook."
  },
  seer: {
    id: "seer",
    name: "Ziener",
    short: "Ziener",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "🔮",
    order: 31,
    desc: "Mag elke nacht één speler onderzoeken en krijgt diens rol te zien."
  },
  sister: {
    id: "sister",
    name: "Gezuster",
    short: "Gezuster",
    group: "Burgers",
    team: "village",
    max: 2,
    emoji: "👭",
    order: 32,
    desc: "De twee gezusters herkennen elkaar. Deze rol heeft daarna geen extra nachtactie."
  },
  little_girl: {
    id: "little_girl",
    name: "Onschuldig Meisje",
    short: "Meisje",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "👁️",
    order: 33,
    desc: "Passieve rol. In het fysieke spel mag zij tijdens de wolvenfase voorzichtig gluren. Online is dit vooral een roleplay-/hostrol."
  },
  fox: {
    id: "fox",
    name: "Vos",
    short: "Vos",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "🦊",
    order: 34,
    desc: "Kiest een speler. De app controleert die speler plus de twee buren in zitvolgorde. Zit daar een wolfachtige tussen, dan blijft de kracht. Zo niet, dan verliest de Vos zijn kracht."
  },
  rusty_knight: {
    id: "rusty_knight",
    name: "Ridder met het Roestige Zwaard",
    short: "Ridder",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "⚔️",
    order: 35,
    desc: "Als de wolven hem doden, sterft ook de eerste wolfachtige speler links van hem door het roestige zwaard."
  },
  elder: {
    id: "elder",
    name: "Dorpsoudste",
    short: "Oudste",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "🧓",
    order: 36,
    desc: "Overleeft de eerste aanval van de wolven. Als het dorp hem wegstemt, verliezen de burgers hun speciale krachten."
  },
  witch: {
    id: "witch",
    name: "Heks",
    short: "Heks",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "🧪",
    order: 37,
    desc: "Heeft één levensdrank en één gifdrank. Kan 's nachts één slachtoffer redden en/of één speler vergiftigen. Elk drankje werkt maar één keer."
  },
  bear_tamer: {
    id: "bear_tamer",
    name: "Titus en zijn Dansende Beer",
    short: "Beerleider",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "🐻",
    order: 38,
    desc: "Passieve info voor de host: aan het begin van de dag gromt de beer als een directe buur van Titus wolfachtig is."
  },
  hunter: {
    id: "hunter",
    name: "Jager",
    short: "Jager",
    group: "Burgers",
    team: "village",
    max: 1,
    emoji: "◎",
    order: 39,
    desc: "Als de Jager sterft, mag hij direct nog één levende speler meenemen."
  },
  wild_child: {
    id: "wild_child",
    name: "Wolvenkind",
    short: "Wolvenkind",
    group: "Dubieuzen",
    team: "village",
    max: 1,
    emoji: "🧒",
    order: 40,
    desc: "Kiest in de eerste nacht een rolmodel. Als dat rolmodel sterft, wordt het Wolvenkind wolfachtig."
  },
  wolf_hound: {
    id: "wolf_hound",
    name: "Wolfshond",
    short: "Wolfshond",
    group: "Dubieuzen",
    team: "choice",
    max: 1,
    emoji: "🐕",
    order: 41,
    desc: "Kiest in de eerste nacht definitief: burgerkant of wolfachtige kant."
  },
  piper: {
    id: "piper",
    name: "Fluitspeler",
    short: "Fluitspeler",
    group: "Eenlingen",
    team: "solo_piper",
    max: 1,
    emoji: "🎵",
    order: 50,
    desc: "Kiest elke nacht maximaal twee spelers om te betoveren. Wint alleen als alle andere levende spelers betoverd zijn."
  },
  angel: {
    id: "angel",
    name: "Engel",
    short: "Engel",
    group: "Eenlingen",
    team: "solo_angel",
    max: 1,
    emoji: "🪽",
    order: 51,
    desc: "Probeert heel vroeg uitgeschakeld te worden. Als de Engel in de eerste nacht of eerste stemming sterft, wint hij direct."
  }
};

const DEFAULT_ROLE_COUNTS = {
  villager: 3,
  werewolf: 2,
  seer: 1,
  witch: 1,
  hunter: 1
};

const VILLAGER_CARD_VARIANTS = [1, 2, 3, 4];

function newGame() {
  return {
    lobbyId: uid("lobby"),
    phase: "lobby", // lobby | night | day | mayor | voting | hunter | ended
    round: 0,
    nightNumber: 0,
    dayNumber: 0,
    players: {}, // key -> player
    socketToKey: {},
    selectedRoleCounts: { ...DEFAULT_ROLE_COUNTS },
    started: false,
    currentStep: null,
    nightSteps: [],
    nightLog: [],
    night: null,
    lastDeaths: [],
    recentPublicLog: [],
    mayorElection: { open: false, stage: "idle", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null },
    dayVote: { open: false, votes: {}, selections: {}, result: null, runoffCandidates: null },
    dayAftermath: { active: false, fromNight: false },
    pendingHunter: null,
    pendingContinue: null,
    hunterSequence: null,
    deathReveal: null,
    pendingWinner: null,
    winner: null,
    publicWinnerRevealed: true,
    publicWinnerRevealToken: null,
    publicPhaseBeforeWinner: null,
    specialPowersDisabled: false,
    wolfishEverDied: false,
    hostNote: "",
    createdAt: Date.now()
  };
}

let game = newGame();

function uid(prefix = "p") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36).slice(-4)}`;
}

function sanitizeName(name) {
  let s = String(name || "").trim().replace(/\s+/g, " ");
  if (s.length > 18) s = s.slice(0, 18);
  return s;
}

function roleDef(roleId) {
  return ROLES[roleId] || ROLES.villager;
}

function roleList() {
  return Object.values(ROLES).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function logPublic(text, type = "info") {
  game.recentPublicLog.unshift({ id: uid("log"), text, type, at: Date.now() });
  game.recentPublicLog = game.recentPublicLog.slice(0, 20);
}

function nextAutoName() {
  const used = new Set(Object.values(game.players).map(p => p.name.toLowerCase()));
  for (let i = 1; i < 999; i++) {
    const n = `Speler ${i}`;
    if (!used.has(n.toLowerCase())) return n;
  }
  return `Speler ${Math.floor(Math.random() * 9999)}`;
}

function uniqueName(base, ownKey = null) {
  const cleaned = sanitizeName(base) || nextAutoName();
  const used = new Set(Object.entries(game.players)
    .filter(([key]) => key !== ownKey)
    .map(([, p]) => p.name.toLowerCase()));
  if (!used.has(cleaned.toLowerCase())) return cleaned;
  for (let i = 2; i < 999; i++) {
    const cand = `${cleaned} ${i}`.slice(0, 18);
    if (!used.has(cand.toLowerCase())) return cand;
  }
  return `${cleaned}_${Math.floor(Math.random() * 99)}`.slice(0, 18);
}

function orderedPlayers(includeDead = true) {
  return Object.values(game.players)
    .filter(p => includeDead || p.alive)
    .sort((a, b) => a.seat - b.seat);
}

function alivePlayers() {
  return orderedPlayers(false);
}

function aliveKeys() {
  return alivePlayers().map(p => p.key);
}

function getPlayer(key) {
  return game.players[key] || null;
}

function isAlive(key) {
  const p = getPlayer(key);
  return !!p && p.alive;
}

function isSpecialPowerBlocked(p) {
  if (!p || !p.alive) return true;
  if (!game.specialPowersDisabled) return false;
  return ["seer", "witch", "fox", "cupid", "hunter", "bear_tamer", "sister", "little_girl"].includes(p.roleId);
}

function effectiveTeam(p) {
  if (!p) return "unknown";
  if (p.infected) return "wolf";
  if (p.wolfDogChoice === "wolf") return "wolf";
  if (p.wildChildTurned) return "wolf";
  const def = roleDef(p.roleId);
  if (def.team === "wolf") return "wolf";
  if (def.team === "solo_white_wolf") return "solo_white_wolf";
  if (def.team === "solo_piper") return "solo_piper";
  if (def.team === "solo_angel") return "solo_angel";
  return "village";
}

function isWolfLike(p) {
  if (!p) return false;
  if (p.infected || p.wolfDogChoice === "wolf" || p.wildChildTurned) return true;
  return !!roleDef(p.roleId).wolfLike;
}

function isWolfPackMember(p) {
  if (!p || !p.alive) return false;
  if (effectiveTeam(p) === "wolf") return true;
  // The Witte Weerwolf wakes with the wolves, but has solo win condition.
  if (p.roleId === "white_wolf") return true;
  return false;
}

function displayRoleForHost(p) {
  const def = roleDef(p.roleId);
  const tags = [];
  if (p.infected) tags.push("besmet");
  if (p.wolfDogChoice) tags.push(`wolfshond: ${p.wolfDogChoice === "wolf" ? "wolf" : "burger"}`);
  if (p.wildChildTurned) tags.push("wolvenkind → wolf");
  if (p.loverKey) tags.push(`geliefde: ${game.players[p.loverKey]?.name || "?"}`);
  if (p.enchanted) tags.push("betoverd");
  if (p.isMayor) tags.push("burgemeester");
  return `${def.name}${tags.length ? ` (${tags.join(", ")})` : ""}`;
}

function playerCardIdentity(observer, target, { revealActual = false } = {}) {
  const seerRoleId = observer?.seerKnowledge?.[target?.key] || null;
  const actualVisible = !!target && (revealActual || !target.alive || !!seerRoleId);
  const roleId = actualVisible ? (seerRoleId || target.roleId || "villager") : "villager";
  const def = roleDef(roleId);
  return {
    cardRoleId: roleId,
    cardRoleName: def.name,
    cardRoleEmoji: def.emoji,
    cardRevealed: actualVisible,
    cardVariant: roleId === "villager" ? (target?.cardVariant || 1) : null,
  };
}

function playerTargetOption(observer, target, options = {}) {
  return {
    key: target.key,
    name: target.name,
    alive: target.alive,
    isMayor: target.isMayor,
    enchanted: target.enchanted,
    ...playerCardIdentity(observer, target, options),
  };
}

function targetOptions({ exclude = [], aliveOnly = true, includeSelf = true, onlyWolfLike = false, notWolfPack = false, observer = null, revealActual = false } = {}) {
  const ex = new Set(exclude.filter(Boolean));
  return orderedPlayers(!aliveOnly)
    .filter(p => !aliveOnly || p.alive)
    .filter(p => includeSelf || !ex.has(p.key))
    .filter(p => !ex.has(p.key))
    .filter(p => !onlyWolfLike || isWolfLike(p))
    .filter(p => !notWolfPack || !isWolfPackMember(p))
    .map(p => playerTargetOption(observer, p, { revealActual }));
}

function countSelectedRoles() {
  return Object.values(game.selectedRoleCounts).reduce((a, b) => a + Number(b || 0), 0);
}

function normalizePreassignedRoles() {
  const used = {};
  for (const p of orderedPlayers(true)) {
    const roleId = p.assignedRoleId;
    if (!roleId || !ROLES[roleId] || Number(game.selectedRoleCounts[roleId] || 0) <= Number(used[roleId] || 0)) {
      p.assignedRoleId = null;
      continue;
    }
    used[roleId] = Number(used[roleId] || 0) + 1;
  }
}

function preassignedRoleCounts(excludeKey = null) {
  const counts = {};
  for (const p of orderedPlayers(true)) {
    if (p.key === excludeKey || !p.assignedRoleId) continue;
    counts[p.assignedRoleId] = Number(counts[p.assignedRoleId] || 0) + 1;
  }
  return counts;
}

function syncRoleCountToPlayers() {
  // Bij testen met debugspelers moet het aantal geselecteerde tegels
  // automatisch met het spelersaantal mee kunnen bewegen, anders blijft Start onnodig geblokkeerd.
  const players = orderedPlayers(true).length;
  let total = countSelectedRoles();

  const addOrder = ["villager", "werewolf", "seer", "witch", "hunter", "cupid", "fox", "sister", "little_girl", "rusty_knight", "elder", "bear_tamer", "infectious_wolf", "big_bad_wolf", "wolf_hound", "wild_child", "piper", "angel", "white_wolf"];
  let guard = 0;
  while (total < players && guard++ < 100) {
    const roleId = addOrder.find(id => (game.selectedRoleCounts[id] || 0) < (ROLES[id]?.max || 0));
    if (!roleId) break;
    game.selectedRoleCounts[roleId] = (game.selectedRoleCounts[roleId] || 0) + 1;
    total++;
  }

  const removeOrder = ["villager", "sister", "little_girl", "bear_tamer", "rusty_knight", "elder", "fox", "cupid", "hunter", "witch", "seer", "piper", "angel", "white_wolf", "big_bad_wolf", "infectious_wolf", "wolf_hound", "wild_child", "werewolf"];
  guard = 0;
  while (total > players && guard++ < 100) {
    const roleId = removeOrder.find(id => (game.selectedRoleCounts[id] || 0) > 0);
    if (!roleId) break;
    game.selectedRoleCounts[roleId] -= 1;
    total--;
  }
  normalizePreassignedRoles();
}

function selectedRoleDeck() {
  const deck = [];
  for (const [roleId, count] of Object.entries(game.selectedRoleCounts)) {
    for (let i = 0; i < Number(count || 0); i++) deck.push(roleId);
  }
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resetPlayerForGame(p) {
  p.roleId = null;
  p.cardVariant = null;
  p.alive = true;
  p.infected = false;
  p.wolfDogChoice = null;
  p.wildChildModelKey = null;
  p.wildChildTurned = false;
  p.loverKey = null;
  p.loverHeartPulse = null;
  p.enchanted = false;
  p.isMayor = false;
  p.isCandidate = false;
  p.voteFor = null;
  p.dayVoteFor = null;
  p.witchSaveUsed = false;
  p.witchPoisonUsed = false;
  p.infectUsed = false;
  p.foxPowerLost = false;
  p.elderWolfShieldUsed = false;
  p.seerKnowledge = {};
  p.cupidLoverKeys = [];
  p.foxKnowledge = [];
  p.privateLog = [];
}

function assignBalancedVillagerCards(players) {
  const variants = shuffle(players.map((_, index) => VILLAGER_CARD_VARIANTS[index % VILLAGER_CARD_VARIANTS.length]));
  players.forEach((p, index) => {
    p.cardVariant = variants[index] || VILLAGER_CARD_VARIANTS[0];
  });
}

function persistentLinksForHost(p) {
  const links = [];
  if (p.loverKey) {
    links.push({
      kind: "love",
      icon: "♥",
      label: `Geliefd met ${game.players[p.loverKey]?.name || "onbekend"}`,
    });
  }
  if (p.enchanted) {
    links.push({
      kind: "enchanted",
      icon: "♪",
      label: "Betoverd door de Fluitspeler",
    });
  }
  const witchChoices = [];
  if (game.night?.witchSaveKey) witchChoices.push({ key: game.night.witchSaveKey, kind: "witch-save" });
  if (game.night?.witchPoisonKey) witchChoices.push({ key: game.night.witchPoisonKey, kind: "witch-poison" });
  if (game.currentStep?.kind === "witch") {
    for (const choice of [
      ...Object.values(game.currentStep.previews || {}),
      ...Object.values(game.currentStep.submissions || {}),
    ]) {
      const saveKey = choice?.saveKey || choice?.saveTarget?.key || null;
      const poisonKey = choice?.poisonKey || choice?.poisonTarget?.key || null;
      if (saveKey) witchChoices.push({ key: saveKey, kind: "witch-save" });
      if (poisonKey) witchChoices.push({ key: poisonKey, kind: "witch-poison" });
    }
  }
  if (witchChoices.some(choice => choice.key === p.key && choice.kind === "witch-save")) {
    links.push({
      kind: "witch-save",
      icon: "✚",
      label: "Gekozen voor de levensdrank van de Heks",
    });
  }
  if (witchChoices.some(choice => choice.key === p.key && choice.kind === "witch-poison")) {
    links.push({
      kind: "witch-poison",
      icon: "☠",
      label: "Gekozen voor de gifdrank van de Heks",
    });
  }
  const modeledBy = orderedPlayers(true).filter(q => q.wildChildModelKey === p.key);
  if (modeledBy.length) {
    links.push({
      kind: "role-model",
      icon: "✦",
      label: `Rolmodel van ${modeledBy.map(q => q.name).join(", ")}`,
    });
  }
  return links;
}

function roleInformationForPlayer(p) {
  if (!p?.roleId) return null;
  const role = roleDef(p.roleId);
  const facts = [];

  if (p.roleId === "seer") {
    const people = Object.keys(p.seerKnowledge || {})
      .map(key => game.players[key])
      .filter(Boolean)
      .map(target => playerTargetOption(p, target, { revealActual: true }));
    if (people.length) facts.push({ kind: "people", title: "Bekeken spelers", people });
  }

  if (p.roleId === "piper") {
    const people = orderedPlayers(true)
      .filter(target => target.enchanted && target.key !== p.key)
      .map(target => playerTargetOption(p, target));
    if (people.length) facts.push({ kind: "people", title: "Door jou bespeeld", people });
  }

  if (p.roleId === "cupid" && Array.isArray(p.cupidLoverKeys) && p.cupidLoverKeys.length) {
    const people = p.cupidLoverKeys
      .map(key => game.players[key])
      .filter(Boolean)
      .map(target => playerTargetOption(p, target));
    facts.push({ kind: "people", title: "Door jou gekoppeld", people });
  }

  if (Array.isArray(p.foxKnowledge) && p.foxKnowledge.length) {
    facts.push({
      kind: "texts",
      title: "Onderzoeken",
      texts: p.foxKnowledge.map(item => ({
        title: item.targetName,
        text: item.foundWolfLike
          ? `Rond ${item.targetName} zit minstens één wolfachtige.`
          : `Rond ${item.targetName} zat geen wolfachtige.`,
      })),
    });
  }

  if (p.loverKey && game.players[p.loverKey]) {
    facts.push({
      kind: "people",
      title: "Jouw geliefde",
      people: [playerTargetOption(p, game.players[p.loverKey])],
    });
  }

  return {
    roleId: role.id,
    roleName: role.name,
    objective: role.desc,
    facts,
  };
}

function privateLog(p, text, type = "info") {
  if (!p) return;
  p.privateLog.unshift({ id: uid("priv"), text, type, at: Date.now() });
  p.privateLog = p.privateLog.slice(0, 20);
}

function hostState() {
  return {
    version: VERSION,
    lobbyId: game.lobbyId,
    phase: game.phase,
    round: game.round,
    nightNumber: game.nightNumber,
    dayNumber: game.dayNumber,
    roles: roleList(),
    selectedRoleCounts: game.selectedRoleCounts,
    preassignedRoleCounts: preassignedRoleCounts(),
    selectedRoleTotal: countSelectedRoles(),
    started: game.started,
    currentStep: hostStepView(),
    nightSteps: game.nightSteps.map(step => ({
      id: step.id,
      label: step.label,
      kind: step.kind,
      done: step.done,
      skipped: step.skipped,
      active: game.currentStep?.id === step.id,
      actorKeys: step.actorKeys || [],
      emoji: stepEmoji(step.kind),
    })),
    players: orderedPlayers(true).map(p => ({
      key: p.key,
      name: p.name,
      connected: p.connected,
      alive: p.alive,
      seat: p.seat,
      roleId: p.roleId,
      assignedRoleId: p.assignedRoleId || null,
      assignedRoleName: p.assignedRoleId ? roleDef(p.assignedRoleId).name : "Geen rol",
      roleName: p.roleId ? roleDef(p.roleId).name : "Nog geen rol",
      roleEmoji: p.roleId ? roleDef(p.roleId).emoji : "❔",
      roleSummary: p.roleId ? displayRoleForHost(p) : "Nog geen rol",
      cardVariant: p.cardVariant || null,
      persistentLinks: persistentLinksForHost(p),
      team: effectiveTeam(p),
      wolfLike: isWolfLike(p),
      isMayor: p.isMayor,
      isCandidate: p.isCandidate,
      mayorVoteFor: p.voteFor,
      dayVoteFor: p.dayVoteFor,
      loverKey: p.loverKey,
      enchanted: p.enchanted,
      infected: p.infected,
      wolfDogChoice: p.wolfDogChoice,
      wildChildModelKey: p.wildChildModelKey,
      wildChildTurned: p.wildChildTurned,
      witchSaveUsed: p.witchSaveUsed,
      witchPoisonUsed: p.witchPoisonUsed,
      infectUsed: p.infectUsed,
      foxPowerLost: p.foxPowerLost,
      elderWolfShieldUsed: p.elderWolfShieldUsed,
      isBot: !!p.isBot,
    })),
    aliveCount: alivePlayers().length,
    mayorElection: mayorElectionView(),
    dayVote: dayVoteView(),
    dayAftermath: game.dayAftermath || { active: false, fromNight: false },
    lastDeaths: game.lastDeaths,
    hunterSequence: hunterSequenceView({ forHost: true }),
    deathReveal: game.deathReveal,
    recentPublicLog: game.recentPublicLog,
    winner: game.winner,
    pendingWinner: game.pendingWinner,
    specialPowersDisabled: game.specialPowersDisabled,
    wolfishEverDied: game.wolfishEverDied,
    hostNote: "",
  };
}

function resultIsPublic(result) {
  return !result || result.publicRevealed !== false;
}

function pendingVoteDeathKeys() {
  if (!game.dayVote?.result || resultIsPublic(game.dayVote.result)) return new Set();
  const primaryKey = game.dayVote.result.eliminatedKey;
  const keys = new Set(primaryKey ? [primaryKey] : []);
  for (const death of game.lastDeaths || []) {
    if (death.cause === "love" && death.linkedToKey === primaryKey) keys.add(death.key);
  }
  return keys;
}

function activeDeathRevealKeys() {
  if (!game.deathReveal || game.deathReveal.publicRevealed !== false) return new Set();
  return new Set((game.deathReveal.pendingKeys || []).filter(Boolean));
}

function pendingPublicDeathKeys() {
  return new Set([...pendingVoteDeathKeys(), ...activeDeathRevealKeys()]);
}

function hunterSequenceView({ forHost = false, forViewer = false } = {}) {
  const sequence = game.hunterSequence;
  if (!sequence) return null;
  const hunter = game.players[sequence.hunterKey] || null;
  const hunterDeath = (game.lastDeaths || []).find(d => d.key === sequence.hunterKey) || null;
  const shotDeaths = (sequence.shotDeathKeys || [])
    .map(key => (game.lastDeaths || []).find(d => d.key === key))
    .filter(Boolean);
  return {
    stage: sequence.stage,
    source: sequence.source,
    hunterKey: sequence.hunterKey,
    hunterName: hunter?.name || hunterDeath?.name || "De Jager",
    hunterDeath,
    autoAdvanceAt: sequence.stage === "announcement" ? sequence.autoAdvanceAt || null : null,
    introToken: forViewer ? sequence.introToken : null,
    shotToken: forViewer ? sequence.shotToken : null,
    shotDeaths: (forHost || forViewer || sequence.stage === "summary") ? shotDeaths : [],
    allDeaths: (forHost || forViewer || sequence.stage === "summary") ? (game.lastDeaths || []) : [],
  };
}

function publicState({ forViewer = false } = {}) {
  const publicWinnerVisible = !game.winner || forViewer || game.publicWinnerRevealed;
  const publicPhase = game.winner && !publicWinnerVisible ? (game.publicPhaseBeforeWinner || "day") : game.phase;
  const voteRevealPending = !!game.dayVote?.result && !resultIsPublic(game.dayVote.result);
  const pendingDeathKeys = pendingPublicDeathKeys();
  const publicPlayers = orderedPlayers(true).map(p => ({
    key: p.key,
    name: p.name,
    connected: p.connected,
    alive: pendingDeathKeys.has(p.key) && !forViewer ? true : p.alive,
    seat: p.seat,
    isMayor: p.isMayor,
    isCandidate: p.isCandidate,
    enchanted: p.enchanted,
    cardVariant: p.cardVariant || null,
    isBot: !!p.isBot,
    roleName: publicWinnerVisible && (game.phase === "ended" || game.winner) && p.roleId ? roleDef(p.roleId).name : null,
    roleEmoji: publicWinnerVisible && (game.phase === "ended" || game.winner) && p.roleId ? roleDef(p.roleId).emoji : null,
    wolfLike: publicWinnerVisible && (game.phase === "ended" || game.winner) ? isWolfLike(p) : false,
    team: publicWinnerVisible && (game.phase === "ended" || game.winner) ? effectiveTeam(p) : null,
  }));
  return {
    version: VERSION,
    lobbyId: game.lobbyId,
    phase: publicPhase,
    round: game.round,
    nightNumber: game.nightNumber,
    dayNumber: game.dayNumber,
    started: game.started,
    players: publicPlayers,
    aliveCount: publicPlayers.filter(p => p.alive).length,
    mayorElection: forViewer ? publicMayorElectionView() : playerMayorElectionView(null),
    dayVote: forViewer ? publicDayVoteView() : playerDayVoteView(null),
    dayAftermath: game.dayAftermath || { active: false, fromNight: false },
    lastDeaths: !forViewer && pendingDeathKeys.size ? (game.lastDeaths || []).filter(d => !pendingDeathKeys.has(d.key)) : game.lastDeaths,
    aftermathActive: ["day", "mayor", "voting", "hunter"].includes(game.phase) && Array.isArray(game.lastDeaths) && game.lastDeaths.length > 0,
    deathRevealToken: forViewer && game.deathReveal?.publicRevealed === false ? game.deathReveal.token : null,
    deathPublicRevealed: !game.deathReveal || game.deathReveal.publicRevealed !== false,
    hunterSequence: hunterSequenceView({ forViewer }),
    recentPublicLog: game.recentPublicLog.slice(0, 8),
    currentPublicMoment: publicMoment(),
    winner: publicWinnerVisible ? game.winner : null,
    winnerRevealToken: forViewer && game.winner && !game.publicWinnerRevealed ? game.publicWinnerRevealToken : null,
    winnerPublicRevealed: !game.winner || game.publicWinnerRevealed,
    hostNote: "",
  };
}


function publicMayorElectionView() {
  const view = mayorElectionView();
  if (view.stage === "voting") {
    return {
      ...view,
      candidates: view.candidates.map(c => ({ ...c, votes: 0 })),
      votes: {},
      selections: {},
      voters: view.voters.map(v => ({ key: v.key, name: v.name, voted: v.voted, selected: v.voted }))
    };
  }
  return view;
}

function playerMayorElectionView(selfKey) {
  const view = mayorElectionView(selfKey);
  if (view.stage === "voting") {
    return {
      ...view,
      candidates: view.candidates.map(c => ({ ...c, votes: 0 })),
      liveCounts: [],
      votes: {},
      selections: {},
      voters: view.voters.map(v => ({ key: v.key, name: v.name, voted: v.voted, selected: v.voted })),
    };
  }
  if (view.stage !== "result" || resultIsPublic(view.result)) return view;
  return {
    ...view,
    candidates: view.candidates.map(c => ({ ...c, votes: 0 })),
    liveCounts: [],
    votes: {},
    selections: {},
    result: {
      revealStartedAt: view.result.revealStartedAt,
      revealUntil: view.result.revealUntil,
      revealDurationMs: view.result.revealDurationMs,
      revealed: false,
    },
  };
}

function publicMoment() {
  if (game.phase === "lobby") return "Lobby";
  if (game.phase === "night") return "De nacht valt over het dorp.";
  if (game.phase === "day") return "Het dorp wordt wakker.";
  if (game.phase === "mayor") return "Burgemeesterverkiezing";
  if (game.phase === "voting") return "Dagstemming";
  if (game.phase === "hunter") return "De Jager neemt nog iemand mee...";
  if (game.phase === "ended") return game.winner?.title || "Einde van het spel";
  return "";
}

function playerState(p) {
  const publicWinnerVisible = !game.winner || game.publicWinnerRevealed;
  const voteRevealPending = !!game.dayVote?.result && !resultIsPublic(game.dayVote.result);
  const mayorRevealPending = !!game.mayorElection?.result && !resultIsPublic(game.mayorElection.result);
  const pendingDeathKeys = pendingPublicDeathKeys();
  const role = p.roleId ? roleDef(p.roleId) : null;
  return {
    version: VERSION,
    lobbyId: game.lobbyId,
    selfKey: p.key,
    phase: game.winner && !publicWinnerVisible ? (game.publicPhaseBeforeWinner || "day") : game.phase,
    round: game.round,
    nightNumber: game.nightNumber,
    dayNumber: game.dayNumber,
    started: game.started,
    me: {
      key: p.key,
      name: p.name,
      alive: pendingDeathKeys.has(p.key) ? true : p.alive,
      connected: p.connected,
      role,
      roleId: p.roleId,
      cardVariant: p.cardVariant || null,
      team: effectiveTeam(p),
      wolfLike: isWolfLike(p),
      infected: p.infected,
      wolfDogChoice: p.wolfDogChoice,
      wildChildModelKey: p.wildChildModelKey,
      wildChildTurned: p.wildChildTurned,
      loverKey: p.loverKey,
      loverName: p.loverKey ? game.players[p.loverKey]?.name : null,
      loverHeartPulse: p.loverHeartPulse && Number(p.loverHeartPulse.until || 0) > Date.now()
        ? { ...p.loverHeartPulse }
        : null,
      enchanted: p.enchanted,
      isMayor: mayorRevealPending ? false : p.isMayor,
      isCandidate: p.isCandidate,
      witchSaveUsed: p.witchSaveUsed,
      witchPoisonUsed: p.witchPoisonUsed,
      infectUsed: p.infectUsed,
      foxPowerLost: p.foxPowerLost,
    },
    players: orderedPlayers(true).map(q => ({
      ...playerTargetOption(p, q),
      alive: pendingDeathKeys.has(q.key) ? true : q.alive,
      connected: q.connected,
      isMayor: mayorRevealPending ? false : q.isMayor,
      isCandidate: q.isCandidate,
      seat: q.seat,
      isBot: !!q.isBot,
    })),
    action: actionForPlayer(p),
    roleInfo: roleInformationForPlayer(p),
    mayorElection: playerMayorElectionView(p.key),
    dayVote: playerDayVoteView(p.key),
    dayAftermath: game.dayAftermath || { active: false, fromNight: false },
    lastDeaths: pendingDeathKeys.size ? (game.lastDeaths || []).filter(d => !pendingDeathKeys.has(d.key)) : game.lastDeaths,
    publicDeathPending: pendingDeathKeys.size > 0,
    hunterSequence: game.hunterSequence ? { stage: game.hunterSequence.stage, hunterKey: game.hunterSequence.hunterKey } : null,
    privateLog: p.privateLog || [],
    recentPublicLog: game.recentPublicLog.slice(0, 8),
    winner: publicWinnerVisible ? game.winner : null,
    hostNote: "",
  };
}


function currentMayorCandidates() {
  let candidates = alivePlayers().filter(p => p.isCandidate);
  const runoff = Array.isArray(game.mayorElection?.runoffCandidates) ? game.mayorElection.runoffCandidates : null;
  if (game.mayorElection?.stage === "voting" && runoff && runoff.length) {
    const allowed = new Set(runoff);
    candidates = candidates.filter(p => allowed.has(p.key));
  }
  return candidates;
}

function currentDayVoteTargets() {
  let targets = alivePlayers();
  const runoff = Array.isArray(game.dayVote?.runoffCandidates) ? game.dayVote.runoffCandidates : null;
  if (game.dayVote?.open && runoff && runoff.length) {
    const allowed = new Set(runoff);
    targets = targets.filter(p => allowed.has(p.key));
  }
  return targets;
}

function runoffText(names) {
  const list = (names || []).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} en ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} en ${list[list.length - 1]}`;
}

function mayorElectionView(selfKey = null) {
  const votes = game.mayorElection.votes || {};
  const selections = game.mayorElection.selections || {};
  const stage = game.mayorElection.stage || (game.mayorElection.open ? "voting" : "idle");
  const candidates = currentMayorCandidates().map(p => ({ key: p.key, name: p.name, votes: 0 }));
  const byKey = new Map(candidates.map(c => [c.key, c]));
  for (const targetKey of Object.values(votes)) {
    if (byKey.has(targetKey)) byKey.get(targetKey).votes += 1;
  }
  candidates.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const voters = alivePlayers().map(p => {
    const confirmedTargetKey = votes[p.key] || null;
    const selectedTargetKey = confirmedTargetKey || selections[p.key] || null;
    return {
      key: p.key,
      name: p.name,
      voted: !!confirmedTargetKey,
      selected: !!selectedTargetKey,
      targetKey: selectedTargetKey,
      targetName: selectedTargetKey ? game.players[selectedTargetKey]?.name || null : null,
      confirmedTargetKey,
      confirmedTargetName: confirmedTargetKey ? game.players[confirmedTargetKey]?.name || null : null,
    };
  });
  const responses = game.mayorElection.responses || {};
  const candidateResponses = alivePlayers().map(p => ({ key: p.key, name: p.name, response: responses[p.key] || (p.isCandidate ? "yes" : null), candidate: !!p.isCandidate }));
  const liveCounts = candidates.map(c => ({ ...c, votes: 0 }));
  const liveByKey = new Map(liveCounts.map(c => [c.key, c]));
  for (const voter of voters) {
    const targetKey = voter.confirmedTargetKey || voter.targetKey;
    if (targetKey && liveByKey.has(targetKey)) liveByKey.get(targetKey).votes += 1;
  }
  liveCounts.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  return {
    open: game.mayorElection.open,
    stage,
    candidates,
    votes,
    selections,
    voters,
    candidateResponses,
    liveCounts,
    responses,
    result: game.mayorElection.result || null,
    runoffCandidates: game.mayorElection.runoffCandidates || null,
    selfVote: selfKey ? votes[selfKey] || null : null,
  };
}

function dayVoteView(selfKey = null) {
  const votes = game.dayVote.votes || {};
  const selections = game.dayVote.selections || {};
  const counts = currentDayVoteTargets().map(p => ({ key: p.key, name: p.name, votes: 0 }));
  const byKey = new Map(counts.map(c => [c.key, c]));
  for (const [voterKey, targetKey] of Object.entries(votes)) {
    const voter = game.players[voterKey];
    const weight = voter?.isMayor ? 2 : 1;
    if (byKey.has(targetKey)) byKey.get(targetKey).votes += weight;
  }
  counts.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const voters = alivePlayers().map(p => {
      const confirmedTargetKey = votes[p.key] || null;
      const selectedTargetKey = confirmedTargetKey || selections[p.key] || null;
      return {
        key: p.key,
        name: p.name,
        voted: !!confirmedTargetKey,
        selected: !!selectedTargetKey,
        targetKey: selectedTargetKey,
        targetName: selectedTargetKey ? game.players[selectedTargetKey]?.name || null : null,
        confirmedTargetKey,
        confirmedTargetName: confirmedTargetKey ? game.players[confirmedTargetKey]?.name || null : null,
      };
    });
  const liveCounts = currentDayVoteTargets().map(p => ({ key: p.key, name: p.name, votes: 0 }));
  const liveByKey = new Map(liveCounts.map(c => [c.key, c]));
  for (const voter of voters) {
    const targetKey = voter.confirmedTargetKey || voter.targetKey;
    const sourcePlayer = game.players[voter.key];
    const weight = sourcePlayer?.isMayor ? 2 : 1;
    if (targetKey && liveByKey.has(targetKey)) liveByKey.get(targetKey).votes += weight;
  }
  liveCounts.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  return {
    open: game.dayVote.open,
    counts,
    liveCounts,
    votes,
    selections,
    result: game.dayVote.result || null,
    runoffCandidates: game.dayVote.runoffCandidates || null,
    voters,
    selfVote: selfKey ? votes[selfKey] || null : null,
  };
}

function publicDayVoteView() {
  const view = dayVoteView();
  if (view.open) {
    return {
      ...view,
      counts: view.counts.map(c => ({ ...c, votes: 0 })),
      liveCounts: view.liveCounts ? view.liveCounts.map(c => ({ ...c, votes: 0 })) : [],
      votes: {},
      selections: {},
      voters: view.voters.map(v => ({ key: v.key, name: v.name, voted: v.voted, selected: v.voted })),
      result: null,
    };
  }
  return view;
}

function playerDayVoteView(selfKey) {
  const view = dayVoteView(selfKey);
  if (view.open) {
    return {
      ...view,
      counts: view.counts.map(c => ({ ...c, votes: 0 })),
      liveCounts: [],
      votes: {},
      selections: {},
      voters: view.voters.map(v => ({ key: v.key, name: v.name, voted: v.voted, selected: v.voted })),
      result: null,
    };
  }
  const revealPending = !!view.result && !resultIsPublic(view.result);
  if (!revealPending) return view;
  return {
    open: false,
    counts: [],
    liveCounts: [],
    votes: {},
    selections: {},
    voters: [],
    runoffCandidates: null,
    selfVote: view.selfVote,
    result: {
      revealStartedAt: view.result.revealStartedAt,
      revealUntil: view.result.revealUntil,
      revealDurationMs: view.result.revealDurationMs,
      revealed: false,
      eliminatedKey: view.result.eliminatedKey === selfKey ? selfKey : null,
    },
  };
}


function livingMayor() {
  return alivePlayers().find(p => p.isMayor) || null;
}

function randomChoice(items) {
  if (!items || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function weightedBotChoice(preferred, fallback, preferChance = 0.75) {
  const preferredList = (preferred || []).filter(Boolean);
  const fallbackList = (fallback || []).filter(Boolean);
  if (preferredList.length && (Math.random() < preferChance || !fallbackList.length)) return randomChoice(preferredList);
  return randomChoice(fallbackList.length ? fallbackList : preferredList);
}

function botCandidatePhaseAuto() {
  if (!game.started || game.phase !== "mayor" || game.mayorElection?.stage !== "candidates") return;
  const alive = alivePlayers();
  const bots = alive.filter(p => p.isBot);
  game.mayorElection.responses = game.mayorElection.responses || {};
  for (const p of bots) {
    if (game.mayorElection.responses[p.key]) continue;
    const team = effectiveTeam(p);
    // Test-AI: wolven stellen zich iets vaker kandidaat, burgers soms. Niet te slim/perfect.
    const chance = team === "wolf" ? 0.45 : 0.30;
    const wantsCandidate = Math.random() < chance;
    p.isCandidate = wantsCandidate;
    game.mayorElection.responses[p.key] = wantsCandidate ? "yes" : "no";
  }
  // Bij een volledig debugspel is minstens één kandidaat handig, anders kan de flow vastlopen.
  if (!alive.some(p => p.isCandidate) && bots.length) {
    const forced = randomChoice(bots);
    if (forced) { forced.isCandidate = true; game.mayorElection.responses[forced.key] = "yes"; }
  }
  maybeAutoStartMayorVote();
}

function maybeAutoStartMayorVote() {
  if (!game.started || game.phase !== "mayor" || game.mayorElection?.stage !== "candidates") return false;
  const alive = alivePlayers();
  const responses = game.mayorElection.responses || {};
  const everybodyResponded = alive.length > 0 && alive.every(p => !!responses[p.key]);
  const candidates = alive.filter(p => p.isCandidate);
  if (everybodyResponded && candidates.length > 0) {
    startMayorVoting();
    return true;
  }
  return false;
}

function botMayorVotingAuto() {
  if (!game.started || game.phase !== "mayor" || game.mayorElection?.stage !== "voting") return;
  const candidates = currentMayorCandidates();
  for (const voter of alivePlayers().filter(p => p.isBot)) {
    const options = candidates.filter(c => c.key !== voter.key);
    if (!options.length || game.mayorElection.votes[voter.key]) continue;
    let pickTarget;
    if (effectiveTeam(voter) === "wolf") {
      pickTarget = weightedBotChoice(options.filter(c => effectiveTeam(c) === "wolf"), options, 0.85);
    } else {
      pickTarget = weightedBotChoice(options.filter(c => effectiveTeam(c) !== "wolf"), options, 0.75);
    }
    if (pickTarget) {
      game.mayorElection.votes[voter.key] = pickTarget.key;
      voter.voteFor = pickTarget.key;
    }
  }
}

function botDayVotingAuto() {
  if (!game.started || game.phase !== "voting" || !game.dayVote?.open) return;
  const alive = alivePlayers();
  const targets = currentDayVoteTargets();
  for (const voter of alive.filter(p => p.isBot)) {
    if (game.dayVote.votes[voter.key]) continue;
    const options = targets.filter(p => p.key !== voter.key);
    if (!options.length) continue;
    let pickTarget;
    if (effectiveTeam(voter) === "wolf") {
      // Wolven stemmen liever niet op wolven en kiezen willekeurig uit dorp/solo's.
      pickTarget = weightedBotChoice(options.filter(p => effectiveTeam(p) !== "wolf"), options, 0.92);
    } else {
      // Dorpelingen maken een simpele, testgerichte keuze: soms raak op wolfachtig, anders random.
      pickTarget = weightedBotChoice(options.filter(p => isWolfLike(p)), options, 0.55);
    }
    if (pickTarget) {
      game.dayVote.votes[voter.key] = pickTarget.key;
      voter.dayVoteFor = pickTarget.key;
    }
  }
}

function autoSubmitBotSocialPhase() {
  botCandidatePhaseAuto();
  botMayorVotingAuto();
  botDayVotingAuto();
}

function mayorVotingEligiblePlayers() {
  const candidates = currentMayorCandidates();
  return alivePlayers().filter(voter => candidates.some(c => c.key !== voter.key));
}

function markMissingMayorCandidateResponsesAsNo() {
  if (!game.mayorElection?.open || game.mayorElection.stage !== "candidates") return;
  game.mayorElection.responses = game.mayorElection.responses || {};
  for (const p of alivePlayers()) {
    if (!game.mayorElection.responses[p.key]) {
      p.isCandidate = false;
      game.mayorElection.responses[p.key] = "no";
    }
  }
}

function dayVotingEligiblePlayers() {
  const targets = currentDayVoteTargets();
  return alivePlayers().filter(voter => targets.some(target => target.key !== voter.key));
}

function fillMissingMayorVotesRandom() {
  if (!game.mayorElection?.open || game.mayorElection.stage !== "voting") return;
  const candidates = currentMayorCandidates();
  for (const voter of mayorVotingEligiblePlayers()) {
    if (game.mayorElection.votes[voter.key]) continue;
    const options = candidates.filter(c => c.key !== voter.key);
    const picked = randomChoice(options);
    if (picked) {
      game.mayorElection.votes[voter.key] = picked.key;
      game.mayorElection.selections[voter.key] = picked.key;
      voter.voteFor = picked.key;
    }
  }
}

function fillMissingDayVotesRandom() {
  if (!game.dayVote?.open) return;
  const targets = currentDayVoteTargets();
  for (const voter of dayVotingEligiblePlayers()) {
    if (game.dayVote.votes[voter.key]) continue;
    const options = targets.filter(target => target.key !== voter.key);
    const picked = randomChoice(options);
    if (picked) {
      game.dayVote.votes[voter.key] = picked.key;
      game.dayVote.selections[voter.key] = picked.key;
      voter.dayVoteFor = picked.key;
    }
  }
}

function maybeAutoCloseMayorVoteIfComplete() {
  if (!game.started || game.phase !== "mayor" || !game.mayorElection?.open || game.mayorElection.stage !== "voting") return false;
  const eligible = mayorVotingEligiblePlayers();
  if (eligible.length > 0 && eligible.every(p => !!game.mayorElection.votes[p.key])) {
    closeMayorElection({ fillMissing: false });
    return true;
  }
  return false;
}

function maybeAutoCloseDayVoteIfComplete() {
  if (!game.started || game.phase !== "voting" || !game.dayVote?.open) return false;
  const eligible = dayVotingEligiblePlayers();
  if (eligible.length > 0 && eligible.every(p => !!game.dayVote.votes[p.key])) {
    closeDayVote({ fillMissing: false });
    return true;
  }
  return false;
}

function openDayVoteAuto(reason = "") {
  if (!game.started || game.phase === "ended") return;
  game.phase = "voting";
  game.dayAftermath = { active: false, fromNight: false };
  const runoffCandidates = game.dayVote?.result?.runoffPending ? (game.dayVote.result.runoffCandidates || []) : null;
  game.dayVote = { open: true, votes: {}, selections: {}, result: null, runoffCandidates };
  for (const p of Object.values(game.players)) p.dayVoteFor = null;
  autoSubmitBotSocialPhase();
  maybeAutoCloseDayVoteIfComplete();
  logPublic(reason || "De dagstemming is geopend.", "vote");
}

function beginDayFlow({ fromNight = false } = {}) {
  if (!game.started || game.phase === "ended") return;
  if (fromNight) game.dayNumber += 1;
  game.phase = "day";
  game.currentStep = null;
  game.hostNote = bearGrowlNote();
  game.dayVote = { open: false, votes: {}, selections: {}, result: null, runoffCandidates: null };
  game.mayorElection = { open: false, stage: "idle", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null };
  // Eerst altijd het Dag/aftermath-moment tonen op het Infoscherm.
  // Daarna klikt de host door naar burgemeesterverkiezing of dagstemming.
  game.dayAftermath = { active: !!fromNight, fromNight: !!fromNight };
  logPublic("Het wordt dag.", "phase");
}

function hostStepView() {
  const step = game.currentStep;
  if (!step) return null;
  const actors = (step.actorKeys || []).map(k => game.players[k]).filter(Boolean);
  const submitted = step.submissions || {};
  const expectedCount = step.kind === "wolves" ? actors.filter(p => !p.isBot).length : actors.filter(p => !p.isBot).length;
  return {
    id: step.id,
    kind: step.kind,
    label: step.label,
    help: step.help,
    actorKeys: step.actorKeys || [],
    actors: actors.map(p => ({
      key: p.key,
      name: p.name,
      roleName: roleDef(p.roleId).name,
      alive: p.alive,
      isBot: !!p.isBot,
      cardRoleId: "villager",
      cardRoleName: "Burger",
      cardVariant: p.cardVariant || null,
    })),
    submissionCount: step.kind === "wolves" ? Object.keys(game.night?.wolfConfirms || {}).length : Object.keys(submitted).length,
    expectedCount,
    ready: isStepReady(step),
    submissions: submitted,
    previews: step.previews || {},
    wolfConsensus: step.kind === "wolves" ? wolfConsensusView(step) : null,
    nightPreview: nightPreview(),
  };
}

function isStepReady(step) {
  if (!step) return true;
  // Betoverden bekijken elkaar alleen. Deze pagina wordt bewust door de Host
  // doorgeklikt en vraagt geen individuele "Klaar"-bevestigingen.
  if (step.kind === "enchanted_info") return true;
  const actors = (step.actorKeys || []).map(k => game.players[k]).filter(Boolean).filter(p => p.alive);
  if (step.kind === "wolves") return wolfConsensusReady(step);
  const humanActors = actors.filter(p => !p.isBot);
  return humanActors.length === 0 || humanActors.every(p => step.submissions[p.key]);
}

function wolfConsensusView(step = game.currentStep) {
  const actorKeys = (step?.actorKeys || []).filter(k => isAlive(k));
  const selections = game.night?.wolfSelections || {};
  const confirms = game.night?.wolfConfirms || {};
  const rows = actorKeys.map((key, idx) => {
    const wolf = game.players[key];
    const targetKey = selections[key] || null;
    return {
      key,
      name: wolf?.name || key,
      marker: idx + 1,
      colorIndex: idx % 6,
      targetKey,
      targetName: targetKey ? game.players[targetKey]?.name || "?" : null,
      confirmed: !!confirms[key],
      isBot: !!wolf?.isBot,
    };
  });
  const confirmedRows = rows.filter(r => r.confirmed && r.targetKey);
  const consensusTargetKey = confirmedRows.length ? confirmedRows[0].targetKey : null;
  const allConfirmedSame = rows.length > 0 && rows.every(r => r.confirmed && r.targetKey && r.targetKey === consensusTargetKey);
  const locked = !!game.night?.wolfLocked;
  const lockedTargetKey = game.night?.wolfLockedTargetKey || (locked ? game.night?.wolfVictimKey : null);
  return {
    rows,
    allConfirmedSame,
    consensusTargetKey: allConfirmedSame ? consensusTargetKey : (locked ? lockedTargetKey : null),
    consensusTargetName: allConfirmedSame ? game.players[consensusTargetKey]?.name || "?" : (lockedTargetKey ? game.players[lockedTargetKey]?.name || "?" : null),
    locked,
    lockedTargetKey,
  };
}

function wolfConsensusReady(step) {
  return wolfConsensusView(step).allConfirmedSame;
}

function nightPreview() {
  if (!game.night) return null;
  return {
    wolfVictimKey: game.night.wolfVictimKey,
    bigBadVictimKey: game.night.bigBadVictimKey,
    whiteWolfVictimKey: game.night.whiteWolfVictimKey,
    witchSaveKey: game.night.witchSaveKey,
    witchPoisonKey: game.night.witchPoisonKey,
    infectedKey: game.night.infectedKey,
    piperTargets: game.night.piperTargets,
    foxResult: game.night.foxResult,
  };
}

function emitAll() {
  io.to("host").emit("host_state", hostState());
  io.to("viewer").emit("state", publicState({ forViewer: true }));
  // Players also get a public state fallback plus a private state.
  io.to("player").emit("state", publicState());
  for (const p of Object.values(game.players)) {
    if (p.socketId) io.to(p.socketId).emit("player_state", playerState(p));
  }
}

function stepEmoji(kind) {
  return ({
    wolf_hound: "🐕", wild_child: "🧒", cupid: "💘", lovers_info: "💞", seer: "🔮", sisters_info: "👭",
    wolves: "🐺", infectious_wolf: "🩸", big_bad_wolf: "🌕", white_wolf: "🤍", witch: "🧪", fox: "🦊",
    piper: "🎵", enchanted_info: "✨"
  })[kind] || "🃏";
}

function makeStep(kind, label, actorKeys, help = "") {
  return {
    id: uid(`step_${kind}`),
    kind,
    label,
    actorKeys: actorKeys.filter(k => isAlive(k)),
    help,
    submissions: {},
    previews: {},
    done: false,
    skipped: false,
  };
}

function playersByRole(roleId) {
  return alivePlayers().filter(p => p.roleId === roleId && !isSpecialPowerBlocked(p));
}

function buildNightSteps() {
  const n = game.nightNumber;
  const steps = [];

  if (n === 1) {
    steps.push(makeStep("wolf_hound", "Wolfshond kiest kant", playersByRole("wolf_hound").filter(p => !p.wolfDogChoice).map(p => p.key), "Kiest definitief burger of wolf."));
    steps.push(makeStep("wild_child", "Wolvenkind kiest rolmodel", playersByRole("wild_child").filter(p => !p.wildChildModelKey).map(p => p.key), "Kiest een rolmodel. Als dat rolmodel sterft, wordt het Wolvenkind wolfachtig."));
    steps.push(makeStep("cupid", "Cupido kiest geliefden", playersByRole("cupid").map(p => p.key), "Kies twee spelers die geliefden worden."));
  }

  const lovers = alivePlayers().filter(p => p.loverKey).map(p => p.key);
  if (n === 1 && lovers.length) steps.push(makeStep("lovers_info", "Geliefden zien elkaar", lovers, "Geliefden krijgen elkaars naam te zien."));

  steps.push(makeStep("seer", "Ziener onderzoekt", playersByRole("seer").map(p => p.key), "Kies één speler om diens rol te bekijken."));

  const sisters = playersByRole("sister").map(p => p.key);
  if (sisters.length >= 2) steps.push(makeStep("sisters_info", "Gezusters herkennen elkaar", sisters, "De gezusters zien wie de andere gezuster is."));

  steps.push(makeStep("wolves", "Weerwolven kiezen slachtoffer", alivePlayers().filter(isWolfPackMember).map(p => p.key), ""));
  steps.push(makeStep("infectious_wolf", "Besmettelijke Oerwolf beslist over besmetting", playersByRole("infectious_wolf").filter(p => !p.infectUsed).map(p => p.key), "Kan één keer het wolvenslachtoffer besmetten in plaats van doden."));

  const bigBadActors = playersByRole("big_bad_wolf").filter(() => !game.wolfishEverDied).map(p => p.key);
  steps.push(makeStep("big_bad_wolf", "Grote Boze Wolf kiest extra slachtoffer", bigBadActors, "Mag een extra slachtoffer kiezen zolang er nog geen wolfachtige speler gestorven is."));

  const whiteActors = playersByRole("white_wolf").filter(() => n % 2 === 0).map(p => p.key);
  steps.push(makeStep("white_wolf", "Witte Weerwolf slaat toe", whiteActors, "Om de nacht mag de Witte Weerwolf een wolfachtige speler uitschakelen."));

  steps.push(makeStep(
    "witch",
    "Heks gebruikt drankjes",
    playersByRole("witch").filter(p => !p.witchSaveUsed || !p.witchPoisonUsed).map(p => p.key),
    "Kan één slachtoffer redden en/of één speler vergiftigen."
  ));
  steps.push(makeStep("fox", "Vos speurt", playersByRole("fox").filter(p => !p.foxPowerLost).map(p => p.key), "Kies een speler; de app controleert die speler plus twee buren."));
  steps.push(makeStep("piper", "Fluitspeler betovert", playersByRole("piper").map(p => p.key), "Kies maximaal twee spelers om te betoveren."));

  const enchanted = alivePlayers().filter(p => p.enchanted).map(p => p.key);
  if (enchanted.length) steps.push(makeStep("enchanted_info", "Betoverden zien elkaar", enchanted, "Betoverde spelers krijgen een overzicht van de andere betoverden."));

  return steps.filter(step => step.actorKeys.length > 0 || ["wolves"].includes(step.kind));
}

function actionForPlayer(p) {
  if (!p || !p.alive) {
    if (game.phase === "hunter" && game.pendingHunter === p?.key) {
      return game.hunterSequence?.stage === "choosing" ? hunterAction(p) : hunterWaitAction(p);
    }
    if (game.phase === "hunter" && game.hunterSequence?.hunterKey === p?.key) {
      return hunterWaitAction(p);
    }
    return null;
  }

  if (game.phase === "hunter" && game.pendingHunter === p.key) {
    return game.hunterSequence?.stage === "choosing" ? hunterAction(p) : hunterWaitAction(p);
  }

  if (game.phase === "mayor" && game.mayorElection.open) {
    const stage = game.mayorElection.stage || "candidates";
    if (stage === "candidates") {
      return {
        id: "mayor_candidate",
        title: "Wil jij burgemeester worden?",
        text: "",
        kind: "mayor_candidate",
        selfCandidate: p.isCandidate,
        candidateResponse: game.mayorElection?.responses?.[p.key] || (p.isCandidate ? "yes" : null),
        candidates: alivePlayers().filter(q => q.isCandidate).map(q => ({ key: q.key, name: q.name })),
      };
    }
    if (stage === "result") {
      const result = game.mayorElection?.result || {};
      const revealUntil = result.revealUntil || 0;
      const revealed = resultIsPublic(result);
      const winnerName = result.winnerName || null;
      const isWinner = result.winnerKey === p.key;
      const finalTitle = isWinner ? "Gefeliciteerd,\nje bent burgemeester geworden" : (winnerName ? `de nieuwe burgemeester is ${winnerName}` : (result.tied ? "geen burgemeester\ngekozen door gelijke score" : "geen burgemeester gekozen"));
      return { id: "mayor_result", kind: "mayor_result_wait", title: "De stemmen worden geteld", text: "", infoOnly: true, revealUntil, revealed, finalTitle: revealed ? finalTitle : null };
    }
    const currentVote = game.mayorElection.votes[p.key] || null;
    const selectedTargetKey = currentVote || game.mayorElection.selections?.[p.key] || null;
    return {
      id: "mayor_vote",
      title: currentVote ? "Je stem is opgeslagen" : "Kies je burgemeester",
      text: "",
      kind: "mayor_vote",
      options: currentMayorCandidates().filter(q => q.key !== p.key).map(q => playerTargetOption(p, q)),
      selfCandidate: p.isCandidate,
      currentVote,
      selectedTargetKey,
      submitted: !!currentVote,
      submission: currentVote ? {
        targetKey: currentVote,
        targetName: game.players[currentVote]?.name,
        targetCard: playerTargetOption(p, game.players[currentVote]),
        mayorVote: true
      } : null,
    };
  }

  if (game.phase === "voting" && game.dayVote.open) {
    const currentVote = game.dayVote.votes[p.key] || null;
    const selectedTargetKey = currentVote || game.dayVote.selections?.[p.key] || null;
    return {
      id: "day_vote",
      title: currentVote ? "Je stem is opgeslagen" : "Dagstemming",
      text: currentVote ? "" : (p.isMayor ? "Jouw stem telt dubbel." : ""),
      kind: "day_vote",
      options: currentDayVoteTargets().filter(q => q.key !== p.key).map(q => playerTargetOption(p, q)),
      currentVote,
      selectedTargetKey,
      submitted: !!currentVote,
      submission: currentVote ? {
        targetKey: currentVote,
        targetName: game.players[currentVote]?.name,
        targetCard: playerTargetOption(p, game.players[currentVote]),
        dayVote: true
      } : null,
    };
  }

  const step = game.currentStep;
  if (!step || !step.actorKeys.includes(p.key)) return null;
  const submitted = !!step.submissions[p.key];
  const preview = !submitted ? step.previews?.[p.key] || null : null;
  const base = {
    id: step.id,
    kind: step.kind,
    title: step.label,
    text: step.help,
    submitted,
    submission: submitted ? step.submissions[p.key] : null,
    preview,
    actorRoleName: roleDef(p.roleId).name,
  };

  switch (step.kind) {
    case "wolf_hound":
      return { ...base, choices: [{ value: "village", label: "Ik kies Burgerkant" }, { value: "wolf", label: "Ik kies Wolvenkant" }] };
    case "wild_child":
      return { ...base, options: targetOptions({ exclude: [p.key], aliveOnly: true, observer: p }) };
    case "cupid":
      return { ...base, options: targetOptions({ exclude: [p.key], aliveOnly: true, observer: p }) };
    case "lovers_info": {
      const lover = p.loverKey ? game.players[p.loverKey] : null;
      return {
        ...base,
        title: "Jouw geliefde",
        text: "Kijk om je heen om je geliefde te spotten.",
        lover: lover ? playerTargetOption(p, lover) : null,
        infoOnly: true,
      };
    }
    case "seer":
      return { ...base, options: targetOptions({ exclude: [p.key], aliveOnly: true, observer: p }) };
    case "sisters_info": {
      const names = playersByRole("sister").filter(q => q.key !== p.key).map(q => q.name).join(", ") || "geen andere gezuster gevonden";
      return { ...base, text: `Andere gezuster(s): ${names}. Tik op klaar.`, infoOnly: true };
    }
    case "wolves": {
      const ownSelection = game.night?.wolfSelections?.[p.key] || null;
      const ownConfirmed = !!game.night?.wolfConfirms?.[p.key];
      const wolfLocked = !!game.night?.wolfLocked;
      return {
        ...base,
        // Belangrijk: bij de wolven is een klik alleen een voorlopige selectie.
        // Het spelerscherm blijft daarom actief zichtbaar totdat alle levende wolven
        // dezelfde speler met OK hebben bevestigd.
        submitted: false,
        submission: null,
        text: "",
        options: targetOptions({ aliveOnly: true, notWolfPack: true, observer: p }),
        wolfConsensus: wolfConsensusView(step),
        ownSelection,
        ownConfirmed,
        wolfLocked,
        wolfLockedTargetKey: game.night?.wolfLockedTargetKey || null,
      };
    }
    case "infectious_wolf": {
      const victim = game.night?.wolfVictimKey ? game.players[game.night.wolfVictimKey] : null;
      return { ...base, text: victim ? `Wolvenslachtoffer: ${victim.name}. Wil je deze speler besmetten in plaats van doden?` : "Er is nog geen wolvenslachtoffer gekozen. Je kunt overslaan.", choices: [{ value: "no", label: "Niet besmetten" }, { value: "yes", label: "Besmetten" }] };
    }
    case "big_bad_wolf":
      return { ...base, options: targetOptions({ exclude: [p.key, game.night?.wolfVictimKey].filter(Boolean), aliveOnly: true, notWolfPack: true, observer: p }) };
    case "white_wolf":
      return { ...base, options: alivePlayers().filter(q => q.key !== p.key && isWolfLike(q)).map(q => playerTargetOption(p, q)) };
    case "witch": {
      const pending = pendingNightVictims()
        .filter(k => isAlive(k))
        .map(k => playerTargetOption(p, game.players[k]));
      return {
        ...base,
        text: "Gebruik eventueel je levensdrank en/of gifdrank. Elk drankje kan maar één keer.",
        pendingVictims: pending,
        allTargets: targetOptions({ aliveOnly: true, observer: p }),
        canSave: !p.witchSaveUsed,
        canPoison: !p.witchPoisonUsed,
      };
    }
    case "fox":
      return { ...base, options: targetOptions({ aliveOnly: true, observer: p }) };
    case "piper":
      return { ...base, options: targetOptions({ exclude: [p.key], aliveOnly: true, observer: p }).filter(o => !game.players[o.key]?.enchanted), maxTargets: 2 };
    case "enchanted_info": {
      const people = alivePlayers()
        .filter(q => q.enchanted && q.key !== p.key)
        .map(q => playerTargetOption(p, q));
      return {
        ...base,
        title: "De Betoverden",
        text: "Dit zijn de andere betoverde spelers.",
        people,
        infoOnly: true,
        hostControlled: true,
      };
    }
    default:
      return base;
  }
}

function hunterAction(p) {
  return {
    id: "hunter_shot",
    kind: "hunter_shot",
    title: "Jager: laatste schot",
    text: "Je bent uitgeschakeld. Kies één levende speler die je meeneemt.",
    options: targetOptions({ aliveOnly: true, exclude: [p.key], observer: p })
  };
}

function hunterWaitAction(p) {
  const stage = game.hunterSequence?.stage || "announcement";
  return {
    id: `hunter_wait_${stage}`,
    kind: "hunter_wait",
    title: stage === "shot_suspense"
      ? "Je keuze is doorgevoerd"
      : stage === "summary"
        ? "Je laatste schot is bekend"
        : "Je laatste schot wordt aangekondigd",
    text: stage === "shot_suspense"
      ? "Het Infoscherm onthult zo wie je hebt meegenomen."
      : "",
    waitingOnly: true,
    actorRoleName: roleDef(p?.roleId).name,
  };
}

function pendingNightVictims() {
  if (!game.night) return [];
  const keys = [];
  if (game.night.wolfVictimKey && game.night.infectedKey !== game.night.wolfVictimKey) keys.push(game.night.wolfVictimKey);
  if (game.night.bigBadVictimKey) keys.push(game.night.bigBadVictimKey);
  if (game.night.whiteWolfVictimKey) keys.push(game.night.whiteWolfVictimKey);
  return [...new Set(keys.filter(Boolean))];
}

function startGame() {
  const players = orderedPlayers(true);
  if (players.length < 3) return { ok: false, error: "Je hebt minimaal 3 spelers nodig om prettig te testen." };
  const deck = selectedRoleDeck();
  if (deck.length !== players.length) return { ok: false, error: `Aantal geselecteerde tegels (${deck.length}) moet gelijk zijn aan aantal spelers (${players.length}).` };
  normalizePreassignedRoles();
  const preassigned = new Map(players.map(p => [p.key, p.assignedRoleId || null]));
  const remainingDeck = deck.slice();
  for (const p of players) {
    const roleId = preassigned.get(p.key);
    if (!roleId) continue;
    const index = remainingDeck.indexOf(roleId);
    if (index < 0) return { ok: false, error: `${p.name} kan niet als ${roleDef(roleId).name} starten: die rol is niet meer beschikbaar.` };
    remainingDeck.splice(index, 1);
  }

  game.phase = "night";
  game.started = true;
  game.round = 1;
  game.nightNumber = 1;
  game.dayNumber = 0;
  game.lastDeaths = [];
  game.pendingHunter = null;
  game.pendingContinue = null;
  game.hunterSequence = null;
  game.deathReveal = null;
  game.winner = null;
  game.pendingWinner = null;
  game.recentPublicLog = [];
  game.specialPowersDisabled = false;
  game.wolfishEverDied = false;
  game.hostNote = "";
  game.mayorElection = { open: false, stage: "idle", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null };
  game.dayVote = { open: false, votes: {}, selections: {}, result: null, runoffCandidates: null };
  game.dayAftermath = { active: false, fromNight: false };

  for (const p of players) resetPlayerForGame(p);
  assignBalancedVillagerCards(players);
  const shuffled = shuffle(remainingDeck);
  players.forEach(p => {
    p.roleId = preassigned.get(p.key) || shuffled.shift();
    p.assignedRoleId = null;
    privateLog(p, `Je rol is: ${roleDef(p.roleId).name}`, "role");
  });
  game.night = freshNightState();
  game.nightSteps = buildNightSteps();
  game.currentStep = null;
  logPublic("Het spel is gestart. De eerste nacht begint.", "phase");
  return { ok: true };
}

function freshNightState() {
  return {
    wolfVotes: {},
    wolfSelections: {},
    wolfConfirms: {},
    wolfLocked: false,
    wolfLockedTargetKey: null,
    wolfVictimKey: null,
    infectedKey: null,
    bigBadVictimKey: null,
    whiteWolfVictimKey: null,
    witchSaveKey: null,
    witchPoisonKey: null,
    piperTargets: [],
    foxResult: null,
    deaths: []
  };
}

function startNextNight() {
  if (game.pendingWinner) { const w = game.pendingWinner; game.pendingWinner = null; endGame(w); return; }
  if (game.phase === "ended") return;
  game.phase = "night";
  game.nightNumber += 1;
  game.round += 1;
  game.currentStep = null;
  game.night = freshNightState();
  game.nightSteps = buildNightSteps();
  game.dayVote = { open: false, votes: {}, selections: {}, result: null, runoffCandidates: null };
  game.mayorElection = { open: false, stage: "idle", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null };
  game.dayAftermath = { active: false, fromNight: false };
  game.lastDeaths = [];
  game.pendingHunter = null;
  game.pendingContinue = null;
  game.hunterSequence = null;
  game.deathReveal = null;
  game.pendingWinner = null;
  logPublic(`Nacht ${game.nightNumber} begint.`, "phase");
}

function autoSubmitBotActions(step) {
  if (!step) return;
  const pick = (options) => {
    const list = (options || []).filter(Boolean);
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)]?.key || null;
  };
  const sampleKeys = (playersOrOptions, count, excludeKeys = []) => {
    const ex = new Set((excludeKeys || []).filter(Boolean));
    const list = (playersOrOptions || [])
      .map(item => typeof item === "string" ? item : item?.key)
      .filter(key => key && !ex.has(key));
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.slice(0, count);
  };
  // Debug/test-wolven moeten nooit echte spelers prefereren.
  // Ze krijgen per wolvenstap één gedeeld random doelwit uit alle geldige doelwitten,
  // zodat meerdere testwolven elkaar niet blokkeren maar de keuze wel volledig random blijft.
  const botWolfConsensusTarget = step.kind === "wolves"
    ? pick(targetOptions({ aliveOnly: true, notWolfPack: true }))
    : null;
  for (const actorKey of step.actorKeys || []) {
    const p = game.players[actorKey];
    if (!p || !p.isBot || step.submissions[p.key]) continue;

    switch (step.kind) {
      case "wolf_hound": {
        const choice = Math.random() < 0.5 ? "village" : "wolf";
        p.wolfDogChoice = choice;
        step.submissions[p.key] = { choice, bot: true };
        break;
      }
      case "wild_child": {
        const targetKey = pick(targetOptions({ aliveOnly: true, exclude: [p.key] }));
        if (targetKey) {
          p.wildChildModelKey = targetKey;
          step.submissions[p.key] = { targetKey, targetName: game.players[targetKey]?.name, bot: true };
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "cupid": {
        const targets = sampleKeys(alivePlayers(), 2, [p.key]);
        if (targets.length === 2) {
          const [a, b] = targets;
          game.players[a].loverKey = b;
          game.players[b].loverKey = a;
          privateLog(game.players[a], `Cupido heeft jou gekoppeld aan ${game.players[b].name}.`, "love");
          privateLog(game.players[b], `Cupido heeft jou gekoppeld aan ${game.players[a].name}.`, "love");
          p.cupidLoverKeys = targets.slice();
          step.submissions[p.key] = {
            lovers: targets.map(k => game.players[k].name),
            people: targets.map(k => playerTargetOption(p, game.players[k])),
            bot: true
          };
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "lovers_info":
      case "sisters_info":
      case "enchanted_info": {
        step.submissions[p.key] = { ready: true, bot: true };
        break;
      }
      case "seer": {
        const targetKey = pick(targetOptions({ aliveOnly: true, exclude: [p.key] }));
        if (targetKey) {
          const target = game.players[targetKey];
          const targetRole = roleDef(target.roleId);
          p.seerKnowledge = p.seerKnowledge || {};
          p.seerKnowledge[target.key] = target.roleId;
          step.submissions[p.key] = {
            targetKey,
            targetName: target.name,
            targetRoleId: target.roleId,
            targetRoleName: targetRole.name,
            targetRoleEmoji: targetRole.emoji,
            targetCardVariant: target.cardVariant || null,
            targetCard: playerTargetOption(p, target, { revealActual: true }),
            result: targetRole.name,
            wolfLike: isWolfLike(target),
            bot: true
          };
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "wolves": {
        const targetKey = botWolfConsensusTarget || pick(targetOptions({ aliveOnly: true, notWolfPack: true }));
        if (targetKey) {
          game.night.wolfSelections[p.key] = targetKey;
          game.night.wolfVotes[p.key] = targetKey;
          game.night.wolfConfirms[p.key] = true;
          step.submissions[p.key] = { targetKey, targetName: game.players[targetKey]?.name, confirmed: true, bot: true };
          finalizeWolfVotes();
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "infectious_wolf": {
        step.submissions[p.key] = { infect: false, bot: true };
        break;
      }
      case "big_bad_wolf": {
        const targetKey = pick(targetOptions({ aliveOnly: true, notWolfPack: true }).filter(o => o.key !== game.night?.wolfVictimKey));
        if (targetKey) {
          game.night.bigBadVictimKey = targetKey;
          step.submissions[p.key] = { targetKey, targetName: game.players[targetKey]?.name, bot: true };
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "white_wolf": {
        const targetKey = pick(targetOptions({ aliveOnly: true, onlyWolfLike: true, exclude: [p.key] }));
        if (targetKey) {
          game.night.whiteWolfVictimKey = targetKey;
          step.submissions[p.key] = { targetKey, targetName: game.players[targetKey]?.name, bot: true };
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "witch": {
        step.submissions[p.key] = { saveName: null, poisonName: null, bot: true };
        break;
      }
      case "fox": {
        const targetKey = pick(targetOptions({ aliveOnly: true }));
        if (targetKey) {
          const trio = foxTrio(targetKey);
          const found = trio.some(k => isWolfLike(game.players[k]));
          if (!found) p.foxPowerLost = true;
          game.night.foxResult = { actorKey: p.key, targetKey, trio, found };
          step.submissions[p.key] = { targetName: game.players[targetKey]?.name, foundWolfLike: found, checked: trio.map(k => game.players[k]?.name), bot: true };
        } else step.submissions[p.key] = { bot: true, skipped: true };
        break;
      }
      case "piper": {
        const targets = sampleKeys(alivePlayers().filter(q => !q.enchanted), 2, [p.key]);
        targets.forEach(k => {
          game.players[k].enchanted = true;
          privateLog(game.players[k], "Je bent betoverd door de Fluitspeler.", "magic");
        });
        game.night.piperTargets = targets;
        step.submissions[p.key] = {
          targets: targets.map(k => game.players[k].name),
          people: targets.map(k => playerTargetOption(p, game.players[k])),
          bot: true
        };
        break;
      }
      default: {
        step.submissions[p.key] = { ok: true, bot: true };
      }
    }
  }
}

function hostNextStep({ force = false } = {}) {
  if (game.phase === "hunter") {
    advanceHunterFromHost({ force });
    return;
  }
  if (game.phase !== "night") return;
  if (!game.night) game.night = freshNightState();

  if (game.currentStep) {
    if (!isStepReady(game.currentStep)) {
      if (!force) return;
      forceCompleteNightStep(game.currentStep);
    } else {
      finishStep(game.currentStep);
    }
  }

  const next = game.nightSteps.find(s => !s.done && !s.skipped);
  if (!next) {
    resolveNight();
    return;
  }
  game.currentStep = next;
  autoSubmitBotActions(game.currentStep);
  logPublic(`De nacht gaat verder.`, "phase");
}

function forceCompleteNightStep(step) {
  if (!step || step.done) return;
  if (step.kind === "wolves") {
    let finalized = forceFinalizeWolfVotesByMajority(step);
    if (!finalized) {
      const target = randomChoice(targetOptions({ aliveOnly: true, notWolfPack: true }));
      if (target) {
        game.night.wolfSelections = game.night.wolfSelections || {};
        game.night.wolfConfirms = game.night.wolfConfirms || {};
        for (const key of step.actorKeys || []) {
          game.night.wolfSelections[key] = target.key;
          game.night.wolfConfirms[key] = true;
          step.submissions[key] = { targetKey: target.key, targetName: target.name, confirmed: true, forced: true };
        }
        game.night.wolfVictimKey = target.key;
        game.night.wolfLockedTargetKey = target.key;
        game.night.wolfLocked = true;
        finalized = true;
      }
    }
    if (!finalized) {
      step.skipped = true;
      step.done = true;
      game.currentStep = null;
    } else {
      finishStep(step);
    }
  } else {
    for (const key of step.actorKeys || []) {
      if (step.submissions[key]) continue;
      step.submissions[key] = step.kind === "witch"
        ? { saveName: null, poisonName: null, forced: true }
        : { ready: true, skipped: true, forced: true };
    }
    finishStep(step);
  }
  logPublic(`${step.label} is door de host geforceerd afgerond.`, "warning");
}

function finishStep(step) {
  if (!step || step.done) return;
  if (step.kind === "wolves") {
    if (!wolfConsensusReady(step)) return;
    finalizeWolfVotes();
  }
  if (step.kind === "cupid") ensureLoversInfoStepAfter(step);
  if (step.kind === "piper") ensureEnchantedInfoStepAfter(step);
  step.done = true;
  if (game.currentStep?.id === step.id) game.currentStep = null;
}

function ensureLoversInfoStepAfter(step) {
  const lovers = alivePlayers().filter(p => p.loverKey).map(p => p.key);
  if (!lovers.length) return;
  if (game.nightSteps.some(s => s.kind === "lovers_info")) return;
  const idx = game.nightSteps.findIndex(s => s.id === step.id);
  const infoStep = makeStep("lovers_info", "Geliefden zien elkaar", lovers, "Geliefden krijgen elkaars naam te zien.");
  game.nightSteps.splice(idx >= 0 ? idx + 1 : 0, 0, infoStep);
}

function ensureEnchantedInfoStepAfter(step) {
  const enchanted = alivePlayers().filter(p => p.enchanted).map(p => p.key);
  if (!enchanted.length) return;
  const existing = game.nightSteps.find(s => s.kind === "enchanted_info" && !s.done);
  if (existing) {
    // Neem ook iedereen mee die pas tijdens de huidige Fluitspelerstap
    // betoverd werd.
    existing.actorKeys = enchanted;
    existing.submissions = {};
    existing.previews = {};
    return;
  }
  const idx = game.nightSteps.findIndex(s => s.id === step.id);
  const infoStep = makeStep(
    "enchanted_info",
    "Betoverden zien elkaar",
    enchanted,
    "Alle betoverde spelers zien de volledige actuele groep."
  );
  game.nightSteps.splice(idx >= 0 ? idx + 1 : game.nightSteps.length, 0, infoStep);
}

function skipCurrentStep() {
  if (game.phase !== "night" || !game.currentStep) return;
  game.currentStep.skipped = true;
  game.currentStep.done = true;
  game.currentStep = null;
}

function finalizeWolfVotes() {
  if (!game.night) return;
  const step = game.currentStep?.kind === "wolves" ? game.currentStep : game.nightSteps.find(s => s.kind === "wolves" && !s.skipped);
  const consensus = wolfConsensusView(step);
  if (game.night.wolfLocked) return;
  if (consensus.allConfirmedSame && consensus.consensusTargetKey) {
    game.night.wolfVictimKey = consensus.consensusTargetKey;
    game.night.wolfLockedTargetKey = consensus.consensusTargetKey;
    game.night.wolfLocked = true;
    game.night.wolfVotes = { ...(game.night.wolfSelections || {}) };
  } else {
    game.night.wolfVictimKey = null;
    game.night.wolfLockedTargetKey = null;
  }
}

function forceFinalizeWolfVotesByMajority(step = game.currentStep) {
  if (!game.night || !step || step.kind !== "wolves" || game.night.wolfLocked) return false;
  const actorKeys = (step.actorKeys || []).filter(k => isAlive(k));
  const selections = game.night.wolfSelections || {};
  const confirms = game.night.wolfConfirms || {};
  const tally = new Map();
  for (const key of actorKeys) {
    const targetKey = selections[key];
    if (!targetKey || !isAlive(targetKey)) continue;
    tally.set(targetKey, (tally.get(targetKey) || 0) + 1);
  }
  if (!tally.size) return false;
  const max = Math.max(...tally.values());
  const tied = [...tally.entries()].filter(([, count]) => count === max).map(([key]) => key);
  const picked = randomChoice(tied);
  if (!picked) return false;
  game.night.wolfVictimKey = picked;
  game.night.wolfLockedTargetKey = picked;
  game.night.wolfLocked = true;
  game.night.wolfVotes = { ...(game.night.wolfSelections || {}) };
  for (const key of actorKeys) {
    if (!game.night.wolfSelections[key]) game.night.wolfSelections[key] = picked;
    game.night.wolfConfirms[key] = true;
  }
  logPublic(`De host heeft de wolvenkeuze afgerond.`, "role");
  return true;
}

function handleAction(socket, payload = {}) {
  const key = game.socketToKey[socket.id];
  const p = getPlayer(key);
  if (!p) return;

  if (payload.kind === "mayor_candidate") {
    if (!game.mayorElection.open || game.mayorElection.stage !== "candidates" || !p.alive) return;
    game.mayorElection.responses = game.mayorElection.responses || {};
    if (game.mayorElection.responses[p.key]) return; // kandidaat-ja/nee blijft vast
    const wantsCandidate = payload.isCandidate !== false;
    p.isCandidate = !!wantsCandidate;
    game.mayorElection.responses[p.key] = wantsCandidate ? "yes" : "no";
    maybeAutoStartMayorVote();
    emitAll();
    return;
  }

  if (payload.kind === "mayor_vote") {
    if (!game.mayorElection.open || game.mayorElection.stage !== "voting" || !p.alive) return;
    if (game.mayorElection.votes[p.key]) return; // bevestigde burgemeesterstem blijft vast
    const target = getPlayer(payload.targetKey);
    // Spelers mogen niet op zichzelf stemmen, ook kandidaten niet.
    if (target && target.alive && target.isCandidate && target.key !== p.key && currentMayorCandidates().some(c => c.key === target.key)) {
      game.mayorElection.votes[p.key] = target.key;
      game.mayorElection.selections[p.key] = target.key;
      p.voteFor = target.key;
      maybeAutoCloseMayorVoteIfComplete();
    }
    emitAll();
    return;
  }

  if (payload.kind === "day_vote") {
    if (!game.dayVote.open || !p.alive) return;
    if (game.dayVote.votes[p.key]) return; // bevestigde dagstem blijft vast
    const target = getPlayer(payload.targetKey);
    if (target && target.alive && target.key !== p.key && currentDayVoteTargets().some(t => t.key === target.key)) {
      game.dayVote.votes[p.key] = target.key;
      game.dayVote.selections[p.key] = target.key;
      p.dayVoteFor = target.key;
      maybeAutoCloseDayVoteIfComplete();
    }
    emitAll();
    return;
  }

  if (payload.kind === "hunter_shot") {
    if (game.phase !== "hunter" || game.pendingHunter !== p.key || game.hunterSequence?.stage !== "choosing") return;
    const target = getPlayer(payload.targetKey);
    if (target && target.alive && target.key !== p.key) {
      applyHunterShot(target.key, { forced: false });
    }
    emitAll();
    return;
  }

  const step = game.currentStep;
  if (!step || !step.actorKeys.includes(p.key)) return;
  if (step.kind !== "wolves" && step.submissions[p.key]) return;

  switch (step.kind) {
    case "wolf_hound": {
      const choice = payload.choice === "wolf" ? "wolf" : "village";
      p.wolfDogChoice = choice;
      privateLog(p, `Je koos de ${choice === "wolf" ? "wolvenkant" : "burgerkant"}.`, "action");
      step.submissions[p.key] = { choice };
      break;
    }
    case "wild_child": {
      const target = getPlayer(payload.targetKey);
      if (target && target.alive && target.key !== p.key) {
        p.wildChildModelKey = target.key;
        privateLog(p, `Je rolmodel is ${target.name}.`, "action");
        step.submissions[p.key] = {
          targetKey: target.key,
          targetName: target.name,
          targetCard: playerTargetOption(p, target)
        };
      }
      break;
    }
    case "cupid": {
      const keys = Array.isArray(payload.targetKeys) ? payload.targetKeys.filter(Boolean) : [];
      const unique = [...new Set(keys)].filter(k => isAlive(k) && k !== p.key);
      if (unique.length === 2) {
        const [a, b] = unique;
        game.players[a].loverKey = b;
        game.players[b].loverKey = a;
        privateLog(game.players[a], `Cupido heeft jou gekoppeld aan ${game.players[b].name}.`, "love");
        privateLog(game.players[b], `Cupido heeft jou gekoppeld aan ${game.players[a].name}.`, "love");
        p.cupidLoverKeys = unique.slice();
        step.submissions[p.key] = {
          lovers: unique.map(k => game.players[k].name),
          people: unique.map(k => playerTargetOption(p, game.players[k]))
        };
      }
      break;
    }
    case "lovers_info": {
      const lover = p.loverKey ? game.players[p.loverKey] : null;
      if (lover) {
        lover.loverHeartPulse = {
          token: uid("lover_heart"),
          until: Date.now() + 2400,
        };
      }
      step.submissions[p.key] = { ready: true };
      break;
    }
    case "sisters_info":
    case "enchanted_info": {
      step.submissions[p.key] = { ready: true };
      break;
    }
    case "seer": {
      const target = getPlayer(payload.targetKey);
      if (target && target.alive) {
        const targetRole = roleDef(target.roleId);
        p.seerKnowledge = p.seerKnowledge || {};
        p.seerKnowledge[target.key] = target.roleId;
        privateLog(p, `${target.name} is: ${targetRole.name}${isWolfLike(target) ? " (wolfachtig)" : ""}.`, "result");
        step.submissions[p.key] = {
          targetKey: target.key,
          targetName: target.name,
          targetRoleId: target.roleId,
          targetRoleName: targetRole.name,
          targetRoleEmoji: targetRole.emoji,
          targetCardVariant: target.cardVariant || null,
          targetCard: playerTargetOption(p, target, { revealActual: true }),
          result: targetRole.name,
          wolfLike: isWolfLike(target)
        };
      }
      break;
    }
    case "wolves": {
      if (!game.night.wolfSelections) game.night.wolfSelections = {};
      if (!game.night.wolfConfirms) game.night.wolfConfirms = {};

      // Zodra alle levende wolven hetzelfde doelwit hebben bevestigd, is de keuze gelockt.
      // De host moet daarna nog wel handmatig naar de volgende nachtstap gaan.
      if (game.night.wolfLocked) break;

      if (payload.cancel) {
        delete game.night.wolfConfirms[p.key];
        if (step.submissions[p.key]) step.submissions[p.key].confirmed = false;
        finalizeWolfVotes();
        break;
      }

      const chosenKey = payload.targetKey || game.night.wolfSelections[p.key];
      const target = getPlayer(chosenKey);
      if (target && target.alive && !isWolfPackMember(target)) {
        const previous = game.night.wolfSelections[p.key];
        game.night.wolfSelections[p.key] = target.key;
        game.night.wolfVotes[p.key] = target.key;
        if (previous !== target.key) delete game.night.wolfConfirms[p.key];
        if (payload.confirm) game.night.wolfConfirms[p.key] = true;
        step.submissions[p.key] = {
          targetKey: target.key,
          targetName: target.name,
          targetCard: playerTargetOption(p, target),
          confirmed: !!game.night.wolfConfirms[p.key],
        };
        finalizeWolfVotes();
      }
      break;
    }
    case "infectious_wolf": {
      const use = payload.choice === "yes";
      if (use && game.night?.wolfVictimKey && !p.infectUsed) {
        game.night.infectedKey = game.night.wolfVictimKey;
        p.infectUsed = true;
        step.submissions[p.key] = { infect: true, targetName: game.players[game.night.wolfVictimKey]?.name };
      } else {
        step.submissions[p.key] = { infect: false };
      }
      break;
    }
    case "big_bad_wolf": {
      const target = getPlayer(payload.targetKey);
      if (target && target.alive && !isWolfPackMember(target) && target.key !== game.night?.wolfVictimKey) {
        game.night.bigBadVictimKey = target.key;
        step.submissions[p.key] = {
          targetKey: target.key,
          targetName: target.name,
          targetCard: playerTargetOption(p, target)
        };
      }
      break;
    }
    case "white_wolf": {
      const target = getPlayer(payload.targetKey);
      if (target && target.alive && target.key !== p.key && isWolfLike(target)) {
        game.night.whiteWolfVictimKey = target.key;
        step.submissions[p.key] = {
          targetKey: target.key,
          targetName: target.name,
          targetCard: playerTargetOption(p, target)
        };
      }
      break;
    }
    case "witch": {
      const saveKey = payload.saveKey && !p.witchSaveUsed ? payload.saveKey : null;
      const poisonKey = payload.poisonKey && !p.witchPoisonUsed ? payload.poisonKey : null;
      const pending = new Set(pendingNightVictims());
      if (saveKey && pending.has(saveKey)) {
        game.night.witchSaveKey = saveKey;
        p.witchSaveUsed = true;
      }
      if (poisonKey && isAlive(poisonKey)) {
        game.night.witchPoisonKey = poisonKey;
        p.witchPoisonUsed = true;
      }
      step.submissions[p.key] = {
        saveName: saveKey ? game.players[saveKey]?.name : null,
        poisonName: poisonKey ? game.players[poisonKey]?.name : null,
        saveTarget: saveKey ? playerTargetOption(p, game.players[saveKey]) : null,
        poisonTarget: poisonKey ? playerTargetOption(p, game.players[poisonKey]) : null,
      };
      break;
    }
    case "fox": {
      const target = getPlayer(payload.targetKey);
      if (target && target.alive) {
        const trio = foxTrio(target.key);
        const found = trio.some(k => isWolfLike(game.players[k]));
        if (!found) p.foxPowerLost = true;
        game.night.foxResult = { actorKey: p.key, targetKey: target.key, trio, found };
        p.foxKnowledge = p.foxKnowledge || [];
        p.foxKnowledge.push({
          targetKey: target.key,
          targetName: target.name,
          trio: trio.slice(),
          foundWolfLike: found,
        });
        privateLog(p, found ? `Vos-resultaat: rond ${target.name} zit minstens één wolfachtige.` : `Vos-resultaat: rond ${target.name} zit geen wolfachtige. Je verliest je kracht.`, "result");
        step.submissions[p.key] = {
          targetKey: target.key,
          targetName: target.name,
          targetCard: playerTargetOption(p, target),
          foundWolfLike: found,
          checked: trio.map(k => game.players[k]?.name)
        };
      }
      break;
    }
    case "piper": {
      const keys = Array.isArray(payload.targetKeys) ? [...new Set(payload.targetKeys)].slice(0, 2) : [];
      const valid = keys.filter(k => isAlive(k) && k !== p.key && !game.players[k].enchanted);
      valid.forEach(k => {
        game.players[k].enchanted = true;
        privateLog(game.players[k], "Je bent betoverd door de Fluitspeler.", "magic");
      });
      game.night.piperTargets = valid;
      step.submissions[p.key] = {
        targets: valid.map(k => game.players[k].name),
        people: valid.map(k => playerTargetOption(p, game.players[k]))
      };
      break;
    }
    default:
      step.submissions[p.key] = { ok: true };
  }
  if (step.submissions[p.key] && step.previews) delete step.previews[p.key];
  emitAll();
}

function foxTrio(centerKey) {
  const alive = alivePlayers();
  const i = alive.findIndex(p => p.key === centerKey);
  if (i < 0 || alive.length === 0) return [];
  const left = alive[(i - 1 + alive.length) % alive.length]?.key;
  const center = alive[i]?.key;
  const right = alive[(i + 1) % alive.length]?.key;
  return [...new Set([left, center, right].filter(Boolean))];
}

function resolveNight() {
  if (game.currentStep) finishStep(game.currentStep);
  game.currentStep = null;

  if (game.night?.infectedKey && isAlive(game.night.infectedKey)) {
    const infected = game.players[game.night.infectedKey];
    infected.infected = true;
    privateLog(infected, "Je bent besmet en hoort nu bij de wolvenkant, maar je behoudt je rolkracht.", "wolf");
    logPublic("Er gebeurde iets vreemds in de nacht...", "mystery");
  }

  const deathMap = new Map();
  const addDeath = (key, cause, publicReason) => {
    if (!key || !isAlive(key)) return;
    if (game.night?.witchSaveKey === key) return;
    // Infected wolf victim dies not if it was the infected target.
    if (game.night?.infectedKey === key && cause === "wolves") return;
    deathMap.set(key, { key, cause, publicReason });
  };

  addDeath(game.night?.wolfVictimKey, "wolves", "aangevallen door de wolven");
  addDeath(game.night?.bigBadVictimKey, "big_bad_wolf", "verslonden door de Grote Boze Wolf");
  addDeath(game.night?.whiteWolfVictimKey, "white_wolf", "uitgeschakeld door de Witte Weerwolf");
  addDeath(game.night?.witchPoisonKey, "witch_poison", "vergiftigd door de Heks");

  handleDeaths([...deathMap.values()], { phase: "day", fromNight: true });
}

function handleDeaths(deaths, continueTo = { phase: "day" }) {
  const queue = deaths.filter(d => d && d.key && game.players[d.key]);
  const publicDeaths = [];
  const processed = new Set();
  let angelWin = null;

  while (queue.length) {
    const d = queue.shift();
    const p = game.players[d.key];
    if (!p || !p.alive || processed.has(p.key)) continue;
    processed.add(p.key);

    // Dorpsoudste survives first direct wolf attack.
    if (p.roleId === "elder" && d.cause === "wolves" && !p.elderWolfShieldUsed) {
      p.elderWolfShieldUsed = true;
      privateLog(p, "Je overleefde de eerste aanval van de wolven.", "survive");
      continue;
    }

    p.alive = false;
    p.isCandidate = false;
    p.voteFor = null;
    p.dayVoteFor = null;
    publicDeaths.push({
      key: p.key,
      name: p.name,
      roleName: roleDef(p.roleId).name,
      roleEmoji: roleDef(p.roleId).emoji,
      cardVariant: p.cardVariant || null,
      cause: d.cause,
      publicReason: d.publicReason || "uitgeschakeld",
      linkedToKey: d.linkedToKey || null
    });

    if (isWolfLike(p)) game.wolfishEverDied = true;

    // Angel early win.
    if (p.roleId === "angel" && (game.nightNumber === 1 || game.dayNumber <= 1) && ["wolves", "vote"].includes(d.cause)) {
      angelWin = p;
    }

    // Elder penalty if villagers vote him out.
    if (p.roleId === "elder" && d.cause === "vote") {
      game.specialPowersDisabled = true;
      logPublic("De Dorpsoudste is door het dorp uitgeschakeld. Speciale burgerkrachten zijn verzwakt.", "warning");
    }

    // Rusty knight revenge when killed by wolves.
    if (p.roleId === "rusty_knight" && ["wolves", "big_bad_wolf"].includes(d.cause)) {
      const wolf = firstWolfLikeLeftOf(p.key);
      if (wolf && wolf.alive) queue.push({ key: wolf.key, cause: "rusty_sword", publicReason: "geraakt door het roestige zwaard" });
    }

    // Lovers die together.
    if (p.loverKey && isAlive(p.loverKey)) {
      queue.push({
        key: p.loverKey,
        cause: "love",
        publicReason: "gestorven van liefdesverdriet",
        linkedToKey: p.key
      });
    }

    // Wild child turns if model dies.
    for (const q of alivePlayers()) {
      if (q.roleId === "wild_child" && q.wildChildModelKey === p.key && !q.wildChildTurned) {
        q.wildChildTurned = true;
        privateLog(q, `Je rolmodel ${p.name} is gestorven. Jij wordt nu wolfachtig.`, "wolf");
      }
    }
  }

  if (publicDeaths.length) {
    const appendToRoundReport = !!(continueTo?.fromNight || continueTo?.appendToRoundReport) && Array.isArray(game.lastDeaths) && game.lastDeaths.length > 0;
    game.lastDeaths = appendToRoundReport ? [...game.lastDeaths, ...publicDeaths] : publicDeaths;
    logPublic(`${publicDeaths.map(d => d.name).join(", ")} ${publicDeaths.length === 1 ? "is" : "zijn"} uitgeschakeld.`, "death");
  } else {
    if (!continueTo?.fromNight) game.lastDeaths = [];
    logPublic("Niemand is uitgeschakeld.", "safe");
  }

  if (angelWin) {
    endGame({ title: "De Engel wint!", text: `${angelWin.name} werd vroeg uitgeschakeld en wint als Engel.`, team: "angel" });
    return;
  }

  if (continueTo?.holdForHunterReveal && game.hunterSequence) {
    game.phase = "hunter";
    game.hunterSequence.stage = "shot_suspense";
    game.hunterSequence.shotDeathKeys = publicDeaths.map(d => d.key);
    game.hunterSequence.shotToken = uid("hunter_shot_reveal");
    game.pendingContinue = game.hunterSequence.continueTo || continueTo.afterHunter || { phase: "day" };
    startDeathReveal(
      [...activeDeathRevealKeys(), ...publicDeaths.map(d => d.key)],
      "hunter_shot",
      game.hunterSequence.shotToken
    );
    scheduleHunterShotFallback(game.hunterSequence.shotToken);
    return;
  }

  const hunter = publicDeaths.map(d => game.players[d.key]).find(p => p?.roleId === "hunter");
  if (hunter) {
    game.pendingHunter = hunter.key;
    game.pendingContinue = continueTo;
    game.hunterSequence = {
      hunterKey: hunter.key,
      source: continueTo?.deferWinner ? "day_vote" : continueTo?.fromNight ? "night" : "day",
      stage: continueTo?.deferWinner ? "awaiting_vote_reveal" : "announcement",
      introToken: uid("hunter_intro"),
      shotToken: null,
      shotDeathKeys: [],
      autoAdvanceAt: null,
      continueTo,
    };
    privateLog(hunter, "Je bent gestorven als Jager. Kies je laatste schot.", "action");
    if (game.hunterSequence.stage === "awaiting_vote_reveal") {
      game.phase = "day";
    } else {
      beginHunterAnnouncement();
      startDeathReveal(game.lastDeaths.map(d => d.key), "hunter_sequence");
    }
    return;
  }

  if (continueTo?.fromNight && publicDeaths.length) {
    startDeathReveal(game.lastDeaths.map(d => d.key), "night_deaths");
  }

  const win = checkWinCondition();
  if (win) {
    if (continueTo?.deferWinner) {
      // Laat eerst de dagstemming-uitslag en rol/kaart-reveal zien; host klikt daarna naar winnaar.
      game.pendingWinner = win;
      game.phase = "day";
      game.currentStep = null;
      game.hostNote = bearGrowlNote();
      game.dayAftermath = { active: false, fromNight: false };
    } else if (continueTo?.fromNight && publicDeaths.length) {
      game.pendingWinner = win;
      beginDayFlow({ fromNight: true });
    } else {
      endGame(win);
    }
    return;
  }

  if (continueTo.phase === "day") {
    if (continueTo.fromNight) beginDayFlow({ fromNight: true });
    else {
      game.phase = "day";
      game.dayVote = { open: false, votes: {}, selections: {}, result: game.dayVote?.result || null, runoffCandidates: null };
      game.currentStep = null;
      game.hostNote = bearGrowlNote();
    }
  } else if (continueTo.phase === "night") {
    startNextNight();
  } else if (continueTo.phase) {
    game.phase = continueTo.phase;
  }
}

function firstWolfLikeLeftOf(key) {
  const all = orderedPlayers(true);
  const start = all.findIndex(p => p.key === key);
  if (start < 0) return null;
  for (let offset = 1; offset < all.length; offset++) {
    const p = all[(start + offset) % all.length];
    if (p.alive && isWolfLike(p)) return p;
  }
  return null;
}

function bearGrowlNote() {
  const bear = alivePlayers().find(p => p.roleId === "bear_tamer" && !isSpecialPowerBlocked(p));
  if (!bear) return "";
  const trio = foxTrio(bear.key).filter(k => k !== bear.key);
  const growl = trio.some(k => isWolfLike(game.players[k]));
  return growl ? "🐻 De beer gromt: naast Titus zit een wolfachtige speler." : "🐻 De beer blijft stil.";
}

function checkWinCondition() {
  const alive = alivePlayers();
  if (!alive.length) return { title: "Niemand wint", text: "Er leeft niemand meer.", team: "none" };

  const piper = alive.find(p => p.roleId === "piper");
  if (piper) {
    const others = alive.filter(p => p.key !== piper.key);
    if (others.length > 0 && others.every(p => p.enchanted)) {
      return { title: "De Fluitspeler wint!", text: `${piper.name} heeft alle andere levende spelers betoverd.`, team: "piper" };
    }
  }

  const white = alive.find(p => p.roleId === "white_wolf");
  if (white && alive.length === 1) {
    return { title: "De Witte Weerwolf wint!", text: `${white.name} bleef als enige over.`, team: "white_wolf" };
  }

  // Mixed lovers win if they are the only two alive and are lovers.
  if (alive.length === 2 && alive[0].loverKey === alive[1].key && alive[1].loverKey === alive[0].key) {
    const teams = new Set(alive.map(effectiveTeam));
    if (teams.size > 1) return { title: "De Geliefden winnen!", text: `${alive[0].name} en ${alive[1].name} blijven samen over.`, team: "lovers" };
  }

  // Core rule: het spel blijft doorgaan tot alle wolfachtigen weg zijn,
  // of tot de wolfkant minstens even groot is als de rest.
  const wolfSide = alive.filter(p => isWolfLike(p));
  const nonWolfSide = alive.filter(p => !isWolfLike(p));
  if (wolfSide.length === 0) {
    return { title: "Het Dorp wint!", text: "Alle wolfachtige dreigingen zijn uitgeschakeld.", team: "village" };
  }
  if (wolfSide.length >= nonWolfSide.length && wolfSide.length > 0) {
    return { title: "De Weerwolven winnen!", text: "De wolven zijn met minstens evenveel als de rest.", team: "wolves" };
  }
  return null;
}

function hasRegisteredViewer() {
  return (io.sockets.adapter.rooms.get("viewer")?.size || 0) > 0;
}

function startDeathReveal(keys, kind = "deaths", token = null) {
  const pendingKeys = [...new Set((keys || []).filter(Boolean))];
  if (!pendingKeys.length) return null;
  game.deathReveal = {
    token: token || uid(`${kind}_reveal`),
    kind,
    pendingKeys,
    publicRevealed: false,
    startedAt: Date.now(),
  };
  if (!kind.startsWith("hunter")) scheduleDeathReleaseFallback(game.deathReveal);
  return game.deathReveal;
}

function releaseDeathToPlayers(token) {
  if (!game.deathReveal || game.deathReveal.token !== token || game.deathReveal.publicRevealed !== false) return false;
  game.deathReveal.publicRevealed = true;
  emitAll();
  return true;
}

function scheduleDeathReleaseFallback(reveal) {
  setTimeout(() => {
    if (game.deathReveal !== reveal || reveal.publicRevealed !== false) return;
    if (!hasRegisteredViewer()) {
      releaseDeathToPlayers(reveal.token);
      return;
    }
    setTimeout(() => releaseDeathToPlayers(reveal.token), DEATH_REVEAL_FALLBACK_MS);
  }, 2200);
}

function beginHunterAnnouncement() {
  const sequence = game.hunterSequence;
  if (!sequence) return false;
  sequence.stage = "announcement";
  sequence.autoAdvanceAt = Date.now() + HUNTER_INTRO_FALLBACK_MS;
  game.phase = "hunter";
  game.currentStep = null;
  const token = sequence.introToken;
  setTimeout(() => {
    if (game.hunterSequence !== sequence || sequence.stage !== "announcement") return;
    advanceHunterIntro(token);
  }, HUNTER_INTRO_FALLBACK_MS);
  return true;
}

function advanceHunterIntro(token) {
  const sequence = game.hunterSequence;
  if (!sequence || sequence.introToken !== token || sequence.stage !== "announcement") return false;
  sequence.stage = "choosing";
  sequence.autoAdvanceAt = null;
  game.phase = "hunter";
  emitAll();
  scheduleBotHunterChoice(sequence);
  return true;
}

function scheduleBotHunterChoice(sequence) {
  const hunter = sequence ? game.players[sequence.hunterKey] : null;
  if (!hunter?.isBot) return;
  setTimeout(() => {
    if (game.hunterSequence !== sequence || sequence.stage !== "choosing") return;
    const options = alivePlayers().filter(p => p.key !== hunter.key);
    if (!options.length) {
      finishHunterSequence();
      emitAll();
      return;
    }
    const target = options[Math.floor(Math.random() * options.length)];
    if (applyHunterShot(target.key)) emitAll();
  }, 5000);
}

function applyHunterShot(targetKey, { forced = false } = {}) {
  const sequence = game.hunterSequence;
  const hunter = sequence ? game.players[sequence.hunterKey] : null;
  const target = game.players[targetKey];
  if (!sequence || sequence.stage !== "choosing" || !hunter || !target?.alive || target.key === hunter.key) return false;
  privateLog(hunter, `Je nam ${target.name} mee met je laatste schot.`, "action");
  if (forced) logPublic(`De host forceerde het laatste schot van de Jager op ${target.name}.`, "warning");
  sequence.stage = "shot_processing";
  game.pendingHunter = null;
  handleDeaths(
    [{ key: target.key, cause: "hunter", publicReason: "meegenomen door de Jager" }],
    {
      phase: "hunter",
      fromNight: !!sequence.continueTo?.fromNight,
      appendToRoundReport: true,
      holdForHunterReveal: true,
      afterHunter: sequence.continueTo || { phase: "day" },
    }
  );
  return true;
}

function scheduleHunterShotFallback(token) {
  setTimeout(() => {
    const sequence = game.hunterSequence;
    if (!sequence || sequence.shotToken !== token || sequence.stage !== "shot_suspense") return;
    if (!hasRegisteredViewer()) {
      revealHunterShot(token);
      return;
    }
    setTimeout(() => revealHunterShot(token), HUNTER_SHOT_FALLBACK_MS);
  }, 2400);
}

function revealHunterShot(token) {
  const sequence = game.hunterSequence;
  if (!sequence || sequence.shotToken !== token || sequence.stage !== "shot_suspense") return false;
  sequence.stage = "summary";
  releaseDeathToPlayers(token);
  emitAll();
  return true;
}

function finishHunterSequence() {
  const sequence = game.hunterSequence;
  if (!sequence) return false;
  const continueTo = sequence.continueTo || game.pendingContinue || { phase: "day" };
  if (game.deathReveal?.publicRevealed === false) releaseDeathToPlayers(game.deathReveal.token);
  game.hunterSequence = null;
  game.pendingHunter = null;
  game.pendingContinue = null;

  const win = checkWinCondition();
  if (win) {
    if (continueTo?.deferWinner) {
      game.pendingWinner = win;
      game.phase = "day";
      game.currentStep = null;
      game.hostNote = bearGrowlNote();
      game.dayAftermath = { active: false, fromNight: false };
    } else if (continueTo?.fromNight && (game.lastDeaths || []).length) {
      game.pendingWinner = win;
      beginDayFlow({ fromNight: true });
    } else {
      endGame(win);
    }
    emitAll();
    return true;
  }

  if (continueTo.phase === "day") {
    if (continueTo.fromNight) beginDayFlow({ fromNight: true });
    else {
      game.phase = "day";
      game.currentStep = null;
      game.hostNote = bearGrowlNote();
      game.dayAftermath = { active: false, fromNight: false };
    }
  } else if (continueTo.phase === "night") {
    startNextNight();
  } else if (continueTo.phase) {
    game.phase = continueTo.phase;
  }
  emitAll();
  return true;
}

function advanceHunterFromHost({ force = false } = {}) {
  const sequence = game.hunterSequence;
  if (!sequence) return false;
  if (sequence.stage === "awaiting_vote_reveal") {
    if (!force) return false;
    const result = game.dayVote?.result;
    if (result?.publicRevealed === false) releaseResultToPlayers("day_vote", result.revealToken);
    else beginHunterAnnouncement();
    return true;
  }
  if (sequence.stage === "announcement") {
    return advanceHunterIntro(sequence.introToken);
  }
  if (sequence.stage === "choosing") {
    if (!force) return false;
    const target = randomChoice(alivePlayers().filter(p => p.key !== sequence.hunterKey));
    if (target) return applyHunterShot(target.key, { forced: true });
    sequence.stage = "summary";
    return true;
  }
  if (sequence.stage === "shot_suspense") {
    if (!force) return false;
    return revealHunterShot(sequence.shotToken);
  }
  if (sequence.stage === "summary") return finishHunterSequence();
  return false;
}

function releaseResultToPlayers(kind, token) {
  const result = kind === "mayor" ? game.mayorElection?.result : game.dayVote?.result;
  if (!result || result.revealToken !== token || result.publicRevealed !== false) return false;
  result.publicRevealed = true;
  if (kind === "day_vote" && game.hunterSequence?.stage === "awaiting_vote_reveal") {
    beginHunterAnnouncement();
  }
  emitAll();
  return true;
}

function scheduleResultReleaseFallback(kind, result) {
  const firstDelay = Math.max(0, Number(result.revealUntil || 0) - Date.now()) + 350;
  setTimeout(() => {
    if (result.publicRevealed !== false) return;
    if (!hasRegisteredViewer()) {
      releaseResultToPlayers(kind, result.revealToken);
      return;
    }
    setTimeout(() => releaseResultToPlayers(kind, result.revealToken), RESULT_REVEAL_FALLBACK_MS);
  }, firstDelay);
}

function releaseWinnerToPlayers(token) {
  if (!game.winner || game.publicWinnerRevealToken !== token || game.publicWinnerRevealed) return false;
  game.publicWinnerRevealed = true;
  emitAll();
  return true;
}

function endGame(winner) {
  const phaseBeforeWinner = game.phase;
  game.phase = "ended";
  game.winner = winner;
  game.publicPhaseBeforeWinner = phaseBeforeWinner === "ended" ? "day" : phaseBeforeWinner;
  game.publicWinnerRevealed = false;
  game.publicWinnerRevealToken = uid("winner_reveal");
  game.pendingWinner = null;
  game.currentStep = null;
  game.dayVote.open = false;
  game.mayorElection = { open: false, stage: "idle", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null };
  logPublic(winner.title, "winner");
  setTimeout(() => {
    if (game.winner !== winner || game.publicWinnerRevealed) return;
    if (!hasRegisteredViewer()) {
      releaseWinnerToPlayers(game.publicWinnerRevealToken);
      return;
    }
    const token = game.publicWinnerRevealToken;
    setTimeout(() => releaseWinnerToPlayers(token), WINNER_REVEAL_FALLBACK_MS);
  }, 2100);
}


function startMayorVoting() {
  if (!game.mayorElection.open) return { ok: false, error: "Er is geen burgemeesterfase actief." };

  // Herstemming na gelijke hoogste score: stem opnieuw alleen tussen de gedeelde top-kandidaten.
  if (game.mayorElection.stage === "result" && game.mayorElection.result?.runoffPending) {
    game.phase = "mayor";
    game.mayorElection.open = true;
    game.mayorElection.stage = "voting";
    game.mayorElection.runoffCandidates = game.mayorElection.result.runoffCandidates || game.mayorElection.runoffCandidates || null;
    game.mayorElection.votes = {};
    game.mayorElection.selections = {};
    game.mayorElection.result = null;
    for (const p of Object.values(game.players)) p.voteFor = null;
    autoSubmitBotSocialPhase();
    maybeAutoCloseMayorVoteIfComplete();
    logPublic(`Herstemming burgemeester tussen ${runoffText(currentMayorCandidates().map(p => p.name))}.`, "vote");
    return { ok: true, runoff: true };
  }

  if (game.mayorElection.stage !== "candidates") return { ok: false, error: "Er is geen kandidaatstellingsronde actief." };
  // Als de host doorklikt, tellen spelers die niet reageerden als "nee".
  markMissingMayorCandidateResponsesAsNo();
  const candidates = alivePlayers().filter(p => p.isCandidate);
  if (!candidates.length) {
    // Niemand wil burgemeester worden. Sluit de burgemeesterfase zonder burgemeester,
    // zodat de host daarna via het controlepaneel naar de open dagstemming kan.
    game.phase = "day";
    game.dayAftermath = { active: false, fromNight: false };
    game.mayorElection = {
      open: false,
      stage: "idle",
      votes: {},
      selections: {},
      responses: game.mayorElection.responses || {},
      result: { winnerKey: null, winnerName: null, tied: false, noCandidates: true, counts: [], automaticSingleCandidate: false },
      runoffCandidates: null
    };
    logPublic("Niemand heeft zich kandidaat gesteld voor burgemeester.", "vote");
    return { ok: true, skipped: true };
  }
  if (candidates.length === 1) {
    // Eén kandidaat: geen stemproces nodig. Die speler wordt direct burgemeester.
    for (const p of Object.values(game.players)) p.isMayor = false;
    const winner = candidates[0];
    winner.isMayor = true;
    game.phase = "mayor";
    game.dayAftermath = { active: false, fromNight: false };
    game.mayorElection.open = true;
    game.mayorElection.stage = "result";
    game.mayorElection.votes = {};
    game.mayorElection.selections = {};
    game.mayorElection.runoffCandidates = null;
    const revealStartedAt = Date.now();
    const automaticResult = {
      winnerKey: winner.key,
      winnerName: winner.name,
      tied: false,
      automaticSingleCandidate: true,
      counts: [{ key: winner.key, name: winner.name, votes: 1 }],
      revealStartedAt,
      revealUntil: revealStartedAt + 1200,
      revealDurationMs: 1200,
      revealToken: uid("mayor_auto_reveal"),
      publicRevealed: false,
    };
    game.mayorElection.result = automaticResult;
    scheduleResultReleaseFallback("mayor", automaticResult);
    logPublic(`${winner.name} is burgemeester geworden.`, "vote");
    return { ok: true, automatic: true };
  }
  game.mayorElection.stage = "voting";
  game.mayorElection.votes = {};
  game.mayorElection.selections = {};
  game.mayorElection.responses = game.mayorElection.responses || {};
  game.mayorElection.result = null;
  game.mayorElection.runoffCandidates = null;
  for (const p of Object.values(game.players)) p.voteFor = null;
  autoSubmitBotSocialPhase();
  maybeAutoCloseMayorVoteIfComplete();
  logPublic("De stemming voor de burgemeester is geopend.", "vote");
  return { ok: true };
}

function closeMayorElection({ fillMissing = true } = {}) {
  if (!game.mayorElection.open) return;
  if (game.mayorElection.stage !== "voting") {
    game.mayorElection = { open: false, stage: "idle", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null };
    logPublic("De burgemeesterverkiezing is gesloten zonder stemming.", "vote");
    return;
  }
  if (fillMissing) fillMissingMayorVotesRandom();
  const view = mayorElectionView();
  const top = view.candidates[0];
  const revealStartedAt = Date.now();
  let result = {
    winnerKey: null,
    winnerName: null,
    tied: false,
    tieReason: null,
    counts: view.candidates.map(c => ({ key: c.key, name: c.name, votes: c.votes || 0 })),
    revealStartedAt,
    revealUntil: revealStartedAt + VOTE_REVEAL_MS,
    revealDurationMs: VOTE_REVEAL_MS,
    revealToken: uid("mayor_reveal"),
    publicRevealed: false,
    runoffPending: false,
    runoffCandidates: null,
    runoffNames: null
  };
  if (!top || top.votes <= 0) {
    logPublic("Er is geen burgemeester gekozen.", "vote");
    game.mayorElection.runoffCandidates = null;
  } else {
    const tied = view.candidates.filter(c => c.votes === top.votes);
    if (tied.length > 1) {
      result.tied = true;
      result.tieReason = "gelijke score";
      result.runoffPending = true;
      result.runoffCandidates = tied.map(c => c.key);
      result.runoffNames = tied.map(c => c.name);
      game.mayorElection.runoffCandidates = result.runoffCandidates;
      logPublic(`Gelijke stand bij de burgemeesterverkiezing. Herstemming tussen ${runoffText(result.runoffNames)}.`, "vote");
    } else {
      for (const p of Object.values(game.players)) p.isMayor = false;
      const winner = game.players[top.key];
      if (winner) {
        winner.isMayor = true;
        result.winnerKey = winner.key;
        result.winnerName = winner.name;
        game.mayorElection.runoffCandidates = null;
        logPublic(`${winner.name} is burgemeester geworden.`, "vote");
      }
    }
  }
  game.phase = "mayor";
  game.mayorElection.open = true;
  game.mayorElection.stage = "result";
  game.mayorElection.result = result;
  scheduleResultReleaseFallback("mayor", result);
}

function closeDayVote({ fillMissing = true } = {}) {
  if (!game.dayVote.open) return;
  if (fillMissing) fillMissingDayVotesRandom();
  const view = dayVoteView();
  const top = view.counts[0];
  game.phase = "day";
  game.dayVote.open = false;
  const revealStartedAt = Date.now();
  const result = {
    counts: view.counts.map(c => ({ key: c.key, name: c.name, votes: c.votes || 0 })),
    eliminatedKey: null,
    eliminatedName: null,
    eliminatedRoleName: null,
    eliminatedRoleEmoji: null,
    eliminatedCardVariant: null,
    tied: false,
    revealStartedAt,
    revealUntil: revealStartedAt + VOTE_REVEAL_MS,
    revealDurationMs: VOTE_REVEAL_MS,
    revealToken: uid("day_vote_reveal"),
    publicRevealed: false,
    runoffPending: false,
    runoffCandidates: null,
    runoffNames: null
  };
  game.dayVote.result = result;
  scheduleResultReleaseFallback("day_vote", result);

  if (!top || top.votes <= 0) {
    logPublic("Er is niet gestemd. Niemand wordt geëlimineerd.", "vote");
    game.dayVote.runoffCandidates = null;
    return;
  }
  const tied = view.counts.filter(c => c.votes === top.votes);
  if (tied.length > 1) {
    result.tied = true;
    result.runoffPending = true;
    result.runoffCandidates = tied.map(c => c.key);
    result.runoffNames = tied.map(c => c.name);
    game.dayVote.runoffCandidates = result.runoffCandidates;
    logPublic(`Gelijke stand bij de dagstemming. Herstemming tussen ${runoffText(result.runoffNames)}.`, "vote");
    return;
  }
  game.dayVote.runoffCandidates = null;
  result.eliminatedKey = top.key;
  result.eliminatedName = top.name;
  const eliminatedPlayer = game.players[top.key];
  if (eliminatedPlayer?.roleId) {
    result.eliminatedRoleName = roleDef(eliminatedPlayer.roleId).name;
    result.eliminatedRoleEmoji = roleDef(eliminatedPlayer.roleId).emoji;
    result.eliminatedCardVariant = eliminatedPlayer.cardVariant || null;
  }
  game.dayVote.result = result;
  handleDeaths([{ key: top.key, cause: "vote", publicReason: "weggestemd door het dorp" }], { phase: "day", fromNight: false, deferWinner: true });
  result.linkedDeaths = (game.lastDeaths || [])
    .filter(d => d.cause === "love" && d.linkedToKey === top.key)
    .map(d => ({ ...d }));
  game.dayVote.result = result;
}

function resetGameKeepPlayers() {
  const oldPlayers = game.players;
  const oldSocketToKey = game.socketToKey;
  const oldSelectedRoleCounts = { ...game.selectedRoleCounts };
  const oldLobbyId = game.lobbyId;

  // Reset binnen dezelfde lobby: spelers blijven zitten, maar alle spelstatus wordt schoongemaakt.
  // Een nieuwe serverstart/nieuwe hostlobby krijgt nog steeds vanzelf een nieuwe lobbyId.
  game = newGame();
  game.lobbyId = oldLobbyId;
  game.players = oldPlayers;
  game.socketToKey = oldSocketToKey;
  game.selectedRoleCounts = oldSelectedRoleCounts;

  const connectedKeys = new Set(Object.values(oldSocketToKey || {}));
  for (const p of Object.values(game.players)) {
    p.roleId = null;
    p.alive = true;
    p.infected = false;
    p.wolfDogChoice = null;
    p.wildChildModelKey = null;
    p.wildChildTurned = false;
    p.loverKey = null;
    p.loverHeartPulse = null;
    p.enchanted = false;
    p.isMayor = false;
    p.isCandidate = false;
    p.voteFor = null;
    p.dayVoteFor = null;
    p.witchSaveUsed = false;
    p.witchPoisonUsed = false;
    p.infectUsed = false;
    p.foxPowerLost = false;
    p.elderWolfShieldUsed = false;
    p.cardVariant = null;
    p.cupidLoverKeys = [];
    p.foxKnowledge = [];
    p.seerKnowledge = {};
    p.privateLog = [];
    p.connected = !!p.isBot || connectedKeys.has(p.key);
  }

  // Zeker na debug/testspelers moet het aantal geselecteerde tegels weer bij de lobby passen.
  syncRoleCountToPlayers();
  logPublic("Het spel is gereset naar de lobby. Je kunt met dezelfde lobby opnieuw starten.", "phase");
}


function cleanupPlayerReferences(removedKey) {
  // Haal alle directe verwijzingen naar deze speler weg, zodat een gekickte speler
  // geen stemming, nachtstap, geliefde-link of wolvenkeuze meer blokkeert.
  for (const q of Object.values(game.players)) {
    if (q.loverKey === removedKey) q.loverKey = null;
    if (q.wildChildModelKey === removedKey) q.wildChildModelKey = null;
    if (q.voteFor === removedKey) q.voteFor = null;
    if (q.dayVoteFor === removedKey) q.dayVoteFor = null;
  }

  if (game.mayorElection?.votes) {
    delete game.mayorElection.votes[removedKey];
    for (const [voter, target] of Object.entries(game.mayorElection.votes)) {
      if (target === removedKey) delete game.mayorElection.votes[voter];
    }
  }
  if (game.dayVote?.votes) {
    delete game.dayVote.votes[removedKey];
    for (const [voter, target] of Object.entries(game.dayVote.votes)) {
      if (target === removedKey) delete game.dayVote.votes[voter];
    }
  }

  const cleanStep = (step) => {
    if (!step) return;
    step.actorKeys = (step.actorKeys || []).filter(k => k !== removedKey && game.players[k]?.alive);
    if (step.submissions) {
      delete step.submissions[removedKey];
      for (const [actorKey, sub] of Object.entries(step.submissions)) {
        if (sub?.targetKey === removedKey || (Array.isArray(sub?.targetKeys) && sub.targetKeys.includes(removedKey))) delete step.submissions[actorKey];
      }
    }
    if (step.previews) {
      delete step.previews[removedKey];
      for (const [actorKey, preview] of Object.entries(step.previews)) {
        if (
          preview?.targetKey === removedKey ||
          preview?.saveKey === removedKey ||
          preview?.poisonKey === removedKey ||
          (Array.isArray(preview?.targetKeys) && preview.targetKeys.includes(removedKey))
        ) delete step.previews[actorKey];
      }
    }
  };
  cleanStep(game.currentStep);
  for (const step of (game.nightSteps || [])) cleanStep(step);

  if (game.currentStep && (game.currentStep.actorKeys || []).length === 0) {
    game.currentStep.done = true;
    game.currentStep = null;
  }

  if (game.night) {
    const n = game.night;
    for (const field of ["wolfVictimKey", "wolfLockedTargetKey", "bigBadVictimKey", "whiteWolfVictimKey", "witchSaveKey", "witchPoisonKey", "infectedKey"]) {
      if (n[field] === removedKey) n[field] = null;
    }
    if (n.wolfSelections) {
      delete n.wolfSelections[removedKey];
      for (const [wolfKey, targetKey] of Object.entries(n.wolfSelections)) {
        if (targetKey === removedKey) delete n.wolfSelections[wolfKey];
      }
    }
    if (n.wolfVotes) {
      delete n.wolfVotes[removedKey];
      for (const [wolfKey, targetKey] of Object.entries(n.wolfVotes)) {
        if (targetKey === removedKey) delete n.wolfVotes[wolfKey];
      }
    }
    if (n.wolfConfirms) delete n.wolfConfirms[removedKey];
    if (n.wolfLocked && !n.wolfLockedTargetKey) {
      n.wolfLocked = false;
      n.wolfVictimKey = null;
    }
    if (Array.isArray(n.piperTargets)) n.piperTargets = n.piperTargets.filter(k => k !== removedKey);
  }

  if (game.pendingHunter === removedKey) {
    game.pendingHunter = null;
    const cont = game.pendingContinue || { phase: "day" };
    game.pendingContinue = null;
    if (cont.phase === "day") game.phase = "day";
  }

  let seat = 0;
  for (const q of orderedPlayers(true)) q.seat = seat++;
}

function kickPlayer(key) {
  const p = getPlayer(key);
  if (!p) return { ok: false, error: "Speler niet gevonden." };
  const name = p.name;
  const socketId = p.socketId;

  if (socketId) {
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      playerSocket.emit("join_denied", "Je bent door de host uit deze lobby verwijderd.");
      playerSocket.leave("player");
    }
    delete game.socketToKey[socketId];
  }

  delete game.players[key];
  cleanupPlayerReferences(key);
  if (!game.started) syncRoleCountToPlayers();

  logPublic(`${name} is door de host uit de lobby/game verwijderd.`, "debug");

  if (game.started && game.phase !== "ended") {
    const win = checkWinCondition();
    if (win) endGame(win);
  }
  return { ok: true };
}

function createTestPlayer() {
  if (game.started) return { ok: false, error: "Testspelers kun je alleen in de lobby toevoegen." };
  const key = uid("testplayer");
  const p = {
    key,
    socketId: null,
    name: uniqueName("", null),
    seat: Object.keys(game.players).length,
    connected: true,
    isBot: true,
    roleId: null,
    assignedRoleId: null,
    cardVariant: null,
    alive: true,
    infected: false,
    wolfDogChoice: null,
    wildChildModelKey: null,
    wildChildTurned: false,
    loverKey: null,
    loverHeartPulse: null,
    enchanted: false,
    isMayor: false,
    isCandidate: false,
    voteFor: null,
    dayVoteFor: null,
    witchSaveUsed: false,
    witchPoisonUsed: false,
    infectUsed: false,
    foxPowerLost: false,
    elderWolfShieldUsed: false,
    seerKnowledge: {},
    cupidLoverKeys: [],
    foxKnowledge: [],
    privateLog: []
  };
  game.players[key] = p;
  syncRoleCountToPlayers();
  logPublic(`${p.name} is als testspeler toegevoegd.`, "debug");
  return { ok: true, player: p };
}

io.on("connection", (socket) => {
  socket.emit("state", publicState());

  socket.on("register_host", () => {
    socket.join("host");
    socket.emit("host_state", hostState());
  });

  socket.on("register_viewer", () => {
    socket.join("viewer");
    socket.emit("state", publicState({ forViewer: true }));
  });

  socket.on("viewer_reveal_ack", ({ kind, token } = {}) => {
    if (!socket.rooms.has("viewer") || !token) return;
    if (kind === "winner") {
      releaseWinnerToPlayers(token);
      return;
    }
    if (kind === "deaths") {
      releaseDeathToPlayers(token);
      return;
    }
    if (kind === "hunter_intro") {
      advanceHunterIntro(token);
      return;
    }
    if (kind === "hunter_shot") {
      revealHunterShot(token);
      return;
    }
    if (kind === "mayor" || kind === "day_vote") releaseResultToPlayers(kind, token);
  });

  socket.on("join", ({ name, playerKey } = {}) => {
    socket.join("player");
    let key = String(playerKey || "").trim();
    let p = key ? game.players[key] : null;
    if (key && !p) {
      socket.emit("join_denied", "Deze oude speler-sessie hoort niet bij de huidige lobby. Vul je naam opnieuw in.");
      socket.emit("state", publicState());
      return;
    }
    if (!p) {
      if (game.started) {
        socket.emit("join_denied", "Het spel is al gestart. Nieuwe spelers kunnen nu niet meer joinen. Reconnecten kan alleen met een bestaande speler.");
        socket.emit("state", publicState());
        return;
      }
      key = uid("player");
      p = {
        key,
        socketId: socket.id,
        name: uniqueName(name || "", null),
        seat: Object.keys(game.players).length,
        connected: true,
        isBot: false,
        roleId: null,
        assignedRoleId: null,
        cardVariant: null,
        alive: true,
        infected: false,
        wolfDogChoice: null,
        wildChildModelKey: null,
        wildChildTurned: false,
        loverKey: null,
        loverHeartPulse: null,
        enchanted: false,
        isMayor: false,
        isCandidate: false,
        voteFor: null,
        dayVoteFor: null,
        witchSaveUsed: false,
        witchPoisonUsed: false,
        infectUsed: false,
        foxPowerLost: false,
        elderWolfShieldUsed: false,
        seerKnowledge: {},
        cupidLoverKeys: [],
        foxKnowledge: [],
        privateLog: []
      };
      game.players[key] = p;
    } else {
      p.socketId = socket.id;
      p.connected = true;
      if (!game.started && name) p.name = uniqueName(name, key);
    }
    game.socketToKey[socket.id] = key;
    socket.emit("joined", { playerKey: key, name: p.name, lobbyId: game.lobbyId });
    emitAll();
  });

  socket.on("rename", ({ name } = {}) => {
    const key = game.socketToKey[socket.id];
    const p = getPlayer(key);
    if (!p || game.started) return;
    p.name = uniqueName(name, p.key);
    emitAll();
  });

  socket.on("player_action", (payload) => handleAction(socket, payload));

  socket.on("player_preview", (payload = {}) => {
    const key = game.socketToKey[socket.id];
    const p = getPlayer(key);
    if (!p || !p.alive) return;
    if (payload.kind === "mayor_vote") {
      if (!game.mayorElection.open || game.mayorElection.stage !== "voting") return;
      if (game.mayorElection.votes[p.key]) return;
      game.mayorElection.selections = game.mayorElection.selections || {};
      if (!payload.targetKey) {
        delete game.mayorElection.selections[p.key];
        emitAll();
        return;
      }
      const target = getPlayer(payload.targetKey);
      if (!target || !target.alive || target.key === p.key) return;
      if (!target.isCandidate || !currentMayorCandidates().some(c => c.key === target.key)) return;
      game.mayorElection.selections[p.key] = target.key;
      emitAll();
      return;
    }
    if (payload.kind === "day_vote") {
      if (!game.dayVote.open || game.phase !== "voting") return;
      if (game.dayVote.votes[p.key]) return;
      game.dayVote.selections = game.dayVote.selections || {};
      if (!payload.targetKey) {
        delete game.dayVote.selections[p.key];
        emitAll();
        return;
      }
      const target = getPlayer(payload.targetKey);
      if (!target || !target.alive || target.key === p.key) return;
      if (!currentDayVoteTargets().some(t => t.key === target.key)) return;
      game.dayVote.selections[p.key] = target.key;
      emitAll();
      return;
    }

    const step = game.currentStep;
    if (!step || step.kind !== payload.kind || !step.actorKeys.includes(p.key) || step.submissions?.[p.key]) return;
    step.previews = step.previews || {};
    const action = actionForPlayer(p);
    const allowedOptions = new Set((action?.options || []).map(option => option.key));

    if (step.kind === "witch") {
      const pendingVictims = new Set(pendingNightVictims().filter(victimKey => isAlive(victimKey)));
      const saveKey = payload.saveKey && !p.witchSaveUsed && pendingVictims.has(payload.saveKey) ? payload.saveKey : null;
      const poisonKey = payload.poisonKey && !p.witchPoisonUsed && isAlive(payload.poisonKey) ? payload.poisonKey : null;
      step.previews[p.key] = {
        saveKey,
        saveName: saveKey ? game.players[saveKey]?.name || null : null,
        saveTarget: saveKey ? playerTargetOption(p, game.players[saveKey]) : null,
        poisonKey,
        poisonName: poisonKey ? game.players[poisonKey]?.name || null : null,
        poisonTarget: poisonKey ? playerTargetOption(p, game.players[poisonKey]) : null,
      };
      emitAll();
      return;
    }

    if (step.kind === "cupid" || step.kind === "piper") {
      const max = step.kind === "cupid" ? 2 : 2;
      const targetKeys = [...new Set(Array.isArray(payload.targetKeys) ? payload.targetKeys : [])]
        .filter(targetKey => allowedOptions.has(targetKey))
        .slice(0, max);
      if (!targetKeys.length) {
        delete step.previews[p.key];
        emitAll();
        return;
      }
      step.previews[p.key] = {
        targetKeys,
        targetNames: targetKeys.map(targetKey => game.players[targetKey]?.name || "?"),
        people: targetKeys.map(targetKey => playerTargetOption(p, game.players[targetKey])),
      };
      emitAll();
      return;
    }

    if (!payload.targetKey) {
      delete step.previews[p.key];
      emitAll();
      return;
    }
    if (allowedOptions.has(payload.targetKey)) {
      const target = getPlayer(payload.targetKey);
      step.previews[p.key] = {
        targetKey: target.key,
        targetName: target.name,
        targetCard: playerTargetOption(p, target),
      };
      emitAll();
    }
  });


  socket.on("host_set_role_count", ({ roleId, count } = {}) => {
    if (!ROLES[roleId] || game.started) return;
    const max = ROLES[roleId].max || 1;
    game.selectedRoleCounts[roleId] = Math.max(0, Math.min(max, Number(count || 0)));
    normalizePreassignedRoles();
    emitAll();
  });

  socket.on("host_assign_role", ({ playerKey, roleId } = {}) => {
    if (game.started) return;
    const player = getPlayer(playerKey);
    if (!player) return;
    if (!roleId) {
      player.assignedRoleId = null;
      emitAll();
      return;
    }
    if (!ROLES[roleId] || Number(game.selectedRoleCounts[roleId] || 0) < 1) {
      socket.emit("host_error", "Deze rol zit niet in het volgende spel.");
      return;
    }
    const assignedElsewhere = Number(preassignedRoleCounts(player.key)[roleId] || 0);
    if (assignedElsewhere >= Number(game.selectedRoleCounts[roleId] || 0)) {
      socket.emit("host_error", "Alle beschikbare exemplaren van deze rol zijn al toegewezen.");
      return;
    }
    player.assignedRoleId = roleId;
    emitAll();
  });

  socket.on("host_apply_preset", ({ preset } = {}) => {
    if (game.started) return;
    if (preset === "custom") {
      const counts = {};
      for (const r of roleList()) counts[r.id] = 0;
      game.selectedRoleCounts = counts;
      normalizePreassignedRoles();
      emitAll();
      return;
    }
    const n = alivePlayers().length || orderedPlayers(true).length || 8;
    const counts = {};
    if (preset === "basic") {
      Object.assign(counts, { villager: Math.max(0, n - 4), werewolf: 2, seer: 1, witch: 1 });
      if (n >= 8) counts.hunter = 1;
    } else if (preset === "bestof_light") {
      Object.assign(counts, { villager: Math.max(0, n - 7), werewolf: 2, seer: 1, witch: 1, cupid: 1, hunter: 1, fox: n >= 9 ? 1 : 0, infectious_wolf: n >= 10 ? 1 : 0 });
    } else if (preset === "chaos") {
      Object.assign(counts, { villager: Math.max(0, n - 10), werewolf: 2, infectious_wolf: 1, big_bad_wolf: 1, seer: 1, witch: 1, cupid: 1, hunter: 1, fox: 1, piper: n >= 10 ? 1 : 0 });
    }
    // Clamp totals by max.
    for (const r of roleList()) counts[r.id] = Math.max(0, Math.min(r.max, counts[r.id] || 0));
    // If too many, remove villagers first then extras from end.
    let total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > n) {
      const overflow = total - n;
      counts.villager = Math.max(0, (counts.villager || 0) - overflow);
    }
    total = Object.values(counts).reduce((a, b) => a + b, 0);
    while (total < n && (counts.villager || 0) < ROLES.villager.max) { counts.villager = (counts.villager || 0) + 1; total++; }
    game.selectedRoleCounts = counts;
    normalizePreassignedRoles();
    emitAll();
  });

  socket.on("host_start_game", () => {
    const result = startGame();
    if (!result.ok) socket.emit("host_error", result.error);
    emitAll();
  });

  socket.on("host_next_step", (payload = {}) => { hostNextStep({ force: !!payload.force }); emitAll(); });
  socket.on("host_skip_step", () => { skipCurrentStep(); emitAll(); });
  socket.on("host_resolve_night", () => { resolveNight(); emitAll(); });
  socket.on("host_start_next_night", () => { startNextNight(); emitAll(); });

  socket.on("host_open_mayor", () => {
    if (!game.started || game.phase === "ended") return;
    game.phase = "mayor";
    game.dayAftermath = { active: false, fromNight: false };
    game.mayorElection = { open: true, stage: "candidates", votes: {}, selections: {}, responses: {}, result: null, runoffCandidates: null };
    for (const p of Object.values(game.players)) { p.isCandidate = false; p.voteFor = null; }
    autoSubmitBotSocialPhase();
    logPublic("Spelers kunnen zich kandidaat stellen voor burgemeester.", "vote");
    emitAll();
  });
  socket.on("host_start_mayor_vote", () => {
    const result = startMayorVoting();
    if (!result.ok) socket.emit("host_error", result.error);
    emitAll();
  });
  socket.on("host_close_mayor", () => { closeMayorElection(); emitAll(); });

  socket.on("host_open_day_vote", () => {
    if (!game.started || game.phase === "ended") return;
    if (game.phase === "mayor" && game.mayorElection?.stage !== "result") return;
    openDayVoteAuto("De dagstemming is geopend.");
    emitAll();
  });
  socket.on("host_close_day_vote", () => { closeDayVote(); emitAll(); });

  socket.on("host_kick_player", ({ key } = {}) => {
    const result = kickPlayer(key);
    if (!result.ok) socket.emit("host_error", result.error);
    emitAll();
  });

  socket.on("host_manual_kill", ({ key, cause } = {}) => {
    const p = getPlayer(key);
    if (!p || !p.alive) return;
    handleDeaths([{ key: p.key, cause: cause || "manual", publicReason: "handmatig uitgeschakeld door de host" }], { phase: game.phase === "night" ? "night" : "day", fromNight: false });
    emitAll();
  });

  socket.on("host_manual_revive", ({ key } = {}) => {
    const p = getPlayer(key);
    if (!p) return;
    p.alive = true;
    logPublic(`${p.name} is handmatig teruggebracht.`, "safe");
    emitAll();
  });

  socket.on("host_set_mayor", ({ key } = {}) => {
    const p = getPlayer(key);
    if (!p || !p.alive) return;
    for (const q of Object.values(game.players)) q.isMayor = false;
    p.isMayor = true;
    logPublic(`${p.name} is door de host als burgemeester ingesteld.`, "vote");
    emitAll();
  });

  socket.on("host_note", ({ text } = {}) => {
    game.hostNote = String(text || "").slice(0, 160);
    emitAll();
  });

  socket.on("host_add_test_player", () => {
    const result = createTestPlayer();
    if (!result.ok) socket.emit("host_error", result.error);
    emitAll();
  });

  socket.on("host_debug_snapshot", () => {
    socket.emit("host_debug_snapshot", {
      version: VERSION,
      createdAt: game.createdAt,
      serverTime: Date.now(),
      hostState: hostState(),
      publicState: publicState(),
    });
  });

  socket.on("host_reset", () => { resetGameKeepPlayers(); emitAll(); });

  socket.on("disconnect", () => {
    const key = game.socketToKey[socket.id];
    const p = key ? game.players[key] : null;
    if (p) {
      if (!game.started && !p.isBot) {
        // Lobbyregel: vóór de start is tabblad dicht = speler uit de lobby.
        delete game.players[key];
        let seat = 0;
        for (const q of orderedPlayers(true)) q.seat = seat++;
      } else {
        // Na de start blijft de speler onderdeel van het spel en kan die later reconnecten.
        p.connected = false;
        p.socketId = null;
      }
    }
    delete game.socketToKey[socket.id];
    emitAll();
  });
});

server.listen(PORT, () => {
  console.log(`Wakkerdam Online Helper v${VERSION} listening on http://localhost:${PORT}`);
});
