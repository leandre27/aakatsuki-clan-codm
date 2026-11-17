import * as api from '../api.js';
import { I } from '../icons.js';
import { esc, nf, signed, fmtDT, fmtDate, fmtTime, ago, avatar, toast, act, sheet, ask, formObj, head, empty, gradeTag, statusPill, tStatusPill, rStatusPill, tCard, txRow, rewardVisual, toLocalInput, countUp } from '../ui.js';
import { resizeImage } from './public.js';

const SECTIONS = [
  ['admin', 'Vue d’ensemble', I.shield, () => true],
  ['admin/membres', 'Membres', I.users, () => api.can('members.view')],
  ['admin/points', 'Points', I.coin, () => api.can('points.manage')],
  ['admin/tournois', 'Tournois', I.cup, () => api.canManageAnyT()],
  ['admin/recompenses', 'Récompenses', I.gift, () => api.can('rewards.manage')],
  ['admin/annonces', 'Annonces', I.mega, () => api.can('announcements.manage')],
  ['admin/discipline', 'Discipline', I.flag, () => api.can('discipline.manage')],
  ['admin/journal', 'Journal', I.log, () => api.can('audit.view')],
  ['admin/reglages', 'Réglages', I.gear, () => api.can('rules.manage') || api.isSuper()],
];
function shell(current, title, sub, body, right = '') {
  return `<div class="wrap page admin">
    <nav class="subnav" aria-label="Administration">${SECTIONS.filter((s) => s[3]()).map(([p, l, i]) => `<a href="#/${p}" class="${p === current ? 'on' : ''}">${i}<span>${l}</span></a>`).join('')}</nav>
    ${head(title, sub, right)}
    ${body}
  </div>`;
}
const deny = (cur) => ({ html: shell(cur, 'Accès refusé', '', empty('Ton rôle ne donne pas accès à cette section.')) });

// ---------- Vue d'ensemble ----------
export function overview({ rerender }) {
  const o = api.overview();
  const prop = (api.can('rewards.manage') || api.can('members.manage')) ? api.monthlyProposal() : null;
  const top = api.ranking('season').slice(0, 5);
  const log = api.can('audit.view') ? api.auditLog().slice(0, 6) : [];
  const live = api.tournamentsList().filter((t) => ['live', 'open', 'closed'].includes(t.status)).slice(0, 3);
  const k = (label, v, sub, href) => `<a class="kpi" href="${href}"><span>${label}</span><b data-count="${v}">0</b><small>${sub}</small></a>`;
  const body = `
    <div class="kpis kpis-6">
      ${k('Membres', o.total, `${o.active} actifs`, '#/admin/membres')}
      ${k('Demandes', o.pending.length, 'inscriptions à examiner', '#/admin/membres?status=pending')}
      ${k('Tournois', o.upcoming, `${o.live} en cours`, '#/admin/tournois')}
      ${k('Participations', o.participations, '30 derniers jours', '#/admin/journal')}
      ${k('Points saison', o.distributed, 'distribués', '#/admin/points')}
      ${k('Récompenses', o.requests, `demandes · ${o.toDeliver} à remettre`, '#/admin/recompenses')}
    </div>
    ${prop ? `<section class="panel proposal"><div><span class="muted small">Proposition automatique</span><h3>MVP de ${esc(prop.period)} : ${esc(prop.user.pseudo)}</h3><p class="muted small">${nf(prop.points)} pts sur le mois. La validation ajoute la distinction et prépare une passe de combat à remettre. La remise reste à confirmer à la main.</p></div><button class="btn" id="prop">Valider la proposition</button></section>` : ''}
    ${api.can('announcements.manage') ? `<section class="panel proposal"><div><span class="muted small">Notifications du clan</span><h3>Classement de la semaine</h3><p class="muted small">Envoyé automatiquement à tous les membres le dimanche à partir de 20 h, avec le podium de la semaine.${api.data().settings.lastDigest ? ` Dernier envoi : semaine du ${new Date(api.data().settings.lastDigest).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.` : ''}</p></div><button class="btn btn-line" id="digest">Envoyer maintenant</button></section>` : ''}
    <div class="dash-grid">
      ${api.can('members.manage') ? `<section class="sec"><div class="sec-head"><h2>Inscriptions en attente</h2><a class="link" href="#/admin/membres?status=pending">Tout ${I.right}</a></div>
        ${o.pending.length ? `<ul class="list">${o.pending.map((u) => `<li><div class="row nowrap">${avatar(u, 'sm')}<div><b>${esc(u.pseudo)}</b><small>${esc(api.MODES[u.mode])}${u.specialty ? ` · ${esc(u.specialty)}` : ''} · niv. ${esc(u.level)} · ${ago(u.createdAt)}</small></div></div><div class="row nowrap"><button class="icon-btn ok" data-ap="${u.id}" aria-label="Accepter">${I.check}</button><button class="icon-btn" data-rf="${u.id}" aria-label="Refuser">${I.x}</button></div></li>`).join('')}</ul>` : '<p class="muted">Aucune demande en attente.</p>'}
      </section>` : ''}
      <section class="sec"><div class="sec-head"><h2>Compétitions actives</h2><a class="link" href="#/admin/tournois">Gérer ${I.right}</a></div><div class="stack-sm">${live.map(tCard).join('') || '<p class="muted">Aucune.</p>'}</div></section>
      <section class="sec"><div class="sec-head"><h2>Classement saison</h2><a class="link" href="#/classement">Voir ${I.right}</a></div>
        <ol class="ranks">${top.map((r) => `<li><a href="#/joueur/${r.user.id}"><span class="rk">${r.rank ?? '–'}</span>${avatar(r.user, 'sm')}<span class="rn"><b>${esc(r.user.pseudo)}</b>${gradeTag(r.s.permanent)}</span><span class="rv">${nf(r.value)}<small>pts</small></span></a></li>`).join('')}</ol>
      </section>
      ${log.length ? `<section class="sec"><div class="sec-head"><h2>Dernières opérations</h2><a class="link" href="#/admin/journal">Journal ${I.right}</a></div>${auditList(log)}</section>` : ''}
    </div>`;
  return {
    html: shell('admin', 'Administration', `${esc(api.data().settings.season.name)} · connecté en tant que ${api.me().roles.filter((r) => r !== 'member').map((r) => api.ROLES[r]).join(', ')}`, body),
    mount(root) {
      countUp(root);
      root.querySelector('#digest')?.addEventListener('click', act(async () => {
        if (!(await ask('Envoyer le classement', 'Tous les membres actifs recevront le podium de la semaine en notification.', { label: 'Envoyer' }))) return;
        await api.weeklyDigest({ force: true }); toast('Classement envoyé au clan.'); rerender();
      }));
      root.querySelector('#prop')?.addEventListener('click', act(async () => { await api.acceptProposal(); toast('Distinction attribuée, passe de combat à remettre.'); rerender(); }));
      bindApprove(root, rerender);
    },
  };
}
function bindApprove(root, rerender) {
  root.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = act(async () => { await api.approve(b.dataset.ap); toast('Inscription validée.'); rerender(); })));
  root.querySelectorAll('[data-rf]').forEach((b) => (b.onclick = act(async () => { const r = await ask('Refuser la demande', 'Le joueur sera prévenu avec ce motif.', { reason: true, required: true, danger: true, label: 'Refuser' }); if (!r) return; await api.refuse(b.dataset.rf, r.reason); toast('Demande refusée.'); rerender(); })));
}
function auditList(items) {
  return `<ul class="audit">${items.map((a) => `<li><small>${fmtDT(a.at)} · ${esc(api.user(a.actorId)?.pseudo || 'Système')}</small><b>${esc(a.action)}</b><span>${esc(a.target || '')}${a.details ? ` · ${esc(a.details)}` : ''}</span></li>`).join('')}</ul>`;
}

