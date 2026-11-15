// Harborline: a compact dockyard map. Everything is axis-aligned brushes of four materials,
// so collision is a list of boxes and the bots can path over a grid built from the same list.
import * as THREE from 'three';

const TEX = {};

function canvasTexture(key, size, paint, repeat = 1) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  TEX[key] = t;
  return t;
}

function noise(g, size, amount, alpha) {
  for (let i = 0; i < amount; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(0,0,0,${(Math.random() * alpha).toFixed(3)})`;
    g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
}

function concrete(hex) {
  return (g, s) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, s, s);

    // poured panels: a grid of seams with a lighter lip above each
    const panels = 2;
    const step = s / panels;
    for (let i = 0; i < panels; i += 1) {
      for (let j = 0; j < panels; j += 1) {
        const shade = ((i + j) % 2 === 0 ? 0.05 : -0.04);
        g.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
        g.fillRect(i * step, j * step, step, step);
      }
    }
    noise(g, s, 1400, 0.2);
    g.strokeStyle = 'rgba(0,0,0,0.32)';
    g.lineWidth = 3;
    for (let i = 0; i <= panels; i += 1) {
      g.beginPath();
      g.moveTo(i * step, 0);
      g.lineTo(i * step, s);
      g.moveTo(0, i * step);
      g.lineTo(s, i * step);
      g.stroke();
    }
    // rain streaks
    for (let k = 0; k < 22; k += 1) {
      const x = Math.random() * s;
      g.fillStyle = `rgba(0,0,0,${(0.03 + Math.random() * 0.05).toFixed(3)})`;
      g.fillRect(x, 0, 1 + Math.random() * 2, s);
    }
    // tie holes
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = 0; k < 8; k += 1) {
      g.beginPath();
      g.arc((0.1 + Math.random() * 0.8) * s, (0.1 + Math.random() * 0.8) * s, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  };
}

function metal(hex) {
  return (g, s) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += s / 8) {
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect(x, 0, s / 22, s);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(x + s / 16, 0, s / 40, s);
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, s / 2 - 2, s, 4);
    noise(g, s, 400, 0.22);
  };
}

function wood() {
  return (g, s) => {
    g.fillStyle = '#7a5637';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += s / 5) {
      g.fillStyle = y % (s / 2.5) === 0 ? '#8a6240' : '#6d4c30';
      g.fillRect(0, y, s, s / 5 - 2);
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.fillRect(0, y + s / 5 - 2, s, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(s * 0.06, 0, 4, s);
    g.fillRect(s * 0.9, 0, 4, s);
    noise(g, s, 500, 0.18);
  };
}

function floorTiles() {
  return (g, s) => {
    g.fillStyle = '#43494c';
    g.fillRect(0, 0, s, s);
    const n = 4;
    const cell = s / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const v = 0.06 * ((i + j) % 2 === 0 ? 1 : -1);
        g.fillStyle = `rgba(255,255,255,${v.toFixed(3)})`;
        g.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i <= n; i += 1) {
      g.beginPath();
      g.moveTo(i * cell, 0);
      g.lineTo(i * cell, s);
      g.moveTo(0, i * cell);
      g.lineTo(s, i * cell);
      g.stroke();
    }
    noise(g, s, 700, 0.2);
  };
}

export const MATERIALS = {
  wall: () => new THREE.MeshStandardMaterial({ map: canvasTexture('concrete', 512, concrete('#8f9598'), 3.2), roughness: 0.94, metalness: 0.02 }),
  wallDark: () => new THREE.MeshStandardMaterial({ map: canvasTexture('concreteDark', 512, concrete('#4f5558'), 3.2), roughness: 0.96 }),
  container: () => new THREE.MeshStandardMaterial({ map: canvasTexture('metal', 256, metal('#4b615c'), 1), roughness: 0.6, metalness: 0.38 }),
  containerRed: () => new THREE.MeshStandardMaterial({ map: canvasTexture('metalRed', 256, metal('#9c4a32'), 1), roughness: 0.64, metalness: 0.32 }),
  crate: () => new THREE.MeshStandardMaterial({ map: canvasTexture('wood', 256, wood(), 1), roughness: 0.88 }),
  floor: () => new THREE.MeshStandardMaterial({ map: canvasTexture('floor', 512, floorTiles(), 10), roughness: 0.95 }),
};

// brushes: x/z is the centre, w/d the footprint, y0 the bottom, h the height
const BRUSHES = [
  // outer shell
  { x: 0, z: -31, w: 62, d: 2, h: 7, mat: 'wall' },
  { x: 0, z: 31, w: 62, d: 2, h: 7, mat: 'wall' },
  { x: -31, z: 0, w: 2, d: 62, h: 7, mat: 'wall' },
  { x: 31, z: 0, w: 2, d: 62, h: 7, mat: 'wall' },

  // mid: a long shed split by a container stack, walled on both sides
  { x: -5.5, z: 2, w: 1, d: 30, h: 4.2, mat: 'wallDark' },
  { x: 5.5, z: 2, w: 1, d: 30, h: 4.2, mat: 'wallDark' },
  { x: 0, z: -6, w: 7, d: 1, h: 4.2, mat: 'wallDark' },
  { x: -2.5, z: 7, w: 3, d: 1, h: 2.6, mat: 'wallDark' },
  { x: 2.6, z: 14, w: 3.4, d: 1, h: 2.6, mat: 'wallDark' },

  // site A, east: a walled yard with one entrance north and one from mid
  { x: 17, z: 6.5, w: 1, d: 23, h: 4.6, mat: 'wall' },
  { x: 23.5, z: -4.5, w: 14, d: 1, h: 4.6, mat: 'wall' },
  { x: 8.5, z: -4.5, w: 6, d: 1, h: 4.6, mat: 'wall' },
  { x: 23.5, z: 16, w: 14, d: 1, h: 4.6, mat: 'wall' },
  { x: 8.5, z: 16, w: 6, d: 1, h: 4.6, mat: 'wall' },

  // site B, west
  { x: -17, z: 6.5, w: 1, d: 23, h: 4.6, mat: 'wall' },
  { x: -23.5, z: -4.5, w: 14, d: 1, h: 4.6, mat: 'wall' },
  { x: -8.5, z: -4.5, w: 6, d: 1, h: 4.6, mat: 'wall' },
  { x: -23.5, z: 16, w: 14, d: 1, h: 4.6, mat: 'wall' },
  { x: -8.5, z: 16, w: 6, d: 1, h: 4.6, mat: 'wall' },

  // the two long lanes hugging the outside walls
  { x: 26.5, z: 6, w: 1, d: 34, h: 3.4, mat: 'wallDark' },
  { x: -26.5, z: 6, w: 1, d: 34, h: 3.4, mat: 'wallDark' },

  // spawn cover, not a cage: a crate and a container give both teams a first piece of cover
  { x: -9.5, z: 23.5, w: 3.2, d: 2.2, h: 1.5, mat: 'crate' },
  { x: 9.5, z: 23.5, w: 3.2, d: 2.2, h: 1.5, mat: 'crate' },
  { x: -10, z: -23.5, w: 3.2, d: 2.2, h: 1.5, mat: 'crate' },
  { x: 10, z: -23.5, w: 3.2, d: 2.2, h: 1.5, mat: 'crate' },

  // cover: containers, crates and pillars
  { x: 20, z: 10, w: 6, d: 2.6, h: 2.7, mat: 'container' },
  { x: 13, z: 1.5, w: 2.6, d: 6, h: 2.7, mat: 'containerRed' },
  { x: 24, z: -1, w: 2.6, d: 2.6, h: 2.7, mat: 'container' },
  { x: -20, z: 10, w: 6, d: 2.6, h: 2.7, mat: 'containerRed' },
  { x: -13, z: 1.5, w: 2.6, d: 6, h: 2.7, mat: 'container' },
  { x: -24, z: -1, w: 2.6, d: 2.6, h: 2.7, mat: 'containerRed' },
  { x: 0, z: -14, w: 2.2, d: 2.2, h: 3.4, mat: 'wallDark' },
  { x: 9.5, z: 9, w: 1.6, d: 1.6, h: 1.1, mat: 'crate' },
  { x: -9.5, z: 9, w: 1.6, d: 1.6, h: 1.1, mat: 'crate' },
  { x: 12.5, z: -1.5, w: 1.4, d: 1.4, h: 1.0, mat: 'crate' },
  { x: -12.5, z: -1.5, w: 1.4, d: 1.4, h: 1.0, mat: 'crate' },
  { x: 3.2, z: -10.5, w: 1.8, d: 1.8, h: 1.2, mat: 'crate' },
  { x: -3.2, z: -10.5, w: 1.8, d: 1.8, h: 1.2, mat: 'crate' },
  { x: 28, z: -14, w: 4, d: 4, h: 3.0, mat: 'container' },
  { x: -28, z: -14, w: 4, d: 4, h: 3.0, mat: 'containerRed' },
  { x: 14, z: 20, w: 2.4, d: 2.4, h: 1.6, mat: 'crate' },
  { x: -14, z: 20, w: 2.4, d: 2.4, h: 1.6, mat: 'crate' },
];

export const SITES = {
  a: { name: 'A', x: 20, z: 4, r: 5.2 },
  b: { name: 'B', x: -20, z: 4, r: 5.2 },
};

export const SPAWNS = {
  t: [
    { x: -3.4, z: 25.5, yaw: 0 },
    { x: 0, z: 26.6, yaw: 0 },
    { x: 3.4, z: 25.5, yaw: 0 },
    { x: -6.4, z: 26.4, yaw: 0 },
    { x: 6.4, z: 26.4, yaw: 0 },
  ],
  ct: [
    { x: -3.4, z: -26.6, yaw: Math.PI },
    { x: 0, z: -27.6, yaw: Math.PI },
    { x: 3.4, z: -26.6, yaw: Math.PI },
    { x: -6.4, z: -27.0, yaw: Math.PI },
    { x: 6.4, z: -27.0, yaw: Math.PI },
  ],
};

export const BOUNDS = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };

function addProp(scene, group, colliders, b) {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const mat = MATERIALS[b.mat] ? MATERIALS[b.mat]() : MATERIALS.wall();
  const mesh = new THREE.Mesh(geo, mat);
  const y0 = b.y0 ?? 0;
  mesh.position.set(b.x, y0 + b.h / 2, b.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (b.mat === 'crate') {
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x2b2015, transparent: true, opacity: 0.5 }));
    edge.position.copy(mesh.position);
    group.add(edge);
  }
  colliders.push({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
    maxY: y0 + b.h,
  });
}

function makeFloor(scene) {
  const mat = MATERIALS.floor();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  for (const site of Object.values(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: site.name === 'A' ? 0xd8a05a : 0x6f9fd8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    scene.add(ring);

    const plate = new THREE.Mesh(
      new THREE.CircleGeometry(site.r - 0.4, 36),
      new THREE.MeshStandardMaterial({ color: site.name === 'A' ? 0x2e2a24 : 0x222832, roughness: 0.9, transparent: true, opacity: 0.55 }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.x, 0.012, site.z);
    scene.add(plate);

    // hazard chevrons painted on the floor at each site entrance
    const paint = new THREE.MeshBasicMaterial({ color: 0xd8a05a, transparent: true, opacity: 0.34 });
    for (let i = 0; i < 3; i += 1) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(site.x + (site.name === 'A' ? 4.6 : -4.6), 0.016, site.z + 5.2 + i * 0.55);
      scene.add(bar);
    }
  }

  // the yard's centre line, worn down the middle of mid
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 26), new THREE.MeshBasicMaterial({ color: 0xb8bcc0, transparent: true, opacity: 0.16 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.014, 4);
  scene.add(line);
}

// A painted dusk sky on the inside of a big sphere: warm at the horizon, cold overhead.
// Fog takes the horizon colour so the map's edges melt into it instead of ending at a wall.
function makeSky(scene) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#131a22');
  grad.addColorStop(0.42, '#25313d');
  grad.addColorStop(0.68, '#4a5560');
  grad.addColorStop(0.84, '#8a7563');
  grad.addColorStop(1, '#c08a63');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.position.y = 20;
  scene.add(sky);

  // the harbor beyond the yard: cranes and sheds in silhouette, far enough to stay scenery
  const far = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 1 });
  const shapes = [
    [-58, 42, 10, 26], [-44, 56, 8, 18], [-22, 62, 14, 22], [14, 66, 9, 30],
    [38, 54, 12, 20], [62, 44, 10, 28], [-66, 12, 8, 20], [70, 6, 9, 24],
  ];
  for (const [x, z, w2, h2] of shapes) {
    const box2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, w2 * 0.7), far);
    box2.position.set(x, h2 / 2, z);
    scene.add(box2);
  }
  // a crane arm over the yard, mostly out of frame
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 34, 1.2), far);
  mast.position.set(-70, 17, -46);
  scene.add(mast);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(26, 1.1, 1.1), far);
  arm.position.set(-58, 33, -46);
  scene.add(arm);
}

function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xbcd0e4, 0x3a3a36, 1.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9b0, 2.9);
  sun.position.set(24, 38, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8fb6d8, 0.5);
  fill.position.set(-20, 16, 22);
  scene.add(fill);

  const posts = [
    { x: 20, z: 4 }, { x: -20, z: 4 }, { x: 0, z: -1 }, { x: 0, z: 18 },
  ];
  const metalMat = MATERIALS.container();
  for (const p of posts) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), metalMat);
    pole.position.set(p.x, 2.6, p.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x1c2226, emissive: 0xffd9a0, emissiveIntensity: 2.4 }));
    head.position.set(p.x, 5.15, p.z);
    scene.add(head);
    const lamp = new THREE.PointLight(0xffd2a0, 26, 22, 2);
    lamp.position.set(p.x, 4.9, p.z);
    scene.add(lamp);
  }
}

// Barrels, pipes and site signage: the small stuff that makes a grey box yard read as a place.
function decorate(scene, colliders) {
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3f5f52, roughness: 0.7, metalness: 0.25 });
  const barrelMat2 = new THREE.MeshStandardMaterial({ color: 0x7a4a34, roughness: 0.75, metalness: 0.2 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x22282b, roughness: 0.6, metalness: 0.5 });
  const spots = [
    [8.2, 6.4, 0], [7.4, 7.6, 1], [9.4, 12.6, 0],
    [-8.2, 6.4, 1], [-7.4, 7.6, 0], [-9.4, 12.6, 1],
    [12.2, 13.8, 0], [-12.2, 13.8, 1], [23.4, -8.2, 1], [-23.4, -8.2, 0],
  ];
  for (const [x, z, variant] of spots) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.92, 12), variant ? barrelMat2 : barrelMat);
    barrel.position.set(x, 0.46, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    scene.add(barrel);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.022, 6, 14), ringMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(x, 0.7, z);
    scene.add(hoop);
    colliders.push({ minX: x - 0.36, maxX: x + 0.36, minZ: z - 0.36, maxZ: z + 0.36, maxY: 0.92 });
  }

  // pipes running along the tall walls, high enough to walk under
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a6266, roughness: 0.55, metalness: 0.45 });
  for (const [x, z, len, axis] of [[13.4, -0.4, 26, 'z'], [-13.4, -0.4, 26, 'z'], [24.6, 6, 30, 'x'], [-24.6, 6, 30, 'x']]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 8), pipeMat);
    // a cylinder is built along Y: one rotation puts it along X, the other along Z
    if (axis === 'x') pipe.rotation.z = Math.PI / 2;
    else pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 3.4, z);
    scene.add(pipe);
  }

  // site signage: a painted plate on the wall beside each site
  for (const site of Object.values(SITES)) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = site.name === 'A' ? '#241f1a' : '#1a2028';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = site.name === 'A' ? '#d8a05a' : '#6f9fd8';
    g.font = '700 92px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(site.name, 128, 70);
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 5;
    g.strokeRect(6, 6, 244, 116);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(site.x + (site.name === 'A' ? 3.2 : -3.2), 3.4, site.z - 9.8);
    scene.add(sign);
  }
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0x1b232c);
  scene.fog = new THREE.Fog(0x6b6660, 44, 100);

  makeSky(scene);
  makeFloor(scene);
  makeLights(scene);

  const group = new THREE.Group();
  const colliders = [];
  for (const b of BRUSHES) addProp(scene, group, colliders, b);
  scene.add(group);
  decorate(scene, colliders);

  return {
    colliders,
    group,
    sites: SITES,
    spawns: SPAWNS,
    bounds: BOUNDS,
    meshes: group,
  };
}

export function isBlocked(colliders, x, z, radius) {
  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
  }
  return false;
}
