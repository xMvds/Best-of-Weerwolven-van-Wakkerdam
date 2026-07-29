const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { io } = require("socket.io-client");

const root = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitUntil(check, label, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timeout while waiting for ${label}`);
}

function connectSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => reject(new Error("Socket connection timeout")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function joinPlayer(url, name) {
  const socket = await connectSocket(url);
  const player = { socket, key: null, latest: null };
  socket.on("player_state", state => { player.latest = state; });
  socket.emit("join", { name });
  const joined = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Join timeout for ${name}`)), 5000);
    socket.once("joined", data => {
      clearTimeout(timer);
      resolve(data);
    });
  });
  player.key = joined.playerKey;
  await waitUntil(() => player.latest, `${name} state`);
  return player;
}

test("night targets follow timeline deaths and the Piper spell breaks exactly once", { timeout: 40000 }, async t => {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });

  const url = `http://127.0.0.1:${port}`;
  await waitUntil(async () => {
    try {
      return (await fetch(`${url}/host`)).ok;
    } catch {
      return false;
    }
  }, "server");

  const sockets = [];
  t.after(() => sockets.forEach(socket => socket.disconnect()));
  const host = await connectSocket(url);
  sockets.push(host);
  let hostState = null;
  host.on("host_state", state => { hostState = state; });
  host.emit("register_host");
  await waitUntil(() => hostState, "Host state");

  const players = [];
  for (let index = 1; index <= 12; index += 1) {
    const player = await joinPlayer(url, `Tijdlijn ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }

  const assignments = [
    ["piper", players[0]],
    ["werewolf", players[1]],
    ["werewolf", players[2]],
    ["big_bad_wolf", players[3]],
    ["witch", players[4]],
    ["fox", players[5]],
    ["elder", players[6]],
    ...players.slice(7).map(player => ["villager", player]),
  ];
  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty preset");
  for (const [roleId, count] of [
    ["piper", 1],
    ["werewolf", 2],
    ["big_bad_wolf", 1],
    ["witch", 1],
    ["fox", 1],
    ["elder", 1],
    ["villager", 5],
  ]) {
    host.emit("host_set_role_count", { roleId, count });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 12, "twelve roles");
  for (const [roleId, player] of assignments) {
    host.emit("host_assign_role", { playerKey: player.key, roleId });
    await waitUntil(
      () => hostState?.players?.find(candidate => candidate.key === player.key)?.assignedRoleId === roleId,
      `assigned ${roleId}`,
    );
  }
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "roles assigned");

  const piper = players[0];
  const wolfPack = players.slice(1, 4);
  const wolves = players.slice(1, 3);
  const bigBad = players[3];
  const witch = players[4];
  const fox = players[5];
  const wolfVictim = players[7];
  const bigBadVictim = players[8];

  assert.ok(hostState.nightSteps.some(step => step.kind === "enchanted_info"));
  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "wolves", "wolves night one");
  for (const wolf of wolfPack) {
    wolf.socket.emit("player_action", { kind: "wolves", targetKey: wolfVictim.key, confirm: true });
  }
  await waitUntil(() => hostState?.currentStep?.ready, "wolf consensus");
  host.emit("host_next_step");

  await waitUntil(() => hostState?.currentStep?.kind === "big_bad_wolf", "Big Bad Wolf");
  await waitUntil(() => bigBad.latest?.action?.kind === "big_bad_wolf", "Big Bad action");
  assert.ok(!bigBad.latest.action.options.some(option => option.key === wolfVictim.key));
  bigBad.socket.emit("player_action", { kind: "big_bad_wolf", targetKey: bigBadVictim.key });
  await waitUntil(() => hostState?.currentStep?.ready, "Big Bad ready");
  host.emit("host_next_step");

  await waitUntil(() => hostState?.currentStep?.kind === "witch", "Witch");
  await waitUntil(() => witch.latest?.action?.kind === "witch", "Witch action");
  assert.ok(witch.latest.action.pendingVictims.some(option => option.key === wolfVictim.key));
  assert.ok(!witch.latest.action.allTargets.some(option => option.key === wolfVictim.key));
  assert.ok(!witch.latest.action.allTargets.some(option => option.key === bigBadVictim.key));
  witch.socket.emit("player_action", {
    kind: "witch",
    saveKey: wolfVictim.key,
    poisonKey: fox.key,
  });
  await waitUntil(() => hostState?.currentStep?.ready, "Witch ready");
  host.emit("host_next_step");

  await waitUntil(() => hostState?.currentStep?.kind === "piper", "Fox skipped after poison");
  assert.notEqual(fox.latest?.action?.kind, "fox");
  await waitUntil(() => piper.latest?.action?.kind === "piper", "Piper action");
  const piperOptions = new Set(piper.latest.action.options.map(option => option.key));
  assert.ok(piperOptions.has(wolfVictim.key), "the saved wolf victim becomes available again");
  assert.ok(!piperOptions.has(bigBadVictim.key), "the unsaved Big Bad victim stays unavailable");
  assert.ok(!piperOptions.has(fox.key), "the poisoned Fox stays unavailable");
  piper.socket.emit("player_action", {
    kind: "piper",
    targetKeys: wolves.map(wolf => wolf.key),
  });
  await waitUntil(() => hostState?.currentStep?.ready, "Piper ready");
  host.emit("host_next_step");

  await waitUntil(() => hostState?.currentStep?.kind === "enchanted_info", "enchanted info");
  assert.equal(hostState.currentStep.actors.length, 2);
  host.emit("host_next_step");
  await waitUntil(() => hostState?.phase === "day", "first day");
  assert.equal(hostState.players.find(player => player.key === wolfVictim.key)?.alive, true);
  assert.equal(hostState.players.find(player => player.key === bigBadVictim.key)?.alive, false);
  assert.equal(hostState.players.find(player => player.key === fox.key)?.alive, false);

  host.emit("host_manual_kill", { key: piper.key, cause: "manual" });
  await waitUntil(() => hostState?.players?.find(player => player.key === piper.key)?.alive === false, "Piper death");
  host.emit("host_start_next_night");
  await waitUntil(() => hostState?.phase === "night" && hostState?.nightNumber === 2, "second night");
  assert.ok(hostState.nightSteps.some(step => step.kind === "enchantment_broken"));
  assert.ok(!hostState.nightSteps.some(step => step.kind === "enchanted_info"));

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "wolves", "wolves night two");
  const secondWolfVictim = players[9];
  for (const wolf of wolfPack) {
    wolf.socket.emit("player_action", { kind: "wolves", targetKey: secondWolfVictim.key, confirm: true });
  }
  await waitUntil(() => hostState?.currentStep?.ready, "second wolf consensus");
  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "big_bad_wolf", "second Big Bad");
  bigBad.socket.emit("player_action", { kind: "big_bad_wolf", targetKey: players[10].key });
  await waitUntil(() => hostState?.currentStep?.ready, "second Big Bad ready");
  host.emit("host_next_step");

  await waitUntil(() => hostState?.currentStep?.kind === "enchantment_broken", "spell break moment");
  for (const wolf of wolves) {
    await waitUntil(() => wolf.latest?.action?.kind === "enchantment_broken", "enchanted spell break");
    assert.equal(wolf.latest.action.spellBroken, true);
  }
  host.emit("host_next_step");
  await waitUntil(() => hostState?.phase === "day", "second day");
  assert.ok(hostState.players.every(player => !player.enchanted));

  host.emit("host_start_next_night");
  await waitUntil(() => hostState?.phase === "night" && hostState?.nightNumber === 3, "third night");
  assert.ok(!hostState.nightSteps.some(step => ["enchanted_info", "enchantment_broken"].includes(step.kind)));
});
