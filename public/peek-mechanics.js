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
  const approvedFogSettings = Object.freeze({
    density: 600,
    motion: 110,
    turbulence: 600,
    pushHeight: 53,
    handMotion: 100,
    handSize: 76,
    pushForce: 45,
    returnPush: 600,
    refill: 600,
    inertia: 66,
  });
  const characterShadowSources = Object.freeze([
    "/assets/peek/burger-1-schim.png",
    "/assets/peek/burger-2-schim.png",
    "/assets/peek/burger-3-schim.png",
    "/assets/peek/burger-4-schim.png",
  ]);
  const wolfShadowSource = "/assets/peek/wolf-schim.png";
  const peekImagePreloads = typeof Image === "function"
    ? [...characterShadowSources, wolfShadowSource, "/assets/peek/spiekende-meisje-schim.png"].map(source => {
        const image = new Image();
        image.decoding = "async";
        image.src = source;
        image.decode?.().catch(() => {});
        return image;
      })
    : [];

  function characterShadowSource(player, index = 0) {
    const variant = Math.max(1, Math.min(4, Number(player?.cardVariant || ((index % 4) + 1))));
    return characterShadowSources[variant - 1];
  }

  function circlePosition(index, count) {
    const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
    return {
      x: 50 + Math.cos(angle) * 31,
      y: 50 + Math.sin(angle) * 31,
    };
  }

  function circleStyle(index, count) {
    const { x, y } = circlePosition(index, count);
    return `--peek-x:${x.toFixed(2)}%;--peek-y:${y.toFixed(2)}%`;
  }

  function resourceMarkup(peek) {
    return `<div class="peekMoonMeter" aria-label="Resterende spiektijd">
      <span aria-hidden="true"></span>
      <div><small>Spiektijd</small><strong data-peek-time></strong></div>
    </div>`;
  }

  function playerCircleMarkup(peek) {
    const players = peek.players || [];
    return `<div class="peekPlayerCircle">${players.map((player, index) => `
      <div class="peekCirclePlayer" data-peek-player="${esc(player.key)}" style="${circleStyle(index, players.length)}">
        <span class="peekCharacterShadow" aria-hidden="true">
          <img class="peekCharacterCivilian" data-character-shadow-image src="${characterShadowSource(player, index)}" alt="" draggable="false" decoding="async">
          <img class="peekCharacterWolf" src="${wolfShadowSource}" alt="" draggable="false" decoding="async">
        </span>
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
    if (peek.status === "active" && (peek.timeExpired || Number(peek.remainingPeekMs || 0) <= 0)) {
      return `<section class="peekExperience peekInstruction peekTimeExpired mode-${esc(peek.mode)}" data-peek-experience data-peek-expired>
        <div class="peekInstructionSigil peekExpiredSigil" aria-hidden="true">☾</div>
        <p class="peekEyebrow">Voor deze nacht</p>
        <h1>Je spiektijd is voorbij</h1>
        <p>Probeer het de volgende nacht opnieuw.</p>
      </section>`;
    }
    const modeLayer = peek.mode === "eyelids"
      ? `<svg class="peekEyeMask" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
           <path data-peek-eye-mask fill-rule="evenodd" d="M0 0H1000V600H0Z"></path>
           <ellipse class="peekEyeBloom" data-peek-eye-bloom cx="500" cy="300" rx="420" ry=".01"></ellipse>
         </svg>
         <div class="peekWolfTurn" data-wolf-turn><span></span><strong>Een wolf kijkt om…</strong></div>
         <button class="peekHoldButton" type="button" data-peek-hold>Houd ingedrukt om te spieken</button>`
      : peek.mode === "mirror"
        ? `<div class="peekMirrorShade"></div>
           <svg class="peekShard" data-peek-shard viewBox="0 0 100 128" role="button" aria-label="Sleep de spiegelscherf">
             <defs>
               <clipPath id="peekShardShape"><polygon points="14,5 87,1 99,48 78,126 20,113 1,61"></polygon></clipPath>
               <linearGradient id="peekShardGlass" x1="0" y1="0" x2="1" y2="1">
                 <stop offset="0" stop-color="#d8f2ff" stop-opacity=".48"></stop>
                 <stop offset=".38" stop-color="#5c9bc3" stop-opacity=".18"></stop>
                 <stop offset=".72" stop-color="#071523" stop-opacity=".34"></stop>
                 <stop offset="1" stop-color="#b9e4fb" stop-opacity=".3"></stop>
               </linearGradient>
               <radialGradient id="peekShardGlint" cx=".28" cy=".2" r=".76">
                 <stop offset="0" stop-color="#fff" stop-opacity=".92"></stop>
                 <stop offset=".18" stop-color="#d9f4ff" stop-opacity=".2"></stop>
                 <stop offset=".56" stop-color="#77b7da" stop-opacity=".04"></stop>
                 <stop offset="1" stop-color="#020b13" stop-opacity=".18"></stop>
               </radialGradient>
             </defs>
             <g clip-path="url(#peekShardShape)">
               <image class="peekShardWorld" href="/assets/peek/cold-night-clearing.png" x="-25" y="-4" width="155" height="138" preserveAspectRatio="xMidYMid slice"></image>
               <rect class="peekShardNightTint" x="0" y="0" width="100" height="128"></rect>
               <g class="peekShardReflection" data-shard-reflection>
                 <image class="peekShardPerson" data-shard-character href="/assets/peek/burger-1-schim.png" x="10" y="10" width="80" height="112" preserveAspectRatio="xMidYMid meet"></image>
                 <image class="peekShardWolfPerson" href="${wolfShadowSource}" x="10" y="10" width="80" height="112" preserveAspectRatio="xMidYMid meet"></image>
                 <path class="peekShardWolf" d="M50 31 38 40l-10-7 4 19-8 11 14 4 5 14h14l5-14 14-4-8-11 4-19-10 7z"></path>
                 <g class="peekShardWolfEyes"><circle cx="43" cy="57" r="1.8"></circle><circle cx="57" cy="57" r="1.8"></circle></g>
               </g>
               <rect class="peekShardGlass" x="0" y="0" width="100" height="128" fill="url(#peekShardGlass)"></rect>
               <ellipse class="peekShardSpecular" cx="28" cy="23" rx="53" ry="18" fill="url(#peekShardGlint)"></ellipse>
               <g class="peekShardNameplate" data-shard-nameplate>
                 <rect x="12" y="99" width="76" height="17" rx="3"></rect>
                 <text data-shard-name x="50" y="110.5" text-anchor="middle"></text>
               </g>
             </g>
             <polyline class="peekShardEdge" points="14,5 87,1 99,48 78,126 20,113 1,61 14,5"></polyline>
             <path class="peekShardCrack" d="M55 7 L48 43 L68 61 M48 43 L30 59 M68 61 L60 98"></path>
           </svg>
           <p class="peekGestureHint">Sleep rustig · houd even stil boven één speler</p>`
        : `<p class="peekGestureHint">Duw de mist langzaam opzij · blijf langer bij één speler</p>`;
    return `<section class="peekExperience mode-${esc(peek.mode)}" data-peek-experience>
      <header class="peekTopline">
        <div><p class="peekEyebrow">Spiekende Meisje · optie ${esc(peek.modeNumber)}</p><h1>${esc(peek.modeLabel)}</h1></div>
        ${resourceMarkup(peek)}
      </header>
      <div class="peekRisk" aria-label="Risico"><span>Voorzichtig</span><i><b data-peek-risk-bar></b></i><strong data-peek-risk-label></strong></div>
      <div class="peekDangerLane" aria-live="polite">
        <p class="peekDangerHint" data-peek-danger role="status"></p>
      </div>
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
      this.mirrorTilt = { x: 0, y: 0 };
      this.mirrorPointerId = null;
      this.mirrorCaptureNode = null;
      this.fogGesture = null;
      this.fogBrushPosition = null;
      this.fogBrushLastSentAt = 0;
      this.fogEffect = null;
      this.timeSnapshotMs = 4000;
      this.fogTimeSnapshotMs = 15000;
      this.timeSnapshotAt = performance.now();
      this.riskSnapshot = 0;
      this.riskSnapshotAt = performance.now();
      this.riskTrend = 0;
      this.riskAnimationFrame = null;
      this.localStopPending = false;
      this.localInteractionStartedAt = null;
      this.lastProgressAt = 0;
      this.localTimeExhausted = false;
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

    endMirrorPointer({ notify = true, update = true } = {}) {
      const wasActive = this.pointerActive || this.mirrorPointerId !== null;
      const pointerId = this.mirrorPointerId;
      const captureNode = this.mirrorCaptureNode;
      this.pointerActive = false;
      this.mirrorPointerId = null;
      this.mirrorCaptureNode = null;
      this.localInteractionStartedAt = null;
      this.mirrorTilt = { x: 0, y: 0 };
      if (captureNode && pointerId !== null) {
        try {
          if (!captureNode.hasPointerCapture || captureNode.hasPointerCapture(pointerId)) {
            captureNode.releasePointerCapture?.(pointerId);
          }
        } catch (_error) {
          // De browser kan pointer capture al automatisch hebben vrijgegeven.
        }
      }
      if (notify && wasActive) this.emit("mirror_stop", this.mirrorPosition);
      if (notify && wasActive) this.localStopPending = true;
      if (update) this.updateDynamic();
      this.ensureRiskAnimation();
      return wasActive;
    }

    clearBindings() {
      this.cleanups.splice(0).forEach(cleanup => cleanup());
      this.fogEffect?.destroy();
      this.fogEffect = null;
      this.endMirrorPointer({ notify: false, update: false });
      this.timers.forEach(timer => clearTimeout(timer));
      this.frames.forEach(frame => cancelAnimationFrame(frame));
      this.timers.clear();
      this.frames.clear();
      this.riskAnimationFrame = null;
      this.pointerActive = false;
      this.localHolding = false;
      this.localHoldAt = null;
      this.localStopPending = false;
      this.localInteractionStartedAt = null;
      this.fogGesture = null;
    }

    update(peek) {
      if (!peek || this.destroyed) return;
      const sessionChanged = this.peek?.id !== peek.id;
      if (sessionChanged) this.localTimeExhausted = false;
      if (peek.timeExpired || Number(peek.remainingPeekMs || 0) <= 0) this.localTimeExhausted = true;
      const effectivePeek = this.localTimeExhausted && peek.status === "active"
        ? {
            ...peek,
            remainingPeekMs: 0,
            remainingFogMs: peek.mode === "fog" ? 0 : peek.remainingFogMs,
            holding: false,
            timeExpired: true,
          }
        : peek;
      const exhaustionState = effectivePeek.status === "active" && effectivePeek.timeExpired
        ? "expired"
        : "available";
      const signature = `${effectivePeek.id}|${effectivePeek.mode}|${effectivePeek.status}|${exhaustionState}`;
      this.peek = effectivePeek;
      this.riskSnapshot = Number(effectivePeek.risk ?? this.riskSnapshot ?? 0);
      this.riskSnapshotAt = performance.now();
      this.riskTrend = Number(effectivePeek.riskTrendPerSecond ?? 0);
      if (!effectivePeek.holding) this.localStopPending = false;
      this.timeSnapshotMs = Number(effectivePeek.remainingPeekMs ?? this.timeSnapshotMs ?? 4000);
      this.fogTimeSnapshotMs = Number(effectivePeek.remainingFogMs ?? this.fogTimeSnapshotMs ?? 15000);
      this.timeSnapshotAt = performance.now();
      if (signature !== this.signature) {
        this.clearBindings();
        this.signature = signature;
        this.root.innerHTML = experienceMarkup(effectivePeek);
        this.bind();
      }
      if (effectivePeek.mode === "fog" && this.fogEffect) {
        this.fogEffect.updateSettings({
          ...approvedFogSettings,
          ...(effectivePeek.fogSettings || {}),
        });
      }
      this.updateDynamic();
      this.ensureRiskAnimation();
    }

    expireTimeLocally() {
      if (this.localTimeExhausted || !this.peek || this.peek.status !== "active") return;
      const source = this.peek;
      this.localTimeExhausted = true;
      if (source.mode === "eyelids" && (this.pointerActive || this.localHolding || source.holding)) {
        this.emit("hold_stop");
      }
      if (source.mode === "mirror") this.endMirrorPointer({ notify: true, update: false });
      if (source.mode === "fog" && (this.pointerActive || source.holding)) this.emit("fog_brush_stop");
      this.pointerActive = false;
      this.localHolding = false;
      this.localHoldAt = null;
      this.localInteractionStartedAt = null;
      this.localStopPending = true;
      this.fogGesture = null;
      this.fogBrushPosition = null;
      const expiredPeek = {
        ...source,
        remainingPeekMs: 0,
        remainingFogMs: source.mode === "fog" ? 0 : source.remainingFogMs,
        holding: false,
        timeExpired: true,
      };
      this.options.progress?.({
        open: 0,
        remainingPeekMs: 0,
        remainingFogMs: expiredPeek.remainingFogMs,
        holding: false,
        mode: source.mode,
        timeExpired: true,
      });
      this.update(expiredPeek);
    }

    bind() {
      const understand = this.root.querySelector("[data-peek-understand]");
      if (understand) this.listen(understand, "click", () => this.options.acknowledge?.(this.peek.id));
      if (this.peek.status !== "active") return;
      if (Number(this.peek.remainingPeekMs || 0) <= 0) return;
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
        this.localInteractionStartedAt = this.localHoldAt;
        this.localStopPending = false;
        button.setPointerCapture?.(event.pointerId);
        this.emit("hold_start");
        this.ensureRiskAnimation();
      };
      const stop = event => {
        if (!this.pointerActive && !this.localHolding) return;
        event?.preventDefault?.();
        this.pointerActive = false;
        this.localHolding = false;
        this.localHoldAt = null;
        this.localInteractionStartedAt = null;
        this.localStopPending = true;
        this.emit("hold_stop");
        this.updateDynamic();
        this.ensureRiskAnimation();
      };
      this.listen(button, "pointerdown", start);
      this.listen(button, "pointerup", stop);
      this.listen(button, "pointercancel", stop);
      this.listen(button, "lostpointercapture", stop);
      this.listen(button, "pointerleave", event => {
        if (event.buttons === 0 || event.pointerType === "mouse") stop(event);
      });
    }

    bindMirror() {
      const scene = this.root.querySelector("[data-peek-scene]");
      const shard = this.root.querySelector("[data-peek-shard]");
      if (!scene || !shard) return;
      const move = event => {
        if (!this.pointerActive) return;
        event.preventDefault();
        const rect = scene.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.04, 0.96);
        const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0.05, 0.94);
        this.mirrorTilt = {
          x: clamp((y - this.mirrorPosition.y) * 48, -7, 7),
          y: clamp((x - this.mirrorPosition.x) * 48, -8, 8),
        };
        this.mirrorPosition = { x, y };
        const now = performance.now();
        if (now - this.lastMirrorEmitAt >= 65) {
          this.lastMirrorEmitAt = now;
          this.emit("mirror_move", { x, y });
        }
        this.updateDynamic();
      };
      const keepReflecting = timestamp => {
        if (!this.pointerActive || this.destroyed) return;
        if (timestamp - this.lastMirrorEmitAt >= 90) {
          this.lastMirrorEmitAt = timestamp;
          this.emit("mirror_move", this.mirrorPosition);
        }
        this.updateDynamic();
        this.frame(keepReflecting);
      };
      const start = event => {
        if (Number(this.peek.remainingPeekMs || 0) <= 0) return;
        event.preventDefault();
        this.pointerActive = true;
        this.localInteractionStartedAt = performance.now();
        this.localStopPending = false;
        this.mirrorPointerId = event.pointerId;
        this.mirrorCaptureNode = shard;
        shard.setPointerCapture?.(event.pointerId);
        const rect = scene.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.04, 0.96);
        const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0.05, 0.94);
        this.mirrorPosition = { x, y };
        this.emit("mirror_start", { x, y });
        this.updateDynamic();
        this.frame(keepReflecting);
        this.ensureRiskAnimation();
      };
      const stop = () => {
        this.endMirrorPointer();
      };
      this.listen(shard, "pointerdown", start);
      this.listen(shard, "pointermove", move);
      this.listen(shard, "pointerup", stop);
      this.listen(shard, "pointercancel", stop);
      this.listen(shard, "lostpointercapture", stop);
    }

    bindFog() {
      const scene = this.root.querySelector("[data-peek-scene]");
      if (!scene || !window.WakkerdamFog?.create) return;
      this.fogEffect = window.WakkerdamFog.create({
        container: scene,
        zIndex: 6,
        interactive: true,
        enabled: true,
        settings: {...approvedFogSettings,...(this.peek?.fogSettings||{})},
      });
      const fogInput = this.fogEffect.root;
      const point = event => {
        const rect = scene.getBoundingClientRect();
        return {
          x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
          y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
        };
      };
      const brushTick = timestamp => {
        if (!this.pointerActive || !this.fogBrushPosition || this.destroyed) return;
        if (timestamp - this.fogBrushLastSentAt >= 75) {
          this.fogBrushLastSentAt = timestamp;
          this.emit("fog_brush", this.fogBrushPosition);
        }
        this.updateDynamic();
        this.frame(brushTick);
      };
      const start = event => {
        if (Number(this.peek.remainingFogMs ?? 15000) <= 0) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        this.pointerActive = true;
        this.localInteractionStartedAt = performance.now();
        this.localStopPending = false;
        const startPoint = point(event);
        this.fogGesture = { start: startPoint, last: startPoint, startedAt: performance.now() };
        this.fogBrushPosition = startPoint;
        this.fogBrushLastSentAt = performance.now();
        this.emit("fog_brush_start", startPoint);
        this.frame(brushTick);
        this.ensureRiskAnimation();
      };
      const move = event => {
        if (!this.pointerActive || !this.fogGesture) return;
        event.preventDefault();
        const next = point(event);
        this.fogGesture.last = next;
        this.fogBrushPosition = next;
      };
      const stop = event => {
        if (!this.pointerActive || !this.fogGesture) return;
        event?.preventDefault?.();
        this.pointerActive = false;
        this.localInteractionStartedAt = null;
        this.localStopPending = true;
        this.fogGesture = null;
        this.fogBrushPosition = null;
        this.emit("fog_brush_stop");
        this.updateDynamic();
        this.ensureRiskAnimation();
      };
      this.listen(fogInput, "pointerdown", start);
      this.listen(fogInput, "pointermove", move);
      this.listen(fogInput, "pointerup", stop);
      this.listen(fogInput, "pointercancel", stop);
      this.listen(fogInput, "lostpointercapture", stop);
    }

    cancelPointer() {
      if (this.peek?.mode === "eyelids" && (this.pointerActive || this.localHolding)) this.emit("hold_stop");
      if (this.peek?.mode === "mirror") this.endMirrorPointer({ notify: true, update: false });
      if (this.peek?.mode === "fog" && this.pointerActive) this.emit("fog_brush_stop");
      if (this.peek?.mode === "fog" && this.fogEffect) {
        this.fogEffect.setInteractive(false);
        if (!this.localTimeExhausted && !this.peek?.timeExpired) this.fogEffect.setInteractive(true);
      }
      if (this.pointerActive || this.localHolding) this.localStopPending = true;
      this.pointerActive = false;
      this.localHolding = false;
      this.localHoldAt = null;
      this.localInteractionStartedAt = null;
      this.fogGesture = null;
      this.fogBrushPosition = null;
      this.fogBrushLastSentAt = 0;
      this.updateDynamic();
      this.ensureRiskAnimation();
    }

    interactionIsActive() {
      if (this.peek?.mode === "eyelids" && this.localHolding) return true;
      if (["mirror", "fog"].includes(this.peek?.mode) && this.pointerActive) return true;
      return !this.localStopPending && !!this.peek?.holding;
    }

    displayRisk() {
      const peek = this.peek;
      if (!peek) return 0;
      const elapsedSeconds = Math.max(0, performance.now() - this.riskSnapshotAt) / 1000;
      const active = this.interactionIsActive();
      let risk = Number(this.riskSnapshot || 0);
      if (!active) {
        return clamp(risk - elapsedSeconds * 10, 0, 100);
      }
      if (peek.mode === "eyelids") {
        const localElapsed = this.localHoldAt ? performance.now() - this.localHoldAt : 0;
        const serverElapsed = peek.holdStartedAt ? Date.now() - peek.holdStartedAt : 0;
        const continuous = Math.max(localElapsed, serverElapsed);
        const normalized = clamp(continuous / 3200, 0, 1);
        const continuousFloor = 100 * Math.pow(normalized, 1.35);
        const localRate = 5.4 + Math.max(0, continuous - 850) / 260 + (peek.wolfLookActive ? 58 : 0);
        risk = Math.max(
          risk + elapsedSeconds * Math.max(localRate, Number(this.riskTrend || 0)),
          continuousFloor
        );
      } else {
        const continuousRiskMs = peek.mode === "mirror" ? 6200 : 9800;
        const localStartedAt = this.localInteractionStartedAt;
        const serverElapsed = peek.holdStartedAt ? Date.now() - peek.holdStartedAt : 0;
        const localElapsed = localStartedAt === null ? 0 : performance.now() - localStartedAt;
        const continuous = Math.max(serverElapsed, localElapsed);
        const continuousFloor = 100 * Math.pow(clamp(continuous / continuousRiskMs, 0, 1), 1.35);
        risk = Math.max(
          risk + elapsedSeconds * Math.max(0, Number(this.riskTrend || 0)),
          continuousFloor
        );
      }
      return clamp(risk, 0, 100);
    }

    ensureRiskAnimation() {
      if (this.destroyed || this.riskAnimationFrame !== null || this.peek?.status !== "active") return;
      if (this.localTimeExhausted || this.peek?.timeExpired) return;
      if (!this.interactionIsActive() && this.displayRisk() <= 0.05) return;
      this.riskAnimationFrame = this.frame(() => {
        this.riskAnimationFrame = null;
        this.updateDynamic();
        this.ensureRiskAnimation();
      });
    }

    updateDynamic() {
      const peek = this.peek;
      if (!peek || peek.status !== "active") return;
      const experience = this.root.querySelector("[data-peek-experience]");
      if (!experience) return;
      const risk = this.displayRisk();
      experience.style.setProperty("--peek-risk", `${risk}%`);
      experience.classList.toggle("risk-mid", risk >= 55);
      experience.classList.toggle("risk-high", risk >= 78);
      experience.classList.toggle("wolf-looking", !!peek.wolfLookActive);
      experience.classList.toggle("mirror-eye-contact", !!peek.mirrorEyeContactActive);
      experience.style.setProperty("--mirror-eye-contact", String(clamp(peek.mirrorEyeContactStrength ?? 0, 0, 1)));
      experience.classList.toggle("peek-caught", peek.detectionLevel === "major");
      const riskBar = this.root.querySelector("[data-peek-risk-bar]");
      if (riskBar) riskBar.style.width = `${risk}%`;
      const riskLabel = this.root.querySelector("[data-peek-risk-label]");
      if (riskLabel) {
        riskLabel.textContent = risk >= 100
          ? "Betrapt"
          : risk >= 88
            ? "Bijna betrapt"
            : peek.mirrorEyeContactActive
              ? "Oogcontact · risico stijgt sneller"
            : risk >= 58
              ? "Risico loopt op"
              : "Voorzichtig";
      }
      const time = this.root.querySelector("[data-peek-time]");
      const holding = this.interactionIsActive();
      const localPeekElapsed = holding ? Math.max(0, performance.now() - this.timeSnapshotAt) : 0;
      const displayRemaining = Math.max(0, this.timeSnapshotMs - localPeekElapsed);
      if (time) time.textContent = `${(displayRemaining / 1000).toFixed(1)}s`;
      const displayFogRemaining = peek.mode === "fog" ? displayRemaining : this.fogTimeSnapshotMs;
      if (displayRemaining <= 0 && !this.localTimeExhausted) {
        this.expireTimeLocally();
        return;
      }
      const caught = this.root.querySelector("[data-peek-caught]");
      if (caught) caught.textContent = peek.detectionLevel === "major" ? "De wolven hebben je gezien." : "";
      const danger = this.root.querySelector("[data-peek-danger]");
      if (danger) {
        danger.textContent = risk >= 100
          ? "De wolven hebben je gezien. Je kunt blijven spieken zolang je nog spiektijd hebt."
          : peek.mirrorEyeContactActive
            ? "Je kijkt recht in de rode ogen. Je spiekbalk stijgt nu sneller."
          : risk >= 76
            ? "Pas op: sluit je blik of beweeg weg voordat de wolven je zien."
            : "";
        danger.classList.toggle("visible", !!danger.textContent);
      }

      let open = 0;
      if (peek.mode === "eyelids" && holding) {
        const localElapsed = this.localHoldAt ? performance.now() - this.localHoldAt : 0;
        const serverElapsed = peek.holdStartedAt ? Date.now() - peek.holdStartedAt : 0;
        open = clamp(Math.max(localElapsed, serverElapsed) / 2850, 0.08, 1);
      }
      experience.style.setProperty("--peek-open", String(open));
      experience.style.setProperty("--peek-open-top", `${(-open * 82).toFixed(2)}%`);
      experience.style.setProperty("--peek-open-bottom", `${(open * 82).toFixed(2)}%`);
      const eyeMask = this.root.querySelector("[data-peek-eye-mask]");
      const radiusX = 462;
      const radiusY = Math.max(.01, open * 258);
      if (eyeMask) {
        eyeMask.setAttribute("d", `M0 0H1000V600H0Z M${500-radiusX} 300 A${radiusX} ${radiusY} 0 1 0 ${500+radiusX} 300 A${radiusX} ${radiusY} 0 1 0 ${500-radiusX} 300Z`);
      }
      const eyeBloom = this.root.querySelector("[data-peek-eye-bloom]");
      if (eyeBloom) eyeBloom.setAttribute("ry", String(radiusY));
      const hold = this.root.querySelector("[data-peek-hold]");
      if (hold) {
        hold.classList.toggle("holding", holding);
        hold.disabled = displayRemaining <= 0;
        hold.textContent = displayRemaining <= 0
          ? "Je spiektijd is op"
          : (holding ? "Laat los om je ogen te sluiten" : "Houd ingedrukt om te spieken");
      }
      if (peek.mode === "eyelids" && holding && displayRemaining <= 0 && !this.localTimeExhausted) {
        this.localTimeExhausted = true;
        this.emit("hold_stop");
        this.pointerActive = false;
        this.localHolding = false;
        this.localHoldAt = null;
        this.localStopPending = true;
      }
      if (peek.mode === "mirror" && this.pointerActive && displayRemaining <= 0) {
        this.endMirrorPointer();
      }
      if (peek.mode === "fog" && this.pointerActive && displayRemaining <= 0) {
        this.emit("fog_brush_stop");
        this.pointerActive = false;
        this.fogGesture = null;
        this.fogBrushPosition = null;
      }

      const revealByKey = new Map();
      if (peek.mode === "mirror" && peek.mirrorReveal) revealByKey.set(peek.mirrorReveal.key, peek.mirrorReveal);
      for (const reveal of peek.fogReveals || []) revealByKey.set(reveal.key, reveal);
      const players = peek.players || [];
      for (const [index, player] of players.entries()) {
        const node = [...this.root.querySelectorAll("[data-peek-player]")]
          .find(candidate => candidate.dataset.peekPlayer === String(player.key));
        if (!node) continue;
        const reveal = revealByKey.get(player.key);
        const revealStrength = clamp(reveal?.strength ?? (reveal ? 1 : 0), 0, 1);
        const visible = peek.mode === "eyelids" ? open > 0.14 : revealStrength > 0.025;
        const awakeWolf = peek.mode === "eyelids" ? !!player.awakeWolf : !!reveal?.awakeWolf;
        const wolfMorph = awakeWolf
          ? peek.mode === "eyelids"
            ? clamp((open - .1) / .76, 0, 1)
            : clamp((revealStrength - .68) / .32, 0, 1)
          : 0;
        const position = circlePosition(index, players.length);
        const distanceFromShard = Math.hypot(position.x / 100 - this.mirrorPosition.x, position.y / 100 - this.mirrorPosition.y);
        const nearbyMirrorFocus = peek.mode === "mirror" ? clamp(1 - distanceFromShard / .31, 0, .42) : 0;
        const focus = peek.mode === "eyelids"
          ? clamp(open * 1.08, 0, 1)
          : reveal
            ? clamp(revealStrength * 1.08, 0.04, 1)
            : nearbyMirrorFocus;
        node.style.setProperty("--peek-focus", focus.toFixed(3));
        node.style.setProperty("--wolf-morph", wolfMorph.toFixed(3));
        node.classList.toggle("revealed", visible);
        node.classList.toggle("awakeWolf", visible && awakeWolf);
        const shadowImage = node.querySelector("[data-character-shadow-image]");
        if (shadowImage && shadowImage.getAttribute("src") !== characterShadowSource(player, index)) {
          shadowImage.setAttribute("src", characterShadowSource(player, index));
        }
      }
      const shard = this.root.querySelector("[data-peek-shard]");
      if (shard) {
        shard.style.left = `${this.mirrorPosition.x * 100}%`;
        shard.style.top = `${this.mirrorPosition.y * 100}%`;
        shard.style.setProperty("--shard-tilt-x", `${this.mirrorTilt.x.toFixed(2)}deg`);
        shard.style.setProperty("--shard-tilt-y", `${this.mirrorTilt.y.toFixed(2)}deg`);
        shard.style.setProperty("--shard-glint-x", `${(this.mirrorTilt.y * 1.25).toFixed(2)}px`);
        shard.style.setProperty("--shard-glint-y", `${(this.mirrorTilt.x * 1.1).toFixed(2)}px`);
        const mirrorStrength = clamp(peek.mirrorReveal?.strength || 0, 0, 1);
        const mirrorWolfMorph = peek.mirrorReveal?.awakeWolf
          ? clamp((mirrorStrength - .68) / .32, 0, 1)
          : 0;
        shard.style.setProperty("--mirror-reveal", mirrorStrength.toFixed(3));
        shard.style.setProperty("--mirror-wolf-morph", mirrorWolfMorph.toFixed(3));
        shard.classList.toggle("reflection-visible", mirrorStrength > 0.04);
        shard.classList.toggle("reflection-wolf", !!peek.mirrorReveal?.awakeWolf);
        shard.classList.toggle("eye-contact", !!peek.mirrorEyeContactActive);
        const revealIndex = players.findIndex(player => String(player.key) === String(peek.mirrorReveal?.key));
        const revealPlayer = revealIndex >= 0 ? players[revealIndex] : null;
        const revealPosition = revealIndex >= 0 ? circlePosition(revealIndex, players.length) : null;
        const reflection = shard.querySelector("[data-shard-reflection]");
        const reflectionCharacter = shard.querySelector("[data-shard-character]");
        const reflectionName = shard.querySelector("[data-shard-name]");
        if (reflectionCharacter && revealPlayer) {
          const nextSource = characterShadowSource(revealPlayer, revealIndex);
          if (reflectionCharacter.getAttribute("href") !== nextSource) reflectionCharacter.setAttribute("href", nextSource);
        }
        if (reflectionName) {
          const fullName = String(revealPlayer?.name || "");
          reflectionName.textContent = fullName.length > 16 ? `${fullName.slice(0, 15)}…` : fullName;
        }
        if (reflection && revealPosition) {
          const offsetX = clamp((revealPosition.x / 100 - this.mirrorPosition.x) * 190, -38, 38);
          const offsetY = clamp((revealPosition.y / 100 - this.mirrorPosition.y) * 190, -48, 48);
          reflection.setAttribute("transform", `translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)}) scale(1.22) translate(-9 -14)`);
        } else if (reflection) {
          reflection.removeAttribute("transform");
        }
      }
      const progressNow = performance.now();
      if (progressNow - this.lastProgressAt >= 100 || displayRemaining <= 0) {
        this.lastProgressAt = progressNow;
        this.options.progress?.({
          open,
          remainingPeekMs: displayRemaining,
          remainingFogMs: displayFogRemaining,
          holding,
          mode: peek.mode,
        });
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
    const identity = warning.level === "major" && warning.identity
      ? `<div class="peekWarningIdentity">
          <img src="${esc(warning.identity.roleCardSrc || "/assets/cards/spiekende_meisje.png")}" alt="Kaart van ${esc(warning.identity.roleName || "Het Spiekende Meisje")}">
          <div><small>Jullie hebben haar gezien</small><strong>${esc(warning.identity.name)}</strong><span>${esc(warning.identity.roleName || "Het Spiekende Meisje")}</span></div>
        </div>`
      : "";
    const presence = warning.level === "presence"
      ? `<div class="peekWarningSilhouette silhouette-${esc(warning.hint?.silhouette)} color-${esc(warning.hint?.colorHint)}"><img src="/assets/peek/spiekende-meisje-schim.png" alt=""></div>
         <strong class="peekWarningName">${esc(warning.nameHint || "")}</strong>`
      : "";
    return `<aside class="peekWolfWarning mode-${esc(warning.mode)} level-${esc(warning.level)}${warning.eyeContact ? " eye-contact" : ""}" style="--wolf-awareness:${clamp(warning.awareness ?? 0, 0, 1)};--wolf-eye-contact:${clamp(warning.eyeContactStrength ?? 0, 0, 1)}" role="${warning.level === "major" ? "status" : "presentation"}">
      <div class="peekWarningFlash"></div>
      ${presence}
      ${identity}
    </aside>`;
  }

  function showWolfWarning(warning, { acknowledge } = {}) {
    if (!warning) {
      clearWolfWarning();
      return;
    }
    if (warning.token === warningToken && warningNode?.isConnected) {
      warningNode.style.setProperty("--wolf-awareness", String(clamp(warning.awareness ?? 0, 0, 1)));
      warningNode.style.setProperty("--wolf-eye-contact", String(clamp(warning.eyeContactStrength ?? 0, 0, 1)));
      warningNode.classList.toggle("eye-contact", !!warning.eyeContact);
      return;
    }
    clearWolfWarning({ immediate: true });
    warningToken = warning.token;
    const template = document.createElement("template");
    template.innerHTML = warningMarkup(warning);
    warningNode = template.content.firstElementChild;
    document.body.append(warningNode);
    requestAnimationFrame(() => warningNode?.classList.add("visible"));
  }

  function clearWolfWarning({ immediate = false } = {}) {
    clearTimeout(warningTimer);
    warningTimer = null;
    if (warningNode) {
      const node = warningNode;
      if (immediate) {
        node.remove();
      } else {
        node.classList.remove("visible");
        node.classList.add("leaving");
        warningTimer = setTimeout(() => {
          node.remove();
          warningTimer = null;
        }, 700);
      }
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
    clearWolfWarning({ immediate: true });
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
    session.remainingFogMs = Number(peek.remainingFogMs ?? 15000);
    session.fogExposure = Object.fromEntries((peek.fogReveals || []).map(reveal => [reveal.key, Number(reveal.strength || 0)]));
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
    if(peek.mode === "fog") next.fogSettings = {...approvedFogSettings,...(peek.fogSettings||{})};
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
