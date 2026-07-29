"use strict";

const PEEK_MODES = Object.freeze(["eyelids", "mirror", "fog"]);

const PEEK_MODE_META = Object.freeze({
  eyelids: {
    number: 1,
    label: "Door je oogleden gluren",
    shortInstruction: "Houd ingedrukt om voorzichtig te kijken. Laat los zodra een wolf omkijkt.",
    firstInstruction: "Houd ingedrukt om je ogen voorzichtig te openen. Laat snel los wanneer een wolf omkijkt. Lang kijken maakt je beter zichtbaar.",
  },
  mirror: {
    number: 2,
    label: "De Spiegelscherf",
    shortInstruction: "Beweeg rustig en houd de scherf even stil boven één speler. Een snelle beweging veroorzaakt een lichtflits.",
    firstInstruction: "Sleep de scherf rustig naar één speler en houd hem daar even stil om goed te kunnen zien. Te snel bewegen of te lang kijken kan een lichtflits veroorzaken.",
  },
  fog: {
    number: 3,
    label: "De mist wegvegen",
    shortInstruction: "Maak korte, precieze vegen bij één speler. Een grote veeg verstoort de mist.",
    firstInstruction: "Veeg met een korte, precieze beweging een klein stuk mist bij één speler weg. Grote of wilde bewegingen kunnen door de wolven worden gezien.",
  },
});

function envFlag(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(value).trim().toLowerCase());
}

function peekFeaturesFromEnv(env = (typeof process !== "undefined" ? process.env : {})) {
  return {
    enabled: envFlag(env.WAKKERDAM_PEEK_ENABLED, true),
    modes: {
      eyelids: envFlag(env.WAKKERDAM_PEEK_EYELIDS_ENABLED, true),
      mirror: envFlag(env.WAKKERDAM_PEEK_MIRROR_ENABLED, true),
      fog: envFlag(env.WAKKERDAM_PEEK_FOG_ENABLED, true),
    },
  };
}

function cloneFeatures(features) {
  const source = features || {};
  return {
    enabled: source.enabled !== false,
    modes: {
      eyelids: source.modes?.eyelids !== false,
      mirror: source.modes?.mirror !== false,
      fog: source.modes?.fog !== false,
    },
  };
}

function activeModes(features) {
  const normalized = cloneFeatures(features);
  if (!normalized.enabled) return [];
  return PEEK_MODES.filter(mode => normalized.modes[mode]);
}

function createPeekState(features = peekFeaturesFromEnv()) {
  return {
    features: cloneFeatures(features),
    rotation: {
      bag: [],
      used: [],
      lastMode: null,
      currentMode: null,
    },
    instructionSeen: {
      eyelids: false,
      mirror: false,
      fog: false,
    },
    session: null,
  };
}

function normalizePeekState(value, fallbackFeatures = peekFeaturesFromEnv()) {
  const state = value && typeof value === "object" ? value : createPeekState(fallbackFeatures);
  state.features = cloneFeatures(state.features || fallbackFeatures);
  state.rotation = state.rotation && typeof state.rotation === "object" ? state.rotation : {};
  state.rotation.bag = Array.isArray(state.rotation.bag) ? state.rotation.bag.filter(mode => PEEK_MODES.includes(mode)) : [];
  state.rotation.used = Array.isArray(state.rotation.used) ? state.rotation.used.filter(mode => PEEK_MODES.includes(mode)) : [];
  state.rotation.lastMode = PEEK_MODES.includes(state.rotation.lastMode) ? state.rotation.lastMode : null;
  state.rotation.currentMode = PEEK_MODES.includes(state.rotation.currentMode) ? state.rotation.currentMode : null;
  state.instructionSeen = {
    eyelids: !!state.instructionSeen?.eyelids,
    mirror: !!state.instructionSeen?.mirror,
    fog: !!state.instructionSeen?.fog,
  };
  if (!state.session || typeof state.session !== "object") state.session = null;
  return state;
}

