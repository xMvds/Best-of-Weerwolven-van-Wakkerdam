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

test("mirror and fog reveal only server-resolved targets and spend bounded resources", () => {
  const mirror = createPeekState({ enabled: true, modes: { eyelids: false, mirror: true, fog: false } });
  startPeekSession(mirror, { girlKey: "p1", wolfKeys, nightNumber: 1, now: 0 });
  acknowledgeInstruction(mirror, 1);
  const mirrorResult = applyPeekInteraction(mirror, { kind: "mirror_move", x: 0.5, y: 0.14 }, { now: 100, players, isWolfKey });
  assert.equal(mirrorResult.ok, true);
  assert.equal(mirror.session.mirrorReveal?.key, "p1");
  assert.equal(mirror.session.mirrorReveal?.awakeWolf, false);

  const fog = createPeekState({ enabled: true, modes: { eyelids: false, mirror: false, fog: true } });
  startPeekSession(fog, { girlKey: "p1", wolfKeys, nightNumber: 1, now: 0 });
  acknowledgeInstruction(fog, 1);
  const fogResult = applyPeekInteraction(fog, {
    kind: "fog_swipe",
    startX: 0.48,
    startY: 0.05,
    x: 0.85,
    y: 0.5,
    durationMs: 520,
  }, { now: 600, players, isWolfKey });
  assert.equal(fogResult.ok, true);
  assert.equal(fog.session.fogActionsRemaining, 3);
  assert.ok(fog.session.fogReveals.length <= 3);
});

test("wolf warnings stay vague, acknowledge once and cleanup cancels every interaction", () => {
  const state = createPeekState({ enabled: true, modes: { eyelids: true, mirror: false, fog: false } });
  startPeekSession(state, { girlKey: "p1", wolfKeys, nightNumber: 3, now: 100 });
  acknowledgeInstruction(state, 110);
  applyPeekInteraction(state, { kind: "hold_start" }, { now: 120, players, isWolfKey });
  triggerDetection(state.session, "major", 200);
  const warning = wolfWarningView(state, "p2", { girl: players[0], players });
  assert.ok(warning);
  assert.doesNotMatch(JSON.stringify(warning), /Speler 1|p1/);
  assert.equal(acknowledgeWolfWarning(state, "p2", warning.token), true);
  assert.equal(wolfWarningView(state, "p2", { girl: players[0], players }), null);

  finishPeekSession(state, "cancelled", 300);
  const view = girlView(state, { players, isWolfKey, now: 300 });
  assert.equal(view.status, "cancelled");
  assert.equal(state.session.interaction.active, false);
  assert.equal(state.session.mirrorReveal, null);
  assert.deepEqual(state.session.fogReveals, []);
});
