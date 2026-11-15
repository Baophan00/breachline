// The player: quake-flavoured movement with friction and air control, a camera with view punch,
// and a weapon state machine that keeps the rate of fire, the reload and the spread honest.
import * as THREE from 'three';
import { PLAYER, WEAPONS } from './config.js';
import { moveActor, updateActorMesh } from './actor.js';

export function createPlayer({ camera, combat, audio, hud, onShot, onReload, onSwitch }) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDown = false;
  let bob = 0;
  let shake = 0;
  let viewPunch = { x: 0, y: 0 };
  let weaponState = { id: 'sidearm', mag: WEAPONS.sidearm.mag, reserve: WEAPONS.sidearm.reserve, cooldown: 0, reload: 0 };
  let recoilIndex = 0;
  let lastShotAt = 0;
  let scoped = false;

  const state = {
    yaw: Math.PI,
    pitch: 0,
    moving: 0,
    firing: false,
    reloading: false,
    weaponId: 'sidearm',
  };

  function resetWeapon(id) {
    const def = WEAPONS[id];
    weaponState = { id, mag: def.mag, reserve: def.reserve, cooldown: 0, reload: 0 };
    state.weaponId = id;
    hud?.setWeapon(def);
    onSwitch?.(def);
  }

  function giveWeapon(id, actorMoney) {
    const def = WEAPONS[id];
    if (!def) return false;
    resetWeapon(id);
    return true;
  }

  function addAmmo() {
    for (const w of ['sidearm', 'rifle', 'smg', 'shotgun']) {
      if (weaponState.id === w) {
        weaponState.reserve = WEAPONS[w].reserve;
      }
    }
  }

  function canFire(actor, now) {
    const def = WEAPONS[weaponState.id];
    if (weaponState.reload > 0) return false;
    if (weaponState.mag <= 0) return false;
    if (now < weaponState.cooldown) return false;
    return true;
  }

  function currentSpread(actor) {
    const def = WEAPONS[weaponState.id];
    const speed = Math.hypot(actor.vx, actor.vz);
    const movement = Math.min(1, speed / PLAYER.walkSpeed);
    const crouchFactor = actor.crouch ? 0.6 : 1;
    const airFactor = actor.onGround ? 1 : 2.6;
    return (def.spread + def.moveSpread * movement * airFactor) * crouchFactor;
  }

  function startReload(actor) {
    const def = WEAPONS[weaponState.id];
    if (weaponState.reload > 0 || weaponState.mag === def.mag || weaponState.reserve <= 0) return;
    weaponState.reload = def.reload;
    state.reloading = true;
    audio?.play('reload');
    onReload?.(def);
  }

  function switchWeapon(actor, slot) {
    const wanted = Object.values(WEAPONS).find((w) => w.slot === slot && w.id !== 'knife');
    if (!wanted) return;
    if (wanted.price > 0 && !actor.ownedWeapons?.has(wanted.id)) return;
    if (weaponState.id === wanted.id) return;
    resetWeapon(wanted.id);
  }

  function shoot(actor, actors, now, forcedSpread = null) {
    const def = WEAPONS[weaponState.id];
    if (!canFire(actor, now)) {
      if (weaponState.mag <= 0 && weaponState.reload <= 0) startReload(actor);
      return null;
    }
    weaponState.mag -= 1;
    weaponState.cooldown = now + 60 / def.rpm;
    const spread = forcedSpread ?? currentSpread(actor);

    // recoil climbs a fixed ladder, then recentres: the pattern is learnable, like the games it nods to
    const step = Math.min(recoilIndex, 9);
    const vKick = def.recoil.v * (1 + step * 0.16);
    const hKick = def.recoil.h * Math.sin(recoilIndex * 0.9) * (1 + step * 0.1);
    viewPunch.x += vKick;
    viewPunch.y += hKick;
    actor.pitch = Math.min(PLAYER.maxPitch, actor.pitch + vKick * 0.55);
    actor.yaw += hKick * 0.4;
    recoilIndex += 1;

    const result = combat.fire({ shooter: actor, weapon: def, actors, spread, isPlayer: true });
    audio?.play(def.sound);
    onShot?.(def);
    hud?.muzzle(def);
    if (result?.hit) hud?.hitmarker(result.killed);
    if (weaponState.mag === 0) startReload(actor);
    lastShotAt = now;
    return result;
  }

  function update(dt, actor, actors, colliders, active) {
    const now = performance.now() / 1000;
    weaponState.cooldown = Math.max(0, weaponState.cooldown - dt);
    if (weaponState.reload > 0) {
      weaponState.reload -= dt;
      if (weaponState.reload <= 0) {
        const def = WEAPONS[weaponState.id];
        const need = def.mag - weaponState.mag;
        const take = Math.min(need, weaponState.reserve);
        weaponState.mag += take;
        weaponState.reserve -= take;
        state.reloading = false;
        hud?.setAmmo(weaponState.mag, weaponState.reserve, weaponState.reload > 0);
      }
    }

    // recoil settles back towards the middle when the trigger is released
    if (now - lastShotAt > 0.18) recoilIndex = Math.max(0, recoilIndex - dt * 26);
    viewPunch.x += (0 - viewPunch.x) * Math.min(1, dt * 9);
    viewPunch.y += (0 - viewPunch.y) * Math.min(1, dt * 9);

    if (!actor.alive || !active) {
      state.moving = 0;
      applyCamera(actor);
      return;
    }

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sneak = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');

    actor.crouch = wantCrouch && actor.onGround;
    const def = WEAPONS[weaponState.id];
    const base = actor.crouch ? PLAYER.crouchSpeed : sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    const speedCap = base * def.speedMult;

    const len = Math.hypot(forward, strafe) || 1;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    const wishX = (-sin * forward + cos * strafe) / len;
    const wishZ = (-cos * forward - sin * strafe) / len;
    const wishLength = Math.hypot(forward, strafe) > 0 ? 1 : 0;

    const accel = actor.onGround ? PLAYER.accel : PLAYER.accel * PLAYER.airControl;
    actor.vx += wishX * wishLength * accel * dt;
    actor.vz += wishZ * wishLength * accel * dt;

    if (actor.onGround) {
      const speed = Math.hypot(actor.vx, actor.vz);
      const drop = speed * PLAYER.friction * dt;
      const scale = Math.max(0, (speed - drop) / (speed || 1));
      actor.vx *= scale;
      actor.vz *= scale;
      if (speed > speedCap) {
        const k = speedCap / speed;
        actor.vx *= k;
        actor.vz *= k;
      }
    } else if (Math.hypot(actor.vx, actor.vz) > speedCap * 1.35) {
      const s = Math.hypot(actor.vx, actor.vz);
      const k = (speedCap * 1.35) / s;
      actor.vx *= k;
      actor.vz *= k;
    }

    // jump
    if ((keys.has('Space') || pressed.has('Space')) && actor.onGround) {
      actor.vy = PLAYER.jumpSpeed;
      actor.onGround = false;
    }
    actor.vy -= PLAYER.gravity * dt;
    actor.y += actor.vy * dt;
    if (actor.y <= 0) {
      actor.y = 0;
      actor.vy = 0;
      actor.onGround = true;
    }

    const groundSpeed = moveActor(actor, actor.vx, actor.vz, dt, colliders, 1);
    state.moving = Math.hypot(actor.vx, actor.vz) / PLAYER.walkSpeed;
    if (actor.onGround && state.moving > 0.25) bob += dt * state.moving;

    actor.yaw = state.yaw;
    actor.pitch = state.pitch;
    updateActorMesh(actor, bob);

    applyCamera(actor);

    if (mouseDown && active) {
      const trigger = WEAPONS[weaponState.id].auto || pressed.has('Mouse0') || pressed.has('SemiAuto');
      if (trigger) shoot(actor, actors, now);
    }
    pressed.clear();
  }

  // the camera follows the eye every frame, including when the body is frozen (buy phase, death)
  function applyCamera(actor) {
    const eye = actor.crouch ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    const bobAmount = actor.onGround ? Math.sin(bob * 9) * 0.022 * state.moving : 0;
    shake = Math.max(0, shake - 0.016 * 2.4);
    const shakeX = (Math.random() - 0.5) * shake * 0.02;
    const shakeY = (Math.random() - 0.5) * shake * 0.02;
    camera.position.set(actor.x + shakeX, actor.y + eye + bobAmount + shakeY, actor.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw + viewPunch.y;
    camera.rotation.x = Math.max(-PLAYER.maxPitch, Math.min(PLAYER.maxPitch, state.pitch + viewPunch.x));
    camera.rotation.z = Math.sin(bob * 4.5) * 0.006 * state.moving;
  }

  function onMouseMove(dx, dy, sensitivity = PLAYER.mouseSensitivity) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-PLAYER.maxPitch, Math.min(PLAYER.maxPitch, state.pitch - dy * sensitivity));
  }

  function damageShake(amount) {
    shake = Math.min(1, shake + amount * 0.02);
  }

  return {
    state,
    keys,
    pressed,
    onMouseMove,
    shoot,
    startReload,
    switchWeapon,
    resetWeapon,
    addAmmo,
    damageShake,
    update,
    get weapon() { return weaponState; },
    setMouseDown(v) { mouseDown = v; },
    getMouseDown() { return mouseDown; },
    toggleScope() { scoped = !scoped; hud?.setScope(scoped); },
  };
}
