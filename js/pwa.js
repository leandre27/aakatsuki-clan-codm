// Appli installable : service worker, invite d'installation, mises à jour.
import { I, logo } from './icons.js';
import { esc, sheet, toast, act } from './ui.js';
import * as api from './api.js';

let deferred = null;
const DISMISS = 'akt.install.dismissed';
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Les iPad récents se présentent comme un Mac tactile ; un Android n'est jamais un iPhone.
export const isIOS = () => !/android/i.test(navigator.userAgent) && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const canInstall = () => !isStandalone();
const UA = navigator.userAgent;
const isAndroid = () => /android/i.test(UA);
// Navigateurs intégrés (WhatsApp, Facebook, Instagram, TikTok…) : pas d'installation possible
const isInApp = () => /\bwv\b|FBAN|FBAV|Instagram|WhatsApp|Line\/|TikTok|Snapchat/i.test(UA);

// Étapes à suivre quand le navigateur ne propose pas l'installation en un geste
function guide() {
  const menu = '<b class="kbd">⋮</b>';
  if (isInApp()) return { title: 'Ouvre le lien dans ton navigateur', steps: isIOS()
    ? ['Touche les <b>…</b> ou l’icône de boussole en bas', 'Choisis <b>Ouvrir dans Safari</b>', 'Puis Partager et <b>Sur l’écran d’accueil</b>']
    : [`Touche ${menu} en haut à droite`, 'Choisis <b>Ouvrir dans Chrome</b>', `Puis ${menu} et <b>Installer l’application</b>`] };
  if (isIOS()) return { title: 'Sur iPhone', steps: [`Touche ${I.share} <b>Partager</b> (en bas dans Safari, en haut dans Chrome)`, 'Choisis <b>Sur l’écran d’accueil</b>', 'Touche <b>Ajouter</b>'] };
  if (isAndroid() && /SamsungBrowser/i.test(UA)) return { title: 'Sur Samsung Internet', steps: ['Touche <b>≡</b> en bas à droite', 'Choisis <b>Ajouter page à</b>', 'Puis <b>Écran d’accueil</b>'] };
  if (isAndroid() && /Firefox/i.test(UA)) return { title: 'Sur Firefox', steps: [`Touche ${menu}`, 'Choisis <b>Installer</b> ou <b>Ajouter à l’écran d’accueil</b>'] };
  if (isAndroid()) return { title: 'Sur Android', steps: [`Touche ${menu} en haut à droite de Chrome`, 'Choisis <b>Installer l’application</b> (ou <b>Ajouter à l’écran d’accueil</b>)', 'Confirme avec <b>Installer</b>'] };
  if (/Edg\//.test(UA)) return { title: 'Sur ordinateur (Edge)', steps: ['Clique sur l’icône <b>Installer</b> à droite de la barre d’adresse', 'Ou menu <b>…</b> puis <b>Applications</b> et <b>Installer ce site</b>'] };
  if (/Chrome\//.test(UA) && !/Claude\//.test(UA)) return { title: 'Sur ordinateur (Chrome)', steps: ['Clique sur l’icône d’installation à droite de la barre d’adresse', `Ou menu ${menu}, <b>Enregistrer et partager</b>, puis <b>Installer la page en tant qu’appli</b>`] };
  return { title: 'Depuis ce navigateur', steps: ['L’installation n’est pas proposée ici', 'Ouvre le site dans <b>Chrome</b> (Android, ordinateur) ou <b>Safari</b> (iPhone)', 'Puis touche à nouveau <b>Installer</b>'] };
}
const guideHtml = () => { const g = guide(); return `<p class="guide-title">${g.title}</p><ol class="ios-steps">${g.steps.map((x) => `<li>${x}</li>`).join('')}</ol>`; };

export function initPWA() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; refresh(); });
  addEventListener('appinstalled', () => { deferred = null; refresh(); });
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    if (reg.waiting && hadController) updateBar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateBar(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 36e5);
  }).catch((e) => console.warn('Service worker non enregistré', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
}

export function clearOfflineData() { navigator.serviceWorker?.controller?.postMessage('clear-data'); }

function updateBar(worker) {
  if (document.getElementById('updbar')) return;
  const el = document.createElement('div');
  el.id = 'updbar'; el.className = 'updbar';
  el.innerHTML = `<span>Nouvelle version de l’appli disponible.</span><button class="btn btn-sm">Mettre à jour</button>`;
  el.querySelector('button').onclick = () => worker.postMessage('skip-waiting');
  document.body.appendChild(el);
}

async function install() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null; refresh();
  } else {
    document.querySelectorAll('[data-install] .install-guide').forEach((s) => { s.hidden = false; s.innerHTML = guideHtml(); });
  }
}

