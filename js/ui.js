import { I, cloud } from './icons.js';
import * as api from './api.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const nf = (n) => new Intl.NumberFormat('fr-FR').format(n);
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + nf(Math.abs(n));
export const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const fmtDay = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const fmtDT = (d) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function ago(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) { const j = Math.ceil(-s / 86400); return j <= 1 ? (-s < 86400 && new Date(d).getDate() === new Date().getDate() ? `aujourd’hui ${fmtTime(d)}` : `demain ${fmtTime(d)}`) : `dans ${j} jours`; }
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  return j === 1 ? 'hier' : `il y a ${j} j`;
}
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function avatar(u, size = 'md') {
  if (!u) return `<span class="av av-${size}">?</span>`;
  if (u.avatar) return `<img class="av av-${size}" src="${esc(u.avatar)}" alt="">`;
  const light = ['#e9e4da', '#f2efe9'].includes(u.color);
  return `<span class="av av-${size}" style="--av:${esc(u.color || '#d6202a')};--avfg:${light ? '#0b0b0d' : '#f2efe9'}">${esc(initials(u.pseudo))}</span>`;
}
// Initiales lisibles d'un pseudo du clan : 影AK-MINATO影 → MI, [1MMpTggoX++ → 1M
export function initials(pseudo) {
  const core = String(pseudo || '').replace(/影/g, '').replace(/^\W*AK(?![a-z])/i, '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '');
  return (core || String(pseudo || '?')).slice(0, 2).toUpperCase();
}

export function toast(msg, kind = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${kind === 'err' ? I.x : I.check}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 4200 : 2800);
}
export const act = (fn) => async (e) => {
  try { await fn(e); } catch (err) { console.error(err); toast(err.message || 'Une erreur est survenue.', 'err'); }
};

export function sheet(title, html, mount) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  requestAnimationFrame(() => root.classList.add('open'));
  document.body.classList.add('locked');
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    root.classList.remove('open'); document.body.classList.remove('locked');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 280);
  }
  document.addEventListener('keydown', onKey);
  root.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  const body = root.querySelector('.sheet-body');
  mount?.(body, close);
  setTimeout(() => body.querySelector('input:not([type=hidden]),textarea,select')?.focus({ preventScroll: true }), 320);
  return close;
}

// Demande de confirmation, avec motif optionnel ou obligatoire
export function ask(title, text, { label = 'Confirmer', danger = false, reason = false, required = false, placeholder = 'Motif' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    sheet(title, `
      <p class="muted">${esc(text)}</p>
      <form class="stack" id="askf">
        ${reason ? `<label class="field"><span>${esc(placeholder)}${required ? '' : ' (facultatif)'}</span><textarea name="reason" rows="3" ${required ? 'required minlength="3"' : ''}></textarea></label>` : ''}
        <div class="row end"><button type="button" class="btn btn-line" data-close>Annuler</button><button class="btn ${danger ? 'btn-danger' : ''}">${esc(label)}</button></div>
      </form>`, (body, close_) => {
      body.querySelector('[data-close]').onclick = () => { close_(); if (!done) resolve(null); };
      body.querySelector('#askf').onsubmit = (e) => { e.preventDefault(); done = true; const r = e.target.reason?.value || ''; close_(); resolve({ reason: r }); };
    });
    document.querySelectorAll('#sheet-root [data-close]').forEach((b) => b.addEventListener('click', () => { if (!done) { done = true; resolve(null); } }));
  });
}

export const formObj = (form) => Object.fromEntries(new FormData(form));

