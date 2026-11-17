import * as api from '../api.js';
import { I, cloud, logo } from '../icons.js';
import { esc, nf, signed, fmtDT, fmtDate, fmtDay, fmtTime, ago, avatar, toast, act, sheet, ask, formObj, head, empty, gradeTag, gradeProgress, statusPill, tStatusPill, rStatusPill, tCard, rewardTile, txRow, countUp, tilt, podium, toLocalInput } from '../ui.js';
import { resizeImage } from './public.js';
import { installCard, bindInstall, installMenuItem, mountPushPanel, syncPush } from '../pwa.js';
import { recentStrip } from './welcome.js';

// ---------- Première connexion : choisir son mot de passe ----------
export function firstPassword() {
  const u = api.me();
  if (!u.mustChangePassword) { location.hash = '#/base'; return { html: '' }; }
  return {
    html: `<div class="wrap page narrow center-page">
      ${avatar(u, 'lg')}
      <h1>Bienvenue, <span class="nocase">${esc(u.pseudo)}</span></h1>
      <p class="muted">Ton compte du clan est prêt. Choisis ton propre mot de passe : le provisoire ne servira plus.</p>
      <form id="fp" class="stack left">
        <input type="text" name="username" value="${esc(u.login || '')}" autocomplete="username" hidden>
        <label class="field"><span>Mot de passe provisoire</span><input type="password" name="current" required autocomplete="current-password"></label>
        <label class="field"><span>Nouveau mot de passe</span><input type="password" name="next" required minlength="8" autocomplete="new-password"><small>8 caractères minimum, avec des lettres et au moins un chiffre.</small></label>
        <label class="field"><span>Confirmer</span><input type="password" name="again" required minlength="8" autocomplete="new-password"></label>
        <button class="btn btn-lg btn-block">Entrer dans le clan</button>
      </form>
      <button class="btn btn-ghost btn-sm" id="lo">Ce n’est pas mon compte</button>
    </div>`,
    mount(root) {
      root.querySelector('#fp').onsubmit = act(async (e) => {
        e.preventDefault();
        const f = formObj(e.target);
        if (f.next !== f.again) throw new Error('Les deux mots de passe ne sont pas identiques.');
        if (f.next === f.current) throw new Error('Choisis un mot de passe différent du provisoire.');
        await api.changePassword(f.current, f.next);
        syncPush();
        // Étape suivante : se présenter au clan (photo, personnage, profil, arme)
        location.hash = '#/presentation?bienvenue=1';
      });
      root.querySelector('#lo').onclick = act(async () => { await api.logout(); location.hash = '#/connexion'; });
    },
  };
}

// ---------- Annonces ----------
const AUDIENCE = { all: 'Tout le clan', MJ: 'Multijoueur', BR: 'Battle Royale', staff: 'Encadrement' };
export function announcements({ query, rerender }) {
  const me = api.me();
  const all = api.announcementsFor();
  const f = query.f || 'all';
  const list = f === 'pinned' ? all.filter((a) => a.pinned) : f === 'new' ? all.filter(api.isAnnNew) : all;
  const nNew = all.filter(api.isAnnNew).length;
  const chips = [['all', 'Toutes', all.length], ['pinned', 'Épinglées', all.filter((a) => a.pinned).length], ...(me ? [['new', 'Nouvelles', nNew]] : [])];
  const card = (a) => {
    const by = api.user(a.authorId);
    return `<li class="${a.pinned ? 'pinned' : ''} ${api.isAnnNew(a) ? 'is-new' : ''} ${query.id === a.id ? 'is-target' : ''}" id="ann-${esc(a.id)}">
      <div class="ann-meta">${api.isAnnNew(a) ? '<span class="ann-new">Nouveau</span>' : ''}${a.pinned ? '<span class="pill">Épinglée</span>' : ''}${a.audience !== 'all' ? `<span class="pill">${esc(AUDIENCE[a.audience] || a.audience)}</span>` : ''}</div>
      <h3>${esc(a.title)}</h3>
      <p class="ann-body">${esc(a.body)}</p>
      <div class="ann-foot">${by ? avatar(by, 'sm') : ''}<span><b>${esc(by?.pseudo || 'Encadrement')}</b><small>${fmtDT(a.at)} · ${ago(a.at)}</small></span></div>
    </li>`;
  };
  const html = `<div class="wrap page narrow">
    ${head('Annonces', 'Les informations officielles du clan, les plus importantes en premier.', api.can('announcements.manage') ? `<a class="btn btn-sm" href="#/admin/annonces">${I.plus} Publier</a>` : '')}
    <div class="chips">${chips.map(([k, l, n]) => `<a class="chip ${f === k ? 'on' : ''}" href="#/annonces${k === 'all' ? '' : `?f=${k}`}">${l} <small>${n}</small></a>`).join('')}</div>
    ${list.length ? `<ul class="ann ann-full">${list.map(card).join('')}</ul>` : empty(f === 'new' ? 'Tu as tout lu.' : 'Aucune annonce pour le moment.')}
    ${!me ? `<p class="muted center small">Les membres voient aussi les annonces réservées au clan. <a class="link" href="#/connexion">Se connecter</a></p>` : ''}
  </div>`;
  return {
    html,
    mount(root) {
      if (query.id) root.querySelector(`#ann-${CSS.escape(query.id)}`)?.scrollIntoView({ block: 'center' });
      // Vu : le badge disparaît, le repère « Nouveau » reste affiché jusqu'au prochain passage
      if (me && nNew) { api.markAnnSeen(); document.dispatchEvent(new Event('akt:chrome')); }
    },
  };
}

