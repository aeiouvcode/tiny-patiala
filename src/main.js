// Tiny Patiala v14. A stylized, hand-modelled interpretation of the old city around Qila Mubarak.
// Street and footprint geometry comes from OpenStreetMap-derived data; buildings and the fort are procedural.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import { buildings, roads } from './data.js';

const $ = s => document.querySelector(s);
const TILE = 250; // half-size of the model tile
const rnd = n => { const x = Math.sin(n * 999.17) * 43758.5453; return x - Math.floor(x); };
const inTile = (x, y, m = 0) => Math.abs(x) < TILE - m && Math.abs(y) < TILE - m;
const QILA = { x0: -74, x1: 74, y0: -66, y1: 62 };
const inQila = (x, y, m = 0) => x > QILA.x0 - m && x < QILA.x1 + m && y > QILA.y0 - m && y < QILA.y1 + m;

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const world = new THREE.Group();
world.rotation.x = -Math.PI / 2; // author in z-up, view in y-up
scene.add(world);

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 10, 4000);
const view = { theta: -0.62, phi: 0.92, dist: 520, target: new THREE.Vector3(0, 8, 6) };
function frameDist() { const a = innerWidth / innerHeight; return a < 0.8 ? 470 / Math.max(a, 0.42) * 0.62 : 520; }
view.dist = frameDist();
function placeCamera() {
  const { theta, phi, dist, target } = view;
  camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
  camera.lookAt(target);
}
placeCamera();

// ---------- sky ----------
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 2; skyCanvas.height = 256;
const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
const DAY = { top: '#b9d3e4', mid: '#e8e1d0', low: '#f3e3c8', fog: '#ecdcc2' };
const NIGHT = { top: '#0b1424', mid: '#1b2940', low: '#3a3b4a', fog: '#1c2433' };
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
scene.fog = new THREE.Fog(DAY.fog, 520, 1500);
function paintSky(t) {
  const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#' + lerpC(DAY.top, NIGHT.top, t).getHexString());
  gr.addColorStop(0.55, '#' + lerpC(DAY.mid, NIGHT.mid, t).getHexString());
  gr.addColorStop(1, '#' + lerpC(DAY.low, NIGHT.low, t).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true;
  scene.fog.color.copy(lerpC(DAY.fog, NIGHT.fog, t));
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight('#fff4e0', '#8a7358', 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d2', 3.0);
sun.position.set(-260, 420, 180); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 50, far: 1200 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
const moonFill = new THREE.DirectionalLight('#7f9bd0', 0); moonFill.position.set(200, 300, -200); scene.add(moonFill);
const nightLights = [];

// ---------- procedural textures ----------
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; t.repeat.set(...repeat); return t;
}
function speckle(g, w, h, n, col, a) { g.fillStyle = col; for (let i = 0; i < n; i++) { g.globalAlpha = a * rnd(i + 3); g.fillRect(rnd(i) * w, rnd(i + 7) * h, 1 + rnd(i + 9) * 2, 1 + rnd(i + 11) * 2); } g.globalAlpha = 1; }
function archPath(g, x, y, w, h) { // pointed (four-centred-ish) arch, base at y+h
  g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w * 0.45);
  g.quadraticCurveTo(x, y, x + w / 2, y - w * 0.12); g.quadraticCurveTo(x + w, y, x + w, y + w * 0.45);
  g.lineTo(x + w, y + h); g.closePath();
}
// Outer fort wall: weathered lime plaster going grey, with rain streaks and a darker plinth.
const wallTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b7a58b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.globalAlpha = 0.07 + rnd(i) * 0.1; g.fillStyle = rnd(i + 1) > 0.5 ? '#6f6557' : '#d4c3a6'; g.fillRect(rnd(i + 2) * w, 0, 2 + rnd(i + 5) * 10, h * (0.3 + rnd(i + 4) * 0.7)); }
  g.globalAlpha = 1; g.fillStyle = '#8c7a64'; g.fillRect(0, h * 0.86, w, h * 0.14);
  g.fillStyle = '#d8c8ab'; g.fillRect(0, 0, w, 8); speckle(g, w, h, 900, '#4e463c', 0.25);
});
// Darshani Gate front: cream stucco, two tiers of cusped niches, big pointed portal, reddish lower band.
const gateFront = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#eadfc9'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b8614a'; g.globalAlpha = 0.55; g.fillRect(0, h * 0.8, w, h * 0.2); g.globalAlpha = 1;
  g.strokeStyle = '#c9b89a'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#d9c9aa'; g.fillRect(0, 0, 26, h); g.fillRect(w - 26, 0, 26, h); // corner piers
  const tier = (y, hh, n) => { const cw = (w - 80) / n; for (let i = 0; i < n; i++) { if (y > 250 && i >= n / 2 - 1.5 && i <= n / 2 + 0.5) continue; const x = 40 + i * cw + cw * 0.18; g.fillStyle = '#d2c09f'; archPath(g, x, y, cw * 0.64, hh); g.fill(); g.fillStyle = '#a99576'; archPath(g, x + 5, y + 8, cw * 0.64 - 10, hh - 12); g.fill(); } };
  tier(50, 70, 8); tier(160, 70, 8); tier(300, 80, 8);
  g.fillStyle = '#cdb99a'; archPath(g, w / 2 - 92, 250, 184, 262); g.fill(); // portal frame
  g.fillStyle = '#e2d4b8'; archPath(g, w / 2 - 78, 268, 156, 244); g.fill();
  g.fillStyle = '#2d241d'; archPath(g, w / 2 - 56, 318, 112, 194); g.fill(); // dark opening
  speckle(g, w, h, 1400, '#6d5d49', 0.22);
});
// Pinkish inner palace plaster with arcades.
function arcadeTex(base, shade, dark) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = shade; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 8, w, 8);
    g.fillStyle = dark; archPath(g, 26, 36, 76, 84); g.fill();
    g.fillStyle = shade; g.fillRect(0, 12, 10, h); g.fillRect(w - 10, 12, 10, h);
    speckle(g, w, h, 260, '#5b4538', 0.18);
  });
}
const pinkArcade = arcadeTex('#d9aa99', '#c4927f', '#6e4a41');
const creamArcade = arcadeTex('#e8dcc4', '#d1c2a3', '#6f5f4e');
const ochreArcade = arcadeTex('#dcb67f', '#c49c63', '#6d5337');
const openGallery = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#eee4d0'; g.fillRect(0, 0, w, h); g.fillStyle = '#3b3129'; for (let i = 0; i < 4; i++) { archPath(g, 8 + i * 30, 16, 22, 44); g.fill(); } });
function texMat(t, color = '#ffffff', rough = 0.92) { return new THREE.MeshStandardMaterial({ map: t, color, roughness: rough }); }

