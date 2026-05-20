/* Per-category mini 3D models. Replaces the emoji in each .category-card with
 * a small Three.js scene of a unique low-poly model. Faster spin on hover.
 * Skipped (emoji left in place) if the user prefers reduced motion or WebGL
 * fails to init.
 */
import * as THREE from "./lib/three.module.min.js";

const ACCENT = 0xc9a96e;
const ACCENT_DARK = 0xb8923d;
const DARK = 0x16213e;

// ----- model builders --------------------------------------------------------

function makeApartment() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 1.6, 0.6),
    new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.4, roughness: 0.45 })
  );
  // Glowing window grid on the front face.
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfff8d6, emissive: 0xfff4c2, emissiveIntensity: 0.65, metalness: 0.1, roughness: 0.2,
  });
  for (let y = -0.55; y <= 0.55; y += 0.275) {
    for (let x = -0.25; x <= 0.25; x += 0.25) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.02), winMat);
      w.position.set(x, y, 0.31);
      g.add(w);
    }
  }
  g.add(body);
  return g;
}

function makeVilla() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.75, 0.95),
    new THREE.MeshStandardMaterial({ color: 0xe8d5b7, metalness: 0.15, roughness: 0.7 })
  );
  body.position.y = -0.25;
  // Pyramid roof.
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.0, 0.55, 4),
    new THREE.MeshStandardMaterial({ color: 0x8b3a1a, metalness: 0.2, roughness: 0.6 })
  );
  roof.position.y = 0.4;
  roof.rotation.y = Math.PI / 4;
  // Door.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.4, 0.02),
    new THREE.MeshStandardMaterial({ color: ACCENT_DARK })
  );
  door.position.set(0, -0.4, 0.49);
  // Windows.
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfff8d6, emissive: 0xfff4c2, emissiveIntensity: 0.5,
  });
  for (const x of [-0.45, 0.45]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.02), winMat);
    w.position.set(x, -0.2, 0.49);
    g.add(w);
  }
  g.add(body, roof, door);
  return g;
}

function makeLand() {
  const g = new THREE.Group();
  // Hexagonal grass plot.
  const land = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.15, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b8e23, metalness: 0.05, roughness: 0.95 })
  );
  land.position.y = -0.55;
  // Tree.
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.9 })
  );
  trunk.position.set(0.15, -0.25, 0.1);
  const leaves = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 0),
    new THREE.MeshStandardMaterial({ color: 0x2d8f6f, roughness: 0.7 })
  );
  leaves.position.set(0.15, 0.1, 0.1);
  // Stake / marker.
  const stake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.7 })
  );
  stake.position.set(-0.4, -0.2, -0.2);
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.15, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xd94f4f })
  );
  flag.position.set(-0.27, 0.0, -0.2);
  g.add(land, trunk, leaves, stake, flag);
  return g;
}

function makeOffice() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.4, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x5b7fb8, metalness: 0.75, roughness: 0.25 })
  );
  // Window grid on front.
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xe6f0ff, emissive: 0xfff8d6, emissiveIntensity: 0.4,
    metalness: 0.2, roughness: 0.15,
  });
  for (let y = -0.55; y <= 0.55; y += 0.22) {
    for (let x = -0.36; x <= 0.36; x += 0.18) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.02), winMat);
      w.position.set(x, y, 0.36);
      g.add(w);
    }
  }
  g.add(body);
  return g;
}

const BUILDERS = { Daire: makeApartment, Villa: makeVilla, Arsa: makeLand, Ofis: makeOffice };

// ----- init ------------------------------------------------------------------

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!prefersReducedMotion) {
  document.querySelectorAll(".category-card").forEach(initCard);
}

function initCard(card) {
  const type = card.dataset.type;
  const make = BUILDERS[type];
  if (!make) return;
  const emojiEl = card.querySelector(".category-emoji");
  if (!emojiEl) return;

  // Drop in a canvas where the emoji used to live.
  const canvas = document.createElement("canvas");
  canvas.className = "category-canvas";
  canvas.setAttribute("aria-hidden", "true");
  emojiEl.replaceWith(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: "low-power",
    });
  } catch (e) {
    // WebGL unavailable → put the emoji back.
    canvas.replaceWith(emojiEl);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.4, 3.6);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4d6, 1.0);
  key.position.set(2.5, 3.5, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88a8ff, 0.35);
  rim.position.set(-2.5, -1, 2);
  scene.add(rim);

  const model = make();
  scene.add(model);

  // Hover → spin faster.
  let hovered = false;
  card.addEventListener("pointerenter", () => { hovered = true; });
  card.addEventListener("pointerleave", () => { hovered = false; });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w * renderer.getPixelRatio()
     || canvas.height !== h * renderer.getPixelRatio()) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  let raf;
  function animate(now) {
    raf = requestAnimationFrame(animate);
    resize();
    model.rotation.y += hovered ? 0.025 : 0.008;
    model.rotation.x = Math.sin(now * 0.0006) * 0.08;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(animate);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(animate);
    }
  });
}
