import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BUILD_TYPES, BLOCK_TYPES, BLOCK_GEOMETRY } from './blocks.js';
import { TOOL_DEFS } from './ui.js';

const cellKey = (c) => `${c.x},${c.y},${c.z}`;

export class Tools {
  constructor({ camera, world, physics, player, effects, audio, ui, viewmodel }) {
    this.camera = camera;
    this.world = world;
    this.physics = physics;
    this.player = player;
    this.effects = effects;
    this.audio = audio;
    this.ui = ui;
    this.viewmodel = viewmodel;
    this.slot = 0;
    this.enabled = false;
    this.lastUse = 0;
    this.lastRecycle = 0;
    this.projectiles = [];
    this.lastHint = '';
    this.lastCrosshair = '';
    this.rocketGeo = new THREE.SphereGeometry(0.085, 10, 8);
    this.rocketMat = new THREE.MeshBasicMaterial({ color: 0xffc07a });
    this.rocketGlow = this.effects.sparkTex;
    this.tmpDir = new THREE.Vector3();
    this.tmpPos = new THREE.Vector3();
    this.tmpOrigin = new THREE.Vector3();

    this.buildGhost = this.makeGhost();
    this.select(0, true);
    this.bind();
    ui.onToolClick = (index) => this.select(index);
  }

