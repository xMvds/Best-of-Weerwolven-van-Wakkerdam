"use strict";

const PEEK_MODES = Object.freeze(["eyelids", "mirror", "fog"]);

const PEEK_MODE_CONFIG = Object.freeze({
  eyelids: Object.freeze({
    timeBudgetMs: 4000,
    baseRiskPerSecond: 5.4,
    continuousRiskMs: 3200,
  }),
  mirror: Object.freeze({
    timeBudgetMs: 8000,
    baseRiskPerSecond: 3.8,
    continuousRiskMs: 6200,
    moveRisk: 13,
    speedRisk: 3.6,
    wolfEyesRevealMs: 780,
    wolfEyesFullFocusMs: 1800,
    wolfEyesRiskPerSecond: 18,
    wolfEyesRiskRampPerSecond: 14,
  }),
  fog: Object.freeze({
    timeBudgetMs: 15000,
    baseRiskPerSecond: 2.8,
    continuousRiskMs: 9800,
    moveRisk: 22,
    speedRisk: 1.8,
    wolfFocusRiskPerSecond: 5.5,
  }),
});

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
    shortInstruction: "Duw de mist rustig opzij. Blijf langer bij één speler om die langzaam zichtbaar te maken.",
    firstInstruction: "Je hebt vijftien seconden om de mist rustig weg te duwen. Sleep of blijf op één plek drukken: pas na langer poetsen wordt een speler echt zichtbaar. Wild heen en weer bewegen kan je verraden.",
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
  if (!state.session || typeof state.session !== "object") {
    state.session = null;
  } else {
    const config = PEEK_MODE_CONFIG[state.session.mode] || PEEK_MODE_CONFIG.eyelids;
    const storedTestBudget = Number(state.session.testTimeBudgetMs);
    const timeBudgetMs = Number.isFinite(storedTestBudget)
      ? clampNumber(storedTestBudget, 100, 60000)
      : config.timeBudgetMs;
    const legacyRemainingFog = state.session.mode === "fog"
      ? Number(state.session.remainingFogMs)
      : NaN;
    const storedRemaining = Number(state.session.remainingPeekMs);
    const remainingPeekMs = Number.isFinite(legacyRemainingFog)
      && (!Number.isFinite(storedRemaining) || legacyRemainingFog > storedRemaining)
      ? legacyRemainingFog
      : (Number.isFinite(storedRemaining) ? storedRemaining : timeBudgetMs);
    state.session.remainingPeekMs = clampNumber(remainingPeekMs, 0, timeBudgetMs);
    state.session.testTimeBudgetMs = Number.isFinite(storedTestBudget) ? timeBudgetMs : undefined;
    state.session.testCautionStrength = Number.isFinite(Number(state.session.testCautionStrength))
      ? clampNumber(state.session.testCautionStrength, 25, 400)
      : undefined;
    state.session.testRiskMultiplier = Number.isFinite(Number(state.session.testRiskMultiplier))
      ? clampNumber(state.session.testRiskMultiplier, .1, 4)
      : undefined;
    state.session.timeExpiredAt = state.session.remainingPeekMs <= 0
      ? Number(state.session.timeExpiredAt || Date.now())
      : null;
    state.session.remainingFogMs = state.session.mode === "fog"
      ? state.session.remainingPeekMs
      : clampNumber(state.session.remainingFogMs ?? PEEK_MODE_CONFIG.fog.timeBudgetMs, 0, PEEK_MODE_CONFIG.fog.timeBudgetMs);
    state.session.risk = clampNumber(state.session.risk ?? 0, 0, 100);
    state.session.lastRiskSyncAt = Number(state.session.lastRiskSyncAt ?? Date.now());
    // Oudere builds konden hier een tijdelijke inputblokkade bewaren. Vanaf
    // v0.3.65 is risico uitsluitend informatie/ontdekking en nooit een lock.
    state.session.cooldownUntil = 0;
    state.session.wolfKeys = Array.isArray(state.session.wolfKeys) ? [...new Set(state.session.wolfKeys.filter(Boolean))] : [];
    state.session.wolfLookKey = state.session.wolfKeys.includes(state.session.wolfLookKey)
      ? state.session.wolfLookKey
      : (state.session.wolfKeys[0] || null);
    state.session.fogExposure = state.session.fogExposure && typeof state.session.fogExposure === "object"
      ? state.session.fogExposure
      : {};
    state.session.fogReveals = Array.isArray(state.session.fogReveals) ? state.session.fogReveals : [];
    state.session.interaction = state.session.interaction && typeof state.session.interaction === "object"
      ? state.session.interaction
      : {};
  }
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
  const timeBudgetMs = PEEK_MODE_CONFIG[mode]?.timeBudgetMs || PEEK_MODE_CONFIG.eyelids.timeBudgetMs;
  const normalizedWolfKeys = [...new Set(wolfKeys.filter(Boolean))];
  const wolfLookKey = normalizedWolfKeys.length
    ? normalizedWolfKeys[Math.floor(random() * normalizedWolfKeys.length)]
    : null;
  state.session = {
    id: peekId("peek_session"),
    nightNumber,
    girlKey,
    wolfKeys: normalizedWolfKeys,
    wolfLookKey,
    mode,
    status: bot ? "active" : "instruction",
    instructionFirstTime: firstTime,
    startedAt: now,
    activeAt: bot ? now : null,
    finishedAt: null,
    finishReason: null,
    remainingPeekMs: timeBudgetMs,
    remainingFogMs: mode === "fog" ? timeBudgetMs : PEEK_MODE_CONFIG.fog.timeBudgetMs,
    timeExpiredAt: null,
    risk: 0,
    lastRiskSyncAt: now,
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
      wolfExposureStartedAt: null,
      lastFogBrushAt: null,
    },
    mirrorReveal: null,
    fogExposure: {},
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

