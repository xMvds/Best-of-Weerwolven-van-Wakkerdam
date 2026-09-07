const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PEEK_MODES,
  createPeekState,
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
  simulateRotation,
  validateRotation,
} = require("../peek-system");

function seededRandom(seed = 123456) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const players = Array.from({ length: 8 }, (_, index) => ({
  key: `p${index + 1}`,
  name: `Speler ${index + 1}`,
  seat: index,
  alive: true,
  cardVariant: (index % 4) + 1,
}));
const wolfKeys = ["p2", "p5"];
const isWolfKey = key => wolfKeys.includes(key);

test("shuffle-bag uses every mode once and never repeats across cycle boundaries", () => {
  const state = createPeekState();
  const random = seededRandom(41);
  const sequence = Array.from({ length: 300 }, () => chooseNextMode(state, random));
  const result = validateRotation(sequence, state.features);
  assert.equal(result.ok, true, result.errors.join("\n"));
  for (let index = 0; index < sequence.length; index += 3) {
    assert.deepEqual(new Set(sequence.slice(index, index + 3)), new Set(PEEK_MODES));
  }
});

test("feature toggles keep rotation valid with two, one or zero active variants", () => {
  const pairs = [
    { eyelids: true, mirror: false, fog: true },
    { eyelids: false, mirror: true, fog: false },
    { eyelids: false, mirror: false, fog: false },
  ];
  for (const modes of pairs) {
    const features = { enabled: true, modes };
    const simulation = simulateRotation({ count: 120, features, random: seededRandom(77) });
    const enabled = PEEK_MODES.filter(mode => modes[mode]);
    if (!enabled.length) {
      assert.ok(simulation.sequence.every(mode => mode === null));
      continue;
    }
    const result = validateRotation(simulation.sequence, features);
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.ok(simulation.sequence.every(mode => enabled.includes(mode)));
  }
});

test("eyelid time and risk remain central across reconnect-style normalization", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, nightNumber: 2, now: 1000 });
  assert.equal(acknowledgeInstruction(state, 1100), true);
  applyPeekInteraction(state, { kind: "hold_start" }, { now: 1200, players, isWolfKey });
  syncPeekSession(state, 2200);
  assert.equal(state.session.remainingPeekMs, 3000);
  const serialized = JSON.parse(JSON.stringify(state));
  syncPeekSession(serialized, 2600);
  assert.equal(serialized.session.remainingPeekMs, 2600);
  applyPeekInteraction(serialized, { kind: "hold_stop" }, { now: 2600, players, isWolfKey });
  assert.equal(serialized.session.interaction.active, false);
  assert.ok(serialized.session.risk > 0);
});

test("every eyelid session escalates from playful movement to a real catch while a wolf looks back", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, nightNumber: 4, now: 0 });
  acknowledgeInstruction(state, 10);
  state.session.wolfLookAt = 2800;
  state.session.wolfLookUntil = 3900;
  applyPeekInteraction(state, { kind: "hold_start" }, { now: 1000, players, isWolfKey });
  syncPeekSession(state, 2700);
  assert.equal(state.session.detectionLevel, "minor");
  syncPeekSession(state, 4200);
  assert.equal(state.session.detectionLevel, "major");
  const warning = wolfWarningView(state, "p2", { girl: players[0], players, now: 4200 });
  assert.equal(warning.identity.name, "Speler 1");
});

test("using all split eyelid time safely exhausts the resource without exposing the girl", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, nightNumber: 5, now: 0 });
  acknowledgeInstruction(state, 1);
  state.session.wolfLookAt = 90000;
  state.session.wolfLookUntil = 91000;
  let now = 100;
  for (let look = 0; look < 5; look += 1) {
    applyPeekInteraction(state, { kind: "hold_start" }, { now, players, isWolfKey });
    now += 800;
    syncPeekSession(state, now);
    applyPeekInteraction(state, { kind: "hold_stop" }, { now, players, isWolfKey });
    now += 1200;
    syncPeekSession(state, now);
  }
  assert.equal(state.session.remainingPeekMs, 0);
  assert.notEqual(state.session.detectionLevel, "major");
  assert.equal(girlView(state, { players, isWolfKey, now }).caught, false);
});

