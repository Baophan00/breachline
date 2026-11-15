// Bots: perceive, path, aim and shoot. Each one carries a role for the round (entry, support,
// anchor, rotator), a plan keyed to the objective, and a small amount of aim error that shrinks
// while it tracks a target, so a fight is winnable but not free.
import * as THREE from 'three';
import { BOT, WEAPONS, PLAYER } from './config.js';
import { moveActor, updateActorMesh, buildActorMesh } from './actor.js';

const tmpVec = new THREE.Vector3();

export function createBots({ scene, nav, combat, world, audio }) {
  const bots = [];

  function makeBot({ team, name, id, x, z, yaw }) {
    const parts = buildActorMesh(team);
    return {
      mesh: parts.root,
      parts,
      id,
      name,
      team,
      isBot: true,
      x,
      z,
      y: 0,
      vx: 0,
      vz: 0,
      yaw,
      pitch: 0,
      crouch: false,
      onGround: true,
      alive: true,
      health: 100,
      armor: 0,
      helmet: false,
      money: 800,
      kills: 0,
      deaths: 0,
      weaponId: team === 't' ? 'rifle' : 'rifle',
      mag: 30,
      reserve: 90,
      fireCooldown: 0,
      reload: 0,
      path: [],
      pathIndex: 0,
      repathAt: 0,
      target: null,
      targetSeenAt: 0,
      nextThink: 0,
      burst: 0,
      burstPause: 0,
      aimOffset: new THREE.Vector3(),
      aimSettle: 0,
      role: 'entry',
      plan: null,
      plantProgress: 0,
      defuseProgress: 0,
      stuckTime: 0,
      lastPos: { x, z },
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeUntil: 0,
      reactionAt: 0,
    };
  }

  function spawnTeam(team, count, actorsAll) {
    const spawns = world.spawns[team];
    for (let i = 0; i < count; i += 1) {
      const s = spawns[i % spawns.length];
      const bot = makeBot({ team, name: BOT.names[team][i % BOT.names[team].length], id: `${team}-bot-${i}`, x: s.x, z: s.z, yaw: s.yaw });
      bots.push(bot);
    }
  }

  function canSee(bot, actor) {
    if (!actor.alive) return false;
    const dx = actor.x - bot.x;
    const dz = actor.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOT.difficulty.viewDistance) return false;
    const angleTo = Math.atan2(-dx, -dz);
    let delta = angleTo - bot.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const fov = BOT.difficulty.fov / (actor.crouch ? 1.35 : 1);
    if (Math.abs(delta) > fov) return false;
    if (nav.clearLine(bot.x, bot.z, actor.x, actor.z)) return true;
    // a target crouched behind cover is only seen once it fires
    return false;
  }

  function aimAt(bot, target, dt, now) {
    const eye = { x: bot.x, y: bot.crouch ? 1.08 : 1.62, z: bot.z };
    const dx = target.x - eye.x;
    const dz = target.z - eye.z;
    const dy = (target.crouch ? 1.0 : 1.42) - eye.y;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, dist);

    if (bot.aimSettle <= 0) {
      bot.aimOffset.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.2, 0);
      bot.aimSettle = 0.4 + Math.random() * 0.5;
    }
    bot.aimSettle -= dt;
    const errScale = BOT.difficulty.aimError * (target.crouch ? 1.4 : 1) * (dist > 30 ? 1.3 : 1);
    const errYaw = bot.aimOffset.x * errScale;
    const errPitch = bot.aimOffset.y * errScale * 0.6;

    const turn = BOT.difficulty.aimSpeed * dt;
    let dYaw = wantYaw + errYaw - bot.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    bot.yaw += Math.max(-turn, Math.min(turn, dYaw));
    bot.pitch += Math.max(-turn, Math.min(turn, wantPitch + errPitch - bot.pitch));

    const aligned = Math.abs(dYaw) < 0.075 && Math.abs(bot.pitch - wantPitch) < 0.1;
    return { aligned, dist, wantYaw };
  }

  function shootAt(bot, target, actors, now, dt) {
    const def = WEAPONS[bot.weaponId];
    if (bot.reload > 0) return;
    if (bot.mag <= 0) {
      bot.reload = def.reload;
      return;
    }
    if (now < bot.fireCooldown) return;
    if (bot.burst <= 0) {
      if (bot.burstPause > 0) {
        bot.burstPause -= dt;
        return;
      }
      bot.burst = BOT.difficulty.burstMin + Math.floor(Math.random() * (BOT.difficulty.burstMax - BOT.difficulty.burstMin));
    }

    bot.mag -= 1;
    bot.burst -= 1;
    bot.fireCooldown = now + 60 / def.rpm;
    const spread = def.spread * 3.4 + (Math.hypot(bot.vx, bot.vz) > 1 ? def.moveSpread : 0);
    combat.fire({ shooter: bot, weapon: def, actors, spread, isPlayer: false });
    audio?.play(def.sound, 0.45, bot.x, bot.z);
    if (bot.burst <= 0) bot.burstPause = BOT.difficulty.burstPause * (0.8 + Math.random() * 0.7);
  }

  function choosePlan(bot, round) {
    if (bot.plan) return bot.plan;
    const site = round.bombTarget ?? (Math.random() < 0.5 ? 'a' : 'b');
    if (bot.team === 't') {
      bot.plan = { kind: 'take', site, holdAt: null };
    } else {
      bot.plan = { kind: 'hold', site, holdAt: round.holdPoint(bot.id, site) };
    }
    return bot.plan;
  }

  function followPath(bot, dt, speed) {
    if (!bot.path.length) return false;
    const point = bot.path[0];
    const dx = point.x - bot.x;
    const dz = point.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.55) {
      bot.path.shift();
      return true;
    }
    const wishX = dx / dist;
    const wishZ = dz / dist;
    moveActor(bot, wishX, wishZ, dt, world.colliders, speed);
    const wantYaw = Math.atan2(-wishX, -wishZ);
    let dYaw = wantYaw - bot.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    bot.yaw += Math.max(-4.2 * dt, Math.min(4.2 * dt, dYaw));
    return true;
  }

  function repathTo(bot, x, z, now) {
    if (now < bot.repathAt) return;
    bot.repathAt = now + 0.8 + Math.random() * 0.6;
    bot.path = nav.findPath({ x: bot.x, z: bot.z }, { x, z });
  }

  function objectivePoint(bot, round) {
    const site = world.sites[bot.plan.site];
    if (!bot.plan.offset) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 2.6;
      bot.plan.offset = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }
    const o = bot.plan.offset;
    if (round.bombPlanted) return { x: round.bomb.x + o.x * 0.6, z: round.bomb.z + o.z * 0.6 };
    if (bot.team === 't') return { x: site.x + o.x, z: site.z + o.z };
    return { x: bot.plan.holdAt.x + o.x * 0.5, z: bot.plan.holdAt.z + o.z * 0.5 };
  }

  // bots push away from each other a little, so a team does not walk in single file
  function separate(bot, actors, dt) {
    let pushX = 0;
    let pushZ = 0;
    for (const other of actors) {
      if (other === bot || !other.alive) continue;
      const dx = bot.x - other.x;
      const dz = bot.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 0.001) {
        pushX += (dx / d) * (1.1 - d);
        pushZ += (dz / d) * (1.1 - d);
      }
    }
    if (pushX || pushZ) moveActor(bot, pushX, pushZ, dt * 1.6, world.colliders, 1.4);
  }

  function update(dt, { actors, round, player }) {
    const now = performance.now() / 1000;
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      if (bot.reload > 0) {
        bot.reload -= dt;
        if (bot.reload <= 0) {
          const def = WEAPONS[bot.weaponId];
          const need = def.mag - bot.mag;
          const take = Math.min(need, bot.reserve);
          bot.mag += take;
          bot.reserve -= take;
        }
      }

      const plan = choosePlan(bot, round);
      const enemies = actors.filter((a) => a.alive && a.team !== bot.team);
      separate(bot, actors, dt);

      // perception once every few frames: cheaper and it makes bots feel deliberate
      if (now > bot.nextThink) {
        bot.nextThink = now + 0.14 + Math.random() * 0.1;
        let best = null;
        let bestScore = Infinity;
        for (const enemy of enemies) {
          if (!canSee(bot, enemy)) continue;
          const d = Math.hypot(enemy.x - bot.x, enemy.z - bot.z);
          // a bot already shooting at someone keeps them, unless a much closer one appears
          const score = d + (bot.target === enemy ? -6 : 0);
          if (score < bestScore) {
            bestScore = score;
            best = enemy;
          }
        }
        if (best && bot.target !== best) {
          bot.target = best;
          bot.reactionAt = now + BOT.difficulty.reaction * (0.7 + Math.random() * 0.6);
        } else if (!best) {
          if (bot.target && now - bot.targetSeenAt > 1.6) bot.target = null;
        } else {
          bot.targetSeenAt = now;
        }
      }
      if (bot.target && !bot.target.alive) bot.target = null;

      if (bot.target) {
        bot.targetSeenAt = now;
        const { aligned, dist } = aimAt(bot, bot.target, dt, now);
        if (now >= bot.reactionAt) {
          if (aligned) shootAt(bot, bot.target, actors, now, dt);
          else if (bot.mag < 6 && dist > 8) {
            bot.reload = WEAPONS[bot.weaponId].reload;
          }
        }
        // strafe while shooting so a duel is not a standing contest
        if (now > bot.strafeUntil) {
          bot.strafeUntil = now + 0.4 + Math.random() * 0.7;
          if (Math.random() < BOT.difficulty.strafeChance) bot.strafeDir *= -1;
        }
        if (Math.random() < BOT.difficulty.crouchChance * dt * 2.5) bot.crouch = !bot.crouch;
        const strafe = new THREE.Vector3(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw)).multiplyScalar(bot.strafeDir * 0.7);
        moveActor(bot, strafe.x, strafe.z, dt, world.colliders, 2.6);
        updateActorMesh(bot, 0.4);
        continue;
      }

      // no target: work the objective
      bot.crouch = false;
      const goal = objectivePoint(bot, round);
      const dist = Math.hypot(goal.x - bot.x, goal.z - bot.z);
      if (dist > 1.1) {
        if (!bot.path.length || now > bot.repathAt || Math.hypot(bot.lastPos.x - bot.x, bot.lastPos.z - bot.z) < 0.02) {
          repathTo(bot, goal.x, goal.z, now);
          bot.stuckTime += dt;
        }
        const speed = bot.team === 't' ? PLAYER.walkSpeed * 0.82 : PLAYER.walkSpeed * 0.7;
        if (!followPath(bot, dt, speed)) repathTo(bot, goal.x, goal.z, now);
      } else {
        // on site: plant as a raider, or sit still and watch a lane as a warden
        if (bot.team === 't' && !round.bombPlanted && round.canPlant(bot)) {
          round.beginPlant(bot, dt);
          if (round.plantedBy === bot.id) continue;
        }
        if (bot.team === 'ct' && round.bombPlanted && dist < 2.6) {
          round.beginDefuse(bot, dt);
          if (round.defusedBy === bot.id) continue;
        }
        const scan = Math.sin(now * 0.5 + bot.id.length) * 0.8;
        bot.yaw += scan * dt;
      }

      bot.lastPos.x = bot.x;
      bot.lastPos.z = bot.z;
      updateActorMesh(bot, 0);
    }
  }

  spawnTeam('t', 4);
  spawnTeam('ct', 4);

  return {
    bots,
    update,
    reset() {
      for (const bot of bots) {
        bot.plan = null;
        bot.path = [];
        bot.target = null;
        bot.burst = 0;
        bot.burstPause = 0;
        bot.mag = WEAPONS[bot.weaponId].mag;
        bot.reserve = WEAPONS[bot.weaponId].reserve;
        bot.reload = 0;
        bot.health = 100;
        bot.alive = true;
        bot.crouch = false;
        bot.plantProgress = 0;
        bot.defuseProgress = 0;
      }
    },
  };
}
