// Hitscan gunplay: one ray per pellet, spread from movement and recoil, damage that falls
// off with range, armour that halves it and a helmet that turns a one-shot headshot into two.
// Effects are pooled so a burst does not allocate sprites mid-round.
import * as THREE from 'three';
import { WEAPONS, HITBOX } from './config.js';
import { actorEye } from './actor.js';

export function createCombat({ scene, world, onDamage, onKill }) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;

  const tracerPool = [];
  const decalPool = [];
  const TMP = new THREE.Vector3();

  for (let i = 0; i < 40; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffdca8, transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }

  for (let i = 0; i < 48; i += 1) {
    const decal = new THREE.Mesh(new THREE.CircleGeometry(0.045, 7), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0 }));
    decal.visible = false;
    scene.add(decal);
    decalPool.push({ mesh: decal, life: 0 });
  }

  function tracer(from, to) {
    const slot = tracerPool.find((t) => t.life <= 0) ?? tracerPool[0];
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.visible = true;
    slot.line.material.opacity = 0.55;
    slot.life = 0.07;
  }

  function decalAt(point, normal) {
    const slot = decalPool.find((d) => d.life <= 0) ?? decalPool[0];
    slot.mesh.position.copy(point).addScaledVector(normal, 0.012);
    slot.mesh.lookAt(TMP.copy(point).add(normal));
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.75;
    slot.life = 6;
  }

  function updateEffects(dt) {
    for (const t of tracerPool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, (t.life / 0.07) * 0.55);
      if (t.life <= 0) t.line.visible = false;
    }
    for (const d of decalPool) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.mesh.material.opacity = Math.max(0, Math.min(0.75, d.life / 2));
      if (d.life <= 0) d.mesh.visible = false;
    }
  }

  function pickTargets(actors) {
    const list = [world.meshes];
    for (const a of actors) {
      if (a.alive) list.push(a.mesh);
    }
    return list;
  }

  // spread is a cone: a random unit vector inside it, applied in the shot's own frame
  function spreadDir(dir, spread) {
    if (spread <= 0) return dir.clone().normalize();
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const trueUp = new THREE.Vector3().crossVectors(right, dir).normalize();
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * spread;
    return dir.clone()
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(trueUp, Math.sin(angle) * radius)
      .normalize();
  }

  function damageFor(weapon, part, distance) {
    const base = weapon.damage * (HITBOX[part] ?? 1) * (part === 'head' ? weapon.headMult / 4 : 1);
    const falloff = distance < 12 ? 1 : Math.max(weapon.falloff, 1 - (distance - 12) / (weapon.range * 1.6));
    return base * falloff;
  }

  function fire({ shooter, weapon, actors, spread, originY, dirOverride, isPlayer }) {
    const eye = actorEye(shooter);
    const origin = new THREE.Vector3(eye.x, originY ?? eye.y, eye.z);
    const baseDir = dirOverride ?? new THREE.Vector3(
      Math.sin(shooter.yaw) * Math.cos(shooter.pitch) * -1,
      Math.sin(shooter.pitch),
      Math.cos(shooter.yaw) * Math.cos(shooter.pitch) * -1,
    ).normalize();

    let result = { hit: false, killed: false, target: null };
    const targets = pickTargets(actors);

    for (let p = 0; p < weapon.pellets; p += 1) {
      const dir = spreadDir(baseDir, spread);
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObjects(targets, true);
      let point = null;
      let normal = null;
      let victim = null;
      let part = null;

      if (hits.length) {
        const first = hits[0];
        point = first.point;
        normal = first.face ? first.face.normal.clone().transformDirection(first.object.matrixWorld) : dir.clone().negate();
        let node = first.object;
        while (node && !node.userData?.part && node !== world.meshes) node = node.parent;
        if (node && node.userData?.part) {
          victim = actors.find((a) => a.alive && a.mesh === node.parent);
          part = node.userData.part;
        }
      } else {
        point = origin.clone().addScaledVector(dir, 90);
        normal = dir.clone().negate();
      }

      tracer(origin, point);
      if (!victim) {
        decalAt(point, normal);
      }

      if (victim) {
        if (victim.team === shooter.team) {
          const dmg = damageFor(weapon, part, point.distanceTo(origin)) * 0.35;
          applyDamage(victim, dmg, shooter, part, weapon, true);
        } else {
          const dmg = damageFor(weapon, part, point.distanceTo(origin));
          const killed = applyDamage(victim, dmg, shooter, part, weapon, false);
          result = { hit: true, killed: killed || result.killed, target: victim, part, point };
        }
      }
    }

    return result;
  }

  function applyDamage(victim, amount, shooter, part, weapon, friendly) {
    if (!victim.alive) return false;
    let dmg = amount;
    if (part === 'head' && victim.helmet) dmg *= 0.55;
    if (part !== 'head' && victim.armor > 0) dmg *= 0.55;
    victim.health -= dmg;
    victim.lastDamageAt = performance.now() / 1000;
    onDamage?.(victim, shooter, dmg, part, friendly);

    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      victim.mesh.visible = false;
      victim.deaths += 1;
      onKill?.(victim, shooter, weapon, part);
      return true;
    }
    return false;
  }

  return { fire, updateEffects, applyDamage, raycaster };
}

export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return { id, def, mag: def.mag, reserve: def.reserve, cooldown: 0, reload: 0 };
}
