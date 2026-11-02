export class RegisteredSystem {
  constructor(runtime, name) {
    this.runtime = runtime;
    this.name = name;
    this.registry = { functions: {}, state: {}, events: [] };
    runtime.registry.systems[name] = this;
  }
  emit(type, details = {}) {
    const event = { system: this.name, type, time: new Date().toISOString(), ...details };
    this.registry.events.push(event);
    this.runtime.record(event);
  }
  dispose() {}
}
export class LayoutSystem extends RegisteredSystem {
  constructor(runtime) {
    super(runtime, 'layout');
    this.registry.functions.update = () => this.update();
    this.onResize = () => this.update();
    window.addEventListener('resize', this.onResize, { passive: true });
    this.update();
  }
  update() {
    const width = window.innerWidth;
    const mode = width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
    if (this.registry.state.mode !== mode) this.emit('mode-change', { mode });
    this.registry.state.mode = mode;
    document.documentElement.dataset.mode = mode;
  }
  dispose() { window.removeEventListener('resize', this.onResize); }
}
export class VectorSystem extends RegisteredSystem {
  constructor(runtime) { super(runtime, 'vector'); this.registry.functions.create = (tag, attributes = {}) => this.create(tag, attributes); }
  create(tag, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }
  attach(container) {
    const svg = this.create('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: 'vector-aura', preserveAspectRatio: 'xMidYMid meet' });
    const circle = this.create('circle', { cx: 50, cy: 50, r: 43, fill: 'none', stroke: 'currentColor', 'stroke-width': '.13', 'stroke-dasharray': '1 3', opacity: '.5' });
    svg.append(circle); container.append(svg);
    this.registry.state.svg = svg;
  }
}
export class AnimationSystem extends RegisteredSystem {
  constructor(runtime) {
    super(runtime, 'animation');
    this.registry.state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.registry.functions.animate = (element, frames, options) => this.animate(element, frames, options);
  }
  animate(element, frames, options = {}) {
    if (this.registry.state.reducedMotion || !element?.animate) return null;
    const animation = element.animate(frames, options);
    this.registry.state.lastAnimation = animation;
    return animation;
  }
}
export class MorphingSystem extends RegisteredSystem {
  constructor(runtime) { super(runtime, 'morphing'); this.registry.functions.begin = (element) => this.begin(element); }
  begin(element) {
    const animation = this.runtime.registry.systems.animation;
    return animation.animate(element, [
      { transform: 'translate(-50%, -50%) scale(.98) rotate(-2deg)', opacity: .26 },
      { transform: 'translate(-50%, -50%) scale(1.035) rotate(2deg)', opacity: .55 },
      { transform: 'translate(-50%, -50%) scale(.98) rotate(-2deg)', opacity: .26 }
    ], { duration: 16000, iterations: Infinity, easing: 'ease-in-out' });
  }
}
export class WebAssemblySystem extends RegisteredSystem {
  constructor(runtime) { super(runtime, 'wasm'); this.registry.state.supported = typeof WebAssembly === 'object'; this.registry.functions.instantiate = (bytes, imports = {}) => this.instantiate(bytes, imports); }
  async instantiate(bytes, imports = {}) {
    if (!this.registry.state.supported) throw new Error('WebAssembly unavailable');
    const result = await WebAssembly.instantiate(bytes, imports);
    this.emit('module-instantiated');
    return result.instance ?? result;
  }
}
export class WebGPUSystem extends RegisteredSystem {
  constructor(runtime) { super(runtime, 'webgpu'); this.registry.state.supported = Boolean(navigator.gpu); this.registry.functions.requestDevice = () => this.requestDevice(); }
  async requestDevice() {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    const device = adapter ? await adapter.requestDevice() : null;
    this.registry.state.available = Boolean(device);
    if (device) device.lost.then(() => { this.registry.state.available = false; this.emit('device-lost'); });
    return device;
  }
}
export class AuditSystem extends RegisteredSystem {
  constructor(runtime) { super(runtime, 'audit'); this.registry.state.status = 'initializing'; this.init(); }
  async init() {
    try {
      const [{ WebR }, response] = await Promise.all([import('https://webr.r-wasm.org/latest/webr.mjs'), fetch('/index.R', { cache: 'no-store' })]);
      if (!response.ok) throw new Error('R source unavailable');
      const engine = new WebR(); await engine.init();
      const source = await response.text();
      await engine.evalRVoid(source);
      this.registry.state.status = 'ready';
      this.registry.state.engine = engine;
      this.emit('ready');
    } catch (error) {
      this.registry.state.status = 'unavailable';
      this.registry.state.reason = String(error);
      this.emit('unavailable');
      console.warn('Optional R audit unavailable', error);
    }
  }
}
