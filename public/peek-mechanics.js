(() => {
  "use strict";

  const controllers = new Set();
  let warningNode = null;
  let warningToken = null;
  let warningTimer = null;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function circleStyle(index, count) {
    const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
    const x = 50 + Math.cos(angle) * 37;
    const y = 50 + Math.sin(angle) * 37;
    return `--peek-x:${x.toFixed(2)}%;--peek-y:${y.toFixed(2)}%`;
  }

  function resourceMarkup(peek) {
    if (peek.mode === "eyelids") {
      return `<div class="peekMoonMeter" aria-label="Resterende spiektijd"><span></span><strong data-peek-time></strong></div>`;
    }
    if (peek.mode === "fog") {
      return `<div class="peekWipePips" aria-label="Resterende veegbewegingen">${Array.from({ length: 4 }, (_, index) => `<i data-wipe-pip="${index}"></i>`).join("")}</div>`;
    }
    return `<div class="peekReflectionMeter"><span>Weerkaatsing</span><i></i></div>`;
  }

  function playerCircleMarkup(peek) {
    const players = peek.players || [];
    return `<div class="peekPlayerCircle">${players.map((player, index) => `
      <div class="peekCirclePlayer" data-peek-player="${esc(player.key)}" style="${circleStyle(index, players.length)}">
        <span class="peekSleeper"><i></i></span>
        <span class="peekWolfShape"><b></b></span>
        <strong>${esc(player.name)}</strong>
      </div>`).join("")}</div>`;
  }

  function experienceMarkup(peek) {
    if (peek.status === "instruction") {
      return `<section class="peekExperience peekInstruction mode-${esc(peek.mode)}" data-peek-experience>
        <div class="peekInstructionSigil" aria-hidden="true">${peek.mode === "eyelids" ? "◉" : peek.mode === "mirror" ? "◇" : "≋"}</div>
        <p class="peekEyebrow">Vannacht</p>
        <h1>${esc(peek.modeLabel)}</h1>
        <p>${esc(peek.instruction)}</p>
        <button class="btn gold peekUnderstandBtn" type="button" data-peek-understand>Begrepen</button>
      </section>`;
    }
    const modeLayer = peek.mode === "eyelids"
      ? `<div class="peekEyelid peekEyelidTop"></div><div class="peekEyelid peekEyelidBottom"></div>
         <div class="peekWolfTurn" data-wolf-turn><span></span><strong>Een wolf kijkt om…</strong></div>
         <button class="peekHoldButton" type="button" data-peek-hold>Houd ingedrukt om te spieken</button>`
      : peek.mode === "mirror"
        ? `<div class="peekMirrorShade"></div><div class="peekShard" data-peek-shard aria-hidden="true"><i></i></div>
           <p class="peekGestureHint">Sleep rustig · houd even stil boven één speler</p>`
        : `<canvas class="peekFogCanvas" data-peek-fog></canvas>
           <div class="peekFogGrain"></div><p class="peekGestureHint">Maak één korte, precieze veeg bij een speler</p>`;
    return `<section class="peekExperience mode-${esc(peek.mode)}" data-peek-experience>
      <header class="peekTopline">
        <div><p class="peekEyebrow">Spiekende Meisje · optie ${esc(peek.modeNumber)}</p><h1>${esc(peek.modeLabel)}</h1></div>
        ${resourceMarkup(peek)}
      </header>
      <div class="peekRisk" aria-label="Risico"><span>Voorzichtig</span><i><b data-peek-risk-bar></b></i><strong data-peek-risk-label></strong></div>
      <div class="peekScene" data-peek-scene>
        ${playerCircleMarkup(peek)}
        ${modeLayer}
      </div>
      <p class="peekCaughtHint" data-peek-caught></p>
    </section>`;
  }

  class PeekController {
    constructor(root, options) {
      this.root = root;
      this.options = options || {};
      this.peek = null;
      this.signature = "";
      this.cleanups = [];
      this.timers = new Set();
      this.frames = new Set();
      this.pointerActive = false;
      this.localHolding = false;
      this.localHoldAt = null;
      this.lastMirrorEmitAt = 0;
      this.mirrorPosition = { x: 0.5, y: 0.5 };
      this.fogGesture = null;
      this.destroyed = false;
      controllers.add(this);
    }

    emit(kind, detail = {}) {
      if (!this.peek || this.destroyed) return;
      this.options.emit?.({ sessionId: this.peek.id, kind, ...detail });
    }

    listen(target, type, handler, options) {
      target?.addEventListener(type, handler, options);
      this.cleanups.push(() => target?.removeEventListener(type, handler, options));
    }

    timeout(handler, delay) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (!this.destroyed) handler();
      }, delay);
      this.timers.add(timer);
      return timer;
    }

    frame(handler) {
      const frame = requestAnimationFrame(timestamp => {
        this.frames.delete(frame);
        if (!this.destroyed) handler(timestamp);
      });
      this.frames.add(frame);
      return frame;
    }

    clearBindings() {
      this.cleanups.splice(0).forEach(cleanup => cleanup());
      this.timers.forEach(timer => clearTimeout(timer));
      this.frames.forEach(frame => cancelAnimationFrame(frame));
      this.timers.clear();
      this.frames.clear();
      this.pointerActive = false;
      this.localHolding = false;
      this.localHoldAt = null;
      this.fogGesture = null;
    }

    update(peek) {
      if (!peek || this.destroyed) return;
      const signature = `${peek.id}|${peek.mode}|${peek.status}`;
      this.peek = peek;
      if (signature !== this.signature) {
        this.clearBindings();
        this.signature = signature;
        this.root.innerHTML = experienceMarkup(peek);
        this.bind();
      }
      this.updateDynamic();
    }

    bind() {
      const understand = this.root.querySelector("[data-peek-understand]");
      if (understand) this.listen(understand, "click", () => this.options.acknowledge?.(this.peek.id));
      if (this.peek.status !== "active") return;
      if (this.peek.mode === "eyelids") this.bindEyelids();
      if (this.peek.mode === "mirror") this.bindMirror();
      if (this.peek.mode === "fog") this.bindFog();
      this.listen(window, "blur", () => this.cancelPointer());
      this.listen(document, "visibilitychange", () => {
        if (document.visibilityState !== "visible") this.cancelPointer();
      });
    }

    bindEyelids() {
      const button = this.root.querySelector("[data-peek-hold]");
      if (!button) return;
      const start = event => {
        if (Number(this.peek.remainingPeekMs || 0) <= 0) return;
        event.preventDefault();
        this.pointerActive = true;
        this.localHolding = true;
        this.localHoldAt = performance.now();
        button.setPointerCapture?.(event.pointerId);
        this.emit("hold_start");
        this.animateHold();
      };
      const stop = event => {
        if (!this.pointerActive && !this.localHolding) return;
        event?.preventDefault?.();
        this.pointerActive = false;
        this.localHolding = false;
        this.localHoldAt = null;
        this.emit("hold_stop");
        this.updateDynamic();
      };
      this.listen(button, "pointerdown", start);
      this.listen(button, "pointerup", stop);
      this.listen(button, "pointercancel", stop);
      this.listen(button, "lostpointercapture", stop);
      this.listen(button, "pointerleave", event => {
        if (event.buttons === 0 || event.pointerType === "mouse") stop(event);
      });
    }

    animateHold() {
      if (!this.localHolding || this.destroyed) return;
      this.updateDynamic();
      this.frame(() => this.animateHold());
    }

    bindMirror() {
      const scene = this.root.querySelector("[data-peek-scene]");
      if (!scene) return;
      const move = event => {
        if (!this.pointerActive) return;
        event.preventDefault();
        const rect = scene.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.04, 0.96);
        const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height) - 0.11, 0.05, 0.94);
        this.mirrorPosition = { x, y };
        const now = performance.now();
        if (now - this.lastMirrorEmitAt >= 65) {
          this.lastMirrorEmitAt = now;
          this.emit("mirror_move", { x, y });
        }
        this.updateDynamic();
      };
      const start = event => {
        this.pointerActive = true;
        scene.setPointerCapture?.(event.pointerId);
        move(event);
      };
      const stop = () => { this.pointerActive = false; };
      this.listen(scene, "pointerdown", start);
      this.listen(scene, "pointermove", move);
      this.listen(scene, "pointerup", stop);
      this.listen(scene, "pointercancel", stop);
      this.listen(scene, "lostpointercapture", stop);
    }

    setupFogCanvas() {
      const canvas = this.root.querySelector("[data-peek-fog]");
      const scene = this.root.querySelector("[data-peek-scene]");
      if (!canvas || !scene) return null;
      const rect = scene.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalCompositeOperation = "source-over";
      const gradient = context.createRadialGradient(rect.width * 0.48, rect.height * 0.48, 20, rect.width * 0.5, rect.height * 0.5, rect.width * 0.72);
      gradient.addColorStop(0, "rgba(69,98,118,.9)");
      gradient.addColorStop(0.55, "rgba(25,43,57,.96)");
      gradient.addColorStop(1, "rgba(3,11,20,.99)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, rect.width, rect.height);
      for (let index = 0; index < 28; index += 1) {
        context.fillStyle = `rgba(164,199,219,${0.018 + (index % 5) * 0.008})`;
        context.beginPath();
        context.ellipse(
          (index * 97) % Math.max(1, rect.width),
          (index * 53) % Math.max(1, rect.height),
          70 + (index % 4) * 28,
          22 + (index % 3) * 12,
          (index % 7) * 0.22,
          0,
          Math.PI * 2
        );
        context.fill();
      }
      return { canvas, context, scene, rect };
    }

    bindFog() {
      let fog = this.setupFogCanvas();
      if (!fog) return;
      const point = event => ({
        x: clamp((event.clientX - fog.rect.left) / Math.max(1, fog.rect.width), 0, 1),
        y: clamp((event.clientY - fog.rect.top) / Math.max(1, fog.rect.height), 0, 1),
      });
      const revealAt = position => {
        fog.context.save();
        fog.context.globalCompositeOperation = "destination-out";
        const radius = Math.max(26, Math.min(fog.rect.width, fog.rect.height) * 0.095);
        const gradient = fog.context.createRadialGradient(
          position.x * fog.rect.width,
          position.y * fog.rect.height,
          2,
          position.x * fog.rect.width,
          position.y * fog.rect.height,
          radius
        );
        gradient.addColorStop(0, "rgba(0,0,0,.92)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        fog.context.fillStyle = gradient;
        fog.context.beginPath();
        fog.context.arc(position.x * fog.rect.width, position.y * fog.rect.height, radius, 0, Math.PI * 2);
        fog.context.fill();
        fog.context.restore();
      };
      const start = event => {
        if (Number(this.peek.fogActionsRemaining || 0) <= 0) return;
        event.preventDefault();
        this.pointerActive = true;
        fog.scene.setPointerCapture?.(event.pointerId);
        const startPoint = point(event);
        this.fogGesture = { start: startPoint, last: startPoint, startedAt: performance.now() };
        revealAt(startPoint);
      };
      const move = event => {
        if (!this.pointerActive || !this.fogGesture) return;
        event.preventDefault();
        const next = point(event);
        revealAt(next);
        this.fogGesture.last = next;
      };
      const stop = event => {
        if (!this.pointerActive || !this.fogGesture) return;
        event?.preventDefault?.();
        const gesture = this.fogGesture;
        this.pointerActive = false;
        this.fogGesture = null;
        this.emit("fog_swipe", {
          startX: gesture.start.x,
          startY: gesture.start.y,
          x: gesture.last.x,
          y: gesture.last.y,
          durationMs: Math.round(performance.now() - gesture.startedAt),
        });
        fog.canvas.classList.add("returning");
        this.timeout(() => {
          fog = this.setupFogCanvas() || fog;
          fog.canvas.classList.remove("returning");
        }, 1450);
      };
      this.listen(fog.scene, "pointerdown", start);
      this.listen(fog.scene, "pointermove", move);
      this.listen(fog.scene, "pointerup", stop);
      this.listen(fog.scene, "pointercancel", stop);
      this.listen(fog.scene, "lostpointercapture", stop);
      this.listen(window, "resize", () => { fog = this.setupFogCanvas() || fog; });
    }

    cancelPointer() {
      if (this.peek?.mode === "eyelids" && (this.pointerActive || this.localHolding)) this.emit("hold_stop");
      this.pointerActive = false;
      this.localHolding = false;
      this.localHoldAt = null;
      this.fogGesture = null;
      this.updateDynamic();
    }

    updateDynamic() {
      const peek = this.peek;
      if (!peek || peek.status !== "active") return;
      const experience = this.root.querySelector("[data-peek-experience]");
      if (!experience) return;
      const risk = clamp(peek.risk, 0, 100);
      experience.style.setProperty("--peek-risk", `${risk}%`);
      experience.classList.toggle("risk-mid", risk >= 55);
      experience.classList.toggle("risk-high", risk >= 78);
      experience.classList.toggle("wolf-looking", !!peek.wolfLookActive);
      experience.classList.toggle("peek-caught", peek.detectionLevel !== "none");
      const riskBar = this.root.querySelector("[data-peek-risk-bar]");
      if (riskBar) riskBar.style.width = `${risk}%`;
      const riskLabel = this.root.querySelector("[data-peek-risk-label]");
      if (riskLabel) riskLabel.textContent = risk >= 88 ? "Bijna betrapt" : risk >= 58 ? "Risico loopt op" : "Voorzichtig";
      const time = this.root.querySelector("[data-peek-time]");
      if (time) time.textContent = `${Math.max(0, Number(peek.remainingPeekMs || 0) / 1000).toFixed(1)}s`;
      this.root.querySelectorAll("[data-wipe-pip]").forEach(pip => {
        pip.classList.toggle("spent", Number(pip.dataset.wipePip) >= Number(peek.fogActionsRemaining || 0));
      });
      const caught = this.root.querySelector("[data-peek-caught]");
      if (caught) caught.textContent = peek.detectionLevel !== "none" ? "Een wolf keek jouw kant op… Hebben ze je gezien?" : "";

      let open = 0;
      if (peek.mode === "eyelids" && (this.localHolding || peek.holding)) {
        const localElapsed = this.localHoldAt ? performance.now() - this.localHoldAt : 0;
        const serverElapsed = peek.holdStartedAt ? Date.now() - peek.holdStartedAt : 0;
        open = clamp(Math.max(localElapsed, serverElapsed) / 2850, 0.08, 1);
      }
      experience.style.setProperty("--peek-open", String(open));
      experience.style.setProperty("--peek-open-top", `${(-open * 82).toFixed(2)}%`);
      experience.style.setProperty("--peek-open-bottom", `${(open * 82).toFixed(2)}%`);
      const hold = this.root.querySelector("[data-peek-hold]");
      if (hold) {
        hold.classList.toggle("holding", this.localHolding || peek.holding);
        hold.disabled = Number(peek.remainingPeekMs || 0) <= 0;
        hold.textContent = hold.disabled ? "Je spiektijd is op" : (this.localHolding || peek.holding ? "Laat los om je ogen te sluiten" : "Houd ingedrukt om te spieken");
      }

      const revealByKey = new Map();
      if (peek.mode === "mirror" && peek.mirrorReveal) revealByKey.set(peek.mirrorReveal.key, peek.mirrorReveal);
      for (const reveal of peek.fogReveals || []) revealByKey.set(reveal.key, reveal);
      for (const player of peek.players || []) {
        const node = [...this.root.querySelectorAll("[data-peek-player]")]
          .find(candidate => candidate.dataset.peekPlayer === String(player.key));
        if (!node) continue;
        const reveal = revealByKey.get(player.key);
        const visible = peek.mode === "eyelids" ? open > 0.14 : !!reveal;
        const awakeWolf = peek.mode === "eyelids" ? !!player.awakeWolf : !!reveal?.awakeWolf;
        node.classList.toggle("revealed", visible);
        node.classList.toggle("awakeWolf", visible && awakeWolf);
      }
      const shard = this.root.querySelector("[data-peek-shard]");
      if (shard) {
        shard.style.left = `${this.mirrorPosition.x * 100}%`;
        shard.style.top = `${this.mirrorPosition.y * 100}%`;
      }
    }

    diagnostics() {
      return {
        listeners: this.cleanups.length,
        timers: this.timers.size,
        animationFrames: this.frames.size,
        pointerActive: this.pointerActive,
        scrollLocked: document.documentElement.classList.contains("peekScrollLock") || document.body.classList.contains("peekScrollLock"),
      };
    }

    destroy() {
      if (this.destroyed) return;
      this.cancelPointer();
      this.clearBindings();
      this.destroyed = true;
      controllers.delete(this);
      if (this.root.__wakkerdamPeekController === this) delete this.root.__wakkerdamPeekController;
      this.root.replaceChildren();
    }
  }

  function mount(root, options = {}) {
    if (!root) return null;
    let controller = root.__wakkerdamPeekController;
    if (!controller || controller.destroyed) {
      controller = new PeekController(root, options);
      root.__wakkerdamPeekController = controller;
    } else {
      controller.options = { ...controller.options, ...options };
    }
    controller.update(options.peek);
    return controller;
  }

  function destroy(root) {
    root?.__wakkerdamPeekController?.destroy();
  }

  function warningMarkup(warning) {
    const icon = warning.mode === "eyelids" ? "◉" : warning.mode === "mirror" ? "◇" : "≋";
    const level = warning.level === "major" ? "Een vage gedaante bleef heel even zichtbaar." : "Alleen de richting was kort zichtbaar.";
    return `<aside class="peekWolfWarning mode-${esc(warning.mode)} level-${esc(warning.level)}" role="status">
      <div class="peekWarningFlash"></div>
      <div class="peekWarningSilhouette silhouette-${esc(warning.hint?.silhouette)} color-${esc(warning.hint?.colorHint)}"><i></i></div>
      <span class="peekWarningIcon">${icon}</span>
      <h2>${esc(warning.text)}</h2>
      <p>Richting: ${esc(warning.hint?.direction || "onduidelijk")}. ${esc(level)}</p>
    </aside>`;
  }

  function showWolfWarning(warning, { acknowledge } = {}) {
    if (!warning) {
      clearWolfWarning();
      return;
    }
    if (warning.token === warningToken && warningNode?.isConnected) return;
    clearWolfWarning();
    warningToken = warning.token;
    const template = document.createElement("template");
    template.innerHTML = warningMarkup(warning);
    warningNode = template.content.firstElementChild;
    document.body.append(warningNode);
    requestAnimationFrame(() => warningNode?.classList.add("visible"));
    acknowledge?.(warning.token);
    warningTimer = setTimeout(() => clearWolfWarning(), 3900);
  }

  function clearWolfWarning() {
    clearTimeout(warningTimer);
    warningTimer = null;
    if (warningNode) {
      const node = warningNode;
      node.classList.remove("visible");
      setTimeout(() => node.remove(), 260);
    }
    warningNode = null;
    warningToken = null;
  }

  function diagnostics() {
    const details = [...controllers].map(controller => controller.diagnostics());
    return {
      controllers: details.length,
      listeners: details.reduce((sum, item) => sum + item.listeners, 0),
      timers: details.reduce((sum, item) => sum + item.timers, 0) + (warningTimer ? 1 : 0),
      animationFrames: details.reduce((sum, item) => sum + item.animationFrames, 0),
      activePointers: details.filter(item => item.pointerActive).length,
      warningOverlay: !!warningNode?.isConnected,
      scrollLocked: details.some(item => item.scrollLocked),
    };
  }

  function cleanupAll() {
    [...controllers].forEach(controller => controller.destroy());
    clearWolfWarning();
    return diagnostics();
  }

  function hydrateDebugState(peek) {
    const rules = window.WakkerdamPeekRules;
    const state = rules.createPeekState();
    rules.startPeekSession(state, {
      girlKey: "test_1",
      wolfKeys: peek.debugWolfKeys || [],
      nightNumber: 1,
      forcedMode: peek.mode,
    });
    const session = state.session;
    session.id = peek.id;
    session.mode = peek.mode;
    session.status = peek.status;
    session.activeAt = Date.now();
    session.remainingPeekMs = Number(peek.remainingPeekMs ?? 4000);
    session.fogActionsRemaining = Number(peek.fogActionsRemaining ?? 4);
    session.risk = Number(peek.risk || 0);
    session.detectionLevel = peek.detectionLevel || "none";
    session.wolfLookAt = peek.wolfLookActive ? Date.now() - 50 : Date.now() + 900000;
    session.wolfLookUntil = peek.wolfLookActive ? Date.now() + 900000 : Date.now() - 1;
    return state;
  }

  function debugReduce(peek, payload) {
    const rules = window.WakkerdamPeekRules;
    if (!rules || !peek) return peek;
    const state = peek.__debugServerState || hydrateDebugState(peek);
    peek.__debugServerState = state;
    if (payload.kind === "ack_instruction") rules.acknowledgeInstruction(state);
    else {
      rules.applyPeekInteraction(state, payload, {
        players: peek.players || [],
        isWolfKey: key => (peek.debugWolfKeys || []).includes(key),
      });
    }
    const next = rules.girlView(state, {
      players: peek.players || [],
      isWolfKey: key => (peek.debugWolfKeys || []).includes(key),
    });
    next.debugWolfKeys = peek.debugWolfKeys || [];
    next.__debugServerState = state;
    return next;
  }

  window.WakkerdamPeekUI = {
    mount,
    destroy,
    showWolfWarning,
    clearWolfWarning,
    diagnostics,
    cleanupAll,
    debugReduce,
  };
})();
