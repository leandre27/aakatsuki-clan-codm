// Client de l'API. Les lectures (classements, statistiques, droits d'affichage) sont
// calculées à partir de l'instantané envoyé par le serveur ; toutes les écritures
// passent par le serveur, qui revérifie les permissions et renvoie le nouvel état.
import * as core from './core.js';
export * from './core.js';

let state = null;
let meId = null;
let meta = { demo: false, demoAccounts: [] };
core.configure({ getDB: () => state, getActor: () => (meId && state ? state.users.find((u) => u.id === meId) || null : null) });

function apply(s) {
  state = s.data; meId = s.me;
  meta = { demo: !!s.demo, demoAccounts: s.demoAccounts || [], vapidPublicKey: s.vapidPublicKey || '' };
  core.resetCache();
}
export const info = () => meta;

// Annonces lues : mémorisées sur cet appareil, par compte (date de la dernière annonce vue)
const annKey = () => `akt.ann.seen.${meId || 'visiteur'}`;
export function announcementsFor() { return meId ? core.visibleAnnouncements() : core.publicAnnouncements(); }
export function annSeenAt() { return localStorage.getItem(annKey()) || ''; }
export const isAnnNew = (a) => a.authorId !== meId && a.at > annSeenAt();
export const annUnread = () => (meId ? announcementsFor().filter(isAnnNew).length : 0);
export function markAnnSeen() {
  const last = announcementsFor().reduce((m, a) => (a.at > m ? a.at : m), '');
  if (last > annSeenAt()) localStorage.setItem(annKey(), last);
}
export const ready = () => !!state;

async function call(url, body, method = 'POST') {
  let r;
  try {
    r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Serveur injoignable. Vérifie ta connexion internet.');
  }
  const j = await r.json().catch(() => ({}));
  if (j.state) apply(j.state);
  if (!r.ok) throw new Error(j.error || `Erreur serveur (${r.status}).`);
  return j;
}

// Hors ligne, le service worker renvoie le dernier état connu (en-tête X-Offline).
export async function load() {
  let r;
  try { r = await fetch('/api/state', { credentials: 'same-origin' }); } catch { throw new Error('Serveur injoignable. Vérifie ta connexion internet.'); }
  const j = await r.json().catch(() => ({}));
  if (j.state) apply(j.state);
  if (!r.ok) throw new Error(j.error || `Erreur serveur (${r.status}).`);
  meta.offline = r.headers.get('X-Offline') === '1';
  if (!meta.offline) localStorage.setItem('akt.lastSync', new Date().toISOString());
}
const forgetOffline = () => navigator.serviceWorker?.controller?.postMessage('clear-data');
export async function login(id, password) { await call('/api/auth/login', { login: id, password }); forgetOffline(); return core.me(); }
export async function register(f) { await call('/api/auth/register', f); return core.me(); }
export async function logout() {
  // Ce téléphone ne doit plus recevoir les notifications du compte qui se déconnecte
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();
    if (sub) await call('/api/push/unsubscribe', { endpoint: sub.endpoint });
  } catch { /* hors ligne : le serveur nettoiera au prochain envoi refusé */ }
  await call('/api/auth/logout', {}); forgetOffline();
}
export async function pushSubscribe(subscription) { await call('/api/push/subscribe', { subscription }); }
export async function pushUnsubscribe(endpoint) { await call('/api/push/unsubscribe', { endpoint }); }
export async function changePassword(current, next) { await call('/api/auth/password', { current, next }); }
export async function adminResetPassword(userId) { return (await call('/api/auth/admin-reset', { userId })).temp; }
export async function resetDemo() { await call('/api/demo/reset', {}); }

const rpc = (name) => async (...args) => (await call(`/api/rpc/${name}`, { args })).result;
export const awardPoints = rpc('awardPoints');
export const correctTx = rpc('correctTx');
export const approve = rpc('approve');
export const refuse = rpc('refuse');
export const setStatus = rpc('setStatus');
export const setRoles = rpc('setRoles');
export const updateUser = rpc('updateUser');
export const toggleActivity = rpc('toggleActivity');
export const createActivity = rpc('createActivity');
export const saveTournament = rpc('saveTournament');
export const setTStatus = rpc('setTStatus');
export const registerT = rpc('registerT');
export const joinTeam = rpc('joinTeam');
export const unregisterT = rpc('unregisterT');
export const setRegStatus = rpc('setRegStatus');
export const addMatch = rpc('addMatch');
export const publishResults = rpc('publishResults');
export const requestReward = rpc('requestReward');
export const cancelRequest = rpc('cancelRequest');
export const processRequest = rpc('processRequest');
export const saveReward = rpc('saveReward');
export const toggleReward = rpc('toggleReward');
export const acceptProposal = rpc('acceptProposal');
export const awardDistinction = rpc('awardDistinction');
export const createAnnouncement = rpc('createAnnouncement');
export const archiveAnnouncement = rpc('archiveAnnouncement');
export const markAllRead = rpc('markAllRead');
export const markRead = rpc('markRead');
export const addSanction = rpc('addSanction');
export const saveRules = rpc('saveRules');
export const saveGrades = rpc('saveGrades');
export const saveWeekly = rpc('saveWeekly');
export const saveRolePerms = rpc('saveRolePerms');
export const saveRulebook = rpc('saveRulebook');
export const closeSeason = rpc('closeSeason');
export const weeklyDigest = rpc('weeklyDigest');