// ---------- Compte en attente ----------
export function pending() {
  const u = api.me();
  const refused = u.status === 'refused' || u.status === 'excluded';
  return {
    html: `<div class="wrap page narrow center-page">
      ${cloud('wait-cloud', 5)}
      <h1>${refused ? 'Accès fermé' : 'Demande en cours d’examen'}</h1>
      <p class="muted">${refused ? 'Ton compte n’a pas accès à l’espace membre. Contacte un responsable du clan pour en savoir plus.' : `Merci ${esc(u.pseudo)}. Un responsable du recrutement va vérifier ton profil CODM. Tu recevras une notification dès que ton compte sera validé.`}</p>
      <dl class="kv"><div><dt>Statut</dt><dd>${statusPill(u.status)}</dd></div><div><dt>UID</dt><dd>${esc(u.uid || 'À compléter')}</dd></div><div><dt>Mode</dt><dd>${esc(api.MODES[u.mode])}</dd></div><div><dt>Spécialité</dt><dd>${esc(u.specialty || 'À compléter')}</dd></div></dl>
      <div class="row center"><a class="btn btn-line" href="#/reglement">Lire le règlement</a><button class="btn btn-line" id="lo">Se déconnecter</button></div>
    </div>`,
    mount(root) { root.querySelector('#lo').onclick = act(async () => { await api.logout(); location.hash = '#/'; }); },
  };
}