test("mirror reflection and fifteen-second fog brush reveal only server-resolved targets gradually", () => {
  const mirror = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
  startPeekSession(mirror, { girlKey: "p1", wolfKeys, nightNumber: 1, now: 0 });
  acknowledgeInstruction(mirror, 1);
  const mirrorResult = applyPeekInteraction(mirror, { kind: "mirror_move", x: 0.5, y: 0.14 }, { now: 100, players, isWolfKey });
  assert.equal(mirrorResult.ok, true);
  assert.equal(mirror.session.mirrorReveal?.key, "p1");
  assert.equal(mirror.session.mirrorReveal?.awakeWolf, false);
  applyPeekInteraction(mirror, { kind: "mirror_move", x: 0.719, y: 0.281 }, { now: 200, players, isWolfKey });
  assert.equal(mirror.session.mirrorReveal?.key, "p2");
  assert.equal(mirror.session.mirrorReveal?.awakeWolf, false, "a wolf is not identified by merely crossing it");
  applyPeekInteraction(mirror, { kind: "mirror_move", x: 0.719, y: 0.281 }, { now: 1020, players, isWolfKey });
  assert.equal(mirror.session.mirrorReveal?.awakeWolf, true, "the shard must remain over a wolf before it is identified");
  assert.ok(mirror.session.mirrorReveal.strength >= 0.68);

  const fog = createPeekState({ enabled: true, modes: { eyelids: false, mirror: false, fog: true } });
  startPeekSession(fog, { girlKey: "p1", wolfKeys, nightNumber: 1, now: 0 });
  acknowledgeInstruction(fog, 1);
  const wolfPosition = { x: 0.719, y: 0.281 };
  assert.equal(applyPeekInteraction(fog, { kind: "fog_brush_start", ...wolfPosition }, { now: 100, players, isWolfKey }).ok, true);
  applyPeekInteraction(fog, { kind: "fog_brush", ...wolfPosition }, { now: 300, players, isWolfKey });
  const firstStrength = fog.session.fogReveals.find(reveal => reveal.key === "p2")?.strength || 0;
  assert.ok(firstStrength > 0 && firstStrength < 0.3, `expected a partial first reveal, received ${firstStrength}`);
  for (const now of [500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100, 2300, 2500, 2700]) {
    applyPeekInteraction(fog, { kind: "fog_brush", ...wolfPosition }, { now, players, isWolfKey });
  }
  const wolfReveal = fog.session.fogReveals.find(reveal => reveal.key === "p2");
  assert.ok(wolfReveal.strength > firstStrength);
  assert.equal(wolfReveal.awakeWolf, true, "a wolf becomes identifiable only after sustained local brushing");
  assert.equal(fog.session.remainingFogMs, 12400);
  assert.equal(applyPeekInteraction(fog, { kind: "fog_brush_stop" }, { now: 2700, players, isWolfKey }).ok, true);
  assert.equal(fog.session.interaction.active, false);
  const resumed = JSON.parse(JSON.stringify(fog));
  assert.equal(girlView(resumed, { players, isWolfKey, now: 2800 }).remainingFogMs, 12400);
  assert.ok(girlView(resumed, { players, isWolfKey, now: 2800 }).fogReveals.some(reveal => reveal.key === "p2"));
});

test("staring into a mirror wolf's red eyes accelerates visible risk and intensifies only that wolf's screen", () => {
  const wolfPosition = { x: 0.719, y: 0.281 };
  const civilianPosition = { x: 0.5, y: 0.14 };
  const createMirror = () => {
    const state = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
    startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: "mirror", now: 0 });
    acknowledgeInstruction(state, 1);
    return state;
  };

  const wolfFocus = createMirror();
  applyPeekInteraction(wolfFocus, { kind: "mirror_start", ...wolfPosition }, { now: 100, players, isWolfKey });
  applyPeekInteraction(wolfFocus, { kind: "mirror_move", ...wolfPosition }, { now: 200, players, isWolfKey });
  applyPeekInteraction(wolfFocus, { kind: "mirror_move", ...wolfPosition }, { now: 1020, players, isWolfKey });
  const wolfView = girlView(wolfFocus, { players, isWolfKey, now: 1020 });

  const civilianFocus = createMirror();
  applyPeekInteraction(civilianFocus, { kind: "mirror_start", ...civilianPosition }, { now: 100, players, isWolfKey });
  applyPeekInteraction(civilianFocus, { kind: "mirror_move", ...civilianPosition }, { now: 200, players, isWolfKey });
  applyPeekInteraction(civilianFocus, { kind: "mirror_move", ...civilianPosition }, { now: 1020, players, isWolfKey });
  const civilianView = girlView(civilianFocus, { players, isWolfKey, now: 1020 });

  assert.equal(wolfFocus.session.mirrorReveal?.awakeWolf, true);
  assert.equal(wolfView.mirrorEyeContactActive, true);
  assert.equal(wolfView.mirrorEyeContactKey, "p2");
  assert.ok(wolfView.riskTrendPerSecond > civilianView.riskTrendPerSecond + 12);
  assert.notEqual(wolfFocus.session.detectionLevel, "major", "red-eye contact still cannot catch below a full bar");

  const watchedWolf = wolfWarningView(wolfFocus, "p2", { girl: players[0], players, now: 1020 });
  assert.equal(watchedWolf.eyeContact, true);
  assert.ok(watchedWolf.awareness >= 0.2);
  assert.equal(wolfWarningView(wolfFocus, "p5", { girl: players[0], players, now: 1020 }), null);
});

