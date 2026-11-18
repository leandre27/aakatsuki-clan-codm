// Fiche d'une séance : date, mode, points, présents annoncés et points déjà attribués
import * as api from '../api.js';
import { I } from '../icons.js';
import { esc, nf, fmtDay, fmtTime, avatar, toast, act, ask, empty } from '../ui.js';

const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function countdown(date) {
  const ms = new Date(date).getTime() - Date.now();
  if (ms < -3 * 36e5) return 'Terminée';
  if (ms <= 0) return 'En cours';
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  if (h >= 48) return `Dans ${Math.floor(h / 24)} jours`;
  if (h >= 1) return `Dans ${h} h ${String(m).padStart(2, '0')}`;
  return `Dans ${m} min`;
}

// Ligne de séance cliquable, partagée par le calendrier et la base
export function sessionRow(a, u) {
  const rule = api.data().settings.pointRules.find((r) => r.id === a.ruleId);
  const inn = u && a.registrations.includes(u.id);
  const n = a.registrations.length;
  const linked = u && ['active', 'suspended', 'inactive'].includes(u.status);
  return `<li class="${linked ? 's-linked' : ''}">${linked ? `<a class="s-link" href="#/seance/${esc(a.id)}" aria-label="Détails de ${esc(a.title)}"></a>` : ''}
    <div class="s-when"><b>${new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'short' })}</b><span>${fmtTime(a.date)}</span></div>
    <div class="s-main"><b>${esc(a.title)}</b><small>${n} présent${n > 1 ? 's' : ''} annoncé${n > 1 ? 's' : ''}${rule ? ` · +${rule.points} pts` : ''}</small></div>
    ${u?.status === 'active' ? `<button class="btn btn-sm ${inn ? 'btn-line' : ''}" data-act="${a.id}">${inn ? 'Inscrit' : 'Je viens'}</button>` : linked ? I.right : ''}</li>`;
}

export function session({ params, rerender }) {
  const db = api.data();
  const a = db.activities.find((x) => x.id === params.id);
  const back = `<a class="back" href="#/calendrier">${I.left} Calendrier</a>`;
  if (!a) return { html: `<div class="wrap page">${back}${empty('Cette séance n’existe plus. Elle a peut-être été retirée du programme.')}</div>` };
  const u = api.me();
  const rule = db.settings.pointRules.find((r) => r.id === a.ruleId);
  const at = new Date(a.date).getTime();
  const started = at < Date.now();
  const inn = a.registrations.includes(u.id);
  const people = a.registrations.map((id) => api.user(id)).filter(Boolean);
  const paid = db.transactions.filter((t) => t.activityId === a.id && t.points > 0 && t.kind === 'earn');
  const canCancel = !a.cancelled && !started && (api.can('points.manage') || api.can('rules.manage'));
  const state = a.cancelled ? 'cancelled' : started ? (Date.now() - at > 3 * 36e5 ? 'done' : 'live') : 'open';
  const pill = { cancelled: ['ts-cancelled', 'Annulée'], done: ['ts-done', 'Terminée'], live: ['ts-live', 'En cours'], open: ['ts-open', 'À venir'] }[state];

  const html = `<div class="wrap page">
    ${back}
    <div class="t-hero ses-hero ts-${state}">
      <div class="t-hero-meta"><span class="pill ${pill[0]}">${pill[1]}</span><span>${a.auto ? 'Programme de la semaine' : 'Séance ponctuelle'}${a.mode ? ` · ${esc(a.mode)}` : ''}</span></div>
      <h1>${esc(a.title)}</h1>
      ${a.cancelled ? `<p class="ses-cancel">${I.x} Séance annulée${a.cancelReason ? ` : ${esc(a.cancelReason)}` : '.'}</p>` : state === 'open' ? `<p class="ses-count">${I.clock} ${countdown(a.date)}</p>` : ''}
      <dl class="t-facts">
        <div><dt>Date</dt><dd>${fmtDay(a.date)}</dd></div>
        <div><dt>Heure</dt><dd>${fmtTime(a.date)}</dd></div>
        <div><dt>Mode</dt><dd>${esc(a.mode ? api.MODES[a.mode] || a.mode : 'MJ et BR')}</dd></div>
        <div><dt>Points</dt><dd>${rule ? `+${nf(rule.points)} pts` : '–'}</dd></div>
        <div><dt>Activité</dt><dd>${esc(rule?.label || '–')}</dd></div>
        <div><dt>Présents annoncés</dt><dd>${people.length}</dd></div>
      </dl>
      ${state === 'open' ? `<p class="small muted ses-note">Annonce ta présence pour que le clan sache qui sera là. Les points sont crédités après la séance, quand un responsable confirme les présences.</p>` : ''}
      <div class="row">
        ${state === 'open' && u.status === 'active' ? `<button class="btn btn-lg ${inn ? 'btn-line' : ''}" id="go">${inn ? `${I.check} Je viens · retirer` : 'Je viens'}</button>` : ''}
        ${canCancel ? `<button class="btn btn-ghost btn-sm" id="cancel">Annuler la séance</button>` : ''}
      </div>
    </div>

    <section class="sec"><div class="sec-head"><h2>Présents annoncés</h2><span class="muted small">${plural(people.length, 'joueur')}</span></div>
      ${people.length ? `<ul class="ses-people">${people.map((p) => `<li><a href="#/joueur/${esc(p.id)}">${avatar(p, 'sm')}<span class="ses-name">${esc(p.pseudo)}</span>${p.id === u.id ? '<small>toi</small>' : ''}</a></li>`).join('')}</ul>`
        : empty(state === 'open' ? 'Personne ne s’est encore annoncé. Sois le premier.' : 'Personne ne s’était annoncé.')}
    </section>

    ${paid.length ? `<section class="sec"><div class="sec-head"><h2>Points attribués</h2><span class="muted small">${plural(paid.length, 'joueur')}</span></div>
      <ul class="ses-people">${paid.map((t) => { const p = api.user(t.userId); return p ? `<li><a href="#/joueur/${esc(p.id)}">${avatar(p, 'sm')}<span class="ses-name">${esc(p.pseudo)}</span><small>+${nf(t.points)}</small></a></li>` : ''; }).join('')}</ul>
    </section>` : ''}
  </div>`;

  return {
    html,
    mount(root) {
      const go = root.querySelector('#go');
      if (go) go.onclick = act(async () => { const on = await api.toggleActivity(a.id); toast(on ? 'Présence annoncée.' : 'Présence retirée.'); rerender(); });
      const c = root.querySelector('#cancel');
      if (c) c.onclick = act(async () => {
        const r = await ask('Annuler la séance', `« ${a.title} » du ${fmtDay(a.date)} à ${fmtTime(a.date)} sera retirée du calendrier. Tout le clan est prévenu.`, { reason: true, placeholder: 'Motif', label: 'Annuler la séance', danger: true });
        if (!r) return; await api.cancelActivity(a.id, r.reason); toast('Séance annulée, le clan est prévenu.'); rerender();
      });
      // Le compte à rebours reste juste tant que la page est ouverte
      const t = setInterval(() => { const el = root.querySelector('.ses-count'); if (el) el.innerHTML = `${I.clock} ${countdown(a.date)}`; }, 30_000);
      return () => clearInterval(t);
    },
  };
}
