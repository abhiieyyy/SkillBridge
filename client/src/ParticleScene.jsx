import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as THREE from 'three';

// ---------- one shape per page ----------
const PAGES = {
  explore:  { shape: 'knot',   x: 3.1, y: 0,    scale: 0.8,  tilt: 0,   spin: 0.15, opacity: 1,    ringTilt: 1.15 },
  orders:   { shape: 'helix',  x: 3.4, y: 0,    scale: 0.8,  tilt: 0,   spin: 0.35, opacity: 0.6,  ringTilt: 0.3 },
  messages: { shape: 'globe',  x: 0,   y: 0,    scale: 1.0,  tilt: 0.3, spin: 0.12, opacity: 0.3,  ringTilt: 1.5 },
  wallet:   { shape: 'coin',   x: 3.4, y: 0,    scale: 0.9,  tilt: 0,   spin: 0.5,  opacity: 0.65, ringTilt: 0.9 },
  profile:  { shape: 'galaxy', x: 3.0, y: -0.4, scale: 0.85, tilt: 1.0, spin: 0.1,  opacity: 0.6,  ringTilt: 0.2 },
};
const pageFor = (path) => {
  if (path.startsWith('/dashboard')) return 'orders';
  if (path.startsWith('/chat')) return 'messages';
  if (path.startsWith('/wallet')) return 'wallet';
  if (path.startsWith('/profile')) return 'profile';
  return 'explore'; // home, gig pages, login
};

// <shapes>
const N = 30000;
const TAU = Math.PI * 2;
const rand = Math.random;
const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
const hex = (h) => new THREE.Color(h);
const PAL = {
  knot:   [hex('#6d9bff'), hex('#a58bff'), hex('#f0d9a6')],
  helix:  [hex('#5ee7ff'), hex('#a58bff'), hex('#ff8fd8')],
  globe:  [hex('#6d9bff'), hex('#9fd0ff'), hex('#a58bff')],
  coin:   [hex('#fff1cc'), hex('#f0d9a6'), hex('#c99a4a')],
  galaxy: [hex('#f0d9a6'), hex('#a58bff'), hex('#6d9bff')],
};
const tmp = new THREE.Color();
const paint = (stops, k) => {
  const n = stops.length - 1;
  const f = Math.min(Math.max(k, 0), 1) * n;
  const a = Math.min(Math.floor(f), n - 1);
  return tmp.copy(stops[a]).lerp(stops[a + 1], f - a);
};

// each generator returns [x, y, z, colourPosition 0..1, fuzz]
const GEN = {
  knot: () => {
    const t = rand() * TAU, r = 2 + Math.cos(3 * t);
    const x = r * Math.cos(2 * t), y = r * Math.sin(2 * t), z = Math.sin(3 * t);
    return [x, y, z, (x + 3) / 6, 0.28];
  },
  helix: (i) => {
    const kind = i % 10, H = 6.4, R = 1.2, turns = 3.2;
    let t = rand();
    if (kind >= 8) t = Math.round(t * 28) / 28; // rungs sit at fixed steps
    const y = (t - 0.5) * H, a = t * turns * TAU;
    const ax = R * Math.cos(a), az = R * Math.sin(a);
    const bx = R * Math.cos(a + Math.PI), bz = R * Math.sin(a + Math.PI);
    if (kind < 4) return [ax, y, az, t, 0.12];
    if (kind < 8) return [bx, y, bz, t, 0.12];
    const m = rand();
    return [ax + (bx - ax) * m, y, az + (bz - az) * m, t, 0.03];
  },
  globe: () => {
    const R = 2.5, kind = rand();
    let lat, lon;
    if (kind < 0.35) { lon = Math.floor(rand() * 14) / 14 * TAU; lat = (rand() - 0.5) * Math.PI; }
    else if (kind < 0.6) { lat = (Math.floor(rand() * 9) + 1) / 10 * Math.PI - Math.PI / 2; lon = rand() * TAU; }
    else { lon = rand() * TAU; lat = Math.asin(2 * rand() - 1); }
    const r = kind >= 0.6 ? R + (rand() - 0.5) * 0.12 : R;
    const x = r * Math.cos(lat) * Math.cos(lon), y = r * Math.sin(lat), z = r * Math.cos(lat) * Math.sin(lon);
    return [x, y, z, (y / R + 1) / 2, 0.03];
  },
  coin: () => {
    const Rr = 2.4, th = 0.22, a = rand() * TAU, kind = rand();
    if (kind < 0.2) return [Rr * Math.cos(a), Rr * Math.sin(a), (rand() - 0.5) * 2 * th, 1, 0.02]; // rim
    const face = rand() < 0.5 ? 1 : -1, sub = rand();
    let r;
    if (sub < 0.3) r = 1.55 + rand() * 0.18;        // embossed ring
    else if (sub < 0.4) r = rand() * 0.35;          // centre boss
    else r = Rr * Math.sqrt(rand());                // flat face
    return [r * Math.cos(a), r * Math.sin(a), face * th, r / Rr, 0.02];
  },
  galaxy: () => {
    const Rg = 3.5;
    if (rand() < 0.18) { // bright core
      const r = Math.pow(rand(), 2) * 0.7, u = rand() * TAU, v = Math.acos(2 * rand() - 1);
      return [r * Math.sin(v) * Math.cos(u), r * 0.6 * Math.cos(v), r * Math.sin(v) * Math.sin(u), 0, 0.04];
    }
    const arm = Math.floor(rand() * 3), r = Math.pow(rand(), 0.75) * Rg;
    const ang = arm * (TAU / 3) + r * 1.15 + gauss() * 0.28 * (0.4 + r / Rg);
    return [r * Math.cos(ang), gauss() * (0.05 + 0.22 * (1 - r / Rg)), r * Math.sin(ang), r / Rg, 0.04];
  },
};