// ---------- ground tile ----------
const groundTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#d6c3a0'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 180; i++) { g.globalAlpha = 0.05 + rnd(i + 20) * 0.07; g.fillStyle = rnd(i + 21) > 0.6 ? '#b39c77' : '#e6d6b8'; const r = 10 + rnd(i + 22) * 50; g.beginPath(); g.arc(rnd(i + 23) * w, rnd(i + 24) * h, r, 0, 7); g.fill(); }
  g.globalAlpha = 1; speckle(g, w, h, 3000, '#8c7658', 0.3);
}, [4, 4]);
const tileMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
const strata = canvasTex(64, 128, (g, w, h) => { const b = ['#c9ad7f', '#a88963', '#8f6f4e', '#76583e', '#5e4633']; b.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h / b.length, w, h / b.length + 1); }); speckle(g, w, h, 300, '#3c2c20', 0.3); }, [16, 1]);
const sideMat = new THREE.MeshStandardMaterial({ map: strata, roughness: 1 });
{
  const slab = new THREE.Mesh(new THREE.BoxGeometry(TILE * 2, TILE * 2, 34), [sideMat, sideMat, sideMat, sideMat, tileMat, sideMat]);
  slab.position.z = -17; slab.receiveShadow = true; world.add(slab);
}

// ---------- roads (clipped to tile, merged) ----------
function clipSeg(a, b) { // Liang-Barsky against the tile square
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1], L = TILE - 2;
  const p = [-dx, dx, -dy, dy], q = [a[0] + L, L - a[0], a[1] + L, L - a[1]];
  for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return null; continue; } const r = q[i] / p[i]; if (p[i] < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); if (t0 > t1) return null; }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
