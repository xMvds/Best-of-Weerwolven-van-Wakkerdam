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
  for (let index = 1; index <= 6; index += 1) {
    const player = await joinPlayer(url, `Kaartspeler ${index}`);
    players.push(player);
    sockets.push(player.socket);
  }

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty role preset");
  host.emit("host_set_role_count", { roleId: "villager", count: 2 });
  for (const roleId of ["werewolf", "seer", "witch", "cupid"]) {
    host.emit("host_set_role_count", { roleId, count: 1 });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 6, "six selected roles");
  host.emit("host_assign_role", { playerKey: players[0].key, roleId: "cupid" });
  host.emit("host_assign_role", { playerKey: players[1].key, roleId: "seer" });
  await waitUntil(
    () => hostState?.players?.find(p => p.key === players[0].key)?.assignedRoleId === "cupid"
      && hostState?.players?.find(p => p.key === players[1].key)?.assignedRoleId === "seer",
    "preassigned Cupid and Seer",
  );
  host.emit("host_start_game");
  await waitUntil(() => players.every(player => player.latest?.me?.roleId), "assigned roles");
  assert.equal(players[0].latest.me.roleId, "cupid");
  assert.equal(players[1].latest.me.roleId, "seer");
  const firstNightKinds = hostState.nightSteps.map(step => step.kind);
  assert.ok(firstNightKinds.includes("lovers_info"), "Lovers must already be visible in the first-night timeline");
  assert.ok(firstNightKinds.indexOf("cupid") < firstNightKinds.indexOf("lovers_info"));

  const variants = hostState.players.map(player => player.cardVariant);
  assert.ok(variants.every(variant => [1, 2, 3, 4].includes(variant)));
  const variantCounts = [1, 2, 3, 4].map(variant => variants.filter(value => value === variant).length);
  assert.ok(Math.max(...variantCounts) - Math.min(...variantCounts) <= 1);

  const byRole = roleId => players.find(player => player.latest.me.roleId === roleId);
  const cupid = byRole("cupid");
  const seer = byRole("seer");
  const wolf = byRole("werewolf");
  const witch = byRole("witch");
  const villager = byRole("villager");
  const spareVillager = players.find(player => player.latest.me.roleId === "villager" && player.key !== villager?.key);
  assert.ok(cupid && seer && wolf && witch && villager && spareVillager);

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "cupid", "Cupid step");
  await waitUntil(() => cupid.latest?.action?.kind === "cupid", "Cupid player action");
  assert.ok(cupid.latest.action.options.every(option => option.cardRoleId === "villager" && !option.cardRevealed));
  assert.ok(cupid.latest.action.options.every(option => option.key !== cupid.key), "Cupid must not be able to choose themself");
  cupid.socket.emit("player_action", { kind: "cupid", targetKeys: [wolf.key, villager.key] });
  await waitUntil(() => cupid.latest?.action?.submitted, "Cupid confirmation");
  await waitUntil(
    () => hostState.players.find(player => player.key === wolf.key)?.persistentLinks?.some(link => link.kind === "love"),
    "Host lover badges",
  );
  assert.equal(cupid.latest.roleInfo.facts.find(fact => fact.title === "Door jou gekoppeld")?.people.length, 2);

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "lovers_info", "lovers step");
  await waitUntil(
    () => wolf.latest?.action?.kind === "lovers_info" && villager.latest?.action?.kind === "lovers_info",
    "both lover cards",
  );
  assert.equal(wolf.latest.action.lover.key, villager.key);
  assert.equal(wolf.latest.action.lover.cardRoleId, "villager");
  assert.equal(wolf.latest.action.lover.cardRevealed, false);
  assert.equal(villager.latest.action.lover.key, wolf.key);
  assert.equal(villager.latest.action.lover.cardRoleId, "villager");
  assert.equal(villager.latest.action.lover.cardRevealed, false);
  wolf.socket.emit("player_action", { kind: "lovers_info", ready: true });
  await waitUntil(() => !!villager.latest?.me?.loverHeartPulse?.token, "lover heart for villager");
  villager.socket.emit("player_action", { kind: "lovers_info", ready: true });
  await waitUntil(() => !!wolf.latest?.me?.loverHeartPulse?.token, "lover heart for wolf");
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
  await waitUntil(() => wolf.latest?.action?.submitted, "Wolf choice confirmation");
  assert.equal(wolf.latest.action.submission.targetKey, wolfVictim.key);
  assert.equal(wolf.latest.action.submission.targetCard?.key, wolfVictim.key);
  assert.equal(wolf.latest.action.sleepMessage, "De Weerwolven gaan weer slapen.");
  const hostWolfChoice = hostState.currentStep.wolfConsensus.rows.find(row => row.key === wolf.key);
  assert.equal(hostWolfChoice.targetCard?.key, wolfVictim.key);
  assert.equal(hostWolfChoice.targetCard?.cardRoleId, "villager");
  assert.equal(hostState.currentStep.wolfConsensus.consensusTargetCard?.key, wolfVictim.key);

  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "witch", "Witch step");
  await waitUntil(() => witch.latest?.action?.kind === "witch", "Witch player action");
  assert.ok(witch.latest.action.allTargets.every(option => option.cardRoleId === "villager"));
  witch.socket.emit("player_action", { kind: "witch", saveKey: wolfVictim.key, poisonKey: spareVillager.key });
  await waitUntil(() => witch.latest?.action?.submitted, "Witch confirmation");
  await waitUntil(
    () => hostState.players.find(player => player.key === wolfVictim.key)?.persistentLinks?.some(link => link.kind === "witch-save")
      && hostState.players.find(player => player.key === spareVillager.key)?.persistentLinks?.some(link => link.kind === "witch-poison"),
    "Host Witch badges",
  );

  host.emit("host_next_step");
  await waitUntil(() => hostState?.phase === "day", "day after the first night");
  host.emit("host_start_next_night");
  await waitUntil(() => hostState?.phase === "night" && hostState?.nightNumber === 2, "second night");
  assert.equal(hostState.nightSteps.some(step => step.kind === "witch"), false, "Witch must not wake after both potions are used");
  assert.equal(hostState.nightSteps.some(step => step.kind === "lovers_info"), false, "Lovers only see each other in the first night");
  host.emit("host_next_step");
  await waitUntil(() => hostState?.currentStep?.kind === "seer", "second Seer step");
  await waitUntil(() => seer.latest?.action?.kind === "seer" && !seer.latest.action.submitted, "second Seer action");
  const rememberedWolf = seer.latest.action.options.find(option => option.key === wolf.key);
  assert.equal(rememberedWolf.cardRoleId, "werewolf");
  assert.equal(rememberedWolf.cardRevealed, true);

  host.emit("host_reset");
  await waitUntil(() => hostState?.phase === "lobby" && !hostState?.started, "reset lobby");
  assert.equal(hostState.players.find(player => player.key === players[0].key)?.assignedRoleId, "cupid");
  assert.equal(hostState.players.find(player => player.key === players[1].key)?.assignedRoleId, "seer");
});

