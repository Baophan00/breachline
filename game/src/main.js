// Breachline boots here: renderer, world, the ten actors of a match, and the loop that ties the
// round clock to the bots, the player and the HUD. `?shot=` renders a deterministic frame for a
// screenshot and sets window.__shotReady when it is on screen.
import * as THREE from 'three';
import { ROUND, PLAYER, WEAPONS, ECONOMY } from './config.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createActor, placeActor } from './actor.js';
import { createCombat } from './combat.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createRound } from './round.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createViewmodel } from './viewmodel.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') ?? 1);

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 220);

const world = createWorld(scene);
const nav = createNav(world.colliders);
const audio = createAudio();

const playerActor = createActor({ id: 'player', name: 'Rook', team: 't', isPlayer: true, x: 0, z: 25, yaw: Math.PI });
scene.add(playerActor.mesh);
playerActor.mesh.visible = false;

let actors = [playerActor];

const combat = createCombat({
  scene,
  world,
  onDamage(victim, shooter, amount, part) {
    if (victim.isPlayer) {
      hud.flashDamage(amount);
      controller.damageShake(amount);
    }
  },
  onKill(victim, shooter, weapon, part) {
    round.onKill(victim, shooter, weapon, part);
    if (shooter?.isPlayer) audio.play('killed');
  },
});

const hud = createHud({
  nav,
  world,
  onBuy(item) { buyForPlayer(item); },
});

const viewmodel = createViewmodel({ camera, scene });
const controller = createPlayer({
  camera, combat, audio, hud,
  onShot: (def) => viewmodel.fire(def.type === 'shotgun' ? 1.7 : def.type === 'rifle' ? 1.1 : 0.9),
  onReload: (def) => viewmodel.startReload(def),
  onSwitch: (def) => viewmodel.mount(def.type),
});
hud.setWeapon(WEAPONS.sidearm);
const bots = createBots({ scene, nav, combat, world, audio });
actors = [playerActor, ...bots.bots];

for (const bot of bots.bots) scene.add(bot.mesh);

const round = createRound({ world, scene, actors, hud, audio, combat, player: controller });

// --- buying -------------------------------------------------------------------------------
function grantWeapon(id) {
  playerActor.ownedWeapons = playerActor.ownedWeapons ?? new Set(['sidearm']);
  playerActor.ownedWeapons.add(id);
  controller.resetWeapon(id);
}

function buyForPlayer(item) {
  if (round.state.phase !== 'buy') return;
  if (playerActor.money < item.price) return;
  if (item.kind === 'weapon') {
    if (playerActor.ownedWeapons?.has(item.id) && controller.weapon.id === item.id) return;
    playerActor.money -= item.price;
    grantWeapon(item.id);
  } else if (item.kind === 'armor') {
    if (item.id === 'helmet') {
      if (playerActor.helmet) return;
      playerActor.money -= item.price;
      playerActor.helmet = true;
      playerActor.armor = 100;
    } else {
      if (playerActor.armor >= 100) return;
      playerActor.money -= item.price;
      playerActor.armor = 100;
    }
  } else if (item.kind === 'ammo') {
    playerActor.money -= item.price;
    controller.addAmmo();
  }
  audio.play('buy');
  hud.refreshBuy(playerActor);
}

// --- input ---------------------------------------------------------------------------------
const input = createInput({
  canvas: renderer.domElement,
  onKey(code, { first }) {
    // the controller keeps its own key set: the input module feeds it, and the HUD keys stay here
    if (first) controller.keys.add(code);
    else controller.keys.delete(code);
    if (!first) return;
    if (code === 'KeyR') controller.startReload(playerActor);
    if (code === 'Digit1') controller.switchWeapon(playerActor, 1);
    if (code === 'Digit2') controller.switchWeapon(playerActor, 2);
    if (code === 'Digit3') controller.switchWeapon(playerActor, 3);
    if (code === 'KeyB') toggleBuy();
    if (code === 'Tab') hud.setScoreboardOpen(true, actors);
  },
  onMouseMove(dx, dy) {
    if (state.paused) return;
    controller.onMouseMove(dx, dy);
  },
  onMouseDown() {
    if (state.paused) return;
    controller.setMouseDown(true);
    controller.pressed.add('Mouse0');
  },
  onMouseUp() {
    controller.setMouseDown(false);
  },
  onLockChange(locked) {
    if (!locked && state.running && !state.paused) pause();
  },
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Tab') hud.setScoreboardOpen(false, actors);
});

