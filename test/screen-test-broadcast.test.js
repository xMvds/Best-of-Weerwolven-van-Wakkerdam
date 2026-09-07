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

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => reject(new Error("Socket connection timeout")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}

function onceWhere(socket, eventName, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout while waiting for ${eventName}`));
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve(payload);
    };
    socket.on(eventName, handler);
  });
}

test("Host page tester temporarily drives real Player and Info screens without changing the lobby", { timeout: 15000 }, async t => {
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
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/host`)).ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  const host = await connect(url);
  const player = await connect(url);
  const viewer = await connect(url);
  t.after(() => [host, player, viewer].forEach(socket => socket.disconnect()));

  host.emit("register_host");
  viewer.emit("register_viewer");
  const joined = onceWhere(player, "joined", payload => payload?.name === "Tester");
  player.emit("join", { name: "Tester" });
  await joined;

  const sessionId = "broadcast_test_session";
  const playerMode = onceWhere(player, "screen_test_mode", payload => payload?.active && payload.sessionId === sessionId);
  const viewerMode = onceWhere(viewer, "screen_test_mode", payload => payload?.active && payload.sessionId === sessionId);
  host.emit("host_screen_test_open", { sessionId });
  await Promise.all([playerMode, viewerMode]);

  const playerPreview = onceWhere(player, "screen_test_preview", payload => payload?.state?.action?.kind === "seer");
  host.emit("host_screen_test_preview", {
    sessionId,
    surface: "player",
    state: { phase: "night", action: { kind: "seer", title: "Test Ziener" } },
    viewport: "phone",
  });
  const receivedPlayerPreview = await playerPreview;
  assert.equal(receivedPlayerPreview.surface, "player");
  assert.equal(receivedPlayerPreview.viewport, "phone");

  const infoPreview = onceWhere(viewer, "screen_test_preview", payload => payload?.state?.currentPublicMoment === "Testnacht");
  host.emit("host_screen_test_preview", {
    sessionId,
    surface: "info",
    state: { phase: "night", currentPublicMoment: "Testnacht" },
    viewport: "tablet",
  });
  const receivedInfoPreview = await infoPreview;
  assert.equal(receivedInfoPreview.surface, "info");
  assert.equal(receivedInfoPreview.viewport, "tablet");

  const forwarded = onceWhere(host, "screen_test_player_event", payload => payload?.eventName === "player_action");
  player.emit("screen_test_player_event", {
    sessionId,
    eventName: "player_action",
    payload: { kind: "seer", targetKey: "test_2" },
  });
  assert.equal((await forwarded).payload.targetKey, "test_2");

  const playerClosed = onceWhere(player, "screen_test_mode", payload => payload?.active === false && payload.sessionId === sessionId);
  const viewerClosed = onceWhere(viewer, "screen_test_mode", payload => payload?.active === false && payload.sessionId === sessionId);
  host.emit("host_screen_test_close", { sessionId });
  await Promise.all([playerClosed, viewerClosed]);
});
