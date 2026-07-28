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

test("every enchanted player sees the complete current group without a Ready submission", { timeout: 30000 }, async t => {
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
  for (let index = 1; index <= 7; index += 1) {
    const player = await joinPlayer(url, `Betoverde ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty role preset");
  const assignments = [
    ["piper", players[0]],
    ["werewolf", players[1]],
    ["infectious_wolf", players[2]],
    ["witch", players[3]],
    ["elder", players[4]],
    ["villager", players[5]],
    ["villager", players[6]],
  ];
  for (const [roleId, count] of [["piper", 1], ["werewolf", 1], ["infectious_wolf", 1], ["witch", 1], ["elder", 1], ["villager", 2]]) {
    host.emit("host_set_role_count", { roleId, count });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 7, "seven roles");
  for (const [roleId, player] of assignments) {
    host.emit("host_assign_role", { playerKey: player.key, roleId });
    await waitUntil(() => hostState?.players?.find(p => p.key === player.key)?.assignedRoleId === roleId, `assigned ${roleId}`);
  }
  host.emit("host_start_game");
  await waitUntil(() => players[0].latest?.me?.roleId === "piper", "Piper role");

  for (let night = 1; night <= 3; night += 1) {
    host.emit("host_next_step");
    await waitUntil(() => hostState?.currentStep?.kind === "wolves", `wolves step ${night}`);
    const victim = night === 1 ? players[5] : night === 2 ? players[6] : players[4];
    const wolves = players.filter(player => player.latest?.action?.kind === "wolves");
    await waitUntil(() => players.filter(player => player.latest?.action?.kind === "wolves").length >= 2, `wolf actions ${night}`);
    for (const wolf of players.filter(player => player.latest?.action?.kind === "wolves")) {
      wolf.socket.emit("player_action", { kind: "wolves", targetKey: victim.key, confirm: true });
    }
    await waitUntil(() => hostState?.currentStep?.ready, `wolf consensus ${night}`);
    host.emit("host_next_step");

    if (night === 1) {
      await waitUntil(() => hostState?.currentStep?.kind === "infectious_wolf", "infectious step");
      players[2].socket.emit("player_action", { kind: "infectious_wolf", choice: "yes" });
      await waitUntil(() => hostState?.currentStep?.ready, "infection ready");
      host.emit("host_next_step");
    }

    await waitUntil(() => hostState?.currentStep?.kind === "witch", `Witch step ${night}`);
    players[3].socket.emit("player_action", {
      kind: "witch",
      saveKey: night === 2 ? victim.key : null,
      poisonKey: null,
    });
    await waitUntil(() => hostState?.currentStep?.ready, `Witch ready ${night}`);
    host.emit("host_next_step");

    await waitUntil(() => hostState?.currentStep?.kind === "piper", `Piper step ${night}`);
    await waitUntil(() => players[0].latest?.action?.kind === "piper", `Piper action ${night}`);
    const choices = (players[0].latest.action.options || []).slice(0, 2).map(option => option.key);
    assert.equal(choices.length, 2);
    players[0].socket.emit("player_action", { kind: "piper", targetKeys: choices });
    await waitUntil(() => players[0].latest?.action?.submitted, `Piper submitted ${night}`);

    host.emit("host_next_step");
    await waitUntil(() => hostState?.currentStep?.kind === "enchanted_info", `enchanted info ${night}`);
    const expectedCount = night * 2;
    assert.equal(hostState.currentStep.actors.length, expectedCount);
    assert.equal(hostState.currentStep.ready, true);
    assert.deepEqual(hostState.currentStep.submissions, {});

    const enchantedPlayers = players.filter(player => player.latest?.me?.enchanted);
    assert.equal(enchantedPlayers.length, expectedCount);
    for (const player of enchantedPlayers) {
      assert.equal(player.latest.action.kind, "enchanted_info");
      assert.equal(player.latest.action.hostControlled, true);
      assert.equal(player.latest.action.people.length, expectedCount - 1);
      assert.ok(player.latest.action.people.every(person => person.cardRoleId === "villager"));
    }

    if (night < 3) {
      host.emit("host_next_step");
      await waitUntil(() => hostState?.phase === "day", `day ${night}`);
      host.emit("host_start_next_night");
      await waitUntil(() => hostState?.phase === "night" && hostState?.nightNumber === night + 1, `night ${night + 1}`);
    }
  }
});
