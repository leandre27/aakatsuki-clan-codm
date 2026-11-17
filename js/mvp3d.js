// Joueur du mois : animation 3D plein écran, en or. Faisceaux de lumière, roulement de tambour,
// médaille qui tourne et révèle le joueur, pluie de confettis, nom en or et statistiques du mois.
import * as THREE from 'three';
import { runShow, WHITE, FD, FB, E, seg, lerp, fit, slug, VERT, canvasTex, lineTex, titleTex, dotTex, makeCard } from './welcome3d.js';

const GOLD = '#f0c35a', GOLD_D = '#8a6a1c';
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);

// Face de la médaille : la photo du joueur dans un cercle cerclé d'or
function faceTex(img, initials) {
  return canvasTex(1024, 1024, (g, w) => {
    g.fillStyle = '#141417'; g.fillRect(0, 0, w, w);
    g.save(); g.beginPath(); g.arc(w / 2, w / 2, 430, 0, Math.PI * 2); g.clip();
    if (img) {
      const k = Math.max(860 / img.width, 860 / img.height);
      g.drawImage(img, w / 2 - (img.width * k) / 2, w / 2 - (img.height * k) / 2 - 20, img.width * k, img.height * k);
    } else {
      g.fillStyle = '#8a1016'; g.fillRect(0, 0, w, w);
      g.fillStyle = WHITE; g.font = `700 360px ${FD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initials, w / 2, w / 2 + 20);
    }
    g.restore();
    for (const [r, lw, col] of [[452, 44, GOLD], [478, 8, GOLD_D], [428, 6, '#fff3c4']]) { g.beginPath(); g.arc(w / 2, w / 2, r, 0, Math.PI * 2); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }
  });
}
// Revers : le blason du clan sur fond rouge sombre
function backTex(logo) {
  return canvasTex(1024, 1024, (g, w) => {
    g.fillStyle = '#3a080c'; g.fillRect(0, 0, w, w);
    if (logo) g.drawImage(logo, 160, 160, 704, 704);
    for (const [r, lw, col] of [[452, 44, GOLD], [478, 8, GOLD_D]]) { g.beginPath(); g.arc(w / 2, w / 2, r, 0, Math.PI * 2); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }
  });
}
// Plaque de statistique, redessinée pendant le décompte
function plate(label) {
  const tex = canvasTex(640, 360, () => {});
  let last = null;
  tex.draw = (value) => {
    if (value === last) return; last = value;
    const g = tex.image.getContext('2d'), w = 640, h = 360;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#141417'; g.fillRect(8, 8, w - 16, h - 16);
    g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(11, 11, w - 22, h - 22);
    g.fillStyle = GOLD; g.fillRect(8, 8, w - 16, 14);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 150; g.font = `700 ${size}px ${FD}`;
    while (g.measureText(value).width > w - 80 && size > 40) { size -= 6; g.font = `700 ${size}px ${FD}`; }
    g.fillStyle = WHITE; g.fillText(value, w / 2, 160);
    if ('letterSpacing' in g) g.letterSpacing = '4px';
    g.font = `600 40px ${FB}`; g.fillStyle = GOLD; g.fillText(label, w / 2, 290);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    tex.needsUpdate = true;
  };
  return tex;
}

function layout(W, H) {
  if (W / H < 0.9) return {
    W, H, portrait: true,
    title: { y: 0.355 * H, w: 0.86 * W }, period: { y: 0.305 * H, w: 0.55 * W },
    medal: { x: 0, y: 0.08 * H, r: Math.min(0.34 * W, 0.14 * H) },
    name: { y: -0.12 * H, w: 0.96 * W },
    plates: [0, 1, 2].map((i) => ({ x: (i - 1) * 0.305 * W, y: -0.255 * H, w: 0.285 * W })),
    bravo: { y: -0.39 * H, w: 0.9 * W },
  };
  return {
    W, H, portrait: false,
    title: { y: 0.37 * H, w: 0.42 * W }, period: { y: 0.3 * H, w: 0.26 * W },
    medal: { x: 0, y: 0.06 * H, r: 0.2 * H },
    name: { y: -0.2 * H, w: 0.48 * W },
    plates: [0, 1, 2].map((i) => ({ x: -0.34 * W, y: (0.2 - i * 0.21) * H, w: 0.2 * W })),
    character: { x: 0.33 * W, y: -0.02 * H, w: 0.24 * W, h: 0.62 * H },
    bravo: { y: -0.37 * H, w: 0.5 * W },
  };
}

function mvpScene(u, d, { scene, camera, view, CAM_Z, reduce, load, text }) {
  const card = u.card || {};
  const st = d.stats || {};
  const behind = (z) => (CAM_Z - z) / CAM_Z;
  const goldLight = new THREE.PointLight(0xffc860, 60, 40); goldLight.position.set(0, 4, 7); scene.add(goldLight);

  // Faisceaux de lumière dorée venus du haut
  const rayGeo = new THREE.PlaneGeometry(1, 1); rayGeo.translate(0, -0.5, 0);
  const rays = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(rayGeo, new THREE.ShaderMaterial({
      uniforms: { o: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VERT,
      fragmentShader: 'uniform float o; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.8) * smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x) * o; gl_FragColor = vec4(vec3(1.0, 0.78, 0.36) * a, a); }',
    }));
    m.userData = { a: (i - 3) * 0.2, ph: Math.random() * 6, w: 0.6 + Math.random() * 0.6 };
    scene.add(m); return m;
  });
  // Poussière d'or qui monte
  const N = 220;
  const pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = (Math.random() - 0.5) * 18; pos[i * 3 + 2] = -Math.random() * 14 + 3; spd[i] = 0.15 + Math.random() * 0.5; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ map: dotTex(), color: 0xffc860, size: 0.14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);
  // Confettis : or, rouge, blanc
  const C = 260;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.16), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), C);
  const cp = new Float32Array(C * 3), cv = new Float32Array(C * 3), cr = new Float32Array(C * 3);
  const palette = [0xf0c35a, 0xf0c35a, 0xd6202a, 0xf2efe9, 0xb8892c];
  for (let i = 0; i < C; i++) confetti.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  confetti.visible = false; confetti.renderOrder = 6; scene.add(confetti);
  const dummy = new THREE.Object3D();
  let burstAt = -1;
  function burst(x, y) {
    for (let i = 0; i < C; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
      cp.set([x, y, 0.5 + Math.random()], i * 3);
      cv.set([Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.6 + 5, (Math.random() - 0.3) * 4], i * 3);
      cr.set([Math.random() * 6, Math.random() * 6, (Math.random() - 0.5) * 14], i * 3);
    }
  }
  // Onde de choc dorée à la révélation
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 128), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  wave.renderOrder = 4; scene.add(wave);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  flash.position.z = -1; flash.renderOrder = 10; camera.add(flash);

  // Médaille : face (photo) et revers (blason), tranche en or
  const medal = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0a93a, metalness: 0.85, roughness: 0.28, emissive: 0x3a2400 });
  const front = new THREE.MeshBasicMaterial({ transparent: true });
  const back = new THREE.MeshBasicMaterial({ transparent: true });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.14, 96), [gold, front, back]);
  disc.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 16, 120), gold);
  medal.add(disc, rim); medal.visible = false; scene.add(medal);

  let titleM, periodM, nameM, bravoM, charCard = null;
  const plates = [];
  const T = { title: 1.0, medal: 2.4, reveal: 4.4, name: 4.95, plates: 5.6, bravo: 7.5, end: 8.6 };
  const initials = String(u.pseudo).replace(/影/g, '').replace(/^\W*AK(?![a-z])/i, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'AK';
  const imgOf = (url) => (url ? load(url).then((tx) => tx.image).catch(() => null) : Promise.resolve(null));
  const ready = Promise.all([
    document.fonts?.load(`700 120px ${FD}`).catch(() => {}),
    document.fonts?.load(`600 60px ${FB}`).catch(() => {}),
    imgOf(card.photo || u.avatar || card.character).then((img) => { front.map = faceTex(img, initials); front.map.center.set(0.5, 0.5); front.map.rotation = Math.PI / 2; front.needsUpdate = true; }),
    imgOf('assets/logo-solid.webp').then((img) => { back.map = backTex(img); back.map.center.set(0.5, 0.5); back.map.rotation = Math.PI / 2; back.needsUpdate = true; }),
    card.character && card.photo ? load(card.character).then((tx) => { charCard = makeCard(tx); scene.add(charCard.g); }).catch(() => {}) : null,
  ]);

  function build() {
    titleM = text(lineTex([{ text: 'JOUEUR DU MOIS', size: 170, y: 0.5, spacing: 14, color: GOLD }], 1600, 240), 1600 / 240);
    periodM = text(lineTex([{ text: String(d.period || '').toUpperCase(), size: 92, y: 0.5, spacing: 12, color: WHITE, weight: 600, family: FB }], 1200, 140), 1200 / 140);
    nameM = text(titleTex(u.pseudo, { sigil: GOLD, head: WHITE, tail: GOLD }), 2048 / 360);
    bravoM = text(lineTex([{ text: 'BRAVO DE TOUT LE CLAN 影 AaKATSUKI 影', size: 70, y: 0.5, spacing: 8, color: WHITE, weight: 600, family: FB }], 1600, 120), 1600 / 120);
    const stats = [
      { label: 'POINTS DU MOIS', to: Number(st.points) || 0, fmt: (v) => fmt(Math.round(v)) },
      { label: 'CLASSEMENT SAISON', to: Number(st.rank) || 0, fmt: (v) => (st.rank ? `#${Math.max(1, Math.round(v))}` : '–') },
      { label: 'GRADE', text: String(st.grade || '–').toUpperCase() },
    ];
    for (const s of stats) { const tex = plate(s.label); tex.draw(s.text || s.fmt(0)); plates.push({ ...s, tex, m: text(tex, 640 / 360) }); }
    return {
      T_END: T.end,
      events: [[0.25, 'roll'], [T.title, 'boom'], [T.medal, 'whoosh'], [T.reveal, 'boom'], [T.reveal + 0.05, 'chime'], [T.name, 'hit'], ...plates.map((_, i) => [T.plates + i * 0.45, 'hit']), [T.bravo, 'chime']],
      impacts: [[T.title, 0.12], [T.reveal, 0.22], [T.name, 0.08]],
    };
  }

  function frame(t, dt) {
    const L = layout(view.W, view.H);
    const { W, H } = L;
    const bg = E.out(seg(t, 0, 1.4));
    // Faisceaux : balayent pendant le roulement, s'ouvrent à la révélation
    const open = E.out(seg(t, T.reveal, 0.8));
    for (const r of rays) {
      const k = behind(-6), d0 = r.userData;
      r.position.set(0, 0.62 * H * k, -6);
      r.rotation.z = d0.a * lerp(0.6, 1.4, open) + Math.sin(t * 0.6 + d0.ph) * lerp(0.35, 0.08, open);
      r.scale.set(d0.w * 1.2 * k, 1.9 * H * k, 1);
      r.material.uniforms.o.value = bg * lerp(0.25, 0.42, open) * (0.8 + 0.2 * Math.sin(t * 2 + d0.ph));
    }
    const p = pg.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += spd[i] * dt; if (p[i * 3 + 1] > 9) p[i * 3 + 1] = -9; }
    pg.attributes.position.needsUpdate = true;
    dust.material.opacity = bg;

    // « JOUEUR DU MOIS » : frappe au centre, puis monte en haut
    const pt = seg(t, T.title, 0.4), up = E.inOut(seg(t, T.medal - 0.2, 0.7));
    const tw = lerp(Math.min(0.95 * W, 1.1 * H), L.title.w, up);
    titleM.scale.setScalar((tw / (1600 / 240)) * lerp(2.4, 1, E.back(pt)));
    titleM.position.set(0, lerp(0.04 * H, L.title.y, up), 1);
    titleM.material.opacity = pt;
    periodM.scale.setScalar(L.period.w / (1200 / 140));
    periodM.position.set(0, lerp(-0.04 * H, L.period.y, up) - (1 - E.out(seg(t, T.title + 0.35, 0.5))) * 0.02 * H, 1);
    periodM.material.opacity = seg(t, T.title + 0.35, 0.4);
    const fl = (at, k) => (t >= at ? Math.max(0, 1 - (t - at) / 0.55) * k : 0);
    flash.material.opacity = reduce ? 0 : Math.max(fl(T.title, 0.35), fl(T.reveal, 0.9));

    // Médaille : arrive du fond en tournant vite, ralentit et montre le joueur
    const pin = E.expo(seg(t, T.medal, 1)), spin = 1 - E.out(seg(t, T.medal, T.reveal - T.medal));
    medal.visible = t >= T.medal;
    const pulse = 1 + Math.exp(-Math.max(0, t - T.reveal) * 6) * 0.12 * (t >= T.reveal ? 1 : 0);
    medal.position.set(L.medal.x, L.medal.y + Math.sin(t * 1.1) * 0.012 * H * seg(t, T.reveal, 1), lerp(-30, 0.6, pin));
    medal.scale.setScalar(L.medal.r * pulse);
    medal.rotation.set(Math.sin(t * 0.8) * 0.06 * seg(t, T.reveal, 1), Math.PI * 10 * spin + Math.sin(t * 0.7) * 0.22 * seg(t, T.reveal + 0.3, 1.2), 0);
    // Onde de choc et confettis
    if (t >= T.reveal && burstAt < 0) { burstAt = T.reveal; burst(L.medal.x, L.medal.y); }
    if (t < T.reveal) burstAt = -1;
    const wv = seg(t, T.reveal, 0.9);
    wave.position.set(L.medal.x, L.medal.y, 0.4);
    wave.scale.setScalar(L.medal.r * lerp(1, 4.2, E.out(wv)));
    wave.material.opacity = t >= T.reveal ? (1 - wv) * 0.9 : 0;
    confetti.visible = burstAt >= 0 && !reduce;
    if (confetti.visible) {
      for (let i = 0; i < C; i++) {
        const j = i * 3;
        cv[j + 1] -= 7 * dt; cv[j] *= 1 - 0.9 * dt; cv[j + 1] *= 1 - 0.35 * dt; cv[j + 2] *= 1 - 0.9 * dt;
        cv[j + 1] = Math.max(cv[j + 1], -2.2 - (i % 5) * 0.2);
        cp[j] += (cv[j] + Math.sin(t * 3 + i) * 0.4) * dt; cp[j + 1] += cv[j + 1] * dt; cp[j + 2] += cv[j + 2] * dt;
        if (cp[j + 1] < -H * 0.7) { cp[j + 1] = H * 0.6; cv[j + 1] = -1.5; cp[j] = (Math.random() - 0.5) * W; }
        cr[j] += dt * 3; cr[j + 1] += dt * 4;
        dummy.position.set(cp[j], cp[j + 1], cp[j + 2]); dummy.rotation.set(cr[j], cr[j + 1], cr[j + 2]); dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }

    // Nom en or
    const nt = seg(t, T.name, 0.4);
    nameM.scale.setScalar((L.name.w / (2048 / 360)) * lerp(2.4, 1, E.back(nt)));
    nameM.position.set(0, L.name.y, 1.1);
    nameM.material.opacity = nt;

    // Statistiques : arrivent une à une, les nombres défilent
    plates.forEach((pl, i) => {
      const a = T.plates + i * 0.45, s = E.out(seg(t, a, 0.5));
      const slot = L.plates[i];
      pl.m.scale.setScalar(slot.w / (640 / 360));
      pl.m.position.set(slot.x + (L.portrait ? 0 : -(1 - s) * 0.1 * W), slot.y - (L.portrait ? (1 - s) * 0.08 * H : 0), 1);
      pl.m.material.opacity = s;
      if (!pl.text) pl.tex.draw(pl.fmt(pl.to * E.out(seg(t, a + 0.1, 1))));
    });
    // Personnage favori (écran large)
    if (charCard) {
      const c = charCard, slot = L.character;
      c.g.visible = !!slot && t >= T.name;
      if (slot) {
        const s = E.out(seg(t, T.name, 0.8));
        c.g.position.set(slot.x + (1 - s) * 0.3 * W, slot.y + Math.sin(t * 0.9) * 0.008 * H, -0.3);
        c.g.scale.setScalar(fit(c.aspect, slot.w, slot.h)); c.g.rotation.set(0, -0.18 + Math.sin(t * 0.6) * 0.04, 0);
        for (const m of c.mats) m.opacity = s;
        const sp = seg(t, T.name + 0.6, 0.9); c.shine.uniforms.p.value = sp > 0 && sp < 1 ? sp : -1;
      }
    }
    bravoM.scale.setScalar(L.bravo.w / (1600 / 120));
    bravoM.position.set(0, L.bravo.y, 1);
    bravoM.material.opacity = seg(t, T.bravo, 0.6);
  }

  return { ready, build, frame };
}

// u : le membre, d : la distinction « MVP du mois » (période et statistiques du mois)
export function playMvp(u, d, { onClose } = {}) {
  return runShow({
    label: `Joueur du mois : ${u.pseudo}`, loading: 'Préparation du joueur du mois',
    fileName: `joueur-du-mois-${slug(u.pseudo)}`, shareTitle: `${u.pseudo}, joueur du mois`, onClose,
    setup: (ctx) => mvpScene(u, d, ctx),
  });
}
