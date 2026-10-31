export const TOOL_DEFS = [
  { key: 'concrete', name: 'CONCRETE', type: 'build', swatch: '#b9b4a9', icon: 'concrete', keyLabel: '1' },
  { key: 'brick', name: 'BRICK', type: 'build', swatch: '#9a6a55', icon: 'brick', keyLabel: '2' },
  { key: 'glass', name: 'GLASS', type: 'build', swatch: '#a9dbe6', icon: 'glass', keyLabel: '3' },
  { key: 'wood', name: 'TIMBER', type: 'build', swatch: '#9a6c41', icon: 'wood', keyLabel: '4' },
  { key: 'steel', name: 'STEEL', type: 'build', swatch: '#8b969c', icon: 'steel', keyLabel: '5' },
  { key: 'hammer', name: 'SLEDGE', type: 'hammer', swatch: '#8a847a', icon: 'hammer', keyLabel: '6' },
  { key: 'rocket', name: 'ROCKET', type: 'rocket', swatch: '#2e312f', icon: 'rocket', keyLabel: '7' },
];

export class UI {
  constructor() {
    this.el = {
      destroyed: document.getElementById('stat-destroyed'),
      score: document.getElementById('stat-score'),
      fps: document.getElementById('stat-fps'),
      integrity: document.getElementById('integrity-list'),
      dyn: document.getElementById('dyn-count'),
      rate: document.getElementById('physics-rate'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('action-hint'),
      hintText: document.getElementById('action-hint-text'),
      hintKey: document.querySelector('#action-hint .key'),
      toast: document.getElementById('toast'),
      hotbar: document.getElementById('hotbar'),
      status: document.getElementById('status-text'),
      hitmarker: document.getElementById('hitmarker'),
      overlay: document.getElementById('overlay'),
      pause: document.getElementById('pause'),
      loader: document.getElementById('loader'),
      loaderFill: document.getElementById('loader-fill'),
      loaderText: document.getElementById('loader-text'),
      startBtn: document.getElementById('start-btn'),
      resumeBtn: document.getElementById('resume-btn'),
      mobileControls: document.getElementById('mobile-controls'),
      joy: document.getElementById('joy'),
      joyKnob: document.getElementById('joy-knob'),
      mUse: document.getElementById('m-use'),
      mAlt: document.getElementById('m-alt'),
      mJump: document.getElementById('m-jump'),
      mCycle: document.getElementById('m-cycle'),
      mReset: document.getElementById('m-reset'),
    };
    this.toastTimer = null;
    this.hitTimer = null;
    this.activeTool = 0;
    this.integrityRows = new Map();
    this.buildHotbar();
  }

  get isTouch() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  buildHotbar() {
    this.el.hotbar.innerHTML = '';
    TOOL_DEFS.forEach((tool, i) => {
      const btn = document.createElement('button');
      btn.className = 'slot';
      btn.dataset.index = i;
      btn.title = `${tool.name} (${tool.keyLabel})`;
      btn.innerHTML = `
        <span class="slot-key"><span>${tool.keyLabel}</span><span class="infinite">∞</span></span>
        <span class="slot-swatch ${tool.icon}" style="${tool.type === 'build' ? `background:${tool.swatch}` : ''}"></span>
        <span class="slot-name">${tool.name}</span>
      `;
      btn.addEventListener('click', () => this.onToolClick?.(i));
      this.el.hotbar.appendChild(btn);
    });
    this.hotbarButtons = [...this.el.hotbar.querySelectorAll('.slot')];
  }

  setTool(index) {
    this.activeTool = index;
    this.hotbarButtons.forEach((b, i) => b.classList.toggle('active', i === index));
  }

  setStats({ destroyed, score, fps }) {
    if (destroyed !== undefined) this.el.destroyed.textContent = destroyed.toLocaleString();
    if (score !== undefined) this.el.score.textContent = score.toLocaleString();
    if (fps !== undefined) this.el.fps.textContent = Math.round(fps);
  }

  setDynamic(count) {
    this.el.dyn.textContent = `${count.toLocaleString()} dynamic pieces`;
  }

  setStatus(text) {
    this.el.status.textContent = text;
  }

  setCrosshair(state) {
    const c = this.el.crosshair;
    c.classList.toggle('valid', state === 'valid');
    c.classList.toggle('blocked', state === 'blocked');
    c.classList.toggle('ready', state === 'ready');
  }

  setHint(key, text, visible = true) {
    this.el.hint.style.opacity = visible ? '1' : '0';
    if (key) this.el.hintKey.textContent = key;
    if (text) this.el.hintText.textContent = text;
  }

  hitmarker() {
    const hm = this.el.hitmarker;
    hm.classList.add('show');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => hm.classList.remove('show'), 90);
  }

  toast(html, danger = false) {
    const t = this.el.toast;
    t.innerHTML = html;
    t.classList.toggle('danger', danger);
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  setupIntegrity(structures) {
    this.el.integrity.innerHTML = '';
    this.integrityRows.clear();
    for (const s of structures) {
      const row = document.createElement('div');
      row.className = 'istruct';
      row.innerHTML = `
        <div class="istruct-top"><span class="istruct-name">${s.name}</span><span class="istruct-pct">100%</span></div>
        <div class="ibar"><i></i></div>
      `;
      this.el.integrity.appendChild(row);
      this.integrityRows.set(s, {
        row,
        pct: row.querySelector('.istruct-pct'),
        bar: row.querySelector('.ibar i'),
      });
    }
  }

  updateIntegrity(structures) {
    for (const s of structures) {
      const r = this.integrityRows.get(s);
      if (!r) continue;
      const pct = Math.max(0, Math.min(100, Math.round((s.integrity ?? 1) * 100)));
      r.pct.textContent = s.collapsed ? 'DOWN' : `${pct}%`;
      r.bar.style.width = `${pct}%`;
      r.row.classList.toggle('warn', !s.collapsed && pct <= 70 && pct > 42);
      r.row.classList.toggle('critical', !s.collapsed && pct <= 42);
      r.row.classList.toggle('down', s.collapsed);
    }
  }

  showLoader(show) {
    this.el.loader.classList.toggle('hidden', !show);
  }

  setLoader(progress, text) {
    if (progress !== undefined) this.el.loaderFill.style.width = `${Math.round(progress * 100)}%`;
    if (text) this.el.loaderText.textContent = text;
  }

  showStart(show) {
    this.el.overlay.classList.toggle('hidden', !show);
  }

  showPause(show) {
    this.el.pause.classList.toggle('hidden', !show);
  }

  showTouchControls(show) {
    this.el.mobileControls.style.display = show ? 'block' : 'none';
  }
}
