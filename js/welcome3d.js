// Présentation animée d'un membre : scène 3D plein écran, jouée pour tout le clan.
// Tout est dessiné dans la scène (textes compris) : la vidéo enregistrée est identique à l'écran.
import * as THREE from 'three';
import { I } from './icons.js';
import { MODES } from './core.js';

const RED = '#d6202a', DARK_RED = '#8a1016', WHITE = '#f2efe9', MUTED = '#aaa59e';
const FD = '"Chakra Petch", system-ui, sans-serif', FB = '"Barlow", system-ui, sans-serif';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, d) => clamp01((t - a) / d);
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const ORDER = ['photo', 'profile', 'character', 'weapon'];
const CAPTION = { photo: 'LE JOUEUR', profile: 'PROFIL DE JOUEUR', character: 'PERSONNAGE FAVORI', weapon: 'ARME FAVORITE' };

// ---------- Textures dessinées ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function fitFont(g, parts, weight, family, max, width) {
  let size = max;
  const total = () => { g.font = `${weight} ${size}px ${family}`; return parts.reduce((a, [t]) => a + g.measureText(t).width, 0); };
  while (total() > width && size > 20) size -= 4;
  return { size, width: total() };
}
// Pseudo façon affiche : 影 AK- en blanc, la suite en rouge, lettres usées au pinceau
function titleTex(pseudo, pal = { sigil: RED, head: WHITE, tail: RED }) {
  const name = String(pseudo).replace(/影/g, '').trim() || String(pseudo);
  const i = name.lastIndexOf('-');
  const head = i > 0 && i < name.length - 1 ? name.slice(0, i + 1) : '';
  const tail = head ? name.slice(i + 1) : name;
  const parts = [['影 ', pal.sigil], [head, pal.head], [tail, head ? pal.tail : pal.head], [' 影', pal.sigil]].filter(([t]) => t);
  return canvasTex(2048, 360, (g, w, h) => {
    const { size, width } = fitFont(g, parts, 700, FD, 240, w * 0.84);
    g.save(); g.translate(w / 2, h / 2 + size * 0.36); g.transform(1, 0, -0.2, 1, 0, 0);
    for (const [dx, dy, shade] of [[12, 12, '#000'], [0, 0, null]]) {
      let x = -width / 2;
      for (const [t, col] of parts) { g.fillStyle = shade || col; g.fillText(t, x + dx, dy); x += g.measureText(t).width; }
    }
    g.restore();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 46; k++) {
      g.strokeStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.5})`; g.lineWidth = 1 + Math.random() * 3;
      const y = h * 0.15 + Math.random() * h * 0.7;
      g.beginPath(); g.moveTo(Math.random() * w * 0.4, y); g.lineTo(w * 0.6 + Math.random() * w * 0.4, y - 30 + Math.random() * 60); g.stroke();
    }
  });
}
function lineTex(lines, w = 1600, h = 220) {
  return canvasTex(w, h, (g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of lines) {
      if ('letterSpacing' in g) g.letterSpacing = `${l.spacing || 0}px`;
      const { size } = fitFont(g, [[l.text]], l.weight || 700, l.family || FD, l.size, w * 0.94);
      g.font = `${l.italic ? 'italic ' : ''}${l.weight || 700} ${size}px ${l.family || FD}`;
      g.fillStyle = l.color || WHITE; g.fillText(l.text, w / 2, l.y * h);
    }
  });
}
// Étiquette rouge sous chaque image pendant son entrée (comme « VERSION DE BASE » sur les affiches)
function captionTex(title, name) {
  return canvasTex(1024, 128, (g, w, h) => {
    const text = name ? `${title} · ${name.toUpperCase()}` : title;
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    const { size, width } = fitFont(g, [[text]], 700, FD, 56, w * 0.86);
    g.font = `700 ${size}px ${FD}`;
    const bw = width + 64, x = (w - bw) / 2;
    g.fillStyle = RED; g.fillRect(x, 20, bw, h - 40);
    g.fillStyle = WHITE; g.fillRect(x, 20, 10, h - 40);
    g.textBaseline = 'middle'; g.fillText(text, x + 38, h / 2 + 2);
  });
}
function slashTex() {
  return canvasTex(2048, 256, (g, w, h) => {
    for (let i = 0; i < 300; i++) {
      const spread = (Math.random() - 0.5) * (Math.random() * 0.6 + 0.2);
      const y = h * 0.52 + spread * h;
      g.globalAlpha = 0.3 + Math.random() * 0.7;
      g.strokeStyle = Math.random() < 0.8 ? RED : DARK_RED; g.lineWidth = 2 + Math.random() * 8;
      g.beginPath(); g.moveTo(Math.random() * w * 0.1, y + 14); g.lineTo(w * (0.86 + Math.random() * 0.14), y - 14 + (Math.random() - 0.5) * 10); g.stroke();
    }
  });
}
function kanjiTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.font = `700 860px ${FD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = RED; g.fillText('影', w / 2, h / 2 + 40);
  });
}
function smokeTex() {
  return canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 46; i++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.55, y = h / 2 + (Math.random() - 0.5) * h * 0.4, r = 40 + Math.random() * 110;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.08})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
  });
}
function dotTex() {
  return canvasTex(64, 64, (g) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,200,180,.6)'); rg.addColorStop(1, 'rgba(255,80,60,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  });
}

