import * as THREE from 'three';

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function finish(canvasEl, repeat = 1, anisotropy = 4) {
  const tx = new THREE.CanvasTexture(canvasEl);
  tx.wrapS = THREE.RepeatWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(repeat, repeat);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = anisotropy;
  tx.needsUpdate = true;
  return tx;
}

function noise(ctx, w, h, count, alpha, rng, light = true) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng()})`;
    const s = 0.5 + rng() * 1.6;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

function grime(ctx, w, h, rng) {
  for (let i = 0; i < 18; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 8 + rng() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(28,24,20,${0.03 + rng() * 0.08})`);
    g.addColorStop(1, 'rgba(28,24,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function hairlineCracks(ctx, w, h, rng, count, color) {
  ctx.strokeStyle = color;
  for (let n = 0; n < count; n++) {
    let x = rng() * w;
    let y = rng() * h;
    ctx.lineWidth = 0.5 + rng();
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < steps; i++) {
      x += (rng() - 0.5) * 22;
      y += (rng() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function makeConcreteTexture() {
  const [c, ctx] = canvas(256);
  const rng = mulberry32(11);
  ctx.fillStyle = '#a8a49b';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(${120 + rng() * 55},${116 + rng() * 52},${106 + rng() * 48},${0.08 + rng() * 0.16})`;
    const r = 2 + rng() * 16;
    ctx.beginPath();
    ctx.arc(rng() * 256, rng() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, 256, 256, 5200, 0.22, rng, true);
  noise(ctx, 256, 256, 4200, 0.16, rng, false);
  hairlineCracks(ctx, 256, 256, rng, 5, 'rgba(58,54,49,0.24)');
  grime(ctx, 256, 256, rng);
  // dark edges read as casting seams between blocks
  const edge = ctx.createLinearGradient(0, 0, 0, 256);
  edge.addColorStop(0, 'rgba(36,33,29,0.5)');
  edge.addColorStop(0.05, 'rgba(36,33,29,0)');
  edge.addColorStop(0.95, 'rgba(36,33,29,0)');
  edge.addColorStop(1, 'rgba(36,33,29,0.5)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 256, 256);
  const edge2 = ctx.createLinearGradient(0, 0, 256, 0);
  edge2.addColorStop(0, 'rgba(36,33,29,0.45)');
  edge2.addColorStop(0.05, 'rgba(36,33,29,0)');
  edge2.addColorStop(0.95, 'rgba(36,33,29,0)');
  edge2.addColorStop(1, 'rgba(36,33,29,0.45)');
  ctx.fillStyle = edge2;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

export function makeBrickTexture() {
  const [c, ctx] = canvas(256);
  const rng = mulberry32(23);
  ctx.fillStyle = '#b8ae9d';
  ctx.fillRect(0, 0, 256, 256);
  const rows = 6;
  const bh = 256 / rows;
  const bw = 78;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? -bw / 2 : 0;
    for (let x = offset; x < 256 + bw; x += bw + 6) {
      const pad = 3;
      const shade = 104 + rng() * 54;
      const rr = shade + 28;
      const gg = shade * 0.54;
      const bb = shade * 0.40;
      ctx.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
      ctx.fillRect(x + pad, r * bh + pad, bw - pad * 2, bh - pad * 2);
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(${rr * 0.7 | 0},${gg * 0.7 | 0},${bb * 0.7 | 0},${0.04 + rng() * 0.14})`;
        ctx.fillRect(x + pad + rng() * (bw - pad * 2), r * bh + pad + rng() * (bh - pad * 2), 2 + rng() * 8, 1 + rng() * 3);
      }
    }
  }
  noise(ctx, 256, 256, 3200, 0.15, rng, true);
  noise(ctx, 256, 256, 2600, 0.13, rng, false);
  grime(ctx, 256, 256, rng);
  return c;
}