test("bot personalities perform every active special role instead of silently doing nothing", { timeout: 20000 }, async t => {
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
  }, "bot server");

  const host = await connectSocket(url);
  t.after(() => host.disconnect());
  let hostState = null;
  host.on("host_state", state => { hostState = state; });
  host.emit("register_host");
  await waitUntil(() => hostState, "bot Host state");

  for (let count = 1; count <= 7; count += 1) {
    host.emit("host_add_test_player");
    await waitUntil(() => hostState?.players?.length === count, `bot ${count}`);
  }
  const bots = hostState.players.slice().sort((a, b) => a.seat - b.seat);

  host.emit("host_apply_preset", { preset: "custom" });
  await waitUntil(() => hostState?.selectedRoleTotal === 0, "empty bot preset");
  for (const roleId of ["villager", "infectious_wolf", "werewolf", "piper", "witch", "cupid", "seer"]) {
    host.emit("host_set_role_count", { roleId, count: 1 });
  }
  await waitUntil(() => hostState?.selectedRoleTotal === 7, "seven bot roles");

  const assignments = [
    ["villager", bots[0]],
    ["infectious_wolf", bots[1]], // avontuurlijk: gebruikt de besmetting
    ["werewolf", bots[2]],
    ["piper", bots[3]],
    ["witch", bots[4]], // avontuurlijk: gebruikt de gifdrank
    ["cupid", bots[5]],
    ["seer", bots[6]],
  ];
  for (const [roleId, bot] of assignments) {
    host.emit("host_assign_role", { playerKey: bot.key, roleId });
  }
  await waitUntil(
    () => assignments.every(([roleId, bot]) => hostState.players.find(player => player.key === bot.key)?.assignedRoleId === roleId),
    "bot role assignments",
  );

  host.emit("host_start_game");
  await waitUntil(() => hostState?.started && hostState?.nightNumber === 1, "bot game start");

  const openStep = async kind => {
    host.emit("host_next_step");
    return waitUntil(() => hostState?.currentStep?.kind === kind && hostState.currentStep.ready, `${kind} bot step`);
  };
  const firstSubmission = () => Object.values(hostState.currentStep.submissions || {})[0] || null;

  await openStep("cupid");
  assert.equal(firstSubmission()?.people?.length, 2, "Cupido bot must create a pair");
  await openStep("lovers_info");
  await openStep("seer");
  assert.ok(firstSubmission()?.targetKey, "Seer bot must investigate a target");
  await openStep("wolves");
  assert.ok(hostState.currentStep.wolfConsensus?.consensusTargetKey, "Bot wolves must reach a consensus");
  await openStep("infectious_wolf");
  assert.equal(firstSubmission()?.infect, true, "Adventurous Infectious Wolf must use its power");
  await openStep("witch");
  assert.ok(firstSubmission()?.poisonTarget?.key, "Adventurous Witch must use a potion");
  await openStep("piper");
  assert.ok(firstSubmission()?.people?.length >= 1, "Piper bot must enchant at least one player");
});
