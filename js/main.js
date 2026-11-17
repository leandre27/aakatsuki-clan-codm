import * as api from './api.js';
import { I, logo } from './icons.js';
import { esc, avatar } from './ui.js';
import * as pub from './views/public.js';
import * as mem from './views/member.js';
import * as adm from './views/admin.js';
import { initPWA, installTopButton, bindInstall, syncPush } from './pwa.js';
import { toast } from './ui.js';

// guard : 'auth' = connecté, 'member' = membre validé (sinon page d'attente), 'staff' = rôle administratif
const routes = [
  ['', pub.home], ['clan', pub.clan], ['classement', pub.leaderboard], ['calendrier', pub.calendar], ['recompenses', pub.rewards],
  ['rejoindre', pub.register], ['connexion', pub.login], ['reglement', mem.rulebook], ['annonces', mem.announcements],
  ['base', mem.dashboard, 'member'], ['profil', mem.profile, 'member'], ['joueur/:id', mem.profile, 'member'],
  ['tournois', mem.tournaments, 'member'], ['tournoi/:id', mem.tournament, 'member'],
  ['notifications', mem.notifications, 'auth'], ['moi', mem.menu, 'auth'], ['mot-de-passe', mem.firstPassword, 'auth'],
  ['admin', adm.overview, 'staff'], ['admin/membres', adm.members, 'staff'], ['admin/points', adm.points, 'staff'],
  ['admin/tournois', adm.tournaments, 'staff'], ['admin/recompenses', adm.rewards, 'staff'], ['admin/annonces', adm.announcements, 'staff'],
  ['admin/discipline', adm.discipline, 'staff'], ['admin/journal', adm.journal, 'staff'], ['admin/reglages', adm.settings, 'staff'],
];

function match(path) {
  for (const [pat, view, guard] of routes) {
    const pp = pat.split('/'), sp = path.split('/');
    if (pp.length !== sp.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(sp[i])), true) : p === sp[i]))) return { view, guard, params, pat };
  }
  return null;
}

let cleanup = null;
let lastPath = null;
function render({ keepScroll = false } = {}) {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path = '', qs = ''] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  let m = match(path) || match('');
  const u = api.me();
  // Compte créé par le clan : mot de passe provisoire à remplacer avant tout le reste
  if (u?.mustChangePassword && m.pat !== 'mot-de-passe' && path !== 'reglement') { location.hash = '#/mot-de-passe'; return; }
  if (m.guard) {
    if (!u) { location.hash = `#/connexion?next=${encodeURIComponent('#/' + hash)}`; return; }
    const member = ['active', 'suspended', 'inactive'].includes(u.status);
    if (m.guard === 'member' && !member) m = { view: mem.pending, params: {}, pat: 'pending' };
    if (m.guard === 'staff' && !api.isStaff(u)) { location.hash = '#/base'; return; }
  }
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  const view = document.getElementById('view');
  const samePage = path === lastPath;
  const out = m.view({ params: m.params, query, rerender: () => render({ keepScroll: true }) }) || { html: '' };
  const y = scrollY;
  view.innerHTML = out.html;
  view.dataset.page = m.pat.split('/')[0] || 'home';
  if (keepScroll || samePage) scrollTo(0, y);
  else { scrollTo(0, 0); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
  cleanup = out.mount?.(view) || null;
  lastPath = path;
  chrome(path);
}