export function makeWoodTexture() {
  const [c, ctx] = canvas(256);
  const rng = mulberry32(37);
  ctx.fillStyle = '#8a6238';
  ctx.fillRect(0, 0, 256, 256);
  const planks = 4;
  const pw = 256 / planks;
  for (let p = 0; p < planks; p++) {
    const base = 92 + rng() * 24;
    ctx.fillStyle = `rgb(${base + 30 | 0},${base | 0},${base * 0.66 | 0})`;
    ctx.fillRect(p * pw + 1, 0, pw - 2, 256);
    for (let i = 0; i < 70; i++) {
      const x = p * pw + 3 + rng() * (pw - 6);
      ctx.strokeStyle = `rgba(${48 + rng() * 24 | 0},${28 + rng() * 18 | 0},${14 + rng() * 12 | 0},${0.1 + rng() * 0.25})`;
      ctx.lineWidth = 0.4 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      let px = x;
      for (let y = 0; y < 256; y += 16) {
        px += (rng() - 0.5) * 3;
        ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
    // knots
    if (rng() > 0.4) {
      const kx = p * pw + 10 + rng() * (pw - 20);
      const ky = 20 + rng() * 210;
      ctx.strokeStyle = 'rgba(42,25,12,0.45)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(kx, ky, 3 + i * 2.4, 2 + i * 1.7, rng(), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(26,17,10,0.65)';
    ctx.fillRect(p * pw, 0, 2, 256);
  }
  noise(ctx, 256, 256, 2800, 0.13, rng, true);
  noise(ctx, 256, 256, 1800, 0.12, rng, false);
  return c;
}

export function makeSteelTexture() {
  const [c, ctx] = canvas(256);
  const rng = mulberry32(53);
  ctx.fillStyle = '#59636a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(${120 + rng() * 60},${126 + rng() * 60},${132 + rng() * 54},${0.03 + rng() * 0.1})`;
    ctx.lineWidth = 0.5 + rng();
    const y = rng() * 256;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + (rng() - 0.5) * 4); ctx.stroke();
  }
  // panel border
  ctx.strokeStyle = 'rgba(20,24,26,0.65)';
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, 251, 251);
  ctx.strokeStyle = 'rgba(190,200,205,0.16)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(7, 7, 242, 242);
  // rivets
  for (const [x, y] of [[18, 18], [238, 18], [18, 238], [238, 238]]) {
    const grd = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 7);
    grd.addColorStop(0, '#b8c0c3');
    grd.addColorStop(0.5, '#798287');
    grd.addColorStop(1, '#363d41');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
  }
  grime(ctx, 256, 256, rng);
  return c;
}

export function makeGroundTexture(anisotropy = 8) {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rng = mulberry32(71);
  ctx.fillStyle = '#777166';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 240; i++) {
    const shade = 68 + rng() * 70;
    ctx.fillStyle = `rgba(${shade},${shade * 0.96},${shade * 0.87},${0.05 + rng() * 0.14})`;
    const r = 4 + rng() * 38;
    ctx.beginPath(); ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2); ctx.fill();
  }
  // gravel speckle
  for (let i = 0; i < 15000; i++) {
    const v = 50 + rng() * 130;
    ctx.fillStyle = `rgba(${v},${v * 0.96},${v * 0.86},${0.1 + rng() * 0.35})`;
    const s = 0.5 + rng() * 2.4;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
  // cracks and tyre scuffs
  hairlineCracks(ctx, size, size, rng, 22, 'rgba(36,32,27,0.35)');
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = `rgba(30,27,23,${0.06 + rng() * 0.1})`;
    ctx.lineWidth = 6 + rng() * 14;
    ctx.beginPath();
    const y = rng() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (rng() - 0.5) * 40, size * 0.7, y + (rng() - 0.5) * 55, size, y + (rng() - 0.5) * 25);
    ctx.stroke();
  }
  const tx = finish(c, 26, anisotropy);
  return tx;
}

export function makeSoftCircle(size = 64, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.45)') {
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.32, mid);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

