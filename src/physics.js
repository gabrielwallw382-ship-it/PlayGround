import * as CANNON from 'cannon-es';

export function createPhysics() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 14;
  world.solver.tolerance = 0.001;
  world.defaultContactMaterial.friction = 0.55;
  world.defaultContactMaterial.restitution = 0.02;
  world.defaultContactMaterial.contactEquationStiffness = 1e8;
  world.defaultContactMaterial.contactEquationRelaxation = 3;

  const blockMat = new CANNON.Material('block');
  const groundMat = new CANNON.Material('ground');
  const playerMat = new CANNON.Material('player');
  const debrisMat = new CANNON.Material('debris');

  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, blockMat, {
    friction: 0.72, restitution: 0.02, contactEquationStiffness: 1e8, contactEquationRelaxation: 3,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, groundMat, {
    friction: 0.85, restitution: 0.02,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, playerMat, {
    friction: 0.0, restitution: 0.0,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, playerMat, {
    friction: 0.0, restitution: 0.0,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(debrisMat, blockMat, {
    friction: 0.55, restitution: 0.18,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(debrisMat, groundMat, {
    friction: 0.7, restitution: 0.26,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(debrisMat, debrisMat, {
    friction: 0.4, restitution: 0.3,
  }));

  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    mass: 0,
    material: groundMat,
    shape: new CANNON.Plane(),
    collisionFilterGroup: 1,
    collisionFilterMask: -1,
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.userData = { ground: true };
  world.addBody(groundBody);

  function createBlockBody(block, position) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      mass: 0,
      material: blockMat,
      shape: new CANNON.Box(new CANNON.Vec3(0.4925, 0.4925, 0.4925)),
      position: new CANNON.Vec3(position.x, position.y, position.z),
      allowSleep: true,
      sleepSpeedLimit: 0.32,
      sleepTimeLimit: 0.8,
      linearDamping: 0.01,
      angularDamping: 0.02,
      collisionFilterGroup: 1,
      collisionFilterMask: -1,
    });
    body.userData = { block };
    block.body = body;
    world.addBody(body);
    return body;
  }

  function createPlayerBody() {
    const body = new CANNON.Body({
      mass: 82,
      material: playerMat,
      shape: new CANNON.Box(new CANNON.Vec3(0.31, 0.86, 0.31)),
      position: new CANNON.Vec3(0, 2.2, 12),
      fixedRotation: true,
      linearDamping: 0,
      angularDamping: 0.9,
      allowSleep: false,
      collisionFilterGroup: 2,
      collisionFilterMask: -1,
    });
    body.updateMassProperties();
    world.addBody(body);
    return body;
  }

  function createDebrisBody(position, size, mass, material = debrisMat) {
    const body = new CANNON.Body({
      mass,
      material,
      shape: new CANNON.Box(new CANNON.Vec3(size * 0.5, size * 0.5, size * 0.5)),
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.03,
      angularDamping: 0.09,
      allowSleep: true,
      sleepSpeedLimit: 0.25,
      sleepTimeLimit: 1.2,
      collisionFilterGroup: 4,
      collisionFilterMask: -1,
    });
    world.addBody(body);
    return body;
  }

  function raycast(from, to, options = {}) {
    const result = new CANNON.RaycastResult();
    world.raycastClosest(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z),
      { skipBackfaces: false, ...options },
      result,
    );
    if (!result.hasHit) return null;
    return {
      body: result.body,
      point: result.hitPointWorld.clone(),
      normal: result.hitNormalWorld.clone(),
      distance: result.distance,
    };
  }

  return {
    world,
    groundBody,
    materials: { blockMat, groundMat, playerMat, debrisMat },
    createBlockBody,
    createPlayerBody,
    createDebrisBody,
    raycast,
  };
}