function shuffled(values, random = Math.random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function refillBag(state, random = Math.random) {
  const modes = activeModes(state.features);
  if (!modes.length) {
    state.rotation.bag = [];
    state.rotation.used = [];
    return [];
  }
  let bag = shuffled(modes, random);
  if (bag.length > 1 && bag[0] === state.rotation.lastMode) {
    const replacementIndex = bag.findIndex((mode, index) => index > 0 && mode !== state.rotation.lastMode);
    if (replacementIndex > 0) [bag[0], bag[replacementIndex]] = [bag[replacementIndex], bag[0]];
  }
  state.rotation.bag = bag;
  state.rotation.used = [];
  return bag;
}

function chooseNextMode(stateValue, random = Math.random) {
  const state = normalizePeekState(stateValue);
  const modes = activeModes(state.features);
  if (!modes.length) {
    state.rotation.bag = [];
    state.rotation.used = [];
    state.rotation.currentMode = null;
    return null;
  }
  state.rotation.bag = state.rotation.bag.filter(mode => modes.includes(mode));
  if (!state.rotation.bag.length) refillBag(state, random);
  if (state.rotation.bag.length > 1 && state.rotation.bag[0] === state.rotation.lastMode) {
    const replacementIndex = state.rotation.bag.findIndex((mode, index) => index > 0 && mode !== state.rotation.lastMode);
    if (replacementIndex > 0) {
      [state.rotation.bag[0], state.rotation.bag[replacementIndex]] = [state.rotation.bag[replacementIndex], state.rotation.bag[0]];
    }
  }
  const mode = state.rotation.bag.shift() || null;
  if (mode) {
    state.rotation.used.push(mode);
    state.rotation.lastMode = mode;
    state.rotation.currentMode = mode;
  }
  return mode;
}

function peekId(prefix = "peek") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-5)}`;
}

function startPeekSession(stateValue, {
  girlKey,
  wolfKeys = [],
  nightNumber = 0,
  now = Date.now(),
  random = Math.random,
  forcedMode = null,
  bot = false,
} = {}) {
  const state = normalizePeekState(stateValue);
  const enabled = activeModes(state.features);
  if (!girlKey || !enabled.length) {
    state.session = null;
    state.rotation.currentMode = null;
    return null;
  }
  const mode = enabled.includes(forcedMode) ? forcedMode : chooseNextMode(state, random);
  if (!mode) return null;
  if (forcedMode) {
    state.rotation.currentMode = forcedMode;
    state.rotation.lastMode = forcedMode;
  }
  const firstTime = !state.instructionSeen[mode];
  const lookDelay = 2800 + Math.floor(random() * 3400);
  state.session = {
    id: peekId("peek_session"),
    nightNumber,
    girlKey,
    wolfKeys: [...new Set(wolfKeys.filter(Boolean))],
    mode,
    status: bot ? "active" : "instruction",
    instructionFirstTime: firstTime,
    startedAt: now,
    activeAt: bot ? now : null,
    finishedAt: null,
    finishReason: null,
    remainingPeekMs: 4000,
    fogActionsRemaining: 4,
    risk: 0,
    detectionLevel: "none",
    warningToken: null,
    warningVersion: 0,
    warningCreatedAt: null,
    warningAckedBy: [],
    warningCleared: false,
    wolfLookAt: now + lookDelay,
    wolfLookUntil: now + lookDelay + 1150,
    lastInteractionAt: now,
    interaction: {
      active: false,
      startedAt: null,
      accountedAt: null,
      lastX: null,
      lastY: null,
      lastMoveAt: null,
      hoverKey: null,
      hoverStartedAt: null,
    },
    mirrorReveal: null,
    fogReveals: [],
    botSeenWolfKeys: [],
  };
  return state.session;
}

function acknowledgeInstruction(stateValue, now = Date.now()) {
  const state = normalizePeekState(stateValue);
  const session = state.session;
  if (!session || session.status !== "instruction") return false;
  state.instructionSeen[session.mode] = true;
  session.status = "active";
  session.activeAt = now;
  session.lastInteractionAt = now;
  return true;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function detectionRank(level) {
  return ({ none: 0, minor: 1, major: 2 })[level] || 0;
}

function triggerDetection(session, level = "major", now = Date.now()) {
  if (!session || !["minor", "major"].includes(level)) return false;
  if (detectionRank(level) <= detectionRank(session.detectionLevel)) return false;
  session.detectionLevel = level;
  session.warningVersion += 1;
  session.warningToken = peekId(`peek_warning_${level}`);
  session.warningCreatedAt = now;
  session.warningAckedBy = [];
  session.warningCleared = false;
  return true;
}

function isWolfLookActive(session, now = Date.now()) {
  return !!session && now >= Number(session.wolfLookAt || 0) && now <= Number(session.wolfLookUntil || 0);
}

function syncPeekSession(stateValue, now = Date.now()) {
  const state = normalizePeekState(stateValue);
  const session = state.session;
  if (!session || session.status !== "active") return session;

  if (session.mode === "eyelids" && session.interaction?.active) {
    const from = Math.max(
      Number(session.interaction.accountedAt || session.interaction.startedAt || now),
      Number(session.activeAt || session.startedAt || now)
    );
    const elapsed = clampNumber(now - from, 0, 1200);
    if (elapsed > 0) {
      const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
      session.remainingPeekMs = Math.max(0, Number(session.remainingPeekMs || 0) - elapsed);
      session.risk = clampNumber(
        Number(session.risk || 0) + elapsed / 1000 * (7 + Math.max(0, continuous - 900) / 260),
        0,
        100
      );
      session.interaction.accountedAt = now;
    }
    if (isWolfLookActive(session, now) && now - Number(session.interaction.startedAt || now) > 180) {
      session.risk = Math.max(session.risk, 100);
      triggerDetection(session, "major", now);
    } else if (session.risk >= 100) {
      triggerDetection(session, "major", now);
    }
    if (session.remainingPeekMs <= 0) {
      session.interaction.active = false;
      session.interaction.startedAt = null;
      session.interaction.accountedAt = null;
    }
  }

  session.fogReveals = (session.fogReveals || []).filter(reveal => Number(reveal.expiresAt || 0) > now);
  if (session.mirrorReveal && Number(session.mirrorReveal.expiresAt || 0) <= now) session.mirrorReveal = null;
  return session;
}

function canonicalPositions(players = []) {
  const ordered = players.slice().sort((a, b) => Number(a.seat || 0) - Number(b.seat || 0));
  const total = Math.max(1, ordered.length);
  return ordered.map((player, index) => {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    return {
      key: player.key,
      x: 0.5 + Math.cos(angle) * 0.36,
      y: 0.5 + Math.sin(angle) * 0.36,
    };
  });
}

function nearestPosition(positions, x, y, maximum = 0.145) {
  let result = null;
  let distance = Infinity;
  for (const position of positions) {
    const dx = position.x - x;
    const dy = position.y - y;
    const candidateDistance = Math.hypot(dx, dy);
    if (candidateDistance < distance) {
      distance = candidateDistance;
      result = position;
    }
  }
  return distance <= maximum ? result : null;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clampNumber(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function applyPeekInteraction(stateValue, payload = {}, {
  now = Date.now(),
  players = [],
  isWolfKey = () => false,
} = {}) {
  const state = normalizePeekState(stateValue);
  const session = syncPeekSession(state, now);
  if (!session || session.status !== "active") return { ok: false, reason: "inactive" };
  const kind = String(payload.kind || "");
  session.lastInteractionAt = now;

  if (session.mode === "eyelids") {
    if (kind === "hold_start" && session.remainingPeekMs > 0 && !session.interaction.active) {
      session.interaction.active = true;
      session.interaction.startedAt = now;
      session.interaction.accountedAt = now;
      return { ok: true };
    }
    if (kind === "hold_stop") {
      syncPeekSession(state, now);
      const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
      if (continuous > 1750) session.risk = clampNumber(session.risk + (continuous - 1750) / 75, 0, 100);
      if (session.risk >= 100) triggerDetection(session, "major", now);
      session.interaction.active = false;
      session.interaction.startedAt = null;
      session.interaction.accountedAt = null;
      return { ok: true };
    }
    return { ok: false, reason: "wrong_interaction" };
  }

  const x = clampNumber(payload.x, 0, 1);
  const y = clampNumber(payload.y, 0, 1);
  const positions = canonicalPositions(players);
  const interaction = session.interaction;

  if (session.mode === "mirror" && kind === "mirror_move") {
    const previousAt = Number(interaction.lastMoveAt || now);
    const elapsedMs = clampNumber(now - previousAt, 35, 650);
    const distance = interaction.lastX === null ? 0 : Math.hypot(x - interaction.lastX, y - interaction.lastY);
    const speed = distance / (elapsedMs / 1000);
    const target = nearestPosition(positions, x, y);
    if (target?.key !== interaction.hoverKey) {
      interaction.hoverKey = target?.key || null;
      interaction.hoverStartedAt = now;
    }
    const hoverMs = target ? Math.max(0, now - Number(interaction.hoverStartedAt || now)) : 0;
    const wolfHover = target && isWolfKey(target.key);
    session.risk = clampNumber(
      session.risk
        + distance * 18
        + Math.max(0, speed - 0.62) * 4.8
        + (wolfHover && hoverMs > 900 ? (elapsedMs / 1000) * 11 : 0),
      0,
      100
    );
    interaction.lastX = x;
    interaction.lastY = y;
    interaction.lastMoveAt = now;
    if (target) {
      session.mirrorReveal = {
        key: target.key,
        awakeWolf: !!isWolfKey(target.key) && hoverMs >= 480,
        expiresAt: now + 720,
      };
    }
    if (session.risk >= 100) triggerDetection(session, "major", now);
    else if (session.risk >= 76) triggerDetection(session, "minor", now);
    return { ok: true, revealKey: target?.key || null };
  }

  if (session.mode === "fog" && kind === "fog_swipe") {
    const start = {
      x: clampNumber(payload.startX, 0, 1),
      y: clampNumber(payload.startY, 0, 1),
    };
    const end = { x, y };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const durationMs = clampNumber(payload.durationMs, 80, 1800);
    if (distance < 0.055 || session.fogActionsRemaining <= 0) return { ok: false, reason: "too_small" };
    const speed = distance / (durationMs / 1000);
    const revealed = positions
      .filter(position => distanceToSegment(position, start, end) <= 0.1)
      .slice(0, 2);
    session.fogActionsRemaining = Math.max(0, session.fogActionsRemaining - 1);
    session.fogReveals = revealed.map(position => ({
      key: position.key,
      awakeWolf: !!isWolfKey(position.key),
      expiresAt: now + 1650,
    }));
    session.risk = clampNumber(
      session.risk
        + distance * 52
        + Math.max(0, speed - 0.72) * 7
        + Math.max(0, revealed.length - 1) * 9,
      0,
      100
    );
    interaction.lastX = x;
    interaction.lastY = y;
    interaction.lastMoveAt = now;
    if (session.risk >= 100) triggerDetection(session, "major", now);
    else if (session.risk >= 82) triggerDetection(session, "minor", now);
    return { ok: true, revealKeys: revealed.map(position => position.key) };
  }
  return { ok: false, reason: "wrong_interaction" };
}

function finishPeekSession(stateValue, reason = "wolves_finished", now = Date.now()) {
  const state = normalizePeekState(stateValue);
  const session = syncPeekSession(state, now);
  if (!session || ["finished", "cancelled"].includes(session.status)) return session;
  session.status = reason === "cancelled" || reason === "girl_dead" ? "cancelled" : "finished";
  session.finishedAt = now;
  session.finishReason = reason;
  session.interaction.active = false;
  session.interaction.startedAt = null;
  session.interaction.accountedAt = null;
  session.mirrorReveal = null;
  session.fogReveals = [];
  return session;
}

function instructionForSession(stateValue) {
  const state = normalizePeekState(stateValue);
  const session = state.session;
  if (!session) return null;
  const meta = PEEK_MODE_META[session.mode];
  return session.instructionFirstTime ? meta.firstInstruction : meta.shortInstruction;
}

function girlView(stateValue, { players = [], isWolfKey = () => false, now = Date.now() } = {}) {
  const state = normalizePeekState(stateValue);
  const session = syncPeekSession(state, now);
  if (!session) return null;
  const meta = PEEK_MODE_META[session.mode];
  const playerCircle = players
    .slice()
    .sort((a, b) => Number(a.seat || 0) - Number(b.seat || 0))
    .map(player => ({
      key: player.key,
      name: player.name,
      alive: player.alive !== false,
      cardVariant: player.cardVariant || 1,
      awakeWolf: session.mode === "eyelids" ? !!isWolfKey(player.key) : undefined,
    }));
  return {
    id: session.id,
    mode: session.mode,
    modeNumber: meta.number,
    modeLabel: meta.label,
    status: session.status,
    instruction: instructionForSession(state),
    firstInstruction: !!session.instructionFirstTime,
    remainingPeekMs: Math.round(session.remainingPeekMs),
    fogActionsRemaining: session.fogActionsRemaining,
    risk: Math.round(session.risk),
    detectionLevel: session.detectionLevel,
    caught: session.detectionLevel !== "none",
    wolfLookActive: session.mode === "eyelids" && isWolfLookActive(session, now),
    holding: !!session.interaction?.active,
    holdStartedAt: session.interaction?.startedAt || null,
    mirrorReveal: session.mirrorReveal ? { ...session.mirrorReveal } : null,
    fogReveals: (session.fogReveals || []).map(reveal => ({ ...reveal })),
    players: playerCircle,
    finishReason: session.finishReason || null,
  };
}

function silhouetteHint(girl, players = []) {
  const sorted = players.slice().sort((a, b) => Number(a.seat || 0) - Number(b.seat || 0));
  const index = Math.max(0, sorted.findIndex(player => player.key === girl?.key));
  const total = Math.max(1, sorted.length);
  const sectorIndex = Math.round((index / total) * 8) % 8;
  const sectors = ["boven", "rechtsboven", "rechts", "rechtsonder", "onder", "linksonder", "links", "linksboven"];
  const silhouettes = ["kort", "rond", "slank", "mantel"];
  const colors = ["oker", "donkerrood", "mosgroen", "leigrijs"];
  const seed = String(girl?.key || "girl").split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return {
    direction: sectors[sectorIndex],
    silhouette: silhouettes[seed % silhouettes.length],
    colorHint: colors[(Number(girl?.cardVariant || 1) - 1) % colors.length],
  };
}

function wolfWarningView(stateValue, wolfKey, { girl = null, players = [] } = {}) {
  const state = normalizePeekState(stateValue);
  const session = state.session;
  if (!session || session.detectionLevel === "none" || !session.warningToken || session.warningCleared) return null;
  if (!session.wolfKeys.includes(wolfKey) || session.warningAckedBy.includes(wolfKey)) return null;
  const copy = {
    eyelids: "Jullie zagen iemand tussen de bomen gluren…",
    mirror: "Er weerkaatste iets tussen de slapende dorpelingen…",
    fog: "Iemand bewoog zich door de mist…",
  };
  return {
    token: session.warningToken,
    mode: session.mode,
    level: session.detectionLevel,
    text: copy[session.mode],
    hint: silhouetteHint(girl, players),
  };
}

function acknowledgeWolfWarning(stateValue, wolfKey, token) {
  const state = normalizePeekState(stateValue);
  const session = state.session;
  if (!session || !session.warningToken || session.warningToken !== token || !session.wolfKeys.includes(wolfKey)) return false;
  session.warningAckedBy = [...new Set([...(session.warningAckedBy || []), wolfKey])];
  return true;
}

function hostPeekView(stateValue, now = Date.now()) {
  const state = normalizePeekState(stateValue);
  const session = syncPeekSession(state, now);
  const modes = activeModes(state.features);
  return {
    enabled: !!state.features.enabled,
    activeModes: modes,
    rotation: {
      bag: state.rotation.bag.slice(),
      used: state.rotation.used.slice(),
      lastMode: state.rotation.lastMode,
      currentMode: state.rotation.currentMode,
    },
    session: session ? {
      id: session.id,
      girlKey: session.girlKey,
      mode: session.mode,
      modeNumber: PEEK_MODE_META[session.mode]?.number || null,
      modeLabel: PEEK_MODE_META[session.mode]?.label || session.mode,
      status: session.status,
      risk: Math.round(session.risk),
      detectionLevel: session.detectionLevel,
      remainingPeekMs: Math.round(session.remainingPeekMs),
      fogActionsRemaining: session.fogActionsRemaining,
      wolfLookActive: isWolfLookActive(session, now),
      finishReason: session.finishReason || null,
    } : null,
  };
}

function simulateRotation({
  count = 12,
  features = peekFeaturesFromEnv(),
  random = Math.random,
} = {}) {
  const state = createPeekState(features);
  const sequence = [];
  for (let index = 0; index < count; index += 1) sequence.push(chooseNextMode(state, random));
  return { sequence, state };
}

function validateRotation(sequence, features = peekFeaturesFromEnv()) {
  const modes = activeModes(features);
  const errors = [];
  if (!modes.length) return { ok: sequence.every(mode => mode === null), errors };
  for (let index = 0; index < sequence.length; index += 1) {
    const mode = sequence[index];
    if (!modes.includes(mode)) errors.push(`Nacht ${index + 1}: uitgeschakelde of onbekende optie ${mode}.`);
    if (modes.length > 1 && index > 0 && sequence[index - 1] === mode) errors.push(`Nacht ${index + 1}: ${mode} kwam tweemaal achter elkaar.`);
  }
  for (let start = 0; start + modes.length <= sequence.length; start += modes.length) {
    const cycle = sequence.slice(start, start + modes.length);
    if (new Set(cycle).size !== modes.length || modes.some(mode => !cycle.includes(mode))) {
      errors.push(`Cyclus ${start / modes.length + 1} bevat niet iedere actieve optie precies eenmaal.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const PEEK_API = {
  PEEK_MODES,
  PEEK_MODE_META,
  peekFeaturesFromEnv,
  activeModes,
  createPeekState,
  normalizePeekState,
  chooseNextMode,
  startPeekSession,
  acknowledgeInstruction,
  applyPeekInteraction,
  syncPeekSession,
  finishPeekSession,
  triggerDetection,
  girlView,
  wolfWarningView,
  acknowledgeWolfWarning,
  hostPeekView,
  simulateRotation,
  validateRotation,
};

if (typeof module !== "undefined" && module.exports) module.exports = PEEK_API;
if (typeof window !== "undefined") window.WakkerdamPeekRules = PEEK_API;
