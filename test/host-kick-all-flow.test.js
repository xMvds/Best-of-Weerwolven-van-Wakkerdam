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
    const timer = setTimeout(() => reject(new Error("connect timeout")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}

async function waitUntil(check, label, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timeout while waiting for ${label}`);
}

test("Host Kick all removes every player atomically and returns one clean lobby state", { timeout: 20000 }, async t => {
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
  }, "server process");

  const sockets = [];
  t.after(() => sockets.forEach(socket => socket.disconnect()));
  const host = await connect(url);
  sockets.push(host);
  let hostState = null;
  host.on("host_state", state => { hostState = state; });
  host.emit("register_host");
  await waitUntil(() => hostState, "initial Host state");

  const players = [];
  for (const name of ["Eerste", "Tweede", "Derde"]) {
    const socket = await connect(url);
    sockets.push(socket);
    const record = { socket, denied: null };
    socket.on("join_denied", message => { record.denied = message; });
    socket.emit("join", { name });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`join timeout for ${name}`)), 5000);
      socket.once("joined", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    players.push(record);
  }
  await waitUntil(() => hostState?.players?.length === 3, "three Host players");

  host.emit("host_kick_all_players");
  await waitUntil(() => hostState?.players?.length === 0, "empty Host player list");
  await waitUntil(() => players.every(player => player.denied), "all kick notices");
  assert.equal(hostState.phase, "lobby");
  assert.equal(hostState.started, false);
  assert.ok(players.every(player => /alle spelers/i.test(player.denied)));
});
