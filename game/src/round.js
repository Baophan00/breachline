// Round flow: buy phase, live round, the charge, and the money that carries between rounds.
// The round owns the bomb, the clock and the score; everything else asks it what is allowed.
import * as THREE from 'three';
import { ROUND, ECONOMY, TEAM_NAME, WEAPONS } from './config.js';
import { placeActor } from './actor.js';

export function createRound({ world, scene, actors, hud, audio, combat, player }) {
  const state = {
    phase: 'buy',
    roundNo: 0,
    timer: ROUND.buySeconds,
    score: { t: 0, ct: 0 },
    bombPlanted: false,
    bomb: { x: 0, z: 0 },
    bombTarget: null,
    carrier: null,
    plantedBy: null,
    defusedBy: null,
    exploded: false,
    lossStreak: { t: 0, ct: 0 },
    roundOverAt: 0,
    lastWinner: null,
    lastReason: '',
  };

  const bombMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), new THREE.MeshStandardMaterial({ color: 0x2a2f33, metalness: 0.4, roughness: 0.5 }));
  bombMesh.add(body);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff4433, emissive: 0xff2211, emissiveIntensity: 2.6 }));
  led.position.set(0, 0.13, 0.06);
  bombMesh.add(led);
  bombMesh.visible = false;
  scene.add(bombMesh);

  let plantTimer = 0;
  let defuseTimer = 0;

  function resetRound(roundNo) {
    state.phase = 'buy';
    state.roundNo = roundNo;
    state.timer = ROUND.buySeconds;
    state.bombPlanted = false;
    state.plantedBy = null;
    state.defusedBy = null;
    state.exploded = false;
    state.bombTarget = Math.random() < 0.5 ? 'a' : 'b';
    plantTimer = 0;
    defuseTimer = 0;
    bombMesh.visible = false;

    const spawn = { t: [...world.spawns.t], ct: [...world.spawns.ct] };
    const counters = { t: 0, ct: 0 };
    for (const actor of actors) {
      const teamSpawns = spawn[actor.team];
      const index = counters[actor.team] % teamSpawns.length;
      counters[actor.team] += 1;
      placeActor(actor, teamSpawns[index]);
      // first person: the player's own body would sit inside the camera, and the view snaps to
      // the spawn's facing instead of wherever the last round left the mouse
      if (actor.isPlayer) {
        actor.mesh.visible = false;
        if (player?.state) {
          player.state.yaw = actor.yaw;
          player.state.pitch = 0;
        }
      }
      actor.armor = actor.armor > 0 ? Math.max(0, actor.armor - 15) : 0;
      actor.deathsThisRound = 0;
      if (!actor.isPlayer) {
        autoBuy(actor);
      }
    }
    const raiders = actors.filter((a) => a.team === 't' && a.alive);
    state.carrier = raiders[Math.floor(Math.random() * raiders.length)] ?? null;
    hud?.roundStart(state);
  }

  // bots buy like a team on a budget: a rifle when they can, armour when they cannot
  function autoBuy(bot) {
    const budget = bot.money;
    if (bot.weaponId !== 'rifle' && budget >= WEAPONS.rifle.price + 650) {
      bot.money -= WEAPONS.rifle.price;
      bot.weaponId = 'rifle';
    } else if (bot.weaponId === 'sidearm' && budget >= WEAPONS.smg.price && budget < WEAPONS.rifle.price + 650) {
      bot.money -= WEAPONS.smg.price;
      bot.weaponId = 'smg';
    }
    bot.mag = WEAPONS[bot.weaponId].mag;
    bot.reserve = WEAPONS[bot.weaponId].reserve;
    if (bot.money >= 650 && bot.armor <= 0) {
      bot.money -= 650;
      bot.armor = 100;
    }
  }

  function holdPoint(id, site) {
    const s = world.sites[site];
    const side = site === 'a' ? 1 : -1;
    const spots = [
      { x: s.x + side * 3.2, z: s.z + 4.4 },
      { x: s.x - side * 3.4, z: s.z - 3.8 },
      { x: s.x + side * 1.2, z: s.z + 6.2 },
      { x: s.x - side * 5.0, z: s.z + 1.2 },
    ];
    let hash = site.charCodeAt(0);
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
    return spots[hash % spots.length];
  }

  function inSite(actor, site) {
    const s = world.sites[site ?? state.bombTarget];
    return Math.hypot(actor.x - s.x, actor.z - s.z) <= s.r;
  }

  function canPlant(actor) {
    return actor.team === 't' && !state.bombPlanted && actor === state.carrier && inSite(actor);
  }

  function beginPlant(actor, dt) {
    plantTimer += dt;
    if (plantTimer === dt) {
      hud?.planting(true);
      audio?.play('plant');
    }
    hud?.plantProgress(plantTimer / ROUND.plantSeconds);
    if (plantTimer >= ROUND.plantSeconds) {
      plantTimer = 0;
      state.bombPlanted = true;
      state.plantedBy = actor.id;
      state.bomb = { x: actor.x, z: actor.z };
      bombMesh.position.set(actor.x, 0.1, actor.z);
      bombMesh.visible = true;
      actor.money = Math.min(ECONOMY.max, actor.money + ECONOMY.plantReward);
      hud?.planting(false);
      hud?.bombPlanted(true);
      audio?.play('planted');
    }
  }

  // used by the screenshot frames and by anything that needs the charge on the floor without a
  // three second plant animation
  function placeBomb(x, z) {
    state.bombPlanted = true;
    state.bomb = { x, z };
    bombMesh.position.set(x, 0.1, z);
    bombMesh.visible = true;
    return state.bomb;
  }

  function beginDefuse(actor, dt) {
    defuseTimer += dt;
    hud?.defusing(true, defuseTimer / ROUND.defuseSeconds);
    audio?.play('defuse');
    if (defuseTimer >= ROUND.defuseSeconds) {
      defuseTimer = 0;
      state.defusedBy = actor.id;
      actor.money = Math.min(ECONOMY.max, actor.money + ECONOMY.defuseReward);
      endRound('ct', 'charge defused');
    }
  }

  function award(winner, amount) {
    for (const actor of actors) {
      const isWinner = actor.team === winner;
      const bonus = isWinner ? amount : ECONOMY.lossBonus[Math.min(ECONOMY.lossBonus.length - 1, state.lossStreak[actor.team])];
      actor.money = Math.min(ECONOMY.max, actor.money + bonus);
    }
    state.lossStreak[winner] = 0;
    state.lossStreak[winner === 't' ? 'ct' : 't'] += 1;
  }

  function endRound(winner, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.lastWinner = winner;
    state.lastReason = reason;
    state.score[winner] += 1;
    const winAmount = reason === 'charge defused' ? ECONOMY.winDefuse : winner === 't' ? ECONOMY.winBomb : ECONOMY.winElimination;
    award(winner, winAmount);
    hud?.roundOver(winner, reason, state);
    audio?.play(winner === 'ct' ? 'win' : 'lose');
    if (state.bombPlanted && reason !== 'charge defused') bombMesh.visible = false;
    if (state.score[winner] >= ROUND.firstTo) {
      hud?.matchOver(winner, state);
    }
  }

  function onKill(victim, killer, weapon, part) {
    if (killer && killer.team !== victim.team) {
      killer.kills += 1;
      const reward = weapon?.killReward ?? ECONOMY.killReward;
      killer.money = Math.min(ECONOMY.max, killer.money + reward);
    } else if (killer) {
      killer.money = Math.max(0, killer.money - ECONOMY.teamKillPenalty);
    }
    hud?.killfeed(killer, victim, weapon, part);
    if (victim === state.carrier) {
      // the charge drops where the carrier fell; the next living raider picks it up
      const next = actors.find((a) => a.team === 't' && a.alive);
      state.carrier = next ?? null;
    }

    const tAlive = actors.filter((a) => a.team === 't' && a.alive).length;
    const ctAlive = actors.filter((a) => a.team === 'ct' && a.alive).length;
    if (tAlive === 0) endRound('ct', 'raiders eliminated');
    else if (ctAlive === 0) endRound('t', state.bombPlanted ? 'site cleared' : 'wardens eliminated');
  }

  function update(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      hud?.tick(state);
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND.roundSeconds;
        hud?.phaseLive();
      }
      return;
    }

    if (state.phase === 'live') {
      state.timer -= dt;
      hud?.tick(state);
      if (state.bombPlanted) {
        state.timer = Math.max(0, state.timer);
        if (state.timer <= 0) {
          state.exploded = true;
          endRound('t', 'charge detonated');
        }
      } else if (state.timer <= 0) {
        endRound('ct', 'time ran out');
      }
      return;
    }

    if (state.phase === 'over') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.score.t >= ROUND.firstTo || state.score.ct >= ROUND.firstTo) {
          // the match is done; a new one starts from the menu
          return;
        }
        resetRound(state.roundNo + 1);
        state.timer = ROUND.buySeconds;
      }
    }
  }

  function startMatch() {
    state.score = { t: 0, ct: 0 };
    state.lossStreak = { t: 0, ct: 0 };
    for (const actor of actors) {
      actor.money = ECONOMY.start;
      actor.kills = 0;
      actor.deaths = 0;
      actor.armor = 0;
      actor.helmet = false;
      actor.weaponId = 'sidearm';
    }
    resetRound(1);
  }

  return {
    state,
    update,
    onKill,
    startMatch,
    resetRound,
    canPlant,
    placeBomb,
    beginPlant,
    beginDefuse,
    inSite,
    holdPoint,
    get bomb() { return state.bomb; },
    get bombPlanted() { return state.bombPlanted; },
    get bombTarget() { return state.bombTarget; },
    get plantedBy() { return state.plantedBy; },
    get defusedBy() { return state.defusedBy; },
    get carrier() { return state.carrier; },
  };
}