export function makeSmokeTexture(size = 128) {
  const [c, ctx] = canvas(size);
  const rng = mulberry32(91);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const x = size * 0.5 + (rng() - 0.5) * size * 0.45;
    const y = size * 0.5 + (rng() - 0.5) * size * 0.45;
    const r = size * (0.1 + rng() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rng() * 0.1;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.65, `rgba(255,255,255,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

export function makeYardTexture() {
  const w = 1024;
  const h = 768;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const rng = mulberry32(421);
  ctx.fillStyle = '#8d8373';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 380; i++) {
    const shade = 80 + rng() * 78;
    ctx.fillStyle = `rgba(${shade},${shade * 0.95},${shade * 0.84},${0.04 + rng() * 0.1})`;
    const r = 5 + rng() * 70;
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 32000; i++) {
    const v = 55 + rng() * 130;
    ctx.fillStyle = `rgba(${v},${v * 0.95},${v * 0.84},${0.08 + rng() * 0.24})`;
    const s = 0.6 + rng() * 2.2;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }

  // expansion joints
  for (let x = 128; x < w; x += 128) {
    ctx.fillStyle = 'rgba(42,38,32,0.55)';
    ctx.fillRect(x, 0, 2.5, h);
    ctx.fillStyle = 'rgba(208,199,184,0.12)';
    ctx.fillRect(x + 2.5, 0, 1, h);
  }
  for (let y = 128; y < h; y += 128) {
    ctx.fillStyle = 'rgba(42,38,32,0.55)';
    ctx.fillRect(0, y, w, 2.5);
    ctx.fillStyle = 'rgba(208,199,184,0.12)';
    ctx.fillRect(0, y + 2.5, w, 1);
  }

  hairlineCracks(ctx, w, h, rng, 34, 'rgba(38,34,29,0.3)');
  grime(ctx, w, h, rng);
  grime(ctx, w, h, rng);

  // oil and water stains
  for (let i = 0; i < 12; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 15 + rng() * 55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(24,21,18,${0.12 + rng() * 0.15})`);
    g.addColorStop(1, 'rgba(24,21,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // tyre marks
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(28,25,22,${0.08 + rng() * 0.1})`;
    ctx.lineWidth = 10 + rng() * 12;
    ctx.beginPath();
    const sx = rng() * w * 0.6;
    const sy = h * (0.5 + rng() * 0.4);
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + 120, sy - 40, sx + 260, sy + 50, sx + 420, sy - 10);
    ctx.stroke();
  }

  // hazard stripes along the working edge
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h - 34, w, 34);
  ctx.clip();
  for (let x = -40; x < w + 40; x += 34) {
    ctx.fillStyle = (x / 34) % 2 === 0 ? 'rgba(222,172,48,0.5)' : 'rgba(34,30,26,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 17, h);
    ctx.lineTo(x + 39, h - 34);
    ctx.lineTo(x + 22, h - 34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = '#e8c45c';
  ctx.lineWidth = 5;
  ctx.setLineDash([24, 18]);
  ctx.beginPath();
  ctx.arc(512, 330, 188, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(512 - 222, 330); ctx.lineTo(512 + 222, 330);
  ctx.moveTo(512, 108); ctx.lineTo(512, 552);
  ctx.stroke();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#e8c45c';
  ctx.font = '900 58px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DEMOLITION ZONE', 512, 650);
  ctx.globalAlpha = 0.3;
  ctx.font = '700 24px "Arial", sans-serif';
  ctx.fillText('SITE 07  ·  COLLAPSE LAB  ·  AUTHORISED PERSONNEL ONLY', 512, 690);
  ctx.restore();

  // faded bay numbers
  const bays = [
    [-360, -120, '01'], [360, -120, '02'],
    [-360, 160, '03'], [360, 160, '04'],
  ];
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#f0eadc';
  ctx.font = '900 72px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  for (const [dx, dy, label] of bays) ctx.fillText(label, 512 + dx, 400 + dy);
  ctx.restore();

  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  tx.needsUpdate = true;
  return tx;
}

export function makeCloudTexture(size = 256) {
  const [c, ctx] = canvas(size);
  const rng = mulberry32(117);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const x = size * 0.5 + (rng() - 0.5) * size * 0.72;
    const y = size * 0.48 + (rng() - 0.5) * size * 0.24;
    const r = size * (0.08 + rng() * 0.19);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rng() * 0.11;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.5, `rgba(255,255,255,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

export function makeSparkTexture(size = 32) {
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.18, 'rgba(255,220,140,0.95)');
  g.addColorStop(0.45, 'rgba(255,110,30,0.55)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

export function createBlockTextures(anisotropy = 4) {
  return {
    concrete: finish(makeConcreteTexture(), 1, anisotropy),
    brick: finish(makeBrickTexture(), 1, anisotropy),
    wood: finish(makeWoodTexture(), 1, anisotropy),
    steel: finish(makeSteelTexture(), 1, anisotropy),
    ground: makeGroundTexture(anisotropy),
    yard: makeYardTexture(),
    dust: makeSoftCircle(64, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0.38)'),
    smoke: makeSmokeTexture(128),
    spark: makeSparkTexture(32),
    cloud: makeCloudTexture(256),
  };
}
