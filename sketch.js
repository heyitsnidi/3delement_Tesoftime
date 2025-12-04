// src/main.js
// Tesseract of Time — Three.js implementation (lightweight, no external GUI libs)

import * as THREE from 'https://unpkg.com/three@0.156.0/build/three.module.js';

// Utilities
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Scene & renderer scaffold
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Camera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(0, 0, 1000);

// Root group for global tesseract-like motion
const tGroup = new THREE.Group();
scene.add(tGroup);

// Zones color palettes and blending behavior
const ZONES = {
  PAST: { id: 'PAST', base: 0x525252, alpha: 0.35, blending: THREE.NormalBlending },
  PRESENT: { id: 'PRESENT', base: 0xeaeff6, alpha: 0.95, blending: THREE.NormalBlending },
  NEAR: { id: 'NEAR', base: 0x8de4d8, alpha: 0.8, blending: THREE.NormalBlending },
  FAR: { id: 'FAR', base: 0xb88cf6, alpha: 0.9, blending: THREE.AdditiveBlending }
};

// Data structure for panels
const panels = [];

// Panel layout config: we'll create a small tesseract-like cluster with panels grouped in 4 zones
const PANEL_CONFIGS = [
  { zone: ZONES.PAST, count: 6, radius: 240, yOffset: -120, texts: ['memory', 'echo', 'yesterday'] },
  { zone: ZONES.PRESENT, count: 8, radius: 0, yOffset: 0, texts: ['now', 'present', 'breathe'] },
  { zone: ZONES.NEAR, count: 6, radius: 220, yOffset: 110, texts: ['soon', 'almost', 'near'] },
  { zone: ZONES.FAR, count: 4, radius: 380, yOffset: 60, texts: ['future', 'echoes', 'beyond'] }
];

// Create text texture helper (canvas)
function createTextTexture(text, bgColor, fgColor, opacity = 1) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // background with slight transparency
  ctx.fillStyle = `rgba(${(bgColor >> 16) & 0xff}, ${(bgColor >> 8) & 0xff}, ${bgColor & 0xff}, ${opacity})`;
  ctx.fillRect(0, 0, size, size);

  // text
  ctx.fillStyle = fgColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // responsive font size based on text length
  const fontSize = Math.floor(size * 0.12);
  ctx.font = `bold ${fontSize}px sans-serif`;
  wrapText(ctx, text, size / 2, size / 2, size * 0.8, fontSize * 1.1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// text wrapping helper
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let testY = y - lineHeight;
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  const startY = testY - (lines.length - 1) * (lineHeight / 2);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}