function idCard(u, S, rank) {
  const g = api.grade(S.permanent);
  return `<div class="idcard" data-tilt id="idcard" role="button" tabindex="0" aria-label="Retourner la carte de membre">
    <div class="idcard-in">
      <div class="face front">
        ${logo('id-logo')}
        <div class="id-top"><span class="nocase">影 AaKATSUKI 影</span><span>${esc(api.data().settings.season.name)}</span></div>
        <div class="id-who">${avatar(u, 'lg')}<div><b>${esc(u.pseudo)}</b>${gradeTag(S.permanent)}</div></div>
        <div class="id-nums">
          <div><span>Points</span><b data-count="${S.permanent}">${nf(S.permanent)}</b></div>
          <div><span>Rang saison</span><b>${rank ? `#${rank}` : '–'}</b></div>
          <div><span>Grade</span><b>${g.index + 1}/${g.all.length}</b></div>
        </div>
      </div>
      <div class="face back">
        <div class="id-top"><span>Carte de membre</span><span>Touche pour retourner</span></div>
        <dl>
          <div><dt>UID</dt><dd class="mono">${esc(u.uid)}</dd></div>
          <div><dt>Niveau</dt><dd>${esc(u.level)}</dd></div>
          <div><dt>Mode</dt><dd>${esc(api.MODES[u.mode])}</dd></div>
          <div><dt>Spécialité</dt><dd>${esc(u.specialty || 'À compléter')}</dd></div>
          <div><dt>Membre depuis</dt><dd>${u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('fr-FR') : '–'}</dd></div>
          <div><dt>Rôle</dt><dd>${u.roles.filter((r) => r !== 'member').map((r) => esc(api.ROLES[r])).join(', ') || 'Membre'}</dd></div>
        </dl>
      </div>
    </div>
  </div>`;
}
function flipCard(root) {
  const c = root.querySelector('#idcard'); if (!c) return;
  const f = () => c.classList.toggle('flipped');
  c.onclick = f; c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } };
}

// ---------- Tableau de bord ----------
export function dashboard({ rerender }) {
  const u = api.me();
  const db = api.data();
  const S = api.stats()[u.id];
  const rank = api.rankOf(u.id, 'season');
  const rankAll = api.rankOf(u.id, 'general');
  const sessions = api.upcomingActivities(4);
  const ts = api.tournamentsList().filter((t) => ['open', 'live', 'closed'].includes(t.status)).slice(0, 3);
  const last = api.history(u.id).slice(0, 5);
  const afford = api.rewardsList().filter((r) => api.rewardState(r) === 'on' && r.cost <= api.spendable(u.id));
  const reqs = api.myRequests(u.id).filter((q) => q.status !== 'refused').slice(0, 3);
  const ann = api.visibleAnnouncements(u).slice(0, 3);
  const nextReward = api.rewardsList().find((r) => api.rewardState(r) === 'on' && r.cost > api.spendable(u.id));
  const html = `<div class="wrap page">
    <div class="dash-top">
      <div class="hello"><p class="muted">${fmtDay(new Date())}</p><h1>Salut, ${esc(u.pseudo)}</h1>
        ${u.status === 'suspended' ? `<p class="alert">Ton compte est suspendu. Tu peux consulter la plateforme, mais pas t’inscrire aux activités.</p>` : ''}
        ${u.status === 'inactive' ? `<p class="alert">Ton compte est marqué inactif. Reviens à un entraînement pour le réactiver auprès d’un responsable.</p>` : ''}
      </div>
      ${idCard(u, S, rank)}
    </div>

    ${installCard()}
    ${!u.card?.publishedAt ? `<a class="panel card-cta" href="#/presentation">${I.film}<div><b>Crée ta carte de présentation</b><small>Ta photo, ton personnage, ton profil et ton arme, joués en animation 3D pour tout le clan.</small></div>${I.right}</a>` : ''}
    <div data-push-card></div>
    <div class="kpis">
      <div class="kpi"><span>Solde</span><b data-count="${api.spendable(u.id)}">0</b><small>pts dépensables</small></div>
      <div class="kpi"><span>Saison</span><b data-count="${S.season}">0</b><small>${rank ? `rang ${rank}` : 'non classé'}</small></div>
      <div class="kpi"><span>Ce mois</span><b data-count="${S.month}">0</b><small>pts gagnés</small></div>
      <div class="kpi"><span>Général</span><b>${rankAll ? `#${rankAll}` : '–'}</b><small>${S.reg30} présences / 30 j</small></div>
    </div>

    <section class="panel">${gradeProgress(S.permanent)}
      ${nextReward ? `<p class="small muted">Prochaine récompense : <b>${esc(nextReward.name)}</b>, encore ${nf(nextReward.cost - api.spendable(u.id))} pts.</p>` : ''}
    </section>

    <div class="dash-grid">
      <section class="sec">
        <div class="sec-head"><h2>Pour progresser cette semaine</h2><a class="link" href="#/calendrier">Calendrier ${I.right}</a></div>
        <ul class="sessions">${sessions.map((a) => {
          const rule = db.settings.pointRules.find((r) => r.id === a.ruleId);
          const inn = a.registrations.includes(u.id);
          return `<li><div class="s-when"><b>${new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'short' })}</b><span>${fmtTime(a.date)}</span></div>
          <div class="s-main"><b>${esc(a.title)}</b><small>${rule ? `+${rule.points} pts` : ''} · ${a.registrations.length} annoncés</small></div>
          ${u.status === 'active' ? `<button class="btn btn-sm ${inn ? 'btn-line' : ''}" data-act="${a.id}">${inn ? 'Inscrit' : 'Je viens'}</button>` : ''}</li>`;
        }).join('') || '<li class="muted">Aucune séance programmée.</li>'}</ul>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Prochains tournois</h2><a class="link" href="#/tournois">Tous ${I.right}</a></div>
        <div class="stack-sm">${ts.map(tCard).join('') || empty('Aucun tournoi à venir.')}</div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Annonces du clan</h2><a class="link" href="#/annonces">Toutes${api.annUnread() ? ` · ${api.annUnread()} nouvelle${api.annUnread() > 1 ? 's' : ''}` : ''} ${I.right}</a></div>
        ${ann.length ? `<ul class="ann">${ann.map((a) => `<li class="${a.pinned ? 'pinned' : ''} ${api.isAnnNew(a) ? 'is-new' : ''}"><a class="ann-link" href="#/annonces?id=${esc(a.id)}"><div class="ann-meta">${api.isAnnNew(a) ? '<span class="ann-new">Nouveau</span>' : ''}${a.pinned ? '<span class="pill">Épinglée</span>' : ''}<span>${ago(a.at)} · ${esc(api.user(a.authorId)?.pseudo)}</span></div><h3>${esc(a.title)}</h3><p class="clamp">${esc(a.body)}</p></a></li>`).join('')}</ul>` : empty('Aucune annonce.')}
      </section>

      ${recentStrip()}
      <section class="sec">
        <div class="sec-head"><h2>Dernières activités</h2><a class="link" href="#/profil?tab=historique">Historique ${I.right}</a></div>
        ${last.length ? `<ul class="txs">${last.map((t) => txRow(t)).join('')}</ul>` : empty('Pas encore de points. Viens au prochain entraînement.')}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Récompenses accessibles</h2><a class="link" href="#/recompenses">Catalogue ${I.right}</a></div>
        ${afford.length ? `<div class="hscroll">${afford.map((r) => rewardTile(r)).join('')}</div>` : `<p class="muted">Aucune récompense accessible avec ton solde actuel.</p>`}
        ${reqs.length ? `<h3 class="h3">Mes demandes</h3><ul class="list">${reqs.map((q) => `<li><div><b>${esc(api.reward(q.rewardId)?.name)}</b><small>${ago(q.at)}</small></div>${rStatusPill(q.status)}</li>`).join('')}</ul>` : ''}
      </section>
    </div>
  </div>`;
  return {
    html,
    mount(root) {
      mountPushPanel(root.querySelector('[data-push-card]'), { card: true }); countUp(root); flipCard(root); bindInstall(root, () => toast('Tu pourras installer l’appli plus tard avec le bouton Installer en haut de l’écran.'));
      root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = act(async () => { const on = await api.toggleActivity(b.dataset.act); toast(on ? 'Présence annoncée. Les points seront crédités après confirmation.' : 'Présence retirée.'); rerender(); })));
      root.querySelectorAll('[data-req]').forEach((b) => (b.onclick = () => { location.hash = '#/recompenses'; }));
      return tilt(root);
    },
  };
}

// ---------- Profil ----------
export function profile({ params, query, rerender }) {
  const meU = api.me();
  const u = params.id ? api.user(params.id) : meU;
  if (!u) return { html: `<div class="wrap page">${empty('Joueur introuvable.')}</div>` };
  const own = u.id === meU.id;
  const staff = api.can('members.view');
  const S = api.stats()[u.id];
  const tab = query.tab || 'stats';
  const tabs = [['stats', 'Statistiques'], ['historique', 'Historique'], ['recompenses', 'Récompenses']];
  if (own || api.can('discipline.manage')) tabs.push(['discipline', 'Discipline']);
  const dist = api.distinctionsOf(u.id);
  const base = own ? '#/profil' : `#/joueur/${u.id}`;
  let body = '';
  if (tab === 'stats') {
    const tsPlayed = api.data().tournaments.filter((t) => t.status === 'done' && t.registrations.some((r) => r.status === 'ok' && api.regUsers(r).includes(u.id))).sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="statgrid">
      ${[['Points totaux', S.permanent], ['Points saison', S.season], ['Classement saison', api.rankOf(u.id) ? `#${api.rankOf(u.id)}` : '–'], ['Classement général', api.rankOf(u.id, 'general') ? `#${api.rankOf(u.id, 'general')}` : '–'],
        ['Tournois joués', S.tournaments], ['Victoires', S.wins + S.scrimWins], ['Défaites', S.losses], ['Podiums', S.podiums],
        ['Points MJ', S.mj], ['Points BR', S.br], ['Présences saison', S.partSeason], ['Présences 30 j', S.reg30]]
        .map(([k, v]) => `<div><span>${k}</span><b>${typeof v === 'number' ? nf(v) : v}</b></div>`).join('')}
    </div>
    <div class="panel">${gradeProgress(S.permanent)}</div>
    <section class="sec"><div class="sec-head"><h2>Évolution sur 8 semaines</h2></div>${weeklyChart(u.id)}</section>
    <section class="sec"><div class="sec-head"><h2>Tournois</h2></div>
      ${tsPlayed.length ? `<ul class="list">${tsPlayed.map((t) => { const reg = t.registrations.find((r) => api.regUsers(r).includes(u.id)); const pos = t.results.ranking.indexOf(reg.id) + 1; return `<li><a href="#/tournoi/${t.id}"><div><b>${esc(t.name)}</b><small>${fmtDate(t.date)} · ${esc(api.T_TYPES[t.type])}</small></div><span class="pos ${pos <= 3 ? `p${pos}` : ''}">${pos <= 3 ? `${pos}${pos === 1 ? 'er' : 'e'}` : 'Participant'}</span></a></li>`; }).join('')}</ul>` : empty('Aucun tournoi terminé.')}
    </section>`;
  } else if (tab === 'historique') {
    const h = api.history(u.id);
    body = h.length ? `<ul class="txs">${h.map((t) => txRow(t, { correct: api.can('points.manage') && !own })).join('')}</ul>` : empty('Aucune opération.');
  } else if (tab === 'recompenses') {
    const reqs = api.myRequests(u.id).filter((q) => ['accepted', 'delivered'].includes(q.status));
    body = `<section class="sec"><div class="sec-head"><h2>Distinctions</h2></div>${dist.length ? `<ul class="medals">${dist.map((d) => `<li>${cloud('medal-cloud', 8)}<div><b>${esc(d.title)}</b><small>${esc(d.period)}</small></div></li>`).join('')}</ul>` : empty('Pas encore de distinction.')}</section>
      <section class="sec"><div class="sec-head"><h2>Récompenses obtenues</h2></div>${reqs.length ? `<ul class="list">${reqs.map((q) => `<li><div><b>${esc(api.reward(q.rewardId)?.name)}</b><small>${fmtDT(q.at)}${q.auto ? ' · attribution' : ` · ${nf(q.cost)} pts`}</small></div>${rStatusPill(q.status)}</li>`).join('')}</ul>` : empty('Aucune récompense obtenue.')}</section>`;
  } else if (tab === 'discipline') {
    const d = api.disciplineOf(u.id);
    body = d.length ? `<ul class="list">${d.map((x) => `<li><div><b>${esc(x.kind[0].toUpperCase() + x.kind.slice(1))}</b><span>${esc(x.reason)}</span><small>${fmtDT(x.at)} · par ${esc(api.user(x.adminId)?.pseudo)}${x.points ? ` · ${x.points} pts` : ''}</small></div></li>`).join('')}</ul>` : empty('Aucun avertissement ni sanction.');
  }
  const html = `<div class="wrap page">
    <div class="prof-head">
      ${avatar(u, 'xl')}
      <div class="prof-id">
        <h1>${esc(u.pseudo)}</h1>
        <div class="row wrap">${gradeTag(S.permanent)}${u.status !== 'active' ? statusPill(u.status) : ''}${u.roles.filter((r) => r !== 'member').map((r) => `<span class="pill">${esc(api.ROLES[r])}</span>`).join('')}</div>
        <p class="muted small">${esc(api.MODES[u.mode])}${u.specialty ? ` · ${esc(u.specialty)}` : ''} · niveau ${esc(u.level)}${(staff || own) && u.uid ? ` · UID <span class="mono">${esc(u.uid)}</span>` : ''}</p>
        ${u.availability ? `<p class="muted small">${I.clock} ${esc(u.availability)}</p>` : ''}
      </div>
      ${own ? `<button class="btn btn-line btn-sm" id="edit">${I.edit} Modifier</button>` : staff ? `<a class="btn btn-line btn-sm" href="#/admin/membres?open=${u.id}">${I.shield} Gérer</a>` : ''}
    </div>
    ${u.card?.publishedAt ? `<a class="btn btn-sm prof-card" href="#/bienvenue/${u.id}">${I.play} Voir la présentation</a>` : own ? `<a class="btn btn-sm btn-line prof-card" href="#/presentation">${I.film} Créer ma carte de présentation</a>` : ''}
    ${dist.length ? `<div class="dist-strip">${dist.slice(0, 4).map((d) => `<span class="dist">${esc(d.title)} <small>${esc(d.period)}</small></span>`).join('')}</div>` : ''}
    <div class="chips" role="tablist">${tabs.map(([k, l]) => `<a class="chip ${k === tab ? 'on' : ''}" href="${base}?tab=${k}">${l}</a>`).join('')}</div>
    ${body}
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelector('#edit')?.addEventListener('click', () => editProfile(u, rerender));
      root.querySelectorAll('[data-correct]').forEach((b) => (b.onclick = act(async () => {
        const r = await ask('Corriger une opération', 'Une opération inverse sera ajoutée à l’historique. L’opération d’origine reste visible.', { reason: true, required: true, label: 'Enregistrer la correction', placeholder: 'Motif de la correction' });
        if (!r) return; await api.correctTx(b.dataset.correct, r.reason); toast('Correction enregistrée.'); rerender();
      })));
    },
  };
}