// « Plus tard » reporte la carte de 7 jours ; le bouton du haut reste toujours là.
const LATER_DAYS = 7;
const postponed = () => Date.now() - Number(localStorage.getItem(DISMISS) || 0) < LATER_DAYS * 864e5;

// Installation depuis n'importe quel bouton : fenêtre du navigateur si possible, sinon les étapes
export function openInstall() {
  if (deferred) return install();
  sheet('Installer l’appli', `<div class="stack">${guideHtml()}<p class="small muted">L’appli s’ouvre ensuite en plein écran depuis l’icône du blason, et garde le dernier classement même sans réseau.</p><button class="btn btn-block" data-close>Compris</button></div>`);
}

// Carte d'invitation, insérée dans l'accueil et le tableau de bord
export function installCard() {
  if (isStandalone() || postponed()) return '';
  return `<section class="install" data-install>
    ${logo('install-logo')}
    <div class="install-txt">
      <h2>Installe l’appli AaKATSUKI</h2>
      <p>Une icône sur ton écran d’accueil, en plein écran, et le dernier classement même sans réseau.</p>
      <div class="install-guide" hidden></div>
    </div>
    <div class="install-act"><button class="btn btn-sm" data-install-go>Installer</button><button class="btn btn-sm btn-ghost" data-install-later>Plus tard</button></div>
  </section>`;
}
// Bouton permanent de la barre du haut
export const installTopButton = () => (isStandalone() ? '' : `<button class="icon-btn tb-install" data-install-top aria-label="Installer l’appli" title="Installer l’appli">${I.download}<span>Installer</span></button>`);

export function bindInstall(root, onLater) {
  root.querySelectorAll('[data-install-go]').forEach((b) => (b.onclick = install));
  root.querySelectorAll('[data-install-later]').forEach((b) => (b.onclick = () => {
    localStorage.setItem(DISMISS, String(Date.now()));
    b.closest('[data-install]').remove();
    const top = document.querySelector('[data-install-top]');
    if (top) { top.classList.remove('pulse'); void top.offsetWidth; top.classList.add('pulse'); }
    onLater?.();
  }));
  root.querySelectorAll('[data-install-menu], [data-install-top]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); openInstall(); }));
}
function refresh() {
  document.querySelectorAll('[data-install], [data-install-top], [data-install-menu]').forEach((el) => {
    const li = el.closest('li') && el.matches('[data-install-menu]') ? el.closest('li') : el;
    li.hidden = isStandalone();
  });
}
export const installMenuItem = () => (isStandalone() ? '' : `<li><a href="#/moi" data-install-menu>${logo('menu-logo')}<div><b>Installer l’appli</b><small>${esc('Icône du blason sur ton écran d’accueil')}</small></div>${I.right}</a></li>`);

// ---------- Notifications push ----------
const PUSH_LATER = 'akt.push.later';
const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function registration() { return 'serviceWorker' in navigator ? navigator.serviceWorker.ready : null; }

// unsupported | install-first | denied | off | on
export async function pushStatus() {
  if (isIOS() && !isStandalone()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications refusées. Tu peux les autoriser dans les réglages du navigateur.' : 'Notifications non autorisées.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(api.info().vapidPublicKey) });
  await api.pushSubscribe(sub.toJSON());
}
export async function disablePush() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
// À chaque ouverture : rattache l'abonnement de ce téléphone au membre connecté
export async function syncPush() {
  try {
    if (!api.me() || !('Notification' in window) || Notification.permission !== 'granted') return;
    const sub = await (await registration())?.pushManager.getSubscription();
    if (sub) await api.pushSubscribe(sub.toJSON());
  } catch { /* hors ligne */ }
}