function chrome(path) {
  const u = api.me();
  const member = u && ['active', 'suspended', 'inactive'].includes(u.status);
  const unread = u ? api.unreadCount() : 0;
  const annNew = member ? api.annUnread() : 0;
  const home = member ? '#/base' : '#/';
  const desktop = member
    ? [['#/base', 'Base'], ['#/annonces', 'Annonces'], ['#/classement', 'Classement'], ['#/tournois', 'Tournois'], ['#/recompenses', 'Récompenses'], ['#/calendrier', 'Calendrier']]
    : [['#/', 'Accueil'], ['#/clan', 'Le clan'], ['#/classement', 'Classement'], ['#/calendrier', 'Calendrier'], ['#/recompenses', 'Récompenses']];
  const on = (h) => { const p = h.replace('#/', ''); return p === '' ? path === '' : path === p || path.startsWith(p + '/') || (p === 'tournois' && path.startsWith('tournoi/')); };
  const offline = api.info().offline;
  const since = localStorage.getItem('akt.lastSync');
  document.getElementById('topbar').innerHTML = `${offline ? `<div class="offbar">Hors ligne · données du ${since ? new Date(since).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'dernier passage'}, en lecture seule</div>` : ''}<div class="wrap tb">
    <a class="brand" href="${home}" aria-label="AaKATSUKI, accueil">${logo('brand-logo')}<span><i class="kage">影</i>AaKATSUKI</span></a>
    <nav class="tb-links">${desktop.map(([h, l]) => `<a href="${h}" class="${on(h) ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="tb-right">
      ${installTopButton()}
      ${u ? `${api.isStaff(u) ? `<a class="icon-btn ${path.startsWith('admin') ? 'on' : ''}" href="#/admin" aria-label="Administration">${I.shield}</a>` : ''}
        ${member ? `<a class="icon-btn bell ${path === 'annonces' ? 'on' : ''}" href="#/annonces" aria-label="Annonces${annNew ? `, ${annNew} nouvelles` : ''}">${I.mega}${annNew ? `<span class="badge-n">${annNew > 9 ? '9+' : annNew}</span>` : ''}</a>` : ''}
        <a class="icon-btn bell" href="#/notifications" aria-label="Notifications, ${unread} non lues">${I.bell}${unread ? `<span class="badge-n">${unread > 9 ? '9+' : unread}</span>` : ''}</a>
        <a class="tb-me" href="#/moi" aria-label="Mon compte">${avatar(u, 'sm')}</a>`
      : `<a class="btn btn-sm btn-line" href="#/connexion">Connexion</a><a class="btn btn-sm hide-sm" href="#/rejoindre">Rejoindre</a>`}
    </div></div>`;
  bindInstall(document.getElementById('topbar'));
  const tabs = member
    ? [['#/base', I.home, 'Base'], ['#/classement', I.rank, 'Classement'], ['#/tournois', I.cup, 'Tournois'], ['#/recompenses', I.gift, 'Butin'], ['#/moi', I.user, 'Moi']]
    : [['#/', I.home, 'Accueil'], ['#/classement', I.rank, 'Classement'], ['#/calendrier', I.cal, 'Calendrier'], ['#/recompenses', I.gift, 'Récompenses'], [u ? '#/moi' : '#/rejoindre', I.user, u ? 'Moi' : 'Rejoindre']];
  const active = (h) => on(h) || (h === '#/moi' && ['profil', 'notifications', 'reglement', 'clan', 'annonces'].includes(path.split('/')[0])) || (h === '#/moi' && path.startsWith('admin')) || (h === '#/tournois' && path === 'calendrier' && member);
  document.getElementById('tabbar').innerHTML = tabs.map(([h, i, l]) => `<a href="${h}" class="${active(h) ? 'on' : ''}" ${active(h) ? 'aria-current="page"' : ''}>${i}<span>${esc(l)}</span></a>`).join('');
}

addEventListener('hashchange', () => render());
// Une page peut demander de rafraîchir la barre du haut (badges)
document.addEventListener('akt:chrome', () => chrome(location.hash.replace(/^#\/?/, '').split('?')[0]));
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 8), { passive: true });

initPWA();
addEventListener('online', async () => { try { await api.load(); render({ keepScroll: true }); } catch { /* toujours hors ligne */ } });
(async () => {
  try {
    await api.load();
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="wrap page narrow center-page"><h1>Hors ligne</h1><p class="muted">${esc(e.message)}</p><button class="btn" id="retry">Réessayer</button></div>`;
    document.getElementById('retry').onclick = () => location.reload();
    return;
  }
  render();
  syncPush();
  // Toucher une notification quand l'appli est déjà ouverte
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open' && typeof e.data.url === 'string' && e.data.url.startsWith('#/')) location.hash = e.data.url; });
  // Rafraîchit l'état (notifications, classement) quand l'appli revient au premier plan
  let lastSync = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || Date.now() - lastSync < 30_000 || document.getElementById('sheet-root').classList.contains('open')) return;
    lastSync = Date.now();
    try { await api.load(); render({ keepScroll: true }); } catch { /* hors ligne : on garde l'état affiché */ }
  });
})();
