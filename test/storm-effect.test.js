const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const rootPath = path.resolve(__dirname, "..");
const stormSource = fs.readFileSync(path.join(rootPath, "public/wakkerdam-storm-effect.js"), "utf8");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class FakeStyle {
  setProperty(name, value) { this[name] = String(value); }
  removeProperty(name) { delete this[name]; }
  getPropertyValue(name) { return this[name] || ""; }
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.filter(Boolean).forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  setFrom(value) { this.values = new Set(String(value || "").split(/\s+/).filter(Boolean)); }
  toString() { return [...this.values].join(" "); }
  [Symbol.iterator]() { return this.values[Symbol.iterator](); }
}

class FakeElement {
  constructor(className = "") {
    this.classList = new FakeClassList();
    this.className = className;
    this.style = new FakeStyle();
    this.hidden = false;
    this.offsetWidth = 100;
    this.listeners = new Map();
    this.queryMap = new Map();
    this.attributes = new Map();
    this.removed = false;
    this._innerHTML = "";
  }
  set className(value) { this.classList?.setFrom(value); }
  get className() { return this.classList?.toString() || ""; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (!this._innerHTML.includes("wd-storm-canvas")) return;
    for (const className of [
      "wd-storm-clouds",
      "wd-storm-horizon",
      "wd-storm-fog",
      "wd-storm-darkness",
      "wd-storm-global-shadow",
      "wd-storm-flash-main",
      "wd-storm-flash-echo",
      "wd-storm-vignette",
      "wd-storm-reveal-black",
    ]) this.queryMap.set(`.${className}`, new FakeElement(className));
    this.queryMap.set(".wd-storm-canvas", new FakeCanvas());
  }
  get innerHTML() { return this._innerHTML; }
  querySelector(selector) { return this.queryMap.get(selector) || null; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ type }); }
  remove() { this.removed = true; }
}

class FakeCanvas extends FakeElement {
  constructor() {
    super("wd-storm-canvas");
    this.width = 0;
    this.height = 0;
    this.context = {
      setTransform() {}, clearRect() {}, save() {}, restore() {}, beginPath() {},
      moveTo() {}, lineTo() {}, stroke() {}, lineCap: "", shadowColor: "",
      shadowBlur: 0, strokeStyle: "", lineWidth: 0,
    };
  }
  getContext() { return this.context; }
}

class FakeContainer extends FakeElement {
  constructor(width = 390, height = 844) {
    super("viewerHero ended winner-wolves");
    this.rect = { width, height };
    this.content = new FakeElement("infoContent");
    this.queryMap.set(".infoContent", this.content);
    this.prepended = [];
  }
  getBoundingClientRect() { return { ...this.rect }; }
  prepend(element) { this.prepended.unshift(element); }
}

function createStorm(width = 390, height = 844) {
  const container = new FakeContainer(width, height);
  const windowObject = {
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
  };
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  const context = vm.createContext({
    window: windowObject,
    document: { createElement: () => new FakeElement() },
    performance,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    Promise,
    Math,
    Number,
    String,
    Object,
    Array,
    Error,
  });
  vm.runInContext(stormSource, context, { filename: "wakkerdam-storm-effect.js" });
  const storm = windowObject.WakkerdamStorm.mount(container, {
    ...windowObject.WakkerdamStorm.PRESETS.wolf,
    autoLightning: false,
  });
  return {
    storm,
    container,
    content: container.content,
    root: container.prepended[0],
    flash: container.prepended[0].querySelector(".wd-storm-flash-main"),
    echoFlash: container.prepended[0].querySelector(".wd-storm-flash-echo"),
    canvas: container.prepended[0].querySelector(".wd-storm-canvas"),
  };
}

test("manual lightning always resets on cancel and on the WebKit fallback timer", async () => {
  const { storm, flash, canvas, container } = createStorm();
  storm.triggerLightning();
  assert.equal(flash.classList.contains("is-active"), true);
  flash.style.opacity = "1";
  flash.style.visibility = "visible";
  flash.dispatch("animationcancel");
  assert.equal(flash.classList.contains("is-active"), false);
  assert.equal(flash.style.getPropertyValue("opacity"), "");
  assert.equal(flash.style.getPropertyValue("visibility"), "");

  storm.triggerLightning();
  assert.equal(flash.classList.contains("is-active"), true);
  flash.style.opacity = "1";
  flash.style.visibility = "visible";
  flash.dispatch("animationend");
  assert.equal(flash.classList.contains("is-active"), false);
  assert.equal(flash.style.getPropertyValue("opacity"), "");
  assert.equal(flash.style.getPropertyValue("visibility"), "");

  storm.triggerLightning();
  assert.equal(flash.classList.contains("is-active"), true);
  await delay(700);
  assert.equal(flash.classList.contains("is-active"), false);
  assert.equal(flash.style.getPropertyValue("opacity"), "");
  assert.equal(flash.style.getPropertyValue("visibility"), "");

  assert.equal(canvas.width, 585);
  assert.equal(canvas.height, 1266);
  container.rect = { width: 1440, height: 900 };
  storm._resize();
  assert.equal(canvas.width, 2160);
  assert.equal(canvas.height, 1350);
  storm.destroy();
});

test("winner reveal is idempotent, runs the supplied card timeline, and cancels cleanly", { timeout: 12000 }, async () => {
  const { storm, root, container, content, flash, echoFlash } = createStorm(1280, 720);
  const first = storm.revealWinner(content);
  const repeated = storm.revealWinner(content);
  assert.equal(repeated, first);
  assert.equal(container.classList.contains("wd-storm-content-card-reveal"), true);
  assert.equal(container.classList.contains("wd-card-reveal-playing"), true);
  assert.equal(root.classList.contains("is-card-revealing"), true);
  assert.equal(flash.classList.contains("is-reveal-main"), true);
  assert.equal(echoFlash.classList.contains("is-reveal-echo"), true);

  const completed = await first;
  assert.equal(completed, true);
  assert.equal(root.classList.contains("is-revealed"), true);
  assert.equal(container.classList.contains("wd-card-reveal-complete"), true);
  assert.equal(container.classList.contains("wd-storm-content-visible"), true);
  assert.equal(root.querySelector(".wd-storm-reveal-black").style.opacity, "0");
  assert.equal(flash.classList.contains("is-reveal-main"), false);
  assert.equal(echoFlash.classList.contains("is-reveal-echo"), false);

  const cancelled = storm.revealWinner(content);
  await delay(80);
  storm.hide();
  assert.equal(await cancelled, false);
  assert.equal(root.hidden, true);
  assert.equal(container.classList.contains("wd-storm-content-hidden"), false);
  assert.equal(container.classList.contains("wd-storm-content-shadow"), false);
  assert.equal(container.classList.contains("wd-storm-content-card-reveal"), false);
  assert.equal(container.classList.contains("wd-storm-content-visible"), false);
  assert.equal(flash.classList.contains("is-active"), false);
  storm.destroy();
});
