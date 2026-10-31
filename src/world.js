import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  CELL, BLOCK_TYPES, BUILD_TYPES, BLOCK_GEOMETRY, createBlockMaterials,
} from './blocks.js';

const keyOf = (x, y, z) => `${x},${y},${z}`;
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3(1, 1, 1);
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class SandboxWorld {
  constructor({ scene, physics, effects, audio, textures, onCollapse, onExplosion }) {
    this.scene = scene;
    this.physics = physics;
    this.effects = effects;
    this.audio = audio;
    this.textures = textures;
    this.onCollapse = onCollapse || (() => {});
    this.onExplosion = onExplosion || (() => {});
    this.materials = createBlockMaterials(textures);
    this.blockMap = new Map();
    this.blocks = new Set();
    this.structures = [];
    this.barrels = [];
    this.score = 0;
    this.destroyed = 0;
    this.fallen = 0;
    this.dynamicCount = 0;
    this.supportQueued = false;
    this.supportTimer = 0;
    this.integrityTimer = 0;
    this.unanchoredBurst = 0;
    this.bodySoundCooldown = new Map();
    this.decorBuilt = false;
    this.playerBody = null;

    this.instanced = {};
    for (const type of BUILD_TYPES) {
      const capacity = 1700;
      const mesh = new THREE.InstancedMesh(BLOCK_GEOMETRY, this.materials[type], capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = type !== 'glass';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = type === 'glass' ? 3 : 1;
      scene.add(mesh);
      this.instanced[type] = { mesh, next: 0, free: [], capacity };
    }

    this.buildEnvironment();
    this.buildCity();
    this.recomputeSupport(true);
  }

  // ------------------------------------------------------------------ setup

  buildEnvironment() {
    const groundMat = new THREE.MeshStandardMaterial({
      map: this.textures.ground,
      color: 0x8f816b,
      roughness: 0.97,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundMesh = ground;

    const padTex = this.textures.yard;
    padTex.anisotropy = 8;
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 48),
      new THREE.MeshStandardMaterial({ map: padTex, color: 0xded5c6, roughness: 0.94, metalness: 0.03 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.012, -6);
    pad.receiveShadow = true;
    this.scene.add(pad);
    this.padMesh = pad;

    this.addGroundMarks();
    this.addRubble();
    this.addCones();
    this.buildSkyline();
  }

  addRubble() {
    const count = 110;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x8e877a, roughness: 0.96, metalness: 0.02 }),
      count,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const rng = mulberry(311);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 7 + rng() * 25;
      const s = 0.08 + rng() * 0.34;
      tmpPos.set(Math.cos(a) * r, s * 0.45, Math.sin(a) * r - 3);
      e.set(rng() * 3, rng() * 3, rng() * 3);
      q.setFromEuler(e);
      tmpMatrix.compose(tmpPos, q, new THREE.Vector3(s, s * (0.5 + rng() * 0.7), s));
      mesh.setMatrixAt(i, tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.rubbleMesh = mesh;
  }

  addCones() {
    const coneGeo = new THREE.ConeGeometry(0.17, 0.52, 14);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xe45a1d, roughness: 0.6, metalness: 0.05 });
    const bandGeo = new THREE.CylinderGeometry(0.105, 0.135, 0.08, 14);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.7 });
    const baseGeo = new THREE.BoxGeometry(0.34, 0.045, 0.34);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2c2925, roughness: 0.85 });
    const spots = [
      [5.9, -4.7, 0.3], [-6.9, -2.7, -0.8], [9.2, -0.6, 1.4], [-9.8, -11.9, 0.7],
      [3.6, 6.3, -0.4], [-2.5, -24.0, 2.1], [16.8, -9.5, 1.2], [-19.5, -4.5, -0.6],
    ];
    for (const [x, z, rot] of spots) {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 0.26;
      cone.castShadow = true;
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = 0.27;
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.025;
      base.receiveShadow = true;
      g.add(cone, band, base);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      this.scene.add(g);
    }
  }

  addGroundMarks() {
    const markMat = new THREE.MeshBasicMaterial({
      color: 0xe8c45c,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const whiteMat = new THREE.MeshBasicMaterial({
      color: 0xd8d3c7,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    for (let i = -5; i <= 5; i++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 2.4), markMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(i * 3.4, 0.02, 23);
      this.scene.add(dash);
    }
    const border = new THREE.Mesh(new THREE.PlaneGeometry(58, 0.25), whiteMat);
    border.rotation.x = -Math.PI / 2;
    border.position.set(0, 0.021, 13.5);
    this.scene.add(border);
    const border2 = border.clone();
    border2.position.set(0, 0.021, -29.5);
    this.scene.add(border2);

    for (let i = 0; i < 12; i++) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.16), whiteMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(-27 + i * 5, 0.021, 16 + (i % 2) * 1.1);
      this.scene.add(mark);
    }
  }

  buildSkyline() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4b49, roughness: 0.95, metalness: 0.03 });
    const mat2 = new THREE.MeshStandardMaterial({ color: 0x585956, roughness: 0.9, metalness: 0.05 });
    const rng = mulberry(812);
    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2 + rng() * 0.12;
      const radius = 72 + rng() * 66;
      const w = 8 + rng() * 15;
      const d = 8 + rng() * 15;
      const h = 10 + rng() * 38;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rng() > 0.5 ? mat : mat2);
      b.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius - 6);
      b.rotation.y = rng() * Math.PI;
      b.castShadow = false;
      b.receiveShadow = false;
      group.add(b);
    }
    // a couple of construction cranes for silhouette interest
    for (const [cx, cz, rot] of [[-58, -44, 0.4], [62, -32, -0.7]]) {
      const crane = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0x5d5a50, roughness: 0.8, metalness: 0.2 });
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, 38, 1.1), steel);
      mast.position.y = 19;
      const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.8, 0.8), steel);
      jib.position.set(8, 37, 0);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 0.8), steel);
      counter.position.set(-10, 37, 0);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), steel);
      cabin.position.set(0, 35, 0);
      crane.add(mast, jib, counter, cabin);
      crane.position.set(cx, 0, cz);
      crane.rotation.y = rot;
      group.add(crane);
    }
    this.scene.add(group);
    this.skyline = group;
  }

  // --------------------------------------------------------------- block API

  worldPos(cell) {
    return new THREE.Vector3(cell.x * CELL, (cell.y + 0.5) * CELL, cell.z * CELL);
  }

  addBlock(typeKey, cx, cy, cz, structure = null, options = {}) {
    const type = BLOCK_TYPES[typeKey];
    if (!type) return null;
    const k = keyOf(cx, cy, cz);
    if (this.blockMap.has(k)) return null;
    const pos = this.worldPos({ x: cx, y: cy, z: cz });
    const block = {
      type: typeKey,
      cell: { x: cx, y: cy, z: cz },
      pos,
      dynamic: false,
      dead: false,
      structure,
      mesh: null,
      instance: null,
      body: null,
      lastSound: 0,
    };
    this.physics.createBlockBody(block, pos);
    block.body.userData = { block };
    this.blockMap.set(k, block);
    this.blocks.add(block);
    if (structure) structure.total += 1;
    this.addInstance(block, options.shade ?? 0.92 + Math.random() * 0.16);
    return block;
  }

  addInstance(block, shade) {
    const pool = this.instanced[block.type];
    let index;
    if (pool.free.length) index = pool.free.pop();
    else index = pool.next++;
    if (index >= pool.capacity) return;
    const type = BLOCK_TYPES[block.type];
    tmpMatrix.compose(block.pos, tmpQuat.identity(), tmpScale);
    pool.mesh.setMatrixAt(index, tmpMatrix);
    tmpColor.set(type.tint).multiplyScalar(shade);
    pool.mesh.setColorAt(index, tmpColor);
    pool.mesh.count = Math.max(pool.mesh.count, index + 1);
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    block.instance = { type: block.type, index };
  }

  hideInstance(block) {
    if (!block.instance) return;
    const pool = this.instanced[block.instance.type];
    tmpMatrix.compose(new THREE.Vector3(0, -9999, 0), tmpQuat.identity(), new THREE.Vector3(0.001, 0.001, 0.001));
    pool.mesh.setMatrixAt(block.instance.index, tmpMatrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.free.push(block.instance.index);
    block.instance = null;
  }

  makeDynamic(block, impulse = null) {
    if (block.dynamic || block.dead) return;
    block.dynamic = true;
    this.dynamicCount += 1;
    this.hideInstance(block);
    // the block is no longer on the structural grid; free the cell for rebuilding
    this.blockMap.delete(keyOf(block.cell.x, block.cell.y, block.cell.z));
    const mesh = new THREE.Mesh(BLOCK_GEOMETRY, this.materials[block.type]);
    mesh.position.copy(block.pos);
    mesh.castShadow = block.type !== 'glass';
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    block.mesh = mesh;

    const body = block.body;
    body.type = CANNON.Body.DYNAMIC;
    body.mass = BLOCK_TYPES[block.type].mass;
    body.updateMassProperties();
    body.aabbNeedsUpdate = true;
    body.wakeUp();
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.38;
    body.sleepTimeLimit = 0.9;
    body.angularVelocity.set(
      (Math.random() - 0.5) * 0.22,
      (Math.random() - 0.5) * 0.22,
      (Math.random() - 0.5) * 0.22,
    );

    body.addEventListener('collide', (event) => {
      if (block.dead) return;
      const speed = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (speed < 3.2) return;
      const now = performance.now();
      if (block.lastSound && now - block.lastSound < 180) return;
      block.lastSound = now;
      const cam = this.effects.camera.position;
      const pan = Math.max(-0.7, Math.min(0.7, (body.position.x - cam.x) / 30));
      this.audio.impact(block.type, Math.min(1.1, speed / 11), pan);
    });

    if (impulse) {
      body.applyImpulse(
        new CANNON.Vec3(impulse.x, impulse.y, impulse.z),
        new CANNON.Vec3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
        ),
      );
    }
    this.queueSupport();
  }

  destroyBlock(block, opts = {}) {
    if (!block || block.dead) return;
    block.dead = true;
    this.blocks.delete(block);
    this.blockMap.delete(keyOf(block.cell.x, block.cell.y, block.cell.z));
    if (block.dynamic) {
      this.dynamicCount = Math.max(0, this.dynamicCount - 1);
      if (block.mesh) {
        this.scene.remove(block.mesh);
        block.mesh = null;
      }
      this.physics.world.removeBody(block.body);
    } else {
      this.hideInstance(block);
      this.physics.world.removeBody(block.body);
    }
    if (block.structure) block.structure.remaining -= 1;
    this.destroyed += 1;
    this.score += BLOCK_TYPES[block.type].score;
    const p = block.mesh
      ? new THREE.Vector3(block.body.position.x, block.body.position.y, block.body.position.z)
      : block.pos;
    if (!opts.silent) {
      this.audio.impact(block.type, opts.power ?? 1, 0);
    }
    if (!opts.noDebris) {
      this.effects.debrisBurst(p, block.type, opts.debris ?? 4, opts.power ? opts.power * 2.4 : 3.2);
    }
    this.effects.dustBurst(p, BLOCK_TYPES[block.type].dust, opts.dust ?? 7, 2, opts.dustSize ?? 0.5, 0.45);
    if (block.type === 'steel') this.effects.sparkBurst(p, 5, 4);
    this.queueSupport();
  }

  queueSupport() {
    this.supportQueued = true;
    this.supportTimer = 0.04;
  }

  recomputeSupport(immediate = false) {
    this.supportQueued = false;
    const seen = new Set();
    const queue = [];
    for (const block of this.blocks) {
      if (!block.dynamic && block.cell.y <= 0) {
        seen.add(block);
        queue.push(block);
      }
    }
    let head = 0;
    const dirs = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ];
    while (head < queue.length) {
      const b = queue[head++];
      for (const d of dirs) {
        const k = keyOf(b.cell.x + d[0], b.cell.y + d[1], b.cell.z + d[2]);
        const n = this.blockMap.get(k);
        if (n && !n.dynamic && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }

    const failing = [];
    for (const block of this.blocks) {
      if (!block.dynamic && !seen.has(block)) failing.push(block);
    }
    if (failing.length) {
      for (const b of failing) {
        // release the grid claim so the cell can be rebuilt
        this.blockMap.delete(keyOf(b.cell.x, b.cell.y, b.cell.z));
        this.makeDynamic(b);
      }
      this.fallen += failing.length;
      this.unanchoredBurst = failing.length;
      if (!immediate) {
        this.audio.collapse(Math.min(2.4, 0.6 + failing.length * 0.04));
        const p = failing[0].pos;
        this.effects.dustBurst(p, 0xb9b3a7, 12, 3, 0.9, 0.4);
        if (failing.length > 8) {
          this.effects.smoke(new THREE.Vector3(p.x, 1.5, p.z), 8, 3, 3.4, 0x8d8478);
        }
      }
    } else if (immediate) {
      this.unanchoredBurst = 0;
    }
  }

  // ------------------------------------------------------------------ damage

  blast(point, radius = 6, options = {}) {
    const core = radius * (options.coreScale ?? 0.34);
    const impulsePower = options.power ?? 7.4;
    const blocks = [...this.blocks];
    let destroyed = 0;
    for (const block of blocks) {
      if (block.dead) continue;
      const pos = block.dynamic
        ? new THREE.Vector3(block.body.position.x, block.body.position.y, block.body.position.z)
        : block.pos;
      const dist = pos.distanceTo(point);
      if (dist > radius) continue;
      const falloff = Math.max(0, 1 - dist / radius);
      if (dist < core && (options.destroyChance ?? 0.86) > Math.random()) {
        this.destroyBlock(block, { silent: true, noDebris: Math.random() > 0.35, debris: 2, dust: 4, power: 1.4 });
        destroyed += 1;
        continue;
      }
      if (!block.dynamic) {
        if (falloff < 0.22 && Math.random() > 0.55) continue;
        const dir = pos.clone().sub(point);
        if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
        dir.normalize();
        const mass = BLOCK_TYPES[block.type].mass;
        const imp = impulsePower * (0.35 + falloff * 1.5) * mass;
        this.makeDynamic(block, {
          x: dir.x * imp + (Math.random() - 0.5) * imp * 0.16,
          y: dir.y * imp * 0.7 + imp * (0.35 + falloff * 0.35),
          z: dir.z * imp + (Math.random() - 0.5) * imp * 0.16,
        });
      } else {
        const body = block.body;
        body.wakeUp();
        const dir = pos.clone().sub(point);
        if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
        dir.normalize();
        const mass = BLOCK_TYPES[block.type].mass;
        const imp = impulsePower * (0.22 + falloff * 1.1) * mass;
        body.applyImpulse(
          new CANNON.Vec3(dir.x * imp, dir.y * imp * 0.6 + imp * 0.25, dir.z * imp),
          new CANNON.Vec3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35),
        );
      }
    }

    // chain-detonate nearby barrels
    for (const barrel of [...this.barrels]) {
      if (barrel.dead) continue;
      const bp = new THREE.Vector3(barrel.body.position.x, barrel.body.position.y, barrel.body.position.z);
      if (bp.distanceTo(point) < radius * 1.15) {
        this.explodeBarrel(barrel, 70 + Math.random() * 120);
      }
    }

    this.effects.explosion(point, radius);
    this.audio.explosion();
    this.onExplosion(point, radius);
    this.queueSupport();
    return destroyed;
  }

  explodeBarrel(barrel, delay = 0) {
    if (!barrel || barrel.dead) return;
    barrel.dead = true;
    const p = new THREE.Vector3(barrel.body.position.x, barrel.body.position.y, barrel.body.position.z);
    this.scene.remove(barrel.group);
    this.physics.world.removeBody(barrel.body);
    this.barrels = this.barrels.filter((b) => b !== barrel);
    const fire = () => {
      this.effects.explosion(p, 7.2);
      this.audio.explosion();
      this.blast(p, 7.2, { coreScale: 0.4, power: 9.6 });
      this.onExplosion(p, 7.2);
    };
    if (delay > 0) setTimeout(fire, delay);
    else fire();
  }

  pick(camera, maxDistance = 9) {
    const origin = camera.getWorldPosition(tmpVec).clone();
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const to = origin.clone().addScaledVector(dir, maxDistance);
    const hit = this.physics.raycast(origin, to, { collisionFilterMask: 1 });
    if (!hit) return null;
    const ud = hit.body.userData || {};
    return {
      ...hit,
      block: ud.block || null,
      barrel: ud.barrelRef || null,
      ground: !!ud.ground,
      point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  buildCellFromHit(hit, ignoreOccupancy = false) {
    if (!hit) return null;
    const n = hit.normal;
    let cx = Math.round(hit.point.x + n.x * 0.52);
    let cy = Math.floor(hit.point.y + n.y * 0.52);
    let cz = Math.round(hit.point.z + n.z * 0.52);
    if (hit.block && !hit.block.dynamic) {
      // exact face-neighbour is more reliable for gridded blocks
      cx = hit.block.cell.x + Math.round(n.x);
      cy = hit.block.cell.y + Math.round(n.y);
      cz = hit.block.cell.z + Math.round(n.z);
    }
    if (cy < 0) cy = 0;
    if (cy > 46) return null;
    if (Math.abs(cx) > 55 || Math.abs(cz) > 55) return null;
    if (!ignoreOccupancy && this.blockMap.has(keyOf(cx, cy, cz))) return null;
    return { x: cx, y: cy, z: cz };
  }

  placeBlock(typeKey, cell) {
    if (!cell) return null;
    const block = this.addBlock(typeKey, cell.x, cell.y, cell.z, null);
    if (block) {
      this.audio.place();
      const p = this.worldPos(cell);
      this.effects.dustBurst(new THREE.Vector3(p.x, p.y - 0.45, p.z), BLOCK_TYPES[typeKey].dust, 6, 1.2, 0.35, 0.3);
      this.queueSupport();
    }
    return block;
  }

  structureFor(block) {
    return block ? block.structure : null;
  }

  // ------------------------------------------------------------------ barrels

  addBarrel(x, z, y = 0.55) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc24a1f, roughness: 0.52, metalness: 0.45 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x272320, roughness: 0.7, metalness: 0.35 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.06, 18), bodyMat);
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);
    for (const yy of [-0.33, 0.33]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.415, 0.026, 6, 20), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = yy;
      group.add(band);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 18), bandMat);
    top.position.y = 0.54;
    group.add(top);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.423, 0.423, 0.2, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf0b53c, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    );
    group.add(stripe);
    group.position.set(x, y, z);
    this.scene.add(group);

    const body = new CANNON.Body({
      mass: 48,
      material: this.physics.materials.blockMat,
      shape: new CANNON.Box(new CANNON.Vec3(0.42, 0.53, 0.42)),
      position: new CANNON.Vec3(x, y, z),
      linearDamping: 0.05,
      angularDamping: 0.12,
      sleepSpeedLimit: 0.3,
      sleepTimeLimit: 0.8,
      collisionFilterGroup: 1,
      collisionFilterMask: -1,
    });
    body.userData = { barrel: true };
    this.physics.world.addBody(body);
    body.sleep();
    const barrel = { group, body, dead: false };
    body.userData.barrelRef = barrel;
    this.barrels.push(barrel);
    return barrel;
  }

  addProps() {
    for (const [x, z] of [[5.6, -5.4], [-6.4, -3.2], [8.8, -1.2], [-9.4, -12.4], [4.2, 5.6], [-2.2, -24.4]]) {
      this.addBarrel(x, z);
    }
  }

  // ------------------------------------------------------------------ city

  buildCity() {
    this.structures = [];
    this.blocks.clear();
    this.blockMap.clear();
    for (const pool of Object.values(this.instanced)) {
      pool.next = 0;
      pool.free.length = 0;
      pool.mesh.count = 0;
    }
    this.dynamicCount = 0;
    this.score = 0;
    this.destroyed = 0;
    this.fallen = 0;

    this.buildConcreteTower();
    this.buildBrickHall();
    this.buildGlassTower();
    this.buildTimberShed();
    this.buildSteelFrame();
    this.addProps();
    this.recomputeSupport(true);
    this.updateIntegrity(true);
  }

  makeStructure(name, subtitle) {
    const s = { name, subtitle, total: 0, remaining: 0, collapsed: false, destroyed: false, scoreAwarded: 0 };
    this.structures.push(s);
    return s;
  }

  finishStructure(s) {
    s.remaining = s.total;
  }

  buildConcreteTower() {
    const s = this.makeStructure('MONOLITH', 'concrete high-rise');
    const x0 = -3, x1 = 3, z0 = -17, z1 = -11, H = 15;
    for (let y = 0; y < H; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const perim = x === x0 || x === x1 || z === z0 || z === z1;
          if (!perim) continue;
          const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
          if (y <= 1 && z === z1 && (x === -1 || x === 0)) continue; // entrance
          if (!corner && (y % 5) !== 4) {
            const along = (x === x0 || x === x1) ? z : x;
            if (Math.abs(along) % 2 === 0) {
              this.addBlock('glass', x, y, z, s);
              continue;
            }
          }
          this.addBlock('concrete', x, y, z, s, { shade: 0.9 + Math.random() * 0.18 });
        }
      }
      if (y === 4 || y === 9 || y === 14) {
        for (let x = x0 + 1; x < x1; x++) {
          for (let z = z0 + 1; z < z1; z++) {
            this.addBlock('concrete', x, y, z, s, { shade: 0.88 + Math.random() * 0.16 });
          }
        }
      }
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) this.addBlock('concrete', x, H, z, s);
    }
    for (let y = H + 1; y <= H + 3; y++) this.addBlock('steel', 0, y, -14, s);
    this.finishStructure(s);
  }

  buildBrickHall() {
    const s = this.makeStructure('BRICKWORKS', 'masonry hall');
    const x0 = -19, x1 = -13, z0 = -9, z1 = -3, H = 6;
    for (let y = 0; y < H; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const perim = x === x0 || x === x1 || z === z0 || z === z1;
          if (!perim) continue;
          if (y <= 1 && z === z1 && (x === -17 || x === -16)) continue;
          if (y >= 2 && y <= 3 && !((x === x0 || x === x1) && (z === z0 || z === z1))) {
            if ((x + z + y) % 3 === 0) {
              this.addBlock('glass', x, y, z, s);
              continue;
            }
          }
          this.addBlock('brick', x, y, z, s, { shade: 0.88 + Math.random() * 0.22 });
        }
      }
    }
    for (let x = x0 + 1; x < x1; x++) {
      for (let z = z0 + 1; z < z1; z++) this.addBlock('brick', x, 3, z, s);
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) this.addBlock('brick', x, H, z, s);
    }
    for (let y = H + 1; y <= H + 3; y++) this.addBlock('brick', -15, y, -6, s);
    this.finishStructure(s);
  }

  buildGlassTower() {
    const s = this.makeStructure('PRISM', 'glazed tower');
    const x0 = 12, x1 = 16, z0 = -14, z1 = -10, H = 16;
    for (let y = 0; y < H; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const perim = x === x0 || x === x1 || z === z0 || z === z1;
          if (!perim) continue;
          const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
          if (corner || y % 4 === 0) {
            this.addBlock('steel', x, y, z, s);
          } else {
            const along = (x === x0 || x === x1) ? z : x;
            if (Math.abs(along) % 2 === 0) this.addBlock('steel', x, y, z, s);
            else this.addBlock('glass', x, y, z, s);
          }
        }
      }
      if (y === 5 || y === 10 || y === 15) {
        for (let x = x0 + 1; x < x1; x++) {
          for (let z = z0 + 1; z < z1; z++) this.addBlock('concrete', x, y, z, s, { shade: 0.92 });
        }
      }
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) this.addBlock('steel', x, H, z, s);
    }
    this.finishStructure(s);
  }

  buildTimberShed() {
    const s = this.makeStructure('TIMBER SHED', 'wooden outbuilding');
    const x0 = 9, x1 = 13, z0 = 4, z1 = 8, H = 4;
    for (let y = 0; y < H; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const perim = x === x0 || x === x1 || z === z0 || z === z1;
          if (!perim) continue;
          if (y <= 2 && z === z1 && (x === 10 || x === 11)) continue;
          if (y === 2 && (x === x0 || x === x1) && z !== z0 && z !== z1) {
            this.addBlock('glass', x, y, z, s);
            continue;
          }
          this.addBlock('wood', x, y, z, s, { shade: 0.88 + Math.random() * 0.2 });
        }
      }
    }
    // pyramid roof with overhang
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      for (let z = z0 - 1; z <= z1 + 1; z++) this.addBlock('wood', x, 4, z, s, { shade: 0.8 + Math.random() * 0.18 });
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) this.addBlock('wood', x, 5, z, s, { shade: 0.8 + Math.random() * 0.18 });
    }
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      for (let z = z0 + 1; z <= z1 - 1; z++) this.addBlock('wood', x, 6, z, s, { shade: 0.78 + Math.random() * 0.18 });
    }
    this.addBlock('steel', 12, 7, 6, s);
    this.finishStructure(s);
  }

  buildSteelFrame() {
    const s = this.makeStructure('GIRDERS', 'open steel frame');
    const x0 = -15, x1 = -11, z0 = 3, z1 = 7, H = 6;
    for (let y = 0; y < H; y++) {
      this.addBlock('steel', x0, y, z0, s);
      this.addBlock('steel', x0, y, z1, s);
      this.addBlock('steel', x1, y, z0, s);
      this.addBlock('steel', x1, y, z1, s);
    }
    for (const y of [0, 3, 5]) {
      for (let x = x0; x <= x1; x++) {
        if (x !== x0 && x !== x1) {
          this.addBlock('steel', x, y, z0, s);
          this.addBlock('steel', x, y, z1, s);
        }
      }
      for (let z = z0 + 1; z < z1; z++) {
        this.addBlock('steel', x0, y, z, s);
        this.addBlock('steel', x1, y, z, s);
      }
    }
    for (let x = x0; x <= x1; x++) {
      this.addBlock('steel', x, 6, z0, s);
      this.addBlock('steel', x, 6, z1, s);
    }
    for (let z = z0 + 1; z < z1; z++) {
      this.addBlock('steel', x0, 6, z, s);
      this.addBlock('steel', x1, 6, z, s);
    }
    for (let x = x0 + 1; x < x1; x++) {
      for (let z = z0 + 1; z < z1; z++) {
        this.addBlock('concrete', x, 0, z, s);
        this.addBlock('concrete', x, 3, z, s);
        this.addBlock('concrete', x, 6, z, s);
      }
    }
    for (let y = 0; y < 3; y++) {
      for (let x = x0 + 1; x < x1; x++) {
        if ((x + y) % 2 === 0) this.addBlock('brick', x, y, z0, s);
      }
    }
    this.finishStructure(s);
  }

  // --------------------------------------------------------------- integrity

  updateIntegrity(force = false) {
    if (!force) {
      this.integrityTimer -= 1 / 60;
      if (this.integrityTimer > 0) return;
      this.integrityTimer = 0.28;
    }
    for (const s of this.structures) {
      let standing = 0;
      let alive = 0;
      for (const block of this.blocks) {
        if (block.structure !== s) continue;
        alive += 1;
        if (!block.dynamic) standing += 1;
      }
      s.standing = standing;
      s.remaining = alive;
      s.integrity = s.total > 0 ? standing / s.total : 0;
      if (!s.collapsed && s.integrity <= 0.42) {
        s.collapsed = true;
        s.collapseAt = performance.now();
        const bonus = 450 + Math.floor(s.total * 3.2);
        this.score += bonus;
        s.scoreAwarded = bonus;
        this.audio.collapse(2.8);
        this.onCollapse(s, bonus);
      }
      if (!s.destroyed && s.integrity <= 0.03) {
        s.destroyed = true;
      }
    }
  }

  // ------------------------------------------------------------------- frame

  update(dt) {
    if (this.supportQueued) {
      this.supportTimer -= dt;
      if (this.supportTimer <= 0) this.recomputeSupport();
    }
    if (this.unanchoredBurst > 0) this.unanchoredBurst = 0;

    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      if (b.dead) continue;
      const p = b.body.position;
      b.group.position.set(p.x, p.y, p.z);
      b.group.quaternion.set(b.body.quaternion.x, b.body.quaternion.y, b.body.quaternion.z, b.body.quaternion.w);
      if (p.y < -10) {
        this.scene.remove(b.group);
        this.physics.world.removeBody(b.body);
        this.barrels.splice(i, 1);
      }
    }

    for (const block of this.blocks) {
      if (!block.dynamic || block.dead) continue;
      const p = block.body.position;
      block.mesh.position.set(p.x, p.y, p.z);
      block.mesh.quaternion.set(
        block.body.quaternion.x, block.body.quaternion.y,
        block.body.quaternion.z, block.body.quaternion.w,
      );
      if (p.y < -18) {
        block.dead = true;
        this.blocks.delete(block);
        this.scene.remove(block.mesh);
        this.physics.world.removeBody(block.body);
        this.dynamicCount = Math.max(0, this.dynamicCount - 1);
        if (block.structure) block.structure.remaining -= 1;
      }
    }

    this.updateIntegrity();
  }

  clear() {
    for (const block of [...this.blocks]) {
      if (block.mesh) this.scene.remove(block.mesh);
      this.physics.world.removeBody(block.body);
    }
    this.blocks.clear();
    this.blockMap.clear();
    for (const b of this.barrels) {
      this.scene.remove(b.group);
      this.physics.world.removeBody(b.body);
    }
    this.barrels = [];
    for (const pool of Object.values(this.instanced)) {
      pool.next = 0;
      pool.free.length = 0;
      pool.mesh.count = 0;
    }
    this.effects.clearDebris();
    this.dynamicCount = 0;
    this.score = 0;
    this.destroyed = 0;
    this.fallen = 0;
    this.structures = [];
  }

  rebuild() {
    this.clear();
    this.buildCity();
  }
}

function mulberry(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