const roadSegs = [];
const roadGeo = { edge: [], lane: [], mark: [] };
function ribbon(a, b, w, z) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); const g = new THREE.PlaneGeometry(l + w * 0.9, w); g.rotateZ(Math.atan2(dy, dx)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z); return g; }
roads.forEach((r, ri) => {
  const w = (r.t === 'tertiary' ? 9 : r.t === 'unclassified' ? 7.5 : r.t === 'residential' ? 6 : 4.6);
  const pts = [];
  for (let i = 1; i < r.p.length; i++) {
    const c = clipSeg(r.p[i - 1], r.p[i]); if (!c) continue; const [a, b] = c; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue;
    if (inQila((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -6)) continue;
    roadGeo.edge.push(ribbon(a, b, w + 2.2, 0.06)); roadGeo.lane.push(ribbon(a, b, w, 0.14));
    pts.push(a, b);
    roadSegs.push({ a, b, w, ri });
  }
});
const roadMats = { edge: new THREE.MeshStandardMaterial({ color: '#a8977c', roughness: 1 }), lane: new THREE.MeshStandardMaterial({ color: '#7b7266', roughness: 0.95 }) };
['edge', 'lane'].forEach(k => { const m = new THREE.Mesh(mergeGeometries(roadGeo[k]), roadMats[k]); m.receiveShadow = true; world.add(m); });
function nearRoad(x, y, pad) {
  for (const s of roadSegs) { const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l2 = dx * dx + dy * dy; let t = ((x - s.a[0]) * dx + (y - s.a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); const px = s.a[0] + t * dx - x, py = s.a[1] + t * dy - y; if (px * px + py * py < (s.w / 2 + pad) ** 2) return s; }
  return null;
}

// ---------- city building material with procedural windows and shutters ----------
const nightU = { value: 0 };
function windowMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: false, ...opts });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aB;\nvarying vec3 vWP; varying vec3 vWN; varying vec2 vB;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp_ = vec4(transformed, 1.0); vec3 n_ = objectNormal;
        #ifdef USE_INSTANCING
          wp_ = instanceMatrix * wp_; n_ = mat3(instanceMatrix) * n_;
        #endif
        wp_ = modelMatrix * wp_; vWP = wp_.xyz; vWN = normalize(mat3(modelMatrix) * n_); vB = aB;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vWP; varying vec3 vWN; varying vec2 vB;\nfloat hh(vec3 p){return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453);}')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wall = 1.0 - step(0.55, abs(vWN.y));
        float u = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
        float fh = 3.3; float fl = floor(vWP.y / fh); float fy = fract(vWP.y / fh);
        float cw = 3.1; float cx = floor(u / cw); float fx = fract(u / cw);
        float below = step(vWP.y, vB.x - 1.4);
        float ground = 1.0 - step(0.5, fl);
        float rid = hh(vec3(cx, fl, vB.y * 17.0 + sign(vWN.x) * 3.0 + sign(vWN.z) * 7.0));
        float win = step(0.32, fx) * step(fx, 0.68) * step(0.34, fy) * step(fy, 0.8) * (1.0 - ground);
        float shut = step(0.08, fx) * step(fx, 0.92) * step(0.06, fy) * step(fy, 0.74) * ground * step(0.35, rid);
        float m_ = wall * below;
        win *= m_; shut *= m_;
        diffuseColor.rgb *= 0.84 + 0.16 * smoothstep(0.0, 5.0, vWP.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.17, 0.16) * (0.75 + 0.5 * rid), win * 0.82);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.42,0.36,0.30), vec3(0.30,0.40,0.42), step(0.7, rid)), shut * 0.75);
        float lit_ = win * step(0.72, rid) + shut * step(0.86, rid) * 1.2;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * lit_ * uNight * 0.85;`);
  };
  return m;
}
const cityMat = windowMaterial();
const plasters = ['#e4c9a4', '#d99a78', '#eadbc2', '#c98c6a', '#dcb27c', '#e6b7a0', '#cfd6c7', '#d8c3a5', '#b9c4c6', '#eed9b5'];

// OSM footprints: extruded with parapets
{
  const geos = [];
  buildings.forEach((b, i) => {
    const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length, cy = b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
    if (!inTile(cx, cy, 8) || !b.p.every(p => inTile(p[0], p[1], 3)) || inQila(cx, cy, 6)) return;
    const h = b.h || 6.6 + Math.floor(rnd(i) * 3) * 3.3 + 0.3;
    const s = new THREE.Shape(); b.p.forEach((p, k) => k ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    const col = new THREE.Color(plasters[Math.floor(rnd(i + 3) * plasters.length)]);
    const n = g.attributes.position.count, cols = new Float32Array(n * 3), ab = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { col.toArray(cols, k * 3); ab[k * 2] = h; ab[k * 2 + 1] = rnd(i + 50); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('aB', new THREE.BufferAttribute(ab, 2));
    geos.push(g.toNonIndexed ? g : g);
  });
  const mat = windowMaterial({ vertexColors: true });
  const m = new THREE.Mesh(mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g)), mat); m.castShadow = m.receiveShadow = true; world.add(m);
}

// Dense procedural old-city blocks: fill cells that do not sit on a road.
const blocks = [];
for (let gx = -TILE + 10; gx < TILE - 10; gx += 12) for (let gy = -TILE + 10; gy < TILE - 10; gy += 12) {
  const k = gx * 131 + gy * 7;
  const x = gx + (rnd(k) - 0.5) * 3, y = gy + (rnd(k + 1) - 0.5) * 3;
  if (inQila(x, y, 14)) continue;
  const road = nearRoad(x, y, 4.5); if (road) continue;
  if (rnd(k + 2) < 0.14) continue; // courtyards, gaps and lots
  const w = 8 + rnd(k + 3) * 5, d = 8 + rnd(k + 4) * 5;
  const dist = Math.hypot(x, y); const floors = 1 + Math.floor(rnd(k + 5) * (dist < 140 ? 4 : 3));
  const h = floors * 3.3 + 1.4;
  blocks.push({ x, y, w, d, h, col: plasters[Math.floor(rnd(k + 6) * plasters.length)], seed: rnd(k + 7), rot: (rnd(k + 8) - 0.5) * 0.06 });
}
{
  // unit house: body + parapet lip, instanced
  const body = new THREE.BoxGeometry(1, 1, 1); body.translate(0, 0, 0.5);
  const inst = new THREE.InstancedMesh(body, windowMaterial(), blocks.length);
  const ab = new Float32Array(blocks.length * 2); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  blocks.forEach((b, i) => { M.compose(new THREE.Vector3(b.x, b.y, 0), Q.setFromEuler(E.set(0, 0, b.rot)), new THREE.Vector3(b.w, b.d, b.h)); inst.setMatrixAt(i, M); inst.setColorAt(i, new THREE.Color(b.col)); ab[i * 2] = b.h; ab[i * 2 + 1] = b.seed; });
  body.setAttribute('aB', new THREE.InstancedBufferAttribute(ab, 2));
  inst.castShadow = inst.receiveShadow = true; world.add(inst);
  // parapets (four thin walls) and roof slab, one instanced frame geometry
  const lip = mergeGeometries([[0, 0.47, 1, 0.06], [0, -0.47, 1, 0.06], [0.47, 0, 0.06, 1], [-0.47, 0, 0.06, 1]].map(v => { const g = new THREE.BoxGeometry(v[2], v[3], 1); g.translate(v[0], v[1], 0.5); return g; }));
  const lipI = new THREE.InstancedMesh(lip, new THREE.MeshStandardMaterial({ roughness: 0.9 }), blocks.length);
  const roofI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#b9a589', roughness: 1 }), blocks.length);
  blocks.forEach((b, i) => {
    Q.setFromEuler(E.set(0, 0, b.rot));
    M.compose(new THREE.Vector3(b.x, b.y, b.h), Q, new THREE.Vector3(b.w, b.d, 1.1)); lipI.setMatrixAt(i, M); lipI.setColorAt(i, new THREE.Color(b.col).multiplyScalar(0.93));
    M.compose(new THREE.Vector3(b.x, b.y, b.h - 0.4), Q, new THREE.Vector3(b.w - 0.5, b.d - 0.5, 0.6)); roofI.setMatrixAt(i, M); roofI.setColorAt(i, new THREE.Color('#b8a58b').lerp(new THREE.Color('#8e8578'), rnd(i + 30) * 0.6));
  });
  lipI.castShadow = true; roofI.receiveShadow = true; world.add(lipI, roofI);
  // rooftop life: black water tanks, stair rooms (mumty), a few satellite dishes
  const tanks = blocks.filter((b, i) => rnd(i + 40) < 0.46), mumty = blocks.filter((b, i) => rnd(i + 41) < 0.3);
  const tankI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 0.9, 1.9, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#23262a', roughness: 0.55 }), tanks.length);
  tanks.forEach((b, i) => { M.compose(new THREE.Vector3(b.x + (rnd(i + 60) - 0.5) * b.w * 0.5, b.y + (rnd(i + 61) - 0.5) * b.d * 0.5, b.h + 1.0), Q.identity(), new THREE.Vector3(1, 1, 1)); tankI.setMatrixAt(i, M); });
  const mumI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.9 }), mumty.length);
  mumty.forEach((b, i) => { M.compose(new THREE.Vector3(b.x - b.w * 0.22, b.y + b.d * 0.2, b.h - 0.1), Q.setFromEuler(E.set(0, 0, b.rot)), new THREE.Vector3(3, 3.4, 2.8)); mumI.setMatrixAt(i, M); mumI.setColorAt(i, new THREE.Color(b.col).multiplyScalar(0.96)); });
  tankI.castShadow = mumI.castShadow = true; world.add(tankI, mumI);
}

// ---------- Qila Mubarak ----------
// Interpretation from public photographs: Darshani Gate (cream, cusped niches, bangaldar roofline),
// weathered outer walls with round bastions, Ran Baas and Durbar Hall ranges in the forecourt,
// and the higher, pinkish Qila Androon around courtyards. Not a survey model.
const q = new THREE.Group(); world.add(q); const GATE = {};
const M_ = {
  wall: texMat(wallTex), stone: new THREE.MeshStandardMaterial({ color: '#cbbb9f', roughness: 1 }),
  cream: new THREE.MeshStandardMaterial({ color: '#ece2cf', roughness: 0.9 }), white: new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.75 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2f261f', roughness: 0.9 }), pinkTop: new THREE.MeshStandardMaterial({ color: '#cf9e8c', roughness: 0.95 }),
  earth: new THREE.MeshStandardMaterial({ color: '#b39a78', roughness: 1 }), green: new THREE.MeshStandardMaterial({ color: '#7f9a63', roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: '#7fa7ad', roughness: 0.25, metalness: 0.1 })
};
function faceMats(tex, w, d, h, top, tile = 8) {
  const mk = (len) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(len / tile)), Math.max(1, Math.round(h / tile * 0.9)) || 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }); };
  const mx = mk(d), my = mk(w); return [mx, mx, my, my, top, top];
}
function box(x, y, w, d, h, mat, z = 0, parent = q) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat); o.position.set(x, y, z + h / 2); o.castShadow = o.receiveShadow = true; parent.add(o); return o; }
function cyl(x, y, r0, r1, h, mat, z = 0, seg = 18) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg).rotateX(Math.PI / 2), mat); o.position.set(x, y, z + h / 2); o.castShadow = o.receiveShadow = true; q.add(o); return o; }
function dome(x, y, z, r, mat = M_.white, squash = 1, seg = 16) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mat); o.scale.z = squash; o.position.set(x, y, z); o.castShadow = true; q.add(o); const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.6, 6).rotateX(Math.PI / 2), M_.dark); f.position.set(x, y, z + r * squash + r * 0.25); q.add(f); return o; }
function chhatri(x, y, z, s = 1) { const r = 2.6 * s; for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cyl(x + dx * r * 0.7, y + dy * r * 0.7, 0.32 * s, 0.32 * s, 3.2 * s, M_.white, z, 6); box(x, y, r * 2.1, r * 2.1, 0.5 * s, M_.white, z + 3.2 * s); dome(x, y, z + 3.7 * s, r, M_.white, 0.95); }
function merlons(x0, y0, x1, y1, z, step = 3.2) { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / step); const out = []; for (let i = 0; i <= n; i++) { const t = i / n; out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z]); } return out; }

const { x0, x1, y0, y1 } = { x0: -68, x1: 68, y0: -56, y1: 56 };
const WH = 17, WT = 6;
box(0, y0, x1 - x0, WT, WH, faceMats(wallTex, x1 - x0, WT, WH, M_.stone, 12));
box(0, y1, x1 - x0, WT, WH + 1, faceMats(wallTex, x1 - x0, WT, WH, M_.stone, 12));
box(x0, 0, WT, y1 - y0, WH, faceMats(wallTex, WT, y1 - y0, WH, M_.stone, 12));
box(x1, 0, WT, y1 - y0, WH, faceMats(wallTex, WT, y1 - y0, WH, M_.stone, 12));
const bastions = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [x0, 0], [x1, 0], [-34, y1], [34, y1]];
bastions.forEach(([bx, by], i) => { const big = i < 4; cyl(bx, by, big ? 9.5 : 7, big ? 8.2 : 6.2, WH + (big ? 5 : 2), texMat(wallTex), 0, 24); if (big) chhatri(bx, by, WH + 5, 0.9); });
{
  const pts = [...merlons(x0, y0 - 2.6, -20, y0 - 2.6, WH), ...merlons(20, y0 - 2.6, x1, y0 - 2.6, WH), ...merlons(x0, y1 + 2.6, x1, y1 + 2.6, WH + 1), ...merlons(x0 - 2.6, y0, x0 - 2.6, y1, WH), ...merlons(x1 + 2.6, y0, x1 + 2.6, y1, WH)];
  const mi = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.7, 2.2).translate(0, 0, 1.1), M_.stone, pts.length); const mm = new THREE.Matrix4();
  pts.forEach((p, i) => { mm.makeTranslation(p[0], p[1], p[2]); mi.setMatrixAt(i, mm); }); mi.castShadow = true; q.add(mi);
}
// Darshani Gate
{
  const gw = 36, gd = 18, gh = 30, gy = y0 - 3;
  const plain = M_.cream, front = new THREE.MeshStandardMaterial({ map: gateFront, roughness: 0.9 });
  const sideT = arcadeTex('#e6dac3', '#d2c3a5', '#9e8b70');
  const sides = faceMats(sideT, gw, gd, gh, plain, 7);
  box(0, gy, gw, gd, gh, [sides[0], sides[1], sides[2], front, plain, plain]);
  box(-gw / 2 - 1, gy - gd / 2 + 1, 3, 3, gh + 2, M_.cream); box(gw / 2 + 1, gy - gd / 2 + 1, 3, 3, gh + 2, M_.cream); // corner piers
  box(0, gy - gd / 2 - 0.6, gw + 3, 1.6, 1.2, M_.white, gh - 1); // cornice
  // open pavilion storey with arched openings
  const gal = faceMats(openGallery, gw - 6, gd - 6, 6, M_.cream, 6);
  box(0, gy, gw - 6, gd - 6, 6.5, gal, gh);
  box(0, gy, gw - 4, gd - 4, 0.8, M_.white, gh + 6.5);
  // bangaldar / scalloped roofline: a row of curved domes, larger in the middle
  [[-11, 3.3], [-5.5, 3.3], [0, 4.6], [5.5, 3.3], [11, 3.3]].forEach(([dx, r]) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M_.white); o.scale.set(0.95, 1.35, 0.55); o.position.set(dx, gy, gh + 7.3); o.castShadow = true; q.add(o); });
  chhatri(-gw / 2 + 2, gy - gd / 2 + 2, gh + 7.3, 0.55); chhatri(gw / 2 - 2, gy - gd / 2 + 2, gh + 7.3, 0.55);
  // flag
  cyl(4, gy + 2, 0.15, 0.15, 9, M_.dark, gh + 9, 5);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.1), new THREE.MeshStandardMaterial({ map: canvasTex(6, 6, (g) => { g.fillStyle = '#e8893a'; g.fillRect(0, 0, 6, 2); g.fillStyle = '#f5f2ea'; g.fillRect(0, 2, 6, 2); g.fillStyle = '#3f8a4a'; g.fillRect(0, 4, 6, 2); }), side: THREE.DoubleSide }));
  flag.rotation.x = Math.PI / 2; flag.position.set(5.7, gy + 2, gh + 16.8); q.add(flag); flag.userData.wave = true;
  // jharokha balconies flanking the portal
  for (const dx of [-11.5, 11.5]) { box(dx, gy - gd / 2 - 1.4, 5, 2.8, 5.5, M_.white, 1.2); box(dx, gy - gd / 2 - 1.4, 5.6, 3.2, 0.5, M_.cream, 6.7); dome(dx, gy - gd / 2 - 1.4, 7.2, 2.2, M_.white, 0.8, 12); }
  // steps
  box(0, gy - gd / 2 - 4, 16, 5, 0.9, M_.stone);
  GATE.x = 0; GATE.y = gy - gd / 2; GATE.z = gh;
}
// forecourt: charbagh garden with fountain between gate and inner fort
{
  box(0, -24, 128, 60, 0.35, M_.stone, 0);
  [[-17, -33], [17, -33], [-17, -13], [17, -13]].forEach(([x, y]) => { box(x, y, 26, 14, 0.7, M_.green, 0.3); });
  box(0, -23, 5, 5, 0.9, M_.water, 0.3);
}
// Ran Baas (west) and Durbar Hall (east) ranges
{
  const rb = faceMats(creamArcade, 30, 24, 12, M_.cream, 6); box(-44, -30, 30, 24, 12, rb); box(-44, -30, 31, 25, 1, M_.white, 12);
  chhatri(-54, -38, 13, 0.6); chhatri(-34, -38, 13, 0.6);
  const dh = faceMats(ochreArcade, 30, 28, 15, new THREE.MeshStandardMaterial({ color: '#d7b27c', roughness: 0.95 }), 6); box(44, -28, 30, 28, 15, dh); box(44, -28, 31, 29, 1, M_.white, 15);
  dome(44, -28, 16, 5.5, M_.white, 0.9);
}
// Qila Androon: raised plinth, two courtyards, taller range and ribbed dome
{
  box(0, 28, 118, 44, 4.2, faceMats(wallTex, 118, 44, 4.2, M_.earth, 10));
  const pk = (w, d, h) => faceMats(pinkArcade, w, d, h, M_.pinkTop, 5.5);
  const Z = 4.2;
  // perimeter ranges of two courtyards, west (cx=-28) and east (cx=28)
  for (const cx of [-28, 28]) {
    box(cx, 12, 52, 8, 10, pk(52, 8, 10), Z);  // south range
    box(cx, 45, 52, 8, 14, pk(52, 8, 14), Z);  // north range, taller
    box(cx - 22, 28.5, 8, 25, 12, pk(8, 25, 12), Z); box(cx + 22, 28.5, 8, 25, 12, pk(8, 25, 12), Z);
    box(cx, 28.5, 36, 25, 0.3, M_.stone, Z); // paved court
    box(cx, 28.5, 4, 4, 0.8, M_.water, Z);
  }
  box(0, 45, 22, 12, 22, pk(22, 12, 22), Z); // tall central palace block
  cyl(0, 45, 5.2, 5.2, 3, M_.white, Z + 22, 16);
  { const d = new THREE.Mesh(new THREE.SphereGeometry(5.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d7c7b3', roughness: 0.8, flatShading: true })); d.scale.z = 1.15; d.position.set(0, 45, Z + 25); d.castShadow = true; q.add(d); }
  [[-50, 12], [-6, 12], [6, 12], [50, 12], [-50, 45], [50, 45]].forEach(([x, y]) => chhatri(x, y, Z + (y > 40 ? 14 : 10), 0.62));
  // parapet caps
  [[-28, 12, 52, 8, 10], [28, 12, 52, 8, 10], [-28, 45, 52, 8, 14], [28, 45, 52, 8, 14]].forEach(v => box(v[0], v[1], v[2] + 0.6, v[3] + 0.6, 0.7, M_.white, Z + v[4]));
}

// ---------- trees ----------
{
  const spots = [];
  for (let i = 0; i < 900 && spots.length < 190; i++) {
    const x = (rnd(i + 400) - 0.5) * 2 * (TILE - 8), y = (rnd(i + 700) - 0.5) * 2 * (TILE - 8);
    if (inQila(x, y, 4) && !(y < -12 && y > -46 && Math.abs(x) < 34)) continue;
    const onRoad = nearRoad(x, y, 1.5); const nearR = nearRoad(x, y, 7);
    if (onRoad || (!nearR && rnd(i + 5) < 0.75)) continue;
    spots.push([x, y, 0.8 + rnd(i + 9) * 0.7, i]);
  }
  // three forecourt trees in the garden
  [[-30, -23], [30, -23], [0, -40]].forEach(([x, y], k) => spots.push([x, y, 1.1, 2000 + k]));
  const lobe = mergeGeometries([[0, 0, 0, 1], [1.6, 0.6, -0.5, 0.75], [-1.3, 0.9, -0.3, 0.7], [0.2, -1.4, 0.4, 0.72]].map(([x, y, z, s]) => new THREE.IcosahedronGeometry(3.2 * s, 0).translate(x, y, z)));
  lobe.translate(0, 0, 7);
  const trunk = new THREE.CylinderGeometry(0.35, 0.55, 5.5, 6).rotateX(Math.PI / 2).translate(0, 0, 2.75);
  const cI = new THREE.InstancedMesh(lobe, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), spots.length);
  const tI = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#6e5540', roughness: 1 }), spots.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const greens = ['#6f8f4f', '#7c9a58', '#5f8047', '#8aa061', '#6b8a57'];
  spots.forEach(([x, y, s, i], k) => { M.compose(new THREE.Vector3(x, y, 0), Q.setFromEuler(E.set(0, 0, rnd(i) * 6)), new THREE.Vector3(s, s, s)); cI.setMatrixAt(k, M); tI.setMatrixAt(k, M); cI.setColorAt(k, new THREE.Color(greens[k % greens.length])); });
  cI.castShadow = tI.castShadow = true; cI.receiveShadow = true; world.add(cI, tI);
}

// ---------- street lamps ----------
const lampPts = [];
roadSegs.forEach((s, i) => { const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); if (s.w < 5.5) return; const n = Math.floor(l / 26); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = s.a[0] + (s.b[0] - s.a[0]) * t, y = s.a[1] + (s.b[1] - s.a[1]) * t; const nx = -(s.b[1] - s.a[1]) / l, ny = (s.b[0] - s.a[0]) / l; const side = (k % 2 ? 1 : -1) * (s.w / 2 + 1.2); if (lampPts.every(p => Math.hypot(p[0] - x, p[1] - y) > 16)) lampPts.push([x + nx * side, y + ny * side]); } });
const glowTex = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.25, 'rgba(255,180,90,.55)'); gr.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: '#ffb050', emissiveIntensity: 0 });
{
  const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 7, 5).rotateX(Math.PI / 2).translate(0, 0, 3.5), new THREE.MeshStandardMaterial({ color: '#4a4540' }), lampPts.length);
  const bulbI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), bulbMat, lampPts.length);
  const M = new THREE.Matrix4();
  lampPts.forEach(([x, y], i) => { M.makeTranslation(x, y, 0); poleI.setMatrixAt(i, M); M.makeTranslation(x, y, 7.2); bulbI.setMatrixAt(i, M); const sp = new THREE.Sprite(glowMat); sp.position.set(x, y, 7.2); sp.scale.set(7, 7, 1); world.add(sp); });
  world.add(poleI, bulbI);
}
// Night: warm floodlight on the Darshani Gate and lamps in the courtyards.
{
  const g = GATE;
  const flood = new THREE.SpotLight('#ffc98a', 0, 160, 0.55, 0.6, 1.2); flood.position.set(0, g.y - 60, 6); flood.target.position.set(0, g.y, 16); q.add(flood, flood.target); nightLights.push([flood, 420]);
  [[-28, 28.5, 12], [28, 28.5, 12], [0, -23, 8]].forEach(([x, y, z]) => { const p = new THREE.PointLight('#ffb168', 0, 70, 1.6); p.position.set(x, y, z); q.add(p); nightLights.push([p, 160]); });
}

// ---------- traffic: e-rickshaws, autos and cars moving along roads ----------
const cars = [];
{
  const body = new THREE.BoxGeometry(3.2, 1.6, 1.6).translate(0, 0, 1.1), cab = new THREE.BoxGeometry(1.8, 1.5, 1).translate(-0.2, 0, 2.3);
  const vehGeo = mergeGeometries([body, cab]);
  const colors = ['#2f7d5b', '#e2b53a', '#f2efe8', '#b3322a', '#e2b53a', '#2f7d5b', '#3a4b63'];
  const pool = roadSegs.filter(s => s.w >= 6);
  const head = new THREE.MeshBasicMaterial({ color: '#fff2c8', transparent: true, opacity: 0 });
  for (let i = 0; i < Math.min(46, pool.length); i++) {
    const s = pool[Math.floor(rnd(i + 900) * pool.length)];
    const m = new THREE.Mesh(vehGeo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6 })); m.castShadow = true;
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.5), head); hl.position.set(1.7, 0, 1.3); m.add(hl);
    world.add(m); cars.push({ m, s, t: rnd(i + 901), v: (0.015 + rnd(i + 902) * 0.02) * (rnd(i + 903) > 0.5 ? 1 : -1), lane: (rnd(i + 904) > 0.5 ? 1 : -1) });
  }
  cars.head = head;
}
function stepCars(dt) {
  for (const c of cars) {
    const { a, b } = c.s, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    c.t += c.v * dt * 60 * 3 / l;
    if (c.t > 1 || c.t < 0) { c.v *= -1; c.t = Math.max(0, Math.min(1, c.t)); }
    const dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l, off = c.lane * 1.4 * Math.sign(c.v);
    c.m.position.set(a[0] + (b[0] - a[0]) * c.t - dy * off, a[1] + (b[1] - a[1]) * c.t + dx * off, 0.15);
    c.m.rotation.z = Math.atan2(dy, dx) + (c.v < 0 ? Math.PI : 0);
  }
}

// ---------- kites over the rooftops (Patiala's winter skies) ----------
const kites = [];
function makeKite(col, x, y, z, s = 1) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.2, 0, 1.6, 0, 0, 0, -2.2, 0, 0, 2.2, 0, 0, -2.2, 0, -1.6, 0, 0], 3)); g.computeVertexNormals();
  const k = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 })); k.scale.setScalar(s);
  const grp = new THREE.Group(); grp.add(k); grp.position.set(x, y, z); world.add(grp);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -2.2 * s, 0), new THREE.Vector3(-x * 0.1 + 18, -z * 0.8, -z + 12)]), new THREE.LineBasicMaterial({ color: '#6d5d52', transparent: true, opacity: 0.45 }));
  line.rotation.x = Math.PI / 2; grp.add(line);
  k.rotation.x = Math.PI / 2;
  const kite = { grp, k, base: new THREE.Vector3(x, y, z), ph: rnd(x + y) * 6 }; kites.push(kite); return kite;
}
[['#d9432f', -150, 90, 70], ['#f0b429', 120, 140, 82], ['#2f6fb0', 170, -60, 64], ['#7a3fa0', -110, -150, 76], ['#2f9a6a', 30, 190, 90], ['#e8793a', -200, -30, 58]].forEach(v => makeKite(...v));

// ---------- day / night ----------
let nightT = location.hash === '#night' ? 1 : 0, nightGoal = nightT;
function applyNight(t) {
  nightU.value = t;
  paintSky(t);
  hemi.color.copy(lerpC('#fff4e0', '#7d8db0', t)); hemi.groundColor.copy(lerpC('#8a7358', '#141820', t)); hemi.intensity = THREE.MathUtils.lerp(1.25, 0.32, t);
  sun.color.copy(lerpC('#fff0d2', '#9fb4dd', t)); sun.intensity = THREE.MathUtils.lerp(3.4, 0.22, t);
  moonFill.intensity = 0.25 * t;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 0.95, t);
  bulbMat.emissiveIntensity = 2.2 * t; glowMat.opacity = 0.55 * t; cars.head.opacity = t;
  nightLights.forEach(([l, i]) => l.intensity = i * t);
  bloom.strength = 0.42 * t; bloom.enabled = t > 0.02;
  document.body.classList.toggle('night', t > 0.5);
}

// ---------- post: bloom at night, tilt-shift always ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.75, 0.45, 0.9); composer.addPass(bloom);
const hT = new ShaderPass(HorizontalTiltShiftShader), vT = new ShaderPass(VerticalTiltShiftShader); composer.addPass(hT); composer.addPass(vT);
composer.addPass(new OutputPass());
function sizeTilt() { const k = innerWidth < 600 ? 1.6 : 2.4; hT.uniforms.h.value = k / innerWidth; vT.uniforms.v.value = k / innerHeight; hT.uniforms.r.value = vT.uniforms.r.value = 0.47; }
sizeTilt(); applyNight(nightT);

// ---------- UI ----------
const modeBtn = $('#mode');
function setModeLabel() { modeBtn.textContent = nightGoal ? 'Daylight' : 'After dark'; modeBtn.setAttribute('aria-pressed', String(!!nightGoal)); }
setModeLabel();
modeBtn.addEventListener('click', () => { nightGoal = nightGoal ? 0 : 1; setModeLabel(); history.replaceState(null, '', nightGoal ? '#night' : location.pathname); });
let taps = 0, tapTimer = 0, egg = null;
$('.hud h1').addEventListener('click', () => {
  clearTimeout(tapTimer); tapTimer = setTimeout(() => taps = 0, 1600);
  if (++taps === 5 && !egg) { $('.secret').classList.add('show'); setTimeout(() => $('.secret').classList.remove('show'), 4200); egg = makeKite('#c9a227', 0, -120, 40, 2.4); egg.egg = 0; }
});
// controls: drag to turn and tilt, wheel or pinch to zoom
const ptrs = new Map(); let pinch0 = 0, dist0 = 0;
const el = renderer.domElement; el.style.touchAction = 'none';
el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = view.dist; } hint(); });
el.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { view.theta -= dx * 0.005; view.phi = Math.max(0.55, Math.min(1.18, view.phi - dy * 0.003)); }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) view.dist = clampDist(dist0 * pinch0 / d); }
});
const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
el.addEventListener('wheel', e => { e.preventDefault(); view.dist = clampDist(view.dist * (1 + e.deltaY * 0.001)); hint(); }, { passive: false });
function clampDist(d) { const base = frameDist(); return Math.max(base * 0.45, Math.min(base * 1.6, d)); }
function hint() { document.body.classList.add('touched'); }
addEventListener('keydown', e => { if (e.key === 'ArrowLeft') view.theta += 0.12; if (e.key === 'ArrowRight') view.theta -= 0.12; if (e.key === 'n') modeBtn.click(); });
function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth / 2, innerHeight / 2); view.dist = clampDist(view.dist); sizeTilt(); }
addEventListener('resize', onResize);

// ---------- loop ----------
let last = performance.now(), T0 = last, running = true, first = true;
document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(loop); } });
function loop() {
  if (!running) return;
  const now = performance.now(), raw = (now - last) / 1000; last = now; const dt = Math.min(raw, 0.05), t = (now - T0) / 1000;
  if (Math.abs(nightGoal - nightT) > 0.001) { nightT += Math.sign(nightGoal - nightT) * Math.min(Math.abs(nightGoal - nightT), Math.min(raw, 0.25) / 1.1); applyNight(nightT); }
  stepCars(dt);
  kites.forEach(k => { k.grp.position.set(k.base.x + Math.sin(t * 0.4 + k.ph) * 6, k.base.y + Math.cos(t * 0.33 + k.ph) * 4, k.base.z + Math.sin(t * 0.9 + k.ph) * 2.5); k.k.rotation.y = Math.sin(t * 1.3 + k.ph) * 0.35; });
  if (egg) { egg.egg = Math.min(1, egg.egg + dt * 0.25); egg.base.set(Math.sin(egg.egg * 3) * 40, -120 + egg.egg * 110, 40 + egg.egg * 30); }
  if (el.clientWidth !== innerWidth || el.clientHeight !== innerHeight) onResize();
  placeCamera();
  composer.render(dt);
  if (first) { first = false; document.body.classList.add('ready'); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
