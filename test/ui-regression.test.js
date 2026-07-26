const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("release version is coherent in server, package and browser cache keys", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "0.3.44");
  assert.match(read("server.js"), /const VERSION = "0\.3\.44";/);
  for (const file of ["public/host.html", "public/index.html", "public/viewer.html"]) {
    assert.match(read(file), /\?v=0\.3\.44/);
    assert.doesNotMatch(read(file), /\?v=0\.3\.43/);
  }
});

test("browser scripts remain syntactically valid", () => {
  for (const file of ["server.js", "public/host.js", "public/player.js", "public/viewer.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("general v0.3.39 centering layer is reverted while the reveal animation remains", () => {
  const css = read("public/style.css");
  assert.doesNotMatch(css, /v0\.3\.39 — één stabiele centreerlaag/);
  const marker = css.indexOf("v0.3.40 — oorspronkelijke HUD-layout hersteld");
  assert.ok(marker > 0, "v0.3.40 animation layer is missing");
  const finalLayer = css.slice(marker);
  assert.match(finalLayer, /\.dayVoteResultStage\.hasReveal \.dayVoteGraphColumn[\s\S]*transform:translateX\(0\)!important/);
  assert.match(finalLayer, /\.dayVoteResultStage\.hasReveal\.revealReady \.dayVoteGraphColumn[\s\S]*translateX\(23%\)!important/);
  assert.match(finalLayer, /\.dayVoteResultStage \.dayElimReveal:not\(\.hidden\)[\s\S]*stableReveal/);
  assert.match(finalLayer, /\.viewerHero\.night \.viewerPlayers[\s\S]*flex-wrap:wrap!important[\s\S]*justify-content:space-evenly!important/);
  assert.match(finalLayer, /\.infoVoters \.candidatePill[\s\S]*width:auto!important[\s\S]*font-size:var\(--voter-font-size,22px\)/);
  assert.match(finalLayer, /\.hostScreen #phasePills\{min-height:34px/);
  assert.doesNotMatch(finalLayer, /\.playerCenter\.action-wolves>h1/);
  assert.doesNotMatch(finalLayer, /\.viewerPlayers\.ultraDense/);
});

test("info voting reaches and holds the final vote", () => {
  const viewer = read("public/viewer.js");
  const server = read("server.js");
  assert.match(viewer, /--voter-font-size:\$\{Math\.max\(11,22-Math\.max\(0,String\(v\.name\|\|""\)\.length-10\)\*\.55\)\.toFixed\(1\)\}px/);
  assert.match(server, /const VOTE_REVEAL_MS = 6500;/);
  assert.match(viewer, /Number\(timing\.revealDurationMs \|\| 6500\)/);
  assert.match(viewer, /const progress = Math\.min\(1, elapsed \/ duration\)/);
  assert.match(viewer, /const eased = progress;/);
  assert.match(viewer, /progress >= 1 \? final : Math\.floor\(final \* eased\)/);
  assert.doesNotMatch(viewer, /1 - Math\.pow\(1 - progress, 3\)|finalVoteHold|countDuration/);
  assert.doesNotMatch(viewer, /ownDuration = final <= 0/);
});

test("join screen offers a visible Meedoen button and keeps keyboard Enter support", () => {
  const html = read("public/index.html");
  const player = read("public/player.js");
  assert.match(html, /<form id="joinForm" class="joinForm">/);
  assert.match(html, /id="nameInput"[^>]*enterkeyhint="join"/);
  assert.match(html, /id="joinBtn"[^>]*type="submit">Meedoen met het spel<\/button>/);
  assert.match(player, /\$\("joinForm"\)\?\.addEventListener\("submit", e=>\{ e\.preventDefault\(\); join\(\); \}\)/);
  assert.match(player, /if\(e\.key==="Enter"\)\{ e\.preventDefault\(\); join\(\); \}/);
});

test("Host Start and Reset stay in a dedicated fixed primary row", () => {
  const html = read("public/host.html");
  const css = read("public/style.css");
  const primary = html.slice(html.indexOf('class="btnrow controlPrimaryButtons"'), html.indexOf('class="btnrow controlContextButtons"'));
  assert.match(primary, /id="startBtn"/);
  assert.match(primary, /id="resetBtn"/);
  assert.doesNotMatch(primary, /id="nextStepBtn"/);
  assert.match(css, /\.controlPrimaryButtons[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css, /\.hostScreen #phasePills\{[\s\S]*height:68px[\s\S]*max-height:68px/);
});

test("Seer confirmation shows the selected player's name and role card on Player and Host", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  const host = read("public/host.js");
  assert.match(server, /targetRoleId: target\.roleId, targetRoleName: targetRole\.name, targetRoleEmoji: targetRole\.emoji/);
  assert.match(player, /class="seerRevealResult"/);
  assert.match(player, /getRoleArt\(sub\.targetRoleId, sub\.targetKey/);
  assert.match(player, /const ownCard = a\.kind === "seer" \? "" : roleCard\(true\)/);
  assert.match(host, /roleTargetDecision\("Bekijkt", value\)/);
  assert.match(host, /class="hostTargetRoleCard"/);
});

test("public results remain gated until their reveal boundary while Host stays live", () => {
  const server = read("server.js");
  assert.match(server, /const voteRevealPending = !!game\.dayVote\?\.result && !resultIsPublic\(game\.dayVote\.result\)/);
  assert.match(server, /alive: pendingEliminatedKey === p\.key \? true : p\.alive/);
  assert.match(server, /lastDeaths: voteRevealPending \? \(game\.lastDeaths \|\| \[\]\)\.filter/);
  assert.match(server, /game\.publicWinnerRevealed = false/);
  assert.match(server, /socket\.on\("viewer_reveal_ack"/);
  assert.match(server, /releaseResultToPlayers\(kind, token\)/);
  assert.match(server, /releaseWinnerToPlayers\(token\)/);
  const hostState = server.slice(server.indexOf("function hostState"), server.indexOf("function resultIsPublic"));
  assert.match(hostState, /winner: game\.winner/);
  assert.match(hostState, /dayVote: dayVoteView\(\)/);
  assert.doesNotMatch(hostState, /publicWinnerVisible|voteRevealPending|resultIsPublic/);
});

test("winner page swaps only after the Infoscherm is fully black", () => {
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(viewer, /document\.body\.classList\.add\("winnerTransitionBlack"\)/);
  assert.match(viewer, /setTimeout\(\(\)=>\{[\s\S]*displayedState=s;[\s\S]*render\(s\);[\s\S]*acknowledgeReveal\("winner", s\.winnerRevealToken\);[\s\S]*\},840\)/);
  assert.match(css, /@keyframes winnerPageSwap\{[\s\S]*50%\{opacity:1\}[\s\S]*56%\{opacity:1\}/);
});

test("touch layouts scroll on Player, Host and Info without changing the desktop layer", () => {
  const css = read("public/style.css");
  const marker = css.indexOf("v0.3.44 — volledige kaart-PNG's");
  assert.ok(marker > 0);
  const touchLayer = css.slice(marker);
  assert.match(touchLayer, /@media \(hover:none\) and \(pointer:coarse\), \(max-width:900px\)/);
  assert.match(touchLayer, /body\.playerScreen\.inGame\{[\s\S]*overflow-y:auto!important[\s\S]*-webkit-overflow-scrolling:touch/);
  assert.match(touchLayer, /\.playerActionPanel\{[\s\S]*height:auto!important[\s\S]*overflow:visible!important/);
  assert.match(touchLayer, /\.confirmBtn,[\s\S]*#wolfConfirmBtn,[\s\S]*#submitWitch\{[\s\S]*position:sticky[\s\S]*safe-area-inset-bottom/);
  assert.match(touchLayer, /\.hostScreen \.grid,[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(touchLayer, /body\.infoScreen\{[\s\S]*overflow-y:auto!important/);
  assert.match(touchLayer, /\.infoScreen \.viewerHero\{[\s\S]*min-height:100dvh!important[\s\S]*overflow:visible!important/);
});

test("role PNGs use contained aspect-ratio boxes and wolf winner cards cannot be clipped", () => {
  const css = read("public/style.css");
  const marker = css.indexOf("v0.3.44 — volledige kaart-PNG's");
  const finalLayer = css.slice(marker);
  assert.match(finalLayer, /\.playerIdentityCard\.choiceIdentity,[\s\S]*aspect-ratio:1061 \/ 1483[\s\S]*overflow:visible!important/);
  assert.match(finalLayer, /\.playerTargetChoice \.wolfTargetMeta\{[\s\S]*position:static!important/);
  assert.match(finalLayer, /\.winnerRoleCard,[\s\S]*object-fit:contain!important[\s\S]*object-position:center!important/);
  assert.match(finalLayer, /\.winnerMainCards \.winnerPlayerCard\{[\s\S]*height:auto!important[\s\S]*overflow:visible!important/);
  assert.match(finalLayer, /\.winnerMainCards \.winnerRoleCard\{[\s\S]*height:var\(--winner-card-art-height,220px\)!important/);
});

test("Witch target selection uses responsive action-colored player cards without extra emoji icons", () => {
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(player, /class="witchChoiceTile \$\{tone\} \$\{selected===key\?"selected":""\}"/);
  assert.match(player, /renderPlayerIdentity\(person,"witchIdentity"\)/);
  assert.doesNotMatch(player, /"💚"|"☠"/);
  assert.match(css, /\.witchChoices[\s\S]*display:flex[\s\S]*flex-wrap:wrap/);
  assert.match(css, /\.witchChoiceTile\.save\.selected/);
  assert.match(css, /\.witchChoiceTile\.poison\.selected/);
});

test("player identities default to Burger cards and reveal only authorized role cards", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(server, /function playerCardIdentity\(observer, target/);
  assert.match(server, /const actualVisible = !!target && \(revealActual \|\| !target\.alive \|\| !!seerRoleId\)/);
  assert.match(server, /const roleId = actualVisible \? \(seerRoleId \|\| target\.roleId \|\| "villager"\) : "villager"/);
  assert.match(server, /p\.seerKnowledge\[target\.key\] = target\.roleId/);
  assert.match(server, /case "seer":[\s\S]*observer: p/);
  assert.match(player, /class="choice playerTargetChoice/);
  assert.match(player, /renderPlayerIdentity\(o,"choiceIdentity"\)/);
  assert.match(css, /\.playerTargetChoice[\s\S]*flex-direction:column!important/);
});

test("lovers see each other's name and real role card without an automatic camera connection", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  assert.match(server, /case "lovers_info":[\s\S]*playerTargetOption\(p, lover, \{ revealActual: true \}\)/);
  assert.match(server, /Kijk om je heen om je geliefde te spotten/);
  assert.match(player, /function renderLoversInfo\(a\)/);
  assert.match(player, /class="loverReveal"/);
  assert.match(player, /renderPlayerIdentity\(lover,"loverIdentity"\)/);
  assert.doesNotMatch(player, /getUserMedia|RTCPeerConnection/);
});

test("submitted night actions use the sleep message and never show Ingestuurd", () => {
  const player = read("public/player.js");
  assert.match(player, /const submittedTitle = voteAction \? a\.title : "Je antwoord is doorgevoerd"/);
  assert.match(player, /De \$\{esc\(sleepRole\)\} gaat weer slapen/);
  assert.doesNotMatch(player, /<p>Ingestuurd\.<\/p>/);
});

test("Player vote data stays hidden while Host remains live", () => {
  const server = read("server.js");
  assert.match(server, /function playerDayVoteView\(selfKey\)/);
  assert.match(server, /dayVote: playerDayVoteView\(p\.key\)/);
  assert.match(server, /revealPending[\s\S]*counts: \[\][\s\S]*liveCounts: \[\]/);
  const hostState = server.slice(server.indexOf("function hostState"), server.indexOf("function publicState"));
  assert.match(hostState, /dayVote: dayVoteView\(\)/);
});

test("village winner cards stay equal with defeated wolves in a responsive red side panel", () => {
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(viewer, /const winnerColumns = Math\.min\([\s\S]*Math\.ceil\(Math\.sqrt\(Math\.max\(1, main\.length\) \* 1\.6\)\)/);
  assert.match(viewer, /class="winnerCards winnerMainCards"/);
  assert.match(viewer, /class="winnerGroupTitle"/);
  assert.match(viewer, /const groupTitle = s\.winner\?\.team === "village" \? "Het Dorp"/);
  assert.match(viewer, /class="defeatedWolves" style="--defeated-count:\$\{defeated\.length\};--defeated-panel-width:\$\{defeatedWidth\}px"/);
  assert.match(css, /\.winnerMainCards \.winnerPlayerCard[\s\S]*height:calc\(var\(--winner-card-art-height,220px\) \+ 48px\)!important/);
  assert.match(css, /\.winnerStage\.hasDefeated \.winnerLayout[\s\S]*grid-template-columns:minmax\(0,1fr\) max-content!important/);
  assert.match(css, /\.winnerMainCards[\s\S]*grid-template-columns:repeat\(var\(--winner-cols,1\),minmax\(0,1fr\)\)!important[\s\S]*width:100%!important/);
  assert.match(css, /\.winnerStage\.hasDefeated \.defeatedWolves[\s\S]*width:var\(--defeated-panel-width,180px\)[\s\S]*background:linear-gradient/);
  assert.match(css, /\.viewerHero\.ended \.winnerStage>h3[\s\S]*display:none!important/);
  assert.match(css, /\.viewerHero\.ended \.deathCards[\s\S]*flex:1 1 auto[\s\S]*min-height:0/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*\.winnerStage\.hasDefeated \.winnerLayout\{grid-template-columns:1fr!important/);
});

test("player target tiles keep a natural size and distribute without edge-to-edge stretching", () => {
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(player, /--choice-font-size:\$\{nameFontSize\}px/);
  assert.match(css, /\.playerCenter\.active \.playerChoices[\s\S]*display:flex!important[\s\S]*flex-wrap:wrap[\s\S]*justify-content:space-evenly/);
  assert.match(css, /\.playerCenter\.active \.playerChoices \.choice[\s\S]*flex:0 1 clamp\(160px,25vw,245px\)!important/);
});

test("Host current step is simplified and receives live unconfirmed role choices", () => {
  const host = read("public/host.js");
  const player = read("public/player.js");
  const server = read("server.js");
  const renderStep = host.slice(host.indexOf("function renderStep"), host.indexOf("function renderHostMayorStep"));
  assert.match(renderStep, /renderHostRoleChoices\(s\)/);
  assert.doesNotMatch(renderStep, /formatNightPreview|class="progress"|✅|⏳/);
  assert.match(host, /roleDecision\("Levensdrank", `Redt \$\{value\.saveName \|\| "niemand"\}`/);
  assert.match(host, /roleDecision\("Gifdrank", `Vergiftigt \$\{value\.poisonName \|\| "niemand"\}`/);
  assert.match(host, /roleDecision\("Bekijkt", value\.targetName \|\| "Nog niemand gekozen"/);
  assert.match(host, /roleDecision\("Geliefde 1"[\s\S]*roleDecision\("Geliefde 2"/);
  assert.match(server, /previews: step\.previews \|\| \{\}/);
  assert.match(server, /step\.previews = step\.previews \|\| \{\}/);
  assert.match(server, /const preview = !submitted \? step\.previews\?\.\[p\.key\] \|\| null : null/);
  assert.match(server, /if \(!payload\.targetKey\) \{[\s\S]*delete step\.previews\[p\.key\]/);
  assert.match(server, /if \(step\.kind === "witch"\)[\s\S]*saveName[\s\S]*poisonName/);
  assert.match(player, /socket\.emit\("player_preview", \{ kind:a\.kind, targetKeys:\[\.\.\.selectedTargets\] \}\)/);
  assert.match(player, /kind:"witch"[\s\S]*saveKey:[\s\S]*poisonKey:/);
  assert.match(player, /const preview=a\.preview\|\|\{\}/);
  assert.match(player, /witchChoice\("save",o\.key,o\.name,selectedSave/);
  assert.match(player, /witchChoice\("poison",o\.key/);
  assert.match(player, /selectedSingle = selectedSingle === key \? null : key/);
});

test("Heks and Ziener card PNGs exist and are wired to player and info views", () => {
  for (const file of ["public/assets/cards/Heks.png", "public/assets/cards/Ziener.png"]) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.ok(bytes.length > 1_000_000, `${file} is unexpectedly small`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const player = read("public/player.js");
  assert.match(player, /seer:\s*\[\{ src: "\/assets\/cards\/Ziener\.png"/);
  assert.match(player, /witch:\s*\[\{ src: "\/assets\/cards\/Heks\.png"/);
  const viewer = read("public/viewer.js");
  assert.match(viewer, /"Ziener": \["\/assets\/cards\/Ziener\.png"\]/);
  assert.match(viewer, /"Heks": \["\/assets\/cards\/Heks\.png"\]/);
});

test("Windows starter waits for the server and opens all three screens", () => {
  const starter = read("START-WAKKERDAM-LOCALHOST.bat");
  assert.match(starter, /Invoke-WebRequest[^\r\n]*http:\/\/localhost:3000\/host/);
  assert.match(starter, /Start-Process 'http:\/\/localhost:3000\/player'/);
  assert.match(starter, /Start-Process 'http:\/\/localhost:3000\/host'/);
  assert.match(starter, /Start-Process 'http:\/\/localhost:3000\/info'/);
  assert.ok(starter.indexOf("powershell.exe") < starter.indexOf("call npm start"));
});

test("duplicate and obsolete public copy is removed", () => {
  const publicCopy = [
    read("public/host.html"),
    read("public/index.html"),
    read("public/viewer.html"),
    read("public/host.js"),
    read("public/player.js"),
    read("public/viewer.js")
  ].join("\n");
  assert.doesNotMatch(publicCopy, /Wacht tot iedereen joined/);
  assert.doesNotMatch(publicCopy, /Verteller \/ spelleider/);
  assert.doesNotMatch(publicCopy, /Kandidaten: \$\{/);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw lastError || new Error(`Server did not start at ${url}`);
}

test("clean server exposes Host, Speler and Infoscherm routes", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForServer(`${base}/host`);
  for (const route of ["/host", "/player", "/info", "/style.css", "/host.js", "/player.js", "/viewer.js", "/assets/cards/Heks.png", "/assets/cards/Ziener.png"]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
  }
  const legacy = await fetch(`${base}/viewer`, { redirect: "manual" });
  assert.ok([301, 302, 307, 308].includes(legacy.status));
  assert.equal(legacy.headers.get("location"), "/info");
});