// ---------- Matériaux ----------
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// Trait de pinceau qui se dessine de gauche à droite
function slashMat(tex, tint = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, p: { value: 0 }, o: { value: 1 }, tint: { value: tint } },
    transparent: true, depthWrite: false, vertexShader: VERT,
    fragmentShader: `uniform sampler2D map; uniform float p; uniform float o; uniform float tint; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        float m = 1.0 - smoothstep(p * 1.2 - 0.14, p * 1.2, vUv.x);
        float taper = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        gl_FragColor = vec4(c.rgb * tint, c.a * m * o * mix(0.55, 1.0, taper));
        #include <colorspace_fragment>
      }`,
  });
}
// Reflet lumineux qui balaie une image
function shineMat() {
  return new THREE.ShaderMaterial({
    uniforms: { p: { value: -1 }, o: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VERT,
    fragmentShader: `uniform float p; uniform float o; varying vec2 vUv;
      void main(){ float d = vUv.x * 0.8 + vUv.y * 0.5 - (p * 2.0 - 0.35); float a = smoothstep(0.11, 0.0, abs(d)) * 0.42 * o * step(0.0, p) * step(p, 1.0);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.9) * a, a); }`,
  });
}

function hasAlpha(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    return [0, 23, 24 * 23, 24 * 24 - 1].some((i) => d[i * 4 + 3] < 200);
  } catch { return false; }
}

// Carte 3D : tranche rouge, dos sombre, image en face avant, reflet
function makeCard(tex) {
  const img = tex.image, aspect = img.width / img.height;
  const g = new THREE.Group();
  const mats = [];
  const face = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  if (!hasAlpha(img)) {
    const bw = 0.03;
    const edge = new THREE.MeshStandardMaterial({ color: 0x8a1016, roughness: 0.35, metalness: 0.45, transparent: true });
    const back = new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.8, transparent: true });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(aspect + bw * 2, 1 + bw * 2, 0.06), [edge, edge, edge, edge, edge, back]));
    mats.push(edge, back);
    face.position.z = 0.031;
  }
  const shine = new THREE.Mesh(face.geometry, shineMat()); shine.position.z = face.position.z + 0.002;
  g.add(face, shine); mats.push(face.material);
  return { g, aspect, mats, shine: shine.material };
}
const fit = (aspect, w, h) => Math.min(w / aspect, h);