test("the last 0.1 seconds closes the mirror into an explicit expired state", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: "mirror", now: 0 });
  acknowledgeInstruction(state, 1);
  state.session.remainingPeekMs = 100;
  state.session.lastRiskSyncAt = 1;

  assert.equal(
    applyPeekInteraction(state, { kind: "mirror_start", x: 0.5, y: 0.5 }, { now: 100, players, isWolfKey }).ok,
    true
  );
  syncPeekSession(state, 200);
  const expired = girlView(state, { players, isWolfKey, now: 200 });

  assert.equal(expired.remainingPeekMs, 0);
  assert.equal(expired.timeExpired, true);
  assert.equal(state.session.interaction.active, false);
  assert.ok(state.session.timeExpiredAt);
  assert.equal(state.session.detectionLevel, "none", "time exhaustion never counts as being caught");
  assert.equal(
    applyPeekInteraction(state, { kind: "mirror_start", x: 0.5, y: 0.5 }, { now: 220, players, isWolfKey }).reason,
    "resource_empty"
  );
});

test("tester-only caution and seconds overrides slow visible risk without changing production defaults", () => {
  const makeEyelids = () => {
    const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
    startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: "eyelids", now: 0 });
    acknowledgeInstruction(state, 1);
    state.session.wolfLookAt = 90000;
    state.session.wolfLookUntil = 91000;
    return state;
  };

  const normal = makeEyelids();
  applyPeekInteraction(normal, { kind: "hold_start" }, { now: 100, players, isWolfKey });
  syncPeekSession(normal, 1100);

  const cautious = makeEyelids();
  cautious.session.testTimeBudgetMs = 12300;
  cautious.session.remainingPeekMs = 12300;
  cautious.session.testCautionStrength = 200;
  cautious.session.testRiskMultiplier = .5;
  applyPeekInteraction(cautious, { kind: "hold_start" }, { now: 100, players, isWolfKey });
  syncPeekSession(cautious, 1100);
  const view = girlView(cautious, { players, isWolfKey, now: 1100 });

  assert.ok(cautious.session.risk < normal.session.risk, `${cautious.session.risk} should be below ${normal.session.risk}`);
  assert.equal(cautious.session.remainingPeekMs, 11300);
  assert.equal(view.timeBudgetMs, 12300);
  assert.equal(view.testCautionStrength, 200);
  assert.equal(view.testRiskMultiplier, .5);
  assert.equal(girlView(normal, { players, isWolfKey, now: 1100 }).timeBudgetMs, 4000);
});

test("reckless mirror and fog movement can both expose the girl's identity to wolves", () => {
  const cases = [
    {
      mode: "mirror",
      run(state) {
        applyPeekInteraction(state, { kind: "mirror_move", x: 0.1, y: 0.1 }, { now: 100, players, isWolfKey });
        applyPeekInteraction(state, { kind: "mirror_move", x: 0.9, y: 0.9 }, { now: 140, players, isWolfKey });
      },
    },
    {
      mode: "fog",
      run(state) {
        applyPeekInteraction(state, { kind: "fog_brush_start", x: 0.1, y: 0.1 }, { now: 100, players, isWolfKey });
        applyPeekInteraction(state, { kind: "fog_brush", x: 0.9, y: 0.9 }, { now: 140, players, isWolfKey });
        applyPeekInteraction(state, { kind: "fog_brush", x: 0.1, y: 0.9 }, { now: 180, players, isWolfKey });
      },
    },
  ];
  for (const entry of cases) {
    const state = createPeekState({
      enabled: true,
      modes: {
        eyelids: entry.mode === "eyelids",
        mirror: entry.mode === "mirror",
        fog: entry.mode === "fog",
      },
    });
    startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: entry.mode, now: 0 });
    acknowledgeInstruction(state, 1);
    entry.run(state);
    assert.equal(state.session.detectionLevel, "major", `${entry.mode} should cause a major catch`);
    assert.equal(wolfWarningView(state, "p2", { girl: players[0], players }).identity.name, "Speler 1");
  }
});

