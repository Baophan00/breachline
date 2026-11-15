// Actors are the player and the bots: one humanoid mesh of three hit parts, a physics body
// that slides along the map's boxes, and the health, armour and money every round resets.
import * as THREE from 'three';

const PART_MATERIALS = {
  t: { cloth: 0x8a4a34, trim: 0xd8603a, skin: 0xc9a184 },
  ct: { cloth: 0x2f4a68, trim: 0x5f9ee0, skin: 0xc9a184 },
};

// geometry is shared between actors; only transforms and materials vary
const GEO = {
  torso: new THREE.BoxGeometry(0.56, 0.74, 0.32),
  hip: new THREE.BoxGeometry(0.5, 0.2, 0.3),
  head: new THREE.BoxGeometry(0.26, 0.28, 0.26),
  leg: new THREE.BoxGeometry(0.2, 0.78, 0.24),
  arm: new THREE.BoxGeometry(0.16, 0.6, 0.18),
  vest: new THREE.BoxGeometry(0.58, 0.5, 0.36),
  pack: new THREE.BoxGeometry(0.34, 0.4, 0.2),
};

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...extra });
}

export function buildActorMesh(team) {
  const skin = PART_MATERIALS[team];
  const root = new THREE.Group();

  const torso = new THREE.Mesh(GEO.torso, material(skin.cloth));
  torso.position.y = 0.74 + 0.37;
  torso.castShadow = true;
  torso.userData.part = 'chest';
  root.add(torso);

  const hip = new THREE.Mesh(GEO.hip, material(skin.cloth));
  hip.position.y = 0.66;
  hip.castShadow = true;
  hip.userData.part = 'stomach';
  root.add(hip);

  const head = new THREE.Mesh(GEO.head, material(skin.skin));
  head.position.y = 1.52;
  head.castShadow = true;
  head.userData.part = 'head';
  root.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), material(skin.trim, { roughness: 0.55 }));
  helmet.position.y = 1.585;
  helmet.castShadow = true;
  helmet.userData.part = 'head';
  root.add(helmet);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(GEO.leg, material(0x2b3038));
    leg.position.set(side * 0.14, 0.39, 0);
    leg.castShadow = true;
    leg.userData.part = 'legs';
    root.add(leg);

    const arm = new THREE.Mesh(GEO.arm, material(skin.cloth));
    arm.position.set(side * 0.36, 1.06, 0.02);
    arm.castShadow = true;
    arm.userData.part = 'chest';
    root.add(arm);
  }

  const vest = new THREE.Mesh(GEO.vest, material(0x232830, { roughness: 0.7 }));
  vest.position.set(0, 1.06, 0.01);
  vest.userData.part = 'chest';
  root.add(vest);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.14), material(0x2b3036, { roughness: 0.8 }));
  pack.position.set(0, 1.08, -0.21);
  pack.userData.part = 'chest';
  root.add(pack);

  // shoulder pads and boots break up the silhouette so a bot does not read as one box
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), material(skin.trim, { roughness: 0.7 }));
    pad.position.set(side * 0.26, 1.38, 0);
    pad.castShadow = true;
    pad.userData.part = 'chest';
    root.add(pad);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), material(0x14171a, { roughness: 0.9 }));
    boot.position.set(side * 0.14, 0.06, 0.03);
    boot.userData.part = 'legs';
    root.add(boot);
  }

  // the gun is a stubby box held out front; it rotates with aim pitch a little
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), material(0x14181c, { metalness: 0.5, roughness: 0.4 }));
  barrel.position.z = 0.28;
  gun.add(barrel);
  gun.position.set(0.2, 1.16, 0.24);
  root.add(gun);

  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ color: skin.trim, transparent: true, opacity: 0.9 }));
  tag.scale.set(0.18, 0.18, 1);
  tag.position.set(0, 1.92, 0);
  tag.visible = false;
  tag.raycast = () => {}; // sprites need a camera to raycast, and this one is decoration only
  root.add(tag);

  return { root, head, torso, gun, tag };
}

export function createActor(cfg) {
  const mesh = buildActorMesh(cfg.team);
  const actor = {
    id: cfg.id,
    name: cfg.name,
    team: cfg.team,
    isBot: !!cfg.isBot,
    isPlayer: !!cfg.isPlayer,
    mesh: mesh.root,
    parts: mesh,
    x: cfg.x ?? 0,
    z: cfg.z ?? 0,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: cfg.yaw ?? 0,
    pitch: 0,
    crouch: false,
    onGround: true,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
    money: 800,
    kills: 0,
    deaths: 0,
    weaponId: 'sidearm',
    weapons: { sidearm: { mag: 12, reserve: 48 } },
    fireCooldown: 0,
    reloadTimer: 0,
    spotted: null,
    lastDamageAt: -99,
    spawnGrace: 0,
    deathsThisRound: 0,
  };
  actor.mesh.position.set(actor.x, 0, actor.z);
  return actor;
}

export function setActorWeapon(actor, id) {
  actor.weaponId = id;
  actor.reloadTimer = 0;
  actor.fireCooldown = 0;
}

export function actorEye(actor) {
  return { x: actor.x, y: actor.crouch ? 1.08 : 1.62, z: actor.z };
}

export function placeActor(actor, spawn) {
  actor.x = spawn.x;
  actor.z = spawn.z;
  actor.y = 0;
  actor.vx = 0;
  actor.vz = 0;
  actor.vy = 0;
  actor.yaw = spawn.yaw;
  actor.pitch = 0;
  actor.crouch = false;
  actor.alive = true;
  actor.health = 100;
  actor.mesh.visible = !actor.isPlayer;
  actor.mesh.position.set(actor.x, 0, actor.z);
  actor.mesh.rotation.set(0, actor.yaw, 0);
}

// slide against every box, one axis at a time, so a corner never traps the body
export function moveActor(actor, wishX, wishZ, dt, colliders, speed) {
  const radius = 0.42;
  const beforeX = actor.x;
  const beforeZ = actor.z;

  actor.x += wishX * speed * dt;
  if (hitsWorld(actor.x, actor.z, radius, colliders)) actor.x = beforeX;

  actor.z += wishZ * speed * dt;
  if (hitsWorld(actor.x, actor.z, radius, colliders)) actor.z = beforeZ;

  const moved = Math.hypot(actor.x - beforeX, actor.z - beforeZ);
  return moved / Math.max(dt, 0.0001);
}

export function hitsWorld(x, z, radius, colliders) {
  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
  }
  return false;
}

export function updateActorMesh(actor, bobTime = 0) {
  actor.mesh.position.set(actor.x, actor.y + (actor.crouch ? -0.34 : 0), actor.z);
  actor.mesh.rotation.y = actor.yaw;
  actor.parts.gun.rotation.x = -actor.pitch * 0.85;
  actor.parts.head.rotation.x = -actor.pitch * 0.5;
  if (actor.alive && bobTime > 0) {
    const bob = Math.sin(bobTime * 9) * 0.035;
    actor.parts.torso.position.y = 0.74 + 0.37 + bob;
  }
}