export function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count); const t0 = performance.now(); const dur = 900;
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = nf(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ---------- Composants ----------
export const statusPill = (s) => `<span class="pill st-${s}">${esc(api.STATUS[s] || s)}</span>`;
export const tStatusPill = (s) => `<span class="pill ts-${s}">${esc(api.T_STATUS[s])}</span>`;
export const rStatusPill = (s) => `<span class="pill rs-${s}">${esc(api.R_STATUS[s])}</span>`;
export function gradeTag(points) {
  const g = api.grade(points);
  return `<span class="grade" data-g="${g.index}"><i style="--n:${g.index + 1}"></i>${esc(g.name)}</span>`;
}
export function gradeProgress(points) {
  const g = api.grade(points);
  if (!g.next) return `<div class="gp"><div class="gp-top"><b>${esc(g.name)}</b><span>Grade maximal atteint</span></div><div class="bar"><i style="--p:100%"></i></div></div>`;
  const p = Math.max(0, Math.min(100, ((points - g.min) / (g.next.min - g.min)) * 100));
  return `<div class="gp"><div class="gp-top"><b>${esc(g.name)}</b><span>${nf(g.next.min - points)} pts avant ${esc(g.next.name)}</span></div><div class="bar"><i style="--p:${p.toFixed(1)}%"></i></div></div>`;
}

export function head(title, sub = '', right = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${right}</div>`;
}
export const empty = (t) => `<div class="empty">${cloud('empty-cloud', 7)}<p>${esc(t)}</p></div>`;

export function podium(rows, unit = 'pts', linked = true) {
  const slot = (r, pos) => {
    if (!r || !(r.value > 0)) return `<div class="pod pod-${pos} is-empty"><div class="box"><div class="f fr"><span>${pos}</span></div><div class="f tp"></div><div class="f sd"></div></div></div>`;
    const who = `${avatar(r.user, 'lg')}<b>${esc(r.user.pseudo)}</b><span>${nf(r.value)} ${unit}</span>`;
    return `<div class="pod pod-${pos}">${linked ? `<a class="pod-who" href="#/joueur/${r.user.id}">${who}</a>` : `<div class="pod-who">${who}</div>`}
      <div class="box"><div class="f fr"><span>${pos}</span></div><div class="f tp"></div><div class="f sd"></div></div></div>`;
  };
  return `<div class="podium" data-tilt><div class="stage">${slot(rows[1], 2)}${slot(rows[0], 1)}${slot(rows[2], 3)}</div></div>`;
}
export function rankList(rows, { unit = 'pts', from = 3, meId = null, linked = true, limit = 100 } = {}) {
  const list = rows.slice(from, limit);
  if (!list.length && from === 0) return empty('Aucun membre classé pour le moment.');
  return `<ol class="ranks" start="${from + 1}">${list.map((r) => {
    const inner = `<span class="rk">${r.rank ?? '–'}</span>${avatar(r.user, 'sm')}<span class="rn"><b>${esc(r.user.pseudo)}</b>${gradeTag(r.s.permanent)}</span><span class="rv">${nf(r.value)}<small>${unit}</small></span>`;
    return `<li class="${r.user.id === meId ? 'is-me' : ''}">${linked ? `<a href="#/joueur/${r.user.id}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
  }).join('')}</ol>`;
}

export function tCard(t) {
  const d = new Date(t.date);
  const regs = api.activeRegs(t).length;
  return `<a class="tcard ts-${t.status}" href="#/tournoi/${t.id}">
    <div class="tdate"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span></div>
    <div class="tbody">
      <div class="tmeta">${esc(api.T_TYPES[t.type])} · ${esc(t.mode || 'MJ/BR')} · ${fmtTime(t.date)}</div>
      <h3>${esc(t.name)}</h3>
      <div class="tfoot">${tStatusPill(t.status)}<span class="places"><i style="--p:${Math.min(100, (regs / t.max) * 100)}%"></i>${regs}/${t.max}</span></div>
    </div>
    <span class="go">${I.right}</span>
  </a>`;
}

const CAT_MARK = { bp: 'BP', cp: 'CP', gift: 'GIFT', rare: 'RARE', special: 'AKT' };
export function rewardVisual(r) {
  if (r.img) return `<div class="rvis"><img src="${esc(r.img)}" alt=""></div>`;
  return `<div class="rvis rv-${r.category}"><span>${CAT_MARK[r.category] || 'AKT'}</span>${cloud('rvis-cloud', 7)}</div>`;
}
export function rewardTile(r, { action = true } = {}) {
  const st = api.rewardState(r);
  const why = api.me() ? api.whyCantRequest(r) : null;
  const btn = !action ? '' : !api.me() ? `<a class="btn btn-sm btn-line" href="#/connexion">Se connecter</a>` : why ? `<button class="btn btn-sm btn-line" disabled>${esc(why)}</button>` : `<button class="btn btn-sm" data-req="${r.id}">Demander</button>`;
  return `<article class="rtile rs-${st}">
    ${rewardVisual(r)}
    <div class="rinfo">
      <div class="rtop"><span class="rcat">${esc(api.R_CATS[r.category])}</span><span class="rstock">${st === 'on' ? `${r.stock} en stock` : esc(api.REWARD_STATE[st])}</span></div>
      <h3>${esc(r.name)}</h3>
      <p>${esc(r.description)}</p>
      <div class="rbottom"><span class="cost">${nf(r.cost)}<small>pts</small></span>${btn}</div>
    </div>
  </article>`;
}

export function weekly(program, { compact = false } = {}) {
  const today = (new Date().getDay() + 6) % 7;
  return `<ul class="week ${compact ? 'compact' : ''}">${[...program].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)).map((w) => {
    const rule = api.data().settings.pointRules.find((r) => r.id === w.ruleId);
    return `<li class="${w.day === today ? 'is-today' : ''}"><span class="wd">${api.DAYS[w.day].slice(0, 3)}</span><span class="wl"><b>${esc(w.label)}</b>${w.mode ? `<small>${esc(w.mode)}</small>` : ''}</span><span class="wt">${esc(w.time)}${rule ? `<small>+${rule.points}</small>` : ''}</span></li>`;
  }).join('')}</ul>`;
}

export function txRow(t, { showUser = false, correct = false } = {}) {
  const u = showUser ? api.user(t.userId) : null;
  const by = api.user(t.adminId);
  const neg = t.points < 0;
  return `<li class="tx ${neg ? 'neg' : 'pos'} ${api.isCorrected(t) ? 'is-corrected' : ''}">
    <span class="tx-pts">${signed(t.points)}</span>
    <div class="tx-main">
      <b>${showUser ? `${esc(u?.pseudo)} · ` : ''}${esc(t.label)}</b>
      ${t.reason && t.reason !== t.label ? `<span>${esc(t.reason)}</span>` : ''}
      <small>${fmtDT(t.at)}${by ? ` · par ${esc(by.pseudo)}` : ''} · solde ${nf(t.balanceBefore)} → ${nf(t.balanceAfter)}${api.isCorrected(t) ? ' · corrigée' : ''}</small>
    </div>
    ${correct && !api.isCorrected(t) && !t.correctionOf && !['reward', 'reset', 'bet'].includes(t.kind) ? `<button class="icon-btn" data-correct="${t.id}" aria-label="Corriger">${I.undo}</button>` : ''}
  </li>`;
}

// Inclinaison 3D au pointeur et au gyroscope
export function tilt(root) {
  const els = root.querySelectorAll('[data-tilt]');
  if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const offs = [];
  els.forEach((el) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`); el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
    };
    const leave = () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    offs.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
  });
  return () => offs.forEach((f) => f());
}