test("sustained wolf focus accelerates risk but only a truly full bar exposes the girl", () => {
  const wolfPosition = { x: 0.719, y: 0.281 };

  const mirror = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
  startPeekSession(mirror, { girlKey: "p1", wolfKeys, forcedMode: "mirror", now: 0 });
  acknowledgeInstruction(mirror, 1);
  applyPeekInteraction(mirror, { kind: "mirror_start", ...wolfPosition }, { now: 100, players, isWolfKey });
  for (const now of [150, 950, 1750, 2550]) {
    applyPeekInteraction(mirror, { kind: "mirror_move", ...wolfPosition }, { now, players, isWolfKey });
  }
  assert.ok(mirror.session.risk < 100);
  assert.notEqual(mirror.session.detectionLevel, "major");
  for (const now of [3350, 4150, 4950, 5750, 6350]) {
    applyPeekInteraction(mirror, { kind: "mirror_move", ...wolfPosition }, { now, players, isWolfKey });
  }
  assert.equal(mirror.session.risk, 100);
  assert.equal(mirror.session.detectionLevel, "major");

  const fog = createPeekState({ enabled: true, modes: { eyelids: false, mirror: false, fog: true } });
  startPeekSession(fog, { girlKey: "p1", wolfKeys, forcedMode: "fog", now: 0 });
  acknowledgeInstruction(fog, 1);
  applyPeekInteraction(fog, { kind: "fog_brush_start", ...wolfPosition }, { now: 100, players, isWolfKey });
  for (const now of [300, 800, 1300, 1800, 2300, 2800, 3300]) {
    applyPeekInteraction(fog, { kind: "fog_brush", ...wolfPosition }, { now, players, isWolfKey });
  }
  assert.ok(fog.session.risk < 100);
  assert.notEqual(fog.session.detectionLevel, "major");
  for (const now of [4300, 5300, 6300, 7300, 8300, 9300, 10000]) {
    applyPeekInteraction(fog, { kind: "fog_brush", ...wolfPosition }, { now, players, isWolfKey });
  }
  assert.equal(fog.session.risk, 100);
  assert.equal(fog.session.detectionLevel, "major");
});

test("a held mirror never times out merely because the player keeps peeking", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: "mirror", now: 0 });
  acknowledgeInstruction(state, 1);

  const position = { x: 0.5, y: 0.14 };
  assert.equal(applyPeekInteraction(state, { kind: "mirror_start", ...position }, { now: 100, players, isWolfKey }).ok, true);
  assert.equal(state.session.interaction.active, true);
  for (let now = 350; now <= 6600; now += 250) syncPeekSession(state, now);
  assert.equal(state.session.detectionLevel, "major", "long peeking still exposes the girl");
  assert.equal(state.session.interaction.active, true, "betrapping must not release or lock the held shard");
  assert.ok(state.session.remainingPeekMs > 0, "the player still owns the unused part of her peek timer");

  assert.equal(applyPeekInteraction(state, { kind: "mirror_stop", ...position }, { now: 6650, players, isWolfKey }).ok, true);
  assert.equal(state.session.interaction.active, false);
  assert.equal(applyPeekInteraction(state, { kind: "mirror_start", ...position }, { now: 6700, players, isWolfKey }).ok, true);
  assert.equal(state.session.interaction.active, true, "the shard is immediately reusable without a cooldown blockade");
});

