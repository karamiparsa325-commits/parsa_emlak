/* Hero WebGL scene — slowly-drifting gold low-poly shapes on top of the hero photo.
 * Mouse parallax, paused when the tab is hidden, skipped if the user prefers reduced
 * motion. Self-hosted Three.js so CSP `script-src 'self'` covers it.
 */
import * as THREE from "./lib/three.module.min.js";

const canvas = document.getElementById("hero-canvas");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && !prefersReducedMotion) {
  init(canvas);
}

function init(canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 8;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,            // transparent background — hero photo shows through
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  // -------- shapes --------
  const ACCENT = 0xc9a96e;            // matches --accent
  const SHAPES = 14;

  // One material, shared. metalness + roughness gives the gilded look.
  const mat = new THREE.MeshStandardMaterial({
    color: ACCENT,
    metalness: 0.85,
    roughness: 0.25,
    transparent: true,
    opacity: 0.72,
  });

  const meshes = [];
  for (let i = 0; i < SHAPES; i++) {
    const r = Math.random();
    const size = 0.35 + Math.random() * 0.4;
    let geo;
    if (r < 0.33) geo = new THREE.IcosahedronGeometry(size, 0);
    else if (r < 0.66) geo = new THREE.OctahedronGeometry(size);
    else geo = new THREE.TetrahedronGeometry(size);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 5 - 1
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.userData = {
      rotX: (Math.random() - 0.5) * 0.005,
      rotY: (Math.random() - 0.5) * 0.006,
      bobAmp: 0.3 + Math.random() * 0.5,
      bobSpeed: 0.0003 + Math.random() * 0.0004,
      bobOffset: Math.random() * Math.PI * 2,
      baseY: 0,
    };
    mesh.userData.baseY = mesh.position.y;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // -------- lights --------
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xfff4d6, 0.95);
  key.position.set(5, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6b8bff, 0.45);
  rim.position.set(-6, -2, 3);
  scene.add(rim);

  // -------- mouse parallax --------
  let mx = 0, my = 0;
  const wrap = canvas.parentElement;
  wrap.addEventListener("pointermove", (e) => {
    const r = wrap.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    my = ((e.clientY - r.top) / r.height) * 2 - 1;
  }, { passive: true });

  // -------- resize: keep canvas matching its CSS box exactly --------
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

  // -------- render loop --------
  let raf;
  function animate(now) {
    raf = requestAnimationFrame(animate);
    resize();

    for (const m of meshes) {
      m.rotation.x += m.userData.rotX;
      m.rotation.y += m.userData.rotY;
      m.position.y = m.userData.baseY +
        Math.sin(now * m.userData.bobSpeed + m.userData.bobOffset) * m.userData.bobAmp;
    }

    // Subtle camera nudge from the mouse — capped so the scene never tilts too far.
    const targetX = mx * 1.4;
    const targetY = -my * 0.9;
    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(animate);

  // Pause when the tab is hidden — saves battery, no rAF callbacks fire anyway,
  // but this keeps the math from queuing up.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(animate);
    }
  });
}
