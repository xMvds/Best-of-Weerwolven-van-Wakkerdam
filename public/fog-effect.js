(function (global) {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    density: 600,
    motion: 110,
    turbulence: 600,
    pushHeight: 53,
    handMotion: 100,
    handSize: 76,
    pushForce: 45,
    returnPush: 600,
    refill: 600,
    inertia: 66
  });

  const SVG_HAND_PATH = 'M54 14c4 0 7 3 7 8v23l5-10c2-5 7-7 11-4 4 2 5 7 2 12L68 68c-5 12-14 19-27 19-16 0-28-11-28-28V30c0-5 3-8 7-8s7 3 7 8v17-28c0-5 3-8 7-8s7 3 7 8v27-32c0-5 3-8 7-8s7 3 7 8v31-23c0-5 3-8 7-8z';
  const SVG_HAND_DETAIL = 'M27 47v13M41 46v14M55 45v14M17 57c8 1 14 5 18 12';
  const SVG_CURSOR_PATH = 'M41 9c3 0 5 3 5 6v17l4-7c2-4 6-5 9-3 3 2 3 6 1 9l-8 18c-4 10-11 15-21 15-13 0-22-8-22-21V22c0-4 2-6 5-6s5 2 5 6v12-21c0-4 2-6 5-6s5 2 5 6v20-24c0-4 2-6 5-6s5 2 5 6v23-17c0-4 2-6 5-6z';
  const SVG_CURSOR_DETAIL = 'M19 34v10M29 33v11M39 32v11M12 42c6 1 11 4 14 10';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function buildPushHand(id) {
    return `
      <svg class="wf-push-hand" id="${id}" viewBox="0 0 80 96" aria-hidden="true">
        <path d="${SVG_HAND_PATH}"></path>
        <path class="wf-hand-detail" d="${SVG_HAND_DETAIL}"></path>
      </svg>`;
  }

  function buildCursorHand() {
    return `
      <div class="wf-cursor-hand" aria-hidden="true">
        <svg viewBox="0 0 64 76">
          <path d="${SVG_CURSOR_PATH}"></path>
          <path class="wf-hand-detail" d="${SVG_CURSOR_DETAIL}"></path>
        </svg>
      </div>`;
  }

  function createFogSprite() {
    const sprite = document.createElement('canvas');
    sprite.width = 256;
    sprite.height = 128;
    const context = sprite.getContext('2d');
    const gradient = context.createRadialGradient(128, 64, 4, 128, 64, 124);
    gradient.addColorStop(0, 'rgba(244,248,249,1)');
    gradient.addColorStop(0.34, 'rgba(220,229,233,.88)');
    gradient.addColorStop(0.70, 'rgba(191,205,213,.46)');
    gradient.addColorStop(1, 'rgba(180,198,208,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, sprite.width, sprite.height);
    return sprite;
  }

  class InteractiveFog {
    constructor(options) {
      const config = options || {};
      const container = typeof config.container === 'string'
        ? document.querySelector(config.container)
        : config.container;

      if (!(container instanceof HTMLElement)) {
        throw new Error('WakkerdamFog: geef een geldige container mee.');
      }

      this.container = container;
      this.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
      this.enabled = config.enabled !== false;
      this.interactive = config.interactive !== false;
      this.zIndex = Number.isFinite(config.zIndex) ? config.zIndex : 20;
      this.onInteractionStart = typeof config.onInteractionStart === 'function' ? config.onInteractionStart : null;
      this.onInteractionEnd = typeof config.onInteractionEnd === 'function' ? config.onInteractionEnd : null;

      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.lastFrame = performance.now();
      this.animationFrame = 0;
      this.resizeFrame = 0;
      this.initialized = false;
      this.destroyed = false;
      this.puffs = [];
      this.pressureZones = [];
      this.sprite = createFogSprite();

      this.pointer = {
        x: 0,
        y: 0,
        previousX: 0,
        previousY: 0,
        down: false,
        progress: 0,
        inside: false,
        pointerId: null
      };

      this.originalContainerPosition = container.style.position;
      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }

      this.root = document.createElement('div');
      this.root.className = 'wakkerdam-fog-layer';
      this.root.style.setProperty('--wf-z-index', String(this.zIndex));
      this.root.innerHTML = `
        <canvas class="wf-fog-canvas" aria-hidden="true"></canvas>
        <div class="wf-push-hands" aria-hidden="true">
          ${buildPushHand('wf-left-hand')}
          ${buildPushHand('wf-right-hand')}
        </div>
        ${buildCursorHand()}
      `;
      container.appendChild(this.root);

      this.canvas = this.root.querySelector('.wf-fog-canvas');
      this.context = this.canvas.getContext('2d');
      this.pushHands = this.root.querySelector('.wf-push-hands');
      this.leftHand = this.root.querySelector('#wf-left-hand');
      this.rightHand = this.root.querySelector('#wf-right-hand');
      this.cursorHand = this.root.querySelector('.wf-cursor-hand');

      this.root.classList.toggle('wf-not-interactive', !this.interactive);
      this.root.classList.toggle('wf-disabled', !this.enabled);

      this.boundPointerEnter = this.handlePointerEnter.bind(this);
      this.boundPointerMove = this.handlePointerMove.bind(this);
      this.boundPointerDown = this.handlePointerDown.bind(this);
      this.boundPointerUp = this.handlePointerUp.bind(this);
      this.boundPointerCancel = this.handlePointerCancel.bind(this);
      this.boundPointerLeave = this.handlePointerLeave.bind(this);
      this.boundResize = this.scheduleResize.bind(this);
      this.boundAnimate = this.animate.bind(this);

      this.attachEvents();
      this.resizeObserver = 'ResizeObserver' in global
        ? new ResizeObserver(this.boundResize)
        : null;
      this.resizeObserver?.observe(container);
      global.addEventListener('orientationchange', this.boundResize);
      if (!this.resizeObserver) {
        global.addEventListener('resize', this.boundResize);
      }

      this.resizePreservingMist();
      this.animationFrame = requestAnimationFrame(this.boundAnimate);
    }

    attachEvents() {
      this.root.addEventListener('pointerenter', this.boundPointerEnter);
      this.root.addEventListener('pointermove', this.boundPointerMove);
      this.root.addEventListener('pointerdown', this.boundPointerDown);
      this.root.addEventListener('pointerup', this.boundPointerUp);
      this.root.addEventListener('pointercancel', this.boundPointerCancel);
      this.root.addEventListener('pointerleave', this.boundPointerLeave);
      this.root.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    detachEvents() {
      this.root.removeEventListener('pointerenter', this.boundPointerEnter);
      this.root.removeEventListener('pointermove', this.boundPointerMove);
      this.root.removeEventListener('pointerdown', this.boundPointerDown);
      this.root.removeEventListener('pointerup', this.boundPointerUp);
      this.root.removeEventListener('pointercancel', this.boundPointerCancel);
      this.root.removeEventListener('pointerleave', this.boundPointerLeave);
    }

    value(name) {
      return Number(this.settings[name]) || 0;
    }

    densityRatio() {
      return clamp(this.value('density') / 600, 0, 1);
    }

    handScale() {
      return clamp(this.value('handSize') / 100, 0.2, 4);
    }

    handStartGap() {
      return 7 * this.handScale();
    }

    handTravel() {
      return 58 * this.handScale();
    }

    pushHeight() {
      return 110 * this.value('pushHeight') / 100;
    }

    handEase(progress) {
      return 1 - Math.pow(1 - progress, 4);
    }

    handDistance(progress) {
      return this.handStartGap() + this.handTravel() * this.handEase(progress);
    }

    puffTarget() {
      const areaScale = clamp((this.width * this.height) / 350000, 0.72, 1.55);
      const pixelRatioPenalty = this.dpr > 1.5 ? 0.82 : 1;
      return Math.min(760, Math.round((18 + this.value('density') * 1.1) * areaScale * pixelRatioPenalty));
    }

    createPuff() {
      const radius = random(Math.max(62, this.width * 0.065), Math.max(145, this.width * 0.19));
      return {
        x: random(-radius, this.width + radius),
        y: random(-radius, this.height + radius),
        vx: random(-0.012, 0.012),
        vy: random(-0.012, 0.012),
        radius,
        stretch: random(1.3, 2.75),
        alpha: random(0.035, 0.09),
        phase: random(0, Math.PI * 2),
        phaseY: random(0, Math.PI * 2),
        frequency: random(0.00012, 0.00042),
        frequencyY: random(0.0001, 0.00038),
        driftAngle: random(0, Math.PI * 2),
        driftSpeed: random(0.45, 1.3),
        depth: random(0.45, 1.3)
      };
    }

    syncPuffs() {
      const target = this.puffTarget();
      while (this.puffs.length < target) {
        this.puffs.push(this.createPuff());
      }
      if (this.puffs.length > target) {
        this.puffs.length = target;
      }
    }

    reset() {
      this.puffs = [];
      this.pressureZones = [];
      this.pointer.progress = 0;
      this.syncPuffs();
      this.updateHandIcons();
    }

    scheduleResize() {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.resizePreservingMist());
    }

    resizePreservingMist() {
      if (this.destroyed) return;

      const rect = this.container.getBoundingClientRect();
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height);

      if (this.initialized && Math.abs(nextWidth - this.width) < 1 && Math.abs(nextHeight - this.height) < 1) {
        return;
      }

      const oldWidth = this.width;
      const oldHeight = this.height;

      this.width = nextWidth;
      this.height = nextHeight;
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);

      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (!this.initialized) {
        this.initialized = true;
        this.reset();
        return;
      }

      const scaleX = oldWidth > 0 ? this.width / oldWidth : 1;
      const scaleY = oldHeight > 0 ? this.height / oldHeight : 1;
      const radiusScale = Math.sqrt(Math.max(0.01, scaleX * scaleY));

      for (const puff of this.puffs) {
        puff.x *= scaleX;
        puff.y *= scaleY;
        puff.radius *= radiusScale;
      }

      for (const zone of this.pressureZones) {
        zone.x *= scaleX;
        zone.y *= scaleY;
        zone.halfWidth *= scaleX;
        zone.halfHeight *= scaleY;
      }

      this.pointer.x *= scaleX;
      this.pointer.y *= scaleY;
      this.pointer.previousX *= scaleX;
      this.pointer.previousY *= scaleY;
      this.syncPuffs();
      this.positionPointerVisuals();
      this.updateHandIcons();
    }

    eventPosition(event) {
      const rect = this.root.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    setPointer(event, resetPrevious) {
      const position = this.eventPosition(event);
      if (resetPrevious) {
        this.pointer.previousX = position.x;
        this.pointer.previousY = position.y;
      } else {
        this.pointer.previousX = this.pointer.x;
        this.pointer.previousY = this.pointer.y;
      }
      this.pointer.x = position.x;
      this.pointer.y = position.y;
      this.positionPointerVisuals();
    }

    positionPointerVisuals() {
      const x = `${this.pointer.x}px`;
      const y = `${this.pointer.y}px`;
      this.pushHands.style.left = x;
      this.pushHands.style.top = y;
      this.cursorHand.style.left = x;
      this.cursorHand.style.top = y;
    }

    updateHandIcons() {
      const scale = this.handScale();
      const distance = this.handDistance(this.pointer.progress);
      this.leftHand.style.transform = `translate(-50%,-50%) translateX(${-distance}px) scale(${scale}) scaleX(-1) rotate(-8deg)`;
      this.rightHand.style.transform = `translate(-50%,-50%) translateX(${distance}px) scale(${scale}) rotate(8deg)`;
    }

    addPressureZone() {
      const distance = this.handDistance(this.pointer.progress);
      this.pressureZones.push({
        x: this.pointer.x,
        y: this.pointer.y,
        halfWidth: Math.max(36, distance + this.handTravel() * 0.65),
        halfHeight: this.pushHeight() * 0.62,
        life: 1
      });
      if (this.pressureZones.length > 18) {
        this.pressureZones.shift();
      }
    }

    pushPuffsFromHand(handX, handY, direction, moveX, moveY) {
      const heightRange = this.pushHeight() * 0.62;
      const horizontalRange = Math.max(70, this.handTravel() * 1.15);
      const force = this.value('pushForce') / 100;
      const inertia = Math.max(0.1, this.value('inertia') / 100);

      for (const puff of this.puffs) {
        const dx = puff.x - handX;
        const dy = puff.y - handY;
        const normalizedX = dx / (horizontalRange + puff.radius * 0.18);
        const normalizedY = dy / (heightRange + puff.radius * 0.12);
        const distance = Math.hypot(normalizedX, normalizedY);

        if (distance < 1) {
          const falloff = 1 - distance;
          const sideForce = direction * (0.045 + force * 0.18) / inertia;
          puff.vx += sideForce * falloff;
          puff.vx += moveX * 0.0035 * falloff;
          puff.vy += moveY * 0.002 * falloff;
          puff.vy += normalizedY * 0.025 * force * falloff;
        }
      }
    }

    applyHandPush() {
      if (!this.pointer.down) return;
      const distance = this.handDistance(this.pointer.progress);
      const moveX = this.pointer.x - this.pointer.previousX;
      const moveY = this.pointer.y - this.pointer.previousY;
      this.pushPuffsFromHand(this.pointer.x - distance, this.pointer.y, -1, moveX, moveY);
      this.pushPuffsFromHand(this.pointer.x + distance, this.pointer.y, 1, moveX, moveY);
    }

    updateHands(delta) {
      const speed = this.value('handMotion') / 100;
      if (this.pointer.down) {
        this.pointer.progress = Math.min(1, this.pointer.progress + delta * 0.0022 * speed);
      } else {
        this.pointer.progress = Math.max(0, this.pointer.progress - delta * 0.003 * speed);
      }
      this.updateHandIcons();
    }

    applyReturnPressure(delta) {
      const returnStrength = this.value('returnPush') / 100;
      const refill = this.value('refill') / 100;

      for (const zone of this.pressureZones) {
        zone.life -= delta * (0.0004 + refill * 0.00035);
        if (returnStrength <= 0 || this.pointer.down) continue;

        for (const puff of this.puffs) {
          const dx = puff.x - zone.x;
          const dy = puff.y - zone.y;
          const ax = Math.abs(dx);
          const ay = Math.abs(dy);
          if (ay > zone.halfHeight * 1.35 || ax > zone.halfWidth * 2.2) continue;

          const verticalFalloff = 1 - Math.min(1, ay / (zone.halfHeight * 1.35));
          const horizontalFalloff = 1 - Math.min(1, ax / (zone.halfWidth * 2.2));
          const localForce = returnStrength * 0.000045 * delta * zone.life * verticalFalloff * horizontalFalloff;

          if (dx < -zone.halfWidth * 0.2) {
            puff.vx += localForce;
          } else if (dx > zone.halfWidth * 0.2) {
            puff.vx -= localForce;
          }
        }
      }

      this.pressureZones = this.pressureZones.filter((zone) => zone.life > 0);
    }

    updateFog(delta, now) {
      const motion = this.value('motion') / 100;
      const turbulence = this.value('turbulence') / 100;
      const refill = this.value('refill') / 100;
      const inertia = Math.max(0.1, this.value('inertia') / 100);
      const dampingBase = Math.max(0.985, 0.995 - Math.min(0.0035, refill * 0.00035));
      const damping = Math.pow(dampingBase, delta / inertia);

      for (const puff of this.puffs) {
        const wanderingAngle =
          puff.driftAngle +
          Math.sin(now * puff.frequency + puff.phase) * turbulence * 1.15 +
          Math.cos(now * puff.frequencyY + puff.phaseY) * turbulence * 0.55;

        const movementForce = 0.00031 * motion * puff.driftSpeed * puff.depth;
        puff.vx += Math.cos(wanderingAngle) * movementForce * delta;
        puff.vy += Math.sin(wanderingAngle) * movementForce * delta;
        puff.vx *= damping;
        puff.vy *= damping;
        puff.x += puff.vx * delta;
        puff.y += puff.vy * delta;

        const margin = puff.radius * 3;
        if (puff.x > this.width + margin) {
          puff.x = -margin;
          puff.driftAngle = random(0, Math.PI * 2);
        }
        if (puff.x < -margin) {
          puff.x = this.width + margin;
          puff.driftAngle = random(0, Math.PI * 2);
        }
        if (puff.y > this.height + margin) {
          puff.y = -margin;
          puff.driftAngle = random(0, Math.PI * 2);
        }
        if (puff.y < -margin) {
          puff.y = this.height + margin;
          puff.driftAngle = random(0, Math.PI * 2);
        }
      }
    }

    drawFog(now) {
      this.context.clearRect(0, 0, this.width, this.height);
      const ratio = this.densityRatio();
      if (ratio <= 0 || !this.enabled) return;

      const opacityMultiplier = 0.2 + ratio * 2.6;
      const sizeMultiplier = 0.78 + ratio * 0.38;

      for (const puff of this.puffs) {
        const radius = puff.radius * sizeMultiplier;
        const alpha = Math.min(0.43, puff.alpha * opacityMultiplier);
        const drawWidth = radius * puff.stretch * 2;
        const drawHeight = radius * 1.32;
        this.context.globalAlpha = alpha;
        this.context.drawImage(
          this.sprite,
          puff.x - drawWidth / 2,
          puff.y - drawHeight / 2,
          drawWidth,
          drawHeight
        );
      }
      this.context.globalAlpha = 1;
    }

    animate(now) {
      if (this.destroyed) return;
      const delta = Math.min(32, now - this.lastFrame);
      this.lastFrame = now;

      if (this.enabled) {
        this.updateHands(delta);
        this.applyHandPush();
        this.applyReturnPressure(delta);
        this.updateFog(delta, now);
        this.drawFog(now);
      } else {
        this.context.clearRect(0, 0, this.width, this.height);
      }

      this.pointer.previousX = this.pointer.x;
      this.pointer.previousY = this.pointer.y;
      this.animationFrame = requestAnimationFrame(this.boundAnimate);
    }

    handlePointerEnter(event) {
      if (!this.enabled || !this.interactive) return;
      this.pointer.inside = true;
      this.root.classList.add('wf-inside');
      this.setPointer(event, true);
      this.updateHandIcons();
    }

    handlePointerMove(event) {
      if (!this.enabled || !this.interactive) return;
      this.pointer.inside = true;
      this.root.classList.add('wf-inside');
      this.setPointer(event, false);
    }

    handlePointerDown(event) {
      if (!this.enabled || !this.interactive) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();

      this.pointer.down = true;
      this.pointer.pointerId = event.pointerId;
      this.pointer.progress = 0;
      this.root.classList.add('wf-pushing', 'wf-inside');
      this.root.setPointerCapture?.(event.pointerId);
      this.setPointer(event, true);
      this.addPressureZone();
      this.updateHandIcons();
      this.onInteractionStart?.(this);
    }

    handlePointerUp(event) {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      this.pointer.pointerId = null;
      this.root.classList.remove('wf-pushing');
      this.addPressureZone();
      if (this.root.hasPointerCapture?.(event.pointerId)) {
        this.root.releasePointerCapture(event.pointerId);
      }
      this.onInteractionEnd?.(this);
    }

    handlePointerCancel(event) {
      this.pointer.down = false;
      this.pointer.pointerId = null;
      this.root.classList.remove('wf-pushing');
      if (event && this.root.hasPointerCapture?.(event.pointerId)) {
        this.root.releasePointerCapture(event.pointerId);
      }
    }

    handlePointerLeave() {
      if (this.pointer.down) return;
      this.pointer.inside = false;
      this.root.classList.remove('wf-inside', 'wf-pushing');
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      this.root.classList.toggle('wf-disabled', !this.enabled);
      if (!this.enabled) {
        this.pointer.down = false;
        this.root.classList.remove('wf-pushing', 'wf-inside');
      }
    }

    setInteractive(interactive) {
      this.interactive = Boolean(interactive);
      this.root.classList.toggle('wf-not-interactive', !this.interactive);
      if (!this.interactive) {
        this.pointer.down = false;
        this.root.classList.remove('wf-pushing', 'wf-inside');
      }
    }

    updateSettings(nextSettings) {
      if (!nextSettings || typeof nextSettings !== 'object') return;
      const densityChanged = Object.prototype.hasOwnProperty.call(nextSettings, 'density');
      this.settings = { ...this.settings, ...nextSettings };
      if (densityChanged) {
        this.syncPuffs();
      }
      this.updateHandIcons();
    }

    getSettings() {
      return { ...this.settings };
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      cancelAnimationFrame(this.animationFrame);
      cancelAnimationFrame(this.resizeFrame);
      this.resizeObserver?.disconnect();
      global.removeEventListener('orientationchange', this.boundResize);
      if (!this.resizeObserver) {
        global.removeEventListener('resize', this.boundResize);
      }
      this.detachEvents();
      this.root.remove();
      if (this.originalContainerPosition !== undefined) {
        this.container.style.position = this.originalContainerPosition;
      }
    }
  }

  global.WakkerdamFog = Object.freeze({
    defaults: DEFAULT_SETTINGS,
    create(options) {
      return new InteractiveFog(options);
    }
  });
})(window);
