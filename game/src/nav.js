// A grid the bots walk: 0.5 m cells over the map bounds, blocked where a brush sits.
// A* over 8 neighbours, then the path is straightened with a line-of-sight pass so bots
// do not zig-zag cell by cell.
import { BOUNDS } from './world.js';

const CELL = 0.5;
const RADIUS = 0.46;

export function createNav(colliders) {
  const w = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL);
  const h = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
  const solid = new Uint8Array(w * h);

  for (let gx = 0; gx < w; gx += 1) {
    for (let gz = 0; gz < h; gz += 1) {
      const x = BOUNDS.minX + (gx + 0.5) * CELL;
      const z = BOUNDS.minZ + (gz + 0.5) * CELL;
      let blocked = false;
      for (const c of colliders) {
        if (x + RADIUS > c.minX && x - RADIUS < c.maxX && z + RADIUS > c.minZ && z - RADIUS < c.maxZ) {
          blocked = true;
          break;
        }
      }
      solid[gz * w + gx] = blocked ? 1 : 0;
    }
  }

  const toCell = (x, z) => ({
    gx: Math.max(0, Math.min(w - 1, Math.floor((x - BOUNDS.minX) / CELL))),
    gz: Math.max(0, Math.min(h - 1, Math.floor((z - BOUNDS.minZ) / CELL))),
  });
  const toWorld = (gx, gz) => ({
    x: BOUNDS.minX + (gx + 0.5) * CELL,
    z: BOUNDS.minZ + (gz + 0.5) * CELL,
  });

  const isSolid = (gx, gz) => {
    if (gx < 0 || gz < 0 || gx >= w || gz >= h) return true;
    return solid[gz * w + gx] === 1;
  };

  function nearestOpen(gx, gz) {
    if (!isSolid(gx, gz)) return { gx, gz };
    for (let r = 1; r < 14; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dz = -r; dz <= r; dz += 1) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = gx + dx;
          const nz = gz + dz;
          if (!isSolid(nx, nz)) return { gx: nx, gz: nz };
        }
      }
    }
    return { gx, gz };
  }

  // straight-line walkability, sampled every half cell
  function clearLine(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / (CELL * 0.5));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const { gx, gz } = toCell(ax + dx * t, az + dz * t);
      if (isSolid(gx, gz)) return false;
    }
    return true;
  }

  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
  ];

  function findPath(from, to) {
    const s = nearestOpen(toCell(from.x, from.z).gx, toCell(from.x, from.z).gz);
    const g = nearestOpen(toCell(to.x, to.z).gx, toCell(to.z, to.z).gz);
    const key = (gx, gz) => gz * w + gx;
    const open = [{ gx: s.gx, gz: s.gz, f: 0 }];
    const came = new Map();
    const cost = new Map([[key(s.gx, s.gz), 0]]);
    const seen = new Set();
    let guard = 0;

    while (open.length && guard < 12000) {
      guard += 1;
      let best = 0;
      for (let i = 1; i < open.length; i += 1) if (open[i].f < open[best].f) best = i;
      const cur = open.splice(best, 1)[0];
      const ck = key(cur.gx, cur.gz);
      if (seen.has(ck)) continue;
      seen.add(ck);

      if (cur.gx === g.gx && cur.gz === g.gz) {
        const cells = [];
        let walk = ck;
        while (walk !== undefined) {
          cells.push({ gx: walk % w, gz: Math.floor(walk / w) });
          walk = came.get(walk);
        }
        cells.reverse();
        const points = cells.map((c) => toWorld(c.gx, c.gz));
        // straighten: keep only the corners the straight line misses
        const out = [];
        if (points.length <= 2) return points;
        let i = 0;
        while (i < points.length - 1) {
          let j = points.length - 1;
          while (j > i + 1 && !clearLine(points[i].x, points[i].z, points[j].x, points[j].z)) j -= 1;
          out.push(points[j]);
          i = j;
        }
        return out;
      }

      for (const [dx, dz, step] of DIRS) {
        const nx = cur.gx + dx;
        const nz = cur.gz + dz;
        if (isSolid(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (isSolid(cur.gx + dx, cur.gz) || isSolid(cur.gx, cur.gz + dz))) continue;
        const nk = key(nx, nz);
        const nc = (cost.get(ck) ?? 0) + step;
        if (nc < (cost.get(nk) ?? Infinity)) {
          cost.set(nk, nc);
          came.set(nk, ck);
          const hEst = Math.hypot(nx - g.gx, nz - g.gz);
          open.push({ gx: nx, gz: nz, f: nc + hEst * 1.15 });
        }
      }
    }
    return [{ x: to.x, z: to.z }];
  }

  return { findPath, clearLine, isSolid, toCell, toWorld, cell: CELL, width: w, height: h };
}