function weeklyChart(userId) {
  const weeks = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  for (let i = 7; i >= 0; i--) weeks.push(start.getTime() - i * 7 * 864e5);
  const vals = weeks.map((w) => api.history(userId).filter((t) => !['reward', 'reset'].includes(t.kind)).filter((t) => { const a = new Date(t.at).getTime(); return a >= w && a < w + 7 * 864e5; }).reduce((s, t) => s + t.points, 0));
  const max = Math.max(10, ...vals);
  return `<div class="chart" role="img" aria-label="Points par semaine">${vals.map((v, i) => `<div class="col"><span class="v">${v || ''}</span><i style="--h:${Math.max(2, (Math.max(0, v) / max) * 100)}%" class="${i === vals.length - 1 ? 'now' : ''}"></i><small>${new Date(weeks[i]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</small></div>`).join('')}</div>`;
}

function editProfile(u, rerender) {
  let avatarData = u.avatar;
  sheet('Modifier mon profil', `<form class="stack" id="pf">
    <div class="field"><span>Avatar</span><label class="upload"><input type="file" accept="image/*" name="file"><span class="upload-prev">${avatar(u, 'md')}</span><span>Changer l’image</span></label></div>
    <label class="field"><span>Niveau du compte</span><input name="level" type="number" min="1" max="500" value="${esc(u.level)}"></label>
    <label class="field"><span>Mode principal</span><select name="mode">${Object.entries(api.MODES).map(([k, l]) => `<option value="${k}" ${u.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Spécialité</span><select name="specialty">${api.SPECIALTIES.map((s) => `<option ${u.specialty === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label class="field"><span>Disponibilités</span><input name="availability" value="${esc(u.availability)}"></label>
    ${u.uid ? '' : `<label class="field"><span>UID du joueur</span><input name="uid" inputmode="numeric" pattern="[0-9 ]{6,24}"><small>Dans CODM : profil, puis l’identifiant sous ton pseudo. Tu ne le saisis qu’une fois.</small></label>`}
    <p class="small muted">Le pseudo${u.uid ? ' et l’UID se modifient' : ' se modifie'} avec un responsable, pour garder le classement fiable.</p>
    <div class="row end"><button type="button" class="btn btn-line" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
  </form>`, (body, close) => {
    body.querySelector('[data-close]').onclick = close;
    body.querySelector('[name=file]').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; avatarData = await resizeImage(f, 160); body.querySelector('.upload-prev').innerHTML = `<img class="av av-md" src="${avatarData}" alt="">`; };
    body.querySelector('#pf').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); delete f.file; await api.updateUser(u.id, { ...f, avatar: avatarData }); close(); toast('Profil mis à jour.'); rerender(); });
  });
}

// ---------- Tournois ----------
export function tournaments({ query }) {
  const f = query.f || 'upcoming';
  const all = api.tournamentsList().filter((t) => t.status !== 'draft' || api.canManageT(t));
  const list = all.filter((t) => (f === 'upcoming' ? ['open', 'closed', 'draft'].includes(t.status) : f === 'live' ? t.status === 'live' : ['done', 'cancelled'].includes(t.status)));
  const html = `<div class="wrap page">
    ${head('Tournois', 'Inscris-toi directement depuis la fiche du tournoi', api.canManageAnyT() ? `<a class="btn btn-sm" href="#/admin/tournois?new=1">${I.plus} Créer</a>` : '')}
    <div class="chips">${[['upcoming', 'À venir'], ['live', 'En cours'], ['past', 'Historique']].map(([k, l]) => `<a class="chip ${k === f ? 'on' : ''}" href="#/tournois?f=${k}">${l}<small>${all.filter((t) => (k === 'upcoming' ? ['open', 'closed', 'draft'].includes(t.status) : k === 'live' ? t.status === 'live' : ['done', 'cancelled'].includes(t.status))).length}</small></a>`).join('')}</div>
    <div class="grid-cards">${list.map(tCard).join('') || empty('Rien ici pour le moment.')}</div>
  </div>`;
  return { html };
}

export function tournament({ params, rerender }) {
  const t = api.tournament(params.id);
  if (!t) return { html: `<div class="wrap page">${empty('Tournoi introuvable.')}</div>` };
  const u = api.me();
  const mgr = api.canManageT(t);
  const team = api.TEAM_TYPES.includes(t.type);
  const regs = api.activeRegs(t);
  const mine = regs.find((r) => api.regUsers(r).includes(u.id));
  const full = regs.length >= t.max;
  const deadlinePassed = new Date(t.deadline).getTime() < Date.now();
  const canReg = t.status === 'open' && !mine && !full && !deadlinePassed && u.status === 'active';
  const okRegs = regs.filter((r) => r.status === 'ok');
  const podRows = t.results ? t.results.podium.map((id) => { const r = t.registrations.find((x) => x.id === id); return { user: { ...api.user(r.userId), pseudo: team ? r.teamName : api.user(r.userId).pseudo }, value: [t.points.first, t.points.second, t.points.third][t.results.podium.indexOf(id)] }; }) : [];
  const label = (id) => { const r = t.registrations.find((x) => x.id === id); return r ? esc(api.regLabel(t, r)) : '?'; };
  const html = `<div class="wrap page">
    <a class="back" href="#/tournois">${I.left} Tournois</a>
    <div class="t-hero ts-${t.status}">
      <div class="t-hero-meta">${tStatusPill(t.status)}<span>${esc(api.T_TYPES[t.type])} · ${esc(t.mode || 'MJ/BR')}</span></div>
      <h1>${esc(t.name)}</h1>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
      <dl class="t-facts">
        <div><dt>Date</dt><dd>${fmtDay(t.date)}</dd></div>
        <div><dt>Heure</dt><dd>${fmtTime(t.date)}</dd></div>
        <div><dt>Clôture inscriptions</dt><dd>${fmtDT(t.deadline)}</dd></div>
        <div><dt>Format</dt><dd>${esc(t.format || '–')}</dd></div>
        <div><dt>Responsable</dt><dd>${esc(api.user(t.managerId)?.pseudo || '–')}</dd></div>
        <div><dt>Places</dt><dd>${regs.length}/${t.max}</dd></div>
      </dl>
      <div class="places big"><i style="--p:${Math.min(100, (regs.length / t.max) * 100)}%"></i></div>
      <div class="row">
        ${canReg ? `<button class="btn btn-lg" id="reg">${team ? 'Inscrire mon équipe' : 'M’inscrire'}</button>` : ''}
        ${mine && ['open', 'closed'].includes(t.status) ? `<span class="pill ${mine.status === 'ok' ? 'rs-accepted' : 'rs-pending'}">${mine.status === 'ok' ? 'Inscription validée' : 'Inscription en attente'}</span><button class="btn btn-line btn-sm" id="unreg">Me désinscrire</button>` : ''}
        ${t.status === 'open' && !mine && (full || deadlinePassed) ? `<span class="muted">${full ? 'Complet' : 'Inscriptions closes'}</span>` : ''}
      </div>
    </div>

    ${t.results ? `<section class="sec"><div class="sec-head"><h2>Résultats</h2><span class="muted small">validés ${ago(t.results.validatedAt)} par ${esc(api.user(t.results.validatedBy)?.pseudo)}</span></div>
      ${podium(podRows, 'pts bonus', false)}
      <ol class="ranks">${t.results.ranking.slice(3).map((id, i) => `<li><div><span class="rk">${i + 4}</span><span class="rn"><b>${label(id)}</b></span><span class="rv">+${t.points.participation}<small>pts</small></span></div></li>`).join('')}</ol>
    </section>` : ''}

    <div class="split">
      <section class="sec"><div class="sec-head"><h2>Règles</h2></div><p class="prose">${esc(t.rules || 'Règlement général du clan.')}</p>
        <div class="sec-head"><h2>Récompenses</h2></div><p class="prose">${esc(t.rewards || '–')}</p>
        <ul class="rules-list"><li><span>Participation</span><b>+${t.points.participation}</b></li><li><span>1re place</span><b>+${t.points.first}</b></li><li><span>2e place</span><b>+${t.points.second}</b></li><li><span>3e place</span><b>+${t.points.third}</b></li></ul>
      </section>
      <section class="sec"><div class="sec-head"><h2>Participants</h2><span class="muted small">${okRegs.length} validés</span></div>
        ${regs.length ? `<ul class="list parts">${regs.map((r) => `<li><div class="row nowrap">${avatar(api.user(r.userId), 'sm')}${r.mateId ? avatar(api.user(r.mateId), 'sm') : ''}<div><b>${team ? esc(r.teamName) : esc(api.user(r.userId)?.pseudo)}</b>${team ? `<small>${api.regUsers(r).map((id) => esc(api.user(id)?.pseudo)).join(' + ')}${!r.mateId ? ' · cherche un coéquipier' : ''}</small>` : ''}</div></div>
          <div class="row nowrap">${r.status === 'pending' ? '<span class="pill rs-pending">En attente</span>' : ''}
          ${team && !r.mateId && t.allowJoin && canReg ? `<button class="btn btn-sm btn-line" data-join="${r.id}">Rejoindre</button>` : ''}
          ${mgr && t.status !== 'done' ? `${r.status === 'pending' ? `<button class="icon-btn ok" data-ok="${r.id}" aria-label="Valider">${I.check}</button>` : ''}<button class="icon-btn" data-rm="${r.id}" aria-label="Retirer">${I.x}</button>` : ''}</div></li>`).join('')}</ul>` : empty('Aucun inscrit pour le moment.')}
      </section>
    </div>

    ${t.matches.length || (mgr && t.status === 'live') ? `<section class="sec"><div class="sec-head"><h2>Matchs</h2>${mgr && ['live', 'closed'].includes(t.status) ? `<button class="btn btn-sm btn-line" id="addm">${I.plus} Match</button>` : ''}</div>
      ${t.matches.length ? `<ul class="matches">${t.matches.map((m) => `<li><small>${esc(m.round)}</small><span class="${m.sa > m.sb ? 'w' : ''}">${label(m.a)}</span><b>${m.sa} - ${m.sb}</b><span class="${m.sb > m.sa ? 'w' : ''}">${label(m.b)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun match enregistré.</p>'}
    </section>` : ''}

    ${mgr ? `<section class="sec admin-zone"><div class="sec-head"><h2>${I.shield} Gestion</h2></div>
      <div class="row wrap">
        ${t.status === 'draft' ? `<button class="btn btn-sm" data-st="open">Ouvrir les inscriptions</button>` : ''}
        ${t.status === 'open' ? `<button class="btn btn-sm" data-st="closed">Fermer les inscriptions</button>` : ''}
        ${['open', 'closed'].includes(t.status) ? `<button class="btn btn-sm" data-st="live">Lancer le tournoi</button>` : ''}
        ${['live', 'closed'].includes(t.status) ? `<button class="btn btn-sm" id="results">Saisir et valider les résultats</button>` : ''}
        ${!['done', 'cancelled'].includes(t.status) ? `<a class="btn btn-sm btn-line" href="#/admin/tournois?edit=${t.id}">${I.edit} Modifier</a><button class="btn btn-sm btn-danger-line" data-st="cancelled">Annuler le tournoi</button>` : ''}
      </div>
      ${t.status === 'done' ? `<p class="muted small">Tournoi clôturé. Les points ont été attribués automatiquement et figurent dans le journal.</p>` : ''}
    </section>` : ''}
  </div>`;
  return {
    html,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      $('#reg')?.addEventListener('click', () => {
        if (!team) return act(async () => { await api.registerT(t.id); toast('Inscription envoyée. Le responsable va la valider.'); rerender(); })();
        const mates = api.data().users.filter((x) => x.status === 'active' && x.id !== u.id && !api.isRegistered(t, x.id));
        sheet('Inscrire mon équipe', `<form class="stack" id="tf">
          <label class="field"><span>Nom de l’équipe</span><input name="teamName" required maxlength="24"></label>
          <label class="field"><span>Coéquipier</span><select name="mateId"><option value="">${t.allowJoin ? 'Laisser une place libre' : 'Choisir'}</option>${mates.map((m) => `<option value="${m.id}">${esc(m.pseudo)}</option>`).join('')}</select></label>
          ${t.allowJoin ? '<p class="small muted">Une place libre permet à un autre membre de rejoindre ton équipe.</p>' : ''}
          <button class="btn btn-block">Envoyer l’inscription</button></form>`, (body, close) => {
          body.querySelector('#tf').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); if (!t.allowJoin && !f.mateId) throw new Error('Choisis ton coéquipier.'); await api.registerT(t.id, f); close(); toast('Équipe inscrite.'); rerender(); });
        });
      });
      $('#unreg')?.addEventListener('click', act(async () => { if (!(await ask('Se désinscrire', `Tu libères ta place pour ${t.name}.`, { label: 'Me désinscrire', danger: true }))) return; await api.unregisterT(t.id); toast('Désinscription enregistrée.'); rerender(); }));
      root.querySelectorAll('[data-join]').forEach((b) => (b.onclick = act(async () => { await api.joinTeam(t.id, b.dataset.join); toast('Tu as rejoint l’équipe.'); rerender(); })));
      root.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = act(async () => { await api.setRegStatus(t.id, b.dataset.ok, 'ok'); toast('Inscription validée.'); rerender(); })));
      root.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = act(async () => { const r = await ask('Retirer le participant', 'Le participant sera notifié.', { reason: true, required: true, danger: true, label: 'Retirer' }); if (!r) return; await api.setRegStatus(t.id, b.dataset.rm, 'removed', r.reason); toast('Participant retiré.'); rerender(); })));
      root.querySelectorAll('[data-st]').forEach((b) => (b.onclick = act(async () => {
        if (b.dataset.st === 'cancelled' && !(await ask('Annuler le tournoi', 'Les inscrits seront prévenus. Cette action est définitive.', { danger: true, label: 'Annuler le tournoi' }))) return;
        await api.setTStatus(t.id, b.dataset.st); toast(`Statut : ${api.T_STATUS[b.dataset.st]}.`); rerender();
      })));
      $('#addm')?.addEventListener('click', () => {
        const opts = okRegs.map((r) => `<option value="${r.id}">${esc(api.regLabel(t, r))}</option>`).join('');
        sheet('Enregistrer un match', `<form class="stack" id="mf">
          <label class="field"><span>Phase</span><input name="round" placeholder="Ex. Quart de finale"></label>
          <div class="row2"><label class="field"><span>Participant A</span><select name="a">${opts}</select></label><label class="field"><span>Score A</span><input name="sa" type="number" min="0" value="0" inputmode="numeric"></label></div>
          <div class="row2"><label class="field"><span>Participant B</span><select name="b">${opts}</select></label><label class="field"><span>Score B</span><input name="sb" type="number" min="0" value="0" inputmode="numeric"></label></div>
          <button class="btn btn-block">Enregistrer</button></form>`, (body, close) => {
          const sb = body.querySelector('[name=b]'); if (sb.options[1]) sb.selectedIndex = 1;
          body.querySelector('#mf').onsubmit = act(async (e) => { e.preventDefault(); await api.addMatch(t.id, formObj(e.target)); close(); toast('Match enregistré.'); rerender(); });
        });
      });
      $('#results')?.addEventListener('click', () => {
        const opts = `<option value="">Aucun</option>${okRegs.map((r) => `<option value="${r.id}">${esc(api.regLabel(t, r))}</option>`).join('')}`;
        const total = okRegs.reduce((a, r) => a + api.regUsers(r).length, 0);
        sheet('Valider les résultats', `<form class="stack" id="rf">
          <p class="muted small">${okRegs.length} participants validés. À la validation, chacun reçoit +${t.points.participation} pts et le podium reçoit son bonus. Cette étape est définitive.</p>
          <label class="field"><span>1re place (+${t.points.first})</span><select name="p1" required>${opts}</select></label>
          <label class="field"><span>2e place (+${t.points.second})</span><select name="p2">${opts}</select></label>
          <label class="field"><span>3e place (+${t.points.third})</span><select name="p3">${opts}</select></label>
          <p class="small">Points distribués : environ <b id="tot">${nf(total * t.points.participation)}</b></p>
          <button class="btn btn-block">Valider et attribuer les points</button></form>`, (body, close) => {
          body.querySelector('#rf').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); await api.publishResults(t.id, [f.p1, f.p2, f.p3]); close(); toast('Résultats publiés, points attribués.'); rerender(); });
        });
      });
      return tilt(root);
    },
  };
}