function layout(W, H) {
  if (W / H < 0.9) return {
    W, H,
    crest: { x: 0, y: 0.425 * H, s: 0.085 * H }, kicker: { x: 0, y: 0.36 * H, w: Math.min(0.92 * W, 0.75 * H) },
    photo: { x: -0.245 * W, y: 0.175 * H, w: 0.47 * W, h: 0.3 * H, ry: 0.12, z: 0 },
    character: { x: 0.245 * W, y: 0.175 * H, w: 0.47 * W, h: 0.3 * H, ry: -0.12, z: -0.2 },
    title: { x: 0, y: -0.035 * H, w: 0.98 * W }, info: { x: 0, y: -0.108 * H, w: 0.92 * W },
    profile: { x: 0, y: -0.24 * H, w: 0.86 * W, h: 0.15 * H, ry: 0, rx: -0.06, z: 0.1 },
    weapon: { x: 0, y: -0.395 * H, w: 0.98 * W, h: 0.12 * H, ry: 0, z: 0.45 },
    hero: { x: 0, y: 0.04 * H, w: 0.86 * W, h: 0.5 * H },
  };
  return {
    W, H,
    crest: { x: 0, y: 0.4 * H, s: 0.11 * H }, kicker: { x: 0, y: 0.315 * H, w: Math.min(0.42 * W, 0.9 * H) },
    photo: { x: -0.32 * W, y: -0.02 * H, w: 0.24 * W, h: 0.6 * H, ry: 0.16, z: -0.3 },
    character: { x: 0.32 * W, y: -0.02 * H, w: 0.24 * W, h: 0.6 * H, ry: -0.16, z: -0.3 },
    title: { x: 0, y: 0.18 * H, w: 0.52 * W }, info: { x: 0, y: 0.095 * H, w: 0.4 * W },
    profile: { x: 0, y: -0.11 * H, w: 0.36 * W, h: 0.22 * H, ry: 0, rx: -0.04, z: 0.1 },
    weapon: { x: 0, y: -0.35 * H, w: 0.5 * W, h: 0.2 * H, ry: 0, z: 0.45 },
    hero: { x: 0, y: 0.01 * H, w: 0.62 * W, h: 0.72 * H },
  };
}

// ---------- Son (synthétisé, aucun fichier) ----------
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const dest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
  if (dest) master.connect(dest);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = nb.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const env = (node, t, peak, attack, decay) => { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + attack); node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); };
  function noise(t, dur, type, f0, f1, peak, q = 0.8) {
    const s = ctx.createBufferSource(); s.buffer = nb;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = ctx.createGain(); env(gn, t, peak, dur * 0.35, dur * 0.65);
    s.connect(f).connect(gn).connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  function tone(t, type, f0, f1, dur, peak) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = ctx.createGain(); env(gn, t, peak, 0.008, dur);
    o.connect(gn).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  let drone = [];
  return {
    ctx, dest,
    get running() { return ctx.state === 'running'; },
    setOn(on) { master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.04); },
    boom() { const t = ctx.currentTime; tone(t, 'sine', 130, 34, 1.2, 0.9); tone(t, 'triangle', 70, 30, 0.6, 0.35); noise(t, 0.4, 'lowpass', 1200, 160, 0.5); },
    hit() { const t = ctx.currentTime; tone(t, 'triangle', 200, 70, 0.3, 0.45); noise(t, 0.12, 'highpass', 2500, 1200, 0.18); },
    roll() { const t = ctx.currentTime; for (let i = 0; i < 22; i++) { const at = t + 1.5 * (1 - Math.pow(1 - i / 22, 1.6)); noise(at, 0.07, 'bandpass', 900, 500, 0.12 + i * 0.012, 2); tone(at, 'triangle', 150, 90, 0.08, 0.08 + i * 0.006); } },
    chime() { const t = ctx.currentTime; for (const [f, k] of [[880, 0.3], [1320, 0.2], [1760, 0.12], [2640, 0.06]]) tone(t, 'sine', f, f * 0.995, 2.2, k); },
    whoosh(d = 0.7) { noise(ctx.currentTime, d, 'bandpass', 300, 3200, 0.32, 1.4); },
    drone() {
      this.stopDrone();
      const t = ctx.currentTime;
      const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.07, t + 2);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(out).connect(master);
      for (const [type, f] of [['sawtooth', 55], ['sawtooth', 55.5], ['sine', 27.5]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(t); drone.push(o); }
      drone.push(out);
    },
    stopDrone() {
      const t = ctx.currentTime;
      for (const n of drone) { if (n.stop) n.stop(t + 0.6); else n.gain.setTargetAtTime(0.0001, t, 0.15); }
      drone = [];
    },
    close() { this.stopDrone(); ctx.close().catch(() => {}); },
  };
}

function pickMime() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m)) || null;
}
const slug = (s) => String(s).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'membre';


