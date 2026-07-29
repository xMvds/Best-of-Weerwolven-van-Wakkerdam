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

async function waitUntil(check, label, timeoutMs = 8000) {
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
  const player = { socket, key: null, latest: null, peek: null };
  socket.on("player_state", state => { player.latest = state; });
  socket.on("peek_state", peek => { player.peek = peek; });
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

test("Spiekende Meisje runs only during wolves, survives reconnect and never leaks to Info", { timeout: 25000 }, async t => {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      WAKKERDAM_PEEK_EYELIDS_ENABLED: "1",
      WAKKERDAM_PEEK_MIRROR_ENABLED: "0",
      WAKKERDAM_PEEK_FOG_ENABLED: "0",
    },
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
  host.on("peek_host_state", peek => {
    if (hostState) hostState.peek = peek;
  });
  host.emit("register_host");
  await waitUntil(() => hostState, "Host state");

  const info = await connectSocket(url);
  sockets.push(info);
  let infoState = null;
  info.on("state", state => { infoState = state; });
  info.emit("register_viewer");
  await waitUntil(() => infoState, "Info state");

  const players = [];
  for (const name of ["Meisje", "Wolf", "Dorp A", "Dorp B"]) {
    const player = await joinPlayer(url, name);
    players.push(player);
    sockets.push(player.socket);
  }
  const [girl, wolf] = players;

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty roles");
  for (const [roleId, count] of [["little_girl", 1], ["werewolf", 1], ["villager", 2]]) {
    host.emit("host_set_role_count", { roleId, count });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 4, "four roles");
  for (const [player, roleId] of [[girl, "little_girl"], [wolf, "werewolf"], [players[2], "villager"], [players[3], "villager"]]) {
    host.emit("host_assign_role", { playerKey: player.key, roleId });
    await waitUntil(
      () => hostState?.players?.find(candidate => candidate.key === player.key)?.assignedRoleId === roleId,
      `assigned ${roleId}`,
    );
  }
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "roles assigned");

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "wolves" && girl.latest?.action?.kind === "little_girl_peek", "wolves and peek start");
  assert.equal(girl.latest.action.peek.mode, "eyelids");
  assert.equal(girl.latest.action.peek.status, "instruction");
  assert.equal(infoState.peek, undefined);
  assert.equal(infoState.currentPublicMoment, "De nacht valt over het dorp.");

  const sessionId = girl.latest.action.peek.id;
  girl.socket.emit("peek_instruction_ack", { sessionId });
  await waitUntil(() => girl.latest?.action?.peek?.status === "active", "instruction acknowledged");
  girl.socket.emit("peek_interaction", { sessionId, kind: "hold_start" });
  await waitUntil(() => girl.peek?.holding === true, "eyelids holding");
  await new Promise(resolve => setTimeout(resolve, 420));

  const replacement = await connectSocket(url);
  sockets.push(replacement);
  let resumed = null;
  let resumedPeek = null;
  replacement.on("player_state", state => { resumed = state; });
  replacement.on("peek_state", peek => { resumedPeek = peek; });
  replacement.emit("player_sync", { playerKey: girl.key, reason: "test_reconnect" });
  await waitUntil(() => resumed?.me?.key === girl.key && resumedPeek?.id === sessionId, "resumed peek session");
  assert.equal(resumed.action.peek.id, sessionId);
  assert.ok(resumedPeek.remainingPeekMs < 4000, `Expected used time, received ${resumedPeek.remainingPeekMs}`);

  replacement.emit("peek_interaction", { sessionId, kind: "hold_stop" });
  await waitUntil(() => resumedPeek?.holding === false, "hold stopped after reconnect");
  host.emit("host_next_step", { force: true });
  await waitUntil(() => hostState?.peek?.session?.status === "finished" || hostState?.peek?.session?.status === "cancelled", "forced cleanup");
  assert.equal(hostState.peek.session.remainingPeekMs < 4000, true);
  assert.equal(infoState.peek, undefined);
});
