// Scène 3D : blason 影 AaKATSUKI en relief, lune rouge, nuages lointains et braises.
// Optimisée mobile : pixel ratio plafonné, boucle coupée hors écran.
import * as THREE from 'three';
import { CLOUD_SEGMENTS, CLOUD_START } from './icons.js';

function cloudShape() {
  const t = (x, y) => [(x - 90) / 40, -(y - 45) / 40];
  const s = new THREE.Shape();
  s.moveTo(...t(...CLOUD_START));
  for (const g of CLOUD_SEGMENTS) s.bezierCurveTo(...t(g[0], g[1]), ...t(g[2], g[3]), ...t(g[4], g[5]));
  return s;
}

export function mountHero(canvas, { mini = false } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small || devicePixelRatio < 2, alpha: mini, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.6 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!mini) renderer.setClearColor(0x0b0b0d, 1); else renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  if (!mini) scene.fog = new THREE.Fog(0x0b0b0d, 9, 24);
  const camera = new THREE.PerspectiveCamera(mini ? 30 : 40, 1, 0.1, 100);
  camera.position.set(0, 0, mini ? 9 : 10);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3b30, 1.4); rim.position.set(-5, -3, -2); scene.add(rim);

  const shape = cloudShape();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 3, curveSegments: small ? 18 : 28 });
  geo.center();
  const outGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: small ? 18 : 28 });
  outGeo.center();
  const red = new THREE.MeshStandardMaterial({ color: 0xd6202a, roughness: 0.42, metalness: 0.08 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.65 });
  const makeCloud = () => {
    const g = new THREE.Group();
    const o = new THREE.Mesh(outGeo, white); o.scale.set(1.085, 1.13, 1); o.position.z = -0.1;
    g.add(o, new THREE.Mesh(geo, red));
    return g;
  };

  // Blason 影 AaKATSUKI : face avant texturée + couches empilées pour donner une épaisseur
  const emblem = new THREE.Group();
  scene.add(emblem);
  const disposables = [geo, outGeo, red, white];
  const loader = new THREE.TextureLoader();
  const SIZE = 4;
  const plane = new THREE.PlaneGeometry(SIZE, SIZE);
  disposables.push(plane);
  Promise.all([loader.loadAsync('assets/logo-solid.webp'), loader.loadAsync('assets/logo-mask.webp')]).then(([logoTex, maskTex]) => {
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const LAYERS = small ? 10 : 16, STEP = 0.016;
    for (let i = LAYERS; i >= 1; i--) {
      const t = i / LAYERS;
      const c = new THREE.Color(0x5e0a10).lerp(new THREE.Color(0x0b0b0d), t);
      const m = new THREE.MeshBasicMaterial({ color: c, alphaMap: maskTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
      const l = new THREE.Mesh(plane, m); l.position.z = -i * STEP; l.scale.setScalar(0.985);
      emblem.add(l); disposables.push(m);
    }
    const front = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, fog: false });
    const f = new THREE.Mesh(plane, front); f.renderOrder = 2;
    emblem.add(f);
    disposables.push(front, logoTex, maskTex);
  }).catch(() => { emblem.add(makeCloud()); });
  const smalls = [];
  let embers = null, moon = null, ring = null;
  if (!mini) {
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xa3121a, fog: false });
    moon = new THREE.Mesh(new THREE.CircleGeometry(3.1, 72), moonMat);
    moon.position.set(2.4, 1.8, -9);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2efe9, fog: false, transparent: true, opacity: 0.28 });
    ring = new THREE.Mesh(new THREE.RingGeometry(3.45, 3.5, 120), ringMat);
    ring.position.copy(moon.position);
    scene.add(moon, ring);
    disposables.push(moon.geometry, moonMat, ring.geometry, ringMat);

    const spots = [[-4.4, 2.6, -4, 0.42], [4.8, -2.4, -3, 0.5], [-3.4, -3.1, -6, 0.62], [5.4, 3.2, -7, 0.5], [-6.4, 0.4, -9, 0.75], [0.6, -4.4, -11, 0.85]];
    for (const [x, y, z, s] of spots.slice(0, small ? 4 : 6)) {
      const c = makeCloud(); c.scale.setScalar(s); c.position.set(x, y, z);
      c.userData = { y, phase: Math.random() * Math.PI * 2, speed: 0.25 + Math.random() * 0.35 };
      scene.add(c); smalls.push(c);
    }

    const N = small ? 160 : 340;
    const pos = new Float32Array(N * 3); const spd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = (Math.random() - 0.5) * 14; pos[i * 3 + 2] = -Math.random() * 12 + 2;
      spd[i] = 0.15 + Math.random() * 0.5;
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: 0xff4a3d, size: small ? 0.06 : 0.05 });
    embers = new THREE.Points(pg, pm); embers.userData.spd = spd;
    scene.add(embers);
    disposables.push(pg, pm);
  }

  // Disposition : sur mobile le nuage monte au-dessus du texte
  let baseY = 0, baseX = 0;
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (mini) { emblem.scale.setScalar(Math.min(1.05, (2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)) * 0.85 / SIZE)); return; }
    const portrait = w / h < 0.9;
    camera.position.z = portrait ? 11.5 : 10;
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const visW = visH * camera.aspect;
    // en portrait, le texte occupe le bas : le nuage se place dans le quart supérieur
    baseX = portrait ? 0 : Math.min(3.4, visW * 0.25); baseY = portrait ? visH * 0.29 : 0.2;
    emblem.scale.setScalar(portrait ? Math.min(0.74, visW / 5.6) : 1.0);
    if (moon) {
      const k = (camera.position.z + 9) / camera.position.z;
      moon.position.set(portrait ? 1.1 * k : baseX * 1.4, portrait ? baseY * k + 0.6 : 1.8, -9);
      moon.scale.setScalar(portrait ? 0.8 : 1); ring.scale.setScalar(portrait ? 0.8 : 1);
      ring.position.copy(moon.position);
    }
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // Interactions : glisser pour faire tourner, parallaxe au pointeur et au scroll
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let dragging = false, lastX = 0, vel = 0, spin = 0, scrollP = 0;
  const host = canvas.parentElement;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.tx = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.012; spin += vel; }
  };
  const onDown = (e) => { if (e.target.closest('a,button,input')) return; dragging = true; lastX = e.clientX; vel = 0; host.classList.add('grabbing'); };
  const onUp = () => { dragging = false; host.classList.remove('grabbing'); };
  const onScroll = () => { scrollP = Math.min(1, scrollY / innerHeight); };
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });

  let raf = 0, last = performance.now(), visible = true, running = false;
  const t0 = last;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06;
    if (!dragging) {
      spin += vel; vel *= 0.95;
      if (Math.abs(vel) < 0.002) { const target = Math.round(spin / (Math.PI * 2)) * Math.PI * 2; spin += (target - spin) * 0.04; }
    }
    emblem.rotation.y = spin + Math.sin(t * 0.55) * 0.32 + ptr.x * 0.25;
    emblem.rotation.x = Math.sin(t * 0.4) * 0.08 + ptr.y * 0.14 + scrollP * 0.5;
    emblem.position.set(baseX, baseY + Math.sin(t * 0.9) * 0.12 + scrollP * 1.2, 0);
    for (const c of smalls) {
      const u = c.userData;
      c.position.y = u.y + Math.sin(t * u.speed + u.phase) * 0.3;
      c.rotation.y = Math.sin(t * u.speed * 0.7 + u.phase) * 0.5;
      c.position.x += dt * 0.08; if (c.position.x > 9) c.position.x = -9;
    }
    if (embers) {
      const p = embers.geometry.attributes.position.array, sp = embers.userData.spd;
      for (let i = 0; i < sp.length; i++) { p[i * 3 + 1] += sp[i] * dt; if (p[i * 3 + 1] > 7) p[i * 3 + 1] = -7; }
      embers.geometry.attributes.position.needsUpdate = true;
    }
    camera.position.x = ptr.x * 0.35; camera.position.y = -ptr.y * 0.25 - scrollP * 0.8;
    camera.lookAt(0, -scrollP * 0.4, 0);
    renderer.render(scene, camera);
  }
  const start = () => { if (running || reduce) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? start() : stop(); });
  io.observe(canvas);
  const onVis = () => (document.hidden || !visible ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  if (reduce) { emblem.position.set(baseX, baseY, 0); emblem.rotation.set(0.05, -0.25, 0); renderer.render(scene, camera); }

  return () => {
    stop(); io.disconnect(); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('scroll', onScroll);
    disposables.forEach((d) => d.dispose()); renderer.dispose();
  };
}