// Build panels and place them in 3D around center
function buildPanels() {
  const baseGeom = new THREE.PlaneGeometry(260, 160, 1, 1);
  PANEL_CONFIGS.forEach((cfg, ci) => {
    for (let i = 0; i < cfg.count; i++) {
      const angle = (i / cfg.count) * Math.PI * 2 + (ci * 0.25);
      const radius = cfg.radius;
      const x = Math.cos(angle) * (radius + (Math.random() - 0.5) * 30);
      const y = cfg.yOffset + (Math.sin(angle * 1.3) * 40) + (Math.random() - 0.5) * 20;
      const z = Math.sin(angle) * (radius * 0.6) + (Math.random() - 0.5) * 80;

      const texts = [...cfg.texts]; // copy
      // ensure at least two states
      if (texts.length < 2) texts.push(texts[0]);

      const frontTex = createTextTexture(texts[0], cfg.zone.base, '#111111', cfg.zone.alpha);
      const mat = new THREE.MeshBasicMaterial({
        map: frontTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        blending: cfg.zone.blending,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(baseGeom, mat);
      mesh.position.set(x, y, z);
      // random initial rotation for variety
      mesh.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.2);

      // panel data
      const panel = {
        mesh,
        zone: cfg.zone,
        texts,
        current: 0,
        flip: { active: false, start: 0, duration: 700, axis: 'y' },
        frontTexture: frontTex
      };

      // small subtle card bevel simulated by border: create a thin border plane (backdrop)
      const backMat = new THREE.MeshBasicMaterial({
        color: cfg.zone.base,
        transparent: true,
        opacity: cfg.zone.alpha * 0.65,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(266, 166), backMat);
      backPlane.position.set(0, 0, -0.5);
      mesh.add(backPlane);

      tGroup.add(mesh);
      panels.push(panel);
    }
  });
}

// flip a panel to next state
function triggerFlip(panel, speedFactor = 1.0, axis = 'y') {
  if (panel.flip.active) return; // already flipping
  panel.flip.active = true;
  panel.flip.start = performance.now();
  panel.flip.duration = clamp(400 * (1 / speedFactor), 360, 1100);
  panel.flip.axis = axis;
}

// Update flip animations (swap texture at mid-flip)
function updateFlips(now) {
  panels.forEach(p => {
    if (!p.flip.active) return;
    const elapsed = now - p.flip.start;
    const t = clamp(elapsed / p.flip.duration, 0, 1);
    const eased = easeInOutQuad(t);
    const rot = eased * Math.PI; // rotate 0..PI
    if (p.flip.axis === 'y') p.mesh.rotation.y = rot + (p.mesh.rotation.y - (p.mesh.rotation.y % (2 * Math.PI)));
    else p.mesh.rotation.x = rot + (p.mesh.rotation.x - (p.mesh.rotation.x % (2 * Math.PI)));

    // halfway through, swap to next text once
    if (!p._swapped && t >= 0.5) {
      p._swapped = true;
      p.current = (p.current + 1) % p.texts.length;
      const newTex = createTextTexture(p.texts[p.current], p.zone.base, '#111111', p.zone.alpha);
      p.mesh.material.map = newTex;
      p.mesh.material.needsUpdate = true;
      p.frontTexture = newTex;
    }

    if (t >= 1) {
      p.flip.active = false;
      p._swapped = false;
      // normalize rotation to 0..2PI range and keep final orientation
      if (p.flip.axis === 'y') p.mesh.rotation.y = p.mesh.rotation.y % (Math.PI * 2);
      else p.mesh.rotation.x = p.mesh.rotation.x % (Math.PI * 2);
    }
  });
}

// Global rotation/orbit
let globalRotation = { x: 0.12, y: 0.02 };

// Interaction: raycaster for clicks
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function onPointerMove(evt) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (evt.clientX - rect.left) / rect.width;
  const y = (evt.clientY - rect.top) / rect.height;
  pointer.x = x * 2 - 1;
  pointer.y = - (y * 2 - 1);

  // parallax target camera offset
  targetCamX = (x - 0.5) * 120;
  targetCamY = (y - 0.5) * 60;

  lastInteraction = performance.now();
}
function onPointerDown(evt) {
  // click / tap: test intersected panel and trigger faster flip
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (evt.clientX - rect.left) / rect.width;
  const y = (evt.clientY - rect.top) / rect.height;
  pointer.x = x * 2 - 1;
  pointer.y = - (y * 2 - 1);

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(tGroup.children, true);
  if (intersects.length > 0) {
    // find top-level panel mesh parent
    let hit = intersects[0].object;
    while (hit && !panels.find(p => p.mesh === hit)) {
      hit = hit.parent;
    }
    const panel = panels.find(p => p.mesh === hit);
    if (panel) {
      triggerFlip(panel, 2.2, Math.random() < 0.5 ? 'x' : 'y');
      lastInteraction = performance.now();
    }
  }
}

// camera parallax smoothing
let camX = 0, camY = 0, targetCamX = 0, targetCamY = 0;
function updateCameraLerp(dt) {
  camX += (targetCamX - camX) * clamp(dt * 0.01, 0.06, 0.45);
  camY += (targetCamY - camY) * clamp(dt * 0.01, 0.06, 0.45);
  camera.position.x = camX;
  camera.position.y = camY;
  camera.lookAt(0, 0, 0);
}

// inactivity & auto-cycling
let lastInteraction = performance.now();
let lastAutoFlip = performance.now();
const IDLE_THRESHOLD = 5000; // ms
const AUTO_FLIP_INTERVAL = 1400; // ms when idle

// minimal UI
document.getElementById('pauseBtn').addEventListener('click', e => {
  paused = !paused;
  e.target.innerText = paused ? 'Resume' : 'Pause';
});
document.getElementById('randomBtn').addEventListener('click', _ => {
  const p = panels[Math.floor(Math.random() * panels.length)];
  triggerFlip(p, 2.4, Math.random() < 0.5 ? 'x' : 'y');
  lastInteraction = performance.now();
});

// build the scene
buildPanels();

// animation loop
let paused = false;
let last = performance.now();
function animate(now = performance.now()) {
  const dt = now - last;
  last = now;

  if (!paused) {
    // gentle global rotation, slightly responsive to time
    tGroup.rotation.y += globalRotation.y * (1 + Math.sin(now * 0.0004) * 0.6);
    tGroup.rotation.x += globalRotation.x * 0.0006;

    // update flips
    updateFlips(now);

    // auto flips when idle
    const idle = now - lastInteraction;
    if (idle > IDLE_THRESHOLD && (now - lastAutoFlip) > AUTO_FLIP_INTERVAL) {
      const chance = 0.55; // biased to flip
      if (Math.random() < chance) {
        const p = panels[Math.floor(Math.random() * panels.length)];
        triggerFlip(p, clamp(0.5 + (Math.random() * 2.5), 0.6, 3.2), Math.random() < 0.5 ? 'x' : 'y');
      }
      lastAutoFlip = now;
    }

    // camera parallax damping
    updateCameraLerp(dt);

    // subtle overlapping additive pulsing for FAR zone panels
    const glow = (1 + Math.sin(now * 0.002)) * 0.5;
    panels.forEach(p => {
      if (p.zone.id === 'FAR') {
        p.mesh.material.opacity = clamp(0.6 + glow * 0.4, 0.5, 1.2);
      } else {
        p.mesh.material.opacity = 1.0;
      }
    });
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// pointer events
window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerdown', onPointerDown);

// responsive
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// Init small camera jitter and starting tilt
camera.position.set(10, 6, 1000);
tGroup.rotation.set(0.18, 0.04, 0.0);

// initial subtle movement target
targetCamX = 0;
targetCamY = 0;

// Prevent context menu on canvas
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