test("legacy cooldown state cannot block a new peek at any risk level", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: "eyelids", now: 0 });
  acknowledgeInstruction(state, 1);
  state.session.risk = 99;
  state.session.cooldownUntil = 90000;
  state.session.lastRiskSyncAt = 100;
  const view = girlView(state, { players, isWolfKey, now: 500 });
  assert.equal(view.cooling, false);
  assert.equal(state.session.cooldownUntil, 0);
  state.session.risk = 99.8;
  assert.equal(applyPeekInteraction(state, { kind: "hold_start" }, { now: 500, players, isWolfKey }).ok, true);
  syncPeekSession(state, 800);
  assert.equal(state.session.detectionLevel, "major");
  assert.equal(state.session.interaction.active, true, "being caught does not terminate the eyelid interaction");
});

test("all three mechanics share a real peek timer while risk takes ten seconds to drain from full", () => {
  const expectedBudgets = { eyelids: 4000, mirror: 8000, fog: 15000 };
  for (const [mode, budget] of Object.entries(expectedBudgets)) {
    const state = createPeekState({
      enabled: true,
      modes: {
        eyelids: mode === "eyelids",
        mirror: mode === "mirror",
        fog: mode === "fog",
      },
    });
    startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: mode, now: 0 });
    acknowledgeInstruction(state, 1);
    assert.equal(state.session.remainingPeekMs, budget);
    assert.equal(girlView(state, { players, isWolfKey, now: 1 }).timeBudgetMs, budget);
  }

  const cooling = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(cooling, { girlKey: "p1", wolfKeys, forcedMode: "eyelids", now: 0 });
  acknowledgeInstruction(cooling, 1);
  cooling.session.risk = 100;
  cooling.session.lastRiskSyncAt = 1;
  for (let now = 1001; now <= 10001; now += 1000) syncPeekSession(cooling, now);
  assert.equal(cooling.session.risk, 0);
  assert.equal(girlView(cooling, { players, isWolfKey, now: 10001 }).cooling, false);
});

test("risk rises continuously while holding in every mechanic and falls live after release", () => {
  const starts = {
    eyelids: { kind: "hold_start" },
    mirror: { kind: "mirror_start", x: 0.5, y: 0.5 },
    fog: { kind: "fog_brush_start", x: 0.5, y: 0.5 },
  };
  const stops = {
    eyelids: { kind: "hold_stop" },
    mirror: { kind: "mirror_stop", x: 0.5, y: 0.5 },
    fog: { kind: "fog_brush_stop", x: 0.5, y: 0.5 },
  };
  for (const mode of PEEK_MODES) {
    const state = createPeekState({
      enabled: true,
      modes: {
        eyelids: mode === "eyelids",
        mirror: mode === "mirror",
        fog: mode === "fog",
      },
    });
    startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: mode, now: 0 });
    acknowledgeInstruction(state, 1);
    state.session.wolfLookAt = 90000;
    state.session.wolfLookUntil = 91000;
    assert.equal(applyPeekInteraction(state, starts[mode], { now: 100, players, isWolfKey }).ok, true);
    syncPeekSession(state, 900);
    const activeView = girlView(state, { players, isWolfKey, now: 900 });
    assert.ok(activeView.risk > 0, `${mode} must build risk while held still`);
    assert.ok(activeView.riskTrendPerSecond > 0, `${mode} must publish a positive live risk trend`);
    assert.equal(applyPeekInteraction(state, stops[mode], { now: 900, players, isWolfKey }).ok, true);
    const beforeCooling = Number(state.session.risk);
    syncPeekSession(state, 1400);
    assert.ok(state.session.risk < beforeCooling, `${mode} must visibly cool after release`);
  }
});

