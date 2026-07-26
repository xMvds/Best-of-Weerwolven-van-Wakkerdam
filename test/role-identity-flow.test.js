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

async function waitUntil(check, label, timeoutMs = 6000) {
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
  await waitUntil(() => player.latest, `${name} player state`);
  return player;
}

test("role-card permissions survive a complete Cupid, Ziener, Wolves and Witch night flow", { timeout: 25000 }, async t => {
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
  for (let index = 1; index <= 5; index += 1) {
    const player = await joinPlayer(url, `Kaartspeler ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty role preset");
  for (const roleId of ["villager", "werewolf", "seer", "witch", "cupid"]) {
    host.emit("host_set_role_count", { roleId, count: 1 });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 5, "five selected roles");
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "assigned roles");

  const byRole = roleId => players.find(player => player.latest.me.roleId === roleId);
  const cupid = byRole("cupid");
  const seer = byRole("seer");
  const wolf = byRole("werewolf");
  const witch = byRole("witch");
  const villager = byRole("villager");
  assert.ok(cupid && seer && wolf && witch && villager);

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "cupid", "Cupid step");
  await waitUntil(() => cupid.latest?.action?.kind === "cupid", "Cupid player action");
  assert.ok(cupid.latest.action.options.every(option => option.cardRoleId === "villager" && !option.cardRevealed));
  cupid.socket.emit("player_action", { kind: "cupid", targetKeys: [wolf.key, villager.key] });
  await waitUntil(() => cupid.latest?.action?.submitted, "Cupid confirmation");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "lovers_info", "lovers step");
  await waitUntil(
    () => wolf.latest?.action?.kind === "lovers_info" && villager.latest?.action?.kind === "lovers_info",
    "both lover cards",
  );
  assert.equal(wolf.latest.action.lover.key, villager.key);
  assert.equal(wolf.latest.action.lover.cardRoleId, "villager");
  assert.equal(wolf.latest.action.lover.cardRevealed, true);
  assert.equal(villager.latest.action.lover.key, wolf.key);
  assert.equal(villager.latest.action.lover.cardRoleId, "werewolf");
  assert.equal(villager.latest.action.lover.cardRevealed, true);
  wolf.socket.emit("player_action", { kind: "lovers_info", ready: true });
  villager.socket.emit("player_action", { kind: "lovers_info", ready: true });
  await waitUntil(() => hostState?.currentStep?.ready, "lovers ready");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "seer", "Seer step");
  await waitUntil(() => seer.latest?.action?.kind === "seer", "Seer player action");
  const unknownWolf = seer.latest.action.options.find(option => option.key === wolf.key);
  assert.equal(unknownWolf.cardRoleId, "villager");
  assert.equal(unknownWolf.cardRevealed, false);
  seer.socket.emit("player_action", { kind: "seer", targetKey: wolf.key });
  await waitUntil(() => seer.latest?.action?.submitted, "Seer result");
  assert.equal(seer.latest.action.submission.targetRoleId, "werewolf");
  assert.equal(seer.latest.action.submission.targetName, wolf.latest.me.name);
  await waitUntil(
    () => hostState?.currentStep?.submissions?.[seer.key]?.targetRoleId === "werewolf",
    "Host live Seer identity",
  );

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "wolves", "Wolves step");
  await waitUntil(() => wolf.latest?.action?.kind === "wolves", "Wolf player action");
  const wolfVictim = cupid;
  assert.equal(wolf.latest.action.options.find(option => option.key === wolfVictim.key).cardRoleId, "villager");
  wolf.socket.emit("player_action", { kind: "wolves", targetKey: wolfVictim.key, confirm: true });
  await waitUntil(() => hostState?.currentStep?.ready, "Wolf consensus");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "witch", "Witch step");
  await waitUntil(() => witch.latest?.action?.kind === "witch", "Witch player action");
  assert.ok(witch.latest.action.allTargets.every(option => option.cardRoleId === "villager"));
  witch.socket.emit("player_action", { kind: "witch", saveKey: null, poisonKey: null });
  await waitUntil(() => witch.latest?.action?.submitted, "Witch confirmation");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.phase === "day", "day after the first night");
  host.emit("host_start_next_night");
  await waitUntil(() => hostState?.phase === "night" && hostState?.nightNumber === 2, "second night");
  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "seer", "second Seer step");
  await waitUntil(() => seer.latest?.action?.kind === "seer" && !seer.latest.action.submitted, "second Seer action");
  const rememberedWolf = seer.latest.action.options.find(option => option.key === wolf.key);
  assert.equal(rememberedWolf.cardRoleId, "werewolf");
  assert.equal(rememberedWolf.cardRevealed, true);
});
