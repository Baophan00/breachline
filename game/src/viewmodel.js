// The first-person view model: a stylised gun and two gloved hands parented to the camera, with
// sway, bob, kick and a muzzle flash. Nothing here is loaded from disk; it is all boxes.
import * as THREE from 'three';

const MATS = {
  body: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.48, metalness: 0.55 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x2b2f32, roughness: 0.85 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.92 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x3c4348, roughness: 0.95 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xb98f6f, roughness: 0.85 }),
  sight: new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: 0.4, metalness: 0.6 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

function rifleModel() {
  const g = new THREE.Group();
  g.add(box(0.09, 0.11, 0.62, MATS.body, 0, 0, -0.1));          // receiver
  g.add(box(0.045, 0.045, 0.5, MATS.body, 0, 0.015, -0.55));    // barrel
  g.add(box(0.055, 0.05, 0.2, MATS.sight, 0, 0.085, -0.05));    // rail
  g.add(box(0.075, 0.16, 0.1, MATS.grip, 0, -0.11, 0.02));      // grip
  g.add(box(0.06, 0.2, 0.11, MATS.grip, 0, -0.13, -0.2));       // magazine
  g.add(box(0.08, 0.09, 0.22, MATS.wood, 0, 0.005, 0.28));      // stock
  g.add(box(0.02, 0.07, 0.02, MATS.sight, 0, 0.115, -0.45));    // front post
  return g;
}

function pistolModel() {
  const g = new THREE.Group();
  g.add(box(0.07, 0.1, 0.28, MATS.body, 0, 0, -0.02));
  g.add(box(0.045, 0.045, 0.1, MATS.sight, 0, 0.01, -0.2));
  g.add(box(0.06, 0.14, 0.09, MATS.grip, 0, -0.1, 0.06));
  return g;
}

function shotgunModel() {
  const g = new THREE.Group();
  g.add(box(0.1, 0.12, 0.5, MATS.body, 0, 0, -0.05));
  g.add(box(0.05, 0.05, 0.55, MATS.body, 0, 0.03, -0.45));
  g.add(box(0.07, 0.07, 0.3, MATS.wood, 0, -0.03, -0.4));
  g.add(box(0.09, 0.1, 0.24, MATS.wood, 0, -0.01, 0.3));
  return g;
}

function smgModel() {
  const g = new THREE.Group();
  g.add(box(0.08, 0.1, 0.4, MATS.body, 0, 0, -0.05));
  g.add(box(0.04, 0.04, 0.2, MATS.body, 0, 0.01, -0.32));
  g.add(box(0.055, 0.18, 0.08, MATS.grip, 0, -0.12, 0.02));
  g.add(box(0.05, 0.16, 0.09, MATS.grip, 0, -0.1, -0.14));
  return g;
}

function knifeModel() {
  const g = new THREE.Group();
  g.add(box(0.03, 0.03, 0.22, MATS.sight, 0, 0, -0.1));
  g.add(box(0.05, 0.05, 0.12, MATS.grip, 0, 0, 0.06));
  return g;
}

const BUILDS = { rifle: rifleModel, smg: smgModel, shotgun: shotgunModel, pistol: pistolModel, melee: knifeModel };

export function createViewmodel({ camera, scene }) {
  const root = new THREE.Group();
  camera.add(root);
  scene.add(camera);

  // the model is scaled, not its parent: scaling the root would scale the offset from the
  // camera too, which once put the muzzle 30 cm from the lens
  const base = new THREE.Vector3(0.23, -0.19, -0.62);
  let model = null;
  let weaponType = 'pistol';
  let bob = 0;
  let swayX = 0;
  let swayY = 0;
  let kick = 0;
  let reloadT = 0;
  let flashTime = 0;

  // a small additive quad at the muzzle and a short-lived light; anything bigger reads as a
  // white diamond floating in the scene rather than a flash
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.085),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.23, -0.13, -0.95);
  root.add(flash);

  const flashLight = new THREE.PointLight(0xffcf90, 0, 4.5, 2);
  flashLight.position.set(0.2, -0.1, -0.85);
  root.add(flashLight);

  function mount(type) {
    weaponType = type;
    if (model) root.remove(model);
    const build = BUILDS[type] ?? BUILDS.rifle;
    model = build();
    model.scale.setScalar(0.5);
    model.position.copy(base);
    model.rotation.set(0.02, 0.1, 0);
    root.add(model);

    // hands: one on the grip, one under the barrel
    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), MATS.glove);
    rightHand.position.set(0.02, -0.09, 0.06);
    model.add(rightHand);
    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), MATS.glove);
    leftHand.position.set(-0.01, -0.07, -0.36);
    model.add(leftHand);
    // forearm reaching in from the bottom right, gloved at the wrist
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.34), MATS.sleeve);
    forearm.position.set(0.035, -0.16, 0.22);
    forearm.rotation.set(0.18, 0.06, 0.1);
    model.add(forearm);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.095, 0.06), MATS.glove);
    cuff.position.set(0.025, -0.1, 0.08);
    model.add(cuff);
  }

  mount('pistol');

  function fire(power = 1) {
    kick = Math.min(0.09, kick + 0.055 * power);
    flashTime = 0.04;
    flash.material.opacity = 0.7;
    flash.rotation.z = Math.random() * Math.PI;
    flash.scale.setScalar(0.8 + Math.random() * 0.5);
    flashLight.intensity = 0.9;
  }

  function startReload(def) {
    reloadT = def?.reload ?? 2;
  }

  function update(dt, { moving = 0, firing = false, crouch = false, pitch = 0, alive = true }) {
    if (!model) return;
    bob += dt * (6 + moving * 7);
    const bobX = Math.cos(bob) * 0.012 * moving;
    const bobY = Math.sin(bob * 2) * 0.008 * moving;

    // gun drifts against the mouse, then springs back
    swayX += (-swayX) * Math.min(1, dt * 6);
    swayY += (-swayY) * Math.min(1, dt * 6);

    kick = Math.max(0, kick - dt * 0.55);
    reloadT = Math.max(0, reloadT - dt);
    const reloadDip = reloadT > 0 ? Math.sin(Math.min(1, reloadT / 0.5) * Math.PI) * 0.12 : 0;

    const crouchDrop = crouch ? 0.02 : 0;
    model.position.set(
      base.x + bobX + swayX,
      base.y + bobY + swayY - crouchDrop - reloadDip,
      base.z + kick * 0.35,
    );
    model.rotation.set(0.02 + kick * 0.9 + pitch * 0.12 + reloadDip * 2.2, 0.06 + swayX * 0.6, -swayY * 0.5 + reloadDip * 0.6);
    model.visible = alive;

    if (flashTime > 0) {
      flashTime -= dt;
      flash.material.opacity = Math.max(0, flashTime / 0.04) * 0.7;
      flashLight.intensity = Math.max(0, flashTime / 0.04) * 0.9;
    } else if (flash.material.opacity !== 0) {
      flash.material.opacity = 0;
      flashLight.intensity = 0;
    }
  }

  function addSway(dx, dy) {
    swayX = Math.max(-0.02, Math.min(0.02, swayX + dx * 0.00035));
    swayY = Math.max(-0.015, Math.min(0.015, swayY + dy * 0.0003));
  }

  return { mount, fire, update, startReload, addSway, root, get type() { return weaponType; } };
}