// ---------- Notifications ----------
export function notifications({ rerender }) {
  const list = api.myNotifications();
  const html = `<div class="wrap page narrow">
    ${head('Notifications', '', list.some((n) => !n.read) ? `<button class="btn btn-sm btn-line" id="all">Tout marquer comme lu</button>` : '')}
    <div data-push-panel></div>
    ${list.length ? `<ul class="notifs">${list.map((n) => `<li class="${n.read ? '' : 'unread'}"><a href="${esc(n.link || '#/notifications')}" data-n="${n.id}"><span class="dot"></span><div><p>${esc(n.text)}</p><small>${ago(n.at)}</small></div></a></li>`).join('')}</ul>` : empty('Rien de neuf pour le moment.')}
  </div>`;
  return {
    html,
    mount(root) {
      mountPushPanel(root.querySelector('[data-push-panel]'));
      root.querySelector('#all')?.addEventListener('click', act(async () => { await api.markAllRead(); rerender(); }));
      root.querySelectorAll('[data-n]').forEach((a) => a.addEventListener('click', () => { api.markRead(a.dataset.n).catch(() => {}); }));
    },
  };
}

// ---------- Règlement ----------
export function rulebook() {
  const db = api.data();
  const u = api.me();
  const mine = u ? api.disciplineOf(u.id) : [];
  const html = `<div class="wrap page narrow">
    ${head('Règlement du clan', 'Chaque membre s’engage à le respecter dès son inscription.')}
    <ol class="rulebook">${db.settings.rulebook.map((r, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(r)}</p></li>`).join('')}</ol>
    <section class="sec"><div class="sec-head"><h2>Sanctions possibles</h2></div>
      <ul class="rules-list"><li><span>Avertissement</span><b>inscrit au dossier</b></li><li><span>Retrait de points</span><b>selon la gravité</b></li><li><span>Suspension</span><b>activités bloquées</b></li><li><span>Exclusion</span><b>retrait du clan</b></li></ul>
    </section>
    ${u ? `<section class="sec"><div class="sec-head"><h2>Mon dossier</h2></div>${mine.length ? `<ul class="list">${mine.map((x) => `<li><div><b>${esc(x.kind)}</b><span>${esc(x.reason)}</span><small>${fmtDT(x.at)}</small></div></li>`).join('')}</ul>` : '<p class="muted">Dossier vierge. Continue comme ça.</p>'}</section>` : ''}
  </div>`;
  return { html };
}

// ---------- Menu « Moi » ----------
export function menu() {
  const u = api.me();
  const S = api.stats()[u.id];
  const links = [
    ['#/profil', I.user, 'Mon profil', 'Statistiques, grade, distinctions'],
    ['#/profil?tab=historique', I.log, 'Mes points', `${nf(S.balance)} pts de solde · historique complet`],
    ['#/presentation', I.film, 'Ma carte de présentation', u.card?.publishedAt ? 'Publiée · modifier ou revoir l’animation' : 'À créer · le clan te découvre en animation 3D'],
    ['#/annonces', I.mega, 'Annonces', api.annUnread() ? `${api.annUnread()} nouvelle${api.annUnread() > 1 ? 's' : ''}` : 'Informations officielles du clan'],
    ['#/notifications', I.bell, 'Notifications', `${api.unreadCount()} non lues · réglage du téléphone`],
    ['#/calendrier', I.cal, 'Calendrier', 'Séances et compétitions'],
    ['#/reglement', I.book, 'Règlement', 'Règles et mon dossier'],
    ['#/clan', I.users, 'Le clan', 'Encadrement, barème et grades'],
  ];
  if (api.isStaff()) links.unshift(['#/admin', I.shield, 'Espace administration', 'Membres, points, tournois, récompenses']);
  const html = `<div class="wrap page narrow">
    <div class="me-head">${avatar(u, 'lg')}<div><b>${esc(u.pseudo)}</b>${gradeTag(S.permanent)}</div></div>
    <ul class="menu">${links.map(([h, i, t, d]) => `<li><a href="${h}">${i}<div><b>${t}</b><small>${d}</small></div>${I.right}</a></li>`).join('')}${installMenuItem()}</ul>
    <button class="btn btn-line btn-block" id="lo">${I.out} Se déconnecter</button>
    <button class="btn btn-line btn-block" id="pw">Changer mon mot de passe</button>
    ${api.info().demo && api.isSuper() ? `<button class="btn btn-ghost btn-block small" id="reset">Réinitialiser les données de démonstration</button>` : ''}
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelector('#lo').onclick = act(async () => { await api.logout(); toast('À bientôt.'); location.hash = '#/'; });
      bindInstall(root, () => toast('Tu pourras installer l’appli plus tard avec le bouton Installer en haut de l’écran.'));
      root.querySelector('#pw').onclick = () => sheet('Changer mon mot de passe', `<form class="stack" id="pwf">
        <label class="field"><span>Mot de passe actuel</span><input type="password" name="current" required autocomplete="current-password"></label>
        <label class="field"><span>Nouveau mot de passe</span><input type="password" name="next" required minlength="8" autocomplete="new-password"><small>8 caractères minimum, avec des lettres et au moins un chiffre.</small></label>
        <button class="btn btn-block">Enregistrer</button></form>`, (body, close) => {
        body.querySelector('#pwf').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); await api.changePassword(f.current, f.next); close(); toast('Mot de passe modifié. Tes autres appareils sont déconnectés.'); });
      });
      root.querySelector('#reset')?.addEventListener('click', act(async () => { if (!(await ask('Réinitialiser la démo', 'Toutes les données du serveur seront remplacées par le jeu de démonstration.', { danger: true, label: 'Réinitialiser' }))) return; await api.resetDemo(); location.hash = '#/'; location.reload(); }));
    },
  };
}