function sessionRiskMultiplier(session) {
  const value = Number(session?.testRiskMultiplier);
  return Number.isFinite(value) ? clampNumber(value, .1, 4) : 1;
}

function detectionRank(level) {
  return ({ none: 0, minor: 1, major: 2 })[level] || 0;
}

function triggerDetection(session, level = "major", now = Date.now()) {
  if (!session || !["minor", "major"].includes(level)) return false;
  // Een volledige betrapping mag nooit via een verborgen tijd- of
  // focusdrempel ontstaan. De zichtbare risicobalk is de enige bron van
  // waarheid: pas exact op 100% wordt de identiteit onthuld.
  if (level === "major" && Number(session.risk || 0) < 100) return false;
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

function mirrorWolfEyeFocus(session, now = Date.now()) {
  const config = PEEK_MODE_CONFIG.mirror;
  const hoverKey = session?.interaction?.hoverKey || null;
  if (
    session?.mode !== "mirror"
    || !session.interaction?.active
    || !hoverKey
    || !session.wolfKeys.includes(hoverKey)
  ) {
    return {
      active: false,
      key: null,
      focusedMs: 0,
      eyeContactMs: 0,
      strength: 0,
      riskPerSecond: 0,
    };
  }
  const focusedMs = Math.max(0, now - Number(session.interaction.hoverStartedAt || now));
  const eyeContactMs = Math.max(0, focusedMs - Number(config.wolfEyesRevealMs || 780));
  const active = eyeContactMs > 0;
  const strength = active
    ? clampNumber(eyeContactMs / Number(config.wolfEyesFullFocusMs || 1800), 0, 1)
    : 0;
  return {
    active,
    key: hoverKey,
    focusedMs,
    eyeContactMs,
    strength,
    riskPerSecond: active
      ? Number(config.wolfEyesRiskPerSecond || 0)
        + strength * Number(config.wolfEyesRiskRampPerSecond || 0)
      : 0,
  };
}

function syncRiskCooling(session, now = Date.now()) {
  if (!session) return;
  const previous = Number(session.lastRiskSyncAt || now);
  const elapsed = clampNumber(now - previous, 0, 1200);
  session.lastRiskSyncAt = now;
  if (!session.interaction?.active && elapsed > 0 && Number(session.risk || 0) > 0) {
    session.risk = clampNumber(Number(session.risk || 0) - (elapsed / 1000) * 10, 0, 100);
  }
}

function riskTrendPerSecond(session, now = Date.now()) {
  if (!session || Number(session.risk || 0) <= 0 && !session.interaction?.active) return 0;
  if (!session.interaction?.active) return -10;
  const config = PEEK_MODE_CONFIG[session.mode] || PEEK_MODE_CONFIG.eyelids;
  const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
  const continuousSeconds = continuous / 1000;
  const continuousRiskMs = Number(config.continuousRiskMs || 3200);
  const normalized = clampNumber(continuous / continuousRiskMs, 0, 1);
  const continuousCurveRate = normalized > 0
    ? (100 * 1.35 / (continuousRiskMs / 1000)) * Math.pow(normalized, 0.35)
    : 0;
  const wolfLookRate = session.mode === "eyelids" && isWolfLookActive(session, now) ? 58 : 0;
  const focusedWolfMs = session.mode === "fog"
    && session.wolfKeys.includes(session.interaction?.hoverKey)
    ? Math.max(0, now - Number(session.interaction?.hoverStartedAt || now))
    : 0;
  const focusedWolfRate = focusedWolfMs > 1000
    ? Number(config.wolfFocusRiskPerSecond || 0)
    : 0;
  const mirrorEyeRate = session.mode === "mirror"
    ? mirrorWolfEyeFocus(session, now).riskPerSecond
    : 0;
  return (Math.max(
    Number(config.baseRiskPerSecond || 0)
      + (session.mode === "eyelids" ? Math.max(0, continuous - 850) / 260 : 0),
    continuousCurveRate
  ) + wolfLookRate + focusedWolfRate + mirrorEyeRate + (session.mode === "eyelids" ? Math.min(5, continuousSeconds * 1.15) : 0)) * sessionRiskMultiplier(session);
}

function stopInteraction(session) {
  if (!session?.interaction) return;
  session.interaction.active = false;
  session.interaction.startedAt = null;
  session.interaction.accountedAt = null;
  session.interaction.lastX = null;
  session.interaction.lastY = null;
  session.interaction.lastMoveAt = null;
  session.interaction.hoverKey = null;
  session.interaction.hoverStartedAt = null;
  session.interaction.wolfExposureStartedAt = null;
  session.interaction.lastFogBrushAt = null;
}

function consumePeekTime(session, elapsedMs) {
  if (!session || elapsedMs <= 0) return;
  session.remainingPeekMs = Math.max(0, Number(session.remainingPeekMs || 0) - elapsedMs);
  if (session.mode === "fog") session.remainingFogMs = session.remainingPeekMs;
}

function finishRiskStep(session, now = Date.now()) {
  if (!session) return;
  if (Number(session.risk || 0) >= 100) {
    session.risk = 100;
    triggerDetection(session, "major", now);
  }
}

function syncPeekSession(stateValue, now = Date.now()) {
  const state = normalizePeekState(stateValue);
  const session = state.session;
  if (!session || session.status !== "active") return session;
  syncRiskCooling(session, now);

  if (session.mode === "eyelids" && session.interaction?.active) {
    const config = PEEK_MODE_CONFIG.eyelids;
    const riskMultiplier = sessionRiskMultiplier(session);
    const from = Math.max(
      Number(session.interaction.accountedAt || session.interaction.startedAt || now),
      Number(session.activeAt || session.startedAt || now)
    );
    const elapsed = clampNumber(now - from, 0, 1200);
    const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
    const wolfLooking = isWolfLookActive(session, now);
    if (elapsed > 0) {
      consumePeekTime(session, elapsed);
      session.risk = clampNumber(
        Number(session.risk || 0) + elapsed / 1000 * riskMultiplier * (
          config.baseRiskPerSecond
          + Math.max(0, continuous - 850) / 260
          + (wolfLooking ? 58 : 0)
        ),
        0,
        100
      );
      const continuousRisk = 100 * riskMultiplier * Math.pow(clampNumber(continuous / config.continuousRiskMs, 0, 1), 1.35);
      session.risk = Math.max(session.risk, continuousRisk);
      session.interaction.accountedAt = now;
    }
    if (wolfLooking) {
      if (!session.interaction.wolfExposureStartedAt) session.interaction.wolfExposureStartedAt = now;
    } else {
      session.interaction.wolfExposureStartedAt = null;
    }
    if (session.risk >= 58 || continuous >= 1650) {
      triggerDetection(session, "minor", now);
    }
    finishRiskStep(session, now);
    if (session.remainingPeekMs <= 0) {
      stopInteraction(session);
    }
  }

  if (session.mode === "mirror" && session.interaction?.active) {
    const config = PEEK_MODE_CONFIG.mirror;
    const riskMultiplier = sessionRiskMultiplier(session);
    const from = Math.max(
      Number(session.interaction.accountedAt || session.interaction.startedAt || now),
      Number(session.activeAt || session.startedAt || now)
    );
    const elapsed = clampNumber(now - from, 0, 1200);
    const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
    const eyeFocus = mirrorWolfEyeFocus(session, now);
    if (elapsed > 0) {
      consumePeekTime(session, elapsed);
      session.risk = clampNumber(
        Number(session.risk || 0) + elapsed / 1000 * riskMultiplier * (config.baseRiskPerSecond + eyeFocus.riskPerSecond),
        0,
        100
      );
      session.risk = Math.max(
        session.risk,
        100 * riskMultiplier * Math.pow(clampNumber(continuous / config.continuousRiskMs, 0, 1), 1.35)
      );
      session.interaction.accountedAt = now;
    }
    if (session.remainingPeekMs <= 0) {
      stopInteraction(session);
    }
    if (session.risk >= 58 || continuous >= config.continuousRiskMs * .58) {
      triggerDetection(session, "minor", now);
    }
    finishRiskStep(session, now);
  }

  if (session.mode === "fog" && session.interaction?.active) {
    const config = PEEK_MODE_CONFIG.fog;
    const riskMultiplier = sessionRiskMultiplier(session);
    const from = Math.max(
      Number(session.interaction.accountedAt || session.interaction.startedAt || now),
      Number(session.activeAt || session.startedAt || now)
    );
    const elapsed = clampNumber(now - from, 0, 1200);
    const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
    const focusedWolfMs = session.wolfKeys.includes(session.interaction.hoverKey)
      ? Math.max(0, now - Number(session.interaction.hoverStartedAt || now))
      : 0;
    const focusedWolfRate = focusedWolfMs > 1000 ? Number(config.wolfFocusRiskPerSecond || 0) : 0;
    if (elapsed > 0) {
      consumePeekTime(session, elapsed);
      session.risk = clampNumber(
        Number(session.risk || 0) + elapsed / 1000 * riskMultiplier * (config.baseRiskPerSecond + focusedWolfRate),
        0,
        100
      );
      session.risk = Math.max(
        session.risk,
        100 * riskMultiplier * Math.pow(clampNumber(continuous / config.continuousRiskMs, 0, 1), 1.35)
      );
      session.interaction.accountedAt = now;
    }
    if (session.risk >= 58 || continuous >= config.continuousRiskMs * .58) {
      triggerDetection(session, "minor", now);
    }
    finishRiskStep(session, now);
    if (session.remainingPeekMs <= 0) {
      stopInteraction(session);
    }
  }

  if (Number(session.remainingPeekMs || 0) <= 0) {
    session.remainingPeekMs = 0;
    if (session.mode === "fog") session.remainingFogMs = 0;
    if (!session.timeExpiredAt) session.timeExpiredAt = now;
    stopInteraction(session);
  }

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
      x: 0.5 + Math.cos(angle) * 0.3,
      y: 0.5 + Math.sin(angle) * 0.3,
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
    if (
      kind === "hold_start"
      && session.remainingPeekMs > 0
      && !session.interaction.active
    ) {
      session.interaction.active = true;
      session.interaction.startedAt = now;
      session.interaction.accountedAt = now;
      session.interaction.wolfExposureStartedAt = null;
      return { ok: true };
    }
    if (kind === "hold_start" && session.remainingPeekMs > 0 && session.interaction.active) {
      return { ok: true };
    }
    if (kind === "hold_stop") {
      syncPeekSession(state, now);
      const continuous = Math.max(0, now - Number(session.interaction.startedAt || now));
      if (session.risk >= 58 || continuous >= 1650) triggerDetection(session, "minor", now);
      stopInteraction(session);
      finishRiskStep(session, now);
      return { ok: true };
    }
    return { ok: false, reason: "wrong_interaction" };
  }

  const x = clampNumber(payload.x, 0, 1);
  const y = clampNumber(payload.y, 0, 1);
  const positions = canonicalPositions(players);
  const interaction = session.interaction;

  if (session.mode === "mirror" && kind === "mirror_start") {
    if (Number(session.remainingPeekMs || 0) <= 0) return { ok: false, reason: "resource_empty" };
    interaction.active = true;
    interaction.startedAt = now;
    interaction.accountedAt = now;
    interaction.lastX = x;
    interaction.lastY = y;
    interaction.lastMoveAt = now;
    interaction.hoverKey = null;
    interaction.hoverStartedAt = now;
    return { ok: true };
  }

  if (session.mode === "mirror" && kind === "mirror_move") {
    if (Number(session.remainingPeekMs || 0) <= 0) {
      stopInteraction(session);
      return { ok: false, reason: "resource_empty" };
    }
    if (!interaction.active) {
      interaction.active = true;
      interaction.startedAt = now;
      interaction.accountedAt = now;
    }
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
    const config = PEEK_MODE_CONFIG.mirror;
    const riskMultiplier = sessionRiskMultiplier(session);
    session.risk = clampNumber(
      session.risk
        + riskMultiplier * (
          distance * config.moveRisk
          + Math.max(0, speed - 0.72) * config.speedRisk
        ),
      0,
      100
    );
    interaction.lastX = x;
    interaction.lastY = y;
    interaction.lastMoveAt = now;
    if (target) {
      const strength = clampNumber(hoverMs / 1150, 0.05, 1);
      session.mirrorReveal = {
        key: target.key,
        strength,
        awakeWolf: !!isWolfKey(target.key) && strength >= 0.68,
        expiresAt: now + 850,
      };
    }
    if (session.risk >= 58) triggerDetection(session, "minor", now);
    finishRiskStep(session, now);
    return { ok: true, revealKey: target?.key || null };
  }

  if (session.mode === "mirror" && kind === "mirror_stop") {
    syncPeekSession(state, now);
    stopInteraction(session);
    finishRiskStep(session, now);
    return { ok: true };
  }

  if (session.mode === "fog" && kind === "fog_brush_start") {
    if (Number(session.remainingPeekMs || 0) <= 0) return { ok: false, reason: "resource_empty" };
    session.interaction.active = true;
    session.interaction.startedAt = now;
    session.interaction.accountedAt = now;
    session.interaction.lastFogBrushAt = now;
    interaction.lastX = x;
    interaction.lastY = y;
    interaction.lastMoveAt = now;
    return { ok: true };
  }

  if (session.mode === "fog" && kind === "fog_brush") {
    if (Number(session.remainingPeekMs || 0) <= 0) return { ok: false, reason: "resource_empty" };
    if (!interaction.active) {
      interaction.active = true;
      interaction.startedAt = now;
      interaction.accountedAt = now;
      interaction.lastFogBrushAt = now;
      interaction.lastX = x;
      interaction.lastY = y;
      interaction.lastMoveAt = now;
    }
    const previousAt = Number(interaction.lastFogBrushAt || interaction.lastMoveAt || now - 80);
    const elapsedMs = clampNumber(now - previousAt, 28, 260);
    const distance = interaction.lastX === null ? 0 : Math.hypot(x - interaction.lastX, y - interaction.lastY);
    const speed = distance / Math.max(0.028, elapsedMs / 1000);
    const brushRadius = 0.16;
    const touched = positions
      .map(position => ({ ...position, distance: Math.hypot(position.x - x, position.y - y) }))
      .filter(position => position.distance <= brushRadius)
      .sort((a, b) => a.distance - b.distance);
    const focusTarget = touched[0] || null;
    if (focusTarget?.key !== interaction.hoverKey) {
      interaction.hoverKey = focusTarget?.key || null;
      interaction.hoverStartedAt = now;
    }
    const focusMs = focusTarget ? Math.max(0, now - Number(interaction.hoverStartedAt || now)) : 0;
    session.fogExposure = session.fogExposure && typeof session.fogExposure === "object"
      ? session.fogExposure
      : {};
    for (const position of touched) {
      const falloff = clampNumber(1 - position.distance / brushRadius, 0.08, 1);
      const previous = Number(session.fogExposure[position.key] || 0);
      session.fogExposure[position.key] = clampNumber(previous + (elapsedMs / 3500) * falloff, 0, 1);
    }
    session.fogReveals = Object.entries(session.fogExposure)
      .filter(([, strength]) => Number(strength) > 0.015)
      .map(([key, strength]) => ({
        key,
        strength: clampNumber(strength, 0, 1),
        awakeWolf: !!isWolfKey(key) && Number(strength) >= 0.68,
      }));
    const config = PEEK_MODE_CONFIG.fog;
    const riskMultiplier = sessionRiskMultiplier(session);
    session.risk = clampNumber(
      Number(session.risk || 0)
        + riskMultiplier * (
          distance * config.moveRisk
          + Math.max(0, speed - 0.68) * config.speedRisk
          + Math.max(0, touched.length - 1) * 0.25
        ),
      0,
      100
    );
    interaction.lastFogBrushAt = now;
    interaction.lastX = x;
    interaction.lastY = y;
    interaction.lastMoveAt = now;
    if (session.risk >= 58) triggerDetection(session, "minor", now);
    finishRiskStep(session, now);
    return {
      ok: true,
      revealKeys: touched.map(position => position.key),
      remainingFogMs: Math.round(session.remainingPeekMs),
    };
  }

  if (session.mode === "fog" && kind === "fog_brush_stop") {
    syncPeekSession(state, now);
    stopInteraction(session);
    finishRiskStep(session, now);
    return { ok: true };
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
  stopInteraction(session);
  session.mirrorReveal = null;
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
  const mirrorEyeFocus = mirrorWolfEyeFocus(session, now);
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
    remainingFogMs: Math.round(session.mode === "fog" ? session.remainingPeekMs : session.remainingFogMs ?? PEEK_MODE_CONFIG.fog.timeBudgetMs),
    timeBudgetMs: Number(session.testTimeBudgetMs || PEEK_MODE_CONFIG[session.mode]?.timeBudgetMs || PEEK_MODE_CONFIG.eyelids.timeBudgetMs),
    testTimeBudgetMs: session.testTimeBudgetMs || undefined,
    testCautionStrength: session.testCautionStrength || undefined,
    testRiskMultiplier: session.testRiskMultiplier || undefined,
    risk: Math.round(session.risk),
    riskTrendPerSecond: riskTrendPerSecond(session, now),
    timeExpired: Number(session.remainingPeekMs || 0) <= 0,
    timeExpiredAt: session.timeExpiredAt || null,
    detectionLevel: session.detectionLevel,
    caught: session.detectionLevel === "major",
    noticed: session.detectionLevel === "minor",
    cooling: false,
    wolfLookActive: session.mode === "eyelids" && isWolfLookActive(session, now),
    mirrorEyeContactActive: mirrorEyeFocus.active,
    mirrorEyeContactStrength: mirrorEyeFocus.strength,
    mirrorEyeContactKey: mirrorEyeFocus.key,
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

function wolfWarningView(stateValue, wolfKey, { girl = null, players = [], now = Date.now() } = {}) {
  const state = normalizePeekState(stateValue);
  const session = syncPeekSession(state, now);
  if (!session || !session.wolfKeys.includes(wolfKey) || !["active", "finished"].includes(session.status)) return null;
  const fullyCaught = session.detectionLevel === "major";
  const mirrorEyeFocus = mirrorWolfEyeFocus(session, now);
  const activelyObserved = !!session.interaction?.active && (
    session.mode === "eyelids"
      ? session.wolfLookKey === wolfKey
      : session.interaction.hoverKey === wolfKey
  );
  if (!fullyCaught && !activelyObserved) return null;
  const continuousMs = session.interaction?.active
    ? Math.max(0, now - Number(session.interaction.startedAt || now))
    : 0;
  const eyeContact = !fullyCaught
    && session.mode === "mirror"
    && mirrorEyeFocus.active
    && mirrorEyeFocus.key === wolfKey;
  const baseAwareness = fullyCaught
    ? 1
    : clampNumber(
        Number(session.risk || 0) / 150
        + Math.min(0.13, continuousMs / 10500)
        + (session.detectionLevel === "minor" ? 0.1 : 0),
        0,
        eyeContact ? 0.72 : 0.62
      );
  const awareness = fullyCaught
    ? 1
    : clampNumber(
        baseAwareness + (eyeContact ? 0.16 + mirrorEyeFocus.strength * 0.24 : 0),
        0,
        eyeContact ? 0.88 : 0.62
      );
  if (!fullyCaught && awareness < 0.025) return null;
  return {
    token: `${session.id}_${fullyCaught ? "caught" : "presence"}`,
    mode: session.mode,
    level: fullyCaught ? "major" : "presence",
    awareness,
    eyeContact,
    eyeContactStrength: eyeContact ? mirrorEyeFocus.strength : 0,
    text: fullyCaught
      ? `${girl?.name || "Het Spiekende Meisje"} is betrapt!`
      : "",
    hint: silhouetteHint(girl, players),
    nameHint: !fullyCaught ? String(girl?.name || "") : "",
    identity: fullyCaught && girl ? {
      key: girl.key,
      name: girl.name,
      roleName: "Het Spiekende Meisje",
      roleCardSrc: "/assets/cards/spiekende_meisje.png",
      cardVariant: girl.cardVariant || 1,
    } : null,
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
      remainingFogMs: Math.round(session.mode === "fog" ? session.remainingPeekMs : session.remainingFogMs ?? PEEK_MODE_CONFIG.fog.timeBudgetMs),
      timeBudgetMs: Number(session.testTimeBudgetMs || PEEK_MODE_CONFIG[session.mode]?.timeBudgetMs || PEEK_MODE_CONFIG.eyelids.timeBudgetMs),
      timeExpired: Number(session.remainingPeekMs || 0) <= 0,
      cooling: false,
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
  PEEK_MODE_CONFIG,
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
  mirrorWolfEyeFocus,
  girlView,
  wolfWarningView,
  acknowledgeWolfWarning,
  hostPeekView,
  simulateRotation,
  validateRotation,
};

if (typeof module !== "undefined" && module.exports) module.exports = PEEK_API;
if (typeof window !== "undefined") window.WakkerdamPeekRules = PEEK_API;
