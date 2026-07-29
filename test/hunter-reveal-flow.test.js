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

test("Hunter choice waits for the Host, keeps the shot victim private and separates the shot from the full day overview", { timeout: 30000 }, async t => {
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

  const viewer = await connectSocket(url);
  sockets.push(viewer);
  let viewerState = null;
  viewer.on("state", state => { viewerState = state; });
  viewer.emit("register_viewer");

  const players = [];
  for (let index = 1; index <= 4; index += 1) {
    const player = await joinPlayer(url, `Jagerspeler ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty roles");
  for (const [roleId, count] of [["villager", 2], ["werewolf", 1], ["hunter", 1]]) {
    host.emit("host_set_role_count", { roleId, count });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 4, "four roles");
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "assigned roles");

  const hunter = players.find(player => player.latest.me.roleId === "hunter");
  const wolf = players.find(player => player.latest.me.roleId === "werewolf");
  assert.ok(hunter && wolf);

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "wolves", "wolves step");
  wolf.socket.emit("player_action", { kind: "wolves", targetKey: hunter.key, confirm: true });
  await waitUntil(() => hostState?.currentStep?.ready, "wolf choice ready");
  host.emit("host_next_step");

  await waitUntil(() => hostState?.hunterSequence?.stage === "announcement", "Hunter announcement");
  assert.equal(hunter.latest.action.kind, "hunter_wait");
  assert.equal(hunter.latest.me.alive, true, "Hunter death must remain gated during the Info announcement");
  assert.equal(hostState.hunterSequence.hunterDeath?.key, hunter.key, "Host must immediately receive the Hunter card");

  host.emit("host_open_mayor");
  host.emit("host_open_day_vote");
  host.emit("host_start_next_night");
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(hostState.phase, "hunter", "Social phases must stay blocked during the Hunter announcement");
  assert.equal(hostState.hunterSequence.stage, "announcement");

  await new Promise(resolve => setTimeout(resolve, 3400));
  assert.equal(hostState?.hunterSequence?.stage, "announcement", "Hunter choice must not auto-open after the old short Info timer");
  host.emit("host_next_step");
  await waitUntil(() => hostState?.hunterSequence?.stage === "choosing", "Hunter choice unlock");
  await waitUntil(() => hunter.latest?.action?.kind === "hunter_shot", "Hunter player choice");
  host.emit("host_open_mayor");
  host.emit("host_open_day_vote");
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(hostState.hunterSequence.stage, "choosing", "Voting commands must stay blocked while the Hunter chooses");

  const target = players.find(player => player.key !== hunter.key && player.key !== wolf.key);
  assert.ok(target);
  hunter.socket.emit("player_action", { kind: "hunter_shot", targetKey: target.key });
  await waitUntil(() => hostState?.hunterSequence?.stage === "shot_suspense", "shot suspense");
  assert.equal(target.latest.me.alive, true, "Shot victim must stay alive on Player until the Info reveal");
  assert.equal(hostState.hunterSequence.hunterDeath?.key, hunter.key);
  assert.deepEqual(hostState.hunterSequence.shotDeaths.map(death => death.key), [target.key], "Host must see the chosen shot immediately");

  const shotToken = viewerState.hunterSequence.shotToken;
  viewer.emit("viewer_reveal_ack", { kind: "hunter_shot", token: shotToken });
  await waitUntil(() => hostState?.hunterSequence?.stage === "summary", "Hunter summary");
  await waitUntil(() => target.latest?.me?.alive === false, "shot victim Player release");
  assert.ok(hostState.lastDeaths.some(death => death.key === target.key && death.cause === "hunter"));
  assert.deepEqual(hostState.hunterSequence.shotDeaths.map(death => death.key), [target.key]);
  assert.ok(!hostState.hunterSequence.shotDeaths.some(death => death.key === hunter.key), "Hunter must not appear in the shot-only overview");
  assert.ok(hostState.hunterSequence.allDeaths.some(death => death.key === hunter.key), "Full round data must retain the Hunter for the next day overview");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.phase === "day", "Hunter sequence completion");
  assert.ok(hostState.lastDeaths.some(death => death.key === hunter.key), "Full day overview must include the Hunter");
  assert.ok(hostState.lastDeaths.some(death => death.key === target.key), "Full day overview must include the shot victim");
});

test("Host force advances an unanswered role and can finish wolves without any Player input", { timeout: 20000 }, async t => {
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

  for (let index = 1; index <= 3; index += 1) {
    const player = await joinPlayer(url, `Forcespeler ${index}`);
    sockets.push(player.socket);
  }
  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty force roles");
  for (const roleId of ["villager", "werewolf", "seer"]) {
    host.emit("host_set_role_count", { roleId, count: 1 });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 3, "force role count");
  host.emit("host_start_game");
  await waitUntil(() => hostState?.phase === "night", "force game start");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "seer", "unanswered Seer");
  host.emit("host_next_step", { force: true });
  await waitUntil(() => hostState?.currentStep?.kind === "wolves", "forced next role");

  host.emit("host_next_step", { force: true });
  await waitUntil(() => hostState?.phase === "day", "forced wolves and resolved night");
  assert.ok(hostState.lastDeaths.length >= 1);
});
