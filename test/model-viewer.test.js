const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Small DOM doubles let us exercise WebGL failures and asynchronous teardown
// without a GPU, network requests, or sleeps in the test suite.
function harness(webgl = true) {
  const viewers = [], timers = [], listeners = {};
  let observer;
  class Control {
    constructor() { this.hidden = false; this.disabled = false; this.attributes = {}; this.textContent = ''; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
  }
  class Viewer extends EventTarget {
    constructor() { super(); this.attributes = {}; this.autoRotate = false; viewers.push(this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    remove() { this.removed = true; }
    jumpCameraToGoal() { this.jumped = true; }
    resetTurntableRotation() { this.rotationReset = true; }
  }
  const context = vm.createContext({
    Event, document: {
      addEventListener: (type, handler) => { listeners[type] = handler; },
      getElementById: () => ({}),
      createElement: tag => tag === 'canvas' ? { getContext: () => webgl ? { getExtension: () => null } : null } : new Viewer()
    },
    customElements: { get: () => Viewer },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
    setTimeout: callback => { const timer = { callback, active:true }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.active = false; },
    esc: value => String(value || '')
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js/models.js'), 'utf8'), context);
  function widget() {
    const classes = new Set();
    const controls = Object.fromEntries(['.model-launch','.model-status','.model-toolbar','.model-poster','[data-model-action="rotate"]'].map(key => [key, new Control()]));
    return {
      controls, dataset:{ modelSrc:'/model.glb', modelLabel:'Тестовая модель' }, isConnected:true,
      classList:{ add:(...names) => names.forEach(n => classes.add(n)), remove:(...names) => names.forEach(n => classes.delete(n)), contains:name => classes.has(name) },
      setAttribute() {}, removeAttribute() {},
      querySelector: selector => selector === '.model-stage' ? { append() {} } : controls[selector]
    };
  }
  function click(widget, action) {
    const button = new Control(); button.dataset = { modelAction:action }; button.closest = () => widget;
    listeners.click({ target:{ closest:() => button } });
    return button;
  }
  return { context, viewers, timers, widget, click, disconnected:() => observer() };
}

test('a browser without WebGL keeps the preview and provides a clear explanation', async () => {
  const h = harness(false), w = h.widget(); await h.context.openModel(w);
  assert.equal(h.viewers.length, 0);
  assert.equal(w.controls['.model-poster'].hidden, false);
  assert.equal(w.controls['.model-launch'].disabled, true);
  assert.match(w.controls['.model-status'].textContent, /недоступен/);
  assert.ok(h.timers.every(timer => !timer.active));
});

test('failed downloads can be retried, and late events from an old viewer cannot replace the result', async () => {
  const h = harness(), w = h.widget(); await h.context.openModel(w);
  const first = h.viewers[0]; first.dispatchEvent(new Event('error'));
  assert.equal(first.removed, true); assert.match(w.controls['.model-launch'].textContent, /Повторить/);
  await h.context.openModel(w); h.viewers[1].dispatchEvent(new Event('load'));
  first.dispatchEvent(new Event('load'));
  assert.equal(w.controls['.model-poster'].hidden, true);
  assert.equal(w.controls['.model-toolbar'].hidden, false);
  assert.equal(h.viewers[1].removed, undefined);
});

test('timed out viewers cannot turn an error into an empty successful view', async () => {
  const h = harness(), w = h.widget(); await h.context.openModel(w);
  h.timers[0].callback(); h.viewers[0].dispatchEvent(new Event('load'));
  assert.equal(w.controls['.model-poster'].hidden, false);
  assert.equal(w.controls['.model-toolbar'].hidden, true);
  assert.match(w.controls['.model-status'].textContent, /слишком много времени/);
});

test('rotation/reset work, and changing cards or navigating releases the previous viewer', async () => {
  const h = harness(), a = h.widget(), b = h.widget(); await h.context.openModel(a);
  const first = h.viewers[0]; first.dispatchEvent(new Event('load'));
  h.click(a, 'rotate'); assert.equal(first.autoRotate, true);
  h.click(a, 'reset'); assert.equal(first.autoRotate, false); assert.equal(first.jumped, true); assert.equal(first.rotationReset, true);
  await h.context.openModel(b); assert.equal(first.removed, true); assert.equal(a.controls['.model-poster'].hidden, false);
  b.isConnected = false; h.disconnected(); assert.equal(h.viewers[1].removed, true);
  assert.ok(h.timers.every(timer => !timer.active));
});
