import * as THREE from 'three';
import { createDebrisMaterials } from './blocks.js';

const DUST_MAX = 1100;
const SPARK_MAX = 320;
const DEBRIS_MAX = 170;

const particleVertex = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (330.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */`
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

class ParticlePool {
  constructor(scene, texture, count, blending, gravity, drag) {
    this.count = count;
    this.cursor = 0;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.grow = new Float32Array(count);
    this.baseAlpha = new Float32Array(count);
    this.dragPer = new Float32Array(count);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geom.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geom.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geom = geom;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending,
    });
    this.points = new THREE.Points(geom, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, growth, alpha, drag = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.col[p] = color.r; this.col[p + 1] = color.g; this.col[p + 2] = color.b;
    this.size[i] = size;
    this.alpha[i] = alpha;
    this.baseAlpha[i] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = growth;
    this.dragPer[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      const p = i * 3;
      this.vel[p + 1] += this.gravity * dt;
      const damp = Math.pow(this.dragPer[i], dt);
      this.vel[p] *= damp;
      this.vel[p + 1] *= damp;
      this.vel[p + 2] *= damp;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, t * 1.8);
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.aSize.needsUpdate = true;
    this.geom.attributes.aAlpha.needsUpdate = true;
    this.geom.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, physics, camera, textures) {
    this.scene = scene;
    this.physics = physics;
    this.camera = camera;
    this.dustTex = textures.dust;
    this.smokeTex = textures.smoke;
    this.sparkTex = textures.spark;

    this.dust = new ParticlePool(scene, textures.dust, DUST_MAX, THREE.NormalBlending, -0.5, 0.55);
    this.sparks = new ParticlePool(scene, textures.spark, SPARK_MAX, THREE.AdditiveBlending, -11, 0.72);
    this.debrisMaterials = createDebrisMaterials();
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.debris = [];
    this.flashes = [];
    this.lights = [];
    this.tmpColor = new THREE.Color();
    this.tmpVec = new THREE.Vector3();
    this.shake = 0;

    this.addAmbientMotes();
  }

  addAmbientMotes() {
    const count = 320;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 16 + 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.045,
      map: this.dustTex,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      color: 0xffe4b8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.motes = new THREE.Points(geom, mat);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  dustBurst(point, colorHex, count = 12, power = 2.6, size = 0.5, alpha = 0.3) {
    const c = this.tmpColor.set(colorHex);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const sp = power * (0.25 + Math.random());
      this.dust.spawn(
        point.x + (Math.random() - 0.5) * 0.8,
        point.y + (Math.random() - 0.5) * 0.8,
        point.z + (Math.random() - 0.5) * 0.8,
        Math.cos(a) * sp * r,
        Math.random() * sp * 0.8 + 0.3,
        Math.sin(a) * sp * r,
        c,
        size * (0.45 + Math.random() * 0.8),
        1.4 + Math.random() * 2.2,
        0.5,
        alpha * (0.45 + Math.random() * 0.55),
        0.45,
      );
    }
  }

  smoke(point, count = 14, power = 4, size = 2.4, colorHex = 0x8d8478) {
    const c = this.tmpColor.set(colorHex);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.2 + Math.random() * 0.8);
      this.dust.spawn(
        point.x + (Math.random() - 0.5) * 1.4,
        point.y + Math.random() * 1.2,
        point.z + (Math.random() - 0.5) * 1.4,
        Math.cos(a) * sp,
        0.8 + Math.random() * 2.2,
        Math.sin(a) * sp,
        c,
        size * (0.55 + Math.random() * 0.8),
        2.4 + Math.random() * 2.5,
        1.4,
        0.2,
        0.55,
      );
    }
  }

  sparkBurst(point, count = 16, power = 8, colorHex = 0xffb24d) {
    const c = this.tmpColor.set(colorHex);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * power * 0.9;
      const sp = power * (0.25 + Math.random());
      this.sparks.spawn(
        point.x, point.y, point.z,
        Math.cos(a) * sp,
        up + 1,
        Math.sin(a) * sp,
        c,
        0.055 + Math.random() * 0.07,
        0.35 + Math.random() * 0.6,
        -0.02,
        1,
        0.9,
      );
    }
  }

  debrisBurst(point, type, count = 5, power = 3.2) {
    for (let i = 0; i < count; i++) {
      this.spawnDebris(
        point.x + (Math.random() - 0.5) * 0.55,
        point.y + (Math.random() - 0.5) * 0.55,
        point.z + (Math.random() - 0.5) * 0.55,
        type,
        0.13 + Math.random() * 0.26,
        (Math.random() - 0.5) * power,
        Math.random() * power * 0.55 + 1,
        (Math.random() - 0.5) * power,
      );
    }
  }

  spawnDebris(x, y, z, type, size, vx, vy, vz) {
    if (this.debris.length >= DEBRIS_MAX) this.removeDebris(0);
    const mesh = new THREE.Mesh(this.debrisGeo, this.debrisMaterials[type] || this.debrisMaterials.concrete);
    mesh.scale.setScalar(size);
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const volume = size * size * size;
    const body = this.physics.createDebrisBody({ x, y, z }, size, Math.max(0.6, volume * 14));
    body.velocity.set(vx, vy, vz);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
    );
    body.userData = { debris: true };

    this.debris.push({ mesh, body, life: 10 + Math.random() * 6, size, fading: 0 });
  }

  removeDebris(index) {
    const d = this.debris[index];
    if (!d) return;
    this.scene.remove(d.mesh);
    this.physics.world.removeBody(d.body);
    this.debris.splice(index, 1);
  }

  explosion(point, radius = 6) {
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), flashMat);
    flash.position.copy(point);
    flash.scale.setScalar(0.6);
    this.scene.add(flash);
    this.flashes.push({ mesh: flash, life: 0.32, maxLife: 0.32, radius: radius * 0.58, kind: 'flash' });

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb36a,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 42), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(point);
    ring.position.y = Math.max(0.12, point.y + 0.05);
    ring.scale.setScalar(1);
    this.scene.add(ring);
    this.flashes.push({ mesh: ring, life: 0.5, maxLife: 0.5, radius: radius * 1.35, kind: 'ring' });

    const light = new THREE.PointLight(0xff9a48, 220, radius * 4.2, 1.8);
    light.position.copy(point);
    light.position.y += 0.5;
    this.scene.add(light);
    this.lights.push({ light, life: 0.38, maxLife: 0.38, base: 220 });

    this.smoke(point, 26, 7, 2.9, 0x6f665b);
    this.dustBurst(point, 0xb8ab98, 40, 7, 0.85, 0.24);
    this.sparkBurst(point, 46, 16, 0xffc56b);
    this.shake = Math.min(1.7, this.shake + 0.9);
  }

  impact(point, normal, type) {
    const n = normal || { x: 0, y: 1, z: 0 };
    this.dustBurst(point, type === 'brick' ? 0xb58a6f : 0xb9b3a7, 7, 1.6, 0.4, 0.4);
    if (type === 'steel') this.sparkBurst(point, 9, 5, 0xffc56b);
    if (type === 'glass') this.sparkBurst(point, 14, 4, 0xd8fbff);
    this.shake = Math.min(1.7, this.shake + 0.08);
  }

  blocker(point) {
    this.dustBurst(point, 0xb9b3a7, 4, 1, 0.3, 0.3);
  }

  update(dt) {
    this.dust.update(dt);
    this.sparks.update(dt);

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      const p = d.body.position;
      d.mesh.position.set(p.x, p.y, p.z);
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
      if (d.life < 1.5) {
        const s = d.size * Math.max(0.001, d.life / 1.5);
        d.mesh.scale.setScalar(s);
      }
      if (d.life <= 0 || p.y < -12) this.removeDebris(i);
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = 1 - f.life / f.maxLife;
      if (f.kind === 'flash') {
        f.mesh.scale.setScalar(0.6 + f.radius * Math.min(1, t * 3.4));
        f.mesh.material.opacity = Math.max(0, 1 - t) * 0.95;
      } else {
        f.mesh.scale.setScalar(1 + f.radius * t * 1.8);
        f.mesh.material.opacity = Math.max(0, (1 - t) * 0.7);
      }
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      l.light.intensity = l.base * Math.max(0, l.life / l.maxLife);
      if (l.life <= 0) {
        this.scene.remove(l.light);
        l.light.dispose();
        this.lights.splice(i, 1);
      }
    }

    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.motes) this.motes.rotation.y += dt * 0.004;
  }

  clearDebris() {
    while (this.debris.length) this.removeDebris(0);
  }
}
