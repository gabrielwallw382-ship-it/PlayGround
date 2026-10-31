import * as THREE from 'three';

function metal(color, roughness = 0.42, metalness = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export class ViewModel {
  constructor(camera, blockMaterials) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.set(0, 0, 0);
    camera.add(this.root);
    this.slot = 0;
    this.actionT = 0;
    this.actionDur = 0;
    this.actionKind = null;
    this.time = 0;
    this.blockMaterials = blockMaterials;

    const dark = metal(0x272a2a, 0.5, 0.65);
    const steel = metal(0x8d989d, 0.3, 0.9);
    const orange = new THREE.MeshStandardMaterial({ color: 0xff6a2c, emissive: 0xff4a0a, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2b, roughness: 0.8, metalness: 0.02 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff8a4d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

    // --------------------------------------------------------------- builder
    this.buildGroup = new THREE.Group();
    this.buildGroup.position.set(0.32, -0.3, -0.78);
    this.buildCube = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 0.105), blockMaterials.concrete);
    this.buildCube.castShadow = false;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.109, 0.109, 0.109)),
      new THREE.LineBasicMaterial({ color: 0xff9b5e, transparent: true, opacity: 0.85 }),
    );
    this.buildCube.add(edges);
    this.buildRing = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.0032, 6, 32), glow);
    this.buildRing.rotation.x = Math.PI / 2;
    this.buildRing.position.y = -0.085;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.05), dark);
    grip.position.set(0.02, -0.18, 0.03);
    grip.rotation.z = -0.18;
    const gripBand = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.016, 0.052), orange);
    gripBand.position.copy(grip.position);
    gripBand.position.y -= 0.055;
    gripBand.rotation.z = -0.18;
    this.buildGroup.add(this.buildCube, this.buildRing, grip, gripBand);
    this.root.add(this.buildGroup);

    // ---------------------------------------------------------------- hammer
    this.hammerGroup = new THREE.Group();
    this.hammerGroup.position.set(0.34, -0.44, -0.74);
    this.hammerGroup.rotation.set(-0.12, -0.18, -0.32);
    this.hammerPivot = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.023, 0.62, 10), wood);
    handle.position.y = -0.06;
    const gripWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), dark);
    gripWrap.position.y = -0.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.095, 0.1), steel);
    head.position.y = 0.28;
    head.rotation.z = 0.03;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.105), dark);
    face.position.set(0.12, 0.28, 0);
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.11), orange);
    collar.position.y = 0.21;
    this.hammerPivot.add(handle, gripWrap, head, face, collar);
    this.hammerGroup.add(this.hammerPivot);
    this.root.add(this.hammerGroup);

    // ----------------------------------------------------------------- rocket
    this.rocketGroup = new THREE.Group();
    this.rocketGroup.position.set(0.32, -0.32, -0.72);
    this.rocketGroup.rotation.set(0.02, -0.08, -0.03);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.62, 14), metal(0x4b5355, 0.45, 0.7));
    tube.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.09, 14), dark);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = -0.35;
    const muzzleGlow = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), glow);
    muzzleGlow.position.z = -0.398;
    muzzleGlow.rotation.y = Math.PI;
    const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.11, 14), dark);
    rear.rotation.x = Math.PI / 2;
    rear.position.z = 0.3;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.1), dark);
    sight.position.set(0, 0.09, -0.12);
    const sightDot = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.016, 0.02), orange);
    sightDot.position.set(0, 0.118, -0.165);
    const rocketGrip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.07), dark);
    rocketGrip.position.set(0, -0.11, 0.06);
    rocketGrip.rotation.x = -0.25;
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.05), orange);
    trigger.position.set(0, -0.035, 0.02);
    this.rocketGroup.add(tube, muzzle, muzzleGlow, rear, sight, sightDot, rocketGrip, trigger);
    this.root.add(this.rocketGroup);

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });

    const light = new THREE.PointLight(0xffc9a0, 0.85, 1.6, 2);
    light.position.set(0.28, -0.05, -0.45);
    this.root.add(light);

    this.setSlot(0);
  }

  setBuildType(type) {
    const mat = this.blockMaterials[type];
    if (mat) this.buildCube.material = mat;
  }

  setSlot(slot) {
    this.slot = slot;
    this.buildGroup.visible = slot <= 4;
    this.hammerGroup.visible = slot === 5;
    this.rocketGroup.visible = slot === 6;
  }

  action(kind) {
    this.actionKind = kind;
    this.actionT = 0;
    this.actionDur = kind === 'hammer' ? 0.46 : kind === 'rocket' ? 0.34 : 0.16;
  }

  update(dt, speed = 0) {
    this.time += dt;
    const t = this.time;
    const bob = Math.sin(t * (6 + speed * 0.6)) * (0.006 + speed * 0.0012);
    const sway = Math.cos(t * 3.1) * 0.004;
    this.root.position.set(sway, bob, 0);

    if (this.actionDur > 0) {
      this.actionT += dt;
      if (this.actionT >= this.actionDur) {
        this.actionT = 0;
        this.actionDur = 0;
      }
    }
    const p = this.actionDur > 0 ? Math.min(1, this.actionT / this.actionDur) : 0;

    if (this.buildGroup.visible) {
      this.buildCube.rotation.y += dt * 0.55;
      this.buildCube.rotation.x = Math.sin(t * 0.7) * 0.14;
      this.buildCube.position.y = Math.sin(t * 2.2) * 0.008;
      this.buildRing.rotation.z += dt * 0.7;
      const kick = this.actionKind === 'build' && p > 0 ? Math.sin(p * Math.PI) : 0;
      this.buildGroup.position.set(0.32, -0.3 + kick * 0.03, -0.78 + kick * 0.03);
      this.buildRing.material.opacity = 0.35 + Math.sin(t * 2.4) * 0.12 + kick * 0.2;
    }

    if (this.hammerGroup.visible) {
      this.hammerGroup.rotation.x = -0.12 + Math.sin(t * 1.4) * 0.015;
      if (this.actionKind === 'hammer' && p > 0) {
        const swing = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        this.hammerPivot.rotation.x = -swing * 1.75;
        this.hammerPivot.rotation.z = swing * 0.24;
        this.hammerGroup.position.y = -0.44 + swing * 0.07;
      } else {
        this.hammerPivot.rotation.x *= 0.82;
        this.hammerPivot.rotation.z *= 0.82;
        this.hammerGroup.position.y = -0.44;
      }
    }

    if (this.rocketGroup.visible) {
      const recoil = this.actionKind === 'rocket' && p > 0 ? Math.sin(p * Math.PI) : 0;
      this.rocketGroup.position.set(0.32 + sway * 0.2, -0.32 + bob * 0.3, -0.72 + recoil * 0.15);
      this.rocketGroup.rotation.z = -0.03 + Math.sin(t * 1.7) * 0.008;
    }
  }
}