function toggleBuy() {
  if (round.state.phase !== 'buy') return;
  const open = !hud.getBuyOpen();
  hud.setBuyOpen(open, playerActor, round.state.timer);
  if (open) input.exitLock(); else input.requestLock();
}

// --- match states ---------------------------------------------------------------------------
const state = { running: false, paused: false, over: false, time: 0 };

function startMatch() {
  document.getElementById('overlay').hidden = true;
  state.running = true;
  state.paused = false;
  state.over = false;
  controller.resetWeapon('sidearm');
  playerActor.ownedWeapons = new Set(['sidearm']);
  playerActor.armor = 0;
  playerActor.helmet = false;
  playerActor.money = ECONOMY.start;
  placeActor(playerActor, world.spawns.t[1]);
  round.startMatch();
  hud.setTeamText('raiders · you are Rook');
  audio.resume();
  input.requestLock();
  hud.setBuyOpen(true, playerActor, ROUND.buySeconds);
}

function pause() {
  state.paused = true;
  input.exitLock();
  const overlay = document.getElementById('overlay');
  overlay.hidden = false;
  const title = overlay.querySelector('h1');
  const copy = overlay.querySelector('p');
  const button = document.getElementById('play');
  title.innerHTML = 'Paused';
  copy.textContent = 'Click to lock the mouse and go back to the round.';
  button.textContent = 'Resume';
  button.onclick = () => {
    overlay.hidden = true;
    state.paused = false;
    input.requestLock();
  };
}

document.getElementById('play').addEventListener('click', () => {
  if (state.paused) return;
  if (state.over) {
    location.reload();
    return;
  }
  startMatch();
});

// --- loop -----------------------------------------------------------------------------------
let last = performance.now();
const fixed = 1 / 60;