// ---------- Scène plein écran commune (présentation d'un membre, joueur du mois) ----------
// setup(ctx) prépare sa scène et renvoie { ready, build() → { T_END, events, impacts }, frame(t, dt) }.
// La coque gère l'écran, la caméra, le son, la vibration, les boutons et l'export vidéo.
export function runShow({ label, loading, fileName, shareTitle, onClose, setup }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mime = pickMime();
  const root = document.createElement('div');
  root.className = 'wel';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  root.innerHTML = `<canvas class="wel-cv"></canvas>
    <p class="wel-load"></p>
    <div class="wel-bar">
      <button class="wel-btn" data-sound aria-pressed="false">${I.mute}<span>Son</span></button>
      <span class="wel-gap"></span>
      <button class="wel-btn" data-replay aria-label="Rejouer">${I.undo}<span>Rejouer</span></button>
      ${mime ? `<button class="wel-btn" data-video aria-label="Enregistrer la vidéo">${I.film}<span>Vidéo</span></button>` : ''}
      <button class="wel-btn" data-close aria-label="Fermer">${I.x}</button>
    </div>
    <button class="wel-skip" data-skip>Passer ${I.right}</button>
    <p class="wel-rec" hidden><i></i>Enregistrement de la vidéo <b>0 s</b></p>`;
  root.querySelector('.wel-load').textContent = loading;
  document.body.appendChild(root);
  document.body.classList.add('locked');
  requestAnimationFrame(() => root.classList.add('on'));
  const canvas = root.querySelector('canvas');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x050506, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const CAM_Z = 12;
  camera.position.set(0, 0, CAM_Z);
  scene.add(camera);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(3, 4, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3b30, 2.2); rim.position.set(-6, -2, 2); scene.add(rim);

  let fixed = null; // taille imposée pendant l'enregistrement vidéo (portrait 720 × 1280)
  const view = { W: 1, H: 1 };
  function resize() {
    const w = fixed ? fixed.w : canvas.clientWidth || innerWidth, h = fixed ? fixed.h : canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(fixed ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    view.H = 2 * CAM_Z * Math.tan((camera.fov * Math.PI) / 360);
    view.W = view.H * camera.aspect;
    canvas.classList.toggle('is-fixed', !!fixed);
  }
  const ro = new ResizeObserver(() => resize()); ro.observe(canvas); resize();

  const loader = new THREE.TextureLoader();
  const load = (url) => loader.loadAsync(url).then((tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return tx; });
  const text = (tex, aspect) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); m.renderOrder = 5; scene.add(m); return m; };
  const show = setup({ scene, camera, renderer, view, CAM_Z, reduce, load, text });
  let T_END = 5, events = [], impacts = [];

  // Son : coupé par défaut tant que le navigateur ne l'autorise pas (il faut un toucher)
  const audio = makeAudio();
  let soundOn = false;
  const soundBtn = root.querySelector('[data-sound]');
  function setSound(on) {
    soundOn = !!on && !!audio?.running;
    audio?.setOn(soundOn);
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.innerHTML = `${soundOn ? I.sound : I.mute}<span>Son</span>`;
  }
  if (!audio) soundBtn.hidden = true;
  else if (localStorage.getItem('akt.wel.sound') !== '0') audio.ctx.resume().then(() => setSound(true)).catch(() => {});
  soundBtn.onclick = async () => {
    if (!audio) return;
    await audio.ctx.resume().catch(() => {});
    setSound(!soundOn);
    localStorage.setItem('akt.wel.sound', soundOn ? '1' : '0');
    if (soundOn && t < T_END) audio.drone();
  };

  // Vibration du téléphone avec les impacts (Android ; iPhone ne le permet pas aux sites)
  const BUZZ = { boom: [70, 40, 40], hit: [28], roll: [12, 30, 12, 30, 12, 30, 12] };
  const buzz = (ev) => { if (BUZZ[ev] && !reduce && !recorder && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) { try { navigator.vibrate(BUZZ[ev]); } catch { /* refusé */ } } };

  // ---------- Boucle ----------
  const HOLD = 9; // l'image finale reste affichée, puis l'animation se ferme seule
  let t = 0, last = 0, raf = 0, started = false, fired = 0, closed = false;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  function restart() { t = reduce ? T_END : 0; fired = 0; while (fired < events.length && events[fired][0] < t) fired++; root.classList.remove('done'); if (audio && soundOn && !reduce) audio.drone(); }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    t += dt;
    while (fired < events.length && events[fired][0] <= t) { const ev = events[fired++][1]; if (audio && soundOn) audio[ev]?.(); buzz(ev); }
    if (t >= T_END && !root.classList.contains('done')) root.classList.add('done');
    if (t >= T_END + HOLD && !recorder) { close(); return; }
    ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
    // Caméra : secousse à chaque impact, léger balancement à la fin
    let shake = 0;
    if (!reduce) for (const [at, amp] of impacts) if (t >= at) shake += Math.exp(-(t - at) * 7) * amp;
    const sway = seg(t, T_END - 0.5, 2);
    camera.position.x = Math.sin(t * 47) * shake + (Math.sin(t * 0.32) * 0.35 + ptr.x * 0.5) * sway;
    camera.position.y = Math.cos(t * 41) * shake + (Math.sin(t * 0.27) * 0.18 - ptr.y * 0.3) * sway;
    camera.lookAt(0, 0, 0);
    show.frame(t, dt);
    renderer.render(scene, camera);
    if (recorder) onRecordFrame();
  }

  // ---------- Vidéo ----------
  let recorder = null;
  const recBox = root.querySelector('.wel-rec');
  function onRecordFrame() {
    recBox.querySelector('b').textContent = `${Math.max(0, Math.ceil(T_END + 4 - t))} s`;
    if (t > T_END + 4 && recorder.state === 'recording') recorder.stop();
  }
  async function record() {
    if (recorder) return;
    fixed = { w: 720, h: 1280 }; resize();
    const stream = canvas.captureStream(30);
    if (audio?.dest && soundOn) for (const tr of audio.dest.stream.getAudioTracks()) stream.addTrack(tr);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      recorder = null; fixed = null; resize();
      root.classList.remove('recording'); recBox.hidden = true;
      stream.getVideoTracks().forEach((tr) => tr.stop());
      if (closed) return;
      const type = mime.split(';')[0];
      const file = new File(chunks, `${fileName}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: shareTitle }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    };
    root.classList.add('recording'); recBox.hidden = false;
    t = 0; fired = 0; root.classList.remove('done'); if (audio && soundOn) audio.drone();
    recorder.start(250);
  }

  // ---------- Commandes ----------
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onMove = (e) => { ptr.tx = (e.clientX / innerWidth) * 2 - 1; ptr.ty = (e.clientY / innerHeight) * 2 - 1; };
  const onVis = () => { if (document.hidden && !recorder) { cancelAnimationFrame(raf); raf = 0; } else if (!document.hidden && started && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
  document.addEventListener('keydown', onKey);
  root.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  root.querySelector('[data-close]').onclick = () => close();
  root.querySelector('[data-replay]').onclick = () => { if (!recorder) restart(); };
  root.querySelector('[data-skip]').onclick = () => { if (!recorder) { t = Math.max(t, T_END); fired = events.length; audio?.stopDrone(); } };
  root.querySelector('[data-video]')?.addEventListener('click', () => record());

  show.ready.then(() => {
    if (closed) return;
    ({ T_END, events, impacts } = show.build());
    events.sort((a, b) => a[0] - b[0]);
    root.classList.add('ready');
    started = true;
    restart();
    raf = requestAnimationFrame(frame);
  });

  function close() {
    if (closed) return;
    closed = true;
    if (recorder?.state === 'recording') recorder.stop();
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
    ro.disconnect(); audio?.close();
    root.classList.remove('on');
    setTimeout(() => {
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); for (const un of Object.values(m.uniforms || {})) if (un.value?.isTexture) un.value.dispose(); m.dispose(); }
      });
      renderer.dispose(); root.remove();
      if (!document.querySelector('.wel') && !document.getElementById('sheet-root').classList.contains('open')) document.body.classList.remove('locked');
    }, 320);
    onClose?.();
  }
  return close;
}

// ---------- Présentation d'un membre ----------
// u : membre (avec u.card). Renvoie une fonction qui ferme la présentation.
export function playWelcome(u, { onClose } = {}) {
  return runShow({
    label: `Présentation de ${u.pseudo}`, loading: 'Préparation de la présentation',
    fileName: `bienvenue-${slug(u.pseudo)}`, shareTitle: `Bienvenue ${u.pseudo}`, onClose,
    setup: (ctx) => welcomeScene(u, ctx),
  });
}

function welcomeScene(u, { scene, camera, view, CAM_Z, reduce, load, text }) {
  const card = u.card || {};
  // Décor : lune rouge, 影 géant, fumée, braises
  const behind = (z) => (CAM_Z - z) / CAM_Z; // agrandissement pour un objet en retrait
  const moon = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x9c121a, transparent: true }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.125, 160), new THREE.MeshBasicMaterial({ color: 0xf2efe9, transparent: true }));
  moon.position.z = ring.position.z = -14;
  const kanji = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: kanjiTex(), transparent: true, depthWrite: false }));
  kanji.position.z = -8;
  scene.add(moon, ring, kanji);
  const smokeT = smokeTex();
  const smokes = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: smokeT, color: i % 2 ? 0xd6202a : 0x8a1016, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData = { z: -3 - i * 1.4, x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * 1.2, r: Math.random() * 6, v: (Math.random() - 0.5) * 0.08, s: 0.9 + Math.random() * 0.8 };
    scene.add(m); return m;
  });
  const N = 280;
  const pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = (Math.random() - 0.5) * 18; pos[i * 3 + 2] = -Math.random() * 14 + 3; spd[i] = 0.3 + Math.random() * 0.9; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(pg, new THREE.PointsMaterial({ map: dotTex(), color: 0xff5a3c, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(embers);

  // Premier plan : blason, traits de pinceau, textes, cartes
  const unit = () => new THREE.PlaneGeometry(1, 1);
  const crest = new THREE.Mesh(unit(), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  crest.visible = false; scene.add(crest);
  const slashT = slashTex();
  const slashA = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.125), slashMat(slashT));
  const slashB = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.125), slashMat(slashT, 0.42));
  const slashC = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.125), slashMat(slashT, 0.8));
  slashA.renderOrder = slashB.renderOrder = slashC.renderOrder = 3;
  scene.add(slashA, slashB, slashC);
  let hello, kicker, title, info; // textes créés une fois les polices chargées
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  flash.position.z = -1; flash.renderOrder = 10; camera.add(flash);

  const cards = {};
  let T_TITLE = 3, T_INFO = 4, T_END = 5;
  const events = [];

  const sources = { ...card, photo: card.photo || u.avatar || null };
  const ready = Promise.all([
    document.fonts?.load(`700 120px ${FD}`).catch(() => {}),
    document.fonts?.load(`600 60px ${FB}`).catch(() => {}),
    load('assets/logo-solid.webp').then((t) => { crest.material.map = t; crest.material.needsUpdate = true; }).catch(() => {}),
    ...ORDER.map((k) => (sources[k] ? load(sources[k]).then((t) => { cards[k] = { key: k, ...makeCard(t) }; }).catch(() => {}) : null)),
  ]);

  function build() {
    // Les textes dépendent des polices : dessinés une fois chargées
    hello = text(lineTex([{ text: 'BIENVENUE', size: 190, y: 0.5, spacing: 18 }], 1600, 260), 1600 / 260);
    kicker = text(lineTex([{ text: 'BIENVENUE DANS 影 AaKATSUKI 影', size: 92, y: 0.5, spacing: 10, color: WHITE }], 1600, 140), 1600 / 140);
    title = text(titleTex(u.pseudo), 2048 / 360);
    const infoLines = [{ text: [u.level ? `NIVEAU ${u.level}` : '', u.specialty ? String(u.specialty).toUpperCase() : '', MODES[u.mode] ? MODES[u.mode].toUpperCase() : ''].filter(Boolean).join('  ·  '), size: 70, y: card.motto ? 0.3 : 0.5, spacing: 6, color: MUTED, weight: 600, family: FB }];
    if (card.motto) infoLines.push({ text: `« ${card.motto} »`, size: 64, y: 0.75, color: WHITE, weight: 500, family: FB, italic: true });
    info = text(lineTex(infoLines, 1600, 200), 1600 / 200);
    let t = 2.4;
    for (const k of ORDER) {
      const c = cards[k]; if (!c) continue;
      scene.add(c.g);
      c.a = t; c.b = t + 2.7; t += 2.55; // chaque image reste bien visible avant de rejoindre l'affiche
      const name = k === 'character' ? card.characterName : k === 'weapon' ? card.weaponName : '';
      c.cap = text(captionTex(CAPTION[k], name), 1024 / 128);
      events.push([c.a, 'whoosh'], [c.a + 0.8, 'hit']);
    }
    T_TITLE = t + 0.5; T_INFO = T_TITLE + 1; T_END = T_INFO + 1.2;
    events.push([0.25, 'whoosh'], [1.12, 'boom'], [T_TITLE - 0.25, 'whoosh'], [T_TITLE + 0.3, 'boom']);
    return { T_END, events, impacts: [[1.12, 0.16], ...Object.values(cards).map((c) => [c.a + 0.8, 0.06]), [T_TITLE + 0.3, 0.16]] };
  }

  function frame(t, dt) {
    const lay = layout(view.W, view.H);
    const { W, H } = lay;
    // Décor
    const bg = E.out(seg(t, 0, 1.6));
    const kM = behind(moon.position.z);
    moon.position.set(0.22 * W * kM, (lay.W < lay.H ? 0.3 : 0.18) * H * kM, -14);
    moon.scale.setScalar(Math.min(0.17 * H, 0.3 * W) * kM * lerp(0.7, 1, bg)); ring.position.copy(moon.position); ring.scale.copy(moon.scale);
    moon.material.opacity = bg; ring.material.opacity = bg * 0.35;
    const kK = behind(kanji.position.z);
    kanji.scale.setScalar(Math.min(W, H) * 1.05 * kK * lerp(1.35, 1, E.out(seg(t, 0, 2.2))));
    kanji.position.set(-0.08 * W * kK, 0.04 * H * kK, -8);
    kanji.material.opacity = 0.14 * bg + 0.08 * Math.exp(-Math.max(0, t - 1.12) * 3) * (t > 1.12 ? 1 : 0);
    kanji.rotation.z = Math.sin(t * 0.2) * 0.03;
    for (const m of smokes) {
      const d = m.userData, k = behind(d.z);
      m.position.set((d.x * W * 0.5 + Math.sin(t * 0.07 + d.r) * 0.6) * k, (d.y * H * 0.5 + Math.cos(t * 0.05 + d.r) * 0.4) * k, d.z);
      m.scale.setScalar(Math.max(W, H) * 0.75 * d.s * k); m.rotation.z = d.r + t * d.v; m.material.opacity = 0.16 * bg;
    }
    const p = pg.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += spd[i] * dt; p[i * 3] += Math.sin(t + i) * dt * 0.1; if (p[i * 3 + 1] > 9) p[i * 3 + 1] = -9; }
    pg.attributes.position.needsUpdate = true;
    embers.material.opacity = bg;

    // Blason : arrive du fond en tournant, éclair, puis se range en haut
    if (crest.material.map) {
      crest.visible = true;
      const pin = E.expo(seg(t, 0.15, 1)), pmv = E.inOut(seg(t, 1.6, 0.8));
      const big = Math.min(0.62 * W, 0.42 * H);
      crest.position.set(lerp(0, lay.crest.x, pmv), lerp(lerp(0, 0.06 * H, pin), lay.crest.y, pmv), lerp(-34, 0.2, pin));
      crest.scale.setScalar(lerp(big, lay.crest.s, pmv));
      crest.rotation.y = lerp(-Math.PI * 5, 0, pin) + Math.sin(t * 0.8) * 0.25 * pmv;
      crest.material.opacity = seg(t, 0.15, 0.3);
    }
    // Éclairs blancs
    const fl = (at, k) => (t >= at ? Math.max(0, 1 - (t - at) / 0.5) * k : 0);
    flash.material.opacity = reduce ? 0 : Math.max(fl(1.12, 0.85), fl(T_TITLE + 0.3, 0.55));

    // « BIENVENUE » sur un grand trait de pinceau
    const helloOut = seg(t, 2.25, 0.45);
    slashA.scale.set(1.25 * Math.max(W, H * 0.7), 1.25 * Math.max(W, H * 0.7), 1);
    slashA.position.set(0, -0.2 * H, 0.6); slashA.rotation.z = 0.05;
    slashA.material.uniforms.p.value = E.out(seg(t, 1.12, 0.45)); slashA.material.uniforms.o.value = 1 - helloOut;
    hello.scale.setScalar(Math.min(0.8 * W, 0.85 * H) / (1600 / 260));
    hello.position.set(lerp(0.06 * W, 0, E.out(seg(t, 1.2, 0.5))), -0.2 * H, 0.7); hello.rotation.z = 0.05;
    hello.material.opacity = seg(t, 1.2, 0.3) * (1 - helloOut);
    kicker.scale.setScalar(lay.kicker.w / (1600 / 140));
    kicker.position.set(lay.kicker.x, lay.kicker.y - (1 - E.out(seg(t, 1.9, 0.6))) * 0.04 * H, 0.2);
    kicker.material.opacity = seg(t, 1.9, 0.6);

    // Cartes : entrée en grand au centre avec son étiquette, puis place dans l'affiche
    let idx = 0;
    for (const k of ORDER) {
      const c = cards[k]; if (!c) continue;
      // Photo ou personnage seul : centré
      const solo = (k === 'photo' || k === 'character') && !(cards.photo && cards.character);
      const slot = solo ? { ...lay[k], x: 0, ry: 0 } : lay[k], hero = lay.hero;
      const sHero = fit(c.aspect, hero.w, hero.h), sSlot = fit(c.aspect, slot.w, slot.h);
      const pin = E.expo(seg(t, c.a, 0.9)), pout = E.inOut(seg(t, c.b, 0.85));
      const side = k === 'weapon';
      const fx = side ? -W * 1.3 : 0, fz = side ? 0.5 : -26, fry = side ? 0 : -Math.PI * 3, frz = side ? 0.25 : -0.4;
      const drift = Math.sin((t - c.a) * 1.4) * 0.02 * H * (1 - pout);
      const idle = Math.sin(t * 0.9 + idx * 1.7) * 0.008 * H * seg(t, c.b + 0.8, 1);
      c.g.position.set(lerp(lerp(fx, hero.x, pin), slot.x, pout), lerp(lerp(hero.y - 0.05 * H, hero.y, pin) + drift, slot.y, pout) + idle, lerp(lerp(fz, 1, pin), slot.z || 0, pout));
      c.g.scale.setScalar(lerp(sHero, sSlot, pout));
      c.g.rotation.set(lerp(0, slot.rx || 0, pout), lerp(lerp(fry, -0.08, pin), slot.ry || 0, pout) + Math.sin(t * 0.6 + idx) * 0.04 * seg(t, c.b + 0.8, 1), lerp(frz, 0, pin));
      const o = seg(t, c.a, 0.25);
      c.g.visible = o > 0;
      for (const m of c.mats) m.opacity = o;
      // Reflet à l'arrivée, puis de temps en temps
      const sp = t < T_END ? seg(t, c.a + 0.75, 0.9) : (((t - T_END) + idx * 1.6) % 7) / 1.1;
      c.shine.uniforms.p.value = sp > 0 && sp < 1 ? sp : -1;
      // Étiquette sous l'image
      const cy = hero.y - (sHero / 2) - 0.055 * H;
      c.cap.scale.setScalar(Math.min(0.75 * W, 0.6 * H) / (1024 / 128));
      c.cap.position.set(hero.x + (1 - E.out(seg(t, c.a + 0.45, 0.4))) * -0.1 * W, Math.max(cy, -0.46 * H), 1.2);
      c.cap.material.opacity = seg(t, c.a + 0.45, 0.3) * (1 - seg(t, c.b - 0.15, 0.25));
      idx++;
    }
    // L'arme arrive sur un trait de pinceau
    const wc = cards.weapon;
    if (wc) {
      slashC.scale.set(1.2 * W, 1.2 * W, 1); slashC.position.set(0, lay.hero.y, 0.3); slashC.rotation.z = -0.04;
      slashC.material.uniforms.p.value = E.out(seg(t, wc.a, 0.35)); slashC.material.uniforms.o.value = 0.9 * (1 - seg(t, wc.b - 0.1, 0.4));
    } else slashC.visible = false;

    // Pseudo : frappe avec un éclair, puis niveau, spécialité et devise
    const pt = seg(t, T_TITLE, 0.4);
    const tw = lay.title.w;
    title.scale.setScalar((tw / (2048 / 360)) * lerp(2.6, 1, E.back(pt)));
    title.position.set(lay.title.x, lay.title.y, 0.8);
    title.material.opacity = pt;
    slashB.scale.set(tw * 1.08, tw * 1.08, 1); slashB.position.set(lay.title.x, lay.title.y - 0.004 * H, 0.75); slashB.rotation.z = 0.02;
    slashB.material.uniforms.p.value = E.out(seg(t, T_TITLE - 0.12, 0.4)); slashB.material.uniforms.o.value = 0.95;
    info.scale.setScalar(lay.info.w / (1600 / 200));
    info.position.set(lay.info.x, lay.info.y - (1 - E.out(seg(t, T_INFO, 0.6))) * 0.03 * H, 0.8);
    info.material.opacity = seg(t, T_INFO, 0.6);
  }

  return { ready, build, frame };
}

export { RED, WHITE, MUTED, FD, FB, E, seg, lerp, fit, slug, VERT, canvasTex, lineTex, titleTex, dotTex, makeCard };
