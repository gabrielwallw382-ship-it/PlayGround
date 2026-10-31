import * as THREE from 'three';

const WALK = 4.9;
const SPRINT = 8.1;
const ACCEL = 13;
const JUMP = 5.4;
const EYE = 0.78;
const SPAWN = new THREE.Vector3(0, 1.2, 14);

export class Player {
  constructor({ camera, physics, audio, effects, domElement, onLockChange, onJump }) {
    this.camera = camera;
    this.physics = physics;
    this.audio = audio;
    this.effects = effects;
    this.domElement = domElement;
    this.onLockChange = onLockChange || (() => {});
    this.onJump = onJump || (() => {});
    this.body = physics.createPlayerBody();
    this.body.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
    this.yaw = 0;
    this.pitch = -0.03;
    this.keys = new Set();
    this.locked = false;
    this.enabled = false;
    this.started = false;
    this.wasGrounded = false;
    this.bob = 0;
    this.stepPhase = 0;
    this.virtual = { x: 0, y: 0 };
    this.jumpQueued = false;
    this.sensitivity = 0.0021;
    this.mobile = false;
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(SPAWN.x, 1.64, SPAWN.z);
    this.tmp = new THREE.Vector3();
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      this.onLockChange(this.locked);
    });
  }

  requestLock() {
    this.started = true;
    this.enabled = true;
    if (this.mobile) {
      this.locked = true;
      this.onLockChange(true);
      return;
    }
    try {
      const p = this.domElement.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          try {
            const fallback = this.domElement.requestPointerLock?.();
            if (fallback && fallback.catch) fallback.catch(() => {});
          } catch { /* pointer lock unavailable */ }
        });
      }
    } catch {
      try { this.domElement.requestPointerLock?.(); } catch { /* pointer lock unavailable */ }
    }
  }

  setMobile(value) {
    this.mobile = value;
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  setMoveInput(x, y) {
    this.virtual.x = x;
    this.virtual.y = y;
  }

  queueJump() {
    this.jumpQueued = true;
  }

  get position() {
    return this.body.position;
  }

  respawn() {
    this.body.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.03;
  }

  update(dt) {
    const body = this.body;
    let forward = 0;
    let right = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;
      forward -= this.virtual.y;
      right += this.virtual.x;
    }
    const len = Math.hypot(forward, right);
    if (len > 1) { forward /= len; right /= len; }

    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = running ? SPRINT : WALK;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (right * cos - forward * sin) * speed;
    const dz = (-right * sin - forward * cos) * speed;

    const accel = 1 - Math.exp(-ACCEL * dt);
    body.velocity.x += (dx - body.velocity.x) * accel;
    body.velocity.z += (dz - body.velocity.z) * accel;

    // ground probe
    const from = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    const to = new THREE.Vector3(body.position.x, body.position.y - 1.02, body.position.z);
    const probe = this.physics.raycast(from, to, { collisionFilterMask: 1 });
    const grounded = !!probe && probe.distance <= 0.98;
    const moving = Math.hypot(body.velocity.x, body.velocity.z) > 0.6;

    if (this.jumpQueued && grounded && this.enabled) {
      body.velocity.y = JUMP;
      this.audio.jump();
      this.onJump();
    }
    this.jumpQueued = false;

    if (!this.wasGrounded && grounded && moving) this.audio.footstep(true);
    if (!this.wasGrounded && grounded && body.velocity.y < -3) this.audio.land();
    this.wasGrounded = grounded;

    if (grounded && moving) {
      this.stepPhase += dt * (running ? 11.5 : 8);
      const step = Math.sin(this.stepPhase);
      if (step > 0.92) this.audio.footstep(running);
      this.bob += dt * (running ? 14 : 9.5);
    } else {
      this.bob += dt * 2;
    }

    if (body.position.y < -14) this.respawn();

    const shake = this.effects.shake;
    const sx = shake * 0.014 * (Math.random() - 0.5);
    const sy = shake * 0.014 * (Math.random() - 0.5);
    const roll = shake * 0.01 * (Math.sin(performance.now() * 0.04) * 0.5 + (Math.random() - 0.5));

    const bobY = grounded && moving ? Math.sin(this.bob) * (running ? 0.055 : 0.035) : 0;
    const bobX = grounded && moving ? Math.cos(this.bob * 0.5) * (running ? 0.03 : 0.018) : 0;
    this.camera.position.set(
      body.position.x + bobX * 0.35,
      body.position.y + EYE + bobY,
      body.position.z,
    );
    this.camera.rotation.set(this.pitch + sx, this.yaw + sy, roll + (moving ? Math.sin(this.bob * 0.5) * 0.0025 : 0));
  }
}