function makeShape(name) {
  const pos = new Float32Array(N * 3), colr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let [x, y, z, k, fz] = GEN[name](i);
    const d = Math.pow(rand(), 1.6) * fz, u = rand() * TAU, v = Math.acos(2 * rand() - 1);
    x += d * Math.sin(v) * Math.cos(u);
    y += d * Math.sin(v) * Math.sin(u);
    z += d * Math.cos(v);
    pos.set([x, y, z], i * 3);
    const c = paint(PAL[name], k);
    colr.set([c.r, c.g, c.b], i * 3);
  }
  return { pos, col: colr };
}
// </shapes>

const DUR = 1.9;   // seconds a morph takes
const MAXD = 0.35; // how much particles are staggered
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const damp = (a, b, k) => a + (b - a) * k;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export default function ParticleScene() {
  const ref = useRef();
  const api = useRef({});
  const { pathname } = useLocation();

  // tell the scene which page we are on
  useEffect(() => { api.current.goto?.(pageFor(pathname)); }, [pathname]);

  useEffect(() => {
    const canvas = ref.current;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 7;
    const sprite = dotTexture();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const shapeCache = {};
    const getShape = (name) => (shapeCache[name] ||= makeShape(name));

    let page = pageFor(window.location.pathname);
    const first = getShape(PAGES[page].shape);

    // the morphing particles
    const curPos = new Float32Array(first.pos);
    const curCol = new Float32Array(first.col);
    const fromPos = new Float32Array(N * 3);
    const fromCol = new Float32Array(N * 3);
    const delay = new Float32Array(N);
    const burstVec = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      delay[i] = rand() * MAXD;
      const u = rand() * TAU, v = Math.acos(2 * rand() - 1), m = 0.6 + rand() * 1.6;
      burstVec.set([m * Math.sin(v) * Math.cos(u), m * Math.sin(v) * Math.sin(u), m * Math.cos(v)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(curPos, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(curCol, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.03, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );

    // the orbiting ring
    const RN = 7000;
    const rp = new Float32Array(RN * 3), rc = new Float32Array(RN * 3);
    const gold = hex('#f0d9a6'), blue = hex('#6d9bff'), c2 = new THREE.Color();
    for (let i = 0; i < RN; i++) {
      const a = rand() * TAU, R = 3.9 + (rand() - 0.5) * 0.35;
      rp.set([R * Math.cos(a), R * Math.sin(a), (rand() - 0.5) * 0.12], i * 3);
      c2.copy(gold).lerp(blue, rand() * 0.5);
      rc.set([c2.r, c2.g, c2.b], i * 3);
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    ringGeo.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    const ring = new THREE.Points(
      ringGeo,
      new THREE.PointsMaterial({ size: 0.026, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.y = 0.35;

    const group = new THREE.Group();
    group.add(points, ring);
    scene.add(group);

    // starfield
    const SN = 2200;
    const sp = new Float32Array(SN * 3), sc = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const u = rand() * TAU, v = Math.acos(2 * rand() - 1), r = 14 + rand() * 30, b = 0.6 + rand() * 0.4;
      sp.set([r * Math.sin(v) * Math.cos(u), r * Math.sin(v) * Math.sin(u), r * Math.cos(v)], i * 3);
      sc.set([b, b, Math.min(1, b + 0.1)], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 0.18, map: sprite, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    scene.add(stars);

    // morph state
    let toPos = first.pos, toCol = first.col, morphing = false, morphStart = 0;
    const touch = () => { posAttr.needsUpdate = true; colAttr.needsUpdate = true; };

    api.current.goto = (name) => {
      if (name === page) return;
      page = name;
      const s = getShape(PAGES[name].shape);
      if (reduce) { curPos.set(s.pos); curCol.set(s.col); touch(); frame(); return; }
      fromPos.set(curPos);
      fromCol.set(curCol);
      toPos = s.pos;
      toCol = s.col;
      morphStart = clock.elapsedTime;
      morphing = true;
    };

    const advance = (p) => {
      for (let i = 0; i < N; i++) {
        const l = Math.min(Math.max((p - delay[i]) / (1 - MAXD), 0), 1);
        const e = ease(l), b = Math.sin(e * Math.PI), j = i * 3;
        curPos[j]     = fromPos[j]     + (toPos[j]     - fromPos[j])     * e + burstVec[j]     * b;
        curPos[j + 1] = fromPos[j + 1] + (toPos[j + 1] - fromPos[j + 1]) * e + burstVec[j + 1] * b;
        curPos[j + 2] = fromPos[j + 2] + (toPos[j + 2] - fromPos[j + 2]) * e + burstVec[j + 2] * b;
        curCol[j]     = fromCol[j]     + (toCol[j]     - fromCol[j])     * e;
        curCol[j + 1] = fromCol[j + 1] + (toCol[j + 1] - fromCol[j + 1]) * e;
        curCol[j + 2] = fromCol[j + 2] + (toCol[j + 2] - fromCol[j + 2]) * e;
      }
      touch();
    };

    // interaction
    const mouse = { x: 0, y: 0 }, smooth = { x: 0, y: 0 };
    const onMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove);

    const clock = new THREE.Clock();
    const start = PAGES[page];
    const cur = { x: start.x, y: start.y, scale: start.scale, tilt: start.tilt, spin: start.spin, opacity: start.opacity, ringTilt: start.ringTilt };
    let spinAngle = 0, raf;

    const frame = () => {
      const dt = reduce ? 0 : Math.min(clock.getDelta(), 0.05);
      const t = reduce ? 0 : clock.elapsedTime;
      const mobile = window.innerWidth < 800;
      const s = Math.min(window.scrollY / (window.innerHeight * 1.2), 1);

      let burst = 0;
      if (morphing) {
        const p = (t - morphStart) / DUR;
        if (p >= 1) {
          morphing = false;
          curPos.set(toPos);
          curCol.set(toCol);
          touch();
        } else {
          advance(p);
          burst = Math.sin(Math.max(p, 0) * Math.PI);
        }
      }

      const tg = PAGES[page], k = 0.05;
      cur.x = damp(cur.x, mobile ? 0 : tg.x, k);
      cur.y = damp(cur.y, (mobile ? 1.7 : 0) + tg.y, k);
      cur.scale = damp(cur.scale, tg.scale * (mobile ? 0.7 : 1), k);
      cur.tilt = damp(cur.tilt, tg.tilt, k);
      cur.spin = damp(cur.spin, tg.spin, k);
      cur.opacity = damp(cur.opacity, tg.opacity, k);
      cur.ringTilt = damp(cur.ringTilt, tg.ringTilt, k);

      smooth.x += (mouse.x - smooth.x) * 0.04;
      smooth.y += (mouse.y - smooth.y) * 0.04;
      spinAngle += dt * (cur.spin + burst * 2.4);

      group.position.set(cur.x * (1 - s) + (mobile ? 0 : -3.6) * s, cur.y + s * 0.6 + Math.sin(t * 0.6) * 0.12, 0);
      group.scale.setScalar(cur.scale * (1 + s * 0.25) * (1 + burst * 0.1));
      group.rotation.y = spinAngle + smooth.x * 0.6 + s * Math.PI;
      group.rotation.x = cur.tilt + smooth.y * 0.35 + s * 0.6;
      ring.rotation.x = cur.ringTilt;
      ring.rotation.z = t * 0.08;
      stars.rotation.y = t * 0.01 + s * 0.3;
      camera.position.x = smooth.x * 0.3;
      points.material.opacity = cur.opacity * (1 - s * 0.5);
      points.material.size = 0.03 * (1 + burst * 0.6);
      ring.material.opacity = cur.opacity * 0.95 * (1 - s * 0.5);

      renderer.render(scene, camera);
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      if (reduce) frame();
    };
    window.addEventListener('resize', resize);
    resize();
    frame();

    return () => {
      cancelAnimationFrame(raf);
      api.current.goto = undefined;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      [points, ring, stars].forEach((p) => { p.geometry.dispose(); p.material.dispose(); });
      sprite.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className="scene" aria-hidden="true" />;
}