// ---------- Membres ----------
export function members({ query, rerender }) {
  if (!api.can('members.view')) return deny('admin/membres');
  const db = api.data();
  const S = api.stats();
  const st = query.status || 'all';
  const q = (query.q || '').toLowerCase();
  const list = db.users
    .filter((u) => st === 'all' ? !['refused'].includes(u.status) : u.status === st)
    .filter((u) => !q || u.pseudo.toLowerCase().includes(q) || (u.login || '').includes(q) || (u.uid || '').includes(q) || (u.email || '').includes(q))
    .filter((u) => !query.mode || u.mode === query.mode || (query.mode !== 'MJ+BR' && u.mode === 'MJ+BR'))
    .filter((u) => !query.grade || String(api.grade(S[u.id].permanent).index) === query.grade)
    .sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || S[b.id].permanent - S[a.id].permanent);
  const counts = Object.fromEntries(Object.keys(api.STATUS).map((k) => [k, db.users.filter((u) => u.status === k).length]));
  const qs = (o) => '#/admin/membres?' + new URLSearchParams(Object.entries({ ...query, ...o }).filter(([k, v]) => v && k !== 'open')).toString();
  const body = `
    <form class="searchbar" id="sf"><span>${I.search}</span><input name="q" value="${esc(query.q || '')}" placeholder="Pseudo, identifiant ou UID" type="search" enterkeyhint="search"></form>
    <div class="chips">${[['all', 'Tous'], ...Object.entries(api.STATUS)].map(([k, l]) => `<a class="chip ${st === k ? 'on' : ''}" href="${qs({ status: k })}">${l}${k !== 'all' ? `<small>${counts[k]}</small>` : ''}</a>`).join('')}</div>
    <div class="row filters">
      <label class="field inline"><span>Mode</span><select id="fm"><option value="">Tous</option>${Object.entries(api.MODES).map(([k, l]) => `<option value="${k}" ${query.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field inline"><span>Grade</span><select id="fg"><option value="">Tous</option>${api.grade(0).all.map((g, i) => `<option value="${i}" ${query.grade === String(i) ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
    </div>
    <p class="muted small">${list.length} résultat${list.length > 1 ? 's' : ''}</p>
    <ul class="list members">${list.map((u) => `<li><button class="rowbtn" data-open="${u.id}">${avatar(u, 'md')}<div><b>${esc(u.pseudo)}</b><small>${u.login ? `@${esc(u.login)} · ` : ''}${nf(S[u.id].permanent)} pts</small><span class="row nowrap">${gradeTag(S[u.id].permanent)}${u.roles.filter((r) => r !== 'member').slice(0, 1).map((r) => `<span class="pill">${esc(api.ROLES[r])}</span>`).join('')}</span></div>${statusPill(u.status)}</button></li>`).join('') || `<li>${empty('Aucun membre ne correspond.')}</li>`}</ul>`;
  return {
    html: shell('admin/membres', 'Gestion des membres', 'Valider, filtrer, modifier, suspendre, attribuer des rôles', body),
    mount(root) {
      root.querySelector('#sf').onsubmit = (e) => { e.preventDefault(); location.hash = qs({ q: e.target.q.value }); };
      root.querySelector('#fm').onchange = (e) => (location.hash = qs({ mode: e.target.value }));
      root.querySelector('#fg').onchange = (e) => (location.hash = qs({ grade: e.target.value }));
      root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => memberSheet(b.dataset.open, rerender)));
      if (query.open) memberSheet(query.open, rerender);
    },
  };
}

function memberSheet(id, rerender) {
  const u = api.user(id); if (!u) return;
  const S = api.stats()[u.id];
  const self = u.id === api.me().id;
  const manage = api.can('members.manage') && !self;
  const roles = api.can('members.roles');
  const html = `<div class="stack">
    <div class="row nowrap">${avatar(u, 'lg')}<div><b class="lg">${esc(u.pseudo)}</b><div class="row">${statusPill(u.status)}${gradeTag(S.permanent)}</div></div></div>
    <dl class="kv">
      <div><dt>Identifiant</dt><dd class="mono">${esc(u.login || '–')}</dd></div><div><dt>UID</dt><dd class="mono">${esc(u.uid || '–')}</dd></div><div><dt>E-mail</dt><dd>${esc(u.email || '–')}</dd></div>
      <div><dt>Niveau</dt><dd>${esc(u.level)}</dd></div><div><dt>Mode</dt><dd>${esc(api.MODES[u.mode])}</dd></div>
      <div><dt>Spécialité</dt><dd>${esc(u.specialty || '–')}</dd></div><div><dt>Disponibilités</dt><dd>${esc(u.availability || '–')}</dd></div>
      <div><dt>Points</dt><dd>${nf(S.permanent)} (solde ${nf(S.balance)})</dd></div><div><dt>Inscrit</dt><dd>${fmtDate(u.createdAt)}</dd></div>
      ${u.firstName || u.lastName ? `<div><dt>Nom</dt><dd>${esc(`${u.firstName} ${u.lastName}`)}</dd></div>` : ''}
    </dl>
    <a class="btn btn-line btn-block" href="#/joueur/${u.id}">Voir le profil complet</a>
    ${api.can('members.manage') && ['active', 'suspended', 'inactive'].includes(u.status) ? `<a class="btn btn-line btn-block" href="${self ? '#/presentation' : `#/presentation/${u.id}`}">${I.film} Carte de présentation${u.card?.publishedAt ? '' : ' (à créer)'}</a>` : ''}
    ${manage && u.status !== 'pending' && (!api.isStaff(u) || api.isSuper()) ? `<button class="btn btn-ghost btn-block" id="pwreset">Réinitialiser son mot de passe</button>` : ''}
    ${manage && u.status === 'pending' ? `<div class="row"><button class="btn" data-ap="${u.id}">${I.check} Accepter</button><button class="btn btn-danger-line" data-rf="${u.id}">Refuser</button></div>` : ''}
    ${manage && u.status !== 'pending' ? `<div class="field"><span>Statut</span><div class="seg">${['active', 'suspended', 'inactive', 'excluded'].map((s) => `<label><input type="radio" name="st" value="${s}" ${u.status === s ? 'checked' : ''}><span>${api.STATUS[s]}</span></label>`).join('')}</div></div>` : ''}
    ${roles ? `<div class="field"><span>Rôles administratifs</span><div class="checks">${Object.entries(api.ROLES).filter(([k]) => k !== 'member').map(([k, l]) => `<label class="check"><input type="checkbox" name="role" value="${k}" ${u.roles.includes(k) ? 'checked' : ''} ${['superadmin', 'admin'].includes(k) && !api.isSuper() ? 'disabled' : ''}><span>${l}</span></label>`).join('')}</div><button class="btn btn-sm btn-line" id="saveRoles">Enregistrer les rôles</button></div>` : ''}
    ${manage ? `<details class="acc"><summary><b>Modifier les informations</b>${I.right}</summary><form class="stack" id="ef">
      <label class="field"><span>Pseudo</span><input name="pseudo" value="${esc(u.pseudo)}"></label>
      <label class="field"><span>Identifiant de connexion</span><input name="login" value="${esc(u.login || '')}" autocapitalize="none" spellcheck="false"></label>
      <label class="field"><span>UID</span><input name="uid" value="${esc(u.uid)}" inputmode="numeric"></label>
      <label class="field"><span>Niveau</span><input name="level" type="number" value="${esc(u.level)}"></label>
      <label class="field"><span>Mode</span><select name="mode">${Object.entries(api.MODES).map(([k, l]) => `<option value="${k}" ${u.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Spécialité</span><select name="specialty">${api.SPECIALTIES.map((s) => `<option ${u.specialty === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <button class="btn btn-sm">Enregistrer</button></form></details>
    <details class="acc"><summary><b>Attribuer une distinction</b>${I.right}</summary><form class="stack" id="df">
      <label class="field"><span>Distinction</span><select name="title">${api.DISTINCTIONS.map((d) => `<option>${d}</option>`).join('')}</select></label>
      <label class="field"><span>Période</span><input name="period" value="${esc(new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}"></label>
      <button class="btn btn-sm">Attribuer</button></form></details>` : ''}
  </div>`;
  sheet(`Membre · ${u.pseudo}`, html, (body, close) => {
    const done = (m) => { close(); toast(m); rerender(); };
    body.querySelector('[data-ap]')?.addEventListener('click', act(async () => { await api.approve(u.id); done('Inscription validée.'); }));
    body.querySelector('[data-rf]')?.addEventListener('click', act(async () => { close(); const r = await ask('Refuser la demande', 'Le joueur sera prévenu avec ce motif.', { reason: true, required: true, danger: true, label: 'Refuser' }); if (!r) return; await api.refuse(u.id, r.reason); toast('Demande refusée.'); rerender(); }));
    body.querySelectorAll('[name=st]').forEach((r) => (r.onchange = act(async () => {
      const s = r.value; close();
      const a = await ask(`Passer ${u.pseudo} en « ${api.STATUS[s]} »`, 'Le membre sera notifié. Le changement est inscrit au journal.', { reason: true, required: true, label: 'Confirmer', danger: ['suspended', 'excluded'].includes(s) });
      if (!a) return; await api.setStatus(u.id, s, a.reason); toast('Statut mis à jour.'); rerender();
    })));
    body.querySelector('#pwreset')?.addEventListener('click', act(async () => {
      close();
      if (!(await ask('Réinitialiser le mot de passe', `Un mot de passe provisoire sera créé pour ${u.pseudo} et ses appareils seront déconnectés.`, { label: 'Réinitialiser' }))) return;
      const temp = await api.adminResetPassword(u.id);
      const msg = `${u.pseudo}, voici ton accès à l’espace du clan 影 AaKATSUKI 影 :\n${location.origin}/#/connexion\nIdentifiant : ${u.login}\nMot de passe provisoire : ${temp}\nTu choisiras ton propre mot de passe à la connexion.`;
      sheet('Mot de passe provisoire', `<div class="stack"><p class="muted">Transmets-le à ${esc(u.pseudo)} en message privé. Il ne sera plus affiché. ${esc(u.pseudo)} choisira son propre mot de passe à la connexion.</p>
        <dl class="kv"><div><dt>Identifiant</dt><dd class="mono">${esc(u.login || '–')}</dd></div></dl>
        <p class="temp-pw mono">${esc(temp)}</p>
        <button class="btn btn-line btn-block" id="cpmsg">Copier le message à envoyer</button>
        <button class="btn btn-block" data-close>J’ai transmis le mot de passe</button></div>`, (b) => {
        b.querySelector('#cpmsg').onclick = act(async () => { await navigator.clipboard.writeText(msg); toast('Message copié. Colle-le dans une conversation privée.'); });
      });
    }));
    body.querySelector('#saveRoles')?.addEventListener('click', act(async () => { await api.setRoles(u.id, [...body.querySelectorAll('[name=role]:checked')].map((x) => x.value)); done('Rôles enregistrés.'); }));
    body.querySelector('#ef')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.updateUser(u.id, formObj(e.target)); done('Informations modifiées.'); }));
    body.querySelector('#df')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.awardDistinction({ userId: u.id, ...formObj(e.target) }); done('Distinction attribuée.'); }));
  });
}