test("betrapping never blocks or times out any of the three mechanics", () => {
  const starts = {
    eyelids: { kind: "hold_start" },
    mirror: { kind: "mirror_start", x: 0.5, y: 0.5 },
    fog: { kind: "fog_brush_start", x: 0.5, y: 0.5 },
  };
  const stops = {
    eyelids: { kind: "hold_stop" },
    mirror: { kind: "mirror_stop", x: 0.5, y: 0.5 },
    fog: { kind: "fog_brush_stop", x: 0.5, y: 0.5 },
  };
  const catchAfterMs = { eyelids: 3200, mirror: 6200, fog: 9800 };

  for (const mode of PEEK_MODES) {
    const state = createPeekState({
      enabled: true,
      modes: {
        eyelids: mode === "eyelids",
        mirror: mode === "mirror",
        fog: mode === "fog",
      },
    });
    startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: mode, now: 0 });
    acknowledgeInstruction(state, 1);
    state.session.wolfLookAt = 90000;
    state.session.wolfLookUntil = 91000;
    assert.equal(applyPeekInteraction(state, starts[mode], { now: 100, players, isWolfKey }).ok, true);

    const catchAt = 100 + catchAfterMs[mode];
    for (let now = 350; now <= catchAt + 250; now += 250) syncPeekSession(state, now);
    assert.equal(state.session.detectionLevel, "major", `${mode} must reveal the girl at a full risk bar`);
    assert.equal(state.session.interaction.active, true, `${mode} must stay active after the reveal`);
    assert.ok(state.session.remainingPeekMs > 0, `${mode} must preserve remaining peek time after the reveal`);
    assert.equal(girlView(state, { players, isWolfKey, now: catchAt + 250 }).cooling, false);

    assert.equal(applyPeekInteraction(state, stops[mode], { now: catchAt + 300, players, isWolfKey }).ok, true);
    assert.equal(state.session.interaction.active, false);
    assert.equal(applyPeekInteraction(state, starts[mode], { now: catchAt + 350, players, isWolfKey }).ok, true);
    assert.equal(state.session.interaction.active, true, `${mode} must be immediately usable again`);
  }
});

test("wolf warnings start playful but a major mistake reveals the girl's exact identity", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, nightNumber: 3, now: 100 });
  acknowledgeInstruction(state, 110);
  state.session.wolfLookKey = "p2";
  state.session.wolfLookAt = 100;
  state.session.wolfLookUntil = 1000;
  applyPeekInteraction(state, { kind: "hold_start" }, { now: 120, players, isWolfKey });
  triggerDetection(state.session, "minor", 200);
  const minor = wolfWarningView(state, "p2", { girl: players[0], players, now: 210 });
  assert.ok(minor);
  assert.equal(minor.level, "presence");
  assert.equal(minor.identity, null);
  assert.equal(minor.nameHint, "Speler 1");
  assert.equal(wolfWarningView(state, "p5", { girl: players[0], players, now: 210 }), null);
  assert.equal(acknowledgeWolfWarning(state, "p2", minor.token), false, "ambient presence is not a dismissible notification");
  assert.ok(wolfWarningView(state, "p2", { girl: players[0], players, now: 220 }), "the ambient shadow is persistent instead of repeatedly acknowledged");
  assert.equal(triggerDetection(state.session, "major", 230), false, "identity cannot be revealed below a full bar");
  state.session.risk = 100;
  triggerDetection(state.session, "major", 240);
  const major = wolfWarningView(state, "p2", { girl: players[0], players, now: 250 });
  assert.equal(major.identity.name, "Speler 1");
  assert.equal(major.identity.roleName, "Het Spiekende Meisje");
  assert.equal(major.identity.roleCardSrc, "/assets/cards/spiekende_meisje.png");

  finishPeekSession(state, "cancelled", 300);
  const view = girlView(state, { players, isWolfKey, now: 300 });
  assert.equal(view.status, "cancelled");
  assert.equal(state.session.interaction.active, false);
  assert.equal(state.session.mirrorReveal, null);
  assert.deepEqual(state.session.fogReveals, []);
});

test("a wolf sees the soft presence only while the girl is actually watching that wolf", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, forcedMode: "mirror", now: 0 });
  acknowledgeInstruction(state, 1);
  applyPeekInteraction(state, { kind: "mirror_start", x: 0.5, y: 0.5 }, { now: 100, players, isWolfKey });
  applyPeekInteraction(state, { kind: "mirror_move", x: 0.719, y: 0.281 }, { now: 200, players, isWolfKey });

  const watchedWolf = wolfWarningView(state, "p2", { girl: players[0], players, now: 210 });
  assert.ok(watchedWolf);
  assert.equal(watchedWolf.level, "presence");
  assert.equal(watchedWolf.nameHint, "Speler 1");
  assert.equal(wolfWarningView(state, "p5", { girl: players[0], players, now: 210 }), null);

  applyPeekInteraction(state, { kind: "mirror_move", x: 0.5, y: 0.86 }, { now: 320, players, isWolfKey });
  assert.equal(wolfWarningView(state, "p2", { girl: players[0], players, now: 330 }), null);
  assert.ok(wolfWarningView(state, "p5", { girl: players[0], players, now: 330 }));
});
