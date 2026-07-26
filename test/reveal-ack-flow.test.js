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

function submitNightAction(player, shared) {
  const action = player.latest?.action;
  if (!action || action.submitted) return;
  const emit = payload => player.socket.emit("player_action", { kind: action.kind, ...payload });
  if (action.kind === "wolves") {
    if (action.ownConfirmed) return;
    const botConsensusTarget = action.wolfConsensus?.rows?.find(row => row.confirmed && row.targetKey)?.targetKey;
    shared.wolfTargetKey ||= botConsensusTarget || action.options?.[0]?.key;
    if (shared.wolfTargetKey) emit({ targetKey: shared.wolfTargetKey, confirm: true });
    return;
  }
  if (action.kind === "witch") return emit({ saveKey: null, poisonKey: null });
  if (action.kind === "cupid") return emit({ targetKeys: (action.options || []).slice(0, 2).map(option => option.key) });
  if (action.kind === "piper") return emit({ targetKeys: (action.options || []).slice(0, 2).map(option => option.key) });
  if (action.kind === "wolf_hound") return emit({ choice: "village" });
  if (action.kind === "infectious_wolf") return emit({ choice: "no" });
  if (action.infoOnly || ["lovers_info", "sisters_info", "enchanted_info"].includes(action.kind)) return emit({ ready: true });
  const targetKey = action.options?.[0]?.key;
  if (targetKey) emit({ targetKey });
  else emit({ ready: true });
}

test("Host sees the day-vote result live and Players receive it only after the Infoscherm acknowledgement", { timeout: 30000 }, async t => {
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
  for (let index = 1; index <= 3; index += 1) {
    const player = await joinPlayer(url, `Revealspeler ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }
  for (let index = 0; index < 5; index += 1) host.emit("host_add_test_player");
  await waitUntil(() => hostState?.players?.length === 8, "eight players");

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty preset");
  for (const [roleId, count] of [["villager", 4], ["werewolf", 2], ["seer", 1], ["witch", 1]]) {
    host.emit("host_set_role_count", { roleId, count });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 8, "eight roles");
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "assigned roles");

  const shared = { wolfTargetKey: null };
  const nightDeadline = Date.now() + 10000;
  while (hostState?.phase === "night" && Date.now() < nightDeadline) {
    players.forEach(player => submitNightAction(player, shared));
    if (!hostState.currentStep || hostState.currentStep.ready) host.emit("host_next_step");
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  await waitUntil(() => hostState?.phase === "day", "day phase");

  host.emit("host_open_day_vote");
  await waitUntil(() => hostState?.phase === "voting" && hostState?.dayVote?.open, "open day vote");
  host.emit("host_close_day_vote");
  await waitUntil(() => hostState?.dayVote?.result?.revealToken, "Host live result");
  await waitUntil(() => viewerState?.dayVote?.result?.revealToken, "Infoscherm result");
  await waitUntil(() => players.every(player => player.latest?.dayVote?.result), "Player waiting states");

  const token = hostState.dayVote.result.revealToken;
  assert.equal(hostState.dayVote.result.publicRevealed, false);
  assert.ok(hostState.dayVote.result.counts.some(row => row.votes > 0));
  for (const player of players) {
    assert.equal(player.latest.dayVote.result.revealed, false);
    assert.deepEqual(player.latest.dayVote.counts, []);
    assert.equal(player.latest.dayVote.result.eliminatedName, undefined);
  }

  viewer.emit("viewer_reveal_ack", { kind: "day_vote", token });
  await waitUntil(
    () => players.every(player => player.latest?.dayVote?.result?.publicRevealed === true),
    "Player result release",
  );
  assert.equal(hostState.dayVote.result.publicRevealed, true);
  assert.ok(players.every(player => player.latest.dayVote.counts.length > 0));
});