// ---------- Points ----------
export function points({ query, rerender }) {
  if (!api.can('points.manage')) return deny('admin/points');
  const db = api.data();
  const rules = db.settings.pointRules;
  const acts = api.recentActivities();
  const members = db.users.filter((u) => ['active', 'suspended', 'inactive'].includes(u.status)).sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  const recent = [...db.transactions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
  const pre = query.activity ? acts.find((a) => a.id === query.activity) : null;
  const body = `
    <div class="split wide-left">
      <form class="panel stack" id="pf">
        <h2 class="h3">Attribuer ou retirer des points</h2>
        <label class="field"><span>Séance liée (facultatif)</span><select name="activityId"><option value="">Aucune séance</option>${acts.map((a) => `<option value="${a.id}" ${pre?.id === a.id ? 'selected' : ''}>${esc(a.title)} · ${fmtDate(a.date)} ${fmtTime(a.date)} · ${a.registrations.length} annoncés</option>`).join('')}</select></label>
        <label class="field"><span>Activité du barème</span><select name="ruleId" required>${rules.map((r) => `<option value="${r.id}" data-pts="${r.points}" ${pre?.ruleId === r.id ? 'selected' : ''}>${esc(r.label)} (${r.points > 0 ? '+' : ''}${r.points})</option>`).join('')}</select></label>
        <div class="row2">
          <label class="field"><span>Points</span><input name="points" type="number" inputmode="numeric" placeholder="barème"><small>Vide = valeur du barème</small></label>
          <label class="field"><span>Mode</span><select name="mode"><option value="">Aucun</option><option>MJ</option><option>BR</option></select></label>
        </div>
        <label class="field"><span>Motif</span><input name="reason" placeholder="Obligatoire si la valeur diffère du barème"></label>
        <div class="field"><span>Membres <b id="selCount">0</b></span>
          <div class="row"><input id="mf" type="search" placeholder="Filtrer" class="grow"><button type="button" class="btn btn-sm btn-line" id="selReg">Inscrits de la séance</button><button type="button" class="btn btn-sm btn-ghost" id="selNone">Vider</button></div>
          <div class="picker">${members.map((u) => `<label class="pick" data-name="${esc(u.pseudo.toLowerCase())}"><input type="checkbox" name="u" value="${u.id}">${avatar(u, 'sm')}<span>${esc(u.pseudo)}</span></label>`).join('')}</div>
        </div>
        <label class="check"><input type="checkbox" name="dup"><span>Correction : autoriser un doublon pour cette activité (motif obligatoire)</span></label>
        <button class="btn btn-lg btn-block" id="submit">Valider l’opération</button>
      </form>
      <section class="sec">
        <div class="sec-head"><h2>Dernières opérations</h2></div>
        <p class="muted small">Rien n’est supprimé. Une correction ajoute une opération inverse avec son motif.</p>
        <ul class="txs">${recent.map((t) => txRow(t, { showUser: true, correct: true })).join('')}</ul>
      </section>
    </div>`;
  return {
    html: shell('admin/points', 'Gestion des points', 'Attribution individuelle ou collective, sans doublon', body),
    mount(root) {
      const f = root.querySelector('#pf');
      const count = () => (root.querySelector('#selCount').textContent = f.querySelectorAll('[name=u]:checked').length);
      f.addEventListener('change', count);
      const syncAct = () => {
        const a = acts.find((x) => x.id === f.activityId.value);
        if (a) { f.ruleId.value = a.ruleId; f.mode.value = a.mode || ''; }
      };
      f.activityId.onchange = syncAct; if (pre) syncAct();
      root.querySelector('#mf').oninput = (e) => { const v = e.target.value.toLowerCase(); root.querySelectorAll('.pick').forEach((p) => (p.hidden = !p.dataset.name.includes(v))); };
      root.querySelector('#selReg').onclick = () => {
        const a = acts.find((x) => x.id === f.activityId.value);
        if (!a) return toast('Choisis d’abord une séance.', 'err');
        f.querySelectorAll('[name=u]').forEach((c) => (c.checked = a.registrations.includes(c.value))); count();
      };
      root.querySelector('#selNone').onclick = () => { f.querySelectorAll('[name=u]').forEach((c) => (c.checked = false)); count(); };
      f.onsubmit = act(async (e) => {
        e.preventDefault();
        const userIds = [...f.querySelectorAll('[name=u]:checked')].map((c) => c.value);
        const rule = rules.find((r) => r.id === f.ruleId.value);
        const pts = f.points.value === '' ? rule.points : Number(f.points.value);
        const ok = await ask('Confirmer l’opération', `${pts > 0 ? '+' : ''}${pts} pts · ${rule.label} pour ${userIds.length} membre${userIds.length > 1 ? 's' : ''}.`, { label: 'Valider' });
        if (!ok) return;
        const r = await api.awardPoints({ userIds, ruleId: rule.id, points: f.points.value, reason: f.reason.value, activityId: f.activityId.value || null, mode: f.mode.value || null, allowDuplicate: f.dup.checked });
        toast(`${r.done.length} crédité${r.done.length > 1 ? 's' : ''}${r.skipped.length ? `. Ignorés (déjà crédités) : ${r.skipped.join(', ')}` : ''}.`, r.done.length ? 'ok' : 'err');
        rerender();
      });
      root.querySelectorAll('[data-correct]').forEach((b) => (b.onclick = act(async () => {
        const r = await ask('Corriger une opération', 'Une opération inverse sera ajoutée. L’originale reste visible dans l’historique.', { reason: true, required: true, label: 'Enregistrer la correction', placeholder: 'Motif de la correction' });
        if (!r) return; await api.correctTx(b.dataset.correct, r.reason); toast('Correction enregistrée.'); rerender();
      })));
    },
  };
}

// ---------- Tournois ----------
export function tournaments({ query, rerender }) {
  if (!api.canManageAnyT()) return deny('admin/tournois');
  const list = api.tournamentsList().filter((t) => api.canManageT(t));
  const body = `<div class="grid-cards">${list.map(tCard).join('') || empty('Aucun tournoi dans ton périmètre.')}</div>`;
  return {
    html: shell('admin/tournois', 'Gestion des tournois', 'Créer, programmer, gérer les inscrits, valider les résultats', body, `<button class="btn btn-sm" id="new">${I.plus} Nouveau tournoi</button>`),
    mount(root) {
      root.querySelector('#new').onclick = () => tournamentForm(null, rerender);
      if (query.new) tournamentForm(null, rerender);
      if (query.edit) tournamentForm(api.tournament(query.edit), rerender);
    },
  };
}
function tournamentForm(t, rerender) {
  const db = api.data();
  const rule = (id) => db.settings.pointRules.find((r) => r.id === id)?.points ?? 0;
  const p = t?.points || { participation: rule('t_part'), first: rule('t_1'), second: rule('t_2'), third: rule('t_3') };
  const managers = db.users.filter((u) => u.status === 'active' && api.canManageAnyT(u));
  const modes = api.can('tournaments.manage') ? ['MJ', 'BR'] : [api.can('tournaments.mj') && 'MJ', api.can('tournaments.br') && 'BR'].filter(Boolean);
  const d = new Date(Date.now() + 7 * 864e5); d.setHours(21, 0, 0, 0);
  const dl = new Date(d.getTime() - 864e5);
  sheet(t ? 'Modifier le tournoi' : 'Nouveau tournoi', `<form class="stack" id="tf">
    <label class="field"><span>Nom du tournoi</span><input name="name" required value="${esc(t?.name || '')}"></label>
    <div class="row2">
      <label class="field"><span>Type</span><select name="type">${Object.entries(api.T_TYPES).map(([k, l]) => `<option value="${k}" ${t?.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Mode</span><select name="mode">${modes.map((m) => `<option ${t?.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Description</span><textarea name="description" rows="2">${esc(t?.description || '')}</textarea></label>
    <div class="row2">
      <label class="field"><span>Date et heure</span><input type="datetime-local" name="date" required value="${toLocalInput(t?.date || d.toISOString())}"></label>
      <label class="field"><span>Limite d’inscription</span><input type="datetime-local" name="deadline" required value="${toLocalInput(t?.deadline || dl.toISOString())}"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Places</span><input type="number" name="max" min="2" max="128" value="${t?.max || 16}" inputmode="numeric"></label>
      <label class="field"><span>Responsable</span><select name="managerId">${managers.map((m) => `<option value="${m.id}" ${(t?.managerId || api.me().id) === m.id ? 'selected' : ''}>${esc(m.pseudo)}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Format</span><input name="format" value="${esc(t?.format || 'Élimination directe')}"></label>
    <label class="field"><span>Règles</span><textarea name="rules" rows="3">${esc(t?.rules || '')}</textarea></label>
    <label class="field"><span>Récompenses</span><input name="rewards" value="${esc(t?.rewards || '')}" placeholder="Ex. 400 CP au vainqueur"></label>
    <div class="field"><span>Points attribués</span><div class="row4">
      <label><small>Participation</small><input type="number" name="p_part" value="${p.participation}"></label>
      <label><small>1re</small><input type="number" name="p_1" value="${p.first}"></label>
      <label><small>2e</small><input type="number" name="p_2" value="${p.second}"></label>
      <label><small>3e</small><input type="number" name="p_3" value="${p.third}"></label></div></div>
    <label class="check"><input type="checkbox" name="allowJoin" ${t?.allowJoin ? 'checked' : ''}><span>Équipes : autoriser à rejoindre une équipe existante</span></label>
    <button class="btn btn-lg btn-block">${t ? 'Enregistrer' : 'Créer en brouillon'}</button>
  </form>`, (body, close) => {
    body.querySelector('#tf').onsubmit = act(async (e) => {
      e.preventDefault();
      const f = formObj(e.target); f.allowJoin = !!f.allowJoin; if (t) f.id = t.id;
      const saved = await api.saveTournament(f); close(); toast(t ? 'Tournoi mis à jour.' : 'Tournoi créé en brouillon.');
      location.hash = `#/tournoi/${saved.id}`;
    });
  });
}

// ---------- Récompenses ----------
export function rewards({ query, rerender }) {
  if (!api.can('rewards.manage')) return deny('admin/recompenses');
  const db = api.data();
  const tab = query.tab || 'requests';
  const reqs = [...db.requests].sort((a, b) => b.at.localeCompare(a.at));
  const open = reqs.filter((q) => ['pending', 'hold'].includes(q.status));
  const toDeliver = reqs.filter((q) => q.status === 'accepted');
  const past = reqs.filter((q) => ['delivered', 'refused'].includes(q.status));
  const reqRow = (q) => {
    const u = api.user(q.userId), r = api.reward(q.rewardId), bal = api.stats()[q.userId].balance;
    return `<li class="req"><div class="row nowrap">${avatar(u, 'sm')}<div><b>${esc(u?.pseudo)} · ${esc(r?.name)}</b><small>${ago(q.at)} · ${q.auto ? 'attribution automatique validée' : `${nf(q.cost)} pts · solde ${nf(bal)} · stock ${r?.stock}`}${q.reason ? ` · ${esc(q.reason)}` : ''}</small></div></div>
      <div class="row nowrap">${rStatusPill(q.status)}
      ${['pending', 'hold'].includes(q.status) ? `<button class="btn btn-sm" data-q="${q.id}" data-a="accept">Accepter</button>${q.status === 'pending' ? `<button class="btn btn-sm btn-line" data-q="${q.id}" data-a="hold">Attente</button>` : ''}<button class="btn btn-sm btn-danger-line" data-q="${q.id}" data-a="refuse">Refuser</button>` : ''}
      ${q.status === 'accepted' ? `<button class="btn btn-sm" data-q="${q.id}" data-a="deliver">Confirmer la remise</button>` : ''}</div></li>`;
  };
  let body = `<div class="chips">${[['requests', `Demandes`, open.length], ['deliver', 'À remettre', toDeliver.length], ['catalog', 'Catalogue', db.rewards.length], ['history', 'Historique', past.length]].map(([k, l, n]) => `<a class="chip ${tab === k ? 'on' : ''}" href="#/admin/recompenses?tab=${k}">${l}<small>${n}</small></a>`).join('')}</div>`;
  if (tab === 'requests') body += open.length ? `<ul class="list">${open.map(reqRow).join('')}</ul>` : empty('Aucune demande en attente.');
  if (tab === 'deliver') body += toDeliver.length ? `<p class="muted small">Un cadeau n’est jamais considéré comme remis sans ta confirmation.</p><ul class="list">${toDeliver.map(reqRow).join('')}</ul>` : empty('Rien à remettre.');
  if (tab === 'history') body += past.length ? `<ul class="list">${past.map(reqRow).join('')}</ul>` : empty('Aucun historique.');
  if (tab === 'catalog') body += `<ul class="list cat">${db.rewards.map((r) => `<li>${rewardVisual(r)}<div><b>${esc(r.name)}</b><small>${esc(api.R_CATS[r.category])} · ${nf(r.cost)} pts · stock ${r.stock} · ${api.REWARD_STATE[api.rewardState(r)]}</small></div><div class="row nowrap"><button class="icon-btn" data-edit="${r.id}" aria-label="Modifier">${I.edit}</button><button class="btn btn-sm btn-line" data-tog="${r.id}">${r.active ? 'Désactiver' : 'Activer'}</button></div></li>`).join('')}</ul>`;
  return {
    html: shell('admin/recompenses', 'Gestion des récompenses', `Points débités à l’acceptation · ${open.length} en attente`, body, `<button class="btn btn-sm" id="new">${I.plus} Récompense</button>`),
    mount(root) {
      root.querySelector('#new').onclick = () => rewardForm(null, rerender);
      root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => rewardForm(api.reward(b.dataset.edit), rerender)));
      root.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = act(async () => { await api.toggleReward(b.dataset.tog); rerender(); })));
      root.querySelectorAll('[data-q]').forEach((b) => (b.onclick = act(async () => {
        const a = b.dataset.a;
        let reason = '';
        if (a === 'refuse' || a === 'hold') { const r = await ask(a === 'refuse' ? 'Refuser la demande' : 'Mettre en attente', 'Le membre verra ce message.', { reason: true, required: a === 'refuse', danger: a === 'refuse', label: a === 'refuse' ? 'Refuser' : 'Mettre en attente' }); if (!r) return; reason = r.reason; }
        if (a === 'accept' && !(await ask('Accepter la demande', 'Les points sont débités maintenant et le stock diminue de 1.', { label: 'Accepter' }))) return;
        if (a === 'deliver' && !(await ask('Confirmer la remise', 'Confirme que la récompense a bien été remise au membre.', { reason: true, label: 'Remise effectuée', placeholder: 'Note de remise' }).then((r) => { reason = r?.reason || ''; return r; }))) return;
        await api.processRequest(b.dataset.q, a, reason); toast('Demande mise à jour.'); rerender();
      })));
    },
  };
}
function rewardForm(r, rerender) {
  let img = r?.img || null;
  sheet(r ? 'Modifier la récompense' : 'Nouvelle récompense', `<form class="stack" id="rf">
    <label class="field"><span>Nom</span><input name="name" required value="${esc(r?.name || '')}"></label>
    <label class="field"><span>Description</span><textarea name="description" rows="2">${esc(r?.description || '')}</textarea></label>
    <div class="row2">
      <label class="field"><span>Catégorie</span><select name="category">${Object.entries(api.R_CATS).map(([k, l]) => `<option value="${k}" ${r?.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Coût (pts)</span><input type="number" name="cost" min="1" required value="${r?.cost || 100}" inputmode="numeric"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Stock</span><input type="number" name="stock" min="0" value="${r?.stock ?? 1}" inputmode="numeric"></label>
      <label class="field"><span>Statut</span><select name="active"><option value="on">Activée</option><option value="off" ${r && !r.active ? 'selected' : ''}>Désactivée</option></select></label>
    </div>
    <div class="row2">
      <label class="field"><span>Disponible du</span><input type="date" name="from" value="${esc(r?.from || '')}"></label>
      <label class="field"><span>au</span><input type="date" name="to" value="${esc(r?.to || '')}"></label>
    </div>
    <div class="field"><span>Image</span><label class="upload"><input type="file" accept="image/*" name="file"><span class="upload-prev">${img ? `<img src="${esc(img)}" alt="">` : ''}</span><span>Choisir une image</span></label></div>
    <button class="btn btn-lg btn-block">Enregistrer</button></form>`, (body, close) => {
    body.querySelector('[name=file]').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; img = await resizeImage(f, 320); body.querySelector('.upload-prev').innerHTML = `<img src="${img}" alt="">`; };
    body.querySelector('#rf').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); delete f.file; await api.saveReward({ ...f, id: r?.id, img }); close(); toast('Récompense enregistrée.'); rerender(); });
  });
}

// ---------- Annonces ----------
export function announcements({ rerender }) {
  if (!api.can('announcements.manage')) return deny('admin/annonces');
  const list = api.data().announcements.filter((a) => !a.archived).sort((a, b) => b.at.localeCompare(a.at));
  const AUD = { all: 'Tous les membres', MJ: 'Joueurs MJ', BR: 'Joueurs BR', staff: 'Encadrement' };
  const body = `<div class="split wide-left">
    <form class="panel stack" id="af">
      <h2 class="h3">Nouvelle annonce</h2>
      <label class="field"><span>Titre</span><input name="title" required maxlength="90"></label>
      <label class="field"><span>Texte</span><textarea name="body" rows="4" required></textarea></label>
      <label class="field"><span>Visible par</span><select name="audience">${Object.entries(AUD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="pinned"><span>Épingler en haut du tableau de bord</span></label>
      <button class="btn btn-block">Publier et notifier</button>
    </form>
    <section class="sec"><div class="sec-head"><h2>Publiées</h2></div>
      <ul class="ann">${list.map((a) => `<li class="${a.pinned ? 'pinned' : ''}"><div class="ann-meta"><span class="pill">${AUD[a.audience]}</span><span>${ago(a.at)} · ${esc(api.user(a.authorId)?.pseudo)}</span><button class="icon-btn" data-arch="${a.id}" aria-label="Archiver">${I.x}</button></div><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></li>`).join('')}</ul>
    </section></div>`;
  return {
    html: shell('admin/annonces', 'Annonces officielles', 'Entraînements, inscriptions, résultats, règlement', body),
    mount(root) {
      root.querySelector('#af').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); await api.createAnnouncement({ ...f, pinned: !!f.pinned }); toast('Annonce publiée.'); rerender(); });
      root.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = act(async () => { if (!(await ask('Archiver l’annonce', 'Elle ne sera plus visible par les membres.', { label: 'Archiver' }))) return; await api.archiveAnnouncement(b.dataset.arch); rerender(); })));
    },
  };
}

// ---------- Discipline ----------
export function discipline({ rerender }) {
  if (!api.can('discipline.manage')) return deny('admin/discipline');
  const db = api.data();
  const list = [...db.discipline].sort((a, b) => b.at.localeCompare(a.at));
  const users = db.users.filter((u) => ['active', 'suspended', 'inactive'].includes(u.status) && u.id !== api.me().id).sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  const body = `<div class="split wide-left">
    <form class="panel stack" id="df">
      <h2 class="h3">Enregistrer une décision</h2>
      <label class="field"><span>Membre</span><select name="userId">${users.map((u) => `<option value="${u.id}">${esc(u.pseudo)} · ${api.STATUS[u.status]}</option>`).join('')}</select></label>
      <div class="field"><span>Type</span><div class="seg">${['avertissement', 'sanction', 'suspension', 'exclusion'].map((k, i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span>${k[0].toUpperCase() + k.slice(1)}</span></label>`).join('')}</div></div>
      <label class="field"><span>Retrait de points (facultatif)</span><input type="number" name="points" max="0" placeholder="Ex. -20" inputmode="numeric"></label>
      <label class="field"><span>Motif</span><textarea name="reason" rows="3" required></textarea></label>
      <button class="btn btn-block btn-danger">Enregistrer la décision</button>
    </form>
    <section class="sec"><div class="sec-head"><h2>Historique disciplinaire</h2></div>
      ${list.length ? `<ul class="list">${list.map((x) => `<li><div class="row nowrap">${avatar(api.user(x.userId), 'sm')}<div><b>${esc(api.user(x.userId)?.pseudo)} · ${esc(x.kind)}</b><span>${esc(x.reason)}</span><small>${fmtDT(x.at)} · par ${esc(api.user(x.adminId)?.pseudo)}${x.points ? ` · ${x.points} pts` : ''}</small></div></div></li>`).join('')}</ul>` : empty('Aucune décision enregistrée.')}
    </section></div>`;
  return {
    html: shell('admin/discipline', 'Règlement et discipline', 'Chaque décision est motivée, datée et conservée', body),
    mount(root) {
      root.querySelector('#df').onsubmit = act(async (e) => {
        e.preventDefault(); const f = formObj(e.target);
        if (!(await ask('Confirmer la décision', `${f.kind} pour ${api.user(f.userId).pseudo}. Le membre sera notifié.`, { danger: true, label: 'Enregistrer' }))) return;
        await api.addSanction(f); toast('Décision enregistrée.'); rerender();
      });
    },
  };
}

// ---------- Journal ----------
export function journal({ query }) {
  if (!api.can('audit.view')) return deny('admin/journal');
  const q = (query.q || '').toLowerCase();
  const all = api.auditLog();
  const list = all.filter((a) => !q || `${a.action} ${a.target} ${a.details} ${api.user(a.actorId)?.pseudo}`.toLowerCase().includes(q)).slice(0, 200);
  const body = `<form class="searchbar" id="sf"><span>${I.search}</span><input name="q" type="search" value="${esc(query.q || '')}" placeholder="Rechercher une action, un membre, un tournoi"></form>
    <p class="muted small">${all.length} opérations enregistrées. Le journal est en lecture seule.</p>
    ${list.length ? auditList(list) : empty('Aucune opération trouvée.')}`;
  return {
    html: shell('admin/journal', 'Journal d’activité', 'Points, résultats, statuts, permissions et sanctions', body),
    mount(root) { root.querySelector('#sf').onsubmit = (e) => { e.preventDefault(); location.hash = `#/admin/journal?q=${encodeURIComponent(e.target.q.value)}`; }; },
  };
}

// ---------- Réglages ----------
export function settings({ query, rerender }) {
  if (!api.can('rules.manage') && !api.isSuper()) return deny('admin/reglages');
  const db = api.data(); const s = db.settings;
  const tab = query.tab || 'bareme';
  const tabs = [['bareme', 'Barème'], ['grades', 'Grades'], ['semaine', 'Semaine type'], ['reglement', 'Règlement'], ['seances', 'Séances']];
  if (api.isSuper()) tabs.push(['roles', 'Permissions'], ['saison', 'Saison']);
  let body = `<div class="chips">${tabs.map(([k, l]) => `<a class="chip ${k === tab ? 'on' : ''}" href="#/admin/reglages?tab=${k}">${l}</a>`).join('')}</div>`;
  if (tab === 'bareme') body += `<form class="panel stack" id="bf"><p class="muted small">Les changements s’appliquent aux prochaines attributions. L’historique reste intact.</p>
    <div id="rules">${s.pointRules.map((r) => ruleRow(r)).join('')}</div>
    <div class="row"><button type="button" class="btn btn-line btn-sm" id="addRule">${I.plus} Nouvelle activité</button><button class="btn">Enregistrer le barème</button></div></form>`;
  if (tab === 'grades') body += `<form class="panel stack" id="gf"><p class="muted small">Le grade dépend des points permanents. Il est distinct des rôles administratifs.</p>
    ${s.grades.map((g, i) => `<div class="row2 g-row"><label class="field"><span>Grade ${i + 1}</span><input name="name" value="${esc(g.name)}"></label><label class="field"><span>À partir de (pts)</span><input name="min" type="number" min="0" value="${g.min}" ${i === 0 ? 'readonly' : ''}></label></div>`).join('')}
    <button class="btn">Enregistrer les grades</button></form>`;
  if (tab === 'semaine') body += `<form class="panel stack" id="wf"><div id="wk">${s.weekly.map((w) => weekRow(w, s.pointRules)).join('')}</div>
    <div class="row"><button type="button" class="btn btn-line btn-sm" id="addW">${I.plus} Créneau</button><button class="btn">Enregistrer le programme</button></div>
    <p class="muted small">Les créneaux liés à une activité du barème créent automatiquement les séances des deux prochaines semaines.</p></form>`;
  if (tab === 'reglement') body += `<form class="panel stack" id="rbf"><label class="field"><span>Un article par ligne</span><textarea name="lines" rows="10">${esc(s.rulebook.join('\n'))}</textarea></label><button class="btn">Publier le règlement</button></form>`;
  if (tab === 'seances') body += `<form class="panel stack" id="sf"><h2 class="h3">Programmer une séance ponctuelle</h2>
    <label class="field"><span>Titre</span><input name="title" required placeholder="Ex. Entraînement spécial Hardpoint"></label>
    <div class="row2"><label class="field"><span>Activité</span><select name="ruleId">${s.pointRules.filter((r) => r.points > 0).map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label>
    <label class="field"><span>Mode</span><select name="mode"><option value="">Aucun</option><option>MJ</option><option>BR</option></select></label></div>
    <label class="field"><span>Date et heure</span><input type="datetime-local" name="date" required></label>
    <button class="btn">Programmer et notifier</button></form>
    <section class="sec"><div class="sec-head"><h2>À venir</h2></div><ul class="sessions">${api.upcomingActivities(14).map((a) => `<li><div class="s-when"><b>${new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</b><span>${fmtTime(a.date)}</span></div><div class="s-main"><b>${esc(a.title)}</b><small>${a.registrations.length} annoncés${a.auto ? ' · automatique' : ''}</small></div><a class="btn btn-sm btn-line" href="#/admin/points?activity=${a.id}">Points</a></li>`).join('')}</ul></section>`;
  if (tab === 'roles') body += `<form class="panel stack" id="rpf"><p class="muted small">Le super administrateur a tous les droits. Coche les permissions de chaque rôle.</p>
    <div class="matrix"><table><thead><tr><th>Permission</th>${Object.keys(s.rolePerms).filter((r) => r !== 'member').map((r) => `<th>${esc(api.ROLES[r])}</th>`).join('')}</tr></thead>
    <tbody>${Object.entries(api.PERMS).map(([p, l]) => `<tr><td>${esc(l)}</td>${Object.keys(s.rolePerms).filter((r) => r !== 'member').map((r) => `<td><input type="checkbox" aria-label="${esc(api.ROLES[r])} : ${esc(l)}" name="${r}" value="${p}" ${s.rolePerms[r].includes(p) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <button class="btn">Enregistrer les permissions</button></form>`;
  if (tab === 'saison') body += `<form class="panel stack" id="ssf"><h2 class="h3">${esc(s.season.name)}</h2><p class="muted">Commencée le ${new Date(s.season.start).toLocaleDateString('fr-FR')}. À la clôture, le classement est archivé et un nouveau classement saisonnier démarre. Les points permanents et les grades sont toujours conservés.</p>
    <label class="field"><span>Nom de la nouvelle saison</span><input name="name" required value="Saison ${Number(s.season.name.replace(/\D/g, '') || 0) + 1}"></label>
    <div class="field"><span>Solde de points dépensables</span><div class="seg"><label><input type="radio" name="bal" value="keep" checked><span>Conserver</span></label><label><input type="radio" name="bal" value="reset"><span>Remettre à zéro</span></label></div></div>
    <button class="btn btn-danger">Clôturer la saison</button></form>
    <section class="sec"><div class="sec-head"><h2>Archives</h2></div><ul class="list">${db.seasons.map((x) => `<li><div><b>${esc(x.name)}</b><small>${new Date(x.start).toLocaleDateString('fr-FR')} au ${new Date(x.end).toLocaleDateString('fr-FR')} · vainqueur ${esc(api.user(x.standings[0]?.userId)?.pseudo || '–')}</small></div></li>`).join('')}</ul></section>`;
  return {
    html: shell('admin/reglages', 'Réglages', 'Barème, grades, calendrier, permissions et saisons', body),
    mount(root) {
      const $ = (x) => root.querySelector(x);
      $('#addRule')?.addEventListener('click', () => $('#rules').insertAdjacentHTML('beforeend', ruleRow({ id: '', label: '', points: 10, participation: false })));
      $('#bf')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.saveRules([...root.querySelectorAll('.rule-row')].map((r) => ({ id: r.dataset.id, label: r.querySelector('[name=label]').value, points: r.querySelector('[name=points]').value, participation: r.querySelector('[name=part]').checked }))); toast('Barème enregistré.'); rerender(); }));
      $('#gf')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.saveGrades([...root.querySelectorAll('.g-row')].map((r) => ({ name: r.querySelector('[name=name]').value, min: r.querySelector('[name=min]').value }))); toast('Grades enregistrés.'); rerender(); }));
      $('#addW')?.addEventListener('click', () => $('#wk').insertAdjacentHTML('beforeend', weekRow({ id: '', day: 0, label: '', time: '20:00', ruleId: null, mode: null }, s.pointRules)));
      $('#wk')?.addEventListener('click', (e) => { const b = e.target.closest('[data-delw]'); if (b) b.closest('.w-row').remove(); });
      $('#wf')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.saveWeekly([...root.querySelectorAll('.w-row')].map((r) => ({ id: r.dataset.id, day: r.querySelector('[name=day]').value, label: r.querySelector('[name=label]').value, time: r.querySelector('[name=time]').value, ruleId: r.querySelector('[name=ruleId]').value, mode: r.querySelector('[name=mode]').value })).filter((w) => w.label.trim())); toast('Programme enregistré.'); rerender(); }));
      $('#rbf')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.saveRulebook(e.target.lines.value.split('\n')); toast('Règlement publié.'); rerender(); }));
      $('#sf')?.addEventListener('submit', act(async (e) => { e.preventDefault(); await api.createActivity(formObj(e.target)); toast('Séance programmée.'); rerender(); }));
      $('#rpf')?.addEventListener('submit', act(async (e) => {
        e.preventDefault(); const map = { member: [] };
        for (const r of Object.keys(s.rolePerms).filter((x) => x !== 'member')) map[r] = [...root.querySelectorAll(`input[name="${r}"]:checked`)].map((c) => c.value);
        await api.saveRolePerms(map); toast('Permissions enregistrées.'); rerender();
      }));
      $('#ssf')?.addEventListener('submit', act(async (e) => {
        e.preventDefault(); const f = formObj(e.target);
        if (!(await ask('Clôturer la saison', `Le classement de ${s.season.name} sera archivé et ${f.name} commencera maintenant.`, { danger: true, label: 'Clôturer' }))) return;
        await api.closeSeason({ name: f.name, resetBalance: f.bal === 'reset' }); toast('Nouvelle saison lancée.'); rerender();
      }));
    },
  };
}
const ruleRow = (r) => `<div class="rule-row" data-id="${esc(r.id)}"><input name="label" value="${esc(r.label)}" placeholder="Nom de l’activité" aria-label="Nom"><input name="points" type="number" value="${r.points}" aria-label="Points" inputmode="numeric"><label class="check sm"><input type="checkbox" name="part" ${r.participation ? 'checked' : ''}><span>Présence</span></label></div>`;
const weekRow = (w, rules) => `<div class="w-row" data-id="${esc(w.id)}">
  <select name="day" aria-label="Jour">${api.DAYS.map((d, i) => `<option value="${i}" ${w.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
  <input name="time" type="time" value="${esc(w.time)}" aria-label="Heure">
  <input name="label" value="${esc(w.label)}" placeholder="Activité" aria-label="Activité" class="grow">
  <select name="ruleId" aria-label="Barème"><option value="">Sans points</option>${rules.filter((r) => r.points > 0).map((r) => `<option value="${r.id}" ${w.ruleId === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
  <select name="mode" aria-label="Mode"><option value="">Mode</option><option ${w.mode === 'MJ' ? 'selected' : ''}>MJ</option><option ${w.mode === 'BR' ? 'selected' : ''}>BR</option></select>
  <button type="button" class="icon-btn" data-delw aria-label="Supprimer">${I.x}</button></div>`;
