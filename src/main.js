import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createPhysics } from './physics.js';
import { createBlockTextures } from './textures.js';
import { Effects } from './effects.js';
import { SoundLab } from './audio.js';
import { SandboxWorld } from './world.js';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { Tools } from './tools.js';
import { UI, TOOL_DEFS } from './ui.js';

const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function boot() {
  const ui = new UI();
  ui.setLoader(0.06, 'BOOTING DEMOLITION RIG…');
  await raf();

  const canvas = document.getElementById('game');
  const isTouch = ui.isTouch;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.35 : 1.7);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.68;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd3ac7d, 0.0066);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.04, 900);
  camera.position.set(9, 5.4, 25);
  scene.add(camera);

  ui.setLoader(0.18, 'RAISING ATMOSPHERE…');
  await raf();

  // ------------------------------------------------------------------- sky
  const sky = new Sky();
  sky.scale.setScalar(18000);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 4.4;
  skyU.rayleigh.value = 2.8;
  skyU.mieCoefficient.value = 0.0042;
  skyU.mieDirectionalG.value = 0.84;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(74),
    THREE.MathUtils.degToRad(48),
  );
  skyU.sunPosition.value.copy(sunDir);
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xbcd6ec, 0x5e4a34, 0.62);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffc890, 4.35);
  sun.position.copy(sunDir).multiplyScalar(95);
  sun.position.z -= 8;
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -52;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 210;
  sun.shadow.bias = -0.00045;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 3, -7);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x7d9cbb, 0.3);
  fill.position.set(-50, 30, 40);
  scene.add(fill);

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.24;
  room.dispose?.();
  pmrem.dispose();

  ui.setLoader(0.3, 'MIXING CONCRETE AND STEEL…');
  await raf();

  const physics = createPhysics();
  const textures = createBlockTextures(Math.min(renderer.capabilities.getMaxAnisotropy(), isTouch ? 4 : 8));
  const effects = new Effects(scene, physics, camera, textures);
  const audio = new SoundLab();

  addClouds(scene, textures.cloud);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures.cloud,
    color: 0xffd2a0,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  sunGlow.position.copy(sunDir).multiplyScalar(240);
  sunGlow.scale.set(95, 60, 1);
  scene.add(sunGlow);

  let player = null;
  let tools = null;

  const world = new SandboxWorld({
    scene,
    physics,
    effects,
    audio,
    textures,
    onCollapse: (structure, bonus) => {
      effects.shake = Math.min(1.8, effects.shake + 1.1);
      ui.toast(`<b>${structure.name}</b> COLLAPSED &nbsp;·&nbsp; +${bonus.toLocaleString()}`, true);
      ui.hitmarker();
      ui.setStatus(`${structure.name} DOWN`);
    },
    onExplosion: (point, radius) => {
      const dist = camera.position.distanceTo(point);
      const strength = Math.max(0, 1 - dist / (radius * 6));
      flash.style.opacity = String(Math.min(0.22, 0.06 + strength * 0.2));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { flash.style.opacity = '0'; }, 90);
    },
  });

  ui.setLoader(0.54, 'INSTALLING STRUCTURAL JOINTS…');
  await raf();
  ui.setupIntegrity(world.structures);
  ui.updateIntegrity(world.structures);

  const viewmodel = new ViewModel(camera, world.materials);
  viewmodel.root.visible = false;

  player = new Player({
    camera,
    physics,
    audio,
    effects,
    domElement: canvas,
    onLockChange: (locked) => {
      if (!started) return;
      if (locked) {
        ui.showPause(false);
        tools.setEnabled(true);
        player.enabled = true;
      } else if (!player.mobile) {
        ui.showPause(true);
        tools.setEnabled(false);
        player.enabled = false;
      }
    },
    onJump: () => { effects.shake = Math.min(1.7, effects.shake + 0.03); },
  });
  if (isTouch) {
    player.setMobile(true);
    ui.showTouchControls(true);
  }

  tools = new Tools({ camera, world, physics, player, effects, audio, ui, viewmodel });

  ui.setLoader(0.74, 'PLACING EXPLOSIVES…');
  await raf();

  // ------------------------------------------------------------ postprocess
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    isTouch ? 0.28 : 0.4,
    0.55,
    0.9,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = (col - 0.5) * 1.075 + 0.5;
        col = mix(vec3(l), col, 1.13);
        col += vec3(0.018, 0.006, -0.012) * smoothstep(0.42, 1.0, l);
        col += vec3(-0.008, 0.0, 0.014) * (1.0 - smoothstep(0.0, 0.5, l));
        vec2 d = vUv - 0.5;
        col *= 1.0 - dot(d, d) * 0.34;
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        col += (grain - 0.5) * 0.012;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  }));

  const flash = document.getElementById('flash');
  let flashTimer = null;

  // ------------------------------------------------------------------ input
  let started = false;
  let paused = false;
  let cinematicTime = 0;
  let fps = 60;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let hudTimer = 0;
  let speed = 0;
  let allCollapsed = false;

  const clock = new THREE.Clock();

  async function startGame() {
    try { await audio.init(); } catch (err) { console.warn('Audio unavailable', err); }
    audio.ui();
    started = true;
    paused = false;
    document.body.classList.remove('prestart');
    ui.showStart(false);
    ui.showPause(false);
    viewmodel.root.visible = true;
    player.started = true;
    player.enabled = true;
    tools.setEnabled(true);
    player.requestLock();
    ui.setStatus(TOOL_DEFS[tools.slot].type === 'build' ? `BUILD / ${TOOL_DEFS[tools.slot].name}` : 'DEMOLITION READY');
    ui.toast('SANDBOX LIVE &nbsp;·&nbsp; BUILD, BREAK, COLLAPSE');
    player.update(0.016);
  }

  function resumeGame() {
    audio.ui();
    ui.showPause(false);
    paused = false;
    player.requestLock();
    player.enabled = true;
    tools.setEnabled(true);
  }

  function resetWorld() {
    if (!started) return;
    allCollapsed = false;
    tools.clearProjectiles();
    world.rebuild();
    player.respawn();
    ui.setupIntegrity(world.structures);
    ui.updateIntegrity(world.structures);
    ui.setStats({ destroyed: 0, score: 0 });
    ui.toast('DEMOLITION SITE REBUILT');
    ui.setStatus('SANDBOX RESET');
    effects.clearDebris();
    effects.shake = 0;
    audio.ui();
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', resumeGame);

  document.addEventListener('pointerlockerror', () => {
    if (!started) return;
    ui.toast('MOUSE CAPTURE BLOCKED — CLICK THE VIEW', true);
  });

  window.addEventListener('keydown', (e) => {
    if (!started || e.repeat) return;
    if (e.code === 'KeyR') {
      resetWorld();
    } else if (e.code === 'KeyH') {
      ui.toast('WASD MOVE · LMB USE · RMB RECYCLE · 1–7 TOOLS · R REBUILD');
    }
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  });

  document.getElementById('m-jump').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (started) player.queueJump();
  });
  document.getElementById('m-reset').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resetWorld();
  });

  // mobile joystick + look drag
  const joy = ui.el.joy;
  const knob = ui.el.joyKnob;
  let joyId = null;
  let joyCenter = { x: 0, y: 0 };
  const joyRadius = 42;

  joy.addEventListener('pointerdown', (e) => {
    if (!started) return;
    e.preventDefault();
    e.stopPropagation();
    joyId = e.pointerId;
    const r = joy.getBoundingClientRect();
    joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joy.setPointerCapture(e.pointerId);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    e.preventDefault();
    let dx = e.clientX - joyCenter.x;
    let dy = e.clientY - joyCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > joyRadius) {
      dx = (dx / len) * joyRadius;
      dy = (dy / len) * joyRadius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    player.setMoveInput(dx / joyRadius, dy / joyRadius);
  });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    knob.style.transform = '';
    player.setMoveInput(0, 0);
  };
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);

  let lookId = null;
  let lastLook = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (!started || e.pointerType !== 'touch') return;
    lookId = e.pointerId;
    lastLook = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lastLook.x;
    const dy = e.clientY - lastLook.y;
    lastLook = { x: e.clientX, y: e.clientY };
    player.look(dx * 1.7, dy * 1.7);
  });
  const endLook = (e) => {
    if (e.pointerId === lookId) lookId = null;
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  // ------------------------------------------------------------------ render
  ui.setLoader(0.9, 'CALIBRATING GRAVITY…');
  await raf();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum > 0.5) {
      fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
    }

    if (!started) {
      cinematicTime += dt;
      const t = cinematicTime;
      const angle = Math.sin(t * 0.055) * 0.32;
      camera.position.set(Math.sin(angle) * 10 + 2, 5.6 + Math.sin(t * 0.11) * 0.45, 27);
      camera.lookAt(-14, 4.2, -9);
      camera.rotation.z = Math.sin(t * 0.04) * 0.008;
    } else if (!paused) {
      world.update(dt);
      player.update(dt);
      physics.world.step(1 / 60, dt, 4);
      effects.update(dt);
      tools.update(dt);
      speed = Math.hypot(player.body.velocity.x, player.body.velocity.z);
      viewmodel.update(dt, speed);

      hudTimer += dt;
      if (hudTimer > 0.12) {
        hudTimer = 0;
        ui.setStats({ destroyed: world.destroyed, score: world.score, fps });
        ui.updateIntegrity(world.structures);
        ui.setDynamic(world.dynamicCount);
        ui.setStatus(tools.lastCrosshair === 'valid' ? 'PLACEMENT VALID' : TOOL_DEFS[tools.slot].type === 'build' ? `BUILD / ${TOOL_DEFS[tools.slot].name}` : speed > 0.4 ? 'ON THE MOVE' : 'DEMOLITION READY');
        if (!allCollapsed && world.structures.length && world.structures.every((s) => s.collapsed)) {
          allCollapsed = true;
          world.score += 5000;
          audio.score();
          effects.shake = Math.min(1.8, effects.shake + 0.9);
          ui.toast('<b>SITE CLEARED</b> &nbsp;·&nbsp; ALL STRUCTURES DOWN &nbsp;·&nbsp; +5,000');
          ui.setStatus('SITE CLEARED');
        }
      }
    } else {
      speed = 0;
      viewmodel.update(dt, 0);
    }

    composer.render();
  }

  composer.render();
  ui.showLoader(false);
  ui.setLoader(1, 'READY');
  animate();

  // debug/testing handle
  window.COLLAPSE = {
    scene,
    camera,
    renderer,
    composer,
    world,
    physics,
    effects,
    player,
    tools,
    ui,
    viewmodel,
    startGame,
    resetWorld,
    get started() { return started; },
    setPaused(value) {
      paused = value;
      if (value) {
        ui.showPause(true);
        tools.setEnabled(false);
        player.enabled = false;
      } else {
        resumeGame();
      }
    },
    teleport(x, y, z) {
      player.body.position.set(x, y, z);
      player.body.velocity.set(0, 0, 0);
    },
    look(yaw, pitch) {
      player.yaw = yaw;
      player.pitch = pitch;
    },
    fireRocket() {
      tools.enabled = true;
      tools.slot = 6;
      tools.doRocket();
      tools.slot = 0;
    },
    blast(x, y, z, radius = 6.5) {
      return world.blast(new THREE.Vector3(x, y, z), radius, { coreScale: 0.4, power: 9 });
    },
    stats() {
      return {
        blocks: world.blocks.size,
        destroyed: world.destroyed,
        dynamic: world.dynamicCount,
        score: world.score,
        structures: world.structures.map((s) => ({
          name: s.name, total: s.total, integrity: s.integrity, collapsed: s.collapsed,
        })),
      };
    },
  };
}

function addClouds(scene, texture) {
  const rng = (() => {
    let s = 919;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  })();
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2 + rng() * 0.4;
    const radius = 95 + rng() * 90;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      color: rng() > 0.7 ? 0xd7d0c6 : 0xffe3c8,
      transparent: true,
      opacity: 0.12 + rng() * 0.14,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const cloud = new THREE.Sprite(mat);
    cloud.position.set(Math.cos(angle) * radius, 38 + rng() * 44, Math.sin(angle) * radius - 10);
    cloud.scale.set(46 + rng() * 56, 16 + rng() * 22, 1);
    cloud.material.rotation = (rng() - 0.5) * 0.5;
    scene.add(cloud);
  }
}

boot().catch((err) => {
  console.error(err);
  const text = document.getElementById('loader-text');
  if (text) text.textContent = `FAILED TO START: ${err.message}`;
  const fill = document.getElementById('loader-fill');
  if (fill) fill.style.background = '#ff4c3b';
});
