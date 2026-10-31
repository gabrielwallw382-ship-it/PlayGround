export class SoundLab {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.started = false;
    this.lastFootstep = 0;
    this.impactBudget = 0;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.62;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2.2);
    this.started = true;
    this.startWind();
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    return buf;
  }

  startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.windGain = gain;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ freq = 220, endFreq = freq, dur = 0.2, type = 'sine', gain = 0.2, delay = 0, pan = 0 }) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g);
    g.connect(p);
    p.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.2, type = 'lowpass', freq = 700, endFreq = freq, q = 0.9, delay = 0, pan = 0, rate = 1 }) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(20, freq), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  }

  ui() {
    this.tone({ freq: 620, endFreq: 880, dur: 0.06, type: 'square', gain: 0.035 });
  }

  place() {
    this.noise({ dur: 0.09, gain: 0.28, type: 'bandpass', freq: 520, endFreq: 260, q: 1.2 });
    this.tone({ freq: 150, endFreq: 78, dur: 0.1, type: 'sine', gain: 0.18 });
  }

  recycle() {
    this.noise({ dur: 0.12, gain: 0.16, type: 'highpass', freq: 900, endFreq: 1800, q: 0.7 });
    this.tone({ freq: 330, endFreq: 190, dur: 0.09, type: 'triangle', gain: 0.08 });
  }

  impact(type, strength = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.now();
    if (t < this.impactBudget) return;
    this.impactBudget = t + 0.035;
    const s = Math.min(1.4, 0.25 + strength);
    if (type === 'glass') {
      this.noise({ dur: 0.35, gain: 0.24 * s, type: 'highpass', freq: 2400, endFreq: 5200, q: 0.8, pan });
      for (let i = 0; i < 4; i++) {
        this.tone({ freq: 1800 + Math.random() * 2600, dur: 0.18 + Math.random() * 0.3, type: 'sine', gain: 0.035 * s, delay: i * 0.035, pan });
      }
    } else if (type === 'steel') {
      this.tone({ freq: 190 + Math.random() * 40, endFreq: 110, dur: 0.55, type: 'triangle', gain: 0.13 * s, pan });
      this.noise({ dur: 0.3, gain: 0.14 * s, type: 'bandpass', freq: 1500, endFreq: 700, q: 6, pan });
    } else if (type === 'wood') {
      this.noise({ dur: 0.18, gain: 0.2 * s, type: 'bandpass', freq: 420, endFreq: 190, q: 1.8, pan });
      this.tone({ freq: 140, endFreq: 70, dur: 0.16, type: 'sine', gain: 0.12 * s, pan });
    } else if (type === 'brick') {
      this.noise({ dur: 0.24, gain: 0.24 * s, type: 'lowpass', freq: 1100, endFreq: 280, q: 1, pan });
      this.tone({ freq: 110, endFreq: 55, dur: 0.18, type: 'sine', gain: 0.14 * s, pan });
    } else {
      this.noise({ dur: 0.26, gain: 0.26 * s, type: 'lowpass', freq: 780, endFreq: 150, q: 1.1, pan });
      this.tone({ freq: 95, endFreq: 44, dur: 0.22, type: 'sine', gain: 0.2 * s, pan });
    }
  }

  hammer() {
    this.noise({ dur: 0.22, gain: 0.18, type: 'bandpass', freq: 1100, endFreq: 320, q: 1.2 });
    this.tone({ freq: 240, endFreq: 120, dur: 0.18, type: 'square', gain: 0.05 });
  }

  swing() {
    this.noise({ dur: 0.16, gain: 0.08, type: 'bandpass', freq: 380, endFreq: 900, q: 1 });
  }

  rocket() {
    this.noise({ dur: 0.7, gain: 0.28, type: 'highpass', freq: 500, endFreq: 2600, q: 0.7 });
    this.tone({ freq: 90, endFreq: 150, dur: 0.45, type: 'sawtooth', gain: 0.07 });
  }

  explosion() {
    this.noise({ dur: 1.15, gain: 0.65, type: 'lowpass', freq: 1500, endFreq: 55, q: 0.8 });
    this.tone({ freq: 86, endFreq: 24, dur: 1.0, type: 'sine', gain: 0.4 });
    this.tone({ freq: 46, endFreq: 20, dur: 1.3, type: 'triangle', gain: 0.22 });
    this.noise({ dur: 0.22, gain: 0.3, type: 'highpass', freq: 1200, endFreq: 300, q: 0.6 });
  }

  collapse(duration = 2.4) {
    this.noise({ dur: duration, gain: 0.3, type: 'lowpass', freq: 300, endFreq: 90, q: 0.6 });
    this.tone({ freq: 52, endFreq: 30, dur: duration, type: 'sine', gain: 0.15 });
    for (let i = 0; i < 5; i++) {
      this.noise({ dur: 0.35, gain: 0.1, type: 'bandpass', freq: 500 + Math.random() * 900, endFreq: 200, q: 2, delay: i * 0.25 });
    }
  }

  footstep(running = false) {
    if (!this.ctx) return;
    const t = this.now();
    if (t - this.lastFootstep < (running ? 0.29 : 0.42)) return;
    this.lastFootstep = t;
    this.noise({ dur: 0.08, gain: running ? 0.1 : 0.07, type: 'lowpass', freq: 340, endFreq: 130, q: 1, pan: (Math.random() - 0.5) * 0.2 });
  }

  jump() {
    this.noise({ dur: 0.1, gain: 0.06, type: 'lowpass', freq: 260, endFreq: 500, q: 1 });
  }

  land() {
    this.tone({ freq: 80, endFreq: 44, dur: 0.16, type: 'sine', gain: 0.12 });
    this.noise({ dur: 0.14, gain: 0.12, type: 'lowpass', freq: 420, endFreq: 100, q: 0.8 });
  }

  score() {
    this.tone({ freq: 420, endFreq: 640, dur: 0.16, type: 'triangle', gain: 0.08 });
    this.tone({ freq: 640, endFreq: 960, dur: 0.24, type: 'triangle', gain: 0.06, delay: 0.12 });
  }

  deny() {
    this.tone({ freq: 180, endFreq: 120, dur: 0.12, type: 'square', gain: 0.04 });
  }
}