const PUSH_TEXT = {
  'install-first': ['Notifications sur iPhone', 'Sur iPhone, les notifications marchent seulement dans l’appli installée. Installe-la (bouton Installer en haut), ouvre-la depuis l’icône du blason, puis reviens ici.'],
  unsupported: ['Notifications indisponibles', 'Ce navigateur ne gère pas les notifications. Ouvre le site dans Chrome (Android) ou installe l’appli (iPhone).'],
  denied: ['Notifications bloquées', 'Tu les as refusées pour ce site. Autorise-les dans les réglages du navigateur (cadenas à côté de l’adresse, puis Notifications), puis recharge la page.'],
  off: ['Active les notifications', 'Points reçus, inscription validée, tournoi qui approche, nouveaux membres, classement de la semaine : reçois-les directement sur ton téléphone.'],
  on: ['Notifications activées', 'Ce téléphone reçoit les notifications du clan.'],
};
// Panneau (page Notifications) ou carte (tableau de bord) rempli après lecture de l'état
export async function mountPushPanel(el, { card = false, onChange } = {}) {
  if (!el) return;
  const st = await pushStatus();
  if (card && (st !== 'off' || Date.now() - Number(localStorage.getItem(PUSH_LATER) || 0) < 7 * 864e5)) { el.innerHTML = ''; return; }
  const [title, text] = PUSH_TEXT[st];
  el.innerHTML = `<section class="pushcard ps-${st}">
    <span class="push-ic">${I.bell}</span>
    <div><h2>${title}</h2><p>${text}</p></div>
    <div class="install-act">
      ${st === 'off' ? '<button class="btn btn-sm" data-push-on>Activer</button>' : ''}
      ${st === 'on' ? '<button class="btn btn-sm btn-line" data-push-test>Tester</button><button class="btn btn-sm btn-ghost" data-push-off>Désactiver sur ce téléphone</button>' : ''}
      ${st === 'install-first' ? '<button class="btn btn-sm" data-push-install>Installer l’appli</button>' : ''}
      ${card ? '<button class="btn btn-sm btn-ghost" data-push-later>Plus tard</button>' : ''}
    </div></section>`;
  const again = () => { mountPushPanel(el, { card, onChange }); onChange?.(); };
  el.querySelector('[data-push-on]')?.addEventListener('click', act(async () => { await enablePush(); toast('Notifications activées sur ce téléphone.'); again(); }));
  el.querySelector('[data-push-off]')?.addEventListener('click', act(async () => { await disablePush(); toast('Notifications désactivées sur ce téléphone.'); again(); }));
  el.querySelector('[data-push-test]')?.addEventListener('click', act(async () => {
    const reg = await registration();
    await reg.showNotification('影 AaKATSUKI 影', { body: 'Les notifications du clan fonctionnent sur ce téléphone.', icon: '/assets/icon-192.png', badge: '/assets/badge-96.png', tag: 'test', data: { url: '#/notifications' } });
  }));
  el.querySelector('[data-push-install]')?.addEventListener('click', () => openInstall());
  el.querySelector('[data-push-later]')?.addEventListener('click', () => { localStorage.setItem(PUSH_LATER, String(Date.now())); el.innerHTML = ''; toast('Tu pourras les activer plus tard depuis la page Notifications.'); });
}
