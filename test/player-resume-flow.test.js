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

test("a resumed mobile player replaces a stale socket and immediately receives current state", { timeout: 20000 }, async t => {
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
  for (let index = 1; index <= 3; index += 1) {
    const player = await joinPlayer(url, `Mobiel ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty role preset");
  host.emit("host_set_role_count", { roleId: "villager", count: 3 });
  await waitUntil(() => hostState?.selectedRoleTotal === 3, "three selected roles");
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "started player states");

  const original = players[0];
  const replacement = await connectSocket(url);
  sockets.push(replacement);
  let resumedState = null;
  let resumedJoined = null;
  replacement.on("player_state", state => { resumedState = state; });
  replacement.on("joined", data => { resumedJoined = data; });
  replacement.emit("player_sync", { playerKey: original.key, reason: "visibility" });

  await waitUntil(() => resumedJoined?.playerKey === original.key && resumedState?.me?.key === original.key, "resumed state");
  assert.equal(resumedState.me.roleId, original.latest.me.roleId);
  assert.equal(resumedState.phase, original.latest.phase);

  original.socket.disconnect();
  await waitUntil(
    () => hostState?.players?.find(player => player.key === original.key)?.connected === true,
    "replacement remains connected after stale socket closes",
  );

  const previousState = resumedState;
  replacement.emit("player_sync", { playerKey: original.key, reason: "pageshow" });
  await waitUntil(() => resumedState !== previousState, "fresh state after pageshow sync");
  assert.equal(resumedState.me.key, original.key);
  assert.equal(hostState.players.find(player => player.key === original.key)?.connected, true);
});