function step(dt) {
  const now = performance.now() / 1000;
  audio.setListener(playerActor.x, playerActor.z);
  round.update(dt);
  bots.update(dt, { actors, round, player: playerActor });
  controller.update(dt, playerActor, actors, world.colliders, state.running && !state.paused && !state.over);

  // plant and defuse on E
  if (state.running && playerActor.alive && !state.paused) {
    const holding = input.keys.has('KeyE');
    if (holding && round.canPlant(playerActor)) {
      round.beginPlant(playerActor, dt);
    } else if (holding && round.bombPlanted && playerActor.team === 'ct' && round.inSite(playerActor)) {
      round.beginDefuse(playerActor, dt);
    } else if (holding && playerActor.team === 'ct' && round.bombPlanted) {
      const d = Math.hypot(playerActor.x - round.bomb.x, playerActor.z - round.bomb.z);
      if (d < 2.2) round.beginDefuse(playerActor, dt);
    }
  }

  if (!playerActor.alive && state.running && !state.over) {
    // a dead player watches the rest of the round from above
    camera.position.y = Math.max(camera.position.y, 8);
    camera.lookAt(0, 0, 0);
  }

  viewmodel.update(dt, {
    moving: controller.state.moving,
    crouch: playerActor.crouch,
    pitch: controller.state.pitch,
    alive: playerActor.alive && state.running && !state.paused && !hud.getBuyOpen(),
  });
  hud.update(dt, actors, playerActor);
  playerActor.mag = controller.weapon.mag;
  hud.setVitals(playerActor);
  hud.setAmmo(controller.weapon.mag, controller.weapon.reserve, controller.weapon.reload > 0);
  combat.updateEffects(dt);
  if (hud.getBuyOpen()) hud.nodes.buytimer.textContent = String(Math.max(0, Math.ceil(round.state.timer)));
  if (state.running && !state.paused && round.state.phase === 'live' && hud.getBuyOpen()) {
    hud.setBuyOpen(false, playerActor, 0);
    input.requestLock();
  }
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  state.time += dt;
  if (state.running && !state.paused) step(dt);
  else if (!state.running) {
    // menu: let the camera drift over the map so the title screen is alive
    camera.position.set(Math.sin(state.time * 0.12) * 16, 12 + Math.sin(state.time * 0.2) * 1.2, 24 + Math.cos(state.time * 0.12) * 8);
    camera.lookAt(0, 1, 0);
    combat.updateEffects(dt);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- deterministic screenshot frames ----------------------------------------------------------
function runShot(kind) {
  document.getElementById('overlay').hidden = true;
  document.getElementById('buy').hidden = true;
  state.running = true;

  // a small deterministic rng so a seed always frames the same fight
  let s = seed * 9301 + 49297;
  Math.random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  round.startMatch();
  if (kind === 'menu') {
    document.getElementById('overlay').hidden = false;
    document.getElementById('hud').style.display = 'none';
    state.running = false;
  }

  if (kind === 'play' || kind === 'end' || kind === 'plant') {
    playerActor.ownedWeapons = new Set(['sidearm', 'rifle']);
    playerActor.armor = 100;
    playerActor.helmet = true;
    controller.resetWeapon('rifle');
    playerActor.money = 4250;

    // burn the round clock so the bots are out of spawn and mid is contested
    const frames = kind === 'play' ? 60 * 16 : 60 * 22;
    for (let i = 0; i < frames; i += 1) step(fixed);

    if (kind === 'plant' || kind === 'end') {
      round.placeBomb(world.sites.a.x - 1.2, world.sites.a.z + 1.4);
      round.state.timer = 26;
      hud.bombPlanted(true);
    }
    if (kind === 'end') {
      round.state.score.t = 6;
      round.state.score.ct = 4;
      hud.roundOver('t', 'wardens eliminated', round.state);
    }

    // stand where the round is actually being fought: pick the enemy nearest the middle of the
    // map, back off along a clear line, and face it
    if (kind === 'play') {
      const enemies = actors.filter((a) => a.alive && a.team !== playerActor.team);
      const target = enemies.sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0] ?? { x: 0, z: 0 };
      const candidates = [
        { x: target.x, z: target.z + 7.5 },
        { x: target.x + 7.5, z: target.z },
        { x: target.x, z: target.z - 7.5 },
        { x: target.x - 7.5, z: target.z },
      ];
      const spot = candidates.find((c) => {
        const blocked = world.colliders.some((b) => c.x + 0.6 > b.minX && c.x - 0.6 < b.maxX && c.z + 0.6 > b.minZ && c.z - 0.6 < b.maxZ);
        return !blocked && nav.clearLine(c.x, c.z, target.x, target.z);
      }) ?? candidates[0];
      playerActor.x = spot.x;
      playerActor.z = spot.z;
      controller.state.yaw = Math.atan2(-(target.x - spot.x), -(target.z - spot.z));
      playerActor.targetBot = target;
    } else {
      // inside site A, a couple of metres off the charge, looking down at it
      playerActor.x = 19.6;
      playerActor.z = 9.4;
      controller.state.yaw = 0.12;
      controller.state.pitch = -0.16;

      // a warden working the defuse, so the frame shows the objective under pressure
      const warden = actors.find((a) => a.team === 'ct' && a.alive);
      if (warden) {
        warden.x = world.sites.a.x - 1.2;
        warden.z = world.sites.a.z + 2.6;
        warden.y = 0;
        warden.crouch = true;
        warden.yaw = Math.atan2(-1.2, 2.0);
        warden.pitch = -0.5;
        warden.mesh.visible = true;
        warden.mesh.position.set(warden.x, -0.34, warden.z);
        warden.mesh.rotation.y = warden.yaw;
      }
    }
    if (kind === 'play') controller.state.pitch = -0.02;
    playerActor.alive = true;
    playerActor.health = 92;
    playerActor.yaw = controller.state.yaw;
    playerActor.pitch = controller.state.pitch;
    controller.update(fixed, playerActor, actors, world.colliders, false);
    viewmodel.mount('rifle');
    viewmodel.update(fixed, { moving: 0.2, crouch: false, pitch: controller.state.pitch, alive: true });
    hud.setWeapon(WEAPONS.rifle);

    // fire once at the target so the frame holds a real tracer and muzzle flash
    if (kind === 'play' && playerActor.targetBot) {
      scene.updateMatrixWorld(true);
      const enemy = playerActor.targetBot;
      controller.state.pitch = Math.atan2(1.42 - 1.62, Math.hypot(enemy.x - playerActor.x, enemy.z - playerActor.z));
      playerActor.pitch = controller.state.pitch;
      playerActor.yaw = controller.state.yaw;
      controller.shoot(playerActor, actors, performance.now() / 1000, 0.001);
      viewmodel.fire(1);
      viewmodel.update(0.008, { moving: 0.2, crouch: false, pitch: controller.state.pitch, alive: true });
    }
    hud.setAmmo(controller.weapon.mag, controller.weapon.reserve, false);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
}

window.__dbg = { camera, scene, world, player: playerActor, round, bots, controller, renderer, viewmodel, startMatch, step, actors, hud, input };

if (shotMode) {
  runShot(shotMode);
} else {
  animate();
  window.__breachlineReady = true;
}
