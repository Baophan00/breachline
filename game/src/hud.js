// The HUD is plain DOM: the panels exist in index.html and this module only writes to them.
// The minimap is a canvas painted once from the nav grid, then dots on top every frame.
import { BUY_LIST, WEAPONS, TEAM_NAME, ROUND } from './config.js';

export function createHud({ nav, world, onBuy, onResume }) {
  const el = (id) => document.getElementById(id);
  const nodes = {
    hud: el('hud'),
    health: el('health'),
    armor: el('armor'),
    money: el('money'),
    teamtext: el('teamtext'),
    weaponname: el('weaponname'),
    weapontype: el('weapontype'),
    ammo: el('ammo'),
    ammoMag: el('ammo-mag'),
    ammoReserve: el('ammo-reserve'),
    roundtimer: el('roundtimer'),
    roundno: el('roundno'),
    phasetext: el('phasetext'),
    scoreT: el('score-t'),
    scoreCt: el('score-ct'),
    killfeed: el('killfeed'),
    banner: el('banner'),
    bannerBig: el('banner-big'),
    bannerSub: el('banner-sub'),
    bombstate: el('bombstate'),
    bombtimer: el('bombtimer'),
    bombtext: el('bombtext'),
    crosshair: el('crosshair'),
    hitmarker: el('hitmarker'),
    damage: el('damage'),
    scope: el('scope'),
    minimap: el('minimap'),
    buy: el('buy'),
    buygrid: el('buygrid'),
    buytimer: el('buytimer'),
    buymoney: el('buymoney'),
    scoreboard: el('scoreboard'),
    sbbody: el('sb-body'),
    targetRounds: el('target-rounds'),
    overlay: el('overlay'),
  };

  nodes.targetRounds.textContent = String(ROUND.firstTo);
  const mapCtx = nodes.minimap.getContext('2d');
  let mapBase = null;
  let buyOpen = false;
  let buyActor = null;
  let bannerTimer = 0;

  function paintMapBase() {
    const size = nodes.minimap.width;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(9,11,14,0.92)';
    g.fillRect(0, 0, size, size);
    const sx = size / (world.bounds.maxX - world.bounds.minX);
    const sz = size / (world.bounds.maxZ - world.bounds.minZ);
    g.fillStyle = 'rgba(120,134,148,0.34)';
    for (let gz = 0; gz < nav.height; gz += 1) {
      for (let gx = 0; gx < nav.width; gx += 1) {
        if (!nav.isSolid(gx, gz)) continue;
        const worldX = world.bounds.minX + (gx + 0.5) * nav.cell;
        const worldZ = world.bounds.minZ + (gz + 0.5) * nav.cell;
        g.fillRect((worldX - world.bounds.minX) * sx, (worldZ - world.bounds.minZ) * sz, nav.cell * sx + 0.6, nav.cell * sz + 0.6);
      }
    }
    for (const site of Object.values(world.sites)) {
      g.strokeStyle = site.name === 'A' ? 'rgba(216,160,90,0.75)' : 'rgba(111,159,216,0.75)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc((site.x - world.bounds.minX) * sx, (site.z - world.bounds.minZ) * sz, site.r * sx, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = site.name === 'A' ? 'rgba(216,160,90,0.85)' : 'rgba(111,159,216,0.85)';
      g.font = '600 20px ui-monospace, Menlo, monospace';
      g.fillText(site.name, (site.x - world.bounds.minX) * sx - 6, (site.z - world.bounds.minZ) * sz + 7);
    }
    mapBase = c;
  }

  function drawMinimap(actors, player) {
    if (!mapBase) paintMapBase();
    const size = nodes.minimap.width;
    mapCtx.clearRect(0, 0, size, size);
    mapCtx.drawImage(mapBase, 0, 0);
    const sx = size / (world.bounds.maxX - world.bounds.minX);
    const sz = size / (world.bounds.maxZ - world.bounds.minZ);
    const toMap = (x, z) => [(x - world.bounds.minX) * sx, (z - world.bounds.minZ) * sz];

    for (const a of actors) {
      if (!a.alive || a === player) continue;
      const [mx, my] = toMap(a.x, a.z);
      const visible = a.team === player.team || Math.hypot(a.x - player.x, a.z - player.z) < 30;
      if (!visible) continue;
      mapCtx.fillStyle = a.team === player.team ? '#5f9ee0' : '#d8603a';
      mapCtx.beginPath();
      mapCtx.arc(mx, my, 4, 0, Math.PI * 2);
      mapCtx.fill();
    }

    const [px, py] = toMap(player.x, player.z);
    const yaw = player.yaw;
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(-yaw);
    mapCtx.fillStyle = 'rgba(232,228,218,0.16)';
    mapCtx.beginPath();
    mapCtx.moveTo(0, 0);
    mapCtx.arc(0, 0, 42, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();

    mapCtx.fillStyle = '#e8e4da';
    mapCtx.beginPath();
    mapCtx.arc(px, py, 5, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.strokeStyle = 'rgba(232,228,218,0.5)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(px, py);
    mapCtx.lineTo(px - Math.sin(yaw) * 12, py - Math.cos(yaw) * 12);
    mapCtx.stroke();
  }

  function setWeapon(def) {
    nodes.weaponname.textContent = def.name;
    nodes.weapontype.textContent = def.type;
    setAmmo(def.mag, def.reserve, false);
  }

  function setAmmo(mag, reserve, reloading) {
    nodes.ammoMag.textContent = String(mag);
    nodes.ammoReserve.textContent = `/ ${reserve}`;
    nodes.ammo.classList.toggle('empty', mag === 0 || reloading);
  }

  function setVitals(actor) {
    nodes.health.textContent = String(Math.max(0, Math.round(actor.health)));
    nodes.health.classList.toggle('low', actor.health <= 35);
    nodes.armor.textContent = actor.armor > 0 ? (actor.helmet ? `k+${Math.round(actor.armor)}` : `k${Math.round(actor.armor)}`) : '—';
    nodes.money.textContent = String(Math.round(actor.money));
    nodes.teamtext.textContent = `${TEAM_NAME[actor.team].toLowerCase()} · ${actor.name}`;
  }

  function setTeamText(text) {
    nodes.teamtext.textContent = text;
  }

  let hitTimer = 0;
  function hitmarker(killed) {
    nodes.hitmarker.classList.add('on');
    nodes.crosshair.classList.toggle('hit', !killed);
    hitTimer = killed ? 0.22 : 0.12;
  }

  function muzzle() {
    nodes.crosshair.classList.remove('hit');
  }

  function flashDamage(amount) {
    nodes.damage.style.opacity = String(Math.min(0.85, 0.25 + amount / 60));
    setTimeout(() => { nodes.damage.style.opacity = '0'; }, 120);
  }

  function formatClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function tick(state) {
    nodes.roundtimer.textContent = formatClock(state.timer);
    nodes.roundtimer.classList.toggle('low', state.timer < 15);
    nodes.scoreT.textContent = String(state.score.t);
    nodes.scoreCt.textContent = String(state.score.ct);
    nodes.roundno.textContent = String(state.roundNo);
    if (state.bombPlanted) {
      nodes.phasetext.textContent = 'charge planted';
      nodes.bombstate.classList.add('on');
      nodes.bombtext.textContent = 'charge armed';
      nodes.bombtimer.textContent = formatClock(state.timer);
    } else {
      nodes.bombstate.classList.remove('on');
      if (state.phase === 'buy') nodes.phasetext.textContent = 'buy phase';
      else if (state.phase === 'live') nodes.phasetext.textContent = `${TEAM_NAME.t} attack`;
    }
  }

  function roundStart(state) {
    nodes.banner.classList.remove('on');
    nodes.hitmarker.classList.remove('on');
    nodes.bombstate.classList.remove('on');
    nodes.phasetext.textContent = 'buy phase';
    nodes.roundno.textContent = String(state.roundNo);
    showBanner(`Round ${state.roundNo}`, state.roundNo === 1 ? 'first to 8 rounds' : `${state.score.t} — ${state.score.ct}`, '');
  }

  function showBanner(big, sub, cls) {
    nodes.bannerBig.textContent = big;
    nodes.bannerSub.textContent = sub;
    nodes.banner.className = `on ${cls}`;
    bannerTimer = 2.6;
  }

  function phaseLive() {
    nodes.phasetext.textContent = `${TEAM_NAME.t} attack`;
  }

  function roundOver(winner, reason, state) {
    const won = winner === 't';
    showBanner(won ? 'Raiders take it' : 'Wardens hold', reason, won ? 'lose' : 'win');
  }

  function matchOver(winner, state) {
    nodes.bannerBig.textContent = `${TEAM_NAME[winner]} win the match`;
    nodes.bannerSub.textContent = `${state.score.t} — ${state.score.ct} · click to run it back`;
    nodes.banner.className = 'on';
    bannerTimer = 999;
  }

  function killfeed(killer, victim, weapon, part) {
    const line = document.createElement('div');
    line.className = 'line';
    const nameFor = (a) => (a.isPlayer ? 'you' : a.name);
    const killerName = killer ? `<span class="${killer.team} ${killer.isPlayer ? 'me' : ''}">${nameFor(killer)}</span>` : '<span class="gun">world</span>';
    const victimName = `<span class="${victim.team} ${victim.isPlayer ? 'me' : ''}">${nameFor(victim)}</span>`;
    const gun = weapon ? weapon.name : 'knife';
    const head = part === 'head' ? ' ◉' : '';
    line.innerHTML = `${killerName} <span class="gun">${gun}${head}</span> ${victimName}`;
    nodes.killfeed.appendChild(line);
    setTimeout(() => line.remove(), 6000);
    while (nodes.killfeed.children.length > 5) nodes.killfeed.firstChild.remove();
  }

  function bombPlanted(on) {
    nodes.bombstate.classList.toggle('on', on);
  }

  function planting(on) {
    nodes.bombtext.textContent = on ? 'planting charge' : 'charge planted';
  }

  function plantProgress(ratio) {
    nodes.bombtimer.textContent = `${Math.round(Math.min(1, ratio) * 100)}%`;
    nodes.bombstate.classList.add('on');
    nodes.bombtext.textContent = 'planting charge';
  }

  function defusing(on, ratio) {
    if (!on) return;
    nodes.bombstate.classList.add('on');
    nodes.bombtext.textContent = 'defusing';
    nodes.bombtimer.textContent = `${Math.round(Math.min(1, ratio) * 100)}%`;
  }

  function setScope(on) {
    nodes.scope.classList.toggle('on', on);
  }

  function buildBuyList() {
    nodes.buygrid.innerHTML = '';
    for (const item of BUY_LIST) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'item';
      button.dataset.kind = item.kind;
      button.dataset.id = item.id;
      button.innerHTML = `<span class="n">${item.label}</span><span class="p">$${item.price}</span><span class="d">${item.detail}</span>`;
      button.addEventListener('click', () => {
        onBuy?.(item);
        refreshBuy(buyActor);
      });
      nodes.buygrid.appendChild(button);
    }
  }

  function refreshBuy(actor) {
    if (!actor) return;
    buyActor = actor;
    nodes.buymoney.textContent = String(Math.round(actor.money));
    for (const button of nodes.buygrid.children) {
      const price = Number(button.querySelector('.p').textContent.replace('$', ''));
      button.disabled = actor.money < price;
    }
  }

  function setBuyOpen(open, actor, timer) {
    buyOpen = open;
    nodes.buy.hidden = !open;
    if (open) {
      if (!nodes.buygrid.children.length) buildBuyList();
      refreshBuy(actor);
      nodes.buytimer.textContent = String(Math.max(0, Math.ceil(timer)));
    }
  }

  function getBuyOpen() { return buyOpen; }

  function setScoreboardOpen(open, actors) {
    nodes.scoreboard.hidden = !open;
    if (!open) return;
    const rows = [...actors].sort((a, b) => (a.team === b.team ? b.kills - a.kills : a.team === 't' ? -1 : 1));
    nodes.sbbody.innerHTML = rows
      .map((a) => `<tr class="${a.team} ${a.alive ? '' : 'dead'}"><td>${TEAM_NAME[a.team]}</td><td>${a.isPlayer ? `${a.name} (you)` : a.name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${Math.round(a.money)}</td></tr>`)
      .join('');
  }

  function update(dt, actors, player) {
    drawMinimap(actors, player);
    setVitals(player);
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) {
        nodes.hitmarker.classList.remove('on');
        nodes.crosshair.classList.remove('hit');
      }
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) nodes.banner.classList.remove('on');
    }
  }

  return {
    setWeapon, setAmmo, setVitals, setTeamText, hitmarker, muzzle, flashDamage,
    tick, roundStart, phaseLive, roundOver, matchOver, killfeed, bombPlanted,
    planting, plantProgress, defusing, setScope, setBuyOpen, getBuyOpen,
    setScoreboardOpen, update, showBanner, refreshBuy,
    nodes,
  };
}
