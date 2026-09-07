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
  assert.equal(pkg.version, "0.3.72");
  assert.match(read("server.js"), /const VERSION = "0\.3\.72";/);
  for (const file of ["public/host.html", "public/index.html", "public/viewer.html", "public/screen-test.html"]) {
    assert.match(read(file), /\?v=0\.3\.72/);
  }
});

test("browser scripts remain syntactically valid", () => {
  for (const file of ["server.js", "peek-system.js", "public/host.js", "public/player.js", "public/viewer.js", "public/screen-test.js", "public/fog-effect.js", "public/peek-mechanics.js", "public/wakkerdam-storm-effect.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("v0.3.55 integrates all three Spiekende Meisje mechanics and an isolated centered View studio", () => {
  const server = read("server.js");
  const rules = read("peek-system.js");
  const player = read("public/player.js");
  const peekUi = read("public/peek-mechanics.js");
  const host = read("public/host.js");
  const studio = read("public/screen-test.js");
  const studioHtml = read("public/screen-test.html");
  const css = read("public/style.css");

  assert.match(server, /startPeekForWolfStep/);
  assert.match(server, /currentPeekWarningForPlayer/);
  assert.match(server, /peek_instruction_ack/);
  assert.match(server, /peek_interaction/);
  assert.match(server, /peek_warning_ack/);
  assert.doesNotMatch(server.match(/function publicState[\s\S]*?function publicMayorElectionView/)?.[0] || "", /peek:/);
  assert.match(rules, /const PEEK_MODES = Object\.freeze\(\["eyelids", "mirror", "fog"\]\)/);
  assert.match(rules, /function refillBag/);
  assert.match(rules, /function finishPeekSession/);
  assert.match(rules, /WAKKERDAM_PEEK_ENABLED/);
  assert.match(player, /screenTestMode \? ""/);
  assert.match(player, /if\(screenTestMode\) return;/);
  assert.match(player, /const socket = io\(\{autoConnect:!screenTestMode\}\)/);
  assert.match(player, /event\.data\.sessionId && event\.data\.sessionId!==screenTestSession/);
  assert.match(player, /little_girl_peek/);
  assert.match(peekUi, /bindEyelids/);
  assert.match(peekUi, /bindMirror/);
  assert.match(peekUi, /bindFog/);
  assert.match(peekUi, /function cleanupAll/);
  assert.match(host, /function renderHostPeekStatus/);
  assert.doesNotMatch(studioHtml, /Live state-inspector/);
  assert.doesNotMatch(studioHtml, /Simuleer 100 cycli/);
  assert.doesNotMatch(studioHtml, /id="screenTestPrimaryPane"|id="screenTestFrame"/);
  assert.match(studioHtml, /id="peekWolfMonitor"[\s\S]*id="peekWolfMonitorFrame"/);
  assert.doesNotMatch(studioHtml, /id="screenTestWolfTab"/);
  assert.doesNotMatch(studioHtml, /id="screenTestWolfPane"|id="screenTestWolfFrame"/);
  assert.match(studio, /viewport:activeViewport/);
  assert.match(studio, /publishScenario\(\{preserveState=false\}=\{\}\)/);
  assert.doesNotMatch(studio, /simulateHundredCycles/);
  assert.match(player, /id="remoteDeviceFrame"|remoteDeviceFrame/);
  assert.match(css, /\.screenTestStage\{[\s\S]*?align-items:center;[\s\S]*?justify-content:center;/);
  for (const viewport of [
    /\.screenTestViewport\.phone\{width:390px;height:844px\}/,
    /\.screenTestViewport\.phoneWide\{width:430px;height:932px\}/,
    /\.screenTestViewport\.tablet\{width:820px;height:1080px\}/,
    /\.screenTestViewport\.monitor\{width:1280px;height:720px\}/,
  ]) assert.match(css, viewport);
  assert.match(css, /\.screenTestViewport\.phoneWide\{width:430px;height:932px\}/);
});

test("Player and Info previews stay socket-free and accept only their current isolated session", () => {
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const studio = read("public/screen-test.js");

  assert.match(player, /const socket = io\(\{autoConnect:!screenTestMode\}\)/);
  assert.match(viewer, /const socket=io\(\{autoConnect:!screenTestMode\}\)/);
  assert.match(player, /let playerKey = screenTestMode \? ""/);
  assert.match(player, /if\(screenTestMode\) return;[\s\S]*?socket\.emit\("player_sync"/);
  assert.match(player, /event\.data\.sessionId && event\.data\.sessionId!==screenTestSession/);
  assert.match(viewer, /event\.data\.sessionId&&event\.data\.sessionId!==screenTestSession/);
  assert.match(studio, /publishScenario\(\{preserveState:true\}\)/);
  assert.doesNotMatch(studio, /const frame=document\.getElementById\("screenTestFrame"\)/);
});

test("every page-tester select stays readable without a white native fallback", () => {
  const studioHtml = read("public/screen-test.html");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.56 · leesbare keuzelijsten"));

  for (const id of ["screenTestGroup", "screenTestScenario", "peekTestMode"]) {
    assert.match(studioHtml, new RegExp(`<select id="${id}"`));
  }
  assert.match(layer, /\.screenTestStudio select\{[\s\S]*appearance:none;[\s\S]*color-scheme:dark;/);
  assert.match(layer, /color:#fff0cb!important;/);
  assert.match(layer, /background-color:#080c14!important;/);
  assert.match(layer, /\.screenTestStudio select option,[\s\S]*background:#080c14!important;/);
  assert.match(layer, /\.screenTestStudio select option:checked\{[\s\S]*color:#211706!important;[\s\S]*background:#e2ba5b!important;/);
  assert.match(layer, /\.screenTestStudio select:focus,[\s\S]*border-color:#f0c95a!important;/);
});

test("v0.3.57 fits every device preview and lets isolated Player actions drive test flows", () => {
  const studioHtml = read("public/screen-test.html");
  const studio = read("public/screen-test.js");
  const player = read("public/player.js");
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.57 · volledig passende interactieve paginatester"));

  assert.doesNotMatch(studioHtml, /id="screenTestScaleLabel"/);
  assert.match(studioHtml, /id="screenTestReplay"/);
  assert.match(studioHtml, /id="screenTestPlayNext"/);
  assert.match(studio, /const viewportSpecs=\{[\s\S]*phone:\{width:390,height:844[\s\S]*phoneWide:\{width:430,height:932[\s\S]*tablet:\{width:820,height:1080[\s\S]*monitor:\{width:1280,height:720/);
  assert.match(player, /const scale=Math\.min\(1,availableWidth\/spec\.width,availableHeight\/spec\.height\)/);
  assert.match(player, /frame\.style\.transform=`scale\(\$\{scale\}\)`/);
  assert.match(player, /function applyRemoteDevicePreview\(mode="auto"\)/);
  assert.match(player, /wakkerdam-screen-test-player-event/);
  assert.match(studio, /function simulatePlayerEvent\(eventName,payload=\{\}\)/);
  assert.match(studio, /function runHunterFlow\(target\)/);
  assert.match(studio, /openScenario\("info","Jager","Jager kiest"/);
  assert.match(studio, /hunterInfoState\("shot_suspense",target\)/);
  assert.match(studio, /hunterInfoState\("summary",target\)/);
  assert.match(player, /wakkerdam-screen-test-role-info/);
  assert.match(layer, /\.screenTestViewport\.fitted iframe\{[\s\S]*transform-origin:top left/);
  assert.match(layer, /\.screenTestEmbedded \.roleInfoFab\{[\s\S]*pointer-events:auto!important/);

  assert.ok(fs.existsSync(path.join(root, "public/assets/peek/cold-night-clearing.png")));
  assert.match(layer, /url\("\/assets\/peek\/cold-night-clearing\.png"\)/);
  assert.match(layer, /@keyframes peekStarsBreathe/);
  assert.match(peekUi, /open > 0\.14/);
  assert.match(rules, /strength = clampNumber\(hoverMs \/ 1150/);
  assert.match(rules, /kind === "fog_brush"/);
  assert.match(rules, /fog: Object\.freeze\(\{[\s\S]*timeBudgetMs: 15000/);
});

test("v0.3.58 keeps the mechanic preview compact and adds natural peek focus plus themed winner reveals", () => {
  const studioHtml = read("public/screen-test.html");
  const studio = read("public/screen-test.js");
  const player = read("public/player.js");
  const peekUi = read("public/peek-mechanics.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.58 · compacte mechanic-zijbalk"));

  assert.match(studioHtml, /id="screenTestWorkspace"/);
  assert.match(studioHtml, /id="peekWolfMonitor"/);
  assert.doesNotMatch(studioHtml, /id="screenTestWolfTab"/);
  assert.match(studioHtml, /id="peekTestMode"/);
  assert.match(studioHtml, /id="peekTestPlayers"/);
  assert.match(studioHtml, /id="peekTestWolves"/);
  for (const removed of [
    "peekTestRisk",
    "peekTestTime",
    "peekTestWipes",
    "peekTestReducedMotion",
    "peekStateInspector",
    "peekSimulateHundred",
    "peekTestWolfLook",
    "peekTestMinor",
    "peekTestMajor",
  ]) assert.doesNotMatch(studioHtml, new RegExp(`id="${removed}"`));
  assert.match(studio, /group:"Nachtrollen",label:"Spiekende Meisje testen"/);
  assert.doesNotMatch(studio, /group:"Spiekende Meisje/);
  assert.doesNotMatch(studio, /Math\.round\(scale\*100\)/);
  assert.match(studio, /function updateWolfPreview/);
  assert.doesNotMatch(studio, /wakkerdam-peek-visual-progress/);
  assert.match(player, /wakkerdam-peek-visual-progress/);

  assert.match(peekUi, /class="peekEyeMask"/);
  assert.match(peekUi, /data-peek-eye-mask/);
  assert.match(peekUi, /displayRemaining = Math\.max\(0, this\.timeSnapshotMs - localPeekElapsed\)/);
  assert.match(peekUi, /node\.style\.setProperty\("--peek-focus"/);
  assert.match(peekUi, /<svg class="peekShard"/);
  assert.match(peekUi, /this\.listen\(shard, "pointerdown", start\)/);
  assert.match(layer, /\.screenTestWorkspace\.peek-active\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(230px,270px\)/);
  assert.match(layer, /\.peekCirclePlayer\{[\s\S]*--peek-focus:0;[\s\S]*blur\(calc\(\(1 - var\(--peek-focus\)\) \* 5px\)\)/);
  assert.match(layer, /\.peekShard\{[\s\S]*pointer-events:visiblePainted/);
  assert.match(layer, /\.peekEyeMask\{/);

  assert.match(viewer, /winnerTransitionEndTimer=setTimeout\(\(\)=>document\.body\.classList\.remove\("winnerTransitionBlack",winnerTone\),3450\)/);
  assert.match(layer, /@keyframes winnerFullBlackReveal/);
  assert.match(layer, /@keyframes winnerThunderReveal/);
  assert.match(layer, /@keyframes wolfWinnerRain/);
  assert.match(layer, /@keyframes wolfWinnerLightning/);
  assert.match(layer, /@keyframes winnerSunReveal/);
  assert.match(layer, /@keyframes villageWinnerRays/);
});

test("v0.3.59 integrates the real card, live dual Player view, gradual fog, safe Kick all and dense wolf rain", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const studio = read("public/screen-test.js");
  const studioHtml = read("public/screen-test.html");
  const host = read("public/host.js");
  const hostHtml = read("public/host.html");
  const server = read("server.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.59 · echte dubbele Playerpreview"));

  assert.ok(fs.existsSync(path.join(root, "public/assets/cards/spiekende_meisje.png")));
  assert.match(player, /little_girl: \[\{ src: "\/assets\/cards\/spiekende_meisje\.png"/);
  assert.match(host, /little_girl:"\/assets\/cards\/spiekende_meisje\.png"/);
  assert.match(viewer, /"Het Spiekende Meisje": \["\/assets\/cards\/spiekende_meisje\.png"\]/);

  assert.match(rules, /fog: Object\.freeze\(\{[\s\S]*timeBudgetMs: 15000/);
  assert.match(rules, /kind === "fog_brush_start"/);
  assert.match(rules, /kind === "fog_brush"/);
  assert.match(rules, /kind === "fog_brush_stop"/);
  assert.match(rules, /identity: fullyCaught && girl/);
  assert.match(rules, /roleCardSrc: "\/assets\/cards\/spiekende_meisje\.png"/);
  assert.doesNotMatch(rules, /fogActionsRemaining/);
  assert.doesNotMatch(peekUi, /fog_swipe|data-wipe-pip/);
  assert.match(peekUi, /class="peekShardReflection"/);
  assert.match(read("public/fog-effect.js"), /pushPuffsFromHand/);

  assert.doesNotMatch(studioHtml, /id="screenTestWolfFrame"|id="screenTestWolfViewport"|id="screenTestWolfTab"/);
  assert.match(studioHtml, /id="peekWolfMonitor"[\s\S]*Wat de wolven zien[\s\S]*id="peekWolfMonitorFrame"/);
  assert.match(studio, /function postWolfMonitor\(\)/);
  assert.match(studio, /function wolfPreviewState\(\)/);
  assert.match(studio, /state:currentScenarioState[\s\S]*viewport:activeViewport/);
  assert.match(player, /remoteDeviceSpecs = Object\.freeze/);

  assert.match(hostHtml, /id="kickAllBtn"/);
  assert.match(hostHtml, /id="screenTestHostOverlay"/);
  assert.match(host, /button\.textContent="Zeker weten\?"/);
  assert.match(host, /socket\.emit\("host_kick_all_players"\)/);
  assert.match(host, /testFrame\.src="\/screen-test\.html\?embeddedHost=1"/);
  assert.doesNotMatch(host, /window\.open\("\/screen-test\.html"/);
  assert.match(server, /socket\.on\("host_kick_all_players"/);

  assert.match(viewer, /function winnerScoreTitle\(winner\)/);
  assert.match(viewer, /const verb = \["wolves", "lovers"\]\.includes\(winner\?\.team\) \? "hebben" : "heeft"/);
  assert.doesNotMatch(viewer, /function winnerRainMarkup|syncWinnerWeather/);
  assert.match(viewer, /storm\.usePreset\("wolf"\)/);
  assert.match(layer, /linear-gradient\(180deg,#08152c 0%,#030817 55%,#000 100%\)/);
  assert.match(layer, /@keyframes winnerRainDrop/);
  assert.match(layer, /animation:winnerThunderFlash 10s linear 5s infinite/);
});

test("v0.3.60 separates safe time exhaustion from detection and mirrors the tester to real screens", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const host = read("public/host.js");
  const server = read("server.js");
  const studio = read("public/screen-test.js");
  const css = read("public/style.css");

  assert.doesNotMatch(rules, /remainingPeekMs <= 0\) \{\s*session\.risk = 100/);
  assert.match(rules, /continuousRiskMs: 3200/);
  assert.doesNotMatch(rules, /wolfHover && hoverMs >= 2350/);
  assert.doesNotMatch(rules, /isWolfKey\(focusTarget\.key\) && focusMs >= 3000/);
  assert.match(rules, /function syncRiskCooling/);
  assert.match(rules, /cooling: false/);

  assert.ok(fs.existsSync(path.join(root, "public/assets/peek/spiekende-meisje-schim.png")));
  assert.match(peekUi, /spiekende-meisje-schim\.png/);
  assert.match(peekUi, /level-\$\{esc\(warning\.level\)\}/);
  assert.match(peekUi, /mirror_start/);
  assert.match(peekUi, /mirror_stop/);
  assert.match(peekUi, /data-peek-danger/);
  assert.match(css, /\.peekWolfWarning\.level-presence/);
  assert.match(css, /\.peekDangerHint\.visible/);

  assert.match(server, /host_screen_test_open/);
  assert.match(server, /host_screen_test_preview/);
  assert.match(server, /screen_test_player_event/);
  assert.match(host, /wakkerdam-screen-test-broadcast/);
  assert.match(studio, /wakkerdam-screen-test-broadcast/);
  assert.match(studio, /wakkerdam-screen-test-external-player-event/);
  assert.match(player, /socket\.on\("screen_test_preview"/);
  assert.match(viewer, /socket\.on\("screen_test_preview"/);
});

test("v0.3.61 keeps mirror input and supplied shadows while the current tester restores a device preview", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const studio = read("public/screen-test.js");
  const studioHtml = read("public/screen-test.html");
  const server = read("server.js");
  const css = read("public/style.css");

  assert.doesNotMatch(studioHtml, /id="screenTestPrimaryPane"|id="screenTestFrame"/);
  assert.doesNotMatch(studioHtml, /id="peekWolfPreview"|id="screenTestWolfTab"/);
  assert.match(studioHtml, /id="peekWolfMonitor"[\s\S]*Wat de wolven zien/);
  assert.match(studioHtml, /werkelijk geopende Player- of Infopagina’s/);
  assert.match(studio, /function publishScenario/);
  assert.match(studio, /function postWolfMonitor/);
  assert.match(studio, /wakkerdam-screen-test-broadcast/);
  assert.match(css, /\.remoteDevicePreview\{/);

  assert.match(peekUi, /const characterShadowSources = Object\.freeze/);
  for (let index = 1; index <= 4; index += 1) {
    assert.ok(fs.existsSync(path.join(root, `public/assets/peek/burger-${index}-schim.png`)));
    assert.match(peekUi, new RegExp(`burger-${index}-schim\\.png`));
  }
  assert.match(peekUi, /data-shard-character/);
  assert.match(peekUi, /this\.peek\?\.mode === "mirror"\) this\.endMirrorPointer/);
  assert.doesNotMatch(peekUi, /mirrorSafetyTimer/);
  assert.doesNotMatch(rules, /lastMirrorSignalAt/);
  assert.match(server, /mirror: "mirror_stop"/);
  assert.match(css, /\.peekCharacterShadow img\{/);

  const suppliedGirl = fs.readFileSync(path.join(root, "public/assets/peek/spiekende-meisje-schim.png"));
  assert.ok(suppliedGirl.length > 100000, "the supplied Spiekende Meisje shadow is packaged");
});

test("v0.3.62 unifies peek timing, keeps shard names readable and fully fits the wolf view", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const studio = read("public/screen-test.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.62 · één spiektimer"));

  assert.match(rules, /const PEEK_MODE_CONFIG = Object\.freeze/);
  assert.match(rules, /eyelids: Object\.freeze\(\{[\s\S]*timeBudgetMs: 4000/);
  assert.match(rules, /mirror: Object\.freeze\(\{[\s\S]*timeBudgetMs: 8000/);
  assert.match(rules, /fog: Object\.freeze\(\{[\s\S]*timeBudgetMs: 15000/);
  assert.match(rules, /elapsed \/ 1000\) \* 10/);
  assert.match(rules, /function finishRiskStep/);
  assert.match(rules, /stopInteraction\(session\)/);

  assert.match(peekUi, /<small>Spiektijd<\/small><strong data-peek-time>/);
  assert.match(peekUi, /class="peekShardNameplate"/);
  assert.match(peekUi, /data-shard-name/);
  assert.doesNotMatch(peekUi, /function mirrorNamesMarkup|class="peekMirrorNames"/);
  assert.match(peekUi, /releasePointerCapture/);
  assert.match(peekUi, /const wolfShadowSource = "\/assets\/peek\/wolf-schim\.png"/);
  assert.ok(fs.existsSync(path.join(root, "public/assets/peek/wolf-schim.png")));

  assert.match(studio, /group:"Nachtrollen",label:"Spiekende Meisje testen"[\s\S]*peekMechanic:true/);
  assert.match(studio, /activeScenario\(\)\?\.peekMechanic===true/);
  assert.match(studio, /wolfMonitor\?\.classList\.toggle\("hidden",!peekActive\)/);
  assert.match(layer, /grid-template-rows:auto auto auto minmax\(0,1fr\)!important/);

  assert.match(viewer, /return `\$\{group\}\\n\$\{verb\} Gewonnen`/);
  assert.match(layer, /from\{transform:translate3d\(-18px,-130px,0\) rotate\(8deg\)\}/);
  assert.match(layer, /\.viewerHero\.ended #bigStatus,[\s\S]*white-space:pre-line/);
});

test("v0.3.63 keeps peek risk live, scopes the wolf shadow and closes exhausted time cleanly", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.63 · vloeiende spiekstate"));

  assert.match(rules, /function riskTrendPerSecond/);
  assert.match(rules, /continuousRiskMs: 3200/);
  assert.match(rules, /riskTrendPerSecond: riskTrendPerSecond\(session, now\)/);
  assert.match(rules, /const activelyObserved = !!session\.interaction\?\.active/);
  assert.match(rules, /session\.interaction\.hoverKey === wolfKey/);
  assert.match(rules, /nameHint: !fullyCaught/);

  assert.match(peekUi, /class="peekEyeBloom"/);
  assert.match(peekUi, /class="peekCharacterWolf"/);
  assert.match(peekUi, /class="peekShardWolfPerson"/);
  assert.match(peekUi, /class="peekShardNameplate"/);
  assert.match(peekUi, /displayRisk\(\)/);
  assert.match(peekUi, /ensureRiskAnimation\(\)/);
  assert.match(peekUi, /Je spiektijd is voorbij/);
  assert.match(peekUi, /Probeer het de volgende nacht opnieuw/);
  assert.doesNotMatch(peekUi, /Ze keek te lang/);

  assert.match(layer, /\.peekEyeBloom\{/);
  assert.match(layer, /\.peekCharacterShadow \.peekCharacterWolf\{/);
  assert.match(layer, /\.peekShardNameplate text\{/);
  assert.match(layer, /\.peekWarningName\{/);
  assert.match(layer, /\.peekWolfWarning\.level-major \.peekWarningSilhouette,[\s\S]*display:none!important/);
  assert.match(layer, /\.peekTimeExpired\{/);
});

test("v0.3.64 centers winner groups and keeps every peek mechanic fluid and recoverable", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const viewer = read("public/viewer.js");
  const studio = read("public/screen-test.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.64 · rustige winnaarsreveal"));

  assert.match(viewer, /class="piperEnchantedCards" style="\$\{enchantedStyle\}"/);
  assert.match(viewer, /--piper-stack-index:\$\{index \+ 1\}/);
  assert.match(viewer, /class="winnerStage loverWinnerStage"/);
  assert.match(viewer, /loverVillageGroup/);
  assert.match(viewer, /loverWolfGroup/);
  assert.match(studio, /alive:team==="lovers" \? index<2/);

  assert.match(layer, /\.piperEnchantedScroller\{[\s\S]*overflow:hidden!important/);
  assert.match(layer, /\.loverWinnerLayout\{[\s\S]*grid-template-columns:minmax\(170px,1fr\) minmax\(300px,1\.4fr\) minmax\(170px,1fr\)/);
  assert.match(layer, /@keyframes winnerSoftCurtain/);
  assert.match(layer, /background:rgba\(0,0,0,var\(--winner-curtain-alpha\)\)!important/);
  assert.match(layer, /from\{transform:translate3d\(72px,-150px,0\) rotate\(10deg\)\}/);
  assert.doesNotMatch(layer, /winnerDiagonalCurtain/);

  assert.match(rules, /mirror:[\s\S]*continuousRiskMs: 6200/);
  assert.match(rules, /fog:[\s\S]*continuousRiskMs: 9800/);
  assert.match(rules, /const config = PEEK_MODE_CONFIG\[session\.mode\]/);
  assert.doesNotMatch(peekUi, /serverEndedInteraction/);
  assert.match(peekUi, /--wolf-morph/);
  assert.match(peekUi, /window\.WakkerdamFog\.create/);
  assert.doesNotMatch(peekUi, /class="peekFogHands"|class="peekFogPushLayers"/);
  assert.match(layer, /\.peekEyeBloom\{[\s\S]*stroke:rgba\(0,0,0/);
  assert.match(layer, /\.peekExperience\.peekInstruction\{[\s\S]*justify-content:center!important/);
  assert.match(layer, /\.peekDangerHint\{[\s\S]*top:clamp/);
  assert.match(read("public/fog-effect.css"), /\.wf-pushing \.wf-push-hands/);
});

test("v0.3.65 never turns peek risk into an input timeout or blockade", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const css = read("public/style.css");

  assert.doesNotMatch(rules, /cooldownAt|resumeBelow|requestCooldown|function isCooling/);
  assert.doesNotMatch(rules, /reason: "cooling"/);
  assert.doesNotMatch(rules, /detectionLevel === "major"\) \{\s*stopInteraction/);
  assert.doesNotMatch(rules, /now - lastMirrorSignalAt/);
  assert.match(rules, /cooling: false/);

  assert.doesNotMatch(peekUi, /mirrorSafetyTimer|serverEndedInteraction/);
  assert.doesNotMatch(peekUi, /peek\.cooling/);
  assert.match(peekUi, /De wolven hebben je gezien\. Je kunt blijven spieken zolang je nog spiektijd hebt\./);
  assert.doesNotMatch(css, /\.peek-cooling/);
});

test("v0.3.66 catches only at a full visible bar and keeps warning UI outside the playfield", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.66 · de zichtbare balk"));

  assert.match(rules, /level === "major" && Number\(session\.risk \|\| 0\) < 100/);
  assert.doesNotMatch(rules, /continuous > 1750\) session\.risk/);
  assert.doesNotMatch(rules, /hoverMs >= 2350[\s\S]*session\.risk = 100/);
  assert.doesNotMatch(rules, /focusMs >= 3000[\s\S]*session\.risk = 100/);
  assert.match(rules, /focusedWolfRate/);

  assert.match(peekUi, /class="peekDangerLane"[\s\S]*data-peek-danger/);
  assert.match(layer, /\.peekDangerLane\{[\s\S]*place-items:center/);
  assert.match(layer, /\.peekDangerHint\{[\s\S]*position:relative!important/);
  assert.match(layer, /\.peekScene\{[\s\S]*min-height:0!important/);
  assert.match(layer, /\.peekWolfWarning\.level-presence \.peekWarningSilhouette\{[\s\S]*opacity:calc\(\.08 \+ var\(--wolf-awareness\) \* \.62\)/);
});

test("v0.3.67 makes mirror eye contact explicit and closes locally exhausted tenths immediately", () => {
  const rules = read("peek-system.js");
  const peekUi = read("public/peek-mechanics.js");
  const css = read("public/style.css");
  const layer = css.slice(css.indexOf("v0.3.67 · langdurig oogcontact"));

  assert.match(rules, /wolfEyesRevealMs: 780/);
  assert.match(rules, /function mirrorWolfEyeFocus/);
  assert.match(rules, /mirrorEyeContactActive: mirrorEyeFocus\.active/);
  assert.match(rules, /eyeContactStrength: eyeContact \? mirrorEyeFocus\.strength : 0/);
  assert.match(rules, /timeExpired: Number\(session\.remainingPeekMs \|\| 0\) <= 0/);
  const eyeFocusHelper = rules.match(/function mirrorWolfEyeFocus[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(eyeFocusHelper, /session\.risk\s*=\s*100/);

  assert.match(peekUi, /expireTimeLocally\(\)/);
  assert.match(peekUi, /if \(sessionChanged\) this\.localTimeExhausted = false/);
  assert.match(peekUi, /timeExpired: true/);
  assert.doesNotMatch(peekUi, /Ze kijkt recht in je rode ogen/);
  assert.match(peekUi, /--wolf-eye-contact/);
  assert.match(layer, /\.peekWolfWarning\.level-presence\.eye-contact/);
  assert.match(layer, /\.peekWarningEyeContact\{/);
  assert.match(layer, /\.peekShard\.eye-contact \.peekShardWolf/);
});

test("v0.3.68 uses physical fog objects without an alpha erase layer", () => {
  const playerHtml = read("public/index.html");
  const peekUi = read("public/peek-mechanics.js");
  const fog = read("public/fog-effect.js");
  const fogCss = read("public/fog-effect.css");
  const css = read("public/style.css");

  assert.ok(fs.existsSync(path.join(root, "public/fog-effect.js")));
  assert.ok(fs.existsSync(path.join(root, "public/fog-effect.css")));
  assert.match(playerHtml, /fog-effect\.css\?v=0\.3\.72/);
  assert.match(playerHtml, /fog-effect\.js\?v=0\.3\.72[\s\S]*peek-mechanics\.js\?v=0\.3\.72/);
  assert.match(peekUi, /const approvedFogSettings = Object\.freeze/);
  assert.match(peekUi, /density: 600[\s\S]*motion: 110[\s\S]*turbulence: 600/);
  assert.match(peekUi, /window\.WakkerdamFog\.create/);
  assert.match(peekUi, /this\.fogEffect\?\.destroy\(\)/);
  assert.match(peekUi, /this\.listen\(fogInput, "pointercancel", stop\)/);
  assert.doesNotMatch(peekUi, /destination-out|setupFogCanvas|eraseFog|data-peek-fog|data-fog-pulse/);

  assert.match(fog, /class InteractiveFog/);
  assert.match(fog, /ResizeObserver/);
  assert.match(fog, /resizePreservingMist/);
  assert.match(fog, /pushPuffsFromHand/);
  assert.match(fog, /applyReturnPressure/);
  assert.match(fog, /setInteractive\(interactive\)/);
  assert.doesNotMatch(fog, /destination-out|globalCompositeOperation|clearRect\([^)]*\)[\s\S]{0,120}arc\(/);
  assert.match(fogCss, /\.wakkerdam-fog-layer/);
  assert.match(fogCss, /touch-action: none/);
  assert.match(css, /v0\.3\.68 · fysieke mistobjecten/);
});

test("v0.3.72 keeps the wolf storm once and copies the approved smooth card-reveal timeline", () => {
  const viewerHtml = read("public/viewer.html");
  const viewer = read("public/viewer.js");
  const storm = read("public/wakkerdam-storm-effect.js");
  const stormCss = read("public/wakkerdam-storm-effect.css");
  const studio = read("public/screen-test.js");

  assert.ok(fs.existsSync(path.join(root, "public/wakkerdam-storm-effect.js")));
  assert.ok(fs.existsSync(path.join(root, "public/wakkerdam-storm-effect.css")));
  assert.match(viewerHtml, /style\.css\?v=0\.3\.72[\s\S]*wakkerdam-storm-effect\.css\?v=0\.3\.72/);
  assert.match(viewerHtml, /wakkerdam-storm-effect\.js\?v=0\.3\.72[\s\S]*viewer\.js\?v=0\.3\.72/);

  assert.match(viewer, /s\?\.winner\?\.team!=="wolves"/);
  assert.match(viewer, /const token=String\(s\?\.winnerRevealToken\|\|""\)/);
  assert.match(viewer, /if\(winnerKey===lastStormWinnerKey\)return/);
  assert.match(viewer, /storm\.usePreset\("wolf"\)/);
  assert.match(viewer, /storm\.prepareReveal\(content\)/);
  assert.match(viewer, /storm\.revealWinner\(content\)\.then\(completed=>/);
  assert.match(viewer, /acknowledgeReveal\("winner",s\.winnerRevealToken\)/);
  assert.match(viewer, /applyHeroPhaseClasses\(hero,infoClass\)/);
  assert.doesNotMatch(viewer, /hero\.className=`viewerHero|winnerRainMarkup|syncWinnerWeather/);

  assert.match(storm, /wolf:\{density:210,speed:660,wind:210/);
  assert.match(storm, /const vx=-wind\*drop\.drift; \/\/ rechtsboven -> linksonder/);
  assert.match(storm, /const branchCount=Math\.max\(0,Math\.round\(this\._number\('branches'\)\)\)/);
  assert.match(storm, /this\.flash\.addEventListener\('animationend'/);
  assert.match(storm, /this\.flash\.addEventListener\('animationcancel'/);
  assert.match(storm, /element\.classList\.remove\('is-active','is-reveal-main','is-reveal-echo'\)/);
  assert.match(storm, /element\.style\.removeProperty\('opacity'\)/);
  assert.match(storm, /element\.style\.removeProperty\('visibility'\)/);
  assert.match(storm, /this\.flashResetTimer=setTimeout\(\(\)=>this\._resetFlash\(\),650\)/);
  assert.match(storm, /this\._setContentStage\('card-reveal',contentElement\)/);
  assert.match(storm, /this\._activateRevealFlashes\(\)/);
  assert.match(storm, /const alreadyPrepared=this\.revealPrepared/);
  assert.match(storm, /if\(!alreadyPrepared\)this\.prepareReveal\(contentElement\)/);
  assert.match(stormCss, /wdCardBlackoutReveal 2300ms[\s\S]*820ms both/);
  assert.match(stormCss, /wdCardGlobalShadow 1900ms[\s\S]*1900ms both/);
  assert.match(stormCss, /wdCardShadowPass 1950ms[\s\S]*2020ms \+ var\(--card-index,0\) \* 70ms/);
  assert.match(stormCss, /wdCardLight 3150ms[\s\S]*2630ms \+ var\(--card-index,0\) \* 120ms/);
  assert.match(stormCss, /wdCardHeadingReveal 1650ms[\s\S]*4380ms both/);
  assert.match(studio, /state\.winnerPublicRevealed=team!=="wolves"/);
});

test("v0.3.72 aligns the tester, shows wolves by default and tunes both real screens", () => {
  const studioHtml = read("public/screen-test.html");
  const studio = read("public/screen-test.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const peekUi = read("public/peek-mechanics.js");
  const fogCss = read("public/fog-effect.css");
  const css = read("public/style.css");
  const finalLayer = css.slice(css.indexOf("v0.3.70 FINAL CASCADE LOCK"));

  assert.match(studioHtml, /data-test-viewport="auto"[\s\S]*data-test-viewport="phone"[\s\S]*data-test-viewport="phoneWide"[\s\S]*data-test-viewport="tablet"[\s\S]*data-test-viewport="monitor"/);
  assert.doesNotMatch(studioHtml, /id="screenTestFrame"|id="screenTestWolfFrame"/);
  assert.doesNotMatch(studioHtml, /Wat de weerwolf ziet/);
  assert.match(studioHtml, /id="peekWolfMonitor"[\s\S]*id="peekWolfMonitorFrame"/);
  assert.match(player, /id="remoteDeviceFrame"|remoteDeviceFrame/);
  assert.match(read("public/viewer.html"), /id="remoteDevicePreview"[\s\S]*id="remoteDeviceFrame"/);
  assert.match(player, /phone:\{width:390,height:844[\s\S]*phoneWide:\{width:430,height:932[\s\S]*tablet:\{width:820,height:1080[\s\S]*monitor:\{width:1280,height:720/);
  assert.match(viewer, /phone:\{width:390,height:844[\s\S]*phoneWide:\{width:430,height:932[\s\S]*tablet:\{width:820,height:1080[\s\S]*monitor:\{width:1280,height:720/);
  assert.match(studio, /viewport:activeViewport/);
  assert.match(studio, /function postWolfMonitor\(\)/);

  const fogSliders = [...studioHtml.matchAll(/data-fog-setting="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(fogSliders, ["density","motion","turbulence","pushHeight","handMotion","handSize","pushForce","returnPush","refill","inertia"]);
  assert.match(studioHtml, /id="peekCautionStrength"[\s\S]*id="peekSeconds"/);
  assert.match(studioHtml, /id="peekSettingsExport"[\s\S]*Exporteer alle instellingen/);
  assert.match(studio, /async function exportPeekSettings\(\)/);
  assert.match(studio, /link\.download="wakkerdam-spiekende-meisje-testinstellingen\.json"/);
  assert.match(studio, /testOnly:true[\s\S]*mechanics,[\s\S]*fog:\{\.\.\.fogTestSettings\}/);
  assert.match(peekUi, /settings: \{\.\.\.approvedFogSettings,\.\.\.\(this\.peek\?\.fogSettings\|\|\{\}\)\}/);
  assert.match(peekUi, /this\.fogEffect\.updateSettings\(\{/);
  assert.match(fogCss, /\.wf-pushing \.wf-cursor-hand \{[\s\S]*opacity: 0;/);

  assert.doesNotMatch(peekUi, /Ze kijkt recht in je rode ogen|peekWarningEyeContact/);
  assert.match(finalLayer, /\.peekWarningName\{[\s\S]*blur\(calc\(18px - var\(--wolf-awareness\) \* 8px\)\)[\s\S]*peekWarningNameMorph/);

  assert.match(player, /class="brokenPiperCard"[\s\S]*assets\/cards\/fluitspeler\.png/);
  assert.doesNotMatch(player.match(/function renderEnchantmentBroken[\s\S]*?\n}/)?.[0] || "", /Host gaat verder|brokenMagicMark/);
  assert.match(css, /\.brokenPiperCard img\{[\s\S]*grayscale\(1\)/);
  assert.match(finalLayer, /\.enchantmentBrokenNotice\{border-radius:0!important\}/);

  assert.match(viewer, /class="loverWinnerLead"[\s\S]*class="loverSupportRow/);
  assert.match(viewer, /loverVillageGroup[\s\S]*loverWolfGroup/);
  assert.match(finalLayer, /v0\.3\.72 · compacte tester/);
  assert.match(finalLayer, /\.infoScreen \.loverWinnerLead\{[\s\S]*grid-column:1!important;[\s\S]*grid-row:1!important/);
  assert.match(finalLayer, /\.screenTestStudio \.screenTestMeta\{[\s\S]*grid-template-areas:"summary actions" "description actions"/);
  assert.match(finalLayer, /\.screenTestStudio \.peekFogControls\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(finalLayer, /\.card,\.btn,input,select,textarea[\s\S]*border-radius:0!important/);
});

test("v0.3.54 adds stable selection updates, universal force controls and the screen tester", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  const host = read("public/host.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  const hostHtml = read("public/host.html");
  const studioHtml = read("public/screen-test.html");
  const studio = read("public/screen-test.js");
  const finalLayer = css.slice(css.indexOf("v0.3.54 —"));

  assert.match(player, /function patchStableSelectionState\(box,fragment\)/);
  assert.match(player, /data-action-key/);
  assert.match(player, /Maximaal \$\{max\} gekozen — deselecteer eerst iemand\./);
  assert.match(player, /Je hebt je geliefden gezien/);
  assert.match(player, /function renderEnchantmentBroken/);
  assert.match(player, /const playerSearchParams = new URLSearchParams/);
  assert.match(server, /function emitPreviewUpdate\(p\)/);
  assert.match(server, /function emitWolfStepUpdate\(step = game\.currentStep\)/);
  assert.match(server, /io\.to\("host"\)\.emit\("host_state", hostState\(\)\)/);
  assert.match(server, /p\?\.socketId\) io\.to\(p\.socketId\)\.emit\("player_state", playerState\(p\)\)/);
  assert.match(player, /socket\.emit\("player_preview", \{ kind:"wolves", targetKey:key \}\)/);
  const previewStart = server.indexOf('socket.on("player_preview"');
  const previewHandler = server.slice(previewStart, server.indexOf('socket.on("host_set_role_count"', previewStart));
  assert.doesNotMatch(previewHandler, /emitAll\(\)/);
  assert.match(server, /function projectedNightDeathSources\(\)/);
  assert.match(server, /function isAvailableForNightStep\(targetKey, stepKind\)/);
  assert.match(server, /piperSpellBreakPending/);
  assert.match(server, /"enchantment_broken"/);

  assert.match(host, /forceAdvanceSeconds = 1;/);
  assert.match(host, /Math\.max\(0,1000-\(performance\.now\(\)-startedAt\)\)/);
  assert.match(host, /missingCandidateResponses/);
  assert.match(host, /missingMayorVotes/);
  assert.match(host, /missingDayVotes/);
  assert.match(host, /context:"mayor:candidates"[\s\S]*event:"host_start_mayor_vote"/);
  assert.match(host, /context:"mayor:voting"[\s\S]*event:"host_close_mayor"/);
  assert.match(host, /context:"day:voting"[\s\S]*event:"host_close_day_vote"/);
  assert.match(host, /socket\.emit\(event, \{force:true\}\)/);
  assert.match(finalLayer, /\.btn\.forceArming::after\{[\s\S]*animation:forceButtonDrain 1s linear/);
  assert.match(finalLayer, /\.witchChoiceTile\.selected::after\{[\s\S]*content:none!important/);
  assert.match(finalLayer, /\.witchChoiceTile\.none\{[\s\S]*rgba\(240,201,90,.58\)/);
  assert.match(finalLayer, /\.selectionLimitHint\{/);

  assert.match(viewer, /const duration = 3000/);
  assert.match(viewer, /const localProgress = Math\.min\(1, progress \/ \(travelRatios\[i\] \|\| 1\)\)/);
  assert.match(finalLayer, /winnerChapterCurtain 2\.7s/);
  assert.match(finalLayer, /\.viewerHero\.ended\.winner-village/);
  assert.match(finalLayer, /\.viewerHero\.ended\.winner-wolves/);

  assert.match(hostHtml, /id="openScreenTestBtn"/);
  assert.doesNotMatch(studioHtml, /id="screenTestFrame"|id="screenTestWolfFrame"/);
  assert.match(read("public/index.html"), /id="remoteDeviceFrame"/);
  assert.match(studio, /const scenarios=\[/);
  assert.match(studio, /surface:"player"/);
  assert.match(studio, /surface:"info"/);
  assert.match(studio, /Betovering verbroken/);
  assert.match(studio, /Fluitspeler wint/);
});

test("stable reveal animation remains while the approved centered Info composition is preserved", () => {
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
  assert.match(finalLayer, /v0\.3\.49 — gerichte regressieherstel/);
  assert.match(finalLayer, /\.viewerHero\.night \.viewerPlayers\.ultraDense \.viewerPlayer\{[\s\S]*font-size:clamp\(8px,\.8vw,11px\)/);
  assert.match(finalLayer, /\.infoScreen \.viewerHero\.hunter \.viewerPlayers\s*\{display:none!important;\}/);
  assert.doesNotMatch(finalLayer, /\.infoScreen \.viewerHero:not\(\.viewerEnded\)\{[\s\S]*grid-template-rows/);
});

test("info voting moves every bar at one physical speed while the highest takes three seconds", () => {
  const viewer = read("public/viewer.js");
  const server = read("server.js");
  assert.match(viewer, /--voter-font-size:\$\{Math\.max\(11,22-Math\.max\(0,String\(v\.name\|\|""\)\.length-10\)\*\.55\)\.toFixed\(1\)\}px/);
  assert.match(server, /const VOTE_REVEAL_MS = 3000;/);
  assert.match(viewer, /const duration = 3000;/);
  assert.doesNotMatch(viewer, /const elapsedBeforeStart = timing\.revealStartedAt/);
  assert.match(viewer, /const progress = Math\.min\(1, elapsed \/ duration\)/);
  assert.match(viewer, /const travelRatios = bars\.map\(bar => Math\.max\(\.1, Math\.min\(1, Number\(bar\.dataset\.height \|\| 10\) \/ 100\)\)\)/);
  assert.match(viewer, /const localProgress = Math\.min\(1, progress \/ \(travelRatios\[i\] \|\| 1\)\)/);
  assert.match(viewer, /Math\.floor\(final \* localProgress\)/);
  assert.match(viewer, /bar\.style\.setProperty\("--graph-progress",String\(localProgress\),"important"\)/);
  assert.match(viewer, /Math\.max\(10,Math\.round\(\(\(r\.votes\|\|0\)\/max\)\*100\)\)/);
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
  assert.match(server, /targetRoleId: target\.roleId,[\s\S]*targetRoleName: targetRole\.name,[\s\S]*targetRoleEmoji: targetRole\.emoji/);
  assert.match(player, /class="seerRevealResult"/);
  assert.match(player, /getRoleArt\(sub\.targetRoleId, sub\.targetKey/);
  assert.match(player, /<h2>\$\{esc\(sub\.targetName \|\| "Speler"\)\} is de<\/h2>/);
  assert.doesNotMatch(player, /<h2>Te zien<\/h2>/);
  assert.doesNotMatch(player, /const ownCard =/);
  assert.match(host, /roleTargetDecision\("Bekijkt", value\)/);
  assert.match(host, /class="hostTargetRoleCard"/);
});

test("public results remain gated until their reveal boundary while Host stays live", () => {
  const server = read("server.js");
  assert.match(server, /const voteRevealPending = !!game\.dayVote\?\.result && !resultIsPublic\(game\.dayVote\.result\)/);
  assert.match(server, /const pendingDeathKeys = pendingPublicDeathKeys\(\)/);
  assert.match(server, /alive: pendingDeathKeys\.has\(p\.key\)/);
  assert.match(server, /lastDeaths: !forViewer && pendingDeathKeys\.size[\s\S]*filter\(d => !pendingDeathKeys\.has\(d\.key\)\)/);
  assert.match(server, /function startDeathReveal\(/);
  assert.match(server, /function releaseDeathToPlayers\(/);
  assert.match(server, /game\.publicWinnerRevealed = false/);
  assert.match(server, /socket\.on\("viewer_reveal_ack"/);
  assert.match(server, /releaseResultToPlayers\(kind, token\)/);
  assert.match(server, /releaseWinnerToPlayers\(token\)/);
  const hostState = server.slice(server.indexOf("function hostState"), server.indexOf("function resultIsPublic"));
  assert.match(hostState, /winner: game\.winner/);
  assert.match(hostState, /dayVote: dayVoteView\(\)/);
  assert.doesNotMatch(hostState, /publicWinnerVisible|voteRevealPending|resultIsPublic/);
});

test("winner page swaps behind a team-specific diagonal cinematic transition", () => {
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(viewer, /const winnerTone = s\.winner\?\.team === "village"[\s\S]*"winnerTransitionVillage"[\s\S]*"winnerTransitionWolves"/);
  assert.match(viewer, /document\.body\.classList\.add\("winnerTransitionBlack", winnerTone\)/);
  assert.match(viewer, /setTimeout\(\(\)=>\{[\s\S]*displayedState=s;[\s\S]*scheduleViewerRender\(s\);[\s\S]*acknowledgeReveal\("winner", s\.winnerRevealToken\);[\s\S]*\},960\)/);
  assert.match(css, /\.infoScreen\.winnerTransitionVillage::after[\s\S]*radial-gradient/);
  assert.match(css, /\.infoScreen\.winnerTransitionWolves::after[\s\S]*radial-gradient/);
  assert.match(css, /@keyframes winnerDiagonalCurtain\{[\s\S]*clip-path:polygon/);
  assert.match(css, /@keyframes winnerChapterCurtain\{[\s\S]*clip-path:polygon/);
});

test("choice screens fit their full grid and confirmation control inside touch viewports", () => {
  const css = read("public/style.css");
  const marker = css.indexOf("v0.3.46 — viewport-fit keuzes");
  assert.ok(marker > 0);
  const touchLayer = css.slice(marker);
  assert.match(touchLayer, /grid-template-columns:repeat\(var\(--choice-cols,3\),minmax\(0,1fr\)\)!important/);
  assert.match(touchLayer, /height:clamp\(70px,var\(--choice-card-vh,24svh\),250px\)!important/);
  assert.match(touchLayer, /@media\(max-width:900px\), \(hover:none\) and \(pointer:coarse\)/);
  assert.match(touchLayer, /body\.playerScreen\.inGame\{[\s\S]*overflow:hidden!important/);
  assert.match(touchLayer, /grid-template-columns:repeat\(var\(--choice-mobile-cols,2\),minmax\(0,1fr\)\)!important/);
  assert.match(touchLayer, /#submitWitch\{[\s\S]*height:44px!important/);
});

test("role PNGs use contained aspect-ratio boxes and wolf winner cards cannot be clipped", () => {
  const css = read("public/style.css");
  const marker = css.indexOf("v0.3.46 — viewport-fit keuzes");
  const finalLayer = css.slice(marker);
  assert.match(finalLayer, /\.playerIdentityCard\.choiceIdentity,[\s\S]*aspect-ratio:2 \/ 3!important[\s\S]*overflow:hidden!important/);
  assert.match(finalLayer, /\.winnerRoleCard,[\s\S]*object-fit:contain!important[\s\S]*object-position:center!important/);
  assert.match(finalLayer, /\.winnerMainCards \.winnerPlayerCard,[\s\S]*overflow:visible!important/);
});

test("Witch target selection uses responsive action-colored player cards without extra emoji icons", () => {
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(player, /class="witchChoiceTile \$\{tone\} \$\{selected===key\?"selected":""\}"/);
  assert.match(player, /renderPlayerIdentity\(person,"witchIdentity"\)/);
  assert.doesNotMatch(player, /"💚"|"☠"/);
  assert.match(css, /v0\.3\.46 — viewport-fit keuzes[\s\S]*\.witchChoices\{[\s\S]*display:grid!important/);
  assert.match(player, /const sharedMobileVh = Math\.max\(4\.4, Math\.min\(14, 52 \/ combinedMobileRows\)\)/);
  assert.match(css, /\.witchChoiceTile\.save\.selected/);
  assert.match(css, /\.witchChoiceTile\.poison\.selected/);
});

test("player identities default to Burger cards and reveal only authorized role cards", () => {
  const server = read("server.js");
  const host = read("public/host.js");
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

test("lovers see who they are linked to without learning each other's role", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  assert.match(server, /case "lovers_info":[\s\S]*lover: lover \? playerTargetOption\(p, lover\) : null/);
  assert.doesNotMatch(server, /case "lovers_info":[\s\S]{0,500}revealActual: true/);
  assert.match(server, /title: "Jouw geliefde"[\s\S]*playerTargetOption\(p, lover\)/);
  assert.match(server, /Kijk om je heen om je geliefde te spotten/);
  assert.match(player, /function renderLoversInfo\(a\)/);
  assert.match(player, /class="loverReveal"/);
  assert.match(player, /renderPlayerIdentity\(lover,"loverIdentity"\)/);
  assert.doesNotMatch(player, /getUserMedia|RTCPeerConnection/);
});

test("lover deaths stay linked to the original reveal and remain gated for Players", () => {
  const server = read("server.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(server, /linkedToKey: p\.key/);
  assert.match(server, /function pendingVoteDeathKeys\(\)/);
  assert.match(server, /result\.linkedDeaths = \(game\.lastDeaths \|\| \[\]\)/);
  assert.match(viewer, /function linkedDeathHtml\(primary, linkedDeaths=\[\]\)/);
  assert.match(viewer, /class="brokenHeartMark"/);
  assert.match(viewer, /linkedDeathHtml\(eliminatedDeath,result\.linkedDeaths\|\|\[\]\)/);
  assert.match(css, /\.loverDeathStack[\s\S]*position:absolute[\s\S]*top:0[\s\S]*left:0/);
});

test("action tiles are square and vote bars use count-aware linear travel", () => {
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(player, /class="witchNoActionIcon"/);
  assert.match(css, /v0\.3\.45 final cascade[\s\S]*\.playerScreen \.playerTargetChoice[\s\S]*border-radius:0!important/);
  assert.match(css, /\.playerScreen \.witchPanel>h3\{text-align:center!important;\}/);
  assert.match(viewer, /travelRatios/);
  assert.match(viewer, /bar\.style\.setProperty\("--graph-progress",String\(localProgress\),"important"\)/);
  assert.match(viewer, /bar\.style\.setProperty\("--graph-progress","1"\)/);
  assert.match(css, /\.mayorBarFill\{[\s\S]*transform:scaleY\(var\(--graph-progress,0\)\)!important/);
});

test("completed vote reveals never replay their popup animation after refresh", () => {
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(viewer, /JSON\.parse\(sessionStorage\.getItem\(revealMemoryKey\)/);
  assert.match(viewer, /const seenRevealTokens=loadSeenRevealTokens\(\)/);
  assert.match(viewer, /const alreadyRevealed = result\.publicRevealed !== false \|\| hasSeenReveal\(result\.revealToken\)/);
  assert.match(viewer, /classList\.add\("noReplay"\)/);
  assert.match(css, /\.voteFinalText\.noReplay[\s\S]*animation:none!important/);
  assert.match(css, /\.infoMayorResult\.noReplay \.mayorResultBar\{animation:none!important;\}/);
});

test("submitted night actions use the sleep message and never show Ingestuurd", () => {
  const player = read("public/player.js");
  assert.match(player, /const submittedTitle = voteAction[\s\S]*a\.kind === "lovers_info"[\s\S]*"Je hebt je geliefden gezien"[\s\S]*"Je koos"/);
  assert.match(player, /"Te redden"/);
  assert.match(player, /"Te vergiftigen"/);
  assert.match(player, /"Te betoveren"/);
  assert.doesNotMatch(player, /Je antwoord is doorgevoerd/);
  assert.doesNotMatch(player, /\$\{sleepMessage\}\$\{ownCard\}/);
  assert.match(player, /a\.sleepMessage \|\| `De \$\{sleepRole\} gaat weer slapen\.`/);
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
  assert.match(viewer, /const maxColumns = viewportWidth <= 600 \? 4 : viewportWidth <= 900 \? 6 : viewportWidth <= 1300 \? 8 : 10/);
  assert.match(viewer, /const winnerColumns = Math\.min\([\s\S]*maxColumns/);
  assert.match(viewer, /class="winnerCards winnerMainCards"/);
  assert.match(viewer, /class="winnerGroupTitle"/);
  assert.match(viewer, /const groupTitle = s\.winner\?\.team === "village" \? "Het Dorp"/);
  assert.match(viewer, /class="defeatedWolves" style="--defeated-count:\$\{defeated\.length\};--defeated-panel-width:\$\{defeatedWidth\}px"/);
  assert.match(css, /\.winnerMainCards \.winnerPlayerCard[\s\S]*height:calc\(var\(--winner-card-art-height,220px\) \+ 48px\)!important/);
  assert.match(css, /\.winnerStage\.hasDefeated \.winnerLayout[\s\S]*grid-template-columns:minmax\(0,1fr\) max-content!important/);
  assert.match(css, /\.winnerMainCards[\s\S]*grid-template-columns:repeat\(var\(--winner-cols,1\),minmax\(0,1fr\)\)!important[\s\S]*width:100%!important/);
  assert.match(css, /\.winnerStage\.hasDefeated \.defeatedWolves[\s\S]*width:var\(--defeated-panel-width,180px\)[\s\S]*background:linear-gradient/);
  assert.match(css, /\.infoScreen \.winnerStage\.hasDefeated \.defeatedWolves\{[\s\S]*align-self:center!important/);
  assert.doesNotMatch(viewer, /denseWinner|ultraDenseWinner/);
  assert.match(css, /\.viewerHero\.ended \.winnerStage>h3[\s\S]*display:none!important/);
  assert.match(css, /\.viewerHero\.ended \.deathCards[\s\S]*flex:1 1 auto[\s\S]*min-height:0/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*\.winnerStage\.hasDefeated \.winnerLayout\{grid-template-columns:1fr!important/);
});

test("player target tiles expose count-aware desktop and mobile grid metrics", () => {
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(player, /--choice-font-size:\$\{nameFontSize\}px/);
  assert.match(player, /function choiceGridMetrics\(count\)/);
  assert.match(player, /--choice-cols:\$\{desktopCols\}/);
  assert.match(player, /--choice-mobile-cols:\$\{mobileCols\}/);
  assert.match(css, /v0\.3\.46 — viewport-fit keuzes[\s\S]*display:grid!important[\s\S]*--choice-card-vh/);
});

test("Host can force unfinished choices while the Hunter announcement and summary remain normal clicks", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  assert.match(server, /function forceCompleteNightStep\(step\)/);
  assert.match(server, /step\.submissions\[key\] = step\.kind === "witch"/);
  assert.match(server, /function advanceHunterFromHost\(\{ force = false \} = \{\}\)/);
  assert.match(server, /if \(sequence\.stage === "announcement"\) \{\s*return advanceHunterIntro\(sequence\.introToken\)/);
  assert.match(server, /applyHunterShot\(target\.key, \{ forced: true \}\)/);
  assert.match(host, /\["choosing","shot_suspense"\]\.includes\(hunterStage\)/);
  assert.match(host, /hunterStage === "announcement" \? "Laat de Jager kiezen"/);
  assert.match(host, /hunterStage === "summary" \? "Naar volledig dagoverzicht"/);
  assert.match(host, /Forceren over \$\{Math\.max\(0,forceAdvanceSeconds\)/);
  assert.match(host, /btn\.textContent = "Nu forceren"/);
  assert.match(host, /socket\.emit\(event, \{force:true\}\)/);
});

test("lobby preassignment, balanced Burger identities and persistent Host links are wired", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  assert.match(server, /function assignBalancedVillagerCards\(players\)/);
  assert.match(server, /VILLAGER_CARD_VARIANTS\[index % VILLAGER_CARD_VARIANTS\.length\]/);
  assert.match(server, /socket\.on\("host_assign_role"/);
  assert.match(server, /preassignedRoleCounts\(player\.key\)/);
  assert.match(server, /function persistentLinksForHost\(p\)/);
  assert.match(host, /data-assigned-role=/);
  assert.match(host, /socket\.emit\("host_assign_role"/);
  assert.match(host, /class="persistentLinkBadge/);
});

test("Player role-info drawer keeps objectives and collected role knowledge available", () => {
  const html = read("public/index.html");
  const server = read("server.js");
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(html, /id="roleInfoFab"[^>]*>I<\/button>/);
  assert.match(html, /id="roleInfoPanel"/);
  assert.match(server, /function roleInformationForPlayer\(p\)/);
  assert.match(server, /title: "Bekeken spelers"/);
  assert.match(server, /title: "Door jou bespeeld"/);
  assert.match(player, /function renderRoleInfo\(\)/);
  assert.match(player, /\},7000\)/);
  assert.match(css, /\.roleInfoFab\{[\s\S]*border-radius:50%/);
});

test("v0.3.49 keeps scenes stable and presents Host, lover and enchanted details without duplicates", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(server, /if \(\["enchanted_info", "enchantment_broken"\]\.includes\(step\.kind\)\) return true/);
  assert.match(server, /function ensureEnchantedInfoStepAfter\(step\)/);
  assert.match(server, /const enchanted = alivePlayers\(\)\.filter\(p => p\.enchanted\)\.map\(p => p\.key\)/);
  assert.match(player, /function renderEnchantedInfo\(a\)/);
  assert.match(player, /De Host gaat verder wanneer iedereen elkaar heeft gezien/);
  assert.doesNotMatch(player, /if\(state\.me\.loverName\) tags\.push/);
  assert.match(host, /class="hostEliminationOverview"/);
  assert.match(host, /function deathCauseLabel\(death\)/);
  assert.match(host, /step\.kind === "enchanted_info"/);
  assert.doesNotMatch(host, /Alle betoverde spelers zien elkaar nu\. De Host klikt deze ronde door\./);
  assert.match(viewer, /function centralKeyForState\(s, mayorActive, voteActive, mayorStage\)/);
  assert.match(viewer, /if\(nextCentralSceneKey!==centralSceneKey\)/);
  assert.match(viewer, /if\(s\.winner\)\{[\s\S]*else if\(s\.phase === "hunter" && s\.hunterSequence\)\{/);
  assert.doesNotMatch(viewer, /\$\{p\.enchanted\?' 🎵':''\}/);
  assert.ok(viewer.indexOf('stage?.classList.add("graphShifted")') < viewer.indexOf('stage?.classList.add("revealReady")'));
  assert.match(css, /\.hostScreen \.preassignRole select option\{[\s\S]*color:#fff0cb!important[\s\S]*background:#080c14!important/);
  assert.match(css, /\.hostScreen:not\(\.gameActive\) \.playerRow\{[\s\S]*height:96px!important[\s\S]*max-height:96px!important/);
  assert.match(css, /\.playerIdentityCard\.loverIdentity\{[\s\S]*aspect-ratio:2 \/ 3!important[\s\S]*overflow:visible!important/);
  assert.match(css, /v0\.3\.49 — gerichte regressieherstel[\s\S]*\.infoScreen \.linkedDeathReveal \.loverDeathStack \.deathCard\.loverDeathCard\{[\s\S]*width:clamp\(112px,10vw,150px\)!important/);
  assert.match(css, /\.infoScreen \.linkedDeathReveal \.loverDeathStack \.deathCard\.loverDeathCard h3\{[\s\S]*font-size:clamp\(15px,1\.45vw,22px\)!important/);
});

test("Witch wake-up, previews and Host badges reflect the live potion state", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  const css = read("public/style.css");
  assert.match(server, /playersByRole\("witch"\)\.filter\(p => !p\.witchSaveUsed \|\| !p\.witchPoisonUsed\)/);
  assert.match(server, /targetCard: playerTargetOption\(p, target\)/);
  assert.match(host, /roleTargetDecision\("Levensdrank · redt", value\.saveTarget, "save"\)/);
  assert.match(host, /roleTargetDecision\("Gifdrank · vergiftigt", value\.poisonTarget, "poison"\)/);
  assert.match(server, /kind: "witch-save"[\s\S]*icon: "✚"/);
  assert.match(server, /kind: "witch-poison"[\s\S]*icon: "☠"/);
  assert.match(css, /\.persistentLinkBadge\.witch-save/);
  assert.match(css, /\.persistentLinkBadge\.witch-poison/);
});

test("confirmed lovers trigger a temporary heart while all lover role identities remain private", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(server, /case "lovers_info":[\s\S]*lover\.loverHeartPulse = \{[\s\S]*until: Date\.now\(\) \+ 2400/);
  assert.match(server, /loverHeartPulse: p\.loverHeartPulse && Number\(p\.loverHeartPulse\.until \|\| 0\) > Date\.now\(\)/);
  assert.match(player, /function renderLoverHeartPulse\(\)/);
  assert.match(player, /aria-label", "Je geliefde heeft bevestigd"/);
  assert.match(css, /\.loverHeartPulse\{[\s\S]*animation:loverHeartBeat 2\.35s ease-out both/);
  assert.match(css, /@keyframes loverHeartBeat/);
  assert.doesNotMatch(server, /title: "Jouw geliefde"[\s\S]{0,350}revealActual: true/);
});

test("Host aftermath, mayor bars and live target cards update immediately without changing Info placement", () => {
  const host = read("public/host.js");
  const server = read("server.js");
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(host, /state\.phase === "day" && state\.dayAftermath\?\.active && \(state\.lastDeaths\|\|\[\]\)\.length/);
  assert.doesNotMatch(host, /dayAftermath[\s\S]{0,120}deathReveal\?\.publicRevealed/);
  assert.match(host, /const toneClass = type === "burgemeester" \? " mayorVoteBars" : ""/);
  assert.match(css, /\.hostScreen \.liveVoteBars\.mayorVoteBars \.voteFill\{[\s\S]*#f0c95a/);
  assert.match(server, /people: targetKeys\.map\(targetKey => playerTargetOption\(p, game\.players\[targetKey\]\)\)/);
  assert.match(server, /targetCard: playerTargetOption\(p, target\)/);
  assert.doesNotMatch(player, /if\(state\.me\.enchanted\) tags\.push\("betoverd"\)/);
  assert.match(css, /\.playerScreen \.submittedPeople\.magic \.playerIdentityCard\{[\s\S]*rgba\(179,122,255/);
});

test("Player confirmations clear the gold edge and Seer follows the standard sleep result", () => {
  const player = read("public/player.js");
  const css = read("public/style.css");
  assert.match(css, /body\.playerScreen\.inGame \.confirmBtn,[\s\S]*bottom:max\(18px,env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.match(player, /const sleepMessage = voteAction \? "" : `<p class="sleepStatus">\$\{esc\(a\.sleepMessage \|\| `De \$\{sleepRole\} gaat weer slapen\.`\)\}<\/p>`/);
  assert.match(player, /const sleepRole = a\.actorRoleName \|\| state\.me\.role\?\.name \|\| "rol"/);
  assert.match(player, /if\(a\.kind === "seer" && sub\.result\)/);
  assert.match(player, /cupid:"Te koppelen aan"/);
});

test("Hunter uses an Info-led announcement, choice, shot reveal and summary sequence", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(server, /stage: continueTo\?\.deferWinner \? "awaiting_vote_reveal" : "announcement"/);
  assert.match(server, /game\.hunterSequence\?\.stage === "choosing" \? hunterAction\(p\) : hunterWaitAction\(p\)/);
  assert.match(server, /function applyHunterShot\(/);
  assert.match(server, /holdForHunterReveal: true/);
  assert.match(server, /function revealHunterShot\(token\)/);
  assert.match(server, /function scheduleBotHunterChoice\(sequence\)/);
  assert.match(server, /\}, 5000\);/);
  assert.match(server, /const HUNTER_INTRO_FALLBACK_MS = 10000/);
  assert.match(server, /sequence\.autoAdvanceAt = Date\.now\(\) \+ HUNTER_INTRO_FALLBACK_MS/);
  assert.match(viewer, /function renderHunterCentral\(id, s\)/);
  assert.doesNotMatch(viewer, /acknowledgeReveal\("hunter_intro"/);
  assert.match(viewer, /acknowledgeReveal\("hunter_shot"/);
  assert.match(viewer, /class="deathCauseMark hunterCause"/);
  assert.match(viewer, /const shotDeaths = sequence\.shotDeaths \|\| \[\]/);
  assert.match(viewer, /returnsFromHunter/);
  assert.match(viewer, /runHunterBlackTransition\(s\)/);
  assert.match(viewer, /hero\?\.classList\.add\("hunterImpact"\)/);
  assert.match(host, /const deaths = sequence\.shotDeaths \|\| \[\]/);
  assert.match(player, /\["hunter_shot","hunter_wait"\]\.includes\(a\.kind\)/);
  assert.match(css, /\.hunterCrosshair[\s\S]*animation:hunterAim/);
  assert.match(viewer, /classList\.add\("hunterTransitionBlack"\)/);
  assert.match(css, /\.infoScreen\.hunterTransitionBlack::after/);
  assert.match(css, /\.hunterBullseyeIcon\{/);
  assert.match(css, /\.infoScreen \.viewerHero\.hunter \.bigStatus\{/);
  assert.match(css, /@keyframes hunterImpactFlash/);
});

test("v0.3.51 presents live wolf cards, private debug access and corrected Hunter and enchanted styling", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  const hostHtml = read("public/host.html");
  const player = read("public/player.js");
  const playerHtml = read("public/index.html");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  const finalLayer = css.slice(css.indexOf("v0.3.51 — live wolvenkaarten"));

  assert.match(server, /targetCard: targetKey && game\.players\[targetKey\][\s\S]*playerTargetOption\(wolf, game\.players\[targetKey\]\)/);
  assert.match(server, /consensusTargetCard: visibleConsensusTargetKey/);
  assert.match(host, /class="wolfHostChoiceCard/);
  assert.match(host, /roleTargetDecision\("Kiest", target/);
  assert.match(host, /class="wolfLockedVictim"/);
  assert.match(host, /Daadwerkelijk slachtoffer/);

  assert.doesNotMatch(playerHtml, /playerDebugHotspot|joinDebugHold/);
  assert.doesNotMatch(player, /playerDebugHotspot|setupJoinDebugHold|__debugHotspotHold/);
  assert.match(player, /if\(e\.repeat\) return/);
  assert.match(player, /debugDPresses\.length >= 5/);
  assert.match(player, /now - t < 1200/);

  assert.match(hostHtml, /id="startBtn" class="btn good"/);
  assert.match(finalLayer, /\.hostScreen #startBtn\.btn\.good/);
  assert.match(player, /renderResultPeople\("", people, "magic enchantedGroup"\)/);
  assert.doesNotMatch(player, /De andere betoverden/);
  assert.doesNotMatch(server, /Dit zijn de andere betoverde spelers\./);
  assert.match(finalLayer, /\.playerScreen \.submittedPeople\.magic[\s\S]*box-shadow:none!important/);
  assert.match(finalLayer, /\.playerScreen \.submittedPeople\.magic \.playerIdentityCard[\s\S]*outline:2px solid rgba\(181,150,255,.66\)/);

  assert.match(viewer, /sub="De Jager lost nog één laatste schot\."/);
  assert.doesNotMatch(viewer, /roleMark|hunterRoleMark|hunterBullseyeImpact|hunterBullseyeSummary/);
  assert.ok(viewer.indexOf('hunterBullseye("hunterBullseyeSeal")') < viewer.indexOf('deathCardHtml(hunterDeath,"hunterPrimaryCard")'));
  assert.match(host, /const hunterCard = sequence\.hunterDeath/);
  assert.match(host, /class="hunterHostShotPair"/);
  assert.doesNotMatch(host, /hunterRoleMark|hostHunterRoleMark/);
  assert.match(finalLayer, /\.hostHunterDeathCard\.hunterShotVictim/);
});

test("v0.3.52 confirms wolf consensus, remembers Host roles and keeps touch choices smooth and scrollable", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  const player = read("public/player.js");
  const css = read("public/style.css");
  const finalLayer = css.slice(css.indexOf("v0.3.52 — monitorcompositie"));

  assert.match(server, /if \(wolfLocked && lockedTarget\) \{[\s\S]*submitted: true,[\s\S]*targetCard: playerTargetOption\(p, lockedTarget\)[\s\S]*sleepMessage: "De Weerwolven gaan weer slapen\."/);
  assert.match(player, /a\.sleepMessage \|\| `De \$\{sleepRole\} gaat weer slapen\.`/);
  assert.match(player, /wolves:"Te doden"/);

  assert.match(server, /p\.assignedRoleId = preassigned\.get\(p\.key\) \|\| null/);
  assert.match(server, /steps\.push\(makeStep\("lovers_info", "Geliefden zien elkaar", \[\]/);
  assert.match(server, /\["wolves", "lovers_info", "enchanted_info", "enchantment_broken"\]\.includes\(step\.kind\)/);
  assert.match(server, /existing\.actorKeys = lovers/);

  assert.match(server, /const BOT_PERSONAS = \["voorzichtig", "avontuurlijk", "onvoorspelbaar"\]/);
  assert.match(server, /case "infectious_wolf":[\s\S]*game\.night\.infectedKey = victim\.key/);
  assert.match(server, /case "witch":[\s\S]*game\.night\.witchSaveKey = saveKey[\s\S]*game\.night\.witchPoisonKey = poisonTarget\.key/);
  assert.match(server, /case "seer":[\s\S]*const unseen = targetOptions/);
  assert.match(server, /case "fox":[\s\S]*const checkedKeys = new Set/);

  assert.match(host, /function clearForceAdvance\(\)[\s\S]*previousButton\.disabled = false/);
  assert.ok(
    host.indexOf('if(forceAdvanceContext && forceAdvanceContext !== forceContext) clearForceAdvance();')
      < host.indexOf('$("nextStepBtn").disabled=forceAdvanceButtonId === "nextStepBtn" && !!forceAdvanceTimer;'),
    "Jager force context must clear before the button disabled state is applied",
  );

  assert.match(player, /function commitActionHtml\(box, markup\)/);
  assert.match(player, /box\.querySelectorAll\("img"\)/);
  assert.match(player, /nextImage\.replaceWith\(currentImage\)/);
  assert.match(player, /box\.replaceChildren\(template\.content\)/);
  assert.doesNotMatch(player, /box\.innerHTML\s*=/);

  assert.ok(finalLayer.length > 0, "v0.3.52 responsive layer is missing");
  assert.match(finalLayer, /body\.playerScreen\.inGame\{[\s\S]*height:auto!important[\s\S]*overflow-y:auto!important/);
  assert.match(finalLayer, /\.playerCenter\.active\{[\s\S]*overflow:visible!important/);
  assert.match(finalLayer, /height:clamp\(102px,var\(--choice-mobile-card-vh,17svh\),184px\)!important/);
  assert.match(finalLayer, /#submitWitch\{[\s\S]*position:sticky!important/);
  assert.match(finalLayer, /\.infoScreen \.infoContent,[\s\S]*text-align:center!important/);
});

test("v0.3.53 keeps combined Witch choices, resumes mobile sessions and finishes the Piper presentation", () => {
  const server = read("server.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  const finalLayer = css.slice(css.indexOf("v0.3.53 final cascade"));

  assert.match(player, /let selectedWitchSave = null;/);
  assert.match(player, /let selectedWitchPoison = null;/);
  assert.match(player, /const saveKey=selectedWitchSave;[\s\S]*const poisonKey=selectedWitchPoison;[\s\S]*kind:"witch", saveKey:[\s\S]*poisonKey:/);
  assert.match(player, /if\(input\.name === "saveKey"\) selectedWitchSave = input\.value \|\| null;/);
  assert.match(player, /if\(input\.name === "poisonKey"\) selectedWitchPoison = input\.value \|\| null;/);
  assert.match(player, /const selectedSave=pending\.some[\s\S]*: null\);/);
  assert.match(player, /const selectedPoison=all\.some[\s\S]*: null\);/);
  assert.match(css, /\.witchChoiceTile\.none\{[\s\S]*border-color:rgba\(166,177,197,.34\)!important[\s\S]*box-shadow:none!important/);
  assert.match(css, /\.witchChoiceTile\.save\.selected,[\s\S]*\.witchChoiceTile\.poison\.selected\{[\s\S]*outline:3px solid currentColor!important/);

  assert.match(player, /function requestForegroundSync\(reason="resume"\)/);
  assert.match(player, /socket\.emit\("player_sync", \{ playerKey:key, lobbyId:lastLobbyId \|\| null, reason \}\)/);
  assert.match(player, /document\.addEventListener\("visibilitychange"/);
  assert.match(player, /window\.addEventListener\("pageshow"/);
  assert.match(player, /window\.addEventListener\("focus"/);
  assert.match(server, /socket\.on\("player_sync", \(\{ playerKey \} = \{\}\) =>/);
  assert.match(server, /if \(p && p\.socketId === socket\.id\)/);

  assert.match(player, /Je bent betoverd!/);
  assert.match(player, /De Betoverde/);
  assert.ok(finalLayer.length > 0, "v0.3.53 final cascade is missing");
  assert.match(finalLayer, /\.enchantedInfo,[\s\S]*background:transparent!important[\s\S]*box-shadow:none!important/);
  assert.match(finalLayer, /\.playerIdentityCard\{[\s\S]*outline:2px solid rgba\(181,150,255,.62\)!important/);

  assert.doesNotMatch(viewer, /De Host gaat verder, anders start de keuze na tien seconden\./);
  assert.match(viewer, /s\.winner\?\.team === "piper"/);
  assert.match(viewer, /players\.filter\(p=>p\.enchanted && p\.key !== piper\?\.key\)/);
  assert.match(viewer, /winnerPlayerCard\(piper,false,"piperLeadCard"\)/);
  assert.match(viewer, /winnerPlayerCard\(p,false,"piperEnchantedCard"(?:,[^)]+)?\)/);
  assert.match(viewer, /winnerPlayerCard[\s\S]*p\.alive\?'alive':'dead'/);
  assert.match(viewer, /winnerTransitionPiper/);
  assert.match(css, /\.infoScreen\.winnerTransitionPiper::after/);
  assert.match(css, /\.infoScreen \.piperEnchantedCard\.dead\{[\s\S]*grayscale\(1\)/);
});

test("social phases stay blocked until the Hunter sequence is completely finished", () => {
  const server = read("server.js");
  const host = read("public/host.js");
  assert.match(server, /function openDayVoteAuto\(reason = ""\) \{[\s\S]*game\.phase === "hunter" \|\| game\.hunterSequence/);
  assert.match(server, /function startNextNight\(\) \{[\s\S]*if \(game\.phase === "hunter" \|\| game\.hunterSequence\) return/);
  assert.match(server, /socket\.on\("host_open_mayor"[\s\S]*game\.phase === "hunter" \|\| game\.hunterSequence/);
  assert.match(server, /socket\.on\("host_open_day_vote"[\s\S]*game\.phase === "hunter" \|\| game\.hunterSequence/);
  assert.match(server, /if \(sequence\.stage === "choosing"\)[\s\S]*randomChoice\(alivePlayers\(\)\.filter\(p => p\.key !== sequence\.hunterKey\)\)[\s\S]*applyHunterShot\(target\.key, \{ forced: true \}\)/);
  assert.match(host, /const hunterFlowActive=inHunter \|\| !!state\.hunterSequence/);
  assert.match(host, /showButton\("voteBtn", !hunterFlowActive/);
  assert.match(host, /showButton\("mayorBtn", !hunterFlowActive/);
  assert.match(host, /showButton\("nextNightBtn", !hunterFlowActive/);
});

test("live rendering is frame-coalesced and scrolling avoids the heaviest repaint effects", () => {
  const host = read("public/host.js");
  const player = read("public/player.js");
  const viewer = read("public/viewer.js");
  const css = read("public/style.css");
  assert.match(host, /function scheduleRender\(\)[\s\S]*requestAnimationFrame/);
  assert.match(player, /function schedulePlayerRender\(\)[\s\S]*requestAnimationFrame/);
  assert.match(viewer, /function scheduleViewerRender\(s\)[\s\S]*requestAnimationFrame/);
  assert.match(host, /if\(nextMarkup === playersMarkup\) return/);
  assert.match(host, /if\(nextMarkup === rolesMarkup\) return/);
  assert.match(viewer, /if\(nextPlayersKey!==viewerPlayersKey\)/);
  assert.match(css, /Vermijd dure volledige hertekeningen[\s\S]*backdrop-filter:none!important/);
  assert.match(css, /\.hostScreen \.roleTile\{contain:layout paint style;\}/);
});

test("Host current step is simplified and receives live unconfirmed role choices", () => {
  const host = read("public/host.js");
  const player = read("public/player.js");
  const server = read("server.js");
  const renderStep = host.slice(host.indexOf("function renderStep"), host.indexOf("function renderHostMayorStep"));
  assert.match(renderStep, /renderHostRoleChoices\(s\)/);
  assert.doesNotMatch(renderStep, /formatNightPreview|class="progress"|✅|⏳/);
  assert.match(host, /roleTargetDecision\("Levensdrank · redt", value\.saveTarget, "save"\)/);
  assert.match(host, /roleTargetDecision\("Gifdrank · vergiftigt", value\.poisonTarget, "poison"\)/);
  assert.match(host, /value\.targetName \? roleTargetDecision\("Bekijkt", value\)/);
  assert.match(host, /people\[0\] \? roleTargetDecision\("Geliefde 1"/);
  assert.match(host, /people\[1\] \? roleTargetDecision\("Geliefde 2"/);
  assert.match(server, /previews: step\.previews \|\| \{\}/);
  assert.match(server, /step\.previews = step\.previews \|\| \{\}/);
  assert.match(server, /const preview = !submitted \? step\.previews\?\.\[p\.key\] \|\| null : null/);
  assert.match(server, /if \(!payload\.targetKey\) \{[\s\S]*delete step\.previews\[p\.key\]/);
  assert.match(server, /if \(step\.kind === "witch"\)[\s\S]*saveName[\s\S]*poisonName/);
  assert.match(player, /socket\.emit\("player_preview", \{ kind:a\.kind, targetKeys:\[\.\.\.selectedTargets\] \}\)/);
  assert.match(player, /kind:"witch"[\s\S]*saveKey:[\s\S]*poisonKey:/);
  assert.match(player, /selectedWitchSave = preview\?\.saveKey \|\| null/);
  assert.match(player, /selectedWitchPoison = preview\?\.poisonKey \|\| null/);
  assert.match(player, /witchChoice\("save",o\.key,o\.name,selectedSave/);
  assert.match(player, /witchChoice\("poison",o\.key/);
  assert.match(player, /selectedSingle = selectedSingle === key \? null : key/);
});

test("all supplied role-card PNGs exist and are wired to the three views", () => {
  const supplied = [
    "burger_1.png", "burger_2.png", "burger_3.png", "burger_4.png",
    "cupido.png", "fluitspeler.png", "grote_boze_wolf.png", "Heks.png",
    "jager.png", "weerwolf.png", "Ziener.png"
  ];
  for (const name of supplied) {
    const file = `public/assets/cards/${name}`;
    const bytes = fs.readFileSync(path.join(root, file));
    assert.ok(bytes.length > 1_000_000, `${file} is unexpectedly small`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const player = read("public/player.js");
  assert.match(player, /seer:\s*\[\{ src: "\/assets\/cards\/Ziener\.png"/);
  assert.match(player, /witch:\s*\[\{ src: "\/assets\/cards\/Heks\.png"/);
  assert.match(player, /cupid:\s*\[\{ src: "\/assets\/cards\/cupido\.png"/);
  assert.match(player, /hunter:\s*\[\{ src: "\/assets\/cards\/jager\.png"/);
  assert.match(player, /big_bad_wolf:\s*\[\{ src: "\/assets\/cards\/grote_boze_wolf\.png"/);
  const viewer = read("public/viewer.js");
  assert.match(viewer, /"Ziener": \["\/assets\/cards\/Ziener\.png"\]/);
  assert.match(viewer, /"Heks": \["\/assets\/cards\/Heks\.png"\]/);
  assert.match(viewer, /"Jager": \["\/assets\/cards\/jager\.png"\]/);
});

test("winner layouts support fifty players and center the title block on every viewport", () => {
  const server = read("server.js");
  const viewer = read("public/viewer.js");
  const html = read("public/viewer.html");
  const css = read("public/style.css");
  assert.match(server, /villager:[\s\S]*max: 50/);
  assert.match(html, /<header class="infoHeadline">/);
  assert.match(viewer, /const maxColumns = viewportWidth <= 600 \? 4/);
  assert.match(css, /\.viewerHero\.ended \.infoHeadline\{[\s\S]*min-height:clamp\(135px,24svh,290px\)/);
  assert.match(css, /\.winnerMainCards\{[\s\S]*repeat\(var\(--winner-cols,1\)/);
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

test("clean server exposes Host, Speler, Infoscherm and paginatester routes", async (t) => {
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
  for (const route of ["/host", "/player", "/info", "/screen-test.html", "/style.css", "/fog-effect.css", "/fog-effect.js", "/host.js", "/player.js", "/viewer.js", "/screen-test.js", "/assets/cards/Heks.png", "/assets/cards/Ziener.png"]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
  }
  const legacy = await fetch(`${base}/viewer`, { redirect: "manual" });
  assert.ok([301, 302, 307, 308].includes(legacy.status));
  assert.equal(legacy.headers.get("location"), "/info");
});