  makeGhost() {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.002, 1.002, 1.002),
      new THREE.MeshBasicMaterial({
        color: 0x7de2a8,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006));
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0x9ff7c2, transparent: true, opacity: 0.9 }),
    );
    group.add(mesh, edges);
    group.visible = false;
    group.renderOrder = 4;
    this.world.scene.add(group);
    return { group, mesh, edges };
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const digit = Number(e.key);
      if (digit >= 1 && digit <= 7) {
        this.select(digit - 1);
        e.preventDefault();
      }
    });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.select((this.slot + (e.deltaY > 0 ? 1 : -1) + TOOL_DEFS.length) % TOOL_DEFS.length);
    }, { passive: false });
    window.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.target instanceof Element && e.target.closest('#hotbar, .mobile-controls, #overlay, #pause')) return;
      if (e.button === 0) this.use();
      else if (e.button === 2) this.recycle();
    });
    this.ui.el.mUse.addEventListener('pointerdown', (e) => { e.preventDefault(); this.use(); });
    this.ui.el.mAlt.addEventListener('pointerdown', (e) => { e.preventDefault(); this.recycle(); });
    this.ui.el.mCycle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.select((this.slot + 1) % TOOL_DEFS.length);
    });
  }

  select(index, silent = false) {
    this.slot = Math.max(0, Math.min(TOOL_DEFS.length - 1, index));
    const tool = TOOL_DEFS[this.slot];
    this.ui.setTool(this.slot);
    this.viewmodel.setSlot(this.slot);
    if (tool.type === 'build') this.viewmodel.setBuildType(tool.key);
    if (!silent) this.audio.ui();
    const hint = this.hintForTool();
    this.ui.setStatus(hint);
  }

  hintForTool() {
    const tool = TOOL_DEFS[this.slot];
    if (tool.type === 'build') return `BUILD / ${tool.name}`;
    if (tool.type === 'hammer') return 'SLEDGEHAMMER READY';
    return 'ROCKET LAUNCHER READY';
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) {
      this.buildGhost.group.visible = false;
      this.ui.setCrosshair('');
      this.ui.setHint('', '', false);
    }
  }

  use() {
    if (!this.enabled) return;
    const now = performance.now();
    const tool = TOOL_DEFS[this.slot];
    if (tool.type === 'build') {
      if (now - this.lastUse < 120) return;
      this.lastUse = now;
      this.doBuild();
    } else if (tool.type === 'hammer') {
      if (now - this.lastUse < 480) return;
      this.lastUse = now;
      this.doHammer();
    } else if (tool.type === 'rocket') {
      if (now - this.lastUse < 1050) return;
      this.lastUse = now;
      this.doRocket();
    }
  }

  doBuild() {
    const hit = this.world.pick(this.camera, 9);
    const cell = this.world.buildCellFromHit(hit, true);
    if (!hit || !cell) {
      this.audio.deny();
      return;
    }
    if (cell.y < 0 || cell.y > 46) {
      this.audio.deny();
      return;
    }
    if (this.world.blockMap.has(cellKey(cell))) {
      this.audio.deny();
      this.ui.toast('CELL OCCUPIED', true);
      return;
    }
    const block = this.world.placeBlock(BUILD_TYPES[this.slot], cell);
    if (block) {
      this.viewmodel.action('build');
      this.ui.hitmarker();
      this.effects.impact(this.world.worldPos(cell), new THREE.Vector3(0, 1, 0), BUILD_TYPES[this.slot]);
    }
  }

  doHammer() {
    const hit = this.world.pick(this.camera, 4.6);
    this.viewmodel.action('hammer');
    this.audio.swing();
    if (!hit) {
      this.audio.deny();
      return;
    }
    if (hit.barrel) {
      this.world.explodeBarrel(hit.barrel);
      this.ui.hitmarker();
      return;
    }
    if (hit.block) {
      const p = hit.block.dynamic
        ? new THREE.Vector3(hit.block.body.position.x, hit.block.body.position.y, hit.block.body.position.z)
        : hit.block.pos.clone();
      this.world.destroyBlock(hit.block, { power: 1.7, debris: 7, dust: 12 });
      this.effects.impact(p, hit.normal, hit.block.type);
      this.effects.shake = Math.min(1.7, this.effects.shake + 0.24);
      this.audio.impact(hit.block.type, 1.35, 0);
      this.ui.hitmarker();
      this.applyLocalImpulse(p, 2.4, 4.2);
    } else {
      this.effects.impact(hit.point, hit.normal, 'concrete');
      this.effects.shake = Math.min(1.7, this.effects.shake + 0.15);
      this.audio.impact('concrete', 0.7, 0);
    }
  }

  applyLocalImpulse(point, radius, power) {
    for (const block of this.world.blocks) {
      if (!block.dynamic || block.dead) continue;
      const bp = block.body.position;
      const dx = bp.x - point.x;
      const dy = bp.y - point.y;
      const dz = bp.z - point.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius * radius) continue;
      const d = Math.sqrt(d2) || 0.001;
      const f = (1 - d / radius) * power * BLOCK_TYPES[block.type].mass * 0.6;
      block.body.wakeUp();
      block.body.applyImpulse(
        new CANNON.Vec3((dx / d) * f, (dy / d) * f + f * 0.25, (dz / d) * f),
        new CANNON.Vec3(0, 0, 0),
      );
    }
  }

  doRocket() {
    const dir = this.camera.getWorldDirection(this.tmpDir).clone();
    this.camera.getWorldPosition(this.tmpOrigin);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = this.tmpOrigin.clone()
      .addScaledVector(dir, 0.65)
      .addScaledVector(right, 0.16)
      .add(new THREE.Vector3(0, -0.1, 0));
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(pos);
    this.world.scene.add(mesh);
    const spriteMat = new THREE.SpriteMaterial({
      map: this.rocketGlow,
      color: 0xffa45a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.setScalar(1.05);
    mesh.add(sprite);
    this.projectiles.push({
      mesh,
      sprite,
      pos,
      vel: dir.multiplyScalar(34),
      life: 4.2,
      trail: 0,
    });
    this.audio.rocket();
    this.viewmodel.action('rocket');
    this.effects.shake = Math.min(1.7, this.effects.shake + 0.06);
    this.ui.setStatus('ROCKET AWAY');
  }

  recycle() {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastRecycle < 150) return;
    this.lastRecycle = now;
    const hit = this.world.pick(this.camera, 9);
    if (!hit) {
      this.audio.deny();
      return;
    }
    if (hit.barrel) {
      this.world.explodeBarrel(hit.barrel);
      return;
    }
    if (hit.block) {
      this.world.destroyBlock(hit.block, { power: 1.2, debris: 4 });
      this.effects.impact(hit.point, hit.normal, hit.block.type);
      this.audio.recycle();
      this.ui.hitmarker();
      this.viewmodel.action('build');
    } else {
      this.audio.deny();
    }
  }

  update(dt) {
    if (!this.enabled) {
      this.buildGhost.group.visible = false;
      return;
    }
    const tool = TOOL_DEFS[this.slot];
    if (tool.type === 'build') {
      const hit = this.world.pick(this.camera, 9);
      if (!hit) {
        this.buildGhost.group.visible = false;
        this.setCrosshair('');
        this.setHint('LMB', 'PLACE BLOCK', true);
      } else {
        const cell = this.world.buildCellFromHit(hit, true);
        if (!cell) {
          this.buildGhost.group.visible = false;
          this.setCrosshair('blocked');
          this.setHint('LMB', 'OUT OF REACH', true);
        } else {
          const occupied = this.world.blockMap.has(cellKey(cell));
          this.buildGhost.group.visible = true;
          const p = this.world.worldPos(cell);
          this.buildGhost.group.position.copy(p);
          this.updateGhostColor(!occupied, BUILD_TYPES[this.slot]);
          this.setCrosshair(occupied ? 'blocked' : 'valid');
          this.setHint('LMB', occupied ? 'CELL OCCUPIED' : `PLACE ${tool.name}`, true);
        }
      }
    } else {
      this.buildGhost.group.visible = false;
      const hit = this.world.pick(this.camera, tool.type === 'hammer' ? 4.6 : 9);
      if (hit && (hit.block || hit.barrel)) {
        this.setCrosshair('ready');
        if (hit.barrel) this.setHint('LMB', 'DETONATE BARREL', true);
        else this.setHint('LMB', tool.type === 'hammer' ? 'SMASH BLOCK' : 'FIRE ROCKET', true);
      } else {
        this.setCrosshair(hit ? 'ready' : '');
        this.setHint('LMB', tool.type === 'hammer' ? 'SMASH' : 'FIRE ROCKET', !!hit);
      }
    }
    this.updateProjectiles(dt);
  }

  updateGhostColor(valid, type) {
    const color = valid ? 0x7de2a8 : 0xff4c3b;
    this.buildGhost.mesh.material.color.setHex(color);
    this.buildGhost.edges.material.color.setHex(valid ? 0xa9ffcc : 0xff8a7a);
    this.buildGhost.mesh.material.opacity = valid ? 0.19 : 0.24;
    const t = BLOCK_TYPES[type];
    if (valid) this.buildGhost.mesh.material.color.setHex(t.color);
  }

  setCrosshair(state) {
    if (this.lastCrosshair === state) return;
    this.lastCrosshair = state;
    this.ui.setCrosshair(state);
  }

  setHint(key, text, visible) {
    const id = `${key}|${text}|${visible}`;
    if (this.lastHint === id) return;
    this.lastHint = id;
    this.ui.setHint(key, text, visible);
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const r = this.projectiles[i];
      r.life -= dt;
      const prev = r.pos.clone();
      r.vel.y -= 5.5 * dt;
      r.pos.addScaledVector(r.vel, dt);
      const hit = this.physics.raycast(prev, r.pos, { collisionFilterMask: 1 });
      let exploded = false;
      if (hit) {
        const point = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
        const barrel = hit.body.userData?.barrelRef;
        if (barrel) {
          this.world.explodeBarrel(barrel);
        } else {
          this.world.blast(point, 6.6, { coreScale: 0.38, power: 8.6 });
        }
        exploded = true;
      } else if (r.pos.y <= 0.06) {
        this.world.blast(new THREE.Vector3(r.pos.x, 0.12, r.pos.z), 6.6, { coreScale: 0.38, power: 8.6 });
        exploded = true;
      }

      if (exploded || r.life <= 0) {
        this.world.scene.remove(r.mesh);
        r.sprite.material.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      r.mesh.position.copy(r.pos);
      r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.vel.clone().normalize());
      r.trail -= dt;
      if (r.trail <= 0) {
        r.trail = 0.025;
        this.effects.sparkBurst(r.pos, 1, 1.8, 0xffb24d);
      }
    }
  }

  clearProjectiles() {
    for (const r of this.projectiles) {
      this.world.scene.remove(r.mesh);
      r.sprite.material.dispose();
    }
    this.projectiles.length = 0;
  }
}
